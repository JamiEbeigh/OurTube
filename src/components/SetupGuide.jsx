// Step-by-step instructions for creating the Google OAuth "Desktop app" client.
export default function SetupGuide({ open: openLink }) {
  const L = ({ href, children }) => (
    <a href={href} onClick={(e) => { e.preventDefault(); openLink(href); }}>{children}</a>
  );
  return (
    <div className="guide">
      <p className="muted">
        OurTube reads your subscriptions through Google’s official YouTube API. Google requires every app to have its own
        credentials, so you create a free personal “OAuth client” once. No billing or credit card is needed. Allow about 5 minutes.
      </p>

      <ol className="steps">
        <li>
          <h4>Create a Google Cloud project</h4>
          <p>Open <L href="https://console.cloud.google.com/projectcreate">Google Cloud → New project</L>, sign in with the
            same Google account you use for YouTube, name it something like <code>OurTube</code>, and click <b>Create</b>.
            Make sure the new project is selected in the project picker at the top of the page.</p>
        </li>
        <li>
          <h4>Turn on the YouTube Data API v3</h4>
          <p>Open the <L href="https://console.cloud.google.com/apis/library/youtube.googleapis.com">YouTube Data API v3 page</L> and
            click <b>Enable</b>.</p>
        </li>
        <li>
          <h4>Set up the sign-in screen</h4>
          <p>Open <L href="https://console.cloud.google.com/auth/overview">Google Auth Platform</L> and click <b>Get started</b>.</p>
          <ul>
            <li><b>App information:</b> any app name (e.g. OurTube) and your email as the support email.</li>
            <li><b>Audience:</b> choose <b>External</b>.</li>
            <li><b>Contact information:</b> your email. Agree to the policy, then click <b>Create</b>.</li>
          </ul>
        </li>
        <li>
          <h4>Add yourself as a test user</h4>
          <p>Go to <L href="https://console.cloud.google.com/auth/audience">Audience</L>, scroll to <b>Test users</b>, click
            <b> Add users</b>, enter your own Gmail address, and save. Only listed test users can sign in while the app is in “Testing”.</p>
        </li>
        <li>
          <h4>Create the Desktop app client</h4>
          <p>Go to <L href="https://console.cloud.google.com/auth/clients">Clients</L> → <b>Create client</b>. Set
            <b> Application type</b> to <b>Desktop app</b> (not “Web application”), give it a name, and click <b>Create</b>.</p>
          <p className="callout">Google shows the <b>Client secret</b> only once, right after creation. Click <b>Download JSON</b> before closing
            that dialog. If you lose it, open the client and add a new secret.</p>
        </li>
        <li>
          <h4>Paste it into OurTube</h4>
          <p>Use <b>Import downloaded JSON</b> above (easiest), or copy the Client ID and Client secret into the fields and click
            <b> Save</b>. Then click <b>Sign in with Google</b>.</p>
        </li>
        <li>
          <h4>Approve the sign-in</h4>
          <p>Your browser opens Google’s sign-in. You’ll see <i>“Google hasn’t verified this app”</i>. That’s expected, because it’s your own
            private app. Click <b>Continue</b>, allow read-only YouTube access, and come back here.</p>
        </li>
      </ol>

      <div className="guide-notes">
        <h4>Good to know</h4>
        <ul>
          <li><b>Weekly re-sign-in:</b> while your app is in “Testing”, Google expires the sign-in after 7 days. Just click Sign in again.
            To avoid that, click <b>Publish app</b> on the Audience page. You’ll still see the “unverified” warning, but sign-ins won’t expire.</li>
          <li><b>Read-only:</b> OurTube only asks for <code>youtube.readonly</code>. It can’t post, comment, or change anything on your account.</li>
          <li><b>Free quota:</b> Google gives each project 10,000 API units per day. A feed refresh costs roughly 1 unit per 50
            subscriptions plus 1 per 50 videos, and the channel list is cached for 6 hours. Video lists come from YouTube’s free public RSS feeds.</li>
          <li><b>Where things are stored:</b> your keys and settings stay on this computer. The sign-in token is encrypted with your OS keychain when available.</li>
        </ul>
      </div>
    </div>
  );
}
