/**
 * Cloud Storage Service
 * Supports Google Drive and OneDrive via their REST APIs.
 * Files are stored in the user's own cloud account — the app only stores
 * encrypted OAuth tokens and a file-ID reference, so server storage cost is minimal.
 *
 * Environment variables required:
 *   GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REDIRECT_URI
 *   ONEDRIVE_CLIENT_ID, ONEDRIVE_CLIENT_SECRET, ONEDRIVE_REDIRECT_URI
 *   CLOUD_ENCRYPTION_KEY  — 64-character hex string (32 bytes for AES-256)
 */

import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { prisma } from '../lib/prisma';
import { logger } from '../lib/logger';

// ─── Token encryption (AES-256-GCM) ──────────────────────────────────────────

function getEncryptionKey(): Buffer {
  const hex = process.env.CLOUD_ENCRYPTION_KEY || '';
  if (hex.length < 64) {
    // Derive key from JWT_SECRET as fallback (not ideal for production)
    return crypto.createHash('sha256').update(process.env.JWT_SECRET || 'dev-key').digest();
  }
  return Buffer.from(hex.slice(0, 64), 'hex');
}

export function encryptToken(plaintext: string): string {
  const key = getEncryptionKey();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();
  // Format: iv(24):authTag(32):ciphertext(hex)
  return `${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted.toString('hex')}`;
}

export function decryptToken(encoded: string): string {
  const parts = encoded.split(':');
  if (parts.length !== 3) throw new Error('Invalid encrypted token format');
  const [ivHex, authTagHex, ciphertextHex] = parts;
  const key = getEncryptionKey();
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, Buffer.from(ivHex, 'hex'));
  decipher.setAuthTag(Buffer.from(authTagHex, 'hex'));
  const decrypted = Buffer.concat([
    decipher.update(Buffer.from(ciphertextHex, 'hex')),
    decipher.final(),
  ]);
  return decrypted.toString('utf8');
}

// ─── Google Drive ─────────────────────────────────────────────────────────────

export function getGoogleAuthUrl(state: string): string {
  const params = new URLSearchParams({
    client_id: process.env.GOOGLE_CLIENT_ID!,
    redirect_uri: process.env.GOOGLE_REDIRECT_URI!,
    response_type: 'code',
    scope: 'https://www.googleapis.com/auth/drive.file',
    access_type: 'offline',
    prompt: 'consent',
    state,
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${params}`;
}

export async function exchangeGoogleCode(code: string): Promise<{
  access_token: string;
  refresh_token?: string;
  expires_in: number;
}> {
  const resp = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: process.env.GOOGLE_CLIENT_ID!,
      client_secret: process.env.GOOGLE_CLIENT_SECRET!,
      redirect_uri: process.env.GOOGLE_REDIRECT_URI!,
      grant_type: 'authorization_code',
    }),
  });
  if (!resp.ok) throw new Error(`Google token exchange failed: ${await resp.text()}`);
  return resp.json();
}

async function refreshGoogleToken(refreshToken: string): Promise<{ access_token: string; expires_in: number }> {
  const resp = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      refresh_token: refreshToken,
      client_id: process.env.GOOGLE_CLIENT_ID!,
      client_secret: process.env.GOOGLE_CLIENT_SECRET!,
      grant_type: 'refresh_token',
    }),
  });
  if (!resp.ok) throw new Error(`Google token refresh failed: ${await resp.text()}`);
  return resp.json();
}

async function getValidGoogleToken(userId: string): Promise<string> {
  const conn = await prisma.cloudConnection.findUnique({
    where: { userId_provider: { userId, provider: 'GOOGLE_DRIVE' } },
  });
  if (!conn) throw new Error('Google Drive not connected');

  const accessToken = decryptToken(conn.accessToken);

  // Refresh if expiring within 5 minutes
  if (conn.expiresAt && conn.expiresAt.getTime() - Date.now() < 5 * 60 * 1000) {
    if (!conn.refreshToken) throw new Error('No refresh token available — reconnect Google Drive');
    const refreshed = await refreshGoogleToken(decryptToken(conn.refreshToken));
    await prisma.cloudConnection.update({
      where: { id: conn.id },
      data: {
        accessToken: encryptToken(refreshed.access_token),
        expiresAt: new Date(Date.now() + refreshed.expires_in * 1000),
      },
    });
    return refreshed.access_token;
  }

  return accessToken;
}

/** Ensure a NeuroStudy folder exists in Google Drive, return its ID */
async function getOrCreateGoogleFolder(accessToken: string, existingFolderId?: string | null): Promise<string> {
  // Check if cached folder still exists
  if (existingFolderId) {
    const check = await fetch(
      `https://www.googleapis.com/drive/v3/files/${existingFolderId}?fields=id,trashed`,
      { headers: { Authorization: `Bearer ${accessToken}` } }
    );
    if (check.ok) {
      const data = await check.json();
      if (!data.trashed) return existingFolderId;
    }
  }

  // Search for existing folder
  const search = await fetch(
    `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent("name='NeuroStudy' and mimeType='application/vnd.google-apps.folder' and trashed=false")}&fields=files(id)`,
    { headers: { Authorization: `Bearer ${accessToken}` } }
  );
  const searchData = await search.json();
  if (searchData.files?.length > 0) return searchData.files[0].id;

  // Create folder
  const create = await fetch('https://www.googleapis.com/drive/v3/files', {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: 'NeuroStudy', mimeType: 'application/vnd.google-apps.folder' }),
  });
  const folder = await create.json();
  return folder.id as string;
}

export async function uploadToGoogleDrive(
  userId: string,
  filePath: string,
  filename: string,
  mimeType: string
): Promise<{ fileId: string; fileUrl: string }> {
  const accessToken = await getValidGoogleToken(userId);

  const conn = await prisma.cloudConnection.findUnique({
    where: { userId_provider: { userId, provider: 'GOOGLE_DRIVE' } },
  });
  const folderId = await getOrCreateGoogleFolder(accessToken, conn?.folderId);

  // Save folder ID for future use
  if (conn && conn.folderId !== folderId) {
    await prisma.cloudConnection.update({ where: { id: conn.id }, data: { folderId } });
  }

  // Multipart upload
  const fileBuffer = fs.readFileSync(filePath);
  const boundary = `boundary_${crypto.randomBytes(8).toString('hex')}`;
  const metadata = JSON.stringify({ name: filename, parents: [folderId] });

  const body = Buffer.concat([
    Buffer.from(`--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n`),
    Buffer.from(metadata),
    Buffer.from(`\r\n--${boundary}\r\nContent-Type: ${mimeType}\r\n\r\n`),
    fileBuffer,
    Buffer.from(`\r\n--${boundary}--`),
  ]);

  const uploadResp = await fetch(
    'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,webViewLink',
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': `multipart/related; boundary=${boundary}`,
      },
      body,
    }
  );

  if (!uploadResp.ok) {
    const err = await uploadResp.text();
    throw new Error(`Google Drive upload failed: ${err}`);
  }

  const uploaded = await uploadResp.json();
  const fileId = uploaded.id as string;

  // Make file readable by anyone with link (so web view works)
  await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}/permissions`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ role: 'reader', type: 'anyone' }),
  });

  const fileUrl = uploaded.webViewLink as string;
  logger.info('Uploaded to Google Drive', { userId, fileId, filename });
  return { fileId, fileUrl };
}

export async function downloadFromGoogleDrive(
  userId: string,
  fileId: string,
  destPath: string
): Promise<void> {
  const accessToken = await getValidGoogleToken(userId);
  const resp = await fetch(
    `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`,
    { headers: { Authorization: `Bearer ${accessToken}` } }
  );
  if (!resp.ok) throw new Error(`Google Drive download failed: ${resp.status}`);
  const buffer = Buffer.from(await resp.arrayBuffer());
  fs.mkdirSync(path.dirname(destPath), { recursive: true });
  fs.writeFileSync(destPath, buffer);
}

// ─── OneDrive (Microsoft Graph) ───────────────────────────────────────────────

export function getOneDriveAuthUrl(state: string): string {
  const params = new URLSearchParams({
    client_id: process.env.ONEDRIVE_CLIENT_ID!,
    redirect_uri: process.env.ONEDRIVE_REDIRECT_URI!,
    response_type: 'code',
    scope: 'files.readwrite.appfolder offline_access',
    state,
  });
  return `https://login.microsoftonline.com/common/oauth2/v2.0/authorize?${params}`;
}

export async function exchangeOneDriveCode(code: string): Promise<{
  access_token: string;
  refresh_token?: string;
  expires_in: number;
}> {
  const resp = await fetch('https://login.microsoftonline.com/common/oauth2/v2.0/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: process.env.ONEDRIVE_CLIENT_ID!,
      client_secret: process.env.ONEDRIVE_CLIENT_SECRET!,
      redirect_uri: process.env.ONEDRIVE_REDIRECT_URI!,
      grant_type: 'authorization_code',
    }),
  });
  if (!resp.ok) throw new Error(`OneDrive token exchange failed: ${await resp.text()}`);
  return resp.json();
}

async function refreshOneDriveToken(refreshToken: string): Promise<{ access_token: string; expires_in: number }> {
  const resp = await fetch('https://login.microsoftonline.com/common/oauth2/v2.0/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      refresh_token: refreshToken,
      client_id: process.env.ONEDRIVE_CLIENT_ID!,
      client_secret: process.env.ONEDRIVE_CLIENT_SECRET!,
      grant_type: 'refresh_token',
    }),
  });
  if (!resp.ok) throw new Error(`OneDrive token refresh failed: ${await resp.text()}`);
  return resp.json();
}

async function getValidOneDriveToken(userId: string): Promise<string> {
  const conn = await prisma.cloudConnection.findUnique({
    where: { userId_provider: { userId, provider: 'ONE_DRIVE' } },
  });
  if (!conn) throw new Error('OneDrive not connected');

  const accessToken = decryptToken(conn.accessToken);

  if (conn.expiresAt && conn.expiresAt.getTime() - Date.now() < 5 * 60 * 1000) {
    if (!conn.refreshToken) throw new Error('No refresh token available — reconnect OneDrive');
    const refreshed = await refreshOneDriveToken(decryptToken(conn.refreshToken));
    await prisma.cloudConnection.update({
      where: { id: conn.id },
      data: {
        accessToken: encryptToken(refreshed.access_token),
        expiresAt: new Date(Date.now() + refreshed.expires_in * 1000),
      },
    });
    return refreshed.access_token;
  }

  return accessToken;
}

export async function uploadToOneDrive(
  userId: string,
  filePath: string,
  filename: string,
): Promise<{ fileId: string; fileUrl: string }> {
  const accessToken = await getValidOneDriveToken(userId);
  const fileBuffer = fs.readFileSync(filePath);

  // Upload to App Folder (special folder, no extra permissions needed)
  const uploadResp = await fetch(
    `https://graph.microsoft.com/v1.0/me/drive/special/approot:/${encodeURIComponent(filename)}:/content`,
    {
      method: 'PUT',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/octet-stream',
      },
      body: fileBuffer,
    }
  );

  if (!uploadResp.ok) {
    const err = await uploadResp.text();
    throw new Error(`OneDrive upload failed: ${err}`);
  }

  const uploaded = await uploadResp.json();
  const fileId = uploaded.id as string;

  // Create sharing link
  const shareResp = await fetch(
    `https://graph.microsoft.com/v1.0/me/drive/items/${fileId}/createLink`,
    {
      method: 'POST',
      headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'view', scope: 'anonymous' }),
    }
  );

  let fileUrl = uploaded.webUrl as string;
  if (shareResp.ok) {
    const shareData = await shareResp.json();
    fileUrl = shareData.link?.webUrl || fileUrl;
  }

  logger.info('Uploaded to OneDrive', { userId, fileId, filename });
  return { fileId, fileUrl };
}

export async function downloadFromOneDrive(
  userId: string,
  fileId: string,
  destPath: string
): Promise<void> {
  const accessToken = await getValidOneDriveToken(userId);
  const resp = await fetch(
    `https://graph.microsoft.com/v1.0/me/drive/items/${fileId}/content`,
    { headers: { Authorization: `Bearer ${accessToken}` } }
  );
  if (!resp.ok) throw new Error(`OneDrive download failed: ${resp.status}`);
  const buffer = Buffer.from(await resp.arrayBuffer());
  fs.mkdirSync(path.dirname(destPath), { recursive: true });
  fs.writeFileSync(destPath, buffer);
}

// ─── Generic helper ───────────────────────────────────────────────────────────

/** Returns truthy provider if user has at least one cloud connection */
export async function getUserCloudProvider(
  userId: string
): Promise<'GOOGLE_DRIVE' | 'ONE_DRIVE' | null> {
  const connections = await prisma.cloudConnection.findMany({
    where: { userId },
    select: { provider: true },
    orderBy: { createdAt: 'asc' }, // use first connected
  });
  if (connections.length === 0) return null;
  // Prefer Google Drive
  const google = connections.find((c) => c.provider === 'GOOGLE_DRIVE');
  if (google) return 'GOOGLE_DRIVE';
  return connections[0].provider as 'GOOGLE_DRIVE' | 'ONE_DRIVE';
}

export async function uploadToCloud(
  userId: string,
  provider: 'GOOGLE_DRIVE' | 'ONE_DRIVE',
  filePath: string,
  filename: string,
  mimeType: string
): Promise<{ fileId: string; fileUrl: string }> {
  if (provider === 'GOOGLE_DRIVE') return uploadToGoogleDrive(userId, filePath, filename, mimeType);
  return uploadToOneDrive(userId, filePath, filename);
}

export async function downloadFromCloud(
  userId: string,
  provider: 'GOOGLE_DRIVE' | 'ONE_DRIVE',
  fileId: string,
  destPath: string
): Promise<void> {
  if (provider === 'GOOGLE_DRIVE') return downloadFromGoogleDrive(userId, fileId, destPath);
  return downloadFromOneDrive(userId, fileId, destPath);
}
