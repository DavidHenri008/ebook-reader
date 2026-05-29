import type { ReadingState, StoredReadingState, Theme } from "../types/storage";
import { getDb } from "./db";

const STORE_NAME = "reading-state";
export const THEME_STORAGE_KEY = "app-theme";

/** Default color theme when none is stored in localStorage. */
const DEFAULT_THEME: Theme = "dark";

/** Default reading state for new books */
const defaultReadingState: ReadingState = {
  lastLocation: undefined,
  zoom: 100,
  mode: "paginated",
};

function isTheme(value: string | null): value is Theme {
  return value === "light" || value === "dark";
}

export function getCurrentLibraryTheme(): Theme {
  const storedTheme = localStorage.getItem(THEME_STORAGE_KEY);
  return isTheme(storedTheme) ? storedTheme : DEFAULT_THEME;
}

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
  const tx = db.transaction(STORE_NAME, "readwrite");
  const existing = await tx.store.get(bookId);

  const storedState: StoredReadingState = {
    ...defaultReadingState,
    ...existing,
    ...state,
    bookId,
    updatedAt: Date.now(),
  };

  await tx.store.put(storedState);
  await tx.done;
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
    lastLocation: state.lastLocation,
    zoom: state.zoom ?? defaultReadingState.zoom,
    mode: state.mode ?? defaultReadingState.mode,
  };
}
