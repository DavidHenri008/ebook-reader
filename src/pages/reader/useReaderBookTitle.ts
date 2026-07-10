import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { getBookMeta } from "../../storage";

interface ReaderBookTitleResult {
  bookTitle: string;
}

/**
 * Resolves the reader's display title and keeps the URL on its canonical
 * `/reader/$bookTitle` path.
 *
 * Title priority: the navigation state title, then the stored library
 * metadata title, then the title decoded from the URL slug. When a title is
 * known and the current slug differs from the canonical one, the URL is
 * replaced (preserving navigation state).
 *
 * @param bookId - Current book id, or `null` when none is loaded.
 * @param locationBookTitle - Title supplied via navigation state, if any.
 * @param routeBookTitle - Decoded `$bookTitle` URL param, if any.
 */
export function useReaderBookTitle(
  bookId: string | null,
  locationBookTitle: string | undefined,
  routeBookTitle: string | undefined,
): ReaderBookTitleResult {
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

  const titleFromRoute = useMemo(() => {
    const trimmed = routeBookTitle?.trim();
    return trimmed && trimmed.length > 0 ? trimmed : null;
  }, [routeBookTitle]);
  const storedBookTitle =
    loadedBookTitle?.bookId === bookId ? loadedBookTitle.title : null;
  const bookTitle =
    locationBookTitle ?? storedBookTitle ?? titleFromRoute ?? "";

  useEffect(() => {
    if (!bookTitle || routeBookTitle === bookTitle) {
      return;
    }

    navigate({
      to: "/reader/$bookTitle",
      params: { bookTitle },
      replace: true,
      state: (prev) => prev,
    });
  }, [bookTitle, routeBookTitle, navigate]);

  return { bookTitle };
}
