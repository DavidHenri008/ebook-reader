import { getDb } from "./db";
import type { RawExtractedBook, RawSection } from "../types/bookPages";
import type { BookTimingReporter } from "../types/performance";
import {
  getTimestamp,
  measureAsync,
  measureSync,
  reportTiming,
} from "../utils/timing";

const META_STORE = "extracted-books-raw" as const;
const SECTIONS_STORE = "extracted-sections" as const;

/**
 * Save a raw extracted book to the cache.
 * Each section is stored as an individual record so the structured-clone
 * step never needs to hold the entire book in memory at once.
 */
export async function saveRawBook(
  book: RawExtractedBook,
  onTiming?: BookTimingReporter,
): Promise<void> {
  const storedSections = measureSync(
    onTiming,
    "cache:prepare-sections",
    () =>
      book.sections.map((section) => ({
        bookId: book.bookId,
        index: section.index,
        href: section.href,
        html: new Blob([section.html], { type: "text/html;charset=utf-8" }),
        textLength: section.textLength,
        viewport: section.viewport,
      })),
    { detail: `${book.sections.length} sections, blob html` },
  );

  const db = await measureAsync(onTiming, "cache:open-db", () => getDb());
  const writeStartedAt = getTimestamp();
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

  try {
    await tx.done;
  } finally {
    reportTiming(onTiming, "cache:write-indexeddb", writeStartedAt, {
      detail: `${book.sections.length} sections`,
    });
  }
}

/**
 * Load a cached raw extracted book. Returns null if not cached.
 */
export async function loadRawBook(
  bookId: string,
  onTiming?: BookTimingReporter,
): Promise<RawExtractedBook | null> {
  const db = await measureAsync(onTiming, "cache:open-db", () => getDb());
  const meta = await measureAsync(
    onTiming,
    "cache:read-meta",
    () => db.get(META_STORE, bookId),
    { detail: bookId },
  );
  if (!meta) return null;

  const stored = await measureAsync(
    onTiming,
    "cache:read-sections",
    () => db.getAllFromIndex(SECTIONS_STORE, "byBook", bookId),
    { detail: bookId },
  );
  const sortStartedAt = getTimestamp();
  const sorted = stored.sort((a, b) => a.index - b.index);
  reportTiming(onTiming, "cache:sort-sections", sortStartedAt, {
    detail: `${sorted.length} sections`,
  });
  const htmlStrings = await measureAsync(
    onTiming,
    "cache:restore-section-html",
    () => Promise.all(sorted.map((section) => section.html.text())),
    { detail: `${sorted.length} blob sections` },
  );
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
