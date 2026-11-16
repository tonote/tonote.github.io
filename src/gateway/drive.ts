import { getAccessToken, invalidateAccessToken } from './gis';
import { syncSignal } from '../sync/session';
import type { DriveFile } from './driveTypes';

const DRIVE_BASE = 'https://www.googleapis.com/drive/v3';
const UPLOAD_BASE = 'https://www.googleapis.com/upload/drive/v3';
let nextRequestAt = 0;
export const driveMetrics = { requests: 0, quotaUnits: 0 };
function countRequest(url: string, method: string) {
  const parsed = new URL(url);
  const list = /\/(files|revisions)$/.test(parsed.pathname) && method === 'GET';
  driveMetrics.requests++;
  driveMetrics.quotaUnits += parsed.searchParams.get('alt') === 'media' ? 200 : method !== 'GET' ? 50 : list ? 100 : 5;
}

export class DriveError extends Error {
  status: number;
  url: string;

  constructor(status: number, message: string, url: string) {
    super(message);
    this.name = 'DriveError';
    this.status = status;
    this.url = url;
  }
}

export async function authedFetch(url: string, init?: RequestInit): Promise<Response> {
  const signal = init?.signal ?? syncSignal();
  const token = getAccessToken();
  if (!token) throw new DriveError(401, 'Not authenticated', url);

  const headers = new Headers(init?.headers);
  headers.set('Authorization', `Bearer ${token}`);

  // Bound request rate even for a large initial import; retries retain their abort signal.
  signal?.throwIfAborted();
  const slot = Math.max(Date.now(), nextRequestAt); nextRequestAt = slot + 150;
  if (slot > Date.now()) await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(done, slot - Date.now());
    function done() { signal?.removeEventListener('abort', abort); resolve(); }
    function abort() { clearTimeout(timer); reject(new DOMException('Session ended', 'AbortError')); }
    signal?.addEventListener('abort', abort, { once: true });
  });
  signal?.throwIfAborted();
  countRequest(url, init?.method ?? 'GET');
  const resp = await fetch(url, { ...init, headers, signal });

  if (!resp.ok) {
    if (resp.status === 401) invalidateAccessToken(token);
    let message = resp.statusText;
    try {
      const body = await resp.json();
      if (body?.error?.message) message = body.error.message;
    } catch {
      // Try text instead
      try {
        message = await resp.text();
      } catch {
        // Keep statusText
      }
    }
    throw new DriveError(resp.status, message, url);
  }

  return resp;
}

// ---- Folder operations ----

export async function findFolder(name: string): Promise<DriveFile | null> {
  const q = encodeURIComponent(`name='${name}' and trashed=false and mimeType='application/vnd.google-apps.folder'`);
  const url = `${DRIVE_BASE}/files?q=${q}&fields=nextPageToken,incompleteSearch,files(id,name,version,modifiedTime)`;
  const resp = await authedFetch(url);
  const data = await resp.json();
  if (data.incompleteSearch || data.nextPageToken || data.files?.length > 1) throw new Error('Ambiguous or incomplete Drive lookup');
  return data.files?.[0] ?? null;
}

export async function createFolder(name: string, id?: string): Promise<DriveFile> {
  const url = `${DRIVE_BASE}/files`;
  const resp = await authedFetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name, ...(id ? { id } : {}),
      mimeType: 'application/vnd.google-apps.folder',
    }),
  });
  return resp.json();
}

// ---- File operations ----

export async function findFileByName(name: string, folderId?: string): Promise<DriveFile | null> {
  let q = `name='${name}' and trashed=false`;
  if (folderId) q += ` and '${folderId}' in parents`;
  const encoded = encodeURIComponent(q);
  const url = `${DRIVE_BASE}/files?q=${encoded}&fields=nextPageToken,incompleteSearch,files(id,name,version,modifiedTime)`;
  const resp = await authedFetch(url);
  const data = await resp.json();
  if (data.incompleteSearch || data.nextPageToken || data.files?.length > 1) throw new Error('Ambiguous or incomplete Drive lookup');
  return data.files?.[0] ?? null;
}

export async function listChildren(folderId: string, namePrefix?: string): Promise<DriveFile[]> {
  let q = `'${folderId}' in parents and trashed=false`;
  if (namePrefix) q += ` and name contains '${namePrefix}'`;
  const encoded = encodeURIComponent(q);
  const files: DriveFile[] = [];
  let pageToken: string | undefined;
  do {
    const url = `${DRIVE_BASE}/files?q=${encoded}&fields=nextPageToken,incompleteSearch,files(id,name,version,modifiedTime)&pageSize=1000`
      + (pageToken ? `&pageToken=${encodeURIComponent(pageToken)}` : '');
    const resp = await authedFetch(url);
    const data = await resp.json();
    if (data.incompleteSearch) throw new DriveError(502, 'Incomplete Google Drive file listing', url);
    files.push(...(data.files ?? []));
    pageToken = data.nextPageToken;
  } while (pageToken);
  return files;
}

// ---- Download operations ----

export async function downloadJson<T>(fileId: string): Promise<T> {
  const url = `${DRIVE_BASE}/files/${fileId}?alt=media`;
  const resp = await authedFetch(url);
  return resp.json();
}

export async function downloadText(fileId: string): Promise<string> {
  const url = `${DRIVE_BASE}/files/${fileId}?alt=media`;
  const resp = await authedFetch(url);
  return resp.text();
}

// ---- Upload operations ----

export async function uploadJson(
  name: string,
  content: string,
  folderId: string,
  mimeType = 'application/json',
): Promise<DriveFile> {
  const boundary = '-------314159265358979323846';
  const metadata = JSON.stringify({
    name,
    parents: [folderId],
  });

  const body = [
    `--${boundary}`,
    'Content-Type: application/json; charset=UTF-8',
    '',
    metadata,
    `--${boundary}`,
    `Content-Type: ${mimeType}`,
    '',
    content,
    `--${boundary}--`,
    '',
  ].join('\r\n');

  const url = `${UPLOAD_BASE}/files?uploadType=multipart`;
  const resp = await authedFetch(url, {
    method: 'POST',
    headers: { 'Content-Type': `multipart/related; boundary=${boundary}` },
    body,
  });
  return resp.json();
}

export async function updateJson(
  fileId: string,
  content: string,
  mimeType = 'application/json',
): Promise<DriveFile> {
  const url = `${UPLOAD_BASE}/files/${fileId}?uploadType=media`;
  const resp = await authedFetch(url, {
    method: 'PATCH',
    headers: { 'Content-Type': mimeType },
    body: content,
  });
  return resp.json();
}

// ---- Delete operation ----

export async function deleteFile(fileId: string): Promise<void> {
  const url = `${DRIVE_BASE}/files/${fileId}`;
  await authedFetch(url, { method: 'DELETE' });
}

// ---- Optimistic concurrency helper ----

export async function getHeadRevisionId(fileId: string): Promise<string | undefined> {
  const url = `${DRIVE_BASE}/files/${fileId}?fields=headRevisionId`;
  const resp = await authedFetch(url);
  const data = await resp.json();
  return data.headRevisionId;
}

export async function downloadBlob(fileId: string): Promise<Blob> {
  return (await authedFetch(`${DRIVE_BASE}/files/${encodeURIComponent(fileId)}?alt=media`)).blob();
}

/** Resumable transport accepts large files without encoding binary data as text. */
export async function uploadBlob(name: string, blob: Blob, folderId: string): Promise<DriveFile> {
  const response = await authedFetch(`${UPLOAD_BASE}/files?uploadType=resumable`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Upload-Content-Type': blob.type || 'application/octet-stream' },
    body: JSON.stringify({ name, parents: [folderId] }),
  });
  const location = response.headers.get('Location');
  if (!location || new URL(location).origin !== 'https://www.googleapis.com') throw new Error('Invalid upload location');
  const uploaded = await authedFetch(location, {
    method: 'PUT',
    headers: { 'Content-Type': blob.type || 'application/octet-stream' },
    body: blob,
  });
  return uploaded.json();
}

export async function generateFileId(): Promise<string> {
  const data = await (await authedFetch(`${DRIVE_BASE}/files/generateIds?count=1&space=drive&type=files`)).json();
  if (typeof data.ids?.[0] !== 'string') throw new Error('Drive did not allocate a file ID');
  return data.ids[0];
}
export async function fileMetadata(id: string): Promise<DriveFile> {
  const response = await authedFetch(`${DRIVE_BASE}/files/${encodeURIComponent(id)}?fields=id,name,version,modifiedTime`);
  return { ...await response.json(), etag: response.headers.get('ETag') ?? undefined };
}
export async function readFile(id: string): Promise<{ text: string; etag?: string }> {
  const response = await authedFetch(`${DRIVE_BASE}/files/${encodeURIComponent(id)}?alt=media`);
  return { text: await response.text(), etag: response.headers.get('ETag') ?? undefined };
}
export async function writeDocument(name: string, text: string, folder: string, id: string, previous?: DriveFile): Promise<DriveFile> {
  if (previous) {
    const response = await authedFetch(`${UPLOAD_BASE}/files/${encodeURIComponent(id)}?uploadType=media&fields=id,name,version,modifiedTime`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json', ...(previous.etag ? { 'If-Match': previous.etag } : {}) }, body: text,
    });
    return { ...await response.json(), etag: response.headers.get('ETag') ?? undefined };
  }
  const boundary = `tonote-${crypto.randomUUID()}`;
  const body = `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify({ id, name, parents: [folder] })}\r\n--${boundary}\r\nContent-Type: application/json\r\n\r\n${text}\r\n--${boundary}--\r\n`;
  try {
    const response = await authedFetch(`${UPLOAD_BASE}/files?uploadType=multipart&fields=id,name,version,modifiedTime`, {
      method: 'POST', headers: { 'Content-Type': `multipart/related; boundary=${boundary}` }, body,
    });
    return { ...await response.json(), etag: response.headers.get('ETag') ?? undefined };
  } catch (error) {
    if (!(error instanceof DriveError) || error.status !== 409) throw error;
    const found = await readFile(id);
    if (JSON.stringify(JSON.parse(found.text)) !== JSON.stringify(JSON.parse(text))) throw new Error('Allocated Drive ID contains a different document');
    return fileMetadata(id);
  }
}
export async function renameFile(id: string, name: string): Promise<void> {
  await authedFetch(`${DRIVE_BASE}/files/${encodeURIComponent(id)}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name }) });
}
export async function uploadNamedBlob(id: string, name: string, blob: Blob, folder: string): Promise<DriveFile> {
  const response = await authedFetch(`${UPLOAD_BASE}/files?uploadType=resumable&fields=id,name,version,modifiedTime`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Upload-Content-Type': blob.type || 'application/octet-stream' },
    body: JSON.stringify({ id, name, parents: [folder] }),
  });
  const location = response.headers.get('Location');
  if (!location || new URL(location).origin !== 'https://www.googleapis.com') throw new Error('Invalid upload location');
  return (await authedFetch(location, { method: 'PUT', headers: { 'Content-Type': blob.type || 'application/octet-stream' }, body: blob })).json();
}
export async function backupAttachmentIds(folder: string): Promise<Set<string>> {
  const file = await findFileByName('notes_backup.json', folder);
  const ids = new Set<string>();
  if (!file) return ids;
  // Every restorable backup revision protects its attachment references.
  let pageToken = '';
  do {
    const response = await authedFetch(`${DRIVE_BASE}/files/${encodeURIComponent(file.id)}/revisions?fields=nextPageToken,revisions(id)&pageSize=1000${pageToken ? `&pageToken=${encodeURIComponent(pageToken)}` : ''}`);
    const data = await response.json();
    for (const revision of data.revisions ?? []) {
      const content = await (await authedFetch(`${DRIVE_BASE}/files/${encodeURIComponent(file.id)}/revisions/${encodeURIComponent(revision.id)}?alt=media`)).json();
      if (!Array.isArray(content.notes)) throw new Error('Cannot establish backup attachment references');
      for (const note of content.notes) {
        if (!Array.isArray(note.attachments)) throw new Error('Unknown backup attachment references');
        for (const item of note.attachments) { if (typeof item.id !== 'string') throw new Error('Invalid backup attachment'); ids.add(item.id); }
      }
    }
    pageToken = data.nextPageToken ?? '';
  } while (pageToken);
  // Include the head even if revision enumeration omitted it.
  const content = JSON.parse(await downloadText(file.id));
  if (!Array.isArray(content.notes)) throw new Error('Invalid backup');
  for (const note of content.notes) {
    if (!Array.isArray(note.attachments)) throw new Error('Unknown backup attachment references');
    for (const item of note.attachments) { if (typeof item.id !== 'string') throw new Error('Invalid backup attachment'); ids.add(item.id); }
  }
  return ids;
}
