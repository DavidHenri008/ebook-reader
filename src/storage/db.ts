import { openDB, type IDBPDatabase } from "idb";
import type { TocItem } from "../types/epub";

const DB_NAME = "epub-reader";
const DB_VERSION = 2;

// ---- section cache shapes ----

interface StoredMeta {
  bookId: string;
  sectionCount: number;
  styles?: string[];
  toc: TocItem[];
  extractedAt: number;
}

interface StoredSection {
  bookId: string;
  index: number;
  href: string;
  html: Blob;
  textLength: number;
  viewport?: { width: number; height: number };
}

// ---- schema ----

export interface EpubReaderSchema {
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
        if (db.objectStoreNames.contains("library")) {
          db.deleteObjectStore("library");
        }
        if (db.objectStoreNames.contains("reading-state")) {
          db.deleteObjectStore("reading-state");
        }
        if (!db.objectStoreNames.contains("extracted-books-raw")) {
          db.createObjectStore("extracted-books-raw", { keyPath: "bookId" });
        }
        if (!db.objectStoreNames.contains("extracted-sections")) {
          const sections = db.createObjectStore("extracted-sections", {
            keyPath: ["bookId", "index"],
          });
          sections.createIndex("byBook", "bookId");
        }
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
