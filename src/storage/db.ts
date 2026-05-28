import { openDB, type IDBPDatabase } from "idb";
import type { StoredBook } from "../types/library";
import type { StoredReadingState } from "../types/storage";
import type { TocItem } from "../types/epub";

const DB_NAME = "epub-reader";
const DB_VERSION = 1;

// ---- section cache shapes ----

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
  html: ArrayBuffer | string;
  compression?: "deflate-raw" | "none";
  textLength: number;
  viewport?: { width: number; height: number };
}

// ---- schema ----

export interface EpubReaderSchema {
  library: {
    key: string;
    value: StoredBook;
    indexes: { addedAt: number; lastOpenedAt: number };
  };
  "reading-state": {
    key: string;
    value: StoredReadingState;
  };
  "extracted-books-raw": {
    key: string;
    value: StoredMeta;
  };
  "extracted-sections": {
    key: [string, number];
    value: StoredSection;
    indexes: { byBook: string };
  };
}

export type EpubReaderDB = IDBPDatabase<EpubReaderSchema>;

let dbPromise: Promise<EpubReaderDB> | null = null;

export function getDb(): Promise<EpubReaderDB> {
  if (!dbPromise) {
    dbPromise = openDB<EpubReaderSchema>(DB_NAME, DB_VERSION, {
      upgrade(db) {
        db.createObjectStore("reading-state", { keyPath: "bookId" });
        const library = db.createObjectStore("library", { keyPath: "id" });
        library.createIndex("addedAt", "addedAt");
        library.createIndex("lastOpenedAt", "lastOpenedAt");
        db.createObjectStore("extracted-books-raw", { keyPath: "bookId" });
        const sections = db.createObjectStore("extracted-sections", {
          keyPath: ["bookId", "index"],
        });
        sections.createIndex("byBook", "bookId");
      },
    }).then((db) => {
      db.addEventListener("versionchange", () => {
        db.close();
        dbPromise = null;
      });
      return db;
    });
  }
  return dbPromise;
}
