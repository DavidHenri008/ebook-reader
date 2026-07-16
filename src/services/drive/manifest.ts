import type { DriveLibraryManifest, VirtualFolder } from "../../types";
import { readDriveJsonFile, updateDriveJsonFile } from "./driveClient";

const MANIFEST_APP_PROPERTIES = {
  ebookReaderApp: "ebook-reader",
  ebookReaderRole: "library-manifest",
};

let cachedManifest: DriveLibraryManifest | null = null;
let manifestMutationQueue: Promise<void> = Promise.resolve();

export function createEmptyManifest(
  libraryFolderId: string,
  libraryFolderName: string | undefined,
  appDataFolderId: string,
): DriveLibraryManifest {
  return {
    schemaVersion: 1,
    libraryFolderId,
    libraryFolderName,
    appDataFolderId,
    virtualFolders: [],
    books: [],
    updatedAt: Date.now(),
  };
}

export function getManifestAppProperties(
  accountSub: string,
): Record<string, string> {
  return { ...MANIFEST_APP_PROPERTIES, accountSub };
}

export async function loadDriveManifest(
  manifestFileId: string,
): Promise<DriveLibraryManifest> {
  cachedManifest = normalizeManifest(
    await readDriveJsonFile<DriveLibraryManifest>(manifestFileId),
    manifestFileId,
  );
  return cachedManifest;
}

export function setCachedDriveManifest(manifest: DriveLibraryManifest): void {
  cachedManifest = normalizeManifest(manifest, manifest.manifestFileId);
}

export function getCachedDriveManifest(): DriveLibraryManifest | null {
  return cachedManifest;
}

export async function writeDriveManifest(
  manifest: DriveLibraryManifest,
): Promise<DriveLibraryManifest> {
  const manifestFileId = manifest.manifestFileId;
  if (!manifestFileId) {
    throw new Error("Manifest file id is missing.");
  }
  const next = normalizeManifest(
    { ...manifest, updatedAt: Date.now() },
    manifestFileId,
  );
  cachedManifest = next;
  await updateDriveJsonFile(manifestFileId, next, MANIFEST_APP_PROPERTIES);
  return next;
}

export async function updateDriveManifest(
  mutate: (manifest: DriveLibraryManifest) => DriveLibraryManifest,
): Promise<DriveLibraryManifest> {
  const mutation = manifestMutationQueue.then(() => {
    if (!cachedManifest) throw new Error("Google Drive library is not loaded.");
    return writeDriveManifest(mutate(cloneManifest(cachedManifest)));
  });
  manifestMutationQueue = mutation.then(
    () => undefined,
    () => undefined,
  );
  return mutation;
}

function normalizeManifest(
  manifest: DriveLibraryManifest,
  manifestFileId: string | undefined,
): DriveLibraryManifest {
  return {
    schemaVersion: 1,
    libraryFolderId: manifest.libraryFolderId,
    libraryFolderName: manifest.libraryFolderName,
    appDataFolderId: manifest.appDataFolderId,
    manifestFileId: manifest.manifestFileId ?? manifestFileId,
    settingsFileId: manifest.settingsFileId,
    virtualFolders: sortFolders(manifest.virtualFolders ?? []),
    books: manifest.books ?? [],
    updatedAt: manifest.updatedAt ?? Date.now(),
  };
}

function sortFolders(folders: VirtualFolder[]): VirtualFolder[] {
  return [...folders].sort(
    (a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name),
  );
}

function cloneManifest(manifest: DriveLibraryManifest): DriveLibraryManifest {
  return {
    ...manifest,
    virtualFolders: manifest.virtualFolders.map((folder) => ({ ...folder })),
    books: manifest.books.map((book) => ({
      ...book,
      driveFingerprint: book.driveFingerprint
        ? { ...book.driveFingerprint }
        : undefined,
    })),
  };
}
