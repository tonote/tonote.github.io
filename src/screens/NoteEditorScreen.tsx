import { saveNote } from '../sync/local';
import { createPortal } from 'react-dom';
import { track } from '../analytics';
import { colorsRepo } from '../db/colorsRepo';
import { changeNoteState } from '../db/noteLifecycle';
import { NoteProperties } from '../components/editor/NoteProperties';
import { NoteEvents } from '../components/editor/NoteEvents';
import { Attachments } from '../components/editor/Attachments';
import { attachmentsRepo } from '../db/attachmentsRepo';
import { NoteSearchNavigation } from '../components/editor/NoteSearchNavigation';
import { useState, useRef, useEffect } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useDecryptedNote, useDecryptedNotes } from '../db/useDecrypted';
import { db } from '../db/database';
import { noteKind } from '../domain/noteKind';
import { createNoteDraft, hasNoteContent } from '../domain/noteDraft';
import { NOTE_STATE, type Note, type NoteKind } from '../domain/types';
import { TitleField } from '../components/editor/TitleField';
import { PlainBody } from '../components/editor/PlainBody';
import { ChecklistBody } from '../components/editor/ChecklistBody';
import { RichTextEditor } from '../editor/RichTextEditor';
import { ActionMenu } from '../components/editor/ActionMenu';
import { UnlockDialog } from '../components/UnlockDialog';
import { Modal } from '../components/Modal';
import { Icon } from '../components/Icon';
import { cryptoStore } from '../state/cryptoStore';
import { encryptNote, withFreshIv } from '../crypto/noteCrypto';
import { cancelNoteSync, scheduleNoteSync } from '../sync/editSync';
import { driveGateway } from '../sync/driveGateway';
import { canMoveTo } from '../domain/folders';
import { useReadOnly } from '../state/accessStore';

export function NoteEditorScreen({ id: idProp }: { id?: string }) {
  const params = useParams();
  const noteId = idProp ?? params.id;
  const isNew = noteId === 'new';
  const location = useLocation();
  const queryParams = new URLSearchParams(location.search);
  const query = queryParams.get('q') ?? '';
  const requestedKind = queryParams.get('kind');
  const requestedParent = queryParams.get('parent') ?? undefined;
  const requestedColor = queryParams.get('color') ?? undefined;
  const navigate = useNavigate();
  const { t } = useTranslation();
  const { note, loading } = useDecryptedNote(isNew ? null : noteId ?? null);
  const { notes: allNotes } = useDecryptedNotes({});
  const unlocked = cryptoStore((s) => s.unlocked);
  const encryptionSalt = cryptoStore((s) => s.salt);
  const key = cryptoStore((s) => s.key);
  const backupReadOnly = useReadOnly();
  const [draft, setDraft] = useState<Note | null>(null);
  const contentRoot = useRef<HTMLDivElement>(null);
  const baseline = useRef('');
  const attachmentFiles = useRef(new Map<string, File>());
  const loadedId = useRef<string | null>(null);
  const [busy, setBusy] = useState(false);
  const saving = useRef(false);
  const [error, setError] = useState('');
  const [showUnlock, setShowUnlock] = useState(false);
  const [pendingEncrypt, setPendingEncrypt] = useState(false);
  const [leaveTarget, setLeaveTarget] = useState<string | null>(null);
  const [confirmPurge, setConfirmPurge] = useState(false);
  const readOnly = backupReadOnly || (!isNew && !!note && note.state !== NOTE_STATE.NONE);
  const inTrash = note?.state === NOTE_STATE.REMOVED || note?.state === NOTE_STATE.PARENT_REMOVED;
  const isLocked = !!note?.iv && (!unlocked || (!!note.encryptionSalt && note.encryptionSalt !== encryptionSalt));
  const ready = !!draft && loadedId.current === (isNew ? 'new' : noteId);
  const dirty = ready && JSON.stringify(draft) !== baseline.current;

  useEffect(() => {
    let cancelled = false;
    if (isNew && !backupReadOnly && loadedId.current !== 'new') {
      const kind: NoteKind = requestedKind === 'rich' || requestedKind === 'list' || requestedKind === 'folder' ? requestedKind : 'plain';
      void colorsRepo.forNewNote(requestedColor).then(color => {
        if (cancelled) return;
        const fresh = createNoteDraft(kind, requestedParent, color);
        attachmentFiles.current.clear();
        setDraft(fresh);
        baseline.current = JSON.stringify(fresh);
        loadedId.current = 'new';
        setError('');
      }).catch(() => { if (!cancelled) setError(t('editor.save_failed')); });
    } else if (!isNew && !loading && note && !isLocked && (loadedId.current !== note.id || ((readOnly || !dirty) && JSON.stringify(note) !== baseline.current))) {
      // Remote refreshes must not overwrite unsaved edits of the same note.
      attachmentFiles.current.clear();
      setDraft(note);
      baseline.current = JSON.stringify(note);
      loadedId.current = note.id;
      setError('');
    }
    return () => { cancelled = true; };
  }, [isNew, noteId, note, loading, isLocked, requestedKind, requestedParent, requestedColor, t, backupReadOnly, readOnly, dirty]);

  const nonempty = !!draft && hasNoteContent(draft);
  const returnTo = typeof location.state?.returnTo === 'string' ? location.state.returnTo : '';
  const closeTarget = returnTo.startsWith('/search') || (!returnTo && query)
    ? `/search?${new URLSearchParams({ q: query })}`
    : returnTo || (inTrash ? '/trash' : note?.state === NOTE_STATE.ARCHIVED ? '/archive' : '') || (draft?.parentId ? `/folder/${draft.parentId}` : '/');

  useEffect(() => {
    if (!dirty || (isNew && !nonempty)) return;
    const beforeUnload = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ''; };
    const onLink = (event: MouseEvent) => {
      const anchor = (event.target as Element).closest?.('a[href]');
      const href = anchor?.getAttribute('href');
      if (href?.startsWith('#/') && !event.ctrlKey && !event.metaKey && event.button === 0) {
        event.preventDefault();
        event.stopPropagation();
        if (!saving.current) setLeaveTarget(href.slice(1));
      }
    };
    window.addEventListener('beforeunload', beforeUnload);
    document.addEventListener('click', onLink, true);
    return () => {
      window.removeEventListener('beforeunload', beforeUnload);
      document.removeEventListener('click', onLink, true);
    };
  }, [dirty, isNew, nonempty]);

  const update = (changes: Partial<Note>) => setDraft((current) => current && !readOnly ? { ...current, ...changes } : current);
  const close = () => {
    if (busy) return;
    if (dirty && (!isNew || nonempty)) setLeaveTarget(closeTarget);
    else navigate(closeTarget);
  };

  const save = async (target = closeTarget, archive = false) => {
    if (readOnly || !ready || !draft || isLocked || !hasNoteContent(draft) || saving.current) return;
    saving.current = true;
    setBusy(true);
    setError('');
    try {
      if (dirty || isNew || archive) {
        let saved = { ...draft, state: archive ? NOTE_STATE.ARCHIVED : draft.state, edited: Date.now() };
        if (!saved.iv) delete saved.encryptionSalt;
        if (saved.iv) {
          if (!key || !unlocked) throw new Error(t('secured.unlock_required'));
          saved = await encryptNote(withFreshIv({ ...saved, encryptionSalt: cryptoStore.getState().salt ?? undefined }), key);
        }
        const files = saved.attachments.filter(item => attachmentFiles.current.has(item.id));
        if (files.length) {
          await db.transaction('rw', db.notes, db.kv, db.outbox, db.syncRecords, db.cleanup, async () => {
            for (const item of files) await attachmentsRepo.put(item.id, attachmentFiles.current.get(item.id)!);
            await saveNote(saved);
          });
        } else {
          await saveNote(saved);
        }
        scheduleNoteSync(saved.id, driveGateway.create());
        track('save_note', {
          type: { plain: 0, list: 1, rich: 2, folder: 999 }[noteKind(draft)],
          is_new: isNew, crypto: !!draft.iv, events: draft.events.length,
          images: draft.attachments.filter(item => item.type === 0).length,
        });
        if (archive) track('notes_action', { action: 'archive', notes: 1 });
      }
      navigate(target);
    } catch {
      setError(t('editor.save_failed'));
    } finally {
      saving.current = false;
      setBusy(false);
    }
  };

  const changeKind = (kind: NoteKind) => {
    if (!draft) return;
    let content = draft.content;
    if (noteKind(draft) === 'rich' && kind !== 'rich') {
      const document = new DOMParser().parseFromString(content, 'text/html');
      document.querySelectorAll('br').forEach((br) => br.replaceWith('\n'));
      document.querySelectorAll('p').forEach((p) => p.append('\n'));
      content = document.body.textContent?.trimEnd() ?? '';
    } else if (noteKind(draft) !== 'rich' && kind === 'rich') {
      content = content.split('\n').map((line) => {
        const p = document.createElement('p');
        p.textContent = line;
        return p.outerHTML;
      }).join('');
    }
    update({ content, checkings: kind === 'rich' ? 'h' : kind === 'folder' ? 'f' : kind === 'list' ? '0'.repeat(Math.max(1, content.split('\n').length)) : '' });
  };

  const toggleEncryption = () => {
    if (!draft) return;
    if (!unlocked || !key) { setPendingEncrypt(true); setShowUnlock(true); return; }
    update({ iv: draft.iv ? undefined : withFreshIv(draft).iv });
  };
  const unlockClose = () => {
    setShowUnlock(false);
    if (pendingEncrypt && cryptoStore.getState().unlocked && draft) {
      update({ iv: draft.iv ? undefined : withFreshIv(draft).iv });
    }
    setPendingEncrypt(false);
  };

  const lifecycle = async (action: 'restore' | 'trash' | 'purge') => {
    if (busy || backupReadOnly) return;
    if (isNew) { navigate(closeTarget); return; }
    if (!note) return;
    setBusy(true);
    setError('');
    try {
      const ids = await changeNoteState(note.id, action);
      track('notes_action', { action, notes: ids.length });
      ids.forEach(cancelNoteSync);
      ids.forEach(id => scheduleNoteSync(id, driveGateway.create()));
      navigate(closeTarget);
    } catch { setError(t('editor.save_failed')); }
    finally { setBusy(false); }
  };

  const remove = () => lifecycle('trash');

  if (isNew && backupReadOnly) return <div className="note-list-empty">{t('sync.readonly_description')}</div>;
  if (!isNew && loading) return <div className="note-list-empty">{t('auth.loading')}</div>;
  if (!isNew && !note) return <div className="note-list-empty">{t('editor.not_found')}</div>;
  if (isNew && !ready && error) return <p className="error-msg" role="alert">{error}</p>;
  if (!isLocked && !ready) return <div className="note-list-empty">{t('auth.loading')}</div>;
  const kind = draft ? noteKind(draft) : 'plain';

  return <div className="note-editor">
    <div className="editor-actions">
      <button className="icon-btn" type="button" aria-label={t('common.close')} onClick={close} disabled={busy}><Icon name="close" /></button>
      <span>{isLocked ? t('notes.locked') : t('notes.create_' + (kind === 'plain' ? 'text' : kind === 'list' ? 'checklist' : kind))}{dirty && !isLocked && <small className="draft-state">{t('editor.draft')}</small>}</span>
      {!isLocked && draft && <NoteProperties note={draft} disabled={busy || readOnly} onColorChange={(color) => update({ color })} onPinToggle={() => update({ pinned: !draft.pinned })} onEncryptToggle={toggleEncryption} />}
      {!isLocked && !readOnly && <button className="btn btn-primary" type="button" onClick={() => void save()} disabled={busy || !nonempty}>{busy ? t('editor.saving') : t('notes.save')}</button>}
      {!isLocked && !readOnly && draft && !busy && <ActionMenu note={draft}
        onKindChange={changeKind}
        onDelete={() => void remove()}
        onArchive={kind !== 'folder' && nonempty ? () => void save(closeTarget, true) : undefined}
        onMoveToFolder={(parentId) => { if (canMoveTo(draft.id, parentId, allNotes)) update({ parentId }); }} />}
      {readOnly && !backupReadOnly && <>
        <button className="btn" type="button" disabled={busy} onClick={() => void lifecycle('restore')}>{t('notes.restore')}</button>
        <button className="btn danger-btn" type="button" disabled={busy} onClick={() => inTrash ? setConfirmPurge(true) : void remove()}>{t(inTrash ? 'notes.delete_forever' : 'notes.delete')}</button>
      </>}
    </div>
    {query.trim() && !isLocked && document.getElementById('note-search-controls') && createPortal(<NoteSearchNavigation root={contentRoot} query={query} />, document.getElementById('note-search-controls')!)}
    {error && <p className="error-msg editor-error" role="alert">{error}</p>}
    {isLocked ? <div className="editor-body">
      <p>{t('notes.locked_message')}</p>
      <button className="btn btn-primary" onClick={() => setShowUnlock(true)}>{t('notes.unlock')}</button>
    </div> : draft && <div ref={contentRoot}><fieldset className="editor-fields" disabled={busy}>
      <TitleField readOnly={readOnly} value={draft.title} onChange={(title) => update({ title })} query={query} />
      <div className={`editor-body ${kind === 'plain' ? 'editor-body-plain' : ''}`}>
        {kind === 'plain' && <PlainBody readOnly={readOnly} value={draft.content} onChange={(content) => update({ content })} query={query} />}
        {kind === 'rich' && <RichTextEditor readOnly={readOnly || busy} key={draft.id + kind} initialHtml={draft.content} onChange={(content) => update({ content })} query={query} />}
        {kind === 'list' && <ChecklistBody readOnly={readOnly} content={draft.content} checkings={draft.checkings} onChange={(content, checkings) => update({ content, checkings: checkings || '0' })} query={query} />}
      </div>
      <NoteEvents noteId={draft.id} events={draft.events} readOnly={readOnly || busy} onChange={events => update({ events })} />
      {kind !== 'folder' && <Attachments readOnly={readOnly} attachments={draft.attachments} files={attachmentFiles.current} encrypted={!!draft.iv}
        onAdd={(files) => {
          const added = files.map(file => {
            const id = crypto.randomUUID();
            attachmentFiles.current.set(id, file);
            return { id, noteId: draft.id, edited: Date.now(), name: file.name, type: file.type.startsWith('image/') ? 0 : file.type.startsWith('audio/') ? 2 : 1 };
          });
          update({ attachments: [...draft.attachments, ...added] });
        }}
        onRemove={(id) => {
          attachmentFiles.current.delete(id);
          update({ attachments: draft.attachments.filter(item => item.id !== id) });
        }} />}
      {!isNew && <div className="editor-updated"><span>{t('notes.created')}: {new Date(draft.created).toLocaleString()}</span><span>{t('notes.edited')}: {new Date(draft.edited).toLocaleString()}</span></div>}
    </fieldset></div>}
    <UnlockDialog open={showUnlock} onClose={unlockClose} />
    {confirmPurge && <Modal label={t('notes.delete_forever')} onClose={() => { if (!busy) setConfirmPurge(false); }}>
      <h2>{t('notes.delete_forever')}</h2><p>{t('notes.confirm_delete_forever')}</p>
      <div className="modal-actions">
        <button className="btn" disabled={busy} onClick={() => setConfirmPurge(false)}>{t('settings.cancel')}</button>
        <button className="btn danger-btn" disabled={busy} onClick={() => void lifecycle('purge')}>{t('notes.delete_forever')}</button>
      </div>
    </Modal>}
    {leaveTarget && <Modal label={t('editor.unsaved')} onClose={() => { if (!busy) setLeaveTarget(null); }}>
      <h2>{t('editor.unsaved')}</h2><p>{t('editor.save_question')}</p>
      <div className="modal-actions">
        <button className="btn" disabled={busy} onClick={() => setLeaveTarget(null)}>{t('settings.cancel')}</button>
        <button className="btn" disabled={busy} onClick={() => navigate(leaveTarget)}>{t('editor.discard')}</button>
        <button className="btn btn-primary" disabled={busy || !nonempty} onClick={() => void save(leaveTarget)}>{t('notes.save')}</button>
      </div>
    </Modal>}
  </div>;
}
