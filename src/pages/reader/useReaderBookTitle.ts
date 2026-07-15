import { useEffect, useState } from "react";
import { getBookMeta } from "../../storage";

interface ReaderBookTitleResult {
  bookTitle: string;
}

/**
 * Resolves the reader's display title from navigation state first, then the
 * Google Drive manifest. The route's `bookId` is the durable reader identity.
 *
 * @param bookId - Current book id, or `null` when none is loaded.
 * @param locationBookTitle - Title supplied via navigation state, if any.
 */
export function useReaderBookTitle(
  bookId: string | null,
  locationBookTitle: string | undefined,
): ReaderBookTitleResult {
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

  const storedBookTitle =
    loadedBookTitle?.bookId === bookId ? loadedBookTitle.title : null;
  const bookTitle = locationBookTitle ?? storedBookTitle ?? "";

  return { bookTitle };
}
