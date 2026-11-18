import { expect, it } from 'vitest';
import { note } from './testing';
import { parseConfig, parseNote, serializeNote, compareDocuments, sameNote } from './serialize';
import { marker } from './local';

it('writes schema 3, category UUID and salt, never embeds the category or Drive attachment transport ID', () => {
  const source = note('n', { iv: 'AAAAAAAAAAAAAAAAAAAAAA==', encryptionSalt: 'AQEBAQEBAQEBAQEBAQEBAQ==', attachments: [{ id: 'file', noteId: 'n', driveFileId: 'transport-only' }] });
  const json = serializeNote(source), value = JSON.parse(json);
  expect(value.schemaVersion).toBe(3); expect(value.colorId).toBe(source.color.id); expect(value).not.toHaveProperty('color'); expect(json).not.toContain('transport-only');
  expect(sameNote(parseNote(json, 'n'), source)).toBe(true);
});
it('normalizes historical byte arrays for encrypted documents and config parameters', () => {
  const value = JSON.parse(serializeNote(note('n', { iv: 'AAAAAAAAAAAAAAAAAAAAAA==', encryptionSalt: '/////////////////////w==' })));
  value.iv = Array(16).fill(0); value.encryptionSalt = Array(16).fill(-1);
  expect(parseNote(JSON.stringify(value))).toMatchObject({ iv: 'AAAAAAAAAAAAAAAAAAAAAA==', encryptionSalt: '/////////////////////w==' });
  expect(parseConfig(JSON.stringify({ schemaVersion: 3, initialized: true, trashRetentionDays: 15, colors: [], salt: Array(16).fill(-1), checker: [0, 0, 0, 0] }))).toMatchObject({ salt: '/////////////////////w==', checker: 'AAAAAA==' });
});
it('does not accept the obsolete schema or structurally invalid documents', () => {
  expect(() => parseNote(JSON.stringify(note('n')))).toThrow('schema');
  expect(() => parseNote(serializeNote(note('n')), 'different')).toThrow('ID');
  expect(() => parseNote(serializeNote(note('n', { iv: 'AAAAAAAAAAAAAAAAAAAAAA==' })))).toThrow('encryptionSalt');
  expect(() => parseNote('{"schemaVersion":3,"id":"n","edited":1,"deleted":true,"autoExpired":"true"}')).toThrow('marker');
});
it('serializes deletion as a minimal document and prefers it only on equal or greater edited', () => {
  const deleted = marker(note('n'));
  expect(Object.keys(JSON.parse(serializeNote(deleted))).sort()).toEqual(['deleted', 'edited', 'id', 'schemaVersion']);
  expect(compareDocuments(deleted, note('n'))).toBeGreaterThan(0);
  expect(compareDocuments(deleted, note('n', { edited: 200 }))).toBeLessThan(0);
});
it('deletes encrypted content with one minimal marker and no attachment metadata', () => {
  const deleted = marker(note('n', { title: 'private', content: 'private', iv: 'AAAAAAAAAAAAAAAAAAAAAA==', attachments: [{ id: 'file', name: 'private filename' }] }));
  expect(parseNote(serializeNote(deleted))).toEqual(deleted);
  expect(Object.keys(deleted).sort()).toEqual(['deleted', 'edited', 'id', 'schemaVersion']);
  expect(serializeNote(deleted)).not.toMatch(/private|content|title|encryptionSalt|"iv"/);
});

it('reads false as a manual marker and round-trips the automatic marker flag', () => {
  const manual = marker(note('n'));
  expect(parseNote(JSON.stringify({ ...manual, autoExpired: false }))).toEqual(manual);
  const automatic = marker(note('n'), 15 * 86400000 + 100, true);
  expect(parseNote(serializeNote(automatic))).toEqual(automatic);
  expect(compareDocuments(automatic, note('n', { edited: 100 }))).toBeGreaterThan(0);
});
