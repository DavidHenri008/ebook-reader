// Library-related type definitions

/**
 * Metadata for a book in the library
 */
export interface BookMeta {
  /** Unique identifier (hash of file content) */
  id: string;
  /** Book title from EPUB metadata or filename */
  title: string;
  /** Author name from EPUB metadata */
  author?: string;
  /** Cover image as base64 data URL */
  coverUrl?: string;
  /** Original filename */
  filename: string;
  /** File size in bytes */
  fileSize: number;
  /** Date added to library */
  addedAt: number;
  /** Last opened date */
  lastOpenedAt?: number;
}

/**
 * Stored book with file data
 */
export interface StoredBook extends BookMeta {
  /** EPUB file as ArrayBuffer */
  fileData: ArrayBuffer;
}
