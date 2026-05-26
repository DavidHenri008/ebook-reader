import { useEffect, useCallback, useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import styled from "@emotion/styled";
import { SectionViewer } from "../components";
import {
  saveReadingState,
  loadReadingState,
  updateLastOpened,
} from "../storage";
import { saveRawBook, loadRawBook } from "../storage/bookCache";
import { extractRawBook, sectionIndexForHref } from "../services/bookExtractor";
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
const Centered = styled.div`
  position: absolute;
  height: 100%;
  width: 100%;
  display: flex;
  flex-direction: column;
  opacity: 100%;
  background-color: var(--bg);
  z-index: 1;
  align-items: center;
  padding-top: 40px;
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

const LinkButton = styled.button`
  background: none;
  border: none;
  color: var(--text);
  cursor: pointer;
  font-size: 0.875rem;
  text-decoration: underline;

  &:hover {
    color: var(--accent);
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

const BASE_CHARS_PER_PAGE = 1800;

function getPlainTextLength(html: string): number {
  const parsed = new DOMParser().parseFromString(html, "text/html");
  return parsed.body.textContent?.replace(/\s+/g, " ").trim().length ?? 0;
}

function estimateCharsPerPage(zoom: number): number {
  const zoomFactor = zoom / 100;
  return Math.max(300, Math.round(BASE_CHARS_PER_PAGE / zoomFactor ** 2));
}

interface LocationState {
  file?: File;
  bookId?: string;
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

  // Captured once for the page's lifetime; navigation away unmounts this component.
  const [file] = useState<File | null>(() => locationState?.file ?? null);
  const [bookId] = useState<string | null>(() => locationState?.bookId ?? null);
  const [readingState, setReadingState] = useState<ReadingState | null>(null);

  const [extractedBook, setExtractedBook] = useState<RawExtractedBook | null>(
    null,
  );
  const [toc, setToc] = useState<TocItem[]>([]);
  const [currentSection, setCurrentSection] = useState(0);
  const [anchor, setAnchor] = useState(0);
  const [zoom, setZoom] = useState(100);
  const [mode, setMode] = useState<ReadingMode>("scrolled");
  const [theme, setTheme] = useState<Theme>(
    () => (localStorage.getItem("app-theme") as Theme | null) ?? "light",
  );
  const [extractionProgress, setExtractionProgress] = useState<string | null>(
    null,
  );

  const sectionTextLengths = useMemo(
    () =>
      extractedBook?.sections.map((section) =>
        getPlainTextLength(section.html),
      ) ?? [],
    [extractedBook],
  );

  const estimatedPosition = useMemo(() => {
    const sectionCount = sectionTextLengths.length;
    if (sectionCount === 0) {
      return { sectionNumber: 1, page: 1, total: 1 };
    }

    const charsPerPage = estimateCharsPerPage(zoom);
    const pageCounts = sectionTextLengths.map((textLength) =>
      Math.max(1, Math.ceil(textLength / charsPerPage)),
    );
    const safeSection = Math.min(Math.max(currentSection, 0), sectionCount - 1);
    const previousPages = pageCounts
      .slice(0, safeSection)
      .reduce((sum, count) => sum + count, 0);
    const textLength = sectionTextLengths[safeSection] ?? 0;
    const safeAnchor = Math.min(Math.max(anchor, 0), textLength);
    const pageInSection = Math.min(
      pageCounts[safeSection] ?? 1,
      Math.floor(safeAnchor / charsPerPage) + 1,
    );
    const total = pageCounts.reduce((sum, count) => sum + count, 0);

    return {
      sectionNumber: safeSection + 1,
      page: previousPages + pageInSection,
      total,
    };
  }, [anchor, currentSection, sectionTextLengths, zoom]);

  // Load reading state
  useEffect(() => {
    if (bookId) updateLastOpened(bookId);
  }, [bookId]);

  useEffect(() => {
    if (!bookId) return;
    let cancelled = false;
    loadReadingState(bookId).then((state) => {
      if (!cancelled) {
        setReadingState(state);
        setZoom(state.zoom);
        setMode(state.mode);
        if (state.theme) setTheme(state.theme);
        if (state.lastLocation) {
          setCurrentSection(Math.max(0, state.lastLocation.sectionIndex));
          setAnchor(Math.max(0, state.lastLocation.anchor));
        }
      }
    });
    return () => {
      cancelled = true;
    };
  }, [bookId]);

  // Apply explicit theme to document root so global CSS vars override the media query
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
  }, [theme]);

  // Extract book when file is available
  useEffect(() => {
    if (!file || !bookId) return;
    let cancelled = false;

    const run = async () => {
      // Try cache first
      const cached = await loadRawBook(bookId);
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

      const result = await extractRawBook(fileData, bookId, (done, total) => {
        if (!cancelled) {
          setExtractionProgress(
            `Extracting section ${done + 1} of ${total}...`,
          );
        }
      });

      if (!cancelled) setExtractionProgress("Saving to cache...");
      try {
        await saveRawBook(result);
      } catch (e) {
        console.warn("Failed to cache book:", e);
      }

      if (cancelled) return;

      setExtractedBook(result);
      setToc(result.toc);
      setExtractionProgress(null);
    };

    run();
    return () => {
      cancelled = true;
    };
  }, [file, bookId]);

  // Persist position changes reported by SectionViewer
  const handlePositionChange = useCallback(
    (pos: { sectionIndex: number; anchor: number }) => {
      setCurrentSection(pos.sectionIndex);
      setAnchor(pos.anchor);
      if (bookId) saveReadingState(bookId, { lastLocation: pos });
    },
    [bookId],
  );

  // Track section navigation (section-boundary crossing, scrolled sentinels)
  const handleSectionNavigate = useCallback((sectionIndex: number) => {
    setCurrentSection(sectionIndex);
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
    setTheme((t) => {
      const next: Theme = t === "light" ? "dark" : "light";
      if (bookId) saveReadingState(bookId, { theme: next });
      localStorage.setItem("app-theme", next);
      return next;
    });
  }, [bookId]);

  if (!file) {
    return (
      <Centered>
        <LinkButton onClick={() => navigate("/")}>← Back to Library</LinkButton>
      </Centered>
    );
  }

  if (!readingState) {
    return <Centered>Loading...</Centered>;
  }

  if (extractionProgress || !extractedBook) {
    return (
      <Centered>
        <ProgressText>{extractionProgress ?? "Loading..."}</ProgressText>
      </Centered>
    );
  }

  return (
    <Root>
      <Toolbar>
        <Button onClick={() => navigate("/")}>← Library</Button>
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
            Section {estimatedPosition.sectionNumber} &middot; ~page{" "}
            {estimatedPosition.page} of ~{estimatedPosition.total}
          </PositionText>
        </Sidebar>

        <SectionViewer
          sections={extractedBook.sections}
          bookId={bookId ?? ""}
          currentSection={Math.min(
            Math.max(currentSection, 0),
            extractedBook.sections.length - 1,
          )}
          anchor={anchor}
          zoom={zoom}
          mode={mode}
          theme={theme}
          onPositionChange={handlePositionChange}
          onNavigate={handleSectionNavigate}
        />
      </Container>
    </Root>
  );
}

export default ReaderPage;
