import { useCallback } from "react";
import { saveReadingState } from "../../storage";
import type { ReadingMode } from "../../types";

/**
 * Book-scoped reading-state persistence. Each saver no-ops when no `bookId` is
 * available, removing the repeated `if (bookId) saveReadingState(...)` guards
 * from the call sites and keeping the IndexedDB write surface in one place.
 */
export function useReaderPersistence(bookId: string | null) {
  const saveZoom = useCallback(
    (zoom: number) => {
      if (bookId) saveReadingState(bookId, { zoom });
    },
    [bookId],
  );

  const saveMode = useCallback(
    (mode: ReadingMode) => {
      if (bookId) saveReadingState(bookId, { mode });
    },
    [bookId],
  );

  const savePosition = useCallback(
    (lastLocation: { sectionIndex: number; anchor: number }) => {
      if (bookId) saveReadingState(bookId, { lastLocation });
    },
    [bookId],
  );

  return { saveZoom, saveMode, savePosition };
}
