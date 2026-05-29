import { useEffect, useState } from "react";
import { saveRawBook, loadRawBook } from "../../storage/bookCache";
import { extractRawBook } from "../../services/bookExtractor";
import { yieldToReaderPaint } from "../../utils/async";
import type { RawExtractedBook, TocItem } from "../../types";

interface UseBookExtractionResult {
  extractedBook: RawExtractedBook | null;
  toc: TocItem[];
  progressMessage: string | null;
}

/**
 * Owns the cache-then-extract pipeline for a single book: tries the IndexedDB
 * cache first (with restore progress), falls back to full epubjs extraction,
 * then caches the result after the reader has painted. The extraction is
 * cancelled via an `AbortController` when the file/book changes or unmounts.
 */
export function useBookExtraction(
  file: File | null,
  bookId: string | null,
): UseBookExtractionResult {
  const [extractedBook, setExtractedBook] = useState<RawExtractedBook | null>(
    null,
  );
  const [toc, setToc] = useState<TocItem[]>([]);
  const [progressMessage, setProgressMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!file || !bookId) return;
    let cancelled = false;
    const controller = new AbortController();

    const run = async () => {
      try {
        // Try cache first
        const cached = await loadRawBook(bookId, (done, total, message) => {
          if (!cancelled) {
            setProgressMessage(
              message ?? `Loading cached book... ${done} / ${total}`,
            );
          }
        });
        if (cached) {
          if (!cancelled) {
            setExtractedBook(cached);
            setToc(cached.toc);
            setProgressMessage(null);
          }
          return;
        }

        if (cancelled) return;

        // Full extraction
        setProgressMessage("Extracting book...");
        const fileData = await file.arrayBuffer();
        if (cancelled) return;

        const result = await extractRawBook(
          fileData,
          bookId,
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
        throw e;
      }
    };

    run();
    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [file, bookId]);

  return { extractedBook, toc, progressMessage };
}
