// Storage-related type definitions

export type Theme = "light" | "dark";

export type ReadingMode = "paginated" | "scrolled";

export interface ReadingState {
  /** CFI location in the book */
  lastLocationCfi?: string;
  /** Color theme */
  theme: Theme;
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
