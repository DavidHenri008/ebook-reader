import type { BookMeta, StoredBook } from "../types/library";
import { extractEpubMetadata } from "../services/epubMetadata";
import { getDb } from "./db";

const STORE_NAME = "library";

/**
 * Generate a unique hash from file content.
 * @param buffer - ArrayBuffer of the file content
 * @returns Promise resolving to hex string hash
 */
async function generateFileHash(buffer: ArrayBuffer): Promise<string> {
  const hashBuffer = await crypto.subtle.digest("SHA-256", buffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}

/**
 * Add a book to the library.
 * @param file - EPUB File object to add
 * @returns Promise resolving to the book metadata
 */
export async function addBookToLibrary(file: File): Promise<BookMeta> {
  const db = await getDb();
  const fileData = await file.arrayBuffer();
  const id = await generateFileHash(fileData);

  // Check if book already exists
  const existing = await db.get(STORE_NAME, id);
  if (existing) {
    // Update last opened time
    const updated: StoredBook = {
      ...existing,
      lastOpenedAt: Date.now(),
    };
    await db.put(STORE_NAME, updated);
    return bookToMeta(updated);
  }

  // Extract metadata
  const { title, author, coverUrl } = await extractEpubMetadata(
    fileData,
    file.name,
  );

  const storedBook: StoredBook = {
    id,
    title,
    author,
    coverUrl,
    filename: file.name,
    fileSize: file.size,
    fileData,
    addedAt: Date.now(),
    lastOpenedAt: Date.now(),
  };

  await db.put(STORE_NAME, storedBook);
  return bookToMeta(storedBook);
}

/**
 * Get a book from the library by ID.
 * @param id - Book ID (hash)
 * @returns Promise resolving to StoredBook or undefined
 */
async function getBook(id: string): Promise<StoredBook | undefined> {
  const db = await getDb();
  return db.get(STORE_NAME, id);
}

/**
 * Get a book's metadata by ID.
 * @param id - Book ID (hash)
 * @returns Promise resolving to BookMeta or undefined
 */
export async function getBookMeta(id: string): Promise<BookMeta | undefined> {
  const book = await getBook(id);
  return book ? bookToMeta(book) : undefined;
}

/**
 * Get a book's file as a File object.
 * @param id - Book ID (hash)
 * @returns Promise resolving to File or undefined
 */
export async function getBookFile(id: string): Promise<File | undefined> {
  const book = await getBook(id);
  if (!book) return undefined;

  return new File([book.fileData], book.filename, {
    type: "application/epub+zip",
  });
}

/**
 * Update a book's last opened time.
 * @param id - Book ID (hash)
 */
export async function updateLastOpened(id: string): Promise<void> {
  const db = await getDb();
  const book = await db.get(STORE_NAME, id);
  if (book) {
    await db.put(STORE_NAME, { ...book, lastOpenedAt: Date.now() });
  }
}

/**
 * Remove a book from the library.
 * @param id - Book ID (hash)
 */
export async function removeBookFromLibrary(id: string): Promise<void> {
  const db = await getDb();
  await db.delete(STORE_NAME, id);
}

/**
 * Get all books in the library (metadata only).
 * @returns Promise resolving to array of BookMeta sorted by lastOpenedAt desc
 */
export async function getAllBooks(): Promise<BookMeta[]> {
  const db = await getDb();
  const books = await db.getAll(STORE_NAME);

  // Sort by last opened (most recent first), then by added date
  books.sort((a, b) => {
    const aTime = a.lastOpenedAt || a.addedAt;
    const bTime = b.lastOpenedAt || b.addedAt;
    return bTime - aTime;
  });

  return books.map(bookToMeta);
}

/**
 * Convert StoredBook to BookMeta (without file data).
 * @param book - StoredBook to convert
 * @returns BookMeta without fileData
 */
function bookToMeta(book: StoredBook): BookMeta {
  const { fileData: _fileData, ...meta } = book;
  void _fileData;
  return meta;
}
