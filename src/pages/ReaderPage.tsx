import { useEffect, useCallback, useMemo, useState } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import styled from "@emotion/styled";
import { SectionViewer, ReaderToolbar, ReaderSidebar } from "../components";
import {
  loadReadingState,
  updateLastOpened,
  getBookMeta,
  getCurrentLibraryTheme,
} from "../storage";
import { sectionIndexForHref } from "../services/bookExtractor";
import {
  bookTitleFromUrlSegment,
  readerPathForBookTitle,
} from "../utils/bookTitleUrl";
import {
  clampSectionIndex,
  normalizeAnchor,
  normalizeSectionIndex,
} from "../utils/readingLocation";
import {
  getEstimatedPagePosition,
  getMeasuredPagePosition,
} from "../services/pageEstimation";
import { viewportsAlmostEqual } from "../reader/viewport";
import {
  useBookExtraction,
  usePageMap,
  useReaderTheme,
  useReaderPersistence,
} from "./reader";
import type {
  ReadingState,
  ReadingMode,
  Theme,
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

const ZOOM_STEP = 10;
const ZOOM_MIN = 20;
const ZOOM_MAX = 400;

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

  const [currentSection, setCurrentSection] = useState(0);
  const [anchor, setAnchor] = useState(0);
  const [zoom, setZoom] = useState(100);
  const [mode, setMode] = useState<ReadingMode>("scrolled");
  const { theme, toggleTheme } = useReaderTheme(libraryTheme);
  const { saveZoom, saveMode, savePosition } = useReaderPersistence(bookId);
  const [viewerViewport, setViewerViewport] = useState<PageViewport | null>(
    null,
  );
  const [loadedBookTitle, setLoadedBookTitle] = useState<{
    bookId: string;
    title: string;
  } | null>(null);

  const {
    extractedBook,
    toc,
    progressMessage: extractionProgress,
  } = useBookExtraction(file, bookId);

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

  const activePageMap = usePageMap(
    extractedBook,
    viewerViewport,
    zoom,
    theme,
    bookId,
  );

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

  // Persist position changes reported by SectionViewer
  const handlePositionChange = useCallback(
    (pos: { sectionIndex: number; anchor: number }) => {
      const nextPosition = {
        sectionIndex: normalizeSectionIndex(pos.sectionIndex),
        anchor: normalizeAnchor(pos.anchor),
      };
      setCurrentSection(nextPosition.sectionIndex);
      setAnchor(nextPosition.anchor);
      savePosition(nextPosition);
    },
    [savePosition],
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

  const applyZoomDelta = useCallback(
    (delta: number) =>
      setZoom((z) => {
        const next = Math.min(Math.max(z + delta, ZOOM_MIN), ZOOM_MAX);
        saveZoom(next);
        return next;
      }),
    [saveZoom],
  );

  const zoomIn = useCallback(
    () => applyZoomDelta(ZOOM_STEP),
    [applyZoomDelta],
  );
  const zoomOut = useCallback(
    () => applyZoomDelta(-ZOOM_STEP),
    [applyZoomDelta],
  );

  const handleModeChange = useCallback(
    (e: React.ChangeEvent<HTMLSelectElement>) => {
      const newMode = e.target.value as ReadingMode;
      setMode(newMode);
      saveMode(newMode);
    },
    [saveMode],
  );

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
          styles={extractedBook.styles}
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
