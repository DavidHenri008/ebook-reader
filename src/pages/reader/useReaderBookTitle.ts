import { useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { getBookMeta } from "../../storage";
import {
  bookTitleFromUrlSegment,
  readerPathForBookTitle,
} from "../../utils/bookTitleUrl";

interface ReaderBookTitleResult {
  bookTitle: string;
  canonicalReaderPath: string | null;
}

/**
 * Resolves the reader's display title and keeps the URL on its canonical
 * `/reader/:bookTitle` path.
 *
 * Title priority: the navigation state title, then the stored library
 * metadata title, then the title decoded from the URL slug. When a title is
 * known and the current path differs from the canonical reader path, the URL
 * is replaced (preserving navigation state).
 *
 * @param bookId - Current book id, or `null` when none is loaded.
 * @param locationBookTitle - Title supplied via navigation state, if any.
 * @param routeBookTitle - Raw `:bookTitle` URL segment, if any.
 */
export function useReaderBookTitle(
  bookId: string | null,
  locationBookTitle: string | undefined,
  routeBookTitle: string | undefined,
): ReaderBookTitleResult {
  const location = useLocation();
  const navigate = useNavigate();

  const [loadedBookTitle, setLoadedBookTitle] = useState<{
    bookId: string;
    title: string;
  } | null>(null);

  useEffect(() => {
    if (!bookId || locationBookTitle) return;

    let cancelled = false;
    getBookMeta(bookId).then((book) => {
      if (!cancelled && book) {
        setLoadedBookTitle({ bookId, title: book.title });
      }
    });

    return () => {
      cancelled = true;
    };
  }, [bookId, locationBookTitle]);

  const titleFromRoute = useMemo(
    () => bookTitleFromUrlSegment(routeBookTitle),
    [routeBookTitle],
  );
  const storedBookTitle =
    loadedBookTitle?.bookId === bookId ? loadedBookTitle.title : null;
  const bookTitle =
    locationBookTitle ?? storedBookTitle ?? titleFromRoute ?? "";
  const canonicalReaderPath = useMemo(
    () => (bookTitle ? readerPathForBookTitle(bookTitle) : null),
    [bookTitle],
  );

  useEffect(() => {
    if (!canonicalReaderPath || location.pathname === canonicalReaderPath) {
      return;
    }

    navigate(canonicalReaderPath, { replace: true, state: location.state });
  }, [canonicalReaderPath, location.pathname, location.state, navigate]);

  return { bookTitle, canonicalReaderPath };
}
