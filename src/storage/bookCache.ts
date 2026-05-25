import { openDB, type IDBPDatabase } from "idb";
import type { RawExtractedBook, RawSection } from "../types/bookPages";

const DB_NAME = "epub-reader-pages";
const DB_VERSION = 4;
const META_STORE = "extracted-books-raw";
const SECTIONS_STORE = "extracted-sections";

// ---- stored shapes ----

import type { TocItem } from "../types/epub";

interface StoredMeta {
  bookId: string;
  sectionCount: number;
  toc: TocItem[];
  extractedAt: number;
}

interface StoredSection {
  bookId: string;
  index: number;
  href: string;
  html: string;
  viewport?: { width: number; height: number };
}

interface RawBooksSchema {
  [META_STORE]: {
    key: string;
    value: StoredMeta;
  };
  [SECTIONS_STORE]: {
    key: [string, number];
    value: StoredSection;
    indexes: { byBook: string };
  };
}

type RawBooksDB = IDBPDatabase<RawBooksSchema>;

let dbPromise: Promise<RawBooksDB> | null = null;

function getDb(): Promise<RawBooksDB> {
  if (!dbPromise) {
    dbPromise = openDB<RawBooksSchema>(DB_NAME, DB_VERSION, {
      upgrade(db, oldVersion) {
        // v1 -> v2: remove the very first legacy store
        if (oldVersion < 2) {
          if (db.objectStoreNames.contains("extracted-books")) {
            db.deleteObjectStore("extracted-books");
          }
        }
        // v2 -> v3: old schema stored all sections in a single record -- too
        // large for many books. Drop and recreate with per-section layout.
        // v3 -> v4: sections now store per-section viewport metadata.
        if (oldVersion < 4) {
          if (db.objectStoreNames.contains(META_STORE)) {
            db.deleteObjectStore(META_STORE);
          }
          if (db.objectStoreNames.contains(SECTIONS_STORE)) {
            db.deleteObjectStore(SECTIONS_STORE);
          }
        }
        if (!db.objectStoreNames.contains(META_STORE)) {
          db.createObjectStore(META_STORE, { keyPath: "bookId" });
        }
        if (!db.objectStoreNames.contains(SECTIONS_STORE)) {
          const store = db.createObjectStore(SECTIONS_STORE, {
            keyPath: ["bookId", "index"],
          });
          store.createIndex("byBook", "bookId");
        }
      },
    });
  }
  return dbPromise;
}

/**
 * Save a raw extracted book to the cache.
 * Each section is stored as an individual record so the structured-clone
 * step never needs to hold the entire book in memory at once.
 */
export async function saveRawBook(book: RawExtractedBook): Promise<void> {
  const db = await getDb();
  const tx = db.transaction([META_STORE, SECTIONS_STORE], "readwrite");

  tx.objectStore(META_STORE).put({
    bookId: book.bookId,
    sectionCount: book.sections.length,
    toc: book.toc,
    extractedAt: book.extractedAt,
  });

  for (const section of book.sections) {
    tx.objectStore(SECTIONS_STORE).put({
      bookId: book.bookId,
      index: section.index,
      href: section.href,
      html: section.html,
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
  const sections: RawSection[] = stored
    .sort((a, b) => a.index - b.index)
    .map((section) => ({
      index: section.index,
      href: section.href,
      html: section.html,
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
