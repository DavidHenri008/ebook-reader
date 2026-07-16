import { beforeEach, describe, expect, it, vi } from "vitest";
import type { DriveLibraryManifest } from "../../types";

const { readDriveJsonFile } = vi.hoisted(() => ({
  readDriveJsonFile: vi.fn(),
}));

vi.mock("./driveClient", () => ({
  createDriveFolder: vi.fn(),
  createDriveJsonFile: vi.fn(),
  listDriveFilesByAppProperty: vi.fn(),
  readDriveJsonFile,
  updateDriveJsonFile: vi.fn(),
}));

vi.mock("./session", () => ({
  getActiveGoogleUserSub: () => "account-sub",
}));

vi.mock("./picker", () => ({
  pickLibraryFolder: vi.fn(),
}));

vi.mock("./settings", () => ({
  createDefaultSettings: vi.fn(),
  getSettingsAppProperties: vi.fn(),
  loadDriveSettings: vi.fn(),
  setCachedDriveSettings: vi.fn(),
}));

import { ensureDriveLibrary } from "./bootstrap";
import { setCachedDriveManifest } from "./manifest";

describe("ensureDriveLibrary", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
  });

  it("reuses the loaded manifest for normal library operations", async () => {
    const manifest: DriveLibraryManifest = {
      schemaVersion: 1,
      libraryFolderId: "library-folder",
      appDataFolderId: "app-data-folder",
      manifestFileId: "manifest-file",
      settingsFileId: "settings-file",
      virtualFolders: [],
      books: [],
      updatedAt: 1,
    };
    setCachedDriveManifest(manifest);
    localStorage.setItem(
      "ebook-reader.drive-library.account-sub",
      JSON.stringify({
        libraryFolderId: "library-folder",
        appDataFolderId: "app-data-folder",
        manifestFileId: "manifest-file",
        settingsFileId: "settings-file",
      }),
    );

    await expect(ensureDriveLibrary()).resolves.toMatchObject(manifest);
    expect(readDriveJsonFile).not.toHaveBeenCalled();
  });
});
