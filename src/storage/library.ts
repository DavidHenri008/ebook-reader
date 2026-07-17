import type {
  BookMeta,
  DriveFileFingerprint,
  DriveLibraryManifest,
  LibrarySnapshot,
  VirtualFolder,
} from "../types";
import { extractRawBook } from "../services/bookExtractor";
import { extractEpubMetadata } from "../services/epubMetadata";
import {
  DriveApiError,
  DriveLibraryNotConfiguredError,
  chooseDriveLibraryFolder,
  downloadDriveFile,
  ensureDriveLibrary,
  fingerprintFromMetadata,
  fingerprintsMatch,
  getDriveFileMetadata,
  getDriveLibraryInfo,
  pickEpubFiles,
  reloadDriveLibrary,
  updateDriveManifest,
  uploadDriveEpubResumable,
  writeDriveManifest,
  type PickedDriveItem,
} from "../services/drive";
import { sha256Hex } from "../utils/crypto";
import {
  deleteRawBook,
  hasRawBook,
  saveRawBook,
} from "./bookCache";
import { deleteReadingState } from "./readingState";

type BookProgress = (message: string, loaded?: number, total?: number) => void;

export { DriveLibraryNotConfiguredError };

export interface BookFileForExtraction {
  bookId: string;
  fileData: ArrayBuffer;
  book: BookMeta;
}

export interface CacheValidationResult {
  book: BookMeta;
  fingerprintMatches: boolean;
  currentFingerprint: DriveFileFingerprint;
}

async function prewarmBookCache(
  fileData: ArrayBuffer,
  bookId: string,
  title: string,
  onProgress?: BookProgress,
): Promise<void> {
  try {
    if (await hasRawBook(bookId)) return;

    const extracted = await extractRawBook(
      fileData,
      bookId,
      (done, total, message) => {
        onProgress?.(
          message ??
            (total > 0
              ? `Preparing ${title}... ${done} / ${total} sections`
              : `Preparing ${title}...`),
        );
      },
    );
    onProgress?.(`Saving ${title} for faster opening...`);
    await saveRawBook(extracted);
  } catch (error) {
    console.warn(`Failed to prepare cache for ${title}:`, error);
  }
}

export async function hydrateBookCover(bookId: string): Promise<BookMeta> {
  const book = await requireBook(bookId);
  if (book.coverUrl || !book.driveFileId) return book;

  const fileData = await downloadDriveFile(book.driveFileId);
  const metadata = await extractEpubMetadata(fileData, book.filename);
  if (!metadata.coverUrl) return book;

  const updatedBook = {
    ...book,
    coverUrl: metadata.coverUrl,
  };
  await upsertBook(updatedBook);
  return updatedBook;
}

export async function getLibrarySnapshot(): Promise<LibrarySnapshot> {
  const manifest = await ensureDriveLibrary({ promptIfMissing: false });
  return toSnapshot(manifest);
}

export async function chooseLibraryFolder(): Promise<LibrarySnapshot> {
  const manifest = await chooseDriveLibraryFolder();
  return toSnapshot(manifest);
}

export async function refreshLibrary(): Promise<LibrarySnapshot> {
  const manifest = await reloadDriveLibrary();
  const pruned = await pruneMissingBooks(manifest);
  return toSnapshot(pruned);
}

export async function getAllBooks(): Promise<BookMeta[]> {
  const snapshot = await getLibrarySnapshot();
  return sortBooks(snapshot.books);
}

export async function getLibraryFolders(): Promise<VirtualFolder[]> {
  const snapshot = await getLibrarySnapshot();
  return snapshot.virtualFolders;
}

export async function getBookMeta(id: string): Promise<BookMeta | undefined> {
  const manifest = await ensureDriveLibrary({ promptIfMissing: false });
  return manifest.books.find((book) => book.id === id);
}

export async function addBookToLibrary(
  file: File,
  onProgress?: BookProgress,
  virtualFolderId?: string,
): Promise<BookMeta> {
  const manifest = await ensureDriveLibrary({ promptIfMissing: true });
  onProgress?.(`Hashing ${file.name}...`);
  const fileData = await file.arrayBuffer();
  const id = await sha256Hex(fileData);
  const existing = manifest.books.find((book) => book.id === id);
  if (existing) {
    if (existing.virtualFolderId !== virtualFolderId) {
      const moved = { ...existing, virtualFolderId };
      await upsertBook(moved);
      await prewarmBookCache(fileData, id, moved.title, onProgress);
      return moved;
    }
    await prewarmBookCache(fileData, id, existing.title, onProgress);
    return existing;
  }

  onProgress?.(`Reading metadata for ${file.name}...`);
  const metadata = await extractEpubMetadata(fileData, file.name);
  onProgress?.(`Uploading ${file.name}...`, 0, file.size);
  const uploaded = await uploadDriveEpubResumable({
    file,
    parentId: manifest.libraryFolderId,
    appProperties: bookAppProperties(id),
    onProgress: (loaded, total) =>
      onProgress?.(`Uploading ${file.name}...`, loaded, total),
  });

  const now = Date.now();
  const book: BookMeta = {
    id,
    title: metadata.title,
    author: metadata.author,
    coverUrl: metadata.coverUrl,
    filename: uploaded.name || file.name,
    fileSize: Number(uploaded.size ?? file.size),
    addedAt: now,
    lastOpenedAt: now,
    driveFileId: uploaded.id,
    driveFingerprint: fingerprintFromMetadata(uploaded),
    virtualFolderId,
  };

  await upsertBook(book);
  await prewarmBookCache(fileData, id, book.title, onProgress);
  return book;
}

export async function addBooksFromDrivePicker(
  onProgress?: BookProgress,
  virtualFolderId?: string,
  onBookAdded?: (book: BookMeta) => void,
): Promise<BookMeta[]> {
  await ensureDriveLibrary({ promptIfMissing: true });
  const items = await pickEpubFiles();
  return addPickedDriveBooks(
    items,
    onProgress,
    virtualFolderId,
    onBookAdded,
  );
}

export async function addPickedDriveBooks(
  items: PickedDriveItem[],
  onProgress?: BookProgress,
  virtualFolderId?: string,
  onBookAdded?: (book: BookMeta) => void,
): Promise<BookMeta[]> {
  const results: BookMeta[] = [];
  for (const item of items) {
    const book = await addPickedDriveBook(item, onProgress, virtualFolderId);
    results.push(book);
    onBookAdded?.(book);
  }
  return results;
}

export async function addPickedDriveBook(
  item: PickedDriveItem,
  onProgress?: BookProgress,
  virtualFolderId?: string,
): Promise<BookMeta> {
  const manifest = await ensureDriveLibrary({ promptIfMissing: true });
  onProgress?.(`Reading Google Drive metadata for ${item.name}...`);
  const driveMetadata = await getDriveFileMetadata(item.id);
  onProgress?.(
    `Downloading ${item.name}...`,
    0,
    Number(driveMetadata.size ?? 0),
  );
  const fileData = await downloadDriveFile(item.id, (loaded, total) => {
    onProgress?.(`Downloading ${item.name}...`, loaded, total);
  });
  const id = await sha256Hex(fileData);
  const existing = manifest.books.find((book) => book.id === id);
  if (existing) {
    if (existing.virtualFolderId !== virtualFolderId) {
      const moved = { ...existing, virtualFolderId };
      await upsertBook(moved);
      await prewarmBookCache(fileData, id, moved.title, onProgress);
      return moved;
    }
    await prewarmBookCache(fileData, id, existing.title, onProgress);
    return existing;
  }

  onProgress?.(`Reading metadata for ${item.name}...`);
  const metadata = await extractEpubMetadata(fileData, item.name);
  const now = Date.now();
  const book: BookMeta = {
    id,
    title: metadata.title,
    author: metadata.author,
    coverUrl: metadata.coverUrl,
    filename: driveMetadata.name || item.name,
    fileSize: Number(driveMetadata.size ?? fileData.byteLength),
    addedAt: now,
    lastOpenedAt: now,
    driveFileId: item.id,
    driveFingerprint: fingerprintFromMetadata(driveMetadata),
    virtualFolderId,
  };

  await upsertBook(book);
  await prewarmBookCache(fileData, id, book.title, onProgress);
  return book;
}

export async function validateBookCache(
  bookId: string,
): Promise<CacheValidationResult> {
  const book = await requireBook(bookId);
  if (!book.driveFileId)
    throw new Error(`Book ${bookId} has no Google Drive file id.`);

  try {
    const metadata = await getDriveFileMetadata(book.driveFileId);
    const currentFingerprint = fingerprintFromMetadata(metadata);
    const fingerprintMatches = fingerprintsMatch(
      book.driveFingerprint,
      currentFingerprint,
    );
    if (!fingerprintMatches) await deleteRawBook(book.id);
    return { book, fingerprintMatches, currentFingerprint };
  } catch (error) {
    if (error instanceof DriveApiError && error.status === 404) {
      await removeBookFromLibrary(book.id);
    }
    throw error;
  }
}

export async function fetchBookFileForExtraction(
  bookId: string,
  onProgress?: BookProgress,
): Promise<BookFileForExtraction> {
  const book = await requireBook(bookId);
  if (!book.driveFileId)
    throw new Error(`Book ${bookId} has no Google Drive file id.`);

  const metadata = await getDriveFileMetadata(book.driveFileId);
  const currentFingerprint = fingerprintFromMetadata(metadata);
  const metadataBytes = Number(metadata.size ?? 0);
  const expectedBytes = metadataBytes || book.fileSize;
  onProgress?.(`Downloading ${book.title}...`, 0, expectedBytes);
  const fileData = await downloadDriveFile(
    book.driveFileId,
    (loaded, total) => {
      onProgress?.(`Downloading ${book.title}...`, loaded, total);
    },
    expectedBytes,
  );
  const actualBookId = await sha256Hex(fileData);

  if (actualBookId !== book.id) {
    const metadataFromBook = await extractEpubMetadata(
      fileData,
      metadata.name || book.filename,
    );
    const nextBook: BookMeta = {
      ...book,
      id: actualBookId,
      title: metadataFromBook.title,
      author: metadataFromBook.author,
      coverUrl: metadataFromBook.coverUrl,
      filename: metadata.name || book.filename,
      fileSize: Number(metadata.size ?? fileData.byteLength),
      driveFingerprint: currentFingerprint,
      lastOpenedAt: Date.now(),
    };
    await updateDriveManifest((manifest) => ({
      ...manifest,
      books: [
        ...manifest.books.filter(
          (candidate) =>
            candidate.id !== book.id && candidate.id !== actualBookId,
        ),
        nextBook,
      ],
    }));
    await deleteRawBook(book.id);
    return { bookId: actualBookId, fileData, book: nextBook };
  }

  const updatedBook: BookMeta = {
    ...book,
    coverUrl:
      book.coverUrl ??
      (await extractEpubMetadata(fileData, metadata.name || book.filename))
        .coverUrl,
    filename: metadata.name || book.filename,
    fileSize: Number(metadata.size ?? fileData.byteLength),
    driveFingerprint: currentFingerprint,
  };
  if (
    !fingerprintsMatch(book.driveFingerprint, currentFingerprint) ||
    updatedBook.coverUrl !== book.coverUrl ||
    updatedBook.filename !== book.filename ||
    updatedBook.fileSize !== book.fileSize
  ) {
    await upsertBook(updatedBook);
  }

  return { bookId, fileData, book: updatedBook };
}

export async function updateLastOpened(id: string): Promise<void> {
  await updateDriveManifest((manifest) => ({
    ...manifest,
    books: manifest.books.map((book) =>
      book.id === id ? { ...book, lastOpenedAt: Date.now() } : book,
    ),
  }));
}

export async function removeBookFromLibrary(id: string): Promise<void> {
  await ensureDriveLibrary({ promptIfMissing: false });
  await updateDriveManifest((manifest) => ({
    ...manifest,
    books: manifest.books.filter((book) => book.id !== id),
  }));
  await Promise.all([deleteRawBook(id), deleteReadingState(id)]);
}

export async function createLibraryFolder(
  name: string,
  parentId?: string,
): Promise<VirtualFolder> {
  await ensureDriveLibrary({ promptIfMissing: false });
  const now = Date.now();
  const folder: VirtualFolder = {
    id: crypto.randomUUID(),
    name: name.trim(),
    parentId,
    sortOrder: now,
    createdAt: now,
    updatedAt: now,
  };
  if (!folder.name) throw new Error("Folder name is required.");
  await updateDriveManifest((manifest) => ({
    ...manifest,
    virtualFolders: [...manifest.virtualFolders, folder],
  }));
  return folder;
}

export async function renameLibraryFolder(
  folderId: string,
  name: string,
): Promise<void> {
  const trimmed = name.trim();
  if (!trimmed) throw new Error("Folder name is required.");
  await updateDriveManifest((manifest) => ({
    ...manifest,
    virtualFolders: manifest.virtualFolders.map((folder) =>
      folder.id === folderId
        ? { ...folder, name: trimmed, updatedAt: Date.now() }
        : folder,
    ),
  }));
}

export async function deleteLibraryFolder(folderId: string): Promise<void> {
  await updateDriveManifest((manifest) => {
    const deletedFolder = manifest.virtualFolders.find(
      (folder) => folder.id === folderId,
    );
    if (!deletedFolder) return manifest;
    return {
      ...manifest,
      virtualFolders: manifest.virtualFolders
        .filter((folder) => folder.id !== folderId)
        .map((folder) =>
          folder.parentId === folderId
            ? { ...folder, parentId: deletedFolder.parentId }
            : folder,
        ),
      books: manifest.books.map((book) =>
        book.virtualFolderId === folderId
          ? { ...book, virtualFolderId: deletedFolder.parentId }
          : book,
      ),
    };
  });
}

export async function reorderLibraryFolder(
  folderId: string,
  direction: "up" | "down",
): Promise<void> {
  await updateDriveManifest((manifest) => {
    const target = manifest.virtualFolders.find(
      (folder) => folder.id === folderId,
    );
    if (!target) return manifest;
    const folders = manifest.virtualFolders
      .filter((folder) => folder.parentId === target.parentId)
      .sort((a, b) => a.sortOrder - b.sortOrder);
    const index = folders.findIndex((folder) => folder.id === folderId);
    const swapIndex = direction === "up" ? index - 1 : index + 1;
    if (index < 0 || swapIndex < 0 || swapIndex >= folders.length)
      return manifest;
    const currentOrder = folders[index].sortOrder;
    folders[index] = {
      ...folders[index],
      sortOrder: folders[swapIndex].sortOrder,
    };
    folders[swapIndex] = { ...folders[swapIndex], sortOrder: currentOrder };
    const orderById = new Map(
      folders.map((folder) => [folder.id, folder.sortOrder]),
    );
    return {
      ...manifest,
      virtualFolders: manifest.virtualFolders.map((folder) =>
        orderById.has(folder.id)
          ? { ...folder, sortOrder: orderById.get(folder.id)! }
          : folder,
      ),
    };
  });
}

export async function setBookVirtualFolder(
  bookId: string,
  virtualFolderId: string | undefined,
): Promise<void> {
  await updateDriveManifest((manifest) => ({
    ...manifest,
    books: manifest.books.map((book) =>
      book.id === bookId ? { ...book, virtualFolderId } : book,
    ),
  }));
}

export function getStorageErrorMessage(error: unknown): string {
  if (error instanceof DriveLibraryNotConfiguredError) return error.message;
  if (error instanceof DriveApiError) {
    if (error.status === 403 && error.reason === "storageQuotaExceeded") {
      return "Your Google Drive is full. Free up space, then try again.";
    }
    if (error.status === 403 || error.status === 401) {
      return "Google Drive permission was denied. Sign in again or choose the file through Google Picker.";
    }
    if (error.status === 429) {
      return "Google Drive is rate-limiting requests. The app will retry; try again in a moment.";
    }
    if (error.status === 404) {
      return "A Google Drive file in your library could not be found and was removed from the manifest.";
    }
    return error.message;
  }
  return error instanceof Error ? error.message : "Something went wrong.";
}

async function upsertBook(book: BookMeta): Promise<void> {
  await updateDriveManifest((manifest) => ({
    ...manifest,
    books: [
      ...manifest.books.filter((candidate) => candidate.id !== book.id),
      book,
    ],
  }));
}

async function requireBook(bookId: string): Promise<BookMeta> {
  const manifest = await ensureDriveLibrary({ promptIfMissing: false });
  const book = manifest.books.find((candidate) => candidate.id === bookId);
  if (!book) throw new Error("This book is not in your Google Drive library.");
  return book;
}

async function pruneMissingBooks(
  manifest: DriveLibraryManifest,
): Promise<DriveLibraryManifest> {
  const existingBooks: BookMeta[] = [];
  for (const book of manifest.books) {
    if (!book.driveFileId) continue;
    try {
      await getDriveFileMetadata(book.driveFileId, "id");
      existingBooks.push(book);
    } catch (error) {
      if (!(error instanceof DriveApiError) || error.status !== 404)
        throw error;
      await deleteRawBook(book.id);
    }
  }
  if (existingBooks.length === manifest.books.length) return manifest;
  const next = { ...manifest, books: existingBooks };
  return writeDriveManifest(next);
}

function toSnapshot(manifest: DriveLibraryManifest): LibrarySnapshot {
  return {
    books: sortBooks(manifest.books),
    virtualFolders: [...manifest.virtualFolders].sort(
      (a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name),
    ),
    info: getDriveLibraryInfo(manifest),
  };
}

function sortBooks(books: BookMeta[]): BookMeta[] {
  return [...books].sort((a, b) => {
    const aTime = a.lastOpenedAt || a.addedAt;
    const bTime = b.lastOpenedAt || b.addedAt;
    return bTime - aTime || a.title.localeCompare(b.title);
  });
}

function bookAppProperties(bookId: string): Record<string, string> {
  return {
    ebookReaderApp: "ebook-reader",
    ebookReaderRole: "book",
    bookId,
  };
}
