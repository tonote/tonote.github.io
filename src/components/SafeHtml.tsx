import { useMemo } from 'react';
import { purifyKnifeHtml } from '../editor/sanitize';

export interface SafeHtmlProps {
  html: string;
  className?: string;
}

/**
 * Renders sanitized HTML via dangerouslySetInnerHTML.
 * Uses Knife vocabulary sanitization while preserving explicit line breaks.
 */
export function SafeHtml({ html, className }: SafeHtmlProps) {
  const sanitized = useMemo(() => {
    const document = new DOMParser().parseFromString(purifyKnifeHtml(html), 'text/html');
    const structural = (node: Node | null) => node instanceof Element && ['UL', 'OL', 'LI', 'BLOCKQUOTE', 'DIV', 'P', 'BR'].includes(node.tagName);
    // Knife serialization inserts newlines around list markup. With pre-wrap
    // these become extra visible lines; actual blank lines are explicit <br>s.
    for (const parent of [document.body, ...document.body.querySelectorAll('*')]) {
      for (const child of Array.from(parent.childNodes)) {
        if (child.nodeType === Node.TEXT_NODE && !child.textContent?.trim()
          && (structural(child.previousSibling) || structural(child.nextSibling) || ['UL', 'OL'].includes(parent.tagName))) {
          child.remove();
        }
      }
    }
    return document.body.innerHTML;
  }, [html]);

  return (
    <div
      className={className}
      dangerouslySetInnerHTML={{ __html: sanitized }}
    />
  );
}
