import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// --- Mock gis module ---
vi.mock('../gateway/gis', () => ({
  getAccessToken: vi.fn().mockReturnValue('test-access-token'),
  invalidateAccessToken: vi.fn(),
}));

// We'll import fetch-related functions after setting up mocks
const BASE = 'https://www.googleapis.com/drive/v3';
const UPLOAD_BASE = 'https://www.googleapis.com/upload/drive/v3';

describe('Drive REST client', () => {
  let drive: typeof import('../gateway/drive');
  let mockFetch: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    vi.restoreAllMocks();
    vi.resetModules();

    mockFetch = vi.fn();
    vi.stubGlobal('fetch', mockFetch);

    // Re-import to pick up fresh module state
    drive = await import('../gateway/drive');
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // ---- Helper: DriveError ----
  describe('DriveError', () => {
    it('stores status, message, and url', () => {
      const err = new drive.DriveError(404, 'Not found', 'https://example.com/file');
      expect(err).toBeInstanceOf(Error);
      expect(err.status).toBe(404);
      expect(err.message).toBe('Not found');
      expect(err.url).toBe('https://example.com/file');
      expect(err.name).toBe('DriveError');
    });
  });

  // ---- findFolder ----
  describe('findFolder', () => {
    it('returns the first folder matching the name', async () => {
      const mockResponse = {
        files: [{ id: 'folder-1', name: 'ToNote' }],
      };
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(mockResponse),
      });

      const result = await drive.findFolder('ToNote');
      expect(result).toEqual({ id: 'folder-1', name: 'ToNote' });
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining(`${BASE}/files`),
        expect.objectContaining({
          headers: expect.any(Headers),
        }),
      );
      // Verify Authorization header is set
      const fetchOptions = mockFetch.mock.calls[0][1];
      expect((fetchOptions.headers as Headers).get('Authorization')).toBe('Bearer test-access-token');

      // Verify query params (URL-encoded)
      const calledUrl = mockFetch.mock.calls[0][0] as string;
      expect(calledUrl).toContain(encodeURIComponent("name='ToNote'"));
      expect(calledUrl).toContain(encodeURIComponent("mimeType='application/vnd.google-apps.folder'"));
      expect(calledUrl).toContain('trashed%3Dfalse');
    });

    it('returns null when no folder found', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ files: [] }),
      });

      const result = await drive.findFolder('NonExistent');
      expect(result).toBeNull();
    });

    it('throws DriveError on non-2xx', async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 403,
        statusText: 'Forbidden',
        json: () => Promise.resolve({ error: { message: 'Access denied' } }),
      });

      try {
        await drive.findFolder('ToNote');
        expect.fail('Should have thrown');
      } catch (err) {
        expect(err).toBeInstanceOf(drive.DriveError);
        expect((err as drive.DriveError).status).toBe(403);
      }
    });
  });

  // ---- createFolder ----
  describe('createFolder', () => {
    it('creates a folder with correct metadata', async () => {
      const mockResponse = { id: 'new-folder', name: 'ToNote' };
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(mockResponse),
      });

      const result = await drive.createFolder('ToNote');
      expect(result).toEqual({ id: 'new-folder', name: 'ToNote' });

      const [, options] = mockFetch.mock.calls[0];
      expect(options.method).toBe('POST');
      const body = JSON.parse(options.body);
      expect(body).toEqual({
        name: 'ToNote',
        mimeType: 'application/vnd.google-apps.folder',
      });
    });

    it('throws DriveError on failure', async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 500,
        statusText: 'Internal Server Error',
        text: () => Promise.resolve('Server error'),
      });

      try {
        await drive.createFolder('ToNote');
        expect.fail('Should have thrown');
      } catch (err) {
        expect(err).toBeInstanceOf(drive.DriveError);
      }
    });
  });

  // ---- findFileByName ----
  describe('findFileByName', () => {
    it('finds a file by name', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({
          files: [{ id: 'file-1', name: 'note.json' }],
        }),
      });

      const result = await drive.findFileByName('note.json');
      expect(result).toEqual({ id: 'file-1', name: 'note.json' });

      const calledUrl = mockFetch.mock.calls[0][0] as string;
      expect(calledUrl).toContain(encodeURIComponent("name='note.json'"));
    });

    it('finds a file within a folder', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({
          files: [{ id: 'file-1', name: 'note.json' }],
        }),
      });

      await drive.findFileByName('note.json', 'folder-1');

      const calledUrl = mockFetch.mock.calls[0][0] as string;
      expect(calledUrl).toContain(encodeURIComponent("'folder-1' in parents"));
    });

    it('returns null when no file found', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ files: [] }),
      });

      expect(await drive.findFileByName('missing.txt')).toBeNull();
    });
  });

  // ---- listChildren ----
  describe('listChildren', () => {
    it('follows nextPageToken, including an empty intermediate page', async () => {
      mockFetch
        .mockResolvedValueOnce({ ok: true, json: async () => ({ files: [{ id: 'f1', name: 'a' }], nextPageToken: 'page/2' }) })
        .mockResolvedValueOnce({ ok: true, json: async () => ({ files: [], nextPageToken: 'page3' }) })
        .mockResolvedValueOnce({ ok: true, json: async () => ({ files: [{ id: 'f2', name: 'b' }] }) });
      expect(await drive.listChildren('folder-id')).toEqual([{ id: 'f1', name: 'a' }, { id: 'f2', name: 'b' }]);
      expect(mockFetch).toHaveBeenCalledTimes(3);
      expect(new URL(mockFetch.mock.calls[1][0]).searchParams.get('pageToken')).toBe('page/2');
      expect(new URL(mockFetch.mock.calls[0][0]).searchParams.get('pageSize')).toBe('1000');
    });

    it('rejects incomplete listings instead of treating missing files as absent', async () => {
      mockFetch.mockResolvedValue({ ok: true, json: async () => ({ files: [], incompleteSearch: true }) });
      await expect(drive.listChildren('folder-id')).rejects.toThrow('Incomplete Google Drive file listing');
    });

    it('lists all children of a folder', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({
          files: [
            { id: 'f1', name: 'note1.json' },
            { id: 'f2', name: 'note2.json' },
          ],
        }),
      });

      const result = await drive.listChildren('folder-id');
      expect(result).toHaveLength(2);
      expect(result[0].id).toBe('f1');

      const calledUrl = mockFetch.mock.calls[0][0] as string;
      expect(calledUrl).toContain(encodeURIComponent("'folder-id' in parents"));
    });

    it('filters by name prefix', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({
          files: [{ id: 'f1', name: 'tonote.note.abc.json' }],
        }),
      });

      await drive.listChildren('folder-id', 'tonote.note.');

      const calledUrl = mockFetch.mock.calls[0][0] as string;
      expect(calledUrl).toContain(encodeURIComponent("name contains 'tonote.note.'"));
    });

    it('returns empty array when no children', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ files: [] }),
      });

      expect(await drive.listChildren('empty-folder')).toEqual([]);
    });
  });

  // ---- downloadJson ----
  describe('downloadJson', () => {
    it('downloads and parses JSON', async () => {
      const data = { hello: 'world' };
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(data),
      });

      const result = await drive.downloadJson<{ hello: string }>('file-id');
      expect(result).toEqual(data);

      const calledUrl = mockFetch.mock.calls[0][0] as string;
      expect(calledUrl).toContain('files/file-id');
      expect(calledUrl).toContain('alt=media');
    });

    it('throws DriveError on 404', async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 404,
        statusText: 'Not Found',
        text: () => Promise.resolve('File not found'),
      });

      await expect(drive.downloadJson('missing-id')).rejects.toBeInstanceOf(drive.DriveError);
    });
  });

  // ---- downloadText ----
  describe('downloadText', () => {
    it('downloads text content', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        text: () => Promise.resolve('plain text content'),
      });

      const result = await drive.downloadText('file-id');
      expect(result).toBe('plain text content');
    });
  });

  // ---- uploadJson ----
  describe('uploadJson', () => {
    it('uploads JSON with multipart body', async () => {
      const mockResponse = { id: 'new-file', name: 'note.json' };
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(mockResponse),
      });

      const result = await drive.uploadJson('note.json', '{"hello":"world"}', 'folder-id');
      expect(result).toEqual({ id: 'new-file', name: 'note.json' });

      const [, options] = mockFetch.mock.calls[0];
      expect(options.method).toBe('POST');

      const calledUrl = mockFetch.mock.calls[0][0] as string;
      expect(calledUrl).toContain(UPLOAD_BASE);
      expect(calledUrl).toContain('uploadType=multipart');

      // Verify multipart body structure
      const bodyStr = options.body as string;
      // Metadata part has Content-Type: application/json
      expect(bodyStr).toContain('Content-Type: application/json; charset=UTF-8');
      // Media part has the default mimeType (application/json)
      expect(bodyStr).toContain('Content-Type: application/json');
      expect(bodyStr).toContain('note.json');
      expect(bodyStr).toContain('folder-id');
      expect(bodyStr).toContain('{"hello":"world"}');
      // Verify boundary markers
      expect(bodyStr).toContain('-------314159265358979323846');
      expect(bodyStr).toMatch(/--\S+--/);  // closing boundary
    });

    it('uses custom mime type when provided', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ id: 'f1', name: 'data.enc' }),
      });

      await drive.uploadJson('data.enc', 'encrypted', 'folder-id', 'application/octet-stream');

      const bodyStr = mockFetch.mock.calls[0][1].body as string;
      // Custom mime type appears in the media part
      expect(bodyStr).toContain('Content-Type: application/octet-stream');
    });
  });

  // ---- updateJson ----
  describe('updateJson', () => {
    it('patches file content', async () => {
      const mockResponse = { id: 'file-1', name: 'note.json' };
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(mockResponse),
      });

      const result = await drive.updateJson('file-1', '{"updated":true}');
      expect(result).toEqual({ id: 'file-1', name: 'note.json' });

      const [, options] = mockFetch.mock.calls[0];
      expect(options.method).toBe('PATCH');

      const calledUrl = mockFetch.mock.calls[0][0] as string;
      expect(calledUrl).toContain(`${UPLOAD_BASE}/files/file-1`);
      expect(calledUrl).toContain('uploadType=media');
      expect(options.body).toBe('{"updated":true}');
    });

    it('uses custom mime type when provided', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ id: 'f1', name: 'data.enc' }),
      });

      await drive.updateJson('file-1', 'encrypted', 'application/octet-stream');

      const [, options] = mockFetch.mock.calls[0];
      expect((options.headers as Headers).get('Content-Type')).toBe('application/octet-stream');
    });
  });

  // ---- deleteFile ----
  describe('deleteFile', () => {
    it('deletes a file', async () => {
      mockFetch.mockResolvedValue({ ok: true, status: 204 });

      await drive.deleteFile('file-id');

      const calledUrl = mockFetch.mock.calls[0][0] as string;
      expect(calledUrl).toContain(`${BASE}/files/file-id`);

      const [, options] = mockFetch.mock.calls[0];
      expect(options.method).toBe('DELETE');
    });

    it('throws DriveError on failure', async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 404,
        statusText: 'Not Found',
        text: () => Promise.resolve(''),
      });

      await expect(drive.deleteFile('missing')).rejects.toBeInstanceOf(drive.DriveError);
    });
  });

  // ---- getHeadRevisionId ----
  describe('getHeadRevisionId', () => {
    it('returns the head revision id', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ headRevisionId: 'rev-123' }),
      });

      const result = await drive.getHeadRevisionId('file-id');
      expect(result).toBe('rev-123');

      const calledUrl = mockFetch.mock.calls[0][0] as string;
      expect(calledUrl).toContain('fields=headRevisionId');
    });

    it('returns undefined when no revision id', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({}),
      });

      const result = await drive.getHeadRevisionId('file-id');
      expect(result).toBeUndefined();
    });
  });

  // ---- Error handling across all methods ----
  describe('error handling', () => {
    it('throws DriveError with status 403', async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 403,
        statusText: 'Forbidden',
        text: () => Promise.resolve('Forbidden'),
      });

      try {
        await drive.downloadText('file-id');
        expect.fail('Should have thrown');
      } catch (err) {
        expect(err).toBeInstanceOf(drive.DriveError);
        expect((err as drive.DriveError).status).toBe(403);
      }
    });

    it('throws DriveError with status 500', async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 500,
        statusText: 'Internal Server Error',
        text: () => Promise.resolve('Internal error'),
      });

      try {
        await drive.downloadText('file-id');
        expect.fail('Should have thrown');
      } catch (err) {
        expect(err).toBeInstanceOf(drive.DriveError);
        expect((err as drive.DriveError).status).toBe(500);
      }
    });

    it('includes error body message in DriveError when available', async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 400,
        statusText: 'Bad Request',
        json: () => Promise.resolve({ error: { message: 'Invalid field' } }),
      });

      try {
        await drive.findFolder('bad');
        expect.fail('Should have thrown');
      } catch (err) {
        expect(err).toBeInstanceOf(drive.DriveError);
        expect((err as Error).message).toContain('Invalid field');
      }
    });
  });
});
