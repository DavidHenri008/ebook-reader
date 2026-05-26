import { getDb } from "./db";
import type { RawExtractedBook, RawSection } from "../types/bookPages";

const META_STORE = "extracted-books-raw" as const;
const SECTIONS_STORE = "extracted-sections" as const;

// ---- compression helpers ----

async function compressString(str: string): Promise<ArrayBuffer> {
  const cs = new CompressionStream("deflate-raw");
  const writer = cs.writable.getWriter();
  void writer.write(new TextEncoder().encode(str));
  void writer.close();
  return new Response(cs.readable).arrayBuffer();
}

async function decompressString(buffer: ArrayBuffer): Promise<string> {
  const ds = new DecompressionStream("deflate-raw");
  const writer = ds.writable.getWriter();
  void writer.write(new Uint8Array(buffer));
  void writer.close();
  return new Response(ds.readable).text();
}

/**
 * Save a raw extracted book to the cache.
 * Each section is stored as an individual record so the structured-clone
 * step never needs to hold the entire book in memory at once.
 */
export async function saveRawBook(book: RawExtractedBook): Promise<void> {
  // Compress all HTML in parallel before opening the IDB transaction.
  // Awaiting inside a transaction would cause it to auto-commit prematurely.
  const compressedHtml = await Promise.all(
    book.sections.map((s) => compressString(s.html)),
  );

  const db = await getDb();
  const tx = db.transaction([META_STORE, SECTIONS_STORE], "readwrite");

  tx.objectStore(META_STORE).put({
    bookId: book.bookId,
    sectionCount: book.sections.length,
    toc: book.toc,
    extractedAt: book.extractedAt,
  });

  for (let i = 0; i < book.sections.length; i++) {
    const section = book.sections[i];
    tx.objectStore(SECTIONS_STORE).put({
      bookId: book.bookId,
      index: section.index,
      href: section.href,
      html: compressedHtml[i],
      textLength: section.textLength,
      viewport: section.viewport,
    });
  }

  await tx.done;
}

/**
 * Load a cached raw extracted book. Returns null if not cached.
 */
export async function loadRawBook(
  bookId: string,
): Promise<RawExtractedBook | null> {
  const db = await getDb();
  const meta = await db.get(META_STORE, bookId);
  if (!meta) return null;

  const stored = await db.getAllFromIndex(SECTIONS_STORE, "byBook", bookId);
  const sorted = stored.sort((a, b) => a.index - b.index);
  const htmlStrings = await Promise.all(
    sorted.map((s) => decompressString(s.html)),
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
