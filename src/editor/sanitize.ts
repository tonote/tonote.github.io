import DOMPurify from 'dompurify';
import { parse } from './knife/parse';
import { serialize } from './knife/serialize';

const ALLOWED_TAGS = [
  'b', 'strong', 'i', 'em', 'cite', 'dfn', 'u', 'del', 's', 'strike',
  'sub', 'sup', 'span', 'ul', 'ol', 'li', 'blockquote', 'div',
  'a', 'br', 'p', 'big', 'small', 'font',
];

const ALLOWED_ATTR = ['style', 'href', 'color'];

/** Sanitize HTML to only allow Knife vocabulary, then normalize through parse+serialize. */
export function sanitizeKnifeHtml(html: string): string {
  if (!html.trim()) return '';

  // Step 1: Strip dangerous tags/attributes via DOMPurify
  const purified = purifyKnifeHtml(html);

  // Step 2: Normalize through Knife parse+serialize
  const doc = parse(purified);
  return serialize(doc);
}

/** Display HTML without changing its paragraph and explicit line-break structure. */
export function purifyKnifeHtml(html: string): string {
  return DOMPurify.sanitize(html, {
    ALLOWED_TAGS,
    ALLOWED_ATTR: [...ALLOWED_ATTR],
    ADD_URI_SAFE_ATTR: ['color'], // DOMPurify only allows URI-safe attrs; 'color' has hex values, not URIs
    ALLOWED_URI_REGEXP: /^(https?:|mailto:|tel:)/i,
    FORCE_BODY: false,
  });

}
