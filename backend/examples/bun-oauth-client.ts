// RUN: PANEL_URL=http://localhost:3000 OAUTH_CLIENT_ID=<id> bun run backend/examples/bun-oauth-client.ts
import crypto from 'crypto';

const PANEL_URL = process.env.PANEL_URL || 'http://localhost:3000';
const CLIENT_ID = process.env.OAUTH_CLIENT_ID;
const REDIRECT_URI = process.env.OAUTH_REDIRECT_URI || 'http://localhost:3001/callback';
const PORT = Number(new URL(REDIRECT_URI).port || 3001);

if (!CLIENT_ID) {
  console.error('Missing OAUTH_CLIENT_ID. Set env OAUTH_CLIENT_ID.');
  process.exit(1);
}

function randomString(length = 64) {
  return crypto.randomBytes(length).toString('hex').slice(0, length);
}

function base64UrlEncode(buffer) {
  return buffer.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

const codeVerifier = base64UrlEncode(crypto.randomBytes(64));
const codeChallenge = base64UrlEncode(crypto.createHash('sha256').update(codeVerifier).digest());
const state = randomString(16);
const scope = 'openid profile email';

const authUrl = `${PANEL_URL}/api/oauth/authorize?` + new URLSearchParams({
  response_type: 'code',
  client_id: CLIENT_ID,
  redirect_uri: REDIRECT_URI,
  scope,
  state,
  code_challenge: codeChallenge,
  code_challenge_method: 'S256',
}).toString();

console.log('\n=== EcliPanel OAuth PKCE flow (example) ===\n');
console.log('1) Open this URL in your browser and authorize the app:');
console.log(authUrl);
console.log('\n2) Once authorized, ecli panel will redirect to:', REDIRECT_URI);
console.log('   The local server below will catch the code and continue the flow.\n');

const server = Bun.serve({
  port: PORT,
  async fetch(request) {
    const url = new URL(request.url);

    if (url.pathname !== new URL(REDIRECT_URI).pathname) {
      return new Response('Not found', { status: 404 });
    }

    const params = url.searchParams;
    const code = params.get('code');
    const incomingState = params.get('state');

    if (!code || incomingState !== state) {
      return new Response('OAuth callback missing code or invalid state', { status: 400 });
    }

    console.log('✅ Received authorization code');

    try {
      const tokenResp = await fetch(`${PANEL_URL}/api/oauth/token`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          grant_type: 'authorization_code',
          client_id: CLIENT_ID,
          redirect_uri: REDIRECT_URI,
          code,
          code_verifier: codeVerifier,
        }),
      });

      const tokenData = await tokenResp.json();

      if (!tokenResp.ok || !tokenData.access_token) {
        console.error('Failed to get token', tokenData);
        return new Response('Token exchange failed. Check terminal log.', { status: 500 });
      }

      console.log('✅ Token exchange success');

      const userinfoResp = await fetch(`${PANEL_URL}/api/oauth/userinfo`, {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${tokenData.access_token}`,
        },
      });

      const userinfo = await userinfoResp.json();

      if (!userinfoResp.ok) {
        console.error('Failed to get userinfo', userinfo);
        return new Response('Failed to fetch user info. Check terminal log.', { status: 500 });
      }

      console.log('✅ /api/oauth/userinfo response:');
      console.log(JSON.stringify(userinfo, null, 2));

      const displayName = userinfo.displayName || `${userinfo.firstName || ''} ${userinfo.lastName || ''}`.trim() || 'N/A';
      const email = userinfo.email || 'N/A';

      const html = `
<html>
  <body>
    <h1>EcliPanel OAuth Result</h1>
    <p><strong>Display Name:</strong> ${displayName}</p>
    <p><strong>Email:</strong> ${email}</p>
    <pre>${JSON.stringify(userinfo, null, 2)}</pre>
    <p>You can close this window now.</p>
  </body>
</html>`;

      setTimeout(() => {
        console.log('Shutting down Bun server.');
        server.stop();
      }, 2000);

      return new Response(html, { status: 200, headers: { 'Content-Type': 'text/html' } });

    } catch (error) {
      console.error('OAuth flow error', error);
      return new Response('Unexpected error. See terminal output.', { status: 500 });
    }
  },
});

console.log(`Listening on http://localhost:${PORT}${new URL(REDIRECT_URI).pathname}`);