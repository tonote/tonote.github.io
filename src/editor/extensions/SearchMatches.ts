import { Extension } from '@tiptap/core';
import { Plugin, PluginKey } from '@tiptap/pm/state';
import { Decoration, DecorationSet } from '@tiptap/pm/view';
import { findMatches } from '../../domain/findMatches';

export const searchMatchesKey = new PluginKey<string>('noteSearchMatches');

/** View-only decorations: search highlights are never part of saved HTML. */
export const SearchMatches = Extension.create({
  name: 'searchMatches',
  addProseMirrorPlugins() {
    return [new Plugin({
      key: searchMatchesKey,
      state: {
        init: () => '',
        apply: (transaction, query) => transaction.getMeta(searchMatchesKey) ?? query,
      },
      props: {
        decorations(state) {
          const query = searchMatchesKey.getState(state) ?? '';
          if (!query.trim()) return DecorationSet.empty;
          const decorations: Decoration[] = [];
          state.doc.descendants((node, position) => {
            if (!node.isTextblock) return;
            const text = node.textBetween(0, node.content.size, '', '\ufffc');
            for (const match of findMatches(text, query)) {
              decorations.push(Decoration.inline(position + 1 + match.from, position + 1 + match.to, { class: 'search-match' }));
            }
            return false;
          });
          return DecorationSet.create(state.doc, decorations);
        },
      },
    })];
  },
});
