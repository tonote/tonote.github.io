import { Icon } from './Icon';
import { useEditorState, type Editor } from '@tiptap/react';
import { knifeColorToCss } from '../editor/knifeColor';
import { useTranslation } from 'react-i18next';

export interface EditorToolbarProps {
  editor: Editor | null;
  onCommand: (command: (editor: Editor) => void) => void;
}

const FONT_SIZES = [0.4, 0.6, 0.8, 1, 1.2, 1.4, 1.6, 1.8];

const TOOLBAR_BUTTON_CLASS = 'toolbar-btn';

export function EditorToolbar({ editor, onCommand }: EditorToolbarProps) {
  useEditorState({ editor, selector: ({ editor }) => editor?.state });
  if (!editor) return null;
  const fontSize = editor.getAttributes('knifeFontSize').size ?? 1;
  const textColor = editor.getAttributes('knifeTextColor').color as string | undefined;
  const highlight = editor.getAttributes('knifeHighlight').background as string | undefined;
  const alignLeft = !editor.isActive({ textAlign: 'center' }) && !editor.isActive({ textAlign: 'right' }) && !editor.isActive({ textAlign: 'justify' });

  return (
    <div className="editor-toolbar" role="toolbar" aria-label="Formatting toolbar"
      onMouseDown={event => { if ((event.target as Element).closest('button')) event.preventDefault(); }}>
      {/* Bold */}
      <button
        type="button"
        className={`${TOOLBAR_BUTTON_CLASS} ${editor.isActive('bold') ? 'active' : ''}`}
        aria-pressed={editor.isActive('bold')}
        onClick={() => onCommand(e => e.chain().focus().toggleBold().run())}
        title="Bold"
        aria-label="Bold"
      >
        <strong>B</strong>
      </button>

      {/* Italic */}
      <button
        type="button"
        className={`${TOOLBAR_BUTTON_CLASS} ${editor.isActive('italic') ? 'active' : ''}`}
        aria-pressed={editor.isActive('italic')}
        onClick={() => onCommand(e => e.chain().focus().toggleItalic().run())}
        title="Italic"
        aria-label="Italic"
      >
        <em>I</em>
      </button>

      {/* Underline */}
      <button
        type="button"
        className={`${TOOLBAR_BUTTON_CLASS} ${editor.isActive('underline') ? 'active' : ''}`}
        aria-pressed={editor.isActive('underline')}
        onClick={() => onCommand(e => e.chain().focus().toggleUnderline().run())}
        title="Underline"
        aria-label="Underline"
      >
        <u>U</u>
      </button>

      {/* Strikethrough */}
      <button
        type="button"
        className={`${TOOLBAR_BUTTON_CLASS} ${editor.isActive('strike') ? 'active' : ''}`}
        aria-pressed={editor.isActive('strike')}
        onClick={() => onCommand(e => e.chain().focus().toggleStrike().run())}
        title="Strikethrough"
        aria-label="Strikethrough"
      >
        <s>S</s>
      </button>

      {/* Subscript */}
      <button
        type="button"
        className={`${TOOLBAR_BUTTON_CLASS} ${editor.isActive('subscript') ? 'active' : ''}`}
        aria-pressed={editor.isActive('subscript')}
        onClick={() => onCommand(e => e.chain().focus().toggleSubscript().run())}
        title="Subscript"
        aria-label="Subscript"
      >
        <span className="toolbar-script" aria-hidden="true">X<sub>2</sub></span>
      </button>

      {/* Superscript */}
      <button
        type="button"
        className={`${TOOLBAR_BUTTON_CLASS} ${editor.isActive('superscript') ? 'active' : ''}`}
        aria-pressed={editor.isActive('superscript')}
        onClick={() => onCommand(e => e.chain().focus().toggleSuperscript().run())}
        title="Superscript"
        aria-label="Superscript"
      >
        <span className="toolbar-script" aria-hidden="true">X<sup>2</sup></span>
      </button>

      <span className="toolbar-separator" />

      {/* Font Size Dropdown */}
      <select
        className="toolbar-select"
        title="Font Size"
        aria-label="Font Size"
        onChange={e => {
          const val = parseFloat(e.target.value);
          onCommand((ed: any) => {
            ed.commands.setKnifeFontSize(val);
            ed.commands.focus();
          });
        }}
        value={fontSize}
      >
        {!FONT_SIZES.includes(fontSize) && <option value={fontSize}>{fontSize}</option>}
        {FONT_SIZES.map(size => <option key={size} value={size}>{size.toFixed(1)}</option>)}
      </select>

      <ColorControl label="Text Color" icon="textColor" color={textColor} fallback="#000000"
        onChange={hex => onCommand((ed: any) => ed.commands.setKnifeTextColor(`#ff${hex.slice(1)}`))} onReset={() => onCommand((ed: any) => ed.commands.unsetKnifeTextColor())} />
      <ColorControl label="Highlight Color" icon="fillColor" color={highlight} fallback="#ffff00"
        onChange={hex => onCommand((ed: any) => ed.commands.setKnifeHighlight(`#ff${hex.slice(1)}`))} onReset={() => onCommand((ed: any) => ed.commands.unsetKnifeHighlight())} />

      <span className="toolbar-separator" />

      {/* Bullet List */}
      <button
        type="button"
        className={`${TOOLBAR_BUTTON_CLASS} ${editor.isActive('bulletList') ? 'active' : ''}`}
        aria-pressed={editor.isActive('bulletList')}
        onClick={() => onCommand(e => e.chain().focus().toggleBulletList().run())}
        title="Bullet List"
        aria-label="Bullet List"
      >
        <Icon name="list" />
      </button>

      {/* Quote */}
      <button
        type="button"
        className={`${TOOLBAR_BUTTON_CLASS} ${editor.isActive('blockquote') ? 'active' : ''}`}
        aria-pressed={editor.isActive('blockquote')}
        onClick={() => onCommand(e => e.chain().focus().toggleBlockquote().run())}
        title="Quote"
        aria-label="Quote"
      >
        <Icon name="quote" />
      </button>

      <span className="toolbar-separator" />

      {/* Alignment */}
      <button
        type="button"
        className={`${TOOLBAR_BUTTON_CLASS} ${alignLeft ? 'active' : ''}`}
        aria-pressed={alignLeft}
        onClick={() => onCommand(e => e.chain().focus().setTextAlign('left').run())}
        title="Align Left"
        aria-label="Align Left"
      >
        <Icon name="left" />
      </button>
      <button
        type="button"
        className={`${TOOLBAR_BUTTON_CLASS} ${editor.isActive({ textAlign: 'center' }) ? 'active' : ''}`}
        aria-pressed={editor.isActive({ textAlign: 'center' })}
        onClick={() => onCommand(e => e.chain().focus().setTextAlign('center').run())}
        title="Align Center"
        aria-label="Align Center"
      >
        <Icon name="center" />
      </button>
      <button
        type="button"
        className={`${TOOLBAR_BUTTON_CLASS} ${editor.isActive({ textAlign: 'right' }) ? 'active' : ''}`}
        aria-pressed={editor.isActive({ textAlign: 'right' })}
        onClick={() => onCommand(e => e.chain().focus().setTextAlign('right').run())}
        title="Align Right"
        aria-label="Align Right"
      >
        <Icon name="right" />
      </button>

      <span className="toolbar-separator" />

      {/* Clear Formatting */}
      <button
        type="button"
        className={TOOLBAR_BUTTON_CLASS}
        onClick={() => onCommand(e => e.chain().focus().clearNodes().unsetAllMarks().run())}
        title="Clear Formatting"
        aria-label="Clear Formatting"
      >
        <Icon name="close" />
      </button>
    </div>
  );
}

function ColorControl({ label, icon, color, fallback, onChange, onReset }: {
  label: string;
  icon: 'textColor' | 'fillColor';
  color?: string;
  fallback: string;
  onChange: (hex: string) => void;
  onReset: () => void;
}) {
  const { t } = useTranslation();
  const cssColor = color ? knifeColorToCss(color) : undefined;
  return <details className="toolbar-color-menu">
    <summary className={`toolbar-btn toolbar-color-control ${color ? 'active' : ''}`} title={label} aria-label={label}>
      <Icon name={icon} />
      <span className="toolbar-color-indicator" aria-hidden="true"
        style={{ backgroundColor: cssColor ?? (icon === 'textColor' ? 'var(--text)' : 'transparent') }} />
    </summary>
    <div className="toolbar-color-popover">
      <input type="color" aria-label={`${label} picker`} value={cssColor?.slice(0, 7) ?? fallback}
        onInput={event => onChange(event.currentTarget.value)} />
      <button type="button" className="btn" onClick={onReset}>{t('common.reset_color')}</button>
    </div>
  </details>;
}
