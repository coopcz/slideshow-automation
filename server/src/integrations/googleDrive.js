import fs from 'node:fs';
import path from 'node:path';
import { google } from 'googleapis';
import { config } from '../config.js';

function credentials() {
  if (config.googleDrive.serviceAccountFile) {
    const credentialPath = path.resolve(config.googleDrive.serviceAccountFile);
    if (fs.existsSync(credentialPath)) return JSON.parse(fs.readFileSync(credentialPath, 'utf8'));
  }
  if (config.googleDrive.serviceAccountJson) {
    try {
      return JSON.parse(config.googleDrive.serviceAccountJson);
    } catch {
      throw new Error('Google Drive credentials are invalid. Set GOOGLE_SERVICE_ACCOUNT_FILE to an existing JSON key file, or set GOOGLE_SERVICE_ACCOUNT_JSON to valid JSON.');
    }
  }
  throw new Error('Google Drive credentials are not configured.');
}

function oauthConfigured() {
  return Boolean(
    config.googleDrive.oauthClientFile
    && fs.existsSync(path.resolve(config.googleDrive.oauthClientFile))
    && fs.existsSync(path.resolve(config.googleDrive.oauthTokenFile))
  );
}

export function googleDriveConfigured() {
  return Boolean(config.googleDrive.folderId && (oauthConfigured() || config.googleDrive.serviceAccountJson || config.googleDrive.serviceAccountFile));
}

function safeName(value, fallback = 'Slideshow') {
  const name = String(value || '').replace(/[\\/:*?"<>|]/g, ' ').replace(/\s+/g, ' ').trim();
  return name || fallback;
}

async function driveClient() {
  if (oauthConfigured()) {
    const clientData = JSON.parse(fs.readFileSync(path.resolve(config.googleDrive.oauthClientFile), 'utf8'));
    const client = clientData.installed || clientData.web;
    if (!client?.client_id || !client?.client_secret) throw new Error('The Google OAuth client file is invalid. Download a Desktop app OAuth client JSON file.');
    const auth = new google.auth.OAuth2(client.client_id, client.client_secret, client.redirect_uris?.[0]);
    auth.setCredentials(JSON.parse(fs.readFileSync(path.resolve(config.googleDrive.oauthTokenFile), 'utf8')));
    return google.drive({ version: 'v3', auth });
  }
  const auth = new google.auth.GoogleAuth({
    credentials: credentials(),
    scopes: ['https://www.googleapis.com/auth/drive']
  });
  return google.drive({ version: 'v3', auth });
}

async function uploadFile(drive, filePath, name, parentId, mimeType) {
  return drive.files.create({
    requestBody: { name, parents: [parentId] },
    media: { mimeType, body: fs.createReadStream(filePath) },
    fields: 'id,name,webViewLink',
    supportsAllDrives: true
  });
}

function driveQueryValue(value) {
  return String(value || '').replaceAll('\\', '\\\\').replaceAll("'", "\\'");
}

async function findExistingFolder(drive, slideshowId, folderName) {
  const parent = driveQueryValue(config.googleDrive.folderId);
  const id = driveQueryValue(slideshowId);
  const name = driveQueryValue(folderName);
  const byIdentity = await drive.files.list({
    q: `'${parent}' in parents and trashed = false and mimeType = 'application/vnd.google-apps.folder' and appProperties has { key='slideshowId' and value='${id}' }`,
    fields: 'files(id,name,webViewLink,createdTime)',
    orderBy: 'createdTime',
    pageSize: 10,
    supportsAllDrives: true,
    includeItemsFromAllDrives: true
  });
  if (byIdentity.data.files?.length) return byIdentity.data.files[0];

  const byName = await drive.files.list({
    q: `'${parent}' in parents and trashed = false and mimeType = 'application/vnd.google-apps.folder' and name = '${name}'`,
    fields: 'files(id,name,webViewLink,createdTime,appProperties)',
    orderBy: 'createdTime',
    pageSize: 10,
    supportsAllDrives: true,
    includeItemsFromAllDrives: true
  });
  return byName.data.files?.find((file) => !file.appProperties?.slideshowId) || null;
}

async function clearFolder(drive, folderId) {
  let pageToken;
  do {
    const children = await drive.files.list({
      q: `'${driveQueryValue(folderId)}' in parents and trashed = false`,
      fields: 'nextPageToken,files(id)',
      pageSize: 1000,
      pageToken,
      supportsAllDrives: true,
      includeItemsFromAllDrives: true
    });
    for (const child of children.data.files || []) {
      await drive.files.delete({ fileId: child.id, supportsAllDrives: true });
    }
    pageToken = children.data.nextPageToken || undefined;
  } while (pageToken);
}

export async function uploadRenderedSlideshow({ slideshow, outputPath, framePaths = [] }) {
  if (!googleDriveConfigured()) return null;
  const drive = await driveClient();
  const folderName = safeName(slideshow.title);

  if (framePaths.length && !slideshow.settings.export_as_video) {
    const existing = await findExistingFolder(drive, slideshow.id, folderName);
    const folder = existing
      ? { data: existing }
      : await drive.files.create({
        requestBody: {
          name: folderName,
          mimeType: 'application/vnd.google-apps.folder',
          parents: [config.googleDrive.folderId],
          appProperties: { slideshowId: slideshow.id }
        },
        fields: 'id,name,webViewLink',
        supportsAllDrives: true
      });
    try {
      if (existing) {
        await drive.files.update({
          fileId: folder.data.id,
          requestBody: { name: folderName, appProperties: { slideshowId: slideshow.id } },
          supportsAllDrives: true
        });
        await clearFolder(drive, folder.data.id);
      }
      for (let index = 0; index < framePaths.length; index += 1) {
        await uploadFile(drive, framePaths[index], `slide_${String(index + 1).padStart(2, '0')}.png`, folder.data.id, 'image/png');
      }
    } catch (error) {
      if (!existing) await drive.files.delete({ fileId: folder.data.id, supportsAllDrives: true }).catch(() => {});
      throw error;
    }
    return { id: folder.data.id, url: folder.data.webViewLink || `https://drive.google.com/drive/folders/${folder.data.id}` };
  }

  const mimeType = slideshow.settings.export_as_video ? 'video/mp4' : 'application/zip';
  const extension = slideshow.settings.export_as_video ? '.mp4' : '.zip';
  const uploaded = await uploadFile(drive, outputPath, `${folderName}${extension}`, config.googleDrive.folderId, mimeType);
  return { id: uploaded.data.id, url: uploaded.data.webViewLink || `https://drive.google.com/file/d/${uploaded.data.id}/view` };
}
