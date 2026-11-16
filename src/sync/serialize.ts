import type { Note } from '../domain/types';
import { DEFAULT_CATEGORY, DEFAULT_CATEGORY_ID } from '../domain/color';
import { normalizeEncodedBytes, base64ToBytes } from '../crypto/aes';
import { isDeleted, isDeletedColor, type NoteDocument, type SyncConfig, type ColorDocument } from './types';

function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Invalid sync document');
  return value as Record<string, unknown>;
}
function bytes(value: unknown, length: number): string {
  if (typeof value !== 'string' && !(Array.isArray(value) && value.every(n => Number.isInteger(n) && n >= -128 && n <= 255))) throw new Error('Invalid encoded bytes');
  const encoded = normalizeEncodedBytes(value as string | number[]);
  if (base64ToBytes(encoded).length !== length) throw new Error('Invalid encryption parameter length');
  return encoded;
}
function finite(value: unknown): value is number { return typeof value === 'number' && Number.isFinite(value) && value >= 0; }
function identity(value: Record<string, unknown>) {
  if (typeof value.id !== 'string' || !/^[a-z0-9_-]{1,128}$/i.test(value.id) || !finite(value.edited)) throw new Error('Invalid document identity/time');
}
export function parseNote(json: string, expectedId?: string, legacy = false): NoteDocument {
  const value = object(JSON.parse(json)); identity(value);
  if (!legacy && value.schemaVersion !== 3) throw new Error('Unsupported note schema');
  if (expectedId && value.id !== expectedId) throw new Error('Note ID does not match its Drive file');
  if (value.deleted === true) {
    if (!finite(value.trashedAt) || !finite(value.purgeAfter)) throw new Error('Invalid deletion marker');
    return { schemaVersion: 3, id: value.id as string, deleted: true, edited: value.edited as number, trashedAt: value.trashedAt, purgeAfter: value.purgeAfter };
  }
  for (const key of ['title', 'content', 'checkings']) if (typeof value[key] !== 'string') throw new Error(`Invalid note ${key}`);
  if (!finite(value.created) || ![0, 1, 2, 3].includes(value.state as number) || !Array.isArray(value.attachments) || !Array.isArray(value.events)) throw new Error('Invalid note fields');
  const attachmentIds = new Set<string>();
  for (const item of value.attachments) {
    const id = object(item).id;
    if (typeof id !== 'string' || !/^[a-z0-9_-]{1,128}$/i.test(id) || attachmentIds.has(id)) throw new Error('Invalid attachment');
    attachmentIds.add(id);
  }
  for (const key of ['pinned', 'notify', 'showInWidget']) if (typeof value[key] !== 'boolean') throw new Error(`Invalid note ${key}`);
  if (typeof value.priority !== 'number' || !Number.isFinite(value.priority)) throw new Error('Invalid priority');
  if (value.parentId != null && (typeof value.parentId !== 'string' || value.parentId === value.id)) throw new Error('Invalid parent');
  if (value.parentId === null) delete value.parentId;
  if (value.iv != null) {
    value.iv = bytes(value.iv, 16);
    if (value.encryptionSalt != null) value.encryptionSalt = bytes(value.encryptionSalt, 16);
    if (!legacy && !value.encryptionSalt) throw new Error('Encrypted note is missing encryptionSalt');
  } else { delete value.iv; delete value.encryptionSalt; }
  if (value.state === 2 || value.state === 3) {
    if (!legacy && (!finite(value.trashedAt) || !finite(value.purgeAfter))) throw new Error('Trash note is missing retention times');
  }
  const colorId = typeof value.colorId === 'string' ? value.colorId : object(value.color ?? DEFAULT_CATEGORY).id;
  value.color = { ...DEFAULT_CATEGORY, id: colorId };
  value.attachments = (value.attachments as Record<string, unknown>[]).map(item => ({ ...item, noteId: value.id }));
  delete value.colorId; delete value.schemaVersion;
  return value as unknown as Note;
}
export function noteValue(doc: NoteDocument): Record<string, unknown> {
  if (isDeleted(doc)) return { ...doc };
  const { color, ...value } = doc;
  return { ...value, schemaVersion: 3, colorId: color.id, attachments: doc.attachments.map(({ driveFileId: _transport, ...item }) => item) };
}
export function serializeNote(doc: NoteDocument): string { return JSON.stringify(noteValue(doc)); }
export function equivalent(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (!a || !b || typeof a !== 'object' || typeof b !== 'object') return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  const aa = a as Record<string, unknown>, bb = b as Record<string, unknown>;
  const keys = Object.keys(aa).filter(k => aa[k] !== undefined), other = Object.keys(bb).filter(k => bb[k] !== undefined);
  return keys.length === other.length && keys.every(k => Object.hasOwn(bb, k) && equivalent(aa[k], bb[k]));
}
export function sameNote(a: NoteDocument, b: NoteDocument): boolean { return equivalent(noteValue(a), noteValue(b)); }
/** Positive means the local document wins. Equal timestamps keep local, except deletion. */
export function compareDocuments(a: { edited: number; deleted?: boolean }, b: { edited: number; deleted?: boolean }): number {
  return a.edited - b.edited || Number(a.deleted === true) - Number(b.deleted === true);
}
export function parseConfig(json: string): SyncConfig {
  const value = object(JSON.parse(json));
  if (value.schemaVersion !== 3 || typeof value.initialized !== 'boolean' || !finite(value.trashRetentionDays) || !Array.isArray(value.colors)) throw new Error('Unsupported or invalid sync configuration');
  const seen = new Set<string>();
  for (const raw of value.colors) {
    const color = object(raw); identity(color);
    if (seen.has(color.id as string)) throw new Error('Duplicate category'); seen.add(color.id as string);
    if (color.deleted === true) { if (color.id === DEFAULT_CATEGORY_ID) throw new Error('Default category cannot be deleted'); }
    else if (typeof color.theme !== 'string' || typeof color.value !== 'number' || typeof color.priority !== 'number' || typeof color.showAsFilter !== 'boolean') throw new Error('Invalid category');
  }
  function keys(raw: Record<string, unknown>) {
    if ((raw.salt == null) !== (raw.checker == null)) throw new Error('Incomplete encryption parameters');
    if (raw.salt != null) { raw.salt = bytes(raw.salt, 16); raw.checker = bytes(raw.checker, 4); }
  }
  keys(value);
  if (value.keyRotation) {
    const rotation = object(value.keyRotation);
    if (typeof rotation.id !== 'string') throw new Error('Invalid key rotation');
    keys(object(rotation.from)); keys(object(rotation.to));
    if (!object(rotation.from).salt || !object(rotation.to).salt) throw new Error('Invalid rotation keys');
  }
  return value as unknown as SyncConfig;
}
export function mergeColors(local: ColorDocument[], remote: ColorDocument[]): ColorDocument[] {
  const merged = new Map(remote.map(c => [c.id, c]));
  for (const color of local) {
    const other = merged.get(color.id);
    if (!other || compareDocuments(color, other) >= 0) merged.set(color.id, color);
  }
  if (!merged.has(DEFAULT_CATEGORY_ID)) merged.set(DEFAULT_CATEGORY_ID, DEFAULT_CATEGORY);
  return [...merged.values()].map(c => isDeletedColor(c) ? { id: c.id, edited: c.edited, deleted: true } : c);
}
