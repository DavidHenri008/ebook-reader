import { getDb, type EpubReaderDB } from "./db";
import type { RawExtractedBook, RawSection } from "../types/bookPages";
import {
  containsBrowserBlobUrl,
  getFirstBrowserBlobUrl,
} from "../utils/htmlReferences";
import { yieldToBrowser } from "../utils/async";

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
  if (
    !onProgress ||
    (done !== 0 && done !== total && done % RESTORE_BATCH_SIZE !== 0)
  )
    return;
  onProgress(done, total, `Loading cached book... ${done} / ${total} sections`);
}

async function deleteRawBookRecords(
  db: EpubReaderDB,
  bookId: string,
): Promise<void> {
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
 * Save a raw extracted book to the cache.
 * Each section is stored as an individual record so the structured-clone
 * step never needs to hold the entire book in memory at once.
 */
export async function saveRawBook(book: RawExtractedBook): Promise<void> {
  const invalidSection = book.sections.find((section) =>
    containsBrowserBlobUrl(section.html),
  );
  if (invalidSection) {
    throw new Error(
      `Refusing to cache extracted book ${book.bookId}: section ${invalidSection.index} contains a temporary browser blob URL (${getFirstBrowserBlobUrl(invalidSection.html)}).`,
    );
  }

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
    styles: book.styles,
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
  if (sorted.length !== meta.sectionCount) {
    await deleteRawBookRecords(db, bookId);
    return null;
  }

  let restoredCount = 0;
  reportCacheProgress(onProgress, restoredCount, sorted.length);
  const htmlStrings = new Array<string>(sorted.length);
  let hasTemporaryBlobUrl = false;

  for (let start = 0; start < sorted.length; start += RESTORE_BATCH_SIZE) {
    const batch = sorted.slice(start, start + RESTORE_BATCH_SIZE);
    const batchHtml = await Promise.all(
      batch.map((section) => section.html.text()),
    );

    batchHtml.forEach((html, offset) => {
      htmlStrings[start + offset] = html;
      if (containsBrowserBlobUrl(html)) {
        hasTemporaryBlobUrl = true;
      }
    });
    restoredCount += batch.length;
    reportCacheProgress(onProgress, restoredCount, sorted.length);
    await yieldToBrowser();
  }

  if (hasTemporaryBlobUrl) {
    await deleteRawBookRecords(db, bookId);
    return null;
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
    styles: meta.styles ?? [],
    toc: meta.toc ?? [],
    extractedAt: meta.extractedAt,
  };
}

/**
 * Delete cached extraction for a book.
 */
export async function deleteRawBook(bookId: string): Promise<void> {
  const db = await getDb();
  await deleteRawBookRecords(db, bookId);
}

/**
 * Returns true when a cached extraction already exists for the book.
 */
export async function hasRawBook(bookId: string): Promise<boolean> {
  const db = await getDb();
  const key = await db.getKey(META_STORE, bookId);
  return key !== undefined;
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
