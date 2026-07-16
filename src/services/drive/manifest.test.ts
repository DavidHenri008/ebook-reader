import { describe, expect, it, vi } from "vitest";
import type { BookMeta, DriveLibraryManifest } from "../../types";

const { updateDriveJsonFile } = vi.hoisted(() => ({
  updateDriveJsonFile: vi.fn(),
}));

vi.mock("./driveClient", () => ({
  readDriveJsonFile: vi.fn(),
  updateDriveJsonFile,
}));

import { setCachedDriveManifest, updateDriveManifest } from "./manifest";

function createBook(id: string): BookMeta {
  return {
    id,
    title: id,
    filename: `${id}.epub`,
    fileSize: 1,
    addedAt: 1,
  };
}

describe("updateDriveManifest", () => {
  it("serializes concurrent mutations against the latest manifest", async () => {
    let completeFirstWrite!: () => void;
    const firstWrite = new Promise<void>((resolve) => {
      completeFirstWrite = resolve;
    });
    updateDriveJsonFile
      .mockImplementationOnce(() => firstWrite)
      .mockResolvedValue(undefined);

    const manifest: DriveLibraryManifest = {
      schemaVersion: 1,
      libraryFolderId: "library-folder",
      appDataFolderId: "app-data-folder",
      manifestFileId: "manifest-file",
      virtualFolders: [],
      books: [createBook("first"), createBook("second")],
      updatedAt: 1,
    };
    setCachedDriveManifest(manifest);

    const firstMutation = updateDriveManifest((current) => ({
      ...current,
      books: current.books.filter((book) => book.id !== "first"),
    }));
    const secondMutation = updateDriveManifest((current) => ({
      ...current,
      books: current.books.filter((book) => book.id !== "second"),
    }));

    await vi.waitFor(() => expect(updateDriveJsonFile).toHaveBeenCalledOnce());
    completeFirstWrite();
    await Promise.all([firstMutation, secondMutation]);

    expect(updateDriveJsonFile).toHaveBeenNthCalledWith(
      2,
      "manifest-file",
      expect.objectContaining({ books: [] }),
      expect.anything(),
    );
  });
});
