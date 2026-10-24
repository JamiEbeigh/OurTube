# OurTube

A desktop app (Electron + React) that shows your YouTube subscriptions as a home feed and **downloads every video you watch** to your computer, using the open-source [yt-dlp](https://github.com/yt-dlp/yt-dlp).

- **Feed:** newest uploads from the channels you subscribe to, in chronological order, with filter and refresh.
- **Search:** search all of YouTube from the sidebar (press `/` or Cmd/Ctrl+K). It runs through yt-dlp and uses no API quota.
- **Your playlists:** your YouTube playlists (and Liked videos) are listed in the sidebar. Open one to browse it, then **Download all → Videos** or **Download all → Audio only** to save the whole thing for offline use. **Check for new videos** fetches anything added since. YouTube's API doesn't give apps access to your Watch Later list, so it can't be shown.
- **Music:** pick **Download audio** from any video's ⋮ menu (or the player) to save just the sound. Tracks go to `Music/OurTube` as M4A (or MP3, in Settings) with cover art and title/artist tags, and play from the **Music** page with a player bar that keeps going while you browse.
- **Channel pages:** click a channel name or avatar on any card, or in the player, to see that channel's uploads.
- **Click a video:** a toast shows the download progress and the player opens once it's ready. If something is already playing, the video is queued instead, and the toast's ⋮ menu offers **Play now** or **Play when download finishes**.
- **Player:** custom controls (minimize top-left, close top-right, seek, volume, speed, fullscreen) plus keyboard shortcuts: space/k play-pause, ←/→ 5 s, j/l 10 s, m mute, f fullscreen, Esc minimize.
- **⋮ menu on every card:**
  - **Add to Watch Later**: downloads in the background and saves it to the Watch Later playlist.
  - **Add to queue**: starts downloading now and plays automatically after the current video.
- **Closing a video** asks whether to **delete the file** or **keep it in the Downloaded playlist**, with a **Remember my decision** checkbox (changeable in Settings).
- **Quitting with videos still in the queue** asks whether to **add them to Watch Later** or **delete the files**.
- **Settings page** for your own Google credentials, a built-in step-by-step setup guide, download folder, quality, and tool updates.

## Requirements

- [Node.js](https://nodejs.org) 18 or newer (only needed to run or build from source)
- Windows 10+, macOS 11+, or a 64-bit Linux desktop

## Run it

```bash
npm install
npm start          # builds the UI and opens the app
```

For development with hot reload: `npm run dev`.

To build an installer for your OS (`.exe`, `.dmg` or `.AppImage` in `release/`): `npm run dist`.

## First-time setup (about 5 minutes)

OurTube needs **one** key: a free Google OAuth client that lets it read your subscriptions. The same guide below is built into **Settings → "How do I get a Client ID and secret?"**, with clickable links.

1. **Create a project.** Go to <https://console.cloud.google.com/projectcreate>, name it (e.g. `OurTube`), and click **Create**. Make sure it's selected in the project picker at the top.
2. **Enable the API.** Open <https://console.cloud.google.com/apis/library/youtube.googleapis.com> and click **Enable**.
3. **Set up the sign-in screen.** Open <https://console.cloud.google.com/auth/overview> and click **Get started**. Enter an app name and your email, choose **External** for Audience, add your contact email, agree, and click **Create**.
4. **Add yourself as a test user.** Go to <https://console.cloud.google.com/auth/audience> → **Test users** → **Add users**, then enter your Gmail address.
5. **Create the client.** Go to <https://console.cloud.google.com/auth/clients> → **Create client** → Application type **Desktop app** → **Create**.
   ⚠️ Google shows the **client secret only once**. Click **Download JSON** before closing the dialog.
6. **In OurTube:** Settings → **Import downloaded JSON** (or paste the Client ID and secret and click **Save**) → **Sign in with Google**.
7. Your browser shows *"Google hasn't verified this app."* That's expected for your own private app. Click **Continue** and allow access.

**Notes**
- While the app is in "Testing" mode, Google expires the sign-in every **7 days**; just sign in again. To stop that, click **Publish app** on the Audience page (the unverified warning stays, but sign-ins stop expiring).
- Only the read-only scope `youtube.readonly` is requested.
- Quota: 10,000 free units/day. Upload lists come from YouTube's free public RSS feeds. If a channel's feed fails after 3 tries, OurTube asks the API instead (1 unit), and if that fails too it shows that channel's videos from the last good refresh. The channel list is cached for 6 hours and video details are cached per video, so a typical refresh costs only a few units. Hover the channel count above the feed to see how each channel was loaded.

## Download tools (installed automatically)

You don't need to install anything by hand. On the first download OurTube fetches these official open-source builds into its own data folder:

| Tool | Why | Source |
|---|---|---|
| yt-dlp | Downloads the video | github.com/yt-dlp/yt-dlp releases |
| Deno | JavaScript runtime that yt-dlp now needs for full YouTube support | github.com/denoland/deno releases |
| FFmpeg | Joins the separate video and audio streams into one MP4 | bundled via the `ffmpeg-static` npm package |

If downloads start failing, open **Settings → Download tools → Update to latest**, since YouTube changes often. If yt-dlp reports "Sign in to confirm you're not a bot", or you need age-restricted videos, set **Advanced → Use cookies from browser**.

## How files are handled

- Audio tracks are saved as `<title> [<video id>].m4a` in your music folder (default: `Music/OurTube`).
- Videos from a playlist saved for offline stay with that playlist: closing one doesn't ask to delete it. **Remove download** on the playlist page offers to keep or delete the files.
- Videos are saved as `<video id>.mp4` in your download folder (default: `Videos/OurTube`; an existing `Videos/TubeDeck` folder keeps being used).
- Watch Later downloads run in the background (default 2 at a time). Clicked and queued videos always start immediately.
- Interrupted downloads resume on next launch.
- If the app is closed while a video is open, that video is put in Downloaded on next launch, or deleted if your after-watch setting is "Delete".

## Where data is stored

Settings, the library index and the encrypted sign-in token live in the app's data folder (**Settings → Advanced → Open app data folder**):

- `settings.json`: your preferences and Google client credentials
- `library.json`: playlists, queue and downloaded-file index
- `tokens.bin`: Google sign-in token, encrypted with your OS keychain where available
- `bin/`: yt-dlp and Deno

## Project layout

```
electron/
  main.js       window, IPC, media:// streaming protocol, quit prompt
  preload.js    safe bridge exposed to the UI as window.api
  auth.js       Google OAuth (loopback redirect + PKCE, system browser)
  youtube.js    subscriptions + RSS feed + video details
  library.js    playlists, queue, yt-dlp download workers
  tools.js      finds / installs yt-dlp, Deno, FFmpeg
  store.js      JSON persistence and encrypted secrets
src/
  App.jsx       app state, playback and close/quit logic
  components/   Feed, VideoCard, KebabMenu, Player, Library, Settings, SetupGuide, Modals
```

## Legal

Downloading may be restricted by YouTube's Terms of Service and by copyright law where you live. Use OurTube for content you have the right to download, such as for personal offline viewing where permitted.
