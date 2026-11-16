import { Modal } from '../components/Modal';
import { Icon } from '../components/Icon';
import { useState, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { useColors } from '../db/useColors';
import { colorsRepo } from '../db/colorsRepo';
import { categoryColorToCss, cssToArgb, DEFAULT_CATEGORY_COLOR, DEFAULT_CATEGORY_ID } from '../domain/color';
import type { Color } from '../domain/types';
import { useReadOnly } from '../state/accessStore';

export function ColorsScreen() {
  const { t } = useTranslation();
  const { colors, loading } = useColors();
  const readOnly = useReadOnly();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [blockedColor, setBlockedColor] = useState<Color | null>(null);
  const [editName, setEditName] = useState('');

  const startEditing = useCallback((color: Color) => {
    setEditingId(color.id);
    setEditName(color.theme);
  }, []);

  const saveName = useCallback(async (color: Color) => {
    await colorsRepo.put({ ...color, theme: editName, edited: Date.now() });
    setEditingId(null);
  }, [editName]);

  const handleAdd = useCallback(async () => {
    const maxPriority = colors.reduce((max, c) => Math.max(max, c.priority), -1);
    const newColor: Color = {
      id: crypto.randomUUID(),
      edited: Date.now(),
      value: DEFAULT_CATEGORY_COLOR,
      theme: '',
      showAsFilter: false,
      priority: maxPriority + 1,
    };
    await colorsRepo.put(newColor);
  }, [colors]);

  const handleToggleFilter = useCallback(async (color: Color) => {
    await colorsRepo.put({ ...color, showAsFilter: !color.showAsFilter, edited: Date.now() });
  }, []);

  const handleMoveUp = useCallback((color: Color, sortedColors: Color[]) => {
    const idx = sortedColors.findIndex(c => c.id === color.id);
    if (idx <= 0) return;
    const swapWith = sortedColors[idx - 1];
    void colorsRepo.put({ ...color, priority: swapWith.priority, edited: Date.now() });
    void colorsRepo.put({ ...swapWith, priority: color.priority, edited: Date.now() });
  }, []);

  const handleMoveDown = useCallback((color: Color, sortedColors: Color[]) => {
    const idx = sortedColors.findIndex(c => c.id === color.id);
    if (idx < 0 || idx >= sortedColors.length - 1) return;
    const swapWith = sortedColors[idx + 1];
    void colorsRepo.put({ ...color, priority: swapWith.priority, edited: Date.now() });
    void colorsRepo.put({ ...swapWith, priority: color.priority, edited: Date.now() });
  }, []);

  const handleDelete = useCallback(async (color: Color) => {
    if (!(await colorsRepo.remove(color.id))) setBlockedColor(color);
  }, []);

  const handleColorValueChange = useCallback((color: Color, hex: string) => {
    // Parse hex to RGB (e.g., #ff0000)
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    const argb = cssToArgb(r, g, b, 1); // fully opaque
    void colorsRepo.put({ ...color, value: argb, edited: Date.now() });
  }, []);

  if (loading) {
    return <div className="note-list-empty">{t('auth.loading')}</div>;
  }

  const sorted = [...colors].sort((a, b) => b.priority - a.priority);

  return (
    <div className="colors-screen">
      <h2>{t('colors.title')}</h2>

      {!readOnly && <button className="btn btn-primary" onClick={handleAdd} type="button">
        {t('colors.add')}
      </button>}

      {blockedColor && <Modal label={t('colors.cannot_delete')} onClose={() => setBlockedColor(null)}>
        <h2>{t('colors.cannot_delete')}</h2>
        <p>{t('colors.used_warning', { name: blockedColor.theme || t('colors.unnamed') })}</p>
        <div className="modal-actions"><button className="btn" onClick={() => setBlockedColor(null)}>{t('common.ok')}</button></div>
      </Modal>}
      <div className="colors-list">
        {sorted.map((color) => (
          <div key={color.id} className="color-row">
            <label className="category-color" style={{ background: categoryColorToCss(color.value) }}>
            <input
              type="color"
              disabled={readOnly}
              value={(() => {
                // Convert ARGB to CSS hex for the color picker (RGB only)
                const num = color.value >>> 0;
                const r = (num & 0xFF0000) >>> 16;
                const g = (num & 0xFF00) >>> 8;
                const b = num & 0xFF;
                return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
              })()}
              onChange={(e) => handleColorValueChange(color, e.target.value)}
              aria-label={t('colors.color_value')}
            />
            </label>
            {editingId === color.id && !readOnly ? (
              <input
                className="color-name-input"
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                onBlur={() => saveName(color)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') saveName(color);
                  if (e.key === 'Escape') setEditingId(null);
                }}
                autoFocus
              />
            ) : (
              <span
                className="color-name"
                onClick={() => { if (!readOnly) startEditing(color); }}
                onKeyDown={(e) => { if (!readOnly && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); startEditing(color); } }}
                role={readOnly ? undefined : 'button'}
                tabIndex={readOnly ? undefined : 0}
              >
                {color.theme || t('colors.unnamed')}
              </span>
            )}
            <label className="toggle-label">
              <input
                type="checkbox"
                disabled={readOnly}
                checked={color.showAsFilter}
                onChange={() => handleToggleFilter(color)}
              />
              {t('colors.show_as_filter')}
            </label>
            {!readOnly && <div className="color-actions">
              <button
                className="icon-btn"
                onClick={() => handleMoveUp(color, sorted)}
                type="button"
                aria-label={t('colors.move_up')}
                disabled={sorted.indexOf(color) === 0}
              >
                <Icon name="up" />
              </button>
              <button
                className="icon-btn"
                onClick={() => handleMoveDown(color, sorted)}
                type="button"
                aria-label={t('colors.move_down')}
                disabled={sorted.indexOf(color) === sorted.length - 1}
              >
                <Icon name="down" />
              </button>
              <button
                className="icon-btn danger-btn"
                disabled={color.id === DEFAULT_CATEGORY_ID}
                onClick={() => handleDelete(color)}
                type="button"
                aria-label={t('colors.delete')}
              >
                <Icon name="trash" />
              </button>
            </div>}
            <Link className="btn color-open" to={`/color/${color.id}`}>{t('colors.open')}</Link>
          </div>
        ))}
      </div>
    </div>
  );
}
