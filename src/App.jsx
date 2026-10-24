import { useCallback, useEffect, useRef, useState } from 'react';
import Sidebar from './components/Sidebar.jsx';
import Feed from './components/Feed.jsx';
import Library from './components/Library.jsx';
import Settings from './components/Settings.jsx';
import Search from './components/Search.jsx';
import Channel from './components/Channel.jsx';
import Playlist from './components/Playlist.jsx';
import Music from './components/Music.jsx';
import AudioBar from './components/AudioBar.jsx';
import Player from './components/Player.jsx';
import { CloseVideoModal, QuitModal } from './components/Modals.jsx';
import Toasts from './components/Toasts.jsx';
import { videoMeta } from './util.js';

const api = window.api;
const EMPTY_LIB = { videos: {}, audio: {}, savedPlaylists: {}, playlists: { watchLater: [], downloaded: [] }, queue: [], progress: {} };

function loadCachedPlaylists() {
  try { return JSON.parse(localStorage.getItem('playlistsCache') || '[]'); } catch { return []; }
}

function loadCachedFeed() {
  try { return JSON.parse(localStorage.getItem('feedCache') || 'null'); } catch { return null; }
}

export default function App() {
  const [route, setRoute] = useState({ view: 'home' });
  const [settings, setSettings] = useState(null);
  const [auth, setAuth] = useState({ signedIn: false, checking: true });
  const [library, setLibrary] = useState(EMPTY_LIB);
  const [progress, setProgress] = useState({});
  const [feed, setFeed] = useState(() => ({ ...(loadCachedFeed() || { videos: [] }), loading: false, error: null }));
  const [search, setSearch] = useState({ query: '', videos: [], loading: false, error: null, limit: 30 });
  const [current, setCurrent] = useState(null);
  // A video waiting for its download to finish before it plays:
  //   mode 'open'   – nothing is playing; open the player when it's ready
  //   mode 'switch' – something is playing; switch to this one when it's ready
  const [pending, setPending] = useState(null);
  const [playerExpanded, setPlayerExpanded] = useState(true);
  const [videoPaused, setVideoPaused] = useState(false);
  const [closePrompt, setClosePrompt] = useState(null);
  const [quitPrompt, setQuitPrompt] = useState(null);
  const [toasts, setToasts] = useState([]);
  const [ytPlaylists, setYtPlaylists] = useState(() => ({ items: loadCachedPlaylists(), loading: false, error: null }));
  // Music player: an ordered list of audio ids and the position in it.
  const [audioNow, setAudioNow] = useState(null);

  const currentRef = useRef(current);
  const pendingRef = useRef(pending);
  const libRef = useRef(library);
  const settingsRef = useRef(settings);
  const historyRef = useRef([]);
  const toastTimers = useRef({});
  const toastsRef = useRef(toasts);
  toastsRef.current = toasts;
  currentRef.current = current;
  pendingRef.current = pending;
  libRef.current = library;
  settingsRef.current = settings;

  // ---- toasts -------------------------------------------------------------
  // toast(message, kind, { videoId, actions, timeout }) → id. timeout null = sticky.

  const dismissToast = useCallback((id) => {
    clearTimeout(toastTimers.current[id]);
    delete toastTimers.current[id];
    setToasts((t) => t.filter((x) => x.id !== id));
  }, []);

  const armToast = useCallback((id, ms) => {
    clearTimeout(toastTimers.current[id]);
    if (ms != null) toastTimers.current[id] = setTimeout(() => dismissToast(id), ms);
  }, [dismissToast]);

  const toast = useCallback((message, kind = 'info', opts = {}) => {
    const id = Math.random().toString(36).slice(2);
    const timeout = 'timeout' in opts ? opts.timeout : kind === 'error' ? 7000 : 3500;
    setToasts((t) => [...t.slice(-4), { id, message, kind, ...opts, timeout }]);
    armToast(id, timeout);
    return id;
  }, [armToast]);

  // Hovering a toast (or its open menu) pauses its timer.
  const holdToast = useCallback((id, hold) => {
    const t = toastsRef.current.find((x) => x.id === id);
    if (!t || t.timeout == null) return;
    if (hold) clearTimeout(toastTimers.current[id]);
    else armToast(id, 2500);
  }, [armToast]);

  const guard = useCallback(async (fn) => {
    try { return await fn(); } catch (e) { toast(e.message, 'error'); return undefined; }
  }, [toast]);

  // ---- boot ---------------------------------------------------------------
  useEffect(() => {
    api.getSettings().then(setSettings);
    api.getLibrary().then((lib) => { setLibrary(lib); setProgress(lib.progress || {}); });
    api.authStatus().then((a) => setAuth({ ...a, checking: false })).catch(() => setAuth({ signedIn: false, checking: false }));
    const offLib = api.onLibrary((lib) => { setLibrary(lib); setProgress(lib.progress || {}); });
    const offProg = api.onProgress((id, p) => setProgress((cur) => ({ ...cur, [id]: p })));
    const offQuit = api.onQuitRequested((info) => setQuitPrompt(info));
    return () => { offLib(); offProg(); offQuit(); };
  }, []);

  const loadFeed = useCallback(async (force = false) => {
    setFeed((f) => ({ ...f, loading: true, error: null }));
    try {
      const data = await api.loadFeed({ force });
      setFeed({ ...data, loading: false, error: null });
      try { localStorage.setItem('feedCache', JSON.stringify(data)); } catch {}
    } catch (e) {
      setFeed((f) => ({ ...f, loading: false, error: e.message }));
      if (/sign in again|Not signed in/i.test(e.message)) setAuth({ signedIn: false, checking: false });
    }
  }, []);

  const loadPlaylists = useCallback(async (force = false) => {
    setYtPlaylists((p) => ({ ...p, loading: true, error: null }));
    try {
      const items = await api.myPlaylists({ force });
      setYtPlaylists({ items, loading: false, error: null });
      try { localStorage.setItem('playlistsCache', JSON.stringify(items)); } catch {}
    } catch (e) {
      setYtPlaylists((p) => ({ ...p, loading: false, error: e.message }));
    }
  }, []);

  useEffect(() => {
    if (auth.signedIn) { loadFeed(false); loadPlaylists(false); }
    else if (!auth.checking) setYtPlaylists({ items: [], loading: false, error: null });
  }, [auth.signedIn, auth.checking, loadFeed, loadPlaylists]);

  // ---- navigation ---------------------------------------------------------

  const navigate = useCallback((view, extra = {}) => {
    setRoute((cur) => {
      historyRef.current = [...historyRef.current.slice(-30), cur];
      return { view, ...extra };
    });
    if (currentRef.current) setPlayerExpanded(false);
  }, []);

  const goBack = useCallback(() => {
    const prev = historyRef.current.pop() || { view: 'home' };
    setRoute(prev);
  }, []);

  const openChannel = useCallback((ch) => {
    if (!ch?.id) return;
    navigate('channel', { channel: ch });
  }, [navigate]);

  const openPlaylist = useCallback((pl) => {
    if (!pl?.id) return;
    navigate('playlist', { playlist: pl });
  }, [navigate]);

  const runSearch = useCallback(async (query, limit = 30) => {
    const q = query.trim();
    if (!q) return;
    setSearch((s) => ({ query: q, videos: s.query === q ? s.videos : [], loading: true, error: null, limit }));
    setRoute((cur) => {
      if (cur.view !== 'search') historyRef.current = [...historyRef.current.slice(-30), cur];
      return { view: 'search' };
    });
    if (currentRef.current) setPlayerExpanded(false);
    try {
      const { videos } = await api.search(q, limit);
      setSearch((s) => (s.query === q ? { ...s, videos, loading: false } : s));
    } catch (e) {
      setSearch((s) => (s.query === q ? { ...s, loading: false, error: e.message } : s));
    }
  }, []);

  // ---- playback -----------------------------------------------------------

  // Close the current video, applying (or asking for) the after-watch decision.
  const closeCurrent = useCallback((then) => {
    const id = currentRef.current;
    if (!id) { then?.(); return; }
    const finish = async (action, remember) => {
      setClosePrompt(null);
      if (remember) {
        const s = await guard(() => api.setSettings({ afterWatch: action }));
        if (s) setSettings(s);
      }
      setCurrent(null); // unmount the <video> first so the file isn't locked
      await new Promise((r) => setTimeout(r, 120));
      await guard(() => api.disposeVideo(id, action));
      then?.();
    };
    // Videos from a playlist saved for offline stay with that playlist.
    const inSaved = Object.values(libRef.current.savedPlaylists || {}).some((p) => p.mode === 'video' && p.videoIds.includes(id));
    if (inSaved) { finish('keep', false); return; }
    const pref = settingsRef.current?.afterWatch || 'ask';
    if (pref === 'ask') setClosePrompt({ id, finish });
    else finish(pref, false);
  }, [guard]);

  const clearPending = useCallback(() => {
    const p = pendingRef.current;
    if (p?.toastId) dismissToast(p.toastId);
    setPending(null);
  }, [dismissToast]);

  const openPlayer = useCallback((id) => {
    setCurrent(id);
    setPlayerExpanded(true);
  }, []);

  // Open the player now if downloaded, otherwise show a progress toast and
  // open it automatically once the download finishes.
  const openWhenReady = useCallback((id) => {
    const rec = libRef.current.videos[id];
    if (rec?.status === 'ready') { openPlayer(id); return; }
    const toastId = toast('Download started. The player opens when it’s ready.', 'video', {
      videoId: id,
      timeout: null,
      actions: [{ label: 'Cancel download', icon: 'close', onClick: () => { clearPending(); api.deleteVideo(id); } }],
    });
    setPending({ id, mode: 'open', toastId });
  }, [openPlayer, toast, clearPending]);

  // Start playing a specific video right away (closing whatever is playing).
  const playNow = useCallback(async (idOrVideo) => {
    const id = typeof idOrVideo === 'string' ? idOrVideo : idOrVideo.id;
    const meta = typeof idOrVideo === 'string' ? libRef.current.videos[id] : idOrVideo;
    if (!meta) return;
    if (id === currentRef.current) { setPlayerExpanded(true); return; }
    const p = pendingRef.current;
    if (p && p.id !== id) {
      if (p.mode === 'open') await guard(() => api.queueAdd(p.id)); // bump the old one into the queue
      clearPending();
    }
    const go = async () => {
      if (libRef.current.queue.includes(id)) await guard(() => api.queueRemove(id));
      const ok = await guard(() => api.requestVideo(videoMeta(meta), 'play'));
      if (ok) openWhenReady(id);
    };
    if (currentRef.current) closeCurrent(go);
    else go();
  }, [closeCurrent, guard, openWhenReady, clearPending]);

  const addToQueue = useCallback(async (video, { quiet = false } = {}) => {
    if (video.id === currentRef.current) { toast('That video is already playing.'); return; }
    const already = libRef.current.queue.includes(video.id);
    const rec = await guard(() => api.requestVideo(videoMeta(video), 'queue'));
    if (!rec || quiet) return;
    // Replace any earlier toast for the same video instead of stacking a copy.
    for (const t of toastsRef.current) if (t.videoId === video.id && t.kind === 'video' && t.timeout != null) dismissToast(t.id);
    const busy = currentRef.current || pendingRef.current;
    const msg = already ? 'Already in the queue' : busy ? 'Added to queue. It will play after the current video.' : 'Added to queue';
    toast(msg, 'video', {
      videoId: video.id,
      timeout: 7000,
      actions: [
        { label: 'Play now', hint: 'Stop the current video and switch now', icon: 'play', onClick: () => playNow(video.id) },
        {
          label: 'Play when download finishes',
          hint: rec.status === 'ready' ? 'Already downloaded, so this switches now' : 'Keep watching, then switch once it’s ready',
          icon: 'download',
          onClick: () => {
            const p = pendingRef.current;
            if (p && p.mode === 'switch') clearPending();
            if (!currentRef.current && !p) { playNow(video.id); return; }
            setPending({ id: video.id, mode: 'switch' });
            if (rec.status !== 'ready') toast('Will switch to it as soon as the download finishes.');
          },
        },
      ],
    });
  }, [guard, toast, playNow, clearPending, dismissToast]);

  // Clicking a video: play it, or queue it if something is already playing.
  const play = useCallback(async (video) => {
    if (video.id === currentRef.current) { setPlayerExpanded(true); return; }
    if (pendingRef.current?.id === video.id) { toast('Still downloading. It will open when ready.'); return; }
    if (currentRef.current || pendingRef.current?.mode === 'open') { addToQueue(video); return; }
    playNow(video);
  }, [addToQueue, playNow, toast]);

  const playNext = useCallback(() => {
    const nextId = libRef.current.queue[0];
    if (nextId) playNow(nextId);
  }, [playNow]);

  const handleEnded = useCallback(() => {
    if (libRef.current.queue.length) playNext();
  }, [playNext]);

  // Watch pending downloads and open / switch when they finish.
  useEffect(() => {
    if (!pending) return;
    const rec = library.videos[pending.id];
    if (!rec) { clearPending(); return; }
    if (rec.status === 'error') {
      clearPending();
      toast(`Couldn’t download “${rec.title}”: ${rec.error}`, 'error');
      return;
    }
    if (rec.status !== 'ready') return;
    const id = pending.id;
    const mode = pending.mode;
    clearPending();
    if (id === currentRef.current) return;
    if (mode === 'switch') playNow(id);
    else openPlayer(id);
  }, [library, pending, clearPending, playNow, openPlayer, toast]);

  const addToWatchLater = useCallback(async (video) => {
    const ok = await guard(() => api.requestVideo(videoMeta(video), 'watchLater'));
    if (ok) toast(`Saving “${video.title}” to Watch Later`);
  }, [guard, toast]);

  // ---- audio ----------------------------------------------------------------

  const playAudio = useCallback((ids, index = 0) => {
    const list = ids.filter((id) => libRef.current.audio[id]);
    if (!list.length) return;
    setAudioNow({ ids: list, index: Math.min(index, list.length - 1), token: Date.now() });
  }, []);

  const downloadAudio = useCallback(async (video) => {
    const existing = libRef.current.audio[video.id];
    if (existing?.status === 'ready') {
      toast('Already in your music', 'video', {
        videoId: video.id, audio: true, timeout: 5000,
        actions: [
          { label: 'Play', icon: 'play', onClick: () => playAudio([video.id]) },
          { label: 'Open Music', icon: 'music', onClick: () => navigate('music') },
        ],
      });
      return;
    }
    const rec = await guard(() => api.requestAudio(videoMeta(video)));
    if (!rec) return;
    toast('Downloading audio. It’ll appear in Music.', 'video', {
      videoId: video.id, audio: true, timeout: 7000,
      actions: [
        { label: 'Open Music', icon: 'music', onClick: () => navigate('music') },
        { label: 'Cancel download', icon: 'close', onClick: () => api.deleteAudio(video.id) },
      ],
    });
  }, [guard, toast, navigate, playAudio]);

  const ctx = {
    api, library, progress, settings, auth, current, pending, toast, guard,
    play, playNow, playNext, addToWatchLater, addToQueue, openChannel, openPlaylist,
    downloadAudio, playAudio, audioNow, ytPlaylists, loadPlaylists, navigate,
  };

  const activeDownloads = [...Object.values(library.videos), ...Object.values(library.audio || {})].filter((v) => v.status === 'downloading').length;
  const view = route.view;

  return (
    <div className="app">
      <Sidebar
        view={view}
        onNavigate={(v) => navigate(v)}
        onSearch={(q) => runSearch(q)}
        searchQuery={search.query}
        library={library}
        activeDownloads={activeDownloads}
        auth={auth}
        playing={!!current}
        paused={videoPaused}
        playerExpanded={playerExpanded}
        onShowPlayer={() => setPlayerExpanded(true)}
        ytPlaylists={ytPlaylists}
        currentPlaylistId={view === 'playlist' ? route.playlist.id : null}
        onOpenPlaylist={openPlaylist}
        onRefreshPlaylists={() => loadPlaylists(true)}
      />
      <main className={`main ${audioNow ? 'has-audiobar' : ''}`}>
        {view === 'home' && (
          <Feed ctx={ctx} feed={feed} onRefresh={() => loadFeed(true)} onOpenSettings={() => navigate('settings')} />
        )}
        {view === 'search' && (
          <Search ctx={ctx} search={search} onMore={() => runSearch(search.query, search.limit + 30)} onRetry={() => runSearch(search.query, search.limit)} onBack={goBack} />
        )}
        {view === 'channel' && <Channel key={route.channel.id} ctx={ctx} channel={route.channel} onBack={goBack} />}
        {view === 'playlist' && <Playlist key={route.playlist.id} ctx={ctx} playlist={route.playlist} onBack={goBack} />}
        {view === 'music' && <Music ctx={ctx} />}
        {(view === 'watchLater' || view === 'downloaded' || view === 'queue') && <Library ctx={ctx} list={view} />}
        {view === 'settings' && (
          <Settings ctx={ctx} onSettings={setSettings} onAuth={(a) => setAuth({ ...a, checking: false })} />
        )}

        {current && (
          <Player
            ctx={ctx}
            id={current}
            expanded={playerExpanded}
            onExpand={() => setPlayerExpanded(true)}
            onMinimize={() => setPlayerExpanded(false)}
            onClose={() => closeCurrent()}
            onEnded={handleEnded}
            onPausedChange={setVideoPaused}
          />
        )}

        {audioNow && (
          <AudioBar
            ctx={ctx}
            now={audioNow}
            onIndex={(index) => setAudioNow((a) => (a ? { ...a, index } : a))}
            onClose={() => setAudioNow(null)}
          />
        )}
      </main>

      {closePrompt && (
        <CloseVideoModal
          video={library.videos[closePrompt.id]}
          onChoose={closePrompt.finish}
          onCancel={() => setClosePrompt(null)}
        />
      )}
      {quitPrompt && (
        <QuitModal
          count={library.queue.length || quitPrompt.count}
          videos={library.queue.map((id) => library.videos[id]).filter(Boolean)}
          onChoose={(action) => { setQuitPrompt(null); api.resolveQuit(action); }}
          onCancel={() => { setQuitPrompt(null); api.resolveQuit('cancel'); }}
        />
      )}
      <Toasts toasts={toasts} ctx={ctx} onDismiss={dismissToast} onHold={holdToast} />
    </div>
  );
}
