// Locates (and if needed, downloads) the open-source helper binaries:
//   yt-dlp  – does the actual downloading         (github.com/yt-dlp/yt-dlp)
//   deno    – JS runtime yt-dlp needs for YouTube  (github.com/denoland/deno)
//   ffmpeg  – merges video+audio, bundled via the ffmpeg-static npm package
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const { app } = require('electron');

const IS_WIN = process.platform === 'win32';
const binDir = () => path.join(app.getPath('userData'), 'bin');

function ytdlpAsset() {
  if (IS_WIN) return 'yt-dlp.exe';
  if (process.platform === 'darwin') return 'yt-dlp_macos';
  return process.arch === 'arm64' ? 'yt-dlp_linux_aarch64' : 'yt-dlp_linux';
}

function denoAsset() {
  const arch = process.arch === 'arm64' ? 'aarch64' : 'x86_64';
  if (IS_WIN) return `deno-${arch}-pc-windows-msvc.zip`;
  if (process.platform === 'darwin') return `deno-${arch}-apple-darwin.zip`;
  return `deno-${arch}-unknown-linux-gnu.zip`;
}

function run(bin, args, timeout = 15000) {
  return new Promise((resolve) => {
    let out = '';
    let p;
    try {
      p = spawn(bin, args, { windowsHide: true });
    } catch {
      return resolve(null);
    }
    const t = setTimeout(() => { try { p.kill(); } catch {} resolve(null); }, timeout);
    p.stdout.on('data', (d) => (out += d));
    p.on('error', () => { clearTimeout(t); resolve(null); });
    p.on('close', (code) => { clearTimeout(t); resolve(code === 0 ? out.trim() : null); });
  });
}

async function download(url, dest) {
  const res = await fetch(url, { redirect: 'follow' });
  if (!res.ok) throw new Error(`Download failed (${res.status}) for ${url}`);
  const buf = Buffer.from(await res.arrayBuffer());
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.writeFileSync(dest + '.tmp', buf);
  fs.renameSync(dest + '.tmp', dest);
  if (!IS_WIN) fs.chmodSync(dest, 0o755);
}

class Tools {
  constructor({ settings }) {
    this.settings = settings;
    this._installing = null;
  }

  ffmpegPath() {
    try {
      let p = require('ffmpeg-static');
      if (p) p = p.replace('app.asar', 'app.asar.unpacked');
      return p && fs.existsSync(p) ? p : null;
    } catch {
      return null;
    }
  }

  async _resolve(customPath, localName, systemName, versionArgs) {
    const candidates = [customPath, path.join(binDir(), localName), systemName].filter(Boolean);
    for (const c of candidates) {
      const v = await run(c, versionArgs);
      if (v) return { path: c, version: v.split('\n')[0] };
    }
    return null;
  }

  async ytdlp() {
    return this._resolve(this.settings.data.ytdlpPath, IS_WIN ? 'yt-dlp.exe' : 'yt-dlp', 'yt-dlp', ['--version']);
  }

  async deno() {
    const r = await this._resolve(this.settings.data.denoPath, IS_WIN ? 'deno.exe' : 'deno', 'deno', ['--version']);
    if (r) r.version = r.version.replace(/^deno\s+/, '').split(' ')[0];
    return r;
  }

  async status() {
    const [ytdlp, deno] = await Promise.all([this.ytdlp(), this.deno()]);
    const ffmpeg = this.ffmpegPath();
    return {
      ytdlp, deno,
      ffmpeg: ffmpeg ? { path: ffmpeg } : null,
      binDir: binDir(),
      installing: !!this._installing,
    };
  }

  // Runs yt-dlp and parses its JSON output (used for search and channel pages).
  async json(args, timeout = 60000) {
    let ytdlp = await this.ytdlp();
    if (!ytdlp) { await this.install(); ytdlp = await this.ytdlp(); }
    if (!ytdlp) throw new Error('yt-dlp could not be found or installed. Check Settings → Download tools.');
    const deno = await this.deno();
    const full = [...args, '--no-warnings', '--color', 'no_color'];
    if (deno && deno.path !== 'deno') full.push('--js-runtimes', `deno:${deno.path}`);
    if (this.settings.data.cookiesFromBrowser) full.push('--cookies-from-browser', this.settings.data.cookiesFromBrowser);
    return new Promise((resolve, reject) => {
      const p = spawn(ytdlp.path, full, { windowsHide: true });
      const out = [];
      let err = '';
      const t = setTimeout(() => { try { p.kill(); } catch {} reject(new Error('YouTube took too long to respond. Try again.')); }, timeout);
      p.stdout.on('data', (d) => out.push(d));
      p.stderr.on('data', (d) => { err = (err + d).slice(-4000); });
      p.on('error', (e) => { clearTimeout(t); reject(e); });
      p.on('close', (code) => {
        clearTimeout(t);
        if (code !== 0) {
          const line = err.split('\n').filter((l) => /ERROR/.test(l)).pop() || err.trim().split('\n').pop() || `yt-dlp exited with code ${code}`;
          return reject(new Error(line.replace(/^ERROR:\s*/, '')));
        }
        try { resolve(JSON.parse(Buffer.concat(out).toString('utf8'))); }
        catch { reject(new Error('Couldn’t read the response from yt-dlp.')); }
      });
    });
  }

  // Installs whatever is missing into the app's data folder (or force-updates).
  async install({ force = false } = {}) {
    if (this._installing) return this._installing;
    this._installing = (async () => {
      const dir = binDir();
      if (force || !(await this.ytdlp())) {
        await download(`https://github.com/yt-dlp/yt-dlp/releases/latest/download/${ytdlpAsset()}`,
          path.join(dir, IS_WIN ? 'yt-dlp.exe' : 'yt-dlp'));
      }
      if (force || !(await this.deno())) {
        const zipPath = path.join(dir, 'deno.zip');
        await download(`https://github.com/denoland/deno/releases/latest/download/${denoAsset()}`, zipPath);
        const AdmZip = require('adm-zip');
        new AdmZip(zipPath).extractAllTo(dir, true);
        fs.unlinkSync(zipPath);
        if (!IS_WIN) fs.chmodSync(path.join(dir, 'deno'), 0o755);
      }
      return this.status();
    })().finally(() => { this._installing = null; });
    return this._installing;
  }
}

module.exports = { Tools };
