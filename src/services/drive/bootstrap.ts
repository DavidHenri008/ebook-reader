import type { DriveLibraryInfo, DriveLibraryManifest } from "../../types";
import { getActiveGoogleUserSub } from "./session";
import {
  createDriveFolder,
  createDriveJsonFile,
  listDriveFilesByAppProperty,
} from "./driveClient";
import { pickLibraryFolder } from "./picker";
import {
  createEmptyManifest,
  getCachedDriveManifest,
  getManifestAppProperties,
  loadDriveManifest,
  setCachedDriveManifest,
  writeDriveManifest,
} from "./manifest";
import {
  createDefaultSettings,
  getSettingsAppProperties,
  loadDriveSettings,
  setCachedDriveSettings,
} from "./settings";

interface LocalDriveLibraryState {
  libraryFolderId: string;
  libraryFolderName?: string;
  appDataFolderId: string;
  manifestFileId: string;
  settingsFileId: string;
}

export class DriveLibraryNotConfiguredError extends Error {
  constructor() {
    super("Choose a Google Drive folder before loading the library.");
    this.name = "DriveLibraryNotConfiguredError";
  }
}

export async function ensureDriveLibrary(
  options: { promptIfMissing?: boolean } = {},
): Promise<DriveLibraryManifest> {
  const accountSub = getActiveGoogleUserSub();
  const localState = readLocalState(accountSub);
  if (localState) {
    const cachedManifest = getCachedDriveManifest();
    if (cachedManifest?.manifestFileId === localState.manifestFileId) {
      return cachedManifest;
    }
    return loadFromState(localState);
  }

  const recovered = await recoverDriveLibrary(accountSub);
  if (recovered) return recovered;

  if (!options.promptIfMissing) throw new DriveLibraryNotConfiguredError();
  return chooseDriveLibraryFolder();
}

export async function chooseDriveLibraryFolder(): Promise<DriveLibraryManifest> {
  const accountSub = getActiveGoogleUserSub();
  const folder = await pickLibraryFolder();
  if (!folder) throw new DriveLibraryNotConfiguredError();

  const appDataFolder = await createDriveFolder({
    name: "app-data",
    parentId: folder.id,
    appProperties: {
      ebookReaderApp: "ebook-reader",
      ebookReaderRole: "app-data",
      accountSub,
    },
  });

  const settings = createDefaultSettings();
  const settingsFile = await createDriveJsonFile({
    name: "settings.json",
    parentId: appDataFolder.id,
    body: settings,
    appProperties: getSettingsAppProperties(accountSub),
  });
  setCachedDriveSettings(settingsFile.id, settings);

  const manifest = createEmptyManifest(
    folder.id,
    folder.name,
    appDataFolder.id,
  );
  manifest.settingsFileId = settingsFile.id;
  const manifestFile = await createDriveJsonFile({
    name: "library.json",
    parentId: appDataFolder.id,
    body: manifest,
    appProperties: getManifestAppProperties(accountSub),
  });
  manifest.manifestFileId = manifestFile.id;
  setCachedDriveManifest(manifest);
  await writeDriveManifest(manifest);
  writeLocalState(accountSub, manifest);
  return manifest;
}

export async function reloadDriveLibrary(): Promise<DriveLibraryManifest> {
  const accountSub = getActiveGoogleUserSub();
  const localState = readLocalState(accountSub);
  if (!localState) return ensureDriveLibrary({ promptIfMissing: false });
  return loadFromState(localState);
}

export function getDriveLibraryInfo(
  manifest: DriveLibraryManifest,
): DriveLibraryInfo {
  return {
    folderId: manifest.libraryFolderId,
    folderName: manifest.libraryFolderName,
    appDataFolderId: manifest.appDataFolderId,
    manifestFileId: manifest.manifestFileId,
    settingsFileId: manifest.settingsFileId,
  };
}

async function recoverDriveLibrary(
  accountSub: string,
): Promise<DriveLibraryManifest | null> {
  const manifests = await listDriveFilesByAppProperty(
    "ebookReaderRole",
    "library-manifest",
  );
  for (const file of manifests) {
    if (
      file.appProperties?.accountSub &&
      file.appProperties.accountSub !== accountSub
    ) {
      continue;
    }
    try {
      const manifest = await loadDriveManifest(file.id);
      if (!manifest.settingsFileId) continue;
      await loadDriveSettings(manifest.settingsFileId);
      writeLocalState(accountSub, manifest);
      return manifest;
    } catch {
      // Try the next visible app-created manifest.
    }
  }
  return null;
}

async function loadFromState(
  state: LocalDriveLibraryState,
): Promise<DriveLibraryManifest> {
  const manifest = await loadDriveManifest(state.manifestFileId);
  manifest.libraryFolderName =
    manifest.libraryFolderName ?? state.libraryFolderName;
  manifest.manifestFileId = state.manifestFileId;
  manifest.settingsFileId = manifest.settingsFileId ?? state.settingsFileId;
  await loadDriveSettings(manifest.settingsFileId);
  setCachedDriveManifest(manifest);
  writeLocalState(getActiveGoogleUserSub(), manifest);
  return manifest;
}

function localStateKey(accountSub: string): string {
  return `ebook-reader.drive-library.${accountSub}`;
}

function readLocalState(accountSub: string): LocalDriveLibraryState | null {
  const raw = localStorage.getItem(localStateKey(accountSub));
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<LocalDriveLibraryState>;
    if (
      parsed.libraryFolderId &&
      parsed.appDataFolderId &&
      parsed.manifestFileId &&
      parsed.settingsFileId
    ) {
      return {
        libraryFolderId: parsed.libraryFolderId,
        libraryFolderName: parsed.libraryFolderName,
        appDataFolderId: parsed.appDataFolderId,
        manifestFileId: parsed.manifestFileId,
        settingsFileId: parsed.settingsFileId,
      };
    }
  } catch {
    localStorage.removeItem(localStateKey(accountSub));
  }
  return null;
}

function writeLocalState(
  accountSub: string,
  manifest: DriveLibraryManifest,
): void {
  if (!manifest.manifestFileId || !manifest.settingsFileId) return;
  const state: LocalDriveLibraryState = {
    libraryFolderId: manifest.libraryFolderId,
    libraryFolderName: manifest.libraryFolderName,
    appDataFolderId: manifest.appDataFolderId,
    manifestFileId: manifest.manifestFileId,
    settingsFileId: manifest.settingsFileId,
  };
  localStorage.setItem(localStateKey(accountSub), JSON.stringify(state));
}
