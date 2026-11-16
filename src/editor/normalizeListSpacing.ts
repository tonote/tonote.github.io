/** A standalone Knife <br> between lists represents one empty line, not a
 * paragraph containing a hard break (which ProseMirror renders as two lines). */
export function normalizeListSpacing(html: string): string {
  const document = new DOMParser().parseFromString(html, 'text/html');
  let changed = false;
  for (const list of document.querySelectorAll('ul, ol')) {
    const breaks: Element[] = [];
    let next = list.nextSibling;
    while (next) {
      if (next.nodeType === Node.TEXT_NODE && !next.textContent?.trim()) {
        next = next.nextSibling;
      } else if (next instanceof Element && next.tagName === 'BR') {
        breaks.push(next);
        next = next.nextSibling;
      } else break;
    }
    if (!(next instanceof Element) || !['UL', 'OL'].includes(next.tagName)) continue;
    for (const br of breaks) {
      br.replaceWith(document.createElement('p'));
      changed = true;
    }
  }
  return changed ? document.body.innerHTML : html;
}
