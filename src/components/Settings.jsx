import { useEffect, useState } from 'react';
import Icon from './Icon.jsx';
import SetupGuide from './SetupGuide.jsx';

function Section({ title, desc, children }) {
  return (
    <section className="set-section">
      <div className="set-head">
        <h2>{title}</h2>
        {desc && <p className="muted">{desc}</p>}
      </div>
      <div className="set-body">{children}</div>
    </section>
  );
}

function ToolRow({ name, info, purpose }) {
  return (
    <div className="tool-row">
      <span className={`dot ${info ? 'ok' : 'missing'}`} />
      <div>
        <div><b>{name}</b> <span className="muted small">{purpose}</span></div>
        <div className="muted small mono">{info ? `${info.version ? 'v' + info.version.replace(/^v/, '') + ' · ' : ''}${info.path}` : 'Not installed yet'}</div>
      </div>
    </div>
  );
}

export default function Settings({ ctx, onSettings, onAuth }) {
  const { api, settings, auth, toast, guard } = ctx;
  const [clientId, setClientId] = useState('');
  const [clientSecret, setClientSecret] = useState('');
  const [showSecret, setShowSecret] = useState(false);
  const [signingIn, setSigningIn] = useState(false);
  const [tools, setTools] = useState(null);
  const [installing, setInstalling] = useState(false);
  const configured = !!(settings?.googleClientId && settings?.googleClientSecret);
  const [guideOpen, setGuideOpen] = useState(!configured);

  useEffect(() => {
    if (settings) { setClientId(settings.googleClientId); setClientSecret(settings.googleClientSecret); }
  }, [settings?.googleClientId, settings?.googleClientSecret]);

  useEffect(() => { api.toolsStatus().then(setTools).catch(() => {}); }, [api]);

  if (!settings) return null;

  const update = async (patch) => {
    const s = await guard(() => api.setSettings(patch));
    if (s) onSettings(s);
    return s;
  };

  const saveCreds = async () => {
    const id = clientId.trim();
    if (id && !id.endsWith('.apps.googleusercontent.com')) {
      toast('That doesn’t look like a Client ID. It should end in .apps.googleusercontent.com', 'error');
      return;
    }
    if (await update({ googleClientId: id, googleClientSecret: clientSecret.trim() })) toast('Google credentials saved');
  };

  const importJson = async () => {
    const s = await guard(() => api.importClientJson());
    if (s) { onSettings(s); toast('Credentials imported. Now click “Sign in with Google”.'); }
  };

  const signIn = async () => {
    if (clientId.trim() !== settings.googleClientId || clientSecret.trim() !== settings.googleClientSecret) await saveCreds();
    setSigningIn(true);
    const a = await guard(() => api.login());
    setSigningIn(false);
    if (a) { onAuth(a); toast('Signed in. Loading your feed…'); }
  };

  const signOut = async () => {
    const a = await guard(() => api.logout());
    if (a) onAuth(a);
  };

  const installTools = async (force) => {
    setInstalling(true);
    const t = await guard(() => api.installTools({ force }));
    setInstalling(false);
    if (t) { setTools(t); toast(force ? 'Download tools updated' : 'Download tools installed'); }
  };

  const chooseFolder = async () => {
    const dir = await guard(() => api.chooseFolder());
    if (dir) update({ downloadDir: dir });
  };

  return (
    <div className="page settings">
      <header className="toolbar"><h1 className="page-title">Settings</h1></header>

      <Section
        title="Google account"
        desc="Needed to read the channels you subscribe to. You supply your own free key, so nothing goes through anyone else’s servers."
      >
        <div className="auth-card">
          {auth.signedIn ? (
            <>
              {auth.profile?.avatar ? <img src={auth.profile.avatar} alt="" /> : <span className="avatar-fallback lg">{auth.profile?.name?.[0] || 'G'}</span>}
              <div className="grow">
                <div><b>{auth.profile?.name || 'Signed in'}</b></div>
                <div className="muted small">Read-only access to your YouTube subscriptions</div>
              </div>
              <button className="btn" onClick={signOut}>Sign out</button>
            </>
          ) : (
            <>
              <span className="avatar-fallback lg"><Icon name="key" size={20} /></span>
              <div className="grow">
                <div><b>Not signed in</b></div>
                <div className="muted small">{configured ? 'Credentials saved. Ready to sign in.' : 'Add your credentials below first.'}</div>
              </div>
              {signingIn ? (
                <>
                  <span className="muted small">Finish signing in in your browser…</span>
                  <button className="btn ghost" onClick={() => api.cancelLogin()}>Cancel</button>
                </>
              ) : (
                <button className="btn primary" disabled={!clientId || !clientSecret} onClick={signIn}>Sign in with Google</button>
              )}
            </>
          )}
        </div>

        <div className="field-row">
          <button className="btn" onClick={importJson}><Icon name="download" size={16} /> Import downloaded JSON</button>
          <span className="muted small">or paste the values:</span>
        </div>
        <label className="field">
          <span>Client ID</span>
          <input value={clientId} onChange={(e) => setClientId(e.target.value)} placeholder="1234567890-abc123.apps.googleusercontent.com" spellCheck={false} />
        </label>
        <label className="field">
          <span>Client secret</span>
          <div className="input-with-btn">
            <input type={showSecret ? 'text' : 'password'} value={clientSecret} onChange={(e) => setClientSecret(e.target.value)} placeholder="GOCSPX-…" spellCheck={false} />
            <button className="btn ghost sm" onClick={() => setShowSecret((s) => !s)}>{showSecret ? 'Hide' : 'Show'}</button>
          </div>
        </label>
        <div className="field-row">
          <button className="btn primary" onClick={saveCreds} disabled={clientId === settings.googleClientId && clientSecret === settings.googleClientSecret}>Save</button>
        </div>

        <button className="guide-toggle" onClick={() => setGuideOpen((o) => !o)} aria-expanded={guideOpen}>
          <Icon name="chevron" size={16} className={guideOpen ? 'rot90' : ''} />
          How do I get a Client ID and secret? (step-by-step guide)
        </button>
        {guideOpen && <SetupGuide open={(url) => api.openExternal(url)} />}
      </Section>

      <Section title="Downloads" desc="Where videos are saved and in what quality.">
        <label className="field">
          <span>Download folder</span>
          <div className="input-with-btn">
            <input readOnly value={settings.resolvedDownloadDir || ''} />
            <button className="btn sm" onClick={chooseFolder}>Change…</button>
            <button className="btn ghost sm" onClick={() => api.openFolder('downloads')}>Open</button>
          </div>
        </label>
        <div className="field-grid">
          <label className="field">
            <span>Quality</span>
            <select value={settings.quality} onChange={(e) => update({ quality: e.target.value })}>
              <option value="best">Best available (may be 4K, large files)</option>
              <option value="1080">Up to 1080p</option>
              <option value="720">Up to 720p</option>
              <option value="480">Up to 480p (small files)</option>
            </select>
          </label>
          <label className="field">
            <span>Background downloads at once</span>
            <select value={settings.maxConcurrentDownloads} onChange={(e) => update({ maxConcurrentDownloads: Number(e.target.value) })}>
              {[1, 2, 3, 4].map((n) => <option key={n} value={n}>{n}</option>)}
            </select>
          </label>
        </div>
        <p className="muted small">Videos you click play, and videos you queue, always start downloading immediately. The limit applies to Watch Later downloads.</p>
      </Section>

      <Section title="Music" desc="Audio-only downloads, for videos that are mainly music.">
        <label className="field">
          <span>Music folder</span>
          <div className="input-with-btn">
            <input readOnly value={settings.resolvedAudioDir || ''} />
            <button className="btn sm" onClick={async () => { const dir = await guard(() => api.chooseFolder()); if (dir) update({ audioDir: dir }); }}>Change…</button>
            <button className="btn ghost sm" onClick={() => api.openFolder('audio')}>Open</button>
          </div>
        </label>
        <label className="field">
          <span>Audio format</span>
          <select value={settings.audioFormat || 'm4a'} onChange={(e) => update({ audioFormat: e.target.value })}>
            <option value="m4a">M4A (AAC): best quality, no re-encoding, plays in Apple Music</option>
            <option value="mp3">MP3: works with every player, slightly lower quality</option>
          </select>
        </label>
        <p className="muted small">Tracks include the video’s thumbnail as cover art, plus the title and channel name as tags. A new format applies to new downloads only.</p>
      </Section>

      <Section title="When I close a video" desc="What happens to the file after you’re done watching.">
        <div className="radio-list">
          {[
            ['ask', 'Ask me every time'],
            ['keep', 'Keep it: move to the Downloaded playlist'],
            ['delete', 'Delete the file'],
          ].map(([val, label]) => (
            <label key={val} className="radio">
              <input type="radio" name="afterWatch" checked={settings.afterWatch === val} onChange={() => update({ afterWatch: val })} />
              <span>{label}</span>
            </label>
          ))}
        </div>
      </Section>

      <Section title="Feed">
        <label className="check">
          <input type="checkbox" checked={settings.hideShorts} onChange={(e) => update({ hideShorts: e.target.checked })} />
          <span>Hide Shorts <span className="muted small">(videos 60 seconds or shorter). Takes effect on next refresh.</span></span>
        </label>
      </Section>

      <Section
        title="Download tools"
        desc="Free, open-source programs that do the downloading. OurTube installs them automatically on your first download; you can also do it now."
      >
        {tools ? (
          <div className="tools">
            <ToolRow name="yt-dlp" info={tools.ytdlp} purpose="downloads videos" />
            <ToolRow name="Deno" info={tools.deno} purpose="lets yt-dlp read YouTube’s player" />
            <ToolRow name="FFmpeg" info={tools.ffmpeg} purpose="joins video and audio (bundled)" />
          </div>
        ) : <p className="muted">Checking…</p>}
        <div className="field-row">
          {tools && (!tools.ytdlp || !tools.deno) && (
            <button className="btn primary" disabled={installing} onClick={() => installTools(false)}>
              {installing ? 'Installing…' : 'Install missing tools'}
            </button>
          )}
          <button className="btn" disabled={installing} onClick={() => installTools(true)}>
            <Icon name="refresh" size={16} className={installing ? 'spin' : ''} /> {installing ? 'Working…' : 'Update to latest'}
          </button>
        </div>
        <p className="muted small">If downloads start failing, update first. YouTube changes often and yt-dlp releases fixes quickly.</p>

        <details className="advanced">
          <summary>Advanced</summary>
          <label className="field">
            <span>Custom yt-dlp path (optional)</span>
            <input defaultValue={settings.ytdlpPath} onBlur={(e) => update({ ytdlpPath: e.target.value.trim() })} placeholder="Leave empty to use the built-in copy" />
          </label>
          <label className="field">
            <span>Custom Deno path (optional)</span>
            <input defaultValue={settings.denoPath} onBlur={(e) => update({ denoPath: e.target.value.trim() })} placeholder="Leave empty to use the built-in copy" />
          </label>
          <label className="field">
            <span>Use cookies from browser (optional)</span>
            <select value={settings.cookiesFromBrowser} onChange={(e) => update({ cookiesFromBrowser: e.target.value })}>
              <option value="">Off</option>
              {['chrome', 'firefox', 'edge', 'brave', 'safari', 'chromium', 'opera', 'vivaldi'].map((b) => <option key={b} value={b}>{b}</option>)}
            </select>
            <small className="muted">Only needed for age-restricted or members-only videos, or if YouTube asks yt-dlp to “confirm you’re not a bot”.</small>
          </label>
          <div className="field-row">
            <button className="btn ghost sm" onClick={() => api.openFolder('data')}><Icon name="folder" size={14} /> Open app data folder</button>
          </div>
        </details>
      </Section>
    </div>
  );
}
