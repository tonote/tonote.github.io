import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { Editor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Subscript from '@tiptap/extension-subscript';
import Superscript from '@tiptap/extension-superscript';
import TextAlign from '@tiptap/extension-text-align';
import { KnifeFontSize } from '../editor/extensions/FontSize';
import { KnifeTextColor } from '../editor/extensions/TextColor';
import { KnifeHighlight } from '../editor/extensions/Highlight';
import { EditorToolbar } from './EditorToolbar';

let editor: Editor;
afterEach(() => { cleanup(); editor?.destroy(); });
function setup(content = '<p>plain</p>') {
  editor = new Editor({
    extensions: [StarterKit, Subscript, Superscript, TextAlign.configure({ types: ['paragraph'] }), KnifeFontSize, KnifeTextColor, KnifeHighlight],
    content,
  });
  render(<EditorToolbar editor={editor} onCommand={command => command(editor)} />);
}
function selectText(text: string) {
  let position = 0;
  editor.state.doc.descendants((node, pos) => { if (node.isText && node.text === text) position = pos + 1; });
  act(() => { editor.commands.setTextSelection(position); });
}

describe('EditorToolbar', () => {
  it('reflects cursor movement through inline styles, sizes, colors and alignment', () => {
    setup('<p style="text-align:center"><strong><em><u><s><sup><span style="font-size:1.4em;color:#ff123456;background:#ffabcdef">styled</span></sup></s></u></em></strong></p><p>plain</p>');
    selectText('styled');
    for (const name of ['Bold', 'Italic', 'Underline', 'Strikethrough', 'Superscript', 'Align Center']) {
      expect(screen.getByRole('button', { name })).toHaveAttribute('aria-pressed', 'true');
    }
    expect(screen.getByLabelText('Font Size')).toHaveValue('1.4');
    expect(screen.getByLabelText('Text Color picker')).toHaveValue('#123456');
    expect(screen.getByLabelText('Highlight Color picker')).toHaveValue('#abcdef');
    expect(screen.getByLabelText('Text Color picker').closest('details')!.querySelector('.toolbar-color-indicator')).toHaveStyle({ backgroundColor: '#123456' });
    selectText('plain');
    for (const name of ['Bold', 'Italic', 'Underline', 'Strikethrough', 'Superscript', 'Align Center']) {
      expect(screen.getByRole('button', { name })).toHaveAttribute('aria-pressed', 'false');
    }
    expect(screen.getByRole('button', { name: 'Align Left' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByLabelText('Font Size')).toHaveValue('1');
    expect((screen.getByLabelText('Highlight Color picker').closest('details')!.querySelector('.toolbar-color-indicator') as HTMLElement).style.backgroundColor).toBe('transparent');
  });

  it('tracks stored marks at a cursor and undo without changing selection', () => {
    setup();
    act(() => { editor.commands.setTextSelection({ from: 1, to: 4 }); });
    fireEvent.click(screen.getByRole('button', { name: 'Bold' }));
    expect(editor.state.selection.from).toBe(1);
    expect(editor.state.selection.to).toBe(4);
    expect(screen.getByRole('button', { name: 'Bold' })).toHaveAttribute('aria-pressed', 'true');
    act(() => { editor.commands.undo(); });
    expect(screen.getByRole('button', { name: 'Bold' })).toHaveAttribute('aria-pressed', 'false');
    act(() => { editor.commands.setTextSelection(2); editor.commands.toggleSubscript(); });
    expect(screen.getByRole('button', { name: 'Subscript' })).toHaveAttribute('aria-pressed', 'true');
  });

  it('shows numeric sizes, applies colors in ARGB and has no link-formatting button', () => {
    setup();
    expect(screen.getAllByRole('option').map(option => option.textContent)).toEqual(['0.4', '0.6', '0.8', '1.0', '1.2', '1.4', '1.6', '1.8']);
    expect(screen.queryByRole('button', { name: 'Insert Link' })).not.toBeInTheDocument();
    act(() => { editor.commands.setTextSelection({ from: 1, to: 6 }); });
    fireEvent.change(screen.getByLabelText('Font Size'), { target: { value: '1.8' } });
    fireEvent.input(screen.getByLabelText('Text Color picker'), { target: { value: '#123456' } });
    fireEvent.input(screen.getByLabelText('Highlight Color picker'), { target: { value: '#abcdef' } });
    expect(editor.getAttributes('knifeFontSize').size).toBe(1.8);
    expect(editor.getAttributes('knifeTextColor').color).toBe('#ff123456');
    expect(editor.getAttributes('knifeHighlight').background).toBe('#ffabcdef');
    expect(editor.getHTML()).toContain('color: rgb(18, 52, 86)');
    expect(editor.getHTML()).toContain('background: rgb(171, 205, 239)');
    const html = editor.getHTML();
    act(() => { editor.commands.setContent(html); editor.commands.setTextSelection(2); });
    expect(editor.getAttributes('knifeTextColor').color).toBe('#ff123456');
    expect(editor.getAttributes('knifeHighlight').background).toBe('#ffabcdef');
  });

  it('removes only the chosen color formatting from a selection', () => {
    setup('<p><span style="color:#ff123456;background:#ffabcdef"><strong>styled</strong></span></p>');
    act(() => { editor.commands.setTextSelection({ from: 1, to: 7 }); });
    fireEvent.click(screen.getByLabelText('Text Color', { selector: 'summary' }));
    fireEvent.click(screen.getAllByRole('button', { name: /reset_color|Default|По умолчанию/ })[0]);
    expect(editor.getAttributes('knifeTextColor').color).toBeUndefined();
    expect(editor.getAttributes('knifeHighlight').background).toBe('#ffabcdef');
    expect(editor.isActive('bold')).toBe(true);
    fireEvent.click(screen.getByLabelText('Highlight Color', { selector: 'summary' }));
    fireEvent.click(screen.getAllByRole('button', { name: /reset_color|Default|По умолчанию/ })[1]);
    expect(editor.getAttributes('knifeHighlight').background).toBeUndefined();
    expect(editor.isActive('bold')).toBe(true);
  });

  it('updates list and quote state and still recognizes typed URLs', () => {
    setup('<ul><li><p>item</p></li></ul><blockquote><p>quote</p></blockquote><p>plain</p>');
    selectText('item');
    expect(screen.getByRole('button', { name: 'Bullet List' })).toHaveAttribute('aria-pressed', 'true');
    selectText('quote');
    expect(screen.getByRole('button', { name: 'Quote' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: 'Bullet List' })).toHaveAttribute('aria-pressed', 'false');
    act(() => { editor.commands.setContent('<p></p>'); editor.commands.insertContent('https://example.com '); });
    expect(editor.getHTML()).toContain('href="https://example.com"');
  });
});
