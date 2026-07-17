import type { ReadingState, Theme } from "../types/storage";
import {
  ensureDriveLibrary,
  getCachedDriveSettings,
  updateDriveSettings,
} from "../services/drive";

export const THEME_STORAGE_KEY = "app-theme";

const DEFAULT_THEME: Theme = "dark";
const SETTINGS_WRITE_DEBOUNCE_MS = 2000;

const defaultReadingState: ReadingState = {
  lastLocation: undefined,
  zoom: 100,
  mode: "scrolled",
};

function isTheme(value: string | null): value is Theme {
  return value === "light" || value === "dark";
}

export function getCurrentLibraryTheme(): Theme {
  const storedTheme = localStorage.getItem(THEME_STORAGE_KEY);
  return isTheme(storedTheme) ? storedTheme : DEFAULT_THEME;
}

export async function loadLibraryTheme(): Promise<Theme> {
  await ensureDriveLibrary({ promptIfMissing: false });
  const settings = getCachedDriveSettings();
  return settings?.theme ?? getCurrentLibraryTheme();
}

export async function saveLibraryTheme(theme: Theme): Promise<void> {
  localStorage.setItem(THEME_STORAGE_KEY, theme);
  await ensureDriveLibrary({ promptIfMissing: false });
  await updateDriveSettings(
    (settings) => ({ ...settings, theme }),
    SETTINGS_WRITE_DEBOUNCE_MS,
  );
}

export async function saveReadingState(
  bookId: string,
  state: Partial<ReadingState>,
): Promise<void> {
  await ensureDriveLibrary({ promptIfMissing: false });
  await updateDriveSettings(
    (settings) => ({
      ...settings,
      perBook: {
        ...settings.perBook,
        [bookId]: {
          ...defaultReadingState,
          ...settings.perBook[bookId],
          ...state,
          updatedAt: Date.now(),
        },
      },
    }),
    SETTINGS_WRITE_DEBOUNCE_MS,
  );
}

export async function loadReadingState(bookId: string): Promise<ReadingState> {
  await ensureDriveLibrary({ promptIfMissing: false });
  const stored = getCachedDriveSettings()?.perBook[bookId];
  if (!stored) return { ...defaultReadingState };
  return {
    lastLocation: stored.lastLocation,
    zoom: stored.zoom ?? defaultReadingState.zoom,
    mode: stored.mode ?? defaultReadingState.mode,
  };
}

export async function deleteReadingState(bookId: string): Promise<void> {
  await ensureDriveLibrary({ promptIfMissing: false });
  await updateDriveSettings((settings) => {
    const nextPerBook = { ...settings.perBook };
    delete nextPerBook[bookId];
    return { ...settings, perBook: nextPerBook };
  });
}
