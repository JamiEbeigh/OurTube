// Tiny JSON-file persistence for settings, library and secrets.
const fs = require('fs');
const path = require('path');
const { app, safeStorage } = require('electron');

function dataDir() {
  return app.getPath('userData');
}

class JsonFile {
  constructor(name, defaults) {
    this.file = path.join(dataDir(), name);
    this.defaults = defaults;
    this.data = this._load();
    this._timer = null;
  }

  _load() {
    try {
      const raw = fs.readFileSync(this.file, 'utf8');
      return deepMerge(structuredClone(this.defaults), JSON.parse(raw));
    } catch {
      return structuredClone(this.defaults);
    }
  }

  // Debounced write; flush() writes immediately.
  save() {
    clearTimeout(this._timer);
    this._timer = setTimeout(() => this.flush(), 150);
  }

  flush() {
    clearTimeout(this._timer);
    fs.mkdirSync(path.dirname(this.file), { recursive: true });
    const tmp = this.file + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(this.data, null, 2));
    fs.renameSync(tmp, this.file);
  }
}

function deepMerge(base, extra) {
  if (!extra || typeof extra !== 'object' || Array.isArray(extra)) return extra ?? base;
  for (const [k, v] of Object.entries(extra)) {
    if (v && typeof v === 'object' && !Array.isArray(v) && base[k] && typeof base[k] === 'object' && !Array.isArray(base[k])) {
      base[k] = deepMerge(base[k], v);
    } else {
      base[k] = v;
    }
  }
  return base;
}

// Secrets (OAuth tokens) are encrypted with the OS keychain when available.
class SecretFile {
  constructor(name) {
    this.file = path.join(dataDir(), name);
  }
  read() {
    try {
      const buf = fs.readFileSync(this.file);
      if (buf.subarray(0, 4).toString() === 'ENC1') {
        return JSON.parse(safeStorage.decryptString(buf.subarray(4)));
      }
      return JSON.parse(buf.toString('utf8'));
    } catch {
      return null;
    }
  }
  write(obj) {
    fs.mkdirSync(path.dirname(this.file), { recursive: true });
    const json = JSON.stringify(obj);
    if (safeStorage.isEncryptionAvailable()) {
      fs.writeFileSync(this.file, Buffer.concat([Buffer.from('ENC1'), safeStorage.encryptString(json)]));
    } else {
      fs.writeFileSync(this.file, json, { mode: 0o600 });
    }
  }
  clear() {
    try { fs.unlinkSync(this.file); } catch {}
  }
}

const DEFAULT_SETTINGS = {
  googleClientId: '',
  googleClientSecret: '',
  downloadDir: '',            // empty = <Videos>/OurTube
  audioDir: '',               // empty = <Music>/OurTube
  audioFormat: 'm4a',         // m4a (no re-encode) | mp3
  quality: '1080',            // best | 1080 | 720 | 480
  maxConcurrentDownloads: 2,
  afterWatch: 'ask',          // ask | delete | keep
  hideShorts: true,
  ytdlpPath: '',              // optional custom path
  denoPath: '',               // optional custom path
  cookiesFromBrowser: '',     // optional: chrome | firefox | edge | safari ...
};

const DEFAULT_LIBRARY = {
  videos: {},                 // id -> video record
  playlists: { watchLater: [], downloaded: [] },
  queue: [],
  audio: {},                  // id -> audio record (Music page)
  savedPlaylists: {},         // YouTube playlist id -> offline copy
};

module.exports = { JsonFile, SecretFile, DEFAULT_SETTINGS, DEFAULT_LIBRARY, dataDir };
