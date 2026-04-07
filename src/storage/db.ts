import { openDB, type IDBPDatabase } from "idb";
import type { StoredBook } from "../types/library";
import type { StoredReadingState } from "../types/storage";

const DB_NAME = "epub-reader";
const DB_VERSION = 3;

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
}

export type EpubReaderDB = IDBPDatabase<EpubReaderSchema>;

let dbPromise: Promise<EpubReaderDB> | null = null;

/**
 * Get or create the shared IndexedDB database connection.
 * Uses a singleton pattern to reuse the same connection across calls.
 * @returns Promise resolving to the database instance
 */
export function getDb(): Promise<EpubReaderDB> {
  if (!dbPromise) {
    dbPromise = openDB<EpubReaderSchema>(DB_NAME, DB_VERSION, {
      upgrade(db, oldVersion) {
        if (oldVersion < 1) {
          db.createObjectStore("reading-state", { keyPath: "bookId" });
        }
        if (oldVersion < 2) {
          const store = db.createObjectStore("library", { keyPath: "id" });
          store.createIndex("addedAt", "addedAt");
          store.createIndex("lastOpenedAt", "lastOpenedAt");
        }
        // v3: recover DBs that reached v2 without the reading-state store
        if (oldVersion < 3 && !db.objectStoreNames.contains("reading-state")) {
          db.createObjectStore("reading-state", { keyPath: "bookId" });
        }
      },
    });
  }
  return dbPromise;
}
