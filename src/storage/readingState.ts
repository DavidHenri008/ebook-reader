import type { ReadingState, StoredReadingState } from "../types/storage";
import { getDb } from "./db";

const STORE_NAME = "reading-state";

/** Default reading state for new books */
export const defaultReadingState: ReadingState = {
  lastLocationCfi: undefined,
  zoom: 100,
  theme: "light",
};

/**
 * Save reading state for a book
 * @param bookId Unique identifier for the book (e.g. filename or hash)
 * @param state Reading state to save
 */
export async function saveReadingState(
  bookId: string,
  state: Partial<ReadingState>,
): Promise<void> {
  const db = await getDb();
  const existing = await db.get(STORE_NAME, bookId);

  const storedState: StoredReadingState = {
    ...defaultReadingState,
    ...existing,
    ...state,
    bookId,
    updatedAt: Date.now(),
  };

  await db.put(STORE_NAME, storedState);
}

/**
 * Load reading state for a book
 * @param bookId Unique identifier for the book
 * @returns Reading state or default state if not found
 */
export async function loadReadingState(bookId: string): Promise<ReadingState> {
  const db = await getDb();
  const state = await db.get(STORE_NAME, bookId);

  if (!state) {
    return { ...defaultReadingState };
  }

  return {
    lastLocationCfi: state.lastLocationCfi,
    zoom: Number.isFinite(state.zoom) ? state.zoom : defaultReadingState.zoom,
    theme: state.theme,
  };
}

/**
 * Delete reading state for a book
 * @param bookId Unique identifier for the book
 */
export async function deleteReadingState(bookId: string): Promise<void> {
  const db = await getDb();
  await db.delete(STORE_NAME, bookId);
}

/**
 * Get all stored book IDs
 * @returns Array of book IDs with saved reading state
 */
export async function getAllBookIds(): Promise<string[]> {
  const db = await getDb();
  const keys = await db.getAllKeys(STORE_NAME);
  return keys as string[];
}
