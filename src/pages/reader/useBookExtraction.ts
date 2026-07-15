import { useEffect, useState } from "react";
import { saveRawBook, loadRawBook } from "../../storage/bookCache";
import {
  fetchBookFileForExtraction,
  getStorageErrorMessage,
  validateBookCache,
} from "../../storage";
import { extractRawBook } from "../../services/bookExtractor";
import { yieldToReaderPaint } from "../../utils/async";
import type { RawExtractedBook, TocItem } from "../../types";

interface UseBookExtractionResult {
  extractedBook: RawExtractedBook | null;
  toc: TocItem[];
  progressMessage: string | null;
  resolvedBookId: string | null;
}

/**
 * Owns the cache-then-extract pipeline for a single book: tries the IndexedDB
 * cache first (with restore progress), falls back to full epubjs extraction,
 * then caches the result after the reader has painted. The extraction is
 * cancelled via an `AbortController` when the file/book changes or unmounts.
 */
export function useBookExtraction(
  bookId: string | null,
): UseBookExtractionResult {
  const [extractedBook, setExtractedBook] = useState<RawExtractedBook | null>(
    null,
  );
  const [toc, setToc] = useState<TocItem[]>([]);
  const [progressMessage, setProgressMessage] = useState<string | null>(null);
  const [resolvedBookId, setResolvedBookId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const controller = new AbortController();

    const run = async () => {
      setExtractedBook(null);
      setToc([]);
      setResolvedBookId(null);
      if (!bookId) return;

      try {
        setProgressMessage("Validating Google Drive file...");
        const validation = await validateBookCache(bookId);

        if (validation.fingerprintMatches) {
          const cached = await loadRawBook(bookId, (done, total, message) => {
            if (!cancelled) {
              setProgressMessage(
                message ?? `Loading cached book... ${done} / ${total}`,
              );
            }
          });
          if (cached) {
            if (!cancelled) {
              setResolvedBookId(bookId);
              setExtractedBook(cached);
              setToc(cached.toc);
              setProgressMessage(null);
            }
            return;
          }
        }

        if (cancelled) return;

        const fetched = await fetchBookFileForExtraction(
          bookId,
          (message, loaded, total) => {
            if (!cancelled) {
              setProgressMessage(
                total && total > 0 && loaded !== undefined
                  ? `${message} ${Math.round((loaded / total) * 100)}%`
                  : message,
              );
            }
          },
        );
        if (cancelled) return;

        // Full extraction
        setProgressMessage("Extracting book...");
        const result = await extractRawBook(
          fetched.fileData,
          fetched.bookId,
          (done, total, message) => {
            if (!cancelled) {
              setProgressMessage(
                message ??
                  (total > 0
                    ? `Extracting... ${done} / ${total} sections`
                    : "Extracting book..."),
              );
            }
          },
          controller.signal,
        );

        if (cancelled) return;

        setResolvedBookId(fetched.bookId);
        setExtractedBook(result);
        setToc(result.toc);
        setProgressMessage(null);

        void (async () => {
          await yieldToReaderPaint();
          try {
            await saveRawBook(result);
          } catch (e) {
            console.warn("Failed to cache book:", e);
          }
        })();
      } catch (e) {
        if (controller.signal.aborted) {
          return;
        }
        if (!cancelled) {
          setProgressMessage(getStorageErrorMessage(e));
        }
      }
    };

    run();
    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [bookId]);

  return { extractedBook, toc, progressMessage, resolvedBookId };
}
