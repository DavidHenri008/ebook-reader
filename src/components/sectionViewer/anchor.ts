/**
 * Anchor utilities: text-walker helpers for finding and restoring read positions,
 * plus a cross-browser idle scheduler.
 */

export function isReadableTextNode(node: Text): boolean {
  const parent = node.parentElement;
  return !parent?.closest("style,script,noscript,head,title,meta,link");
}

/**
 * Walk text nodes inside `root` and return the char offset of the first
 * text node whose bounding rect is at least partially inside
 * [viewTop, viewBottom] and [viewLeft, viewRight] in viewport coords.
 */
export function getTopmostVisibleAnchor(
  root: Element,
  viewTop: number,
  viewBottom: number,
  viewLeft = Number.NEGATIVE_INFINITY,
  viewRight = Number.POSITIVE_INFINITY,
): number {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, null);
  let charOffset = 0;
  let node: Text | null;
  while ((node = walker.nextNode() as Text | null)) {
    if (!isReadableTextNode(node)) continue;
    const len = node.textContent?.length ?? 0;
    if (len > 0) {
      const range = document.createRange();
      range.selectNodeContents(node);
      const rects = range.getClientRects();
      for (let i = 0; i < rects.length; i++) {
        const r = rects[i];
        if (
          r.width > 0 &&
          r.bottom > viewTop &&
          r.top < viewBottom &&
          r.right > viewLeft &&
          r.left < viewRight
        ) {
          return charOffset;
        }
      }
    }
    charOffset += len;
  }
  return charOffset;
}

/**
 * Walk text nodes inside `root` and find the node + in-node offset
 * corresponding to `targetOffset` total characters.
 */
export function findNodeAtOffset(
  root: Element,
  targetOffset: number,
): { node: Text; offsetInNode: number } | null {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, null);
  let charOffset = 0;
  let node: Text | null;
  while ((node = walker.nextNode() as Text | null)) {
    if (!isReadableTextNode(node)) continue;
    const len = node.textContent?.length ?? 0;
    if (charOffset + len > targetOffset) {
      return { node, offsetInNode: targetOffset - charOffset };
    }
    charOffset += len;
  }
  return null;
}

export function getTopmostVisibleSection(
  root: Element,
  viewTop: number,
  viewBottom: number,
): HTMLElement | null {
  let best: HTMLElement | null = null;
  let bestTop = Number.POSITIVE_INFINITY;

  Array.from(
    root.querySelectorAll<HTMLElement>("[data-section-index]"),
  ).forEach((element) => {
    const rect = element.getBoundingClientRect();
    if (rect.width === 0 && rect.height === 0) return;
    if (rect.bottom <= viewTop || rect.top >= viewBottom) return;

    const visibleTop = Math.max(rect.top, viewTop);
    if (visibleTop < bestTop) {
      best = element;
      bestTop = visibleTop;
    }
  });

  return best;
}

/**
 * Schedule `fn` to run during an idle period (via `requestIdleCallback` if
 * available, falling back to a 300 ms `setTimeout`).
 * Returns a handle whose `cancel()` method aborts the pending call.
 */
export function scheduleIdle(fn: () => void): { cancel: () => void } {
  if (typeof requestIdleCallback !== "undefined") {
    const id = requestIdleCallback(fn, { timeout: 1000 });
    return { cancel: () => cancelIdleCallback(id) };
  }
  const id = setTimeout(fn, 300);
  return { cancel: () => clearTimeout(id) };
}
