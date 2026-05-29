// Storage-related type definitions

export type Theme = "light" | "dark";

export type ReadingMode = "paginated" | "scrolled";

export interface ReadingState {
  /** Position within the book: section index + character-offset anchor */
  lastLocation?: { sectionIndex: number; anchor: number };
  /** Zoom level (percentage, e.g. 100 = 100%) */
  zoom: number;
  /** Reading layout mode */
  mode: ReadingMode;
}

export interface StoredReadingState extends ReadingState {
  /** Unique identifier for the book */
  bookId: string;
  /** Last updated timestamp */
  updatedAt: number;
}
