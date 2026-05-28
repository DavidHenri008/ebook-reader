import type { ReadingState, StoredReadingState, Theme } from "../types/storage";
import { getDb } from "./db";

const STORE_NAME = "reading-state";
export const THEME_STORAGE_KEY = "app-theme";

/** Default reading state for new books */
export const defaultReadingState: ReadingState = {
  lastLocation: undefined,
  theme: "light",
  zoom: 100,
  mode: "paginated",
};

function isTheme(value: string | null): value is Theme {
  return value === "light" || value === "dark";
}

export function getCurrentLibraryTheme(): Theme {
  const storedTheme = localStorage.getItem(THEME_STORAGE_KEY);
  return isTheme(storedTheme) ? storedTheme : defaultReadingState.theme;
}

function getDefaultReadingState(
  theme = getCurrentLibraryTheme(),
): ReadingState {
  return {
    ...defaultReadingState,
    theme,
  };
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
  const defaultState = getDefaultReadingState();

  const storedState: StoredReadingState = {
    ...defaultState,
    ...existing,
    ...state,
    theme: state.theme ?? defaultState.theme,
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
export async function loadReadingState(
  bookId: string,
  defaultTheme = getCurrentLibraryTheme(),
): Promise<ReadingState> {
  const db = await getDb();
  const state = await db.get(STORE_NAME, bookId);

  if (!state) {
    return getDefaultReadingState(defaultTheme);
  }

  return {
    lastLocation: state.lastLocation,
    theme: defaultTheme,
    zoom: state.zoom ?? defaultReadingState.zoom,
    mode: state.mode ?? defaultReadingState.mode,
  };
}
