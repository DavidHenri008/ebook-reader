// Storage-related type definitions

export type Theme = "light" | "dark";

export interface ReadingState {
  /** CFI location in the book */
  lastLocationCfi?: string;
  /** Page zoom percentage (100 = normal) */
  zoom: number;
  /** Color theme */
  theme: Theme;
}

export interface StoredReadingState extends ReadingState {
  /** Unique identifier for the book */
  bookId: string;
  /** Last updated timestamp */
  updatedAt: number;
}
