import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import open from 'open';
import { google } from 'googleapis';
import { config } from '../src/config.js';

if (!config.googleDrive.oauthClientFile) {
  console.error('Set GOOGLE_OAUTH_CLIENT_FILE in .env to the downloaded Desktop app OAuth client JSON file.');
  process.exit(1);
}

const clientFile = path.resolve(config.googleDrive.oauthClientFile);
if (!fs.existsSync(clientFile)) {
  console.error(`OAuth client file not found: ${clientFile}`);
  process.exit(1);
}

const clientData = JSON.parse(fs.readFileSync(clientFile, 'utf8'));
const client = clientData.installed || clientData.web;
if (!client?.client_id || !client?.client_secret) {
  console.error('The OAuth client JSON must be a Google Desktop app credential.');
  process.exit(1);
}

const server = http.createServer();
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
const address = server.address();
const redirectUri = `http://127.0.0.1:${address.port}/oauth2callback`;
const auth = new google.auth.OAuth2(client.client_id, client.client_secret, redirectUri);

const authorizationUrl = auth.generateAuthUrl({
  access_type: 'offline',
  prompt: 'consent select_account',
  scope: ['https://www.googleapis.com/auth/drive']
});

console.log('Opening Google authorization. Choose the account that owns the destination Drive folder.');
await open(authorizationUrl);

const code = await new Promise((resolve, reject) => {
  server.on('request', (req, res) => {
    try {
      const requestUrl = new URL(req.url, redirectUri);
      if (requestUrl.pathname !== '/oauth2callback') return;
      const error = requestUrl.searchParams.get('error');
      if (error) throw new Error(error);
      const nextCode = requestUrl.searchParams.get('code');
      if (!nextCode) throw new Error('Google did not return an authorization code.');
      res.end('Google Drive connected. You can close this window.');
      resolve(nextCode);
    } catch (error) {
      res.statusCode = 400;
      res.end('Google Drive authorization failed. Return to the terminal for details.');
      reject(error);
    } finally {
      server.close();
    }
  });
});

const { tokens } = await auth.getToken({ code, redirect_uri: redirectUri });
if (!tokens.refresh_token) {
  console.error('Google did not return a refresh token. Revoke the app connection in your Google Account and run this command again.');
  process.exit(1);
}

const tokenFile = path.resolve(config.googleDrive.oauthTokenFile);
fs.mkdirSync(path.dirname(tokenFile), { recursive: true });
fs.writeFileSync(tokenFile, JSON.stringify(tokens, null, 2), { mode: 0o600 });
fs.chmodSync(tokenFile, 0o600);
console.log(`Google Drive authorization saved to ${tokenFile}`);
