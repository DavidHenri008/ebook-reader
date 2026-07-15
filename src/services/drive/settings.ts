import type { DriveSettingsDocument, Theme } from "../../types";
import { readDriveJsonFile, updateDriveJsonFile } from "./driveClient";

const SETTINGS_APP_PROPERTIES = {
  ebookReaderApp: "ebook-reader",
  ebookReaderRole: "settings",
};

let cachedSettings: DriveSettingsDocument | null = null;
let settingsFileId: string | null = null;
let pendingTimer: number | null = null;

export function createDefaultSettings(
  theme: Theme = "dark",
): DriveSettingsDocument {
  return {
    schemaVersion: 1,
    theme,
    perBook: {},
    updatedAt: Date.now(),
  };
}

export function getSettingsAppProperties(
  accountSub: string,
): Record<string, string> {
  return { ...SETTINGS_APP_PROPERTIES, accountSub };
}

export async function loadDriveSettings(
  fileId: string,
): Promise<DriveSettingsDocument> {
  settingsFileId = fileId;
  cachedSettings = normalizeSettings(
    await readDriveJsonFile<DriveSettingsDocument>(fileId),
  );
  return cachedSettings;
}

export function setCachedDriveSettings(
  fileId: string,
  settings: DriveSettingsDocument,
): void {
  settingsFileId = fileId;
  cachedSettings = normalizeSettings(settings);
}

export function getCachedDriveSettings(): DriveSettingsDocument | null {
  return cachedSettings;
}

export async function updateDriveSettings(
  mutate: (settings: DriveSettingsDocument) => DriveSettingsDocument,
  debounceMs = 0,
): Promise<DriveSettingsDocument> {
  if (!cachedSettings || !settingsFileId) {
    throw new Error("Google Drive settings are not loaded.");
  }
  cachedSettings = normalizeSettings({
    ...mutate(cloneSettings(cachedSettings)),
    updatedAt: Date.now(),
  });
  if (debounceMs > 0) {
    scheduleSettingsWrite(debounceMs);
    return cachedSettings;
  }
  await flushSettingsWrite();
  return cachedSettings;
}

export async function flushSettingsWrite(): Promise<void> {
  if (pendingTimer !== null) {
    window.clearTimeout(pendingTimer);
    pendingTimer = null;
  }
  if (!cachedSettings || !settingsFileId) return;
  await updateDriveJsonFile(
    settingsFileId,
    cachedSettings,
    SETTINGS_APP_PROPERTIES,
  );
}

function scheduleSettingsWrite(debounceMs: number): void {
  if (pendingTimer !== null) window.clearTimeout(pendingTimer);
  pendingTimer = window.setTimeout(() => {
    pendingTimer = null;
    void flushSettingsWrite();
  }, debounceMs);
}

function normalizeSettings(
  settings: DriveSettingsDocument,
): DriveSettingsDocument {
  return {
    schemaVersion: 1,
    theme: settings.theme === "light" ? "light" : "dark",
    perBook: settings.perBook ?? {},
    updatedAt: settings.updatedAt ?? Date.now(),
  };
}

function cloneSettings(settings: DriveSettingsDocument): DriveSettingsDocument {
  return {
    ...settings,
    perBook: Object.fromEntries(
      Object.entries(settings.perBook).map(([bookId, state]) => [
        bookId,
        { ...state },
      ]),
    ),
  };
}
