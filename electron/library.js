// Owns the local library and the yt-dlp download workers:
//   videos          id -> video record (mp4 files)
//   audio           id -> audio record (m4a/mp3 files, the Music page)
//   playlists       Watch Later / Downloaded (lists of video ids)
//   queue           play queue (video ids)
//   savedPlaylists  YouTube playlists downloaded for offline use
//
// Downloads are addressed by a "key": the video id for a video download, or
// "a:<id>" for an audio download, so the same YouTube video can exist as both.
// The renderer gets a fresh copy via the 'change' event whenever anything here
// changes.
const fs = require('fs');
const path = require('path');
const { spawn, execFile } = require('child_process');
const { EventEmitter } = require('events');
const { app } = require('electron');

const LISTS = ['watchLater', 'downloaded'];
const ANSI = /\x1b\[[0-9;]*m/g;
const AUDIO_EXT = /\.(m4a|mp3|opus|ogg|webm|aac|flac|wav)$/i;

const audioKey = (id) => `a:${id}`;
const isAudioKey = (key) => key.startsWith('a:');
const idOf = (key) => (isAudioKey(key) ? key.slice(2) : key);

function formatFor(quality) {
  if (quality === 'best') return 'bv*+ba/b';
  const h = Number(quality) || 1080;
  // Prefer H.264 + AAC (plays everywhere), fall back to anything at that height.
  return `bv*[height<=${h}][vcodec^=avc1]+ba[ext=m4a]/bv*[height<=${h}]+ba/b[height<=${h}]/b`;
}

function baseRecord(meta) {
  return {
    id: meta.id,
    title: meta.title, channelTitle: meta.channelTitle, channelId: meta.channelId,
    channelAvatar: meta.channelAvatar || '', thumbnail: meta.thumbnail,
    publishedAt: meta.publishedAt, duration: meta.duration ?? null, description: meta.description || '',
    status: 'pending', filePath: null, error: null, addedAt: Date.now(),
  };
}

class Library extends EventEmitter {
  constructor({ store, settings, tools }) {
    super();
    this.store = store;
    this.settings = settings;
    this.tools = tools;
    this.pending = [];          // keys waiting for a download slot
    this.active = new Map();    // key -> { proc, priority, cancelled }
    this.progress = {};         // key -> { percent, speed, eta, stage }
  }

  get data() { return this.store.data; }

  snapshot() {
    return { ...this.data, progress: this.progress };
  }

  changed() {
    if (this._batching) { this._dirty = true; return; }
    this.store.save();
    this.emit('change', this.snapshot());
  }

  // Run fn with change notifications coalesced into one.
  batch(fn) {
    this._batching = true;
    try { return fn(); } finally {
      this._batching = false;
      if (this._dirty) { this._dirty = false; this.changed(); }
    }
  }

  record(key) {
    return isAudioKey(key) ? this.data.audio[idOf(key)] : this.data.videos[key];
  }

  downloadDir() {
    // Default is Videos/OurTube, but keep using Videos/TubeDeck if it already exists.
    const legacy = path.join(app.getPath('videos'), 'TubeDeck');
    const dir = this.settings.data.downloadDir || (fs.existsSync(legacy) ? legacy : path.join(app.getPath('videos'), 'OurTube'));
    fs.mkdirSync(dir, { recursive: true });
    return dir;
  }

  audioDir() {
    const dir = this.settings.data.audioDir || path.join(app.getPath('music'), 'OurTube');
    fs.mkdirSync(dir, { recursive: true });
    return dir;
  }

  fileFor(id) {
    const v = this.data.videos[id];
    return v && v.status === 'ready' && v.filePath && fs.existsSync(v.filePath) ? v.filePath : null;
  }

  audioFileFor(id) {
    const a = this.data.audio[id];
    return a && a.status === 'ready' && a.filePath && fs.existsSync(a.filePath) ? a.filePath : null;
  }

  // Saved playlists of a given mode that contain this video.
  savedWith(id, mode) {
    return Object.values(this.data.savedPlaylists).filter((p) => p.mode === mode && p.videoIds.includes(id));
  }

  inSavedVideoPlaylist(id) {
    return this.savedWith(id, 'video').length > 0;
  }

  // Is this video download still wanted by something other than the queue?
  keptOutsideQueue(id) {
    return LISTS.some((l) => this.data.playlists[l].includes(id)) || this.inSavedVideoPlaylist(id);
  }

  inAnyList(id) {
    return this.data.queue.includes(id) || this.keptOutsideQueue(id);
  }

  // ---- video intents ------------------------------------------------------

  // intent: 'play' | 'queue' | 'watchLater' | 'playlist'
  request(meta, intent) {
    const id = meta.id;
    const existing = this.data.videos[id];
    this.data.videos[id] = { ...baseRecord(meta), ...(existing || {}) };
    const pl = this.data.playlists;
    if (intent === 'watchLater') {
      if (!pl.watchLater.includes(id)) pl.watchLater.push(id);
      pl.downloaded = pl.downloaded.filter((x) => x !== id);
    }
    if (intent === 'queue' && !this.data.queue.includes(id)) this.data.queue.push(id);
    this.ensureDownload(id, intent === 'play' || intent === 'queue');
    this.changed();
    return this.data.videos[id];
  }

  // After the user closes a video: 'delete' the file or 'keep' it in Downloaded.
  // Videos that belong to a saved playlist stay where they are.
  dispose(id, action) {
    if (!this.data.videos[id]) return;
    if (this.inSavedVideoPlaylist(id)) return;
    if (action === 'delete') return this.deleteVideo(id);
    const pl = this.data.playlists;
    pl.watchLater = pl.watchLater.filter((x) => x !== id);
    if (!pl.downloaded.includes(id)) pl.downloaded.unshift(id);
    this.changed();
  }

  deleteVideo(id) {
    this.cancel(id, { silent: true });
    const v = this.data.videos[id];
    removeFiles(this.downloadDir(), id, v?.filePath);
    delete this.data.videos[id];
    delete this.progress[id];
    this.data.queue = this.data.queue.filter((x) => x !== id);
    for (const l of LISTS) this.data.playlists[l] = this.data.playlists[l].filter((x) => x !== id);
    for (const p of Object.values(this.data.savedPlaylists)) {
      if (p.mode === 'video') p.videoIds = p.videoIds.filter((x) => x !== id);
    }
    this.changed();
  }

  queueRemove(id) {
    this.data.queue = this.data.queue.filter((x) => x !== id);
    this.changed();
  }

  // User removed a video from the queue: drop the download too unless it's
  // also saved somewhere else (or currently open in the player).
  queueDiscard(id, currentId) {
    this.data.queue = this.data.queue.filter((x) => x !== id);
    if (this.keptOutsideQueue(id) || id === currentId) this.changed();
    else this.deleteVideo(id);
  }

  queueMove(id, delta) {
    const q = this.data.queue;
    const i = q.indexOf(id);
    const j = i + delta;
    if (i < 0 || j < 0 || j >= q.length) return;
    [q[i], q[j]] = [q[j], q[i]];
    this.changed();
  }

  addToQueue(id) {
    if (this.data.videos[id] && !this.data.queue.includes(id)) {
      this.data.queue.push(id);
      this.ensureDownload(id, true);
      this.changed();
    }
  }

  // Quit-time decision for everything left in the queue.
  resolveQueue(action) {
    const ids = [...this.data.queue];
    if (action === 'watchLater') {
      for (const id of ids) {
        if (!this.data.playlists.watchLater.includes(id)) this.data.playlists.watchLater.push(id);
        this.data.playlists.downloaded = this.data.playlists.downloaded.filter((x) => x !== id);
      }
      this.data.queue = [];
      this.changed();
    } else if (action === 'delete') {
      for (const id of ids) {
        if (this.keptOutsideQueue(id)) this.data.queue = this.data.queue.filter((x) => x !== id);
        else this.deleteVideo(id);
      }
      this.changed();
    }
    this.store.flush();
  }

  retry(key) {
    const r = this.record(key);
    if (!r) return;
    r.status = 'pending';
    r.error = null;
    this.ensureDownload(key, true);
    this.changed();
  }

  // ---- audio intents ------------------------------------------------------

  // standalone = the user asked for this track directly (not via a playlist),
  // so removing a playlist never deletes it.
  requestAudio(meta, { priority = true, standalone = true } = {}) {
    const id = meta.id;
    const existing = this.data.audio[id];
    const rec = { ...baseRecord(meta), standalone: false, ...(existing || {}) };
    if (standalone) rec.standalone = true;
    this.data.audio[id] = rec;
    this.ensureDownload(audioKey(id), priority);
    this.changed();
    return rec;
  }

  deleteAudio(id) {
    const key = audioKey(id);
    this.cancel(key, { silent: true });
    const a = this.data.audio[id];
    removeAudioFiles(this.audioDir(), id, a?.filePath);
    delete this.data.audio[id];
    delete this.progress[key];
    for (const p of Object.values(this.data.savedPlaylists)) {
      if (p.mode === 'audio') p.videoIds = p.videoIds.filter((x) => x !== id);
    }
    this.changed();
  }

  // ---- saved playlists ----------------------------------------------------

  // Save (or re-sync) a YouTube playlist for offline use. `videos` is the full,
  // ordered list of its items. Returns { added, total }.
  savePlaylist(meta, videos, mode) {
    return this.batch(() => this._savePlaylist(meta, videos, mode));
  }

  _savePlaylist(meta, videos, mode) {
    const prev = this.data.savedPlaylists[meta.id];
    if (prev && prev.mode !== mode) this._unsavePlaylist(meta.id, { deleteFiles: false });
    const before = new Set(prev && prev.mode === mode ? prev.videoIds : []);
    const entry = {
      id: meta.id,
      title: meta.title,
      thumbnail: meta.thumbnail || videos[0]?.thumbnail || '',
      channelTitle: meta.channelTitle || '',
      mode,
      videoIds: videos.map((v) => v.id),
      savedAt: prev?.savedAt || Date.now(),
      syncedAt: Date.now(),
    };
    this.data.savedPlaylists[meta.id] = entry;
    let added = 0;
    const now = Date.now();
    videos.forEach((v, i) => {
      if (!before.has(v.id)) added++;
      const isNew = mode === 'audio' ? !this.data.audio[v.id] : !this.data.videos[v.id];
      if (mode === 'audio') {
        const existing = this.data.audio[v.id];
        if (!existing || existing.status === 'error') this.requestAudio(v, { priority: false, standalone: false });
      } else {
        const existing = this.data.videos[v.id];
        if (!existing || existing.status === 'error') this.request(v, 'playlist');
      }
      // Newest-first lists should still show a playlist in its own order.
      const rec = mode === 'audio' ? this.data.audio[v.id] : this.data.videos[v.id];
      if (isNew && rec) rec.addedAt = now - i;
    });
    this.changed();
    return { added, total: videos.length };
  }

  unsavePlaylist(plId, { deleteFiles = true, currentId = null } = {}) {
    return this.batch(() => this._unsavePlaylist(plId, { deleteFiles, currentId }));
  }

  _unsavePlaylist(plId, { deleteFiles, currentId }) {
    const p = this.data.savedPlaylists[plId];
    if (!p) return;
    delete this.data.savedPlaylists[plId];
    if (!deleteFiles) {
      // Keep the files: videos move to Downloaded, tracks stay in Music for good.
      for (const id of p.videoIds) {
        if (p.mode === 'audio') { if (this.data.audio[id]) this.data.audio[id].standalone = true; }
        else if (this.data.videos[id] && !this.inAnyList(id)) this.data.playlists.downloaded.push(id);
      }
    } else {
      for (const id of p.videoIds) {
        if (p.mode === 'audio') {
          const a = this.data.audio[id];
          if (a && !a.standalone && this.savedWith(id, 'audio').length === 0) this.deleteAudio(id);
        } else if (this.data.videos[id] && !this.inAnyList(id) && id !== currentId) {
          this.deleteVideo(id);
        }
      }
    }
    this.changed();
  }

  retryPlaylist(plId) {
    const p = this.data.savedPlaylists[plId];
    if (!p) return;
    for (const id of p.videoIds) {
      const key = p.mode === 'audio' ? audioKey(id) : id;
      const r = this.record(key);
      if (r && r.status === 'error') {
        r.status = 'pending';
        r.error = null;
        this.ensureDownload(key, false);
      }
    }
    this.changed();
  }

  // ---- startup ------------------------------------------------------------

  reconcile() {
    const after = this.settings.data.afterWatch;
    for (const id of Object.keys(this.data.videos)) {
      const v = this.data.videos[id];
      const exists = v.filePath && fs.existsSync(v.filePath);
      if (!this.inAnyList(id)) {
        // Left over from a video that was open when the app closed.
        if (exists && after !== 'delete') this.data.playlists.downloaded.unshift(id);
        else { removeFiles(this.downloadDir(), id, v.filePath); delete this.data.videos[id]; continue; }
      }
      if (v.status === 'ready' && !exists) v.status = 'pending';
      if (v.status !== 'ready' && v.status !== 'error') {
        v.status = 'pending';
        this.ensureDownload(id, this.data.queue.includes(id));
      }
    }
    for (const id of Object.keys(this.data.audio)) {
      const a = this.data.audio[id];
      const exists = a.filePath && fs.existsSync(a.filePath);
      if (a.status === 'ready' && !exists) a.status = 'pending';
      if (a.status !== 'ready' && a.status !== 'error') {
        a.status = 'pending';
        this.ensureDownload(audioKey(id), false);
      }
    }
    this.changed();
  }

  // ---- downloads ----------------------------------------------------------

  ensureDownload(key, priority) {
    const r = this.record(key);
    if (!r) return;
    const ready = isAudioKey(key) ? this.audioFileFor(idOf(key)) : this.fileFor(key);
    if (ready || this.active.has(key)) return;
    if (priority) {
      this.pending = this.pending.filter((x) => x !== key);
      this._start(key, true);
    } else if (!this.pending.includes(key)) {
      this.pending.push(key);
      this._pump();
    }
  }

  _pump() {
    const max = Math.max(1, Number(this.settings.data.maxConcurrentDownloads) || 2);
    const background = [...this.active.values()].filter((a) => !a.priority).length;
    let slots = max - background;
    while (slots-- > 0 && this.pending.length) this._start(this.pending.shift(), false);
  }

  _args(key) {
    const id = idOf(key);
    const common = [
      `https://www.youtube.com/watch?v=${id}`,
      '--newline', '--no-playlist', '--no-mtime', '--color', 'no_color',
      '--progress-template', 'download:[tdprog] %(progress._percent_str)s|%(progress._speed_str)s|%(progress._eta_str)s',
      '--print', 'after_move:[tdfile] %(filepath)s', '--no-simulate',
    ];
    if (isAudioKey(key)) {
      const fmt = this.settings.data.audioFormat === 'mp3' ? 'mp3' : 'm4a';
      const dir = this.audioDir();
      return {
        dir,
        args: [
          ...common,
          '-f', 'ba[ext=m4a]/ba/b',
          '-x', '--audio-format', fmt, '--audio-quality', '0',
          '--embed-metadata', '--embed-thumbnail', '--convert-thumbnails', 'jpg',
          '-o', path.join(dir, '%(title).150B [%(id)s].%(ext)s'),
        ],
      };
    }
    const dir = this.downloadDir();
    return {
      dir,
      args: [
        ...common,
        '-f', formatFor(this.settings.data.quality),
        '--merge-output-format', 'mp4',
        '-o', path.join(dir, '%(id)s.%(ext)s'),
      ],
    };
  }

  async _start(key, priority) {
    const r = this.record(key);
    if (!r || this.active.has(key)) return;
    const audio = isAudioKey(key);
    const id = idOf(key);
    const slot = { proc: null, priority, cancelled: false };
    this.active.set(key, slot);
    r.status = 'downloading';
    r.error = null;
    this.progress[key] = { percent: 0, stage: 'Preparing…' };
    this.changed();

    const setProgress = (p) => { this.progress[key] = p; this.emit('progress', key, p); };

    try {
      let ytdlp = await this.tools.ytdlp();
      let deno = await this.tools.deno();
      if (!ytdlp || !deno) {
        setProgress({ percent: 0, stage: 'Installing download tools (first run)…' });
        await this.tools.install();
        ytdlp = await this.tools.ytdlp();
        deno = await this.tools.deno();
      }
      if (!ytdlp) throw new Error('yt-dlp could not be found or installed. Check Settings → Download tools.');
      if (slot.cancelled) return;

      const { dir, args } = this._args(key);
      const ffmpeg = this.tools.ffmpegPath();
      if (ffmpeg) args.push('--ffmpeg-location', ffmpeg);
      if (deno && deno.path !== 'deno') args.push('--js-runtimes', `deno:${deno.path}`);
      if (this.settings.data.cookiesFromBrowser) args.push('--cookies-from-browser', this.settings.data.cookiesFromBrowser);

      const filePath = await new Promise((resolve, reject) => {
        const proc = spawn(ytdlp.path, args, { windowsHide: true });
        slot.proc = proc;
        let part = 0;
        let finalPath = null;
        const errLines = [];
        const onLine = (line) => {
          line = line.replace(ANSI, '').trim();
          if (!line) return;
          if (line.startsWith('[tdprog]')) {
            const [pct, speed, eta] = line.slice(8).split('|').map((s) => s.trim());
            setProgress({
              percent: parseFloat(pct) || 0, speed, eta,
              stage: !audio && part > 1 ? 'Downloading audio' : 'Downloading',
            });
          } else if (line.startsWith('[tdfile]')) {
            finalPath = line.slice(8).trim();
          } else if (line.startsWith('[download] Destination')) {
            part++;
          } else if (line.startsWith('[Merger]') || line.startsWith('[VideoConvertor]')) {
            setProgress({ percent: 100, stage: 'Merging video and audio…' });
          } else if (line.startsWith('[ExtractAudio]')) {
            setProgress({ percent: 100, stage: 'Converting audio…' });
          } else if (line.startsWith('[EmbedThumbnail]') || line.startsWith('[Metadata]')) {
            setProgress({ percent: 100, stage: 'Adding cover art and tags…' });
          }
        };
        const splitter = (onEach) => {
          let buf = '';
          return (d) => {
            buf += d.toString();
            const lines = buf.split(/\r?\n/);
            buf = lines.pop();
            lines.forEach(onEach);
          };
        };
        proc.stdout.on('data', splitter(onLine));
        proc.stderr.on('data', splitter((l) => {
          l = l.replace(ANSI, '').trim();
          if (l) { errLines.push(l); if (errLines.length > 20) errLines.shift(); }
        }));
        proc.on('error', reject);
        proc.on('close', (code) => {
          if (slot.cancelled) return reject(Object.assign(new Error('cancelled'), { cancelled: true }));
          const found = finalPath && fs.existsSync(finalPath) ? finalPath : (audio ? findAudioFile(dir, id) : findFile(dir, id));
          if (code !== 0) {
            const msg = errLines.filter((l) => /ERROR/.test(l)).pop() || errLines.pop() || `yt-dlp exited with code ${code}`;
            // Cover art / tagging is a nice-to-have: keep the track if only that failed.
            if (audio && found && /thumbnail|metadata|postprocess/i.test(msg)) return resolve(found);
            return reject(new Error(msg.replace(/^ERROR:\s*/, '')));
          }
          resolve(found);
        });
      });

      if (!filePath) throw new Error('Download finished but the file could not be found.');
      const cur = this.record(key);
      if (cur) {
        cur.status = 'ready';
        cur.filePath = filePath;
        cur.downloadedAt = Date.now();
        try { cur.size = fs.statSync(filePath).size; } catch {}
      }
      delete this.progress[key];
    } catch (e) {
      if (!e.cancelled) {
        const cur = this.record(key);
        if (cur) { cur.status = 'error'; cur.error = e.message; }
        delete this.progress[key];
      }
    } finally {
      this.active.delete(key);
      this._pump();
      this.changed();
    }
  }

  cancel(key, { silent = false } = {}) {
    this.pending = this.pending.filter((x) => x !== key);
    const slot = this.active.get(key);
    if (slot) {
      slot.cancelled = true;
      if (slot.proc) killTree(slot.proc);
      this.active.delete(key);
    }
    const r = this.record(key);
    if (!silent && r && r.status !== 'ready') {
      r.status = 'error';
      r.error = 'Download cancelled';
      delete this.progress[key];
      this.changed();
    }
  }

  shutdown() {
    for (const [, slot] of this.active) {
      slot.cancelled = true;
      if (slot.proc) killTree(slot.proc);
    }
    // Interrupted downloads resume (yt-dlp keeps .part files) on next launch.
    for (const key of this.active.keys()) {
      const r = this.record(key);
      if (r) r.status = 'pending';
    }
    this.active.clear();
    this.store.flush();
  }
}

function findFile(dir, id) {
  try {
    const f = fs.readdirSync(dir).find((n) => n.startsWith(`${id}.`) && !/\.(part|ytdl|temp)$/.test(n) && !/\.f\d+\./.test(n));
    return f ? path.join(dir, f) : null;
  } catch {
    return null;
  }
}

function findAudioFile(dir, id) {
  try {
    const f = fs.readdirSync(dir).find((n) => n.includes(`[${id}].`) && AUDIO_EXT.test(n));
    return f ? path.join(dir, f) : null;
  } catch {
    return null;
  }
}

function removeFiles(dir, id, filePath) {
  const targets = new Set();
  if (filePath) targets.add(filePath);
  try {
    for (const n of fs.readdirSync(dir)) if (n.startsWith(`${id}.`)) targets.add(path.join(dir, n));
  } catch {}
  for (const t of targets) {
    try { fs.rmSync(t, { force: true, maxRetries: 5, retryDelay: 200 }); } catch {}
  }
}

function removeAudioFiles(dir, id, filePath) {
  const targets = new Set();
  if (filePath) targets.add(filePath);
  try {
    for (const n of fs.readdirSync(dir)) if (n.includes(`[${id}].`)) targets.add(path.join(dir, n));
  } catch {}
  for (const t of targets) {
    try { fs.rmSync(t, { force: true, maxRetries: 5, retryDelay: 200 }); } catch {}
  }
}

function killTree(proc) {
  try {
    if (process.platform === 'win32') execFile('taskkill', ['/pid', String(proc.pid), '/T', '/F'], () => {});
    else proc.kill('SIGTERM');
  } catch {}
}

module.exports = { Library, audioKey };
