const { app, BrowserWindow, ipcMain, protocol, shell, dialog } = require('electron');
const path = require('path');
const fs = require('fs');
const { Readable } = require('stream');
const { JsonFile, SecretFile, DEFAULT_SETTINGS, DEFAULT_LIBRARY } = require('./store');
const { GoogleAuth } = require('./auth');
const { YouTube } = require('./youtube');
const { Tools } = require('./tools');
const { Library, audioKey } = require('./library');

const ICON = path.join(__dirname, '..', 'build', 'icon.png');

// The app used to be called TubeDeck. Carry its data folder (sign-in,
// settings, playlists, downloaded tools) over to the new name once.
app.setName('OurTube');
(function migrateFromTubeDeck() {
  try {
    const appData = app.getPath('appData');
    const oldDir = path.join(appData, 'TubeDeck');
    const newDir = path.join(appData, 'OurTube');
    if (fs.existsSync(oldDir) && !fs.existsSync(path.join(newDir, 'settings.json'))) {
      if (fs.existsSync(newDir)) fs.rmSync(newDir, { recursive: true, force: true });
      fs.renameSync(oldDir, newDir);
    }
    app.setPath('userData', newDir);
  } catch (e) {
    console.error('Could not migrate TubeDeck data:', e);
  }
})();

// media://video/<id> streams a downloaded file to the <video> element (with seeking).
protocol.registerSchemesAsPrivileged([
  { scheme: 'media', privileges: { stream: true, supportFetchAPI: true, secure: true, standard: true } },
]);

let win;
let settings, cache, auth, yt, tools, library;
let quitConfirmed = false;

function send(channel, ...args) {
  if (win && !win.isDestroyed()) win.webContents.send(channel, ...args);
}

function createWindow() {
  win = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 900,
    minHeight: 600,
    backgroundColor: '#0f0f10',
    title: 'OurTube',
    icon: ICON,
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  if (process.env.VITE_DEV_SERVER_URL) win.loadURL(process.env.VITE_DEV_SERVER_URL);
  else win.loadFile(path.join(__dirname, '..', 'dist', 'index.html'));

  // Open external links in the user's browser, never inside the app.
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:/.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });
  win.webContents.on('will-navigate', (e, url) => {
    const allowed = process.env.VITE_DEV_SERVER_URL || 'file://';
    if (!url.startsWith(allowed)) { e.preventDefault(); if (/^https?:/.test(url)) shell.openExternal(url); }
  });

  // Ask what to do with queued videos before quitting.
  win.on('close', (e) => {
    if (quitConfirmed) return;
    if (library.data.queue.length > 0) {
      e.preventDefault();
      send('app:quit-requested', { count: library.data.queue.length });
    }
  });
}

function registerMediaProtocol() {
  protocol.handle('media', async (request) => {
    const url = new URL(request.url);
    const id = decodeURIComponent(url.pathname.replace(/^\//, ''));
    const file = url.hostname === 'video' ? library.fileFor(id) : url.hostname === 'audio' ? library.audioFileFor(id) : null;
    if (!file) return new Response('Not found', { status: 404 });

    const size = fs.statSync(file).size;
    const ext = path.extname(file).slice(1).toLowerCase();
    const type = {
      webm: url.hostname === 'audio' ? 'audio/webm' : 'video/webm', mkv: 'video/x-matroska',
      m4a: 'audio/mp4', aac: 'audio/aac', mp3: 'audio/mpeg', opus: 'audio/ogg', ogg: 'audio/ogg', flac: 'audio/flac', wav: 'audio/wav',
    }[ext] || 'video/mp4';
    const range = request.headers.get('range');
    if (range) {
      const m = /bytes=(\d*)-(\d*)/.exec(range) || ['', '', ''];
      let start, end;
      if (m[1] === '' && m[2] !== '') { start = Math.max(0, size - Number(m[2])); end = size - 1; }
      else { start = Number(m[1] || 0); end = m[2] ? Math.min(Number(m[2]), size - 1) : size - 1; }
      if (start > end) return new Response(null, { status: 416, headers: { 'Content-Range': `bytes */${size}` } });
      return new Response(Readable.toWeb(fs.createReadStream(file, { start, end })), {
        status: 206,
        headers: {
          'Content-Type': type,
          'Content-Length': String(end - start + 1),
          'Content-Range': `bytes ${start}-${end}/${size}`,
          'Accept-Ranges': 'bytes',
        },
      });
    }
    return new Response(Readable.toWeb(fs.createReadStream(file)), {
      status: 200,
      headers: { 'Content-Type': type, 'Content-Length': String(size), 'Accept-Ranges': 'bytes' },
    });
  });
}

function handle(channel, fn) {
  ipcMain.handle(channel, async (_e, ...args) => {
    try {
      return { ok: true, data: await fn(...args) };
    } catch (err) {
      return { ok: false, error: err.message || String(err) };
    }
  });
}

function registerIpc() {
  // Settings
  const settingsOut = () => ({ ...settings.data, resolvedDownloadDir: library.downloadDir(), resolvedAudioDir: library.audioDir() });
  handle('settings:get', () => settingsOut());
  handle('settings:set', (patch) => {
    const credsChanged = ('googleClientId' in patch && patch.googleClientId !== settings.data.googleClientId);
    Object.assign(settings.data, patch);
    settings.flush();
    if (credsChanged && auth.isSignedIn()) { auth.logout(); cache.data = {}; cache.flush(); }
    return settingsOut();
  });
  handle('settings:import-client-json', async () => {
    const r = await dialog.showOpenDialog(win, {
      title: 'Choose the client_secret_….json you downloaded from Google Cloud',
      properties: ['openFile'],
      filters: [{ name: 'JSON', extensions: ['json'] }],
    });
    if (r.canceled || !r.filePaths[0]) return null;
    const json = JSON.parse(fs.readFileSync(r.filePaths[0], 'utf8'));
    const c = json.installed || json.web || json;
    if (!c.client_id || !c.client_secret) throw new Error('That file does not contain a client_id and client_secret.');
    if (json.web) throw new Error('This is a "Web application" client. Create a "Desktop app" client instead (see the setup guide).');
    settings.data.googleClientId = c.client_id;
    settings.data.googleClientSecret = c.client_secret;
    settings.flush();
    return settingsOut();
  });
  handle('dialog:choose-folder', async () => {
    const r = await dialog.showOpenDialog(win, { properties: ['openDirectory', 'createDirectory'] });
    return r.canceled ? null : r.filePaths[0];
  });

  // Auth
  handle('auth:status', async () => {
    if (!auth.isSignedIn()) return { signedIn: false };
    let profile = null;
    try { profile = await yt.profile(); } catch {}
    return { signedIn: true, profile };
  });
  handle('auth:login', async () => {
    await auth.login();
    cache.data = {};
    cache.flush();
    let profile = null;
    try { profile = await yt.profile(); } catch {}
    return { signedIn: true, profile };
  });
  handle('auth:cancel', () => auth.cancelLogin());
  handle('auth:logout', async () => {
    await auth.logout();
    cache.data = {};
    cache.flush();
    return { signedIn: false };
  });

  // Feed
  handle('feed:load', ({ force } = {}) => yt.feed({ force, hideShorts: settings.data.hideShorts }));
  handle('search', (query, limit) => yt.search(query, limit));
  handle('channel:load', (channelId, page) => yt.channel(channelId, { page, hideShorts: settings.data.hideShorts }));

  // Library / downloads
  handle('library:get', () => library.snapshot());
  handle('video:request', (meta, intent) => library.request(meta, intent));
  handle('video:dispose', (id, action) => library.dispose(id, action));
  handle('video:delete', (id) => library.deleteVideo(id));
  handle('video:retry', (id) => library.retry(id));
  handle('download:cancel', (key) => library.cancel(key));

  // Audio (Music page)
  handle('audio:request', (meta) => library.requestAudio(meta, { priority: true, standalone: true }));
  handle('audio:delete', (id) => library.deleteAudio(id));
  handle('audio:retry', (id) => library.retry(audioKey(id)));

  // YouTube playlists
  handle('playlists:mine', ({ force } = {}) => yt.myPlaylists(force));
  handle('playlist:load', (playlistId, pageToken) => yt.playlist(playlistId, { pageToken, hideShorts: false }));
  handle('playlist:save', async (meta, mode) => {
    const videos = await yt.playlistAll(meta.id);
    if (!videos.length) throw new Error('This playlist has no videos that can be downloaded.');
    return library.savePlaylist(meta, videos, mode === 'audio' ? 'audio' : 'video');
  });
  handle('playlist:unsave', (playlistId, deleteFiles, currentId) => library.unsavePlaylist(playlistId, { deleteFiles, currentId }));
  handle('playlist:retry', (playlistId) => library.retryPlaylist(playlistId));
  handle('queue:remove', (id) => library.queueRemove(id));
  handle('queue:discard', (id, currentId) => library.queueDiscard(id, currentId));
  handle('queue:move', (id, delta) => library.queueMove(id, delta));
  handle('queue:add', (id) => library.addToQueue(id));

  // Tools
  handle('tools:status', () => tools.status());
  handle('tools:install', (opts) => tools.install(opts));

  // Shell helpers
  handle('shell:open-external', (url) => { if (/^https:\/\//.test(url)) shell.openExternal(url); });
  handle('shell:show-item', (id) => { const f = library.fileFor(id); if (f) shell.showItemInFolder(f); });
  handle('shell:show-audio', (id) => { const f = library.audioFileFor(id); if (f) shell.showItemInFolder(f); });
  handle('shell:open-folder', (which) => shell.openPath(which === 'data' ? app.getPath('userData') : which === 'audio' ? library.audioDir() : library.downloadDir()));

  // Quit flow
  ipcMain.on('app:quit-resolve', (_e, action) => {
    if (action === 'cancel') return;
    library.resolveQueue(action);
    quitConfirmed = true;
    app.quit();
  });
}

app.whenReady().then(() => {
  // Show the OurTube icon in the Dock when running from source (packaged builds use build/icon.png).
  if (process.platform === 'darwin' && app.dock && fs.existsSync(ICON)) { try { app.dock.setIcon(ICON); } catch {} }
  settings = new JsonFile('settings.json', DEFAULT_SETTINGS);
  cache = new JsonFile('cache.json', {});
  const secrets = new SecretFile('tokens.bin');
  auth = new GoogleAuth({ settings, secrets });
  tools = new Tools({ settings });
  yt = new YouTube({ auth, cache, tools });
  library = new Library({ store: new JsonFile('library.json', DEFAULT_LIBRARY), settings, tools });

  library.on('change', (snap) => send('library:update', snap));
  library.on('progress', (id, p) => send('download:progress', id, p));

  registerMediaProtocol();
  registerIpc();
  createWindow();
  library.reconcile();

  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
});

app.on('window-all-closed', () => app.quit());

// Cmd+Q / menu quit: intercept here too so the queue prompt appears first.
app.on('before-quit', (e) => {
  if (!quitConfirmed && library && library.data.queue.length > 0 && win && !win.isDestroyed()) {
    e.preventDefault();
    win.show();
    send('app:quit-requested', { count: library.data.queue.length });
  }
});

// Only stop downloads once quitting is certain.
app.on('will-quit', () => { if (library) library.shutdown(); settings?.flush(); });
