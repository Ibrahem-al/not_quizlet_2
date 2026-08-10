/**
 * Dependency-free, default-deny HTML sanitizer.
 *
 * StudyFlow renders sharer-authored card HTML to arbitrary anonymous viewers
 * via the no-auth `/shared/:token` routes. That HTML is untrusted, so every
 * render path funnels through {@link sanitizeHtml} (see `StudyContent`).
 *
 * Strategy (allowlist / default-deny):
 *  - Parse the input as an HTML document (no scripts run during parsing).
 *  - Remove dangerous elements (script, style, iframe, ...) outright.
 *  - Unwrap unknown elements, keeping only their text/children.
 *  - Strip every attribute except a tight per-tag allowlist, and always drop
 *    `on*` handlers and any value containing `javascript:`.
 *  - Return the sanitized `<body>` innerHTML (head content is never emitted).
 */

// Elements removed entirely, including their subtree.
const DANGEROUS_TAGS = new Set([
  'script',
  'style',
  'iframe',
  'object',
  'embed',
  'link',
  'meta',
  'base',
  'form',
  'svg',
  'math',
  'template',
  'noscript',
]);

// The only elements allowed to survive. Anything else is unwrapped.
const ALLOWED_TAGS = new Set([
  'p',
  'br',
  'b',
  'strong',
  'i',
  'em',
  'u',
  's',
  'strike',
  'mark',
  'span',
  'div',
  'h1',
  'h2',
  'h3',
  'h4',
  'h5',
  'h6',
  'ul',
  'ol',
  'li',
  'blockquote',
  'code',
  'pre',
  'a',
  'img',
  'sub',
  'sup',
  'hr',
]);

const HREF_ALLOWED = /^(https?:|mailto:|tel:|\/|#)/i;
const IMG_SRC_ALLOWED = /^(https?:|data:image\/)/i;

function stripAttributes(el: Element, tag: string): void {
  for (const attr of Array.from(el.attributes)) {
    const name = attr.name.toLowerCase();
    const rawValue = attr.value ?? '';
    // Whitespace/case-insensitive check for javascript: payloads.
    const collapsed = rawValue.replace(/\s+/g, '').toLowerCase();

    // Always drop event handlers and any javascript: URI, on any element.
    if (name.startsWith('on') || collapsed.includes('javascript:')) {
      el.removeAttribute(attr.name);
      continue;
    }

    let keep = false;
    if (tag === 'a') {
      if (name === 'href' && HREF_ALLOWED.test(rawValue.trim())) {
        keep = true;
      }
    } else if (tag === 'img') {
      if (name === 'src') {
        keep = IMG_SRC_ALLOWED.test(rawValue.trim());
      } else if (name === 'alt' || name === 'width' || name === 'height') {
        keep = true;
      }
    }

    if (!keep) {
      el.removeAttribute(attr.name);
    }
  }

  // Harden anchors: force safe rel + open in a new tab.
  if (tag === 'a') {
    el.setAttribute('rel', 'noopener noreferrer nofollow');
    el.setAttribute('target', '_blank');
  }
}

function unwrap(el: Element): void {
  const parent = el.parentNode;
  if (!parent) {
    el.remove();
    return;
  }
  while (el.firstChild) {
    parent.insertBefore(el.firstChild, el);
  }
  parent.removeChild(el);
}

function sanitizeChildren(node: Node): void {
  // Snapshot children first: processing mutates the live child list.
  for (const child of Array.from(node.childNodes)) {
    if (child.nodeType === Node.ELEMENT_NODE) {
      processElement(child as Element);
    } else if (child.nodeType !== Node.TEXT_NODE) {
      // Drop comments, processing instructions, etc. Keep text nodes.
      child.parentNode?.removeChild(child);
    }
  }
}

function processElement(el: Element): void {
  const tag = el.tagName.toLowerCase();

  if (DANGEROUS_TAGS.has(tag)) {
    el.remove();
    return;
  }

  if (ALLOWED_TAGS.has(tag)) {
    stripAttributes(el, tag);
    sanitizeChildren(el);
    return;
  }

  // Unknown tag: sanitize its subtree, then unwrap it to keep the text.
  sanitizeChildren(el);
  unwrap(el);
}

/**
 * Sanitize untrusted HTML into a safe subset for `dangerouslySetInnerHTML`.
 * Returns an empty string for empty input.
 */
export function sanitizeHtml(html: string): string {
  if (!html) return '';
  const doc = new DOMParser().parseFromString(html, 'text/html');
  sanitizeChildren(doc.body);
  return doc.body.innerHTML;
}
