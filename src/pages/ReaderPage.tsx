import { useEffect, useCallback, useMemo, useState } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import styled from "@emotion/styled";
import { SectionViewer } from "../components";
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
const Toolbar = styled.div`
  width: 100%;
  display: flex;
  align-items: center;
  padding: 0.5rem 1rem;
  border-bottom: 1px solid var(--border);
  background-color: var(--bg);
  z-index: 10;
  justify-content: space-between;
`;
const Sidebar = styled.div`
  border-right: 1px solid var(--border);
  background-color: var(--bg);
  padding: 0.75rem 0;
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  min-width: 200px;
  max-width: 300px;
  overflow: hidden;
`;

const SidebarTitle = styled.div`
  padding: 0 1rem 0.5rem;
  font-size: 0.7rem;
  font-weight: 600;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--text);
  opacity: 0.6;
`;

const TocButton = styled.button<{ depth: number }>`
  display: block;
  width: 100%;
  text-align: left;
  padding: 0.35rem 1rem 0.35rem ${(p) => 1 + p.depth * 1}rem;
  background: none;
  border: none;
  color: var(--text);
  font-size: 0.85rem;
  cursor: pointer;
  line-height: 1.4;

  &:hover {
    background-color: var(--accent-bg);
    color: var(--accent);
  }
`;

const NavControls = styled.div`
  display: flex;
  align-items: center;
  gap: 8px;
  justify-content: flex-end;
`;

const BookTitle = styled.span`
  font-size: 16px;
  color: var(--text);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  max-width: 40%;
`;

const Button = styled.button`
  border: none;
  background-color: var(--bg);
  color: var(--text);
  cursor: pointer;
  font-size: 20px;

  &:hover {
    background-color: var(--accent-bg);
  }

  &:disabled {
    cursor: not-allowed;
    opacity: 0.5;
  }

  &:disabled:hover {
    background-color: var(--bg);
  }
`;

const EmptySidebar = styled.div`
  padding: 0 1rem;
  font-size: 0.85rem;
  color: var(--text);
  opacity: 0.5;
`;

const TocContent = styled.div`
  flex: 1;
  overflow: auto;
`;

const Zoom = styled.span`
  font-size: 16px;
  color: var(--text);
`;

const ModeSelect = styled.select`
  border: 1px solid var(--border);
  border-radius: 4px;
  background-color: var(--bg);
  color: var(--text);
  cursor: pointer;
  font-size: 14px;
  padding: 0.25rem 0.5rem;

  &:disabled {
    cursor: not-allowed;
    opacity: 0.5;
  }
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

const PositionText = styled.div`
  border-top: 1px solid var(--border);
  color: var(--text);
  font-size: 0.85rem;
  line-height: 1.4;
  margin-top: auto;
  padding: 0.75rem 1rem 0;
`;

const PositionLabel = styled.div`
  color: var(--text);
  font-size: 0.7rem;
  font-weight: 600;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  opacity: 0.6;
`;
//#endregion

interface LocationState {
  file?: File;
  bookId?: string;
  bookTitle?: string;
  theme?: Theme;
}

function TocList({
  items,
  depth = 0,
  onNavigate,
}: {
  items: TocItem[];
  depth?: number;
  onNavigate: (href: string) => void;
}) {
  return (
    <>
      {items.map((item) => (
        <div key={item.id}>
          <TocButton depth={depth} onClick={() => onNavigate(item.href)}>
            {item.label}
          </TocButton>
          {item.subitems && (
            <TocList
              items={item.subitems}
              depth={depth + 1}
              onNavigate={onNavigate}
            />
          )}
        </div>
      ))}
    </>
  );
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
        <Sidebar>
          <SidebarTitle>Contents</SidebarTitle>
          <TocContent>
            {toc.length > 0 ? (
              <TocList items={toc} onNavigate={handleNavigate} />
            ) : (
              <EmptySidebar>No chapters found</EmptySidebar>
            )}
          </TocContent>
          <PositionText>
            <PositionLabel>Position</PositionLabel>
            Page {pagePosition.page} of {pagePosition.total}
          </PositionText>
        </Sidebar>

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
      <Toolbar>
        <Button onClick={handleBackToLibrary}>← Library</Button>
        <BookTitle title={bookTitle}>{bookTitle}</BookTitle>
        <NavControls>
          <ModeSelect
            aria-label="Reading mode"
            value={mode}
            onChange={handleModeChange}
            disabled={controlsDisabled}
          >
            <option value="scrolled">Scrolled</option>
            <option value="paginated">Paginated</option>
          </ModeSelect>
          <Button onClick={zoomOut} disabled={controlsDisabled}>
            -
          </Button>
          <Zoom>{zoom}%</Zoom>
          <Button onClick={zoomIn} disabled={controlsDisabled}>
            +
          </Button>
          <Button
            aria-label="Toggle theme"
            title={
              theme === "light" ? "Switch to dark mode" : "Switch to light mode"
            }
            onClick={toggleTheme}
          >
            {theme === "light" ? "☾" : "☀"}
          </Button>
        </NavControls>
      </Toolbar>
      {body}
    </Root>
  );
}

export default ReaderPage;
