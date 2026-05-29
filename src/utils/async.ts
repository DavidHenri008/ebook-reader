/**
 * Scheduling primitives for yielding control back to the browser.
 */

/** Yields to the browser via a macrotask so pending work (e.g. IndexedDB or
 * extraction loops) does not block the main thread for too long. */
export function yieldToBrowser(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

/** Waits for two animation frames so the reader can paint a layout/scroll
 * change before continuing. */
export function yieldToReaderPaint(): Promise<void> {
  return new Promise((resolve) => {
    requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
  });
}
