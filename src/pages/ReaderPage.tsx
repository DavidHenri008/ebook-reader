import { useEffect, useCallback, useMemo, useState } from "react";
import { useLocation, useNavigate, useParams } from "@tanstack/react-router";
import styled from "@emotion/styled";
import { SectionViewer, ReaderToolbar, ReaderSidebar } from "../components";
import {
  loadReadingState,
  updateLastOpened,
  getCurrentLibraryTheme,
} from "../storage";
import { sectionIndexForHref } from "../services/bookExtractor";
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
  useReaderBookTitle,
} from "./reader";
import type {
  ReadingState,
  ReadingMode,
  Theme,
  PageViewport,
  RawExtractedBook,
  TocItem,
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
  bookId?: string;
  bookTitle?: string;
  theme?: Theme;
}

const ZOOM_STEP = 10;
const ZOOM_MIN = 20;
const ZOOM_MAX = 400;

interface ReaderBodyProps {
  readingState: ReadingState | null;
  extractedBook: RawExtractedBook | null;
  extractionProgress: string | null;
  toc: TocItem[];
  onNavigate: (href: string) => void;
  pagePosition: { page: number; total: number };
  bookId: string | null;
  currentSection: number;
  anchor: number;
  zoom: number;
  mode: ReadingMode;
  theme: Theme;
  onPositionChange: (pos: { sectionIndex: number; anchor: number }) => void;
  onSectionNavigate: (sectionIndex: number) => void;
  onViewportChange: (viewport: PageViewport) => void;
}

function ReaderBody({
  readingState,
  extractedBook,
  extractionProgress,
  toc,
  onNavigate,
  pagePosition,
  bookId,
  currentSection,
  anchor,
  zoom,
  mode,
  theme,
  onPositionChange,
  onSectionNavigate,
  onViewportChange,
}: ReaderBodyProps) {
  if (!bookId || !readingState) {
    return (
      <ProgressBody>
        <ProgressText>Loading reading state...</ProgressText>
      </ProgressBody>
    );
  }

  if (!extractedBook) {
    return (
      <ProgressBody>
        <ProgressText>{extractionProgress ?? "Loading..."}</ProgressText>
      </ProgressBody>
    );
  }

  const safeCurrentSection = clampSectionIndex(
    currentSection,
    extractedBook.sections.length,
  );
  const safeAnchor = normalizeAnchor(anchor);

  return (
    <Container>
      <ReaderSidebar
        toc={toc}
        onNavigate={onNavigate}
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
        onPositionChange={onPositionChange}
        onNavigate={onSectionNavigate}
        onViewportChange={onViewportChange}
      />
    </Container>
  );
}

function ReaderPage() {
  const location = useLocation();
  const navigate = useNavigate();
  const { bookId: routeBookId } = useParams({ strict: false });
  const locationState = location.state as LocationState | undefined;

  const bookId = locationState?.bookId ?? routeBookId ?? null;
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
  const [viewerViewport, setViewerViewport] = useState<PageViewport | null>(
    null,
  );

  const {
    extractedBook,
    toc,
    progressMessage: extractionProgress,
    resolvedBookId,
  } = useBookExtraction(bookId);

  const effectiveBookId = resolvedBookId ?? bookId;
  const { saveZoom, saveMode, savePosition } =
    useReaderPersistence(effectiveBookId);

  const { bookTitle } = useReaderBookTitle(
    effectiveBookId,
    locationState?.bookTitle,
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
    effectiveBookId,
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
    if (effectiveBookId) updateLastOpened(effectiveBookId);
  }, [effectiveBookId]);

  useEffect(() => {
    if (!effectiveBookId) return;
    let cancelled = false;
    loadReadingState(effectiveBookId).then((state) => {
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
  }, [effectiveBookId]);

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

  const zoomIn = useCallback(() => applyZoomDelta(ZOOM_STEP), [applyZoomDelta]);
  const zoomOut = useCallback(
    () => applyZoomDelta(-ZOOM_STEP),
    [applyZoomDelta],
  );

  const handleModeChange = useCallback(
    (newMode: ReadingMode) => {
      setMode(newMode);
      saveMode(newMode);
    },
    [saveMode],
  );

  const handleBackToLibrary = useCallback(() => {
    navigate({ to: "/" });
  }, [navigate]);

  const controlsDisabled = !effectiveBookId || !readingState || !extractedBook;

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
      <ReaderBody
        readingState={readingState}
        extractedBook={extractedBook}
        extractionProgress={extractionProgress}
        toc={toc}
        onNavigate={handleNavigate}
        pagePosition={pagePosition}
        bookId={effectiveBookId}
        currentSection={currentSection}
        anchor={anchor}
        zoom={zoom}
        mode={mode}
        theme={theme}
        onPositionChange={handlePositionChange}
        onSectionNavigate={handleSectionNavigate}
        onViewportChange={handleViewportChange}
      />
    </Root>
  );
}

export default ReaderPage;
