import { getDb } from "./db";
import type { RawExtractedBook, RawSection } from "../types/bookPages";

const META_STORE = "extracted-books-raw" as const;
const SECTIONS_STORE = "extracted-sections" as const;
const RESTORE_BATCH_SIZE = 8;

type CacheLoadProgress = (
  done: number,
  total: number,
  message?: string,
) => void;

function reportCacheProgress(
  onProgress: CacheLoadProgress | undefined,
  done: number,
  total: number,
): void {
  if (!onProgress || (done !== 0 && done !== total && done % 8 !== 0)) return;
  onProgress(done, total, `Loading cached book... ${done} / ${total} sections`);
}

function yieldToBrowser(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

/**
 * Save a raw extracted book to the cache.
 * Each section is stored as an individual record so the structured-clone
 * step never needs to hold the entire book in memory at once.
 */
export async function saveRawBook(book: RawExtractedBook): Promise<void> {
  const storedSections = book.sections.map((section) => ({
    bookId: book.bookId,
    index: section.index,
    href: section.href,
    html: new Blob([section.html], { type: "text/html;charset=utf-8" }),
    textLength: section.textLength,
    viewport: section.viewport,
  }));

  const db = await getDb();
  const tx = db.transaction([META_STORE, SECTIONS_STORE], "readwrite");

  tx.objectStore(META_STORE).put({
    bookId: book.bookId,
    sectionCount: book.sections.length,
    toc: book.toc,
    extractedAt: book.extractedAt,
  });

  for (const section of storedSections) {
    tx.objectStore(SECTIONS_STORE).put(section);
  }

  await tx.done;
}

/**
 * Load a cached raw extracted book. Returns null if not cached.
 */
export async function loadRawBook(
  bookId: string,
  onProgress?: CacheLoadProgress,
): Promise<RawExtractedBook | null> {
  const db = await getDb();
  const meta = await db.get(META_STORE, bookId);
  if (!meta) return null;

  const stored = await db.getAllFromIndex(SECTIONS_STORE, "byBook", bookId);
  const sorted = stored.sort((a, b) => a.index - b.index);
  let restoredCount = 0;
  reportCacheProgress(onProgress, restoredCount, sorted.length);
  const htmlStrings = new Array<string>(sorted.length);

  for (let start = 0; start < sorted.length; start += RESTORE_BATCH_SIZE) {
    const batch = sorted.slice(start, start + RESTORE_BATCH_SIZE);
    const batchHtml = await Promise.all(
      batch.map((section) => section.html.text()),
    );

    batchHtml.forEach((html, offset) => {
      htmlStrings[start + offset] = html;
    });
    restoredCount += batch.length;
    reportCacheProgress(onProgress, restoredCount, sorted.length);
    await yieldToBrowser();
  }

  const sections: RawSection[] = sorted.map((section, i) => ({
    index: section.index,
    href: section.href,
    html: htmlStrings[i],
    textLength: section.textLength,
    viewport: section.viewport,
  }));

  return {
    bookId,
    sections,
    toc: meta.toc ?? [],
    extractedAt: meta.extractedAt,
  };
}

/**
 * Delete cached extraction for a book.
 */
export async function deleteRawBook(bookId: string): Promise<void> {
  const db = await getDb();
  // Collect section primary keys first (read), then delete in a write tx.
  const sectionKeys = await db.getAllKeysFromIndex(
    SECTIONS_STORE,
    "byBook",
    bookId,
  );

  const tx = db.transaction([META_STORE, SECTIONS_STORE], "readwrite");
  tx.objectStore(META_STORE).delete(bookId);
  for (const key of sectionKeys) {
    tx.objectStore(SECTIONS_STORE).delete(key);
  }
  await tx.done;
}

/**
 * Clear all cached extractions for every book.
 */
export async function clearAllRawBooks(): Promise<void> {
  const db = await getDb();
  const tx = db.transaction([META_STORE, SECTIONS_STORE], "readwrite");
  tx.objectStore(META_STORE).clear();
  tx.objectStore(SECTIONS_STORE).clear();
  await tx.done;
}
