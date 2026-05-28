import { useEffect, useCallback, useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import styled from "@emotion/styled";
import { SectionViewer } from "../components";
import {
  saveReadingState,
  loadReadingState,
  updateLastOpened,
  getCurrentLibraryTheme,
  THEME_STORAGE_KEY,
} from "../storage";
import { saveRawBook, loadRawBook } from "../storage/bookCache";
import { extractRawBook, sectionIndexForHref } from "../services/bookExtractor";
import {
  getEstimatedPagePosition,
  getMeasuredPagePosition,
  measurePageMap,
  type MeasuredPageMap,
  type PageViewport,
} from "../services/pageEstimation";
import type { TocItem, ReadingState, ReadingMode, Theme } from "../types";
import type { RawExtractedBook } from "../types/bookPages";

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
  theme?: Theme;
}

function yieldToReaderPaint(): Promise<void> {
  return new Promise((resolve) => {
    requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
  });
}

function normalizeAnchor(value: number | undefined): number {
  return typeof value === "number" && Number.isFinite(value)
    ? Math.max(0, value)
    : 0;
}

function normalizeSectionIndex(value: number | undefined): number {
  return typeof value === "number" && Number.isFinite(value)
    ? Math.max(0, Math.trunc(value))
    : 0;
}

function clampSectionIndex(value: number, sectionCount: number): number {
  if (sectionCount <= 0) return 0;
  return Math.min(normalizeSectionIndex(value), sectionCount - 1);
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
  const [theme, setTheme] = useState<Theme>(() => libraryTheme);
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
    if (
      Math.abs(pageMap.viewport.width - viewerViewport.width) >= 0.5 ||
      Math.abs(pageMap.viewport.height - viewerViewport.height) >= 0.5
    ) {
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
    if (!bookId) return;
    let cancelled = false;
    loadReadingState(bookId, libraryTheme).then((state) => {
      if (!cancelled) {
        setReadingState(state);
        setZoom(state.zoom);
        setMode(state.mode);
        if (state.theme) setTheme(state.theme);
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
  }, [bookId, libraryTheme]);

  // Apply explicit theme to document root so global CSS vars override the media query
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
  }, [theme]);

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
        saveReadingState(bookId, { lastLocation: nextPosition, theme });
      }
    },
    [bookId, theme],
  );

  // Track section navigation (section-boundary crossing, scrolled sentinels)
  const handleSectionNavigate = useCallback((sectionIndex: number) => {
    setCurrentSection(normalizeSectionIndex(sectionIndex));
  }, []);

  const handleViewportChange = useCallback((viewport: PageViewport) => {
    setViewerViewport((previous) => {
      if (
        previous &&
        Math.abs(previous.width - viewport.width) < 0.5 &&
        Math.abs(previous.height - viewport.height) < 0.5
      ) {
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
        if (bookId) saveReadingState(bookId, { zoom: next, theme });
        return next;
      }),
    [bookId, theme],
  );
  const zoomOut = useCallback(
    () =>
      setZoom((z) => {
        const next = Math.max(z - 10, 20);
        if (bookId) saveReadingState(bookId, { zoom: next, theme });
        return next;
      }),
    [bookId, theme],
  );

  const handleModeChange = useCallback(
    (e: React.ChangeEvent<HTMLSelectElement>) => {
      const newMode = e.target.value as ReadingMode;
      setMode(newMode);
      if (bookId) saveReadingState(bookId, { mode: newMode, theme });
    },
    [bookId, theme],
  );

  const toggleTheme = useCallback(() => {
    setTheme((t) => {
      const next: Theme = t === "light" ? "dark" : "light";
      if (bookId) saveReadingState(bookId, { theme: next });
      localStorage.setItem(THEME_STORAGE_KEY, next);
      return next;
    });
  }, [bookId]);

  const handleBackToLibrary = useCallback(() => {
    navigate("/");
  }, [navigate]);

  if (!file) {
    return (
      <Root>
        <Toolbar>
          <Button onClick={handleBackToLibrary}>← Library</Button>
          <BookTitle />
          <NavControls>
            <Button
              aria-label="Toggle theme"
              title={
                theme === "light"
                  ? "Switch to dark mode"
                  : "Switch to light mode"
              }
              onClick={toggleTheme}
            >
              {theme === "light" ? "☾" : "☀"}
            </Button>
          </NavControls>
        </Toolbar>
      </Root>
    );
  }

  if (!readingState) {
    return (
      <Root>
        <Toolbar>
          <Button onClick={handleBackToLibrary}>← Library</Button>
          <BookTitle>{file.name}</BookTitle>
          <NavControls>
            <Button
              aria-label="Toggle theme"
              title={
                theme === "light"
                  ? "Switch to dark mode"
                  : "Switch to light mode"
              }
              onClick={toggleTheme}
            >
              {theme === "light" ? "☾" : "☀"}
            </Button>
          </NavControls>
        </Toolbar>
      </Root>
    );
  }

  if (extractionProgress || !extractedBook) {
    return (
      <Root>
        <Toolbar>
          <Button onClick={handleBackToLibrary}>← Library</Button>
          <BookTitle>{file.name}</BookTitle>
          <NavControls>
            <Button
              aria-label="Toggle theme"
              title={
                theme === "light"
                  ? "Switch to dark mode"
                  : "Switch to light mode"
              }
              onClick={toggleTheme}
            >
              {theme === "light" ? "☾" : "☀"}
            </Button>
          </NavControls>
        </Toolbar>
        <ProgressBody>
          <ProgressText>{extractionProgress ?? "Loading..."}</ProgressText>
        </ProgressBody>
      </Root>
    );
  }

  const safeCurrentSection = clampSectionIndex(
    currentSection,
    extractedBook.sections.length,
  );
  const safeAnchor = normalizeAnchor(anchor);

  return (
    <Root>
      <Toolbar>
        <Button onClick={handleBackToLibrary}>← Library</Button>
        <BookTitle>{file.name}</BookTitle>
        <NavControls>
          <ModeSelect
            aria-label="Reading mode"
            value={mode}
            onChange={handleModeChange}
          >
            <option value="scrolled">Scrolled</option>
            <option value="paginated">Paginated</option>
          </ModeSelect>
          <Button onClick={zoomOut}>-</Button>
          <Zoom>{zoom}%</Zoom>
          <Button onClick={zoomIn}>+</Button>
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
            {pagePosition.estimated ? "~Page" : "Page"} {pagePosition.page} of{" "}
            {pagePosition.estimated ? "~" : ""}
            {pagePosition.total}
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
    </Root>
  );
}

export default ReaderPage;
