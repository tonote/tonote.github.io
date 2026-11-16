import { SearchMatches, searchMatchesKey } from './extensions/SearchMatches';
import { useEditor, EditorContent, type Editor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Underline from '@tiptap/extension-underline';
import Subscript from '@tiptap/extension-subscript';
import Superscript from '@tiptap/extension-superscript';
import Link from '@tiptap/extension-link';
import TextAlign from '@tiptap/extension-text-align';
import { useCallback, useEffect } from 'react';
import { KnifeFontSize } from './extensions/FontSize';
import { KnifeTextColor } from './extensions/TextColor';
import { KnifeHighlight } from './extensions/Highlight';
import { serialize } from './knife/serialize';
import { proseMirrorDocToKnifeDoc } from './tiptapBridge';
import { EditorToolbar } from '../components/EditorToolbar';
import { normalizeListSpacing } from './normalizeListSpacing';

export interface RichTextEditorProps {
  initialHtml?: string;
  onChange?: (html: string) => void;
  className?: string;
  query?: string;
  readOnly?: boolean;
}

export function RichTextEditor({ initialHtml = '', onChange, className, query = '', readOnly = false }: RichTextEditorProps) {

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: false, // Knife serializes headings as font-size + bold
        link: false,
        underline: false,
        trailingNode: false, // Do not append an empty paragraph to imported lists on initialization.
      }),
      Underline,
      Subscript,
      Superscript,
      Link.configure({
        autolink: true,
        linkOnPaste: true,
        openOnClick: false,
        HTMLAttributes: { rel: null, target: null },
      }),
      TextAlign.configure({
        types: ['paragraph', 'heading'],
      }),
      KnifeFontSize,
      KnifeTextColor,
      KnifeHighlight,
      SearchMatches,
    ],
    content: normalizeListSpacing(initialHtml),
    editable: !readOnly,
    editorProps: {
      attributes: {
        class: 'prose-mirror-content',
      },
    },
    onUpdate: ({ editor }) => {
      if (!onChange) return;
      // Publish edits synchronously so an immediate Save includes the last keystroke.
      const knifeDoc = proseMirrorDocToKnifeDoc(editor.state.doc);
      const html = serialize(knifeDoc);
      onChange(html);

    },
  });

  useEffect(() => {
    if (editor) editor.view.dispatch(editor.state.tr.setMeta(searchMatchesKey, query));
  }, [editor, query]);

  // Changing editability is a view update, not a content edit. Emitting update
  // here reserializes imported HTML and incorrectly marks an untouched note dirty.
  useEffect(() => { editor?.setEditable(!readOnly, false); }, [editor, readOnly]);

  const handleToolbarCommand = useCallback((command: (ed: Editor) => void) => {
    if (editor) {
      command(editor);
      editor.commands.focus();
    }
  }, [editor]);

  return (
    <div className={`rich-text-editor ${className ?? ''}`}>
      {!readOnly && <EditorToolbar editor={editor} onCommand={handleToolbarCommand} />}
      <EditorContent editor={editor} />
    </div>
  );
}
