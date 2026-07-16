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
  /** Google Drive file id for the EPUB bytes */
  driveFileId?: string;
  /** Current Google Drive metadata fingerprint for cache validation */
  driveFingerprint?: DriveFileFingerprint;
  /** App-only library folder assignment */
  virtualFolderId?: string;
}

export interface DriveFileFingerprint {
  modifiedTime?: string;
  size?: string;
  md5Checksum?: string;
  version?: string;
}

export interface VirtualFolder {
  id: string;
  name: string;
  parentId?: string;
  sortOrder: number;
  createdAt: number;
  updatedAt: number;
}

export interface DriveLibraryManifest {
  schemaVersion: 1;
  libraryFolderId: string;
  libraryFolderName?: string;
  appDataFolderId: string;
  manifestFileId?: string;
  settingsFileId?: string;
  virtualFolders: VirtualFolder[];
  books: BookMeta[];
  updatedAt: number;
}

export interface DriveLibraryInfo {
  folderId: string;
  folderName?: string;
  appDataFolderId: string;
  manifestFileId?: string;
  settingsFileId?: string;
}

export interface LibrarySnapshot {
  books: BookMeta[];
  virtualFolders: VirtualFolder[];
  info: DriveLibraryInfo;
}
