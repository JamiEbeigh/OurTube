// YouTube data, using as little API quota as possible.
//
// Home feed:
//   1. subscriptions.list            1 unit per 50 channels, cached 6 hours
//   2. each channel's public RSS feed free; retried, and if it still fails we
//                                    fall back to the API uploads playlist
//                                    (1 unit), then to the last good copy
//   3. videos.list                   1 unit per 50 new videos (durations, live
//                                    status); results are cached per video
//
// Search: yt-dlp's "ytsearch" (no quota at all). Channel pages: API when signed
// in (about 3 units a page), yt-dlp otherwise.
const { XMLParser } = require('fast-xml-parser');

const API = 'https://www.googleapis.com/youtube/v3';
const SUBS_TTL = 6 * 60 * 60 * 1000;
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36';
const xml = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: '@_' });
const hq = (id) => `https://i.ytimg.com/vi/${id}/hqdefault.jpg`;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const isVideoId = (id) => typeof id === 'string' && /^[\w-]{11}$/.test(id);

class YouTube {
  constructor({ auth, cache, tools }) {
    this.auth = auth;
    this.cache = cache; // JsonFile: { subs, subsFetchedAt, profile, channelFeeds, details }
    this.tools = tools;
  }

  // ---- low level ------------------------------------------------------------

  async api(endpoint, params) {
    const token = await this.auth.accessToken();
    let res;
    try {
      res = await fetch(`${API}/${endpoint}?${new URLSearchParams(params)}`, {
        headers: { Authorization: `Bearer ${token}` },
        signal: AbortSignal.timeout(20000),
      });
    } catch {
      throw new Error('Couldn’t reach YouTube. Check your internet connection and try again.');
    }
    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      const reason = json.error?.errors?.[0]?.reason;
      if (reason === 'accessNotConfigured' || /has not been used|is disabled/.test(json.error?.message || '')) {
        throw new Error('The YouTube Data API v3 is not enabled for your Google Cloud project. Enable it (see Settings → setup guide) and try again.');
      }
      if (reason === 'quotaExceeded') throw Object.assign(new Error('Your daily YouTube API quota is used up. It resets at midnight Pacific time.'), { quota: true });
      throw Object.assign(new Error(json.error?.message || `YouTube API error ${res.status}`), { status: res.status, reason });
    }
    return json;
  }

  async profile() {
    if (this.cache.data.profile) return this.cache.data.profile;
    const json = await this.api('channels', { part: 'snippet', mine: 'true' });
    const ch = json.items?.[0];
    const profile = ch
      ? { name: ch.snippet.title, avatar: ch.snippet.thumbnails?.default?.url || '' }
      : { name: 'Google account', avatar: '' };
    this.cache.data.profile = profile;
    this.cache.save();
    return profile;
  }

  async subscriptions(force = false) {
    const c = this.cache.data;
    if (!force && c.subs?.length && Date.now() - (c.subsFetchedAt || 0) < SUBS_TTL) return c.subs;
    const subs = [];
    let pageToken;
    do {
      const json = await this.api('subscriptions', {
        part: 'snippet', mine: 'true', maxResults: '50', order: 'alphabetical',
        ...(pageToken ? { pageToken } : {}),
      });
      for (const it of json.items || []) {
        subs.push({
          channelId: it.snippet.resourceId.channelId,
          title: it.snippet.title,
          avatar: it.snippet.thumbnails?.default?.url || '',
        });
      }
      pageToken = json.nextPageToken;
    } while (pageToken);
    c.subs = subs;
    c.subsFetchedAt = Date.now();
    this.cache.save();
    return subs;
  }

  // ---- per-channel uploads --------------------------------------------------

  async rssOnce(channelId) {
    const res = await fetch(`https://www.youtube.com/feeds/videos.xml?channel_id=${encodeURIComponent(channelId)}`, {
      headers: { 'User-Agent': UA, Accept: 'application/atom+xml,application/xml;q=0.9,*/*;q=0.8' },
      signal: AbortSignal.timeout(15000),
    });
    if (!res.ok) throw Object.assign(new Error(`RSS ${res.status}`), { status: res.status });
    const doc = xml.parse(await res.text());
    if (!doc.feed) throw new Error('RSS returned an unexpected page');
    let entries = doc.feed.entry || [];
    if (!Array.isArray(entries)) entries = [entries];
    return entries.map((e) => {
      const id = e['yt:videoId'];
      const group = e['media:group'] || {};
      const views = group['media:community']?.['media:statistics']?.['@_views'];
      return {
        id,
        title: String(e.title ?? group['media:title'] ?? ''),
        channelId,
        channelTitle: String(e.author?.name ?? ''),
        publishedAt: e.published,
        thumbnail: hq(id),
        description: String(group['media:description'] ?? '').slice(0, 500),
        views: views ? Number(views) : null,
        isShortUrl: /\/shorts\//.test(e.link?.['@_href'] || ''),
      };
    }).filter((v) => isVideoId(v.id));
  }

  async rss(channelId) {
    let last;
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        return await this.rssOnce(channelId);
      } catch (e) {
        last = e;
        await sleep(400 * 2 ** attempt + Math.random() * 300);
      }
    }
    throw last;
  }

  // One page of any playlist. Private / deleted entries are skipped.
  async playlistPage(playlistId, { max = 50, pageToken, channelId } = {}) {
    const json = await this.api('playlistItems', {
      part: 'snippet,contentDetails', playlistId, maxResults: String(max),
      ...(pageToken ? { pageToken } : {}),
    });
    const items = (json.items || [])
      .filter((it) => !['Private video', 'Deleted video'].includes(it.snippet?.title))
      .map((it) => {
        const id = it.contentDetails?.videoId;
        return {
          id,
          title: it.snippet.title,
          channelId: channelId || it.snippet.videoOwnerChannelId || '',
          channelTitle: it.snippet.videoOwnerChannelTitle || it.snippet.channelTitle || '',
          publishedAt: it.contentDetails?.videoPublishedAt || it.snippet.publishedAt,
          thumbnail: hq(id),
          description: (it.snippet.description || '').slice(0, 500),
          views: null,
        };
      })
      .filter((v) => isVideoId(v.id));
    return { items, nextPageToken: json.nextPageToken || null, total: json.pageInfo?.totalResults ?? null };
  }

  // The uploads playlist of channel UCxxxx is always UUxxxx.
  async uploadsViaApi(channelId, max = 15, pageToken) {
    try {
      return await this.playlistPage('UU' + channelId.slice(2), { max, pageToken, channelId });
    } catch (e) {
      if (e.status === 404) return { items: [], nextPageToken: null }; // channel has no uploads
      throw e;
    }
  }

  // ---- the signed-in user's playlists -----------------------------------------

  async myPlaylists(force = false) {
    const c = this.cache.data;
    if (!force && c.myPlaylists && Date.now() - (c.myPlaylistsAt || 0) < 30 * 60 * 1000) return c.myPlaylists;
    const lists = [];
    // "Liked videos" is a playlist too (YouTube's API no longer exposes Watch Later).
    try {
      const me = await this.api('channels', { part: 'contentDetails', mine: 'true' });
      const likes = me.items?.[0]?.contentDetails?.relatedPlaylists?.likes;
      if (likes) lists.push({ id: likes, title: 'Liked videos', count: null, thumbnail: '', privacy: 'private', special: 'likes' });
    } catch {}
    let pageToken;
    do {
      const json = await this.api('playlists', {
        part: 'snippet,contentDetails,status', mine: 'true', maxResults: '50',
        ...(pageToken ? { pageToken } : {}),
      });
      for (const p of json.items || []) {
        const t = p.snippet?.thumbnails || {};
        lists.push({
          id: p.id,
          title: p.snippet?.title || 'Untitled playlist',
          description: p.snippet?.description || '',
          count: p.contentDetails?.itemCount ?? null,
          thumbnail: (t.medium || t.high || t.default || {}).url || '',
          privacy: p.status?.privacyStatus || '',
          channelTitle: p.snippet?.channelTitle || '',
        });
      }
      pageToken = json.nextPageToken;
    } while (pageToken);
    c.myPlaylists = lists;
    c.myPlaylistsAt = Date.now();
    this.cache.save();
    return lists;
  }

  async playlist(playlistId, { pageToken, hideShorts = false } = {}) {
    const { items, nextPageToken, total } = await this.playlistPage(playlistId, { max: 50, pageToken });
    let { videos } = await this.enrich(items);
    videos = await this.addAvatars(videos).catch(() => videos);
    // Playlists are the user's own picks, so Shorts are shown unless asked otherwise.
    if (hideShorts) videos = videos.filter((v) => !isShort(v));
    return { videos, next: nextPageToken, total };
  }

  // Every item of a playlist (for "Download all"), in playlist order.
  async playlistAll(playlistId) {
    const all = [];
    let pageToken;
    do {
      const page = await this.playlistPage(playlistId, { max: 50, pageToken });
      all.push(...page.items);
      pageToken = page.nextPageToken;
    } while (pageToken && all.length < 5000);
    const seen = new Set();
    const unique = all.filter((v) => (seen.has(v.id) ? false : seen.add(v.id)));
    const { videos } = await this.enrich(unique);
    return videos.filter((v) => v.live !== 'upcoming' && v.live !== 'live');
  }

  // Durations / live status / view counts. Cached per video so a refresh only
  // pays for videos it hasn't seen before.
  async enrich(videos) {
    const c = this.cache.data;
    c.details = c.details || {};
    const missing = [...new Set(videos.map((v) => v.id).filter((id) => !c.details[id]))];
    const fresh = {};
    const batches = [];
    for (let i = 0; i < missing.length; i += 50) batches.push(missing.slice(i, i + 50));
    let error = null;
    await mapLimit(batches, 4, async (ids) => {
      if (error?.quota) return;
      try {
        const json = await this.api('videos', { part: 'contentDetails,statistics,snippet', id: ids.join(','), maxResults: '50' });
        for (const it of json.items || []) {
          const d = {
            duration: parseDuration(it.contentDetails?.duration),
            views: it.statistics?.viewCount ? Number(it.statistics.viewCount) : null,
            live: it.snippet?.liveBroadcastContent || 'none',
            publishedAt: it.snippet?.publishedAt,
            channelId: it.snippet?.channelId,
            channelTitle: it.snippet?.channelTitle,
          };
          fresh[it.id] = d;
          if (d.live === 'none') c.details[it.id] = { duration: d.duration, views: d.views, live: 'none' };
        }
      } catch (e) {
        error = e;
      }
    });
    const out = videos.map((v) => {
      const d = fresh[v.id] || c.details[v.id];
      if (!d) return v;
      return {
        ...v,
        duration: d.duration ?? v.duration ?? null,
        views: v.views ?? d.views ?? null,
        live: d.live,
        publishedAt: v.publishedAt || d.publishedAt,
        channelId: v.channelId || d.channelId,
        channelTitle: v.channelTitle || d.channelTitle,
      };
    });
    return { videos: out, error };
  }

  // ---- home feed ------------------------------------------------------------

  async feed({ force = false, hideShorts = true } = {}) {
    const subs = await this.subscriptions(force);
    const c = this.cache.data;
    c.channelFeeds = c.channelFeeds || {};
    const avatars = Object.fromEntries(subs.map((s) => [s.channelId, s.avatar]));
    const stats = { channels: subs.length, rss: 0, api: 0, cached: 0, failed: 0 };
    const errors = [];
    const all = [];
    let apiBlocked = false;

    await mapLimit(subs, 6, async (s) => {
      let items = null;
      let fromCache = false;
      try {
        items = await this.rss(s.channelId);
        stats.rss++;
      } catch (rssErr) {
        if (!apiBlocked) {
          try {
            items = (await this.uploadsViaApi(s.channelId, 15)).items;
            stats.api++;
          } catch (apiErr) {
            if (apiErr.quota) apiBlocked = true;
          }
        }
        if (!items && c.channelFeeds[s.channelId]) {
          items = c.channelFeeds[s.channelId].items;
          fromCache = true;
          stats.cached++;
        }
        if (!items) {
          stats.failed++;
          errors.push(`${s.title}: ${rssErr.message}`);
          return;
        }
      }
      if (!fromCache) c.channelFeeds[s.channelId] = { at: Date.now(), items };
      for (const v of items) all.push({ ...v, channelTitle: v.channelTitle || s.title, channelAvatar: avatars[s.channelId] });
    });

    // Drop feeds for channels you've unsubscribed from.
    const subIds = new Set(subs.map((s) => s.channelId));
    for (const id of Object.keys(c.channelFeeds)) if (!subIds.has(id)) delete c.channelFeeds[id];

    const seen = new Set();
    let videos = all
      .filter((v) => (seen.has(v.id) ? false : seen.add(v.id)))
      .sort((a, b) => new Date(b.publishedAt) - new Date(a.publishedAt))
      .slice(0, 5000);

    const enriched = await this.enrich(videos);
    if (enriched.error) errors.push(`Video details: ${enriched.error.message}`);
    videos = enriched.videos
      .filter((v) => v.live !== 'upcoming' && v.live !== 'live') // can't download what hasn't aired
      .filter((v) => !hideShorts || !isShort(v));

    // Keep the details cache from growing forever.
    const keep = new Set(all.map((v) => v.id));
    for (const id of Object.keys(c.details || {})) if (!keep.has(id)) delete c.details[id];
    this.cache.save();

    return { videos, ...stats, errors, fetchedAt: Date.now() };
  }

  // ---- search (no API quota) -------------------------------------------------

  async search(query, limit = 30) {
    const q = String(query || '').trim();
    if (!q) return { videos: [] };
    const json = await this.tools.json([`ytsearch${Math.min(limit, 150)}:${q}`, '--flat-playlist', '-J'], 60000);
    let videos = (json.entries || [])
      .filter((e) => isVideoId(e.id) && (!e.ie_key || e.ie_key === 'Youtube'))
      .map((e) => ({
        id: e.id,
        title: e.title || '',
        channelTitle: e.channel || e.uploader || '',
        channelId: e.channel_id || e.uploader_id || '',
        duration: e.duration != null ? Math.round(e.duration) : null,
        views: e.view_count ?? null,
        publishedAt: e.timestamp ? new Date(e.timestamp * 1000).toISOString() : null,
        thumbnail: hq(e.id),
        description: (e.description || '').slice(0, 500),
        isShortUrl: /\/shorts\//.test(e.url || ''),
        live: e.live_status === 'is_upcoming' ? 'upcoming' : e.live_status === 'is_live' ? 'live' : 'none',
      }));

    // Signed in? Fill in upload dates and channel avatars (2 cheap API calls).
    if (this.auth.isSignedIn() && videos.length) {
      try {
        videos = (await this.enrich(videos)).videos;
        videos = await this.addAvatars(videos);
      } catch {}
    }
    return { videos };
  }

  async addAvatars(videos) {
    const ids = [...new Set(videos.map((v) => v.channelId).filter((id) => /^UC[\w-]{22}$/.test(id)))];
    const map = {};
    for (const s of this.cache.data.subs || []) map[s.channelId] = s.avatar;
    const need = ids.filter((id) => !map[id]);
    for (let i = 0; i < need.length; i += 50) {
      const json = await this.api('channels', { part: 'snippet', id: need.slice(i, i + 50).join(','), maxResults: '50' });
      for (const ch of json.items || []) map[ch.id] = ch.snippet?.thumbnails?.default?.url || '';
    }
    return videos.map((v) => ({ ...v, channelAvatar: v.channelAvatar || map[v.channelId] || '' }));
  }

  // ---- channel page ------------------------------------------------------------

  async channel(channelId, { page = null, hideShorts = true } = {}) {
    const subscribed = (this.cache.data.subs || []).some((s) => s.channelId === channelId);
    if (this.auth.isSignedIn()) {
      let info = null;
      if (!page) {
        const json = await this.api('channels', { part: 'snippet,statistics,brandingSettings', id: channelId });
        const ch = json.items?.[0];
        if (!ch) throw new Error('Channel not found.');
        const banner = ch.brandingSettings?.image?.bannerExternalUrl;
        info = {
          id: channelId,
          title: ch.snippet.title,
          handle: ch.snippet.customUrl || '',
          description: ch.snippet.description || '',
          avatar: ch.snippet.thumbnails?.medium?.url || ch.snippet.thumbnails?.default?.url || '',
          banner: banner ? `${banner}=w1707-fcrop64=1,00005a57ffffa5a8-k-c0xffffffff-no-nd-rj` : '',
          subscribers: ch.statistics?.hiddenSubscriberCount ? null : Number(ch.statistics?.subscriberCount || 0),
          videoCount: Number(ch.statistics?.videoCount || 0),
          subscribed,
        };
      }
      const { items, nextPageToken } = await this.uploadsViaApi(channelId, 50, page || undefined);
      const avatar = info?.avatar || '';
      let { videos } = await this.enrich(items.map((v) => ({ ...v, channelAvatar: avatar })));
      videos = videos.filter((v) => v.live !== 'upcoming' && (!hideShorts || !isShort(v)));
      return { info, videos, next: nextPageToken };
    }

    // Not signed in: let yt-dlp read the channel page.
    const start = Number(page) || 1;
    const end = start + 29;
    const json = await this.tools.json([
      `https://www.youtube.com/channel/${channelId}/videos`,
      '--flat-playlist', '-J', '--playlist-start', String(start), '--playlist-end', String(end),
    ], 90000);
    const thumbs = json.thumbnails || [];
    const avatar = thumbs.find((t) => t.id === 'avatar_uncropped')?.url || '';
    const info = start === 1 ? {
      id: channelId,
      title: json.channel || json.uploader || json.title || '',
      handle: json.uploader_id || '',
      description: json.description || '',
      avatar,
      banner: thumbs.find((t) => t.id === 'banner_uncropped')?.url || '',
      subscribers: json.channel_follower_count ?? null,
      videoCount: null,
      subscribed,
    } : null;
    const entries = (json.entries || []).filter((e) => isVideoId(e.id));
    const videos = entries.map((e) => ({
      id: e.id,
      title: e.title || '',
      channelId,
      channelTitle: json.channel || json.uploader || '',
      channelAvatar: avatar,
      duration: e.duration != null ? Math.round(e.duration) : null,
      views: e.view_count ?? null,
      publishedAt: e.timestamp ? new Date(e.timestamp * 1000).toISOString() : null,
      thumbnail: hq(e.id),
      description: (e.description || '').slice(0, 500),
    })).filter((v) => !hideShorts || !isShort(v));
    return { info, videos, next: entries.length >= 30 ? String(end + 1) : null };
  }
}

function isShort(v) {
  return v.isShortUrl || (v.duration != null && v.duration <= 60);
}

function parseDuration(iso) {
  if (!iso) return null;
  const m = /P(?:(\d+)D)?T?(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/.exec(iso);
  if (!m) return null;
  const [, d = 0, h = 0, mi = 0, s = 0] = m.map((x) => Number(x) || 0);
  return d * 86400 + h * 3600 + mi * 60 + s;
}

async function mapLimit(items, limit, fn) {
  let i = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (i < items.length) await fn(items[i++]);
  });
  await Promise.all(workers);
}

module.exports = { YouTube, parseDuration };
