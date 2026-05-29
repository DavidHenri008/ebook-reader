import { useEffect, useCallback, useMemo, useState } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import styled from "@emotion/styled";
import { SectionViewer, ReaderToolbar, ReaderSidebar } from "../components";
import {
  saveReadingState,
  loadReadingState,
  updateLastOpened,
  getBookMeta,
  getCurrentLibraryTheme,
} from "../storage";
import { useAppTheme } from "../styles";
import { saveRawBook, loadRawBook } from "../storage/bookCache";
import { extractRawBook, sectionIndexForHref } from "../services/bookExtractor";
import {
  bookTitleFromUrlSegment,
  readerPathForBookTitle,
} from "../utils/bookTitleUrl";
import {
  clampSectionIndex,
  normalizeAnchor,
  normalizeSectionIndex,
} from "../utils/readingLocation";
import { yieldToReaderPaint } from "../utils/async";
import {
  getEstimatedPagePosition,
  getMeasuredPagePosition,
  measurePageMap,
  viewportsAlmostEqual,
  type MeasuredPageMap,
} from "../services/pageEstimation";
import type {
  TocItem,
  ReadingState,
  ReadingMode,
  Theme,
  RawExtractedBook,
  PageViewport,
} from "../types";

//#region Styled Components
const Root = styled.div`
  height: 100%;
  display: flex;
  flex-direction: column;
  overflow: hidden;
`;
const Container = styled.div`
  display: flex;
  overflow: hidden;
  flex: 1;
`;

const ProgressText = styled.div`
  font-size: 14px;
  color: var(--text);
`;

const ProgressBody = styled.div`
  flex: 1;
  display: flex;
  align-items: flex-start;
  justify-content: center;
  margin-top: 4rem;
`;
//#endregion

interface LocationState {
  file?: File;
  bookId?: string;
  bookTitle?: string;
  theme?: Theme;
}

function ReaderPage() {
  const location = useLocation();
  const navigate = useNavigate();
  const { bookTitle: routeBookTitle } = useParams<{ bookTitle?: string }>();
  const locationState = location.state as LocationState | null;

  const file = locationState?.file ?? null;
  const bookId = locationState?.bookId ?? null;
  const libraryTheme = useMemo(
    () => locationState?.theme ?? getCurrentLibraryTheme(),
    [locationState?.theme],
  );
  const [readingState, setReadingState] = useState<ReadingState | null>(null);

  const [extractedBook, setExtractedBook] = useState<RawExtractedBook | null>(
    null,
  );
  const [toc, setToc] = useState<TocItem[]>([]);
  const [currentSection, setCurrentSection] = useState(0);
  const [anchor, setAnchor] = useState(0);
  const [zoom, setZoom] = useState(100);
  const [mode, setMode] = useState<ReadingMode>("scrolled");
  const [theme, setTheme] = useAppTheme(libraryTheme);
  const [viewerViewport, setViewerViewport] = useState<PageViewport | null>(
    null,
  );
  const [measuredPages, setMeasuredPages] = useState<{
    bookId: string | null;
    pageMap: MeasuredPageMap;
  } | null>(null);
  const [extractionProgress, setExtractionProgress] = useState<string | null>(
    null,
  );
  const [loadedBookTitle, setLoadedBookTitle] = useState<{
    bookId: string;
    title: string;
  } | null>(null);

  const titleFromRoute = useMemo(
    () => bookTitleFromUrlSegment(routeBookTitle),
    [routeBookTitle],
  );
  const storedBookTitle =
    loadedBookTitle?.bookId === bookId ? loadedBookTitle.title : null;
  const bookTitle =
    locationState?.bookTitle ?? storedBookTitle ?? titleFromRoute ?? "";
  const canonicalReaderPath = useMemo(
    () => (bookTitle ? readerPathForBookTitle(bookTitle) : null),
    [bookTitle],
  );

  const sectionTextLengths = useMemo(
    () => extractedBook?.sections.map((s) => s.textLength) ?? [],
    [extractedBook],
  );

  const activePageMap = useMemo(() => {
    if (!measuredPages || !viewerViewport) return null;
    const { pageMap } = measuredPages;

    if (measuredPages.bookId !== bookId) return null;
    if (pageMap.zoom !== zoom) return null;
    if (pageMap.pageCounts.length !== sectionTextLengths.length) return null;
    if (!viewportsAlmostEqual(pageMap.viewport, viewerViewport)) {
      return null;
    }

    return pageMap;
  }, [bookId, measuredPages, sectionTextLengths.length, viewerViewport, zoom]);

  const pagePosition = useMemo(
    () =>
      activePageMap
        ? getMeasuredPagePosition(activePageMap, currentSection, anchor)
        : getEstimatedPagePosition(
            sectionTextLengths,
            currentSection,
            anchor,
            zoom,
          ),
    [activePageMap, anchor, currentSection, sectionTextLengths, zoom],
  );

  // Load reading state
  useEffect(() => {
    if (bookId) updateLastOpened(bookId);
  }, [bookId]);

  useEffect(() => {
    if (!bookId || locationState?.bookTitle) return;

    let cancelled = false;
    getBookMeta(bookId).then((book) => {
      if (!cancelled && book) {
        setLoadedBookTitle({ bookId, title: book.title });
      }
    });

    return () => {
      cancelled = true;
    };
  }, [bookId, locationState?.bookTitle]);

  useEffect(() => {
    if (!canonicalReaderPath || location.pathname === canonicalReaderPath) {
      return;
    }

    navigate(canonicalReaderPath, { replace: true, state: location.state });
  }, [canonicalReaderPath, location.pathname, location.state, navigate]);

  useEffect(() => {
    if (!bookId) return;
    let cancelled = false;
    loadReadingState(bookId).then((state) => {
      if (!cancelled) {
        setReadingState(state);
        setZoom(state.zoom);
        setMode(state.mode);
        if (state.lastLocation) {
          setCurrentSection(
            normalizeSectionIndex(state.lastLocation.sectionIndex),
          );
          setAnchor(normalizeAnchor(state.lastLocation.anchor));
        }
      }
    });
    return () => {
      cancelled = true;
    };
  }, [bookId]);

  useEffect(() => {
    if (!extractedBook || !viewerViewport) {
      return;
    }

    let cancelled = false;
    const controller = new AbortController();

    measurePageMap(
      extractedBook.sections,
      zoom,
      viewerViewport,
      theme,
      controller.signal,
    )
      .then((nextPageMap) => {
        if (!cancelled) setMeasuredPages({ bookId, pageMap: nextPageMap });
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        console.warn("Failed to measure page map:", error);
      });

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [bookId, extractedBook, theme, viewerViewport, zoom]);

  // Extract book when file is available
  useEffect(() => {
    if (!file || !bookId) return;
    let cancelled = false;
    const controller = new AbortController();

    const run = async () => {
      // Try cache first
      try {
        const cached = await loadRawBook(bookId, (done, total, message) => {
          if (!cancelled) {
            setExtractionProgress(
              message ?? `Loading cached book... ${done} / ${total}`,
            );
          }
        });
        if (cached) {
          if (!cancelled) {
            setExtractedBook(cached);
            setToc(cached.toc);
            setExtractionProgress(null);
          }
          return;
        }

        if (cancelled) return;

        // Full extraction
        setExtractionProgress("Extracting book...");
        const fileData = await file.arrayBuffer();
        if (cancelled) return;

        const result = await extractRawBook(
          fileData,
          bookId,
          (done, total, message) => {
            if (!cancelled) {
              setExtractionProgress(
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
        setExtractionProgress(null);

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

  // Persist position changes reported by SectionViewer
  const handlePositionChange = useCallback(
    (pos: { sectionIndex: number; anchor: number }) => {
      const nextPosition = {
        sectionIndex: normalizeSectionIndex(pos.sectionIndex),
        anchor: normalizeAnchor(pos.anchor),
      };
      setCurrentSection(nextPosition.sectionIndex);
      setAnchor(nextPosition.anchor);
      if (bookId) {
        saveReadingState(bookId, { lastLocation: nextPosition });
      }
    },
    [bookId],
  );

  // Track section navigation (section-boundary crossing, scrolled sentinels)
  const handleSectionNavigate = useCallback((sectionIndex: number) => {
    setCurrentSection(normalizeSectionIndex(sectionIndex));
  }, []);

  const handleViewportChange = useCallback((viewport: PageViewport) => {
    setViewerViewport((previous) => {
      if (previous && viewportsAlmostEqual(previous, viewport)) {
        return previous;
      }

      return viewport;
    });
  }, []);

  const handleNavigate = useCallback(
    (href: string) => {
      if (!extractedBook) return;
      const section = sectionIndexForHref(extractedBook.sections, href);
      setCurrentSection(section);
      setAnchor(0);
    },
    [extractedBook],
  );

  const zoomIn = useCallback(
    () =>
      setZoom((z) => {
        const next = Math.min(z + 10, 400);
        if (bookId) saveReadingState(bookId, { zoom: next });
        return next;
      }),
    [bookId],
  );
  const zoomOut = useCallback(
    () =>
      setZoom((z) => {
        const next = Math.max(z - 10, 20);
        if (bookId) saveReadingState(bookId, { zoom: next });
        return next;
      }),
    [bookId],
  );

  const handleModeChange = useCallback(
    (e: React.ChangeEvent<HTMLSelectElement>) => {
      const newMode = e.target.value as ReadingMode;
      setMode(newMode);
      if (bookId) saveReadingState(bookId, { mode: newMode });
    },
    [bookId],
  );

  const toggleTheme = useCallback(() => {
    setTheme((t) => (t === "light" ? "dark" : "light"));
  }, [setTheme]);

  const handleBackToLibrary = useCallback(() => {
    navigate("/");
  }, [navigate]);

  const controlsDisabled = !file || !readingState || !extractedBook;
  let body: React.ReactNode = null;

  if (file && readingState && !extractedBook) {
    body = (
      <ProgressBody>
        <ProgressText>{extractionProgress ?? "Loading..."}</ProgressText>
      </ProgressBody>
    );
  } else if (file && readingState && extractedBook) {
    const safeCurrentSection = clampSectionIndex(
      currentSection,
      extractedBook.sections.length,
    );
    const safeAnchor = normalizeAnchor(anchor);

    body = (
      <Container>
        <ReaderSidebar
          toc={toc}
          onNavigate={handleNavigate}
          page={pagePosition.page}
          total={pagePosition.total}
        />

        <SectionViewer
          sections={extractedBook.sections}
          bookId={bookId ?? ""}
          currentSection={safeCurrentSection}
          anchor={safeAnchor}
          zoom={zoom}
          mode={mode}
          theme={theme}
          onPositionChange={handlePositionChange}
          onNavigate={handleSectionNavigate}
          onViewportChange={handleViewportChange}
        />
      </Container>
    );
  }

  return (
    <Root>
      <ReaderToolbar
        bookTitle={bookTitle}
        mode={mode}
        onModeChange={handleModeChange}
        zoom={zoom}
        onZoomIn={zoomIn}
        onZoomOut={zoomOut}
        theme={theme}
        onToggleTheme={toggleTheme}
        onBackToLibrary={handleBackToLibrary}
        controlsDisabled={controlsDisabled}
      />
      {body}
    </Root>
  );
}

export default ReaderPage;
