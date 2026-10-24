// Google OAuth 2.0 for installed apps: loopback redirect + PKCE, opened in the
// system browser (Google blocks sign-in inside embedded webviews).
const http = require('http');
const crypto = require('crypto');
const { shell } = require('electron');

const SCOPE = 'https://www.googleapis.com/auth/youtube.readonly';
const AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const REVOKE_URL = 'https://oauth2.googleapis.com/revoke';

const b64url = (buf) => buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

class GoogleAuth {
  constructor({ settings, secrets }) {
    this.settings = settings;   // JsonFile
    this.secrets = secrets;     // SecretFile
    this.tokens = secrets.read();
    this._pending = null;
  }

  creds() {
    const { googleClientId, googleClientSecret } = this.settings.data;
    if (!googleClientId || !googleClientSecret) {
      throw new Error('Add your Google Client ID and Client Secret in Settings first.');
    }
    return { clientId: googleClientId.trim(), clientSecret: googleClientSecret.trim() };
  }

  isSignedIn() {
    return !!(this.tokens && this.tokens.refresh_token);
  }

  async login() {
    if (this._pending) this._pending.cancel();
    const { clientId, clientSecret } = this.creds();
    const verifier = b64url(crypto.randomBytes(48));
    const challenge = b64url(crypto.createHash('sha256').update(verifier).digest());
    const state = b64url(crypto.randomBytes(16));

    const code = await new Promise((resolve, reject) => {
      let settled = false;
      const server = http.createServer((req, res) => {
        const url = new URL(req.url, 'http://127.0.0.1');
        if (url.pathname !== '/') { res.writeHead(404).end(); return; }
        const err = url.searchParams.get('error');
        const got = url.searchParams.get('code');
        const ok = !err && got && url.searchParams.get('state') === state;
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(page(ok ? 'Signed in to OurTube' : 'Sign-in failed',
          ok ? 'You can close this tab and return to OurTube.' : `Google returned: ${err || 'invalid response'}. Return to OurTube and try again.`));
        finish(ok ? null : new Error(err ? `Google sign-in error: ${err}` : 'Sign-in response was invalid.'), got);
      });
      const timer = setTimeout(() => finish(new Error('Sign-in timed out after 5 minutes.')), 5 * 60 * 1000);
      const finish = (error, value) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        setTimeout(() => server.close(), 500);
        this._pending = null;
        error ? reject(error) : resolve(value);
      };
      this._pending = { cancel: () => finish(new Error('Sign-in cancelled.')) };
      server.on('error', (e) => finish(e));
      server.listen(0, '127.0.0.1', () => {
        const redirect = `http://127.0.0.1:${server.address().port}`;
        this._redirect = redirect;
        const params = new URLSearchParams({
          client_id: clientId,
          redirect_uri: redirect,
          response_type: 'code',
          scope: SCOPE,
          code_challenge: challenge,
          code_challenge_method: 'S256',
          access_type: 'offline',
          prompt: 'consent',
          state,
        });
        shell.openExternal(`${AUTH_URL}?${params}`);
      });
    });

    const tokens = await tokenRequest({
      client_id: clientId,
      client_secret: clientSecret,
      code,
      code_verifier: verifier,
      grant_type: 'authorization_code',
      redirect_uri: this._redirect,
    });
    this._store(tokens);
    return true;
  }

  cancelLogin() {
    if (this._pending) this._pending.cancel();
  }

  async logout() {
    const t = this.tokens;
    this.tokens = null;
    this.secrets.clear();
    if (t && (t.refresh_token || t.access_token)) {
      try {
        await fetch(REVOKE_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams({ token: t.refresh_token || t.access_token }),
        });
      } catch {}
    }
  }

  async accessToken() {
    if (!this.isSignedIn()) throw new Error('Not signed in.');
    if (this.tokens.access_token && Date.now() < (this.tokens.expires_at || 0) - 60_000) {
      return this.tokens.access_token;
    }
    const { clientId, clientSecret } = this.creds();
    try {
      const fresh = await tokenRequest({
        client_id: clientId,
        client_secret: clientSecret,
        refresh_token: this.tokens.refresh_token,
        grant_type: 'refresh_token',
      });
      this._store({ ...fresh, refresh_token: fresh.refresh_token || this.tokens.refresh_token });
      return this.tokens.access_token;
    } catch (e) {
      if (/invalid_grant/.test(e.message)) {
        this.tokens = null;
        this.secrets.clear();
        throw new Error('Your Google sign-in expired. Sign in again from Settings. (Apps in "Testing" mode expire sign-ins after 7 days.)');
      }
      throw e;
    }
  }

  _store(tokens) {
    this.tokens = { ...tokens, expires_at: Date.now() + (tokens.expires_in || 3600) * 1000 };
    this.secrets.write(this.tokens);
  }
}

async function tokenRequest(body) {
  let res;
  try {
    res = await fetch(TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams(body),
    });
  } catch {
    throw new Error('Couldn’t reach Google. Check your internet connection and try again.');
  }
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`Token request failed: ${json.error || res.status} ${json.error_description || ''}`.trim());
  return json;
}

function page(title, msg) {
  return `<!doctype html><meta charset="utf-8"><title>${title}</title>
<body style="font-family:system-ui,sans-serif;background:#0f0f10;color:#eee;display:grid;place-items:center;height:100vh;margin:0">
<div style="text-align:center"><h1 style="font-weight:600">${title}</h1><p style="color:#aaa">${msg}</p></div></body>`;
}

module.exports = { GoogleAuth };
