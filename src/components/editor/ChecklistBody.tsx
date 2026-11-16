import { SearchField } from './SearchField';
import { useTranslation } from 'react-i18next';
import { Icon } from '../Icon';
import { useState, useCallback } from 'react';
import { readChecklist, writeChecklist } from '../../domain/checkings';

interface ChecklistBodyProps {
  query?: string;
  readOnly?: boolean;
  content: string;
  checkings: string;
  onChange: (content: string, checkings: string) => void;
}

export function ChecklistBody({ content, checkings, onChange, query, readOnly = false }: ChecklistBodyProps) {
  const { t } = useTranslation();
  const [newItemText, setNewItemText] = useState('');
  const [newItemState, setNewItemState] = useState<0 | 2>(0);

  const items = readChecklist(content, checkings);

  const toggleItem = useCallback(
    (index: number) => {
      const updated = items.map((item, i) =>
        i === index
          ? { ...item, state: (item.state === 1 ? 0 : 1) as 0 | 1 | 2 }
          : item,
      );
      const result = writeChecklist(updated);
      onChange(result.content, result.checkings);
    },
    [items, onChange],
  );

  const removeItem = useCallback(
    (index: number) => {
      const updated = items.filter((_, i) => i !== index);
      const result = writeChecklist(updated);
      onChange(result.content, result.checkings);
    },
    [items, onChange],
  );

  const updateItemText = useCallback(
    (index: number, text: string) => {
      const updated = items.map((item, i) =>
        i === index ? { ...item, text } : item,
      );
      const result = writeChecklist(updated);
      onChange(result.content, result.checkings);
    },
    [items, onChange],
  );

  const addItem = useCallback(() => {
    const trimmed = newItemText.trim();
    if (!trimmed) return;
    const updated = [...items, { text: trimmed, state: newItemState }];
    const result = writeChecklist(updated);
    onChange(result.content, result.checkings);
    setNewItemText('');
  }, [items, newItemText, newItemState, onChange]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        addItem();
      }
    },
    [addItem],
  );

  return (
    <div>
      <ul className="checklist-body">
        {items.map((item, index) => (
          <li key={index} className="checklist-item">
            {item.state !== 2 && <input
              disabled={readOnly}
              type="checkbox"
              aria-label={item.text || t('editor.add_item')}
              checked={item.state === 1}
              onChange={() => toggleItem(index)}
            />}
            <SearchField readOnly={readOnly}
              query={query}
              label={t('notes.create_text')}
              className={`item-text ${item.state === 1 ? 'checked' : ''}`}
              value={item.text}
              onChange={(text) => updateItemText(index, text)}
            />
            {!readOnly && <><button className="icon-btn item-type-btn" type="button" aria-label={t(item.state === 2 ? 'editor.make_checkable' : 'editor.make_text')} title={t(item.state === 2 ? 'editor.make_checkable' : 'editor.make_text')} onClick={() => {
              const result = writeChecklist(items.map((current, i) => i === index ? { ...current, state: current.state === 2 ? 0 : 2 } : current));
              onChange(result.content, result.checkings);
            }}><Icon name={item.state === 2 ? 'unchecked' : 'text'} /></button>
            <button
              className="remove-item-btn"
              onClick={() => removeItem(index)}
              type="button"
              aria-label={t('notes.delete')}
            >
              <Icon name="close" />
            </button></>}
          </li>
        ))}
      </ul>
      {!readOnly && <div className="checklist-add">
        <input
          type="text"
          placeholder={t('editor.add_item')}
          value={newItemText}
          onChange={(e) => setNewItemText(e.target.value)}
          onKeyDown={handleKeyDown}
        />
        <button className="icon-btn" type="button" aria-label={t(newItemState === 2 ? 'editor.new_text_item' : 'editor.new_checkable_item')} title={t(newItemState === 2 ? 'editor.new_text_item' : 'editor.new_checkable_item')} onClick={() => setNewItemState(state => state === 2 ? 0 : 2)}><Icon name={newItemState === 2 ? 'text' : 'unchecked'} /></button>
        <button onClick={addItem} type="button" aria-label={t('editor.add_item')}>
          <Icon name="add" />
        </button>
      </div>}
    </div>
  );
}
