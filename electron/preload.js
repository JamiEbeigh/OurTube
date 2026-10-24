const { contextBridge, ipcRenderer } = require('electron');

// Every call resolves to its data or throws an Error with the main-process message.
const call = async (channel, ...args) => {
  const r = await ipcRenderer.invoke(channel, ...args);
  if (!r.ok) throw new Error(r.error);
  return r.data;
};

const on = (channel, fn) => {
  const listener = (_e, ...args) => fn(...args);
  ipcRenderer.on(channel, listener);
  return () => ipcRenderer.removeListener(channel, listener);
};

contextBridge.exposeInMainWorld('api', {
  platform: process.platform,

  getSettings: () => call('settings:get'),
  setSettings: (patch) => call('settings:set', patch),
  importClientJson: () => call('settings:import-client-json'),
  chooseFolder: () => call('dialog:choose-folder'),

  authStatus: () => call('auth:status'),
  login: () => call('auth:login'),
  cancelLogin: () => call('auth:cancel'),
  logout: () => call('auth:logout'),

  loadFeed: (opts) => call('feed:load', opts),
  search: (query, limit) => call('search', query, limit),
  loadChannel: (channelId, page) => call('channel:load', channelId, page),

  getLibrary: () => call('library:get'),
  requestVideo: (meta, intent) => call('video:request', meta, intent),
  disposeVideo: (id, action) => call('video:dispose', id, action),
  deleteVideo: (id) => call('video:delete', id),
  retryVideo: (id) => call('video:retry', id),
  cancelDownload: (key) => call('download:cancel', key),

  requestAudio: (meta) => call('audio:request', meta),
  deleteAudio: (id) => call('audio:delete', id),
  retryAudio: (id) => call('audio:retry', id),

  myPlaylists: (opts) => call('playlists:mine', opts),
  loadPlaylist: (id, pageToken) => call('playlist:load', id, pageToken),
  savePlaylist: (meta, mode) => call('playlist:save', meta, mode),
  unsavePlaylist: (id, deleteFiles, currentId) => call('playlist:unsave', id, deleteFiles, currentId),
  retryPlaylist: (id) => call('playlist:retry', id),
  queueRemove: (id) => call('queue:remove', id),
  queueDiscard: (id, currentId) => call('queue:discard', id, currentId),
  queueMove:(id, delta) => call('queue:move', id, delta),
  queueAdd: (id) => call('queue:add', id),

  toolsStatus: () => call('tools:status'),
  installTools: (opts) => call('tools:install', opts),

  openExternal: (url) => call('shell:open-external', url),
  showInFolder: (id) => call('shell:show-item', id),
  showAudioInFolder: (id) => call('shell:show-audio', id),
  openFolder: (which) => call('shell:open-folder', which),

  resolveQuit: (action) => ipcRenderer.send('app:quit-resolve', action),

  onLibrary: (fn) => on('library:update', fn),
  onProgress: (fn) => on('download:progress', fn),
  onQuitRequested: (fn) => on('app:quit-requested', fn),
});
