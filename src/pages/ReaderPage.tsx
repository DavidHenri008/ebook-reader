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
import { estimateCharsPerPage } from "../services/pageEstimation";
import type { TocItem, ReadingState, ReadingMode, Theme } from "../types";
import type { RawExtractedBook } from "../types/bookPages";
import type { BookTimingEntry, BookTimingReporter } from "../types/performance";
import { getTimestamp, measureAsync, reportTiming } from "../utils/timing";

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
  align-items: top;
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
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KiB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MiB`;
}

function yieldToReaderPaint(): Promise<void> {
  return new Promise((resolve) => {
    requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
  });
}

function logBookTimings(
  fileName: string,
  outcome: string,
  entries: BookTimingEntry[],
): void {
  if (!import.meta.env.DEV || entries.length === 0) return;

  const total = entries.find((entry) => entry.phase === "reader:total");
  const totalLabel = total ? `, ${total.durationMs.toFixed(1)} ms` : "";

  console.groupCollapsed(
    `[ebook-reader] ${fileName} ${outcome} timings${totalLabel}`,
  );
  console.table(
    entries.map((entry) => ({
      phase: entry.phase,
      durationMs: entry.durationMs,
      section: entry.sectionIndex ?? "",
      href: entry.href ?? "",
      detail: entry.detail ?? "",
    })),
  );

  const slowestSections = entries
    .filter((entry) => entry.phase === "section:total")
    .sort((a, b) => b.durationMs - a.durationMs)
    .slice(0, 10);

  if (slowestSections.length > 0) {
    console.table(
      slowestSections.map((entry) => ({
        section: entry.sectionIndex ?? "",
        href: entry.href ?? "",
        durationMs: entry.durationMs,
      })),
    );
  }

  const slowestCacheRestores = entries
    .filter((entry) => entry.phase === "cache:restore-section-html-item")
    .sort((a, b) => b.durationMs - a.durationMs)
    .slice(0, 10);

  if (slowestCacheRestores.length > 0) {
    console.table(
      slowestCacheRestores.map((entry) => ({
        section: entry.sectionIndex ?? "",
        href: entry.href ?? "",
        durationMs: entry.durationMs,
        detail: entry.detail ?? "",
      })),
    );
  }

  const slowestCacheRestoreBatches = entries
    .filter((entry) => entry.phase === "cache:restore-section-html-batch")
    .sort((a, b) => b.durationMs - a.durationMs)
    .slice(0, 10);

  if (slowestCacheRestoreBatches.length > 0) {
    console.table(
      slowestCacheRestoreBatches.map((entry) => ({
        durationMs: entry.durationMs,
        detail: entry.detail ?? "",
      })),
    );
  }
  console.groupEnd();
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
    () => extractedBook?.sections.map((s) => s.textLength) ?? [],
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
    const controller = new AbortController();

    const run = async () => {
      const timingEntries: BookTimingEntry[] = [];
      const recordTiming: BookTimingReporter | undefined = import.meta.env.DEV
        ? (entry) => {
            timingEntries.push(entry);
          }
        : undefined;
      const readerStartedAt = getTimestamp();
      let timingOutcome = "cancelled";

      // Try cache first
      try {
        const cached = await measureAsync(
          recordTiming,
          "reader:cache-load-total",
          () =>
            loadRawBook(bookId, recordTiming, (done, total, message) => {
              if (!cancelled) {
                setExtractionProgress(
                  message ?? `Loading cached book... ${done} / ${total}`,
                );
              }
            }),
          { detail: bookId },
        );
        if (cached) {
          timingOutcome = "cache hit";
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
        const fileData = await measureAsync(
          recordTiming,
          "reader:file-array-buffer",
          () => file.arrayBuffer(),
          { detail: formatBytes(file.size) },
        );
        if (cancelled) return;

        const result = await extractRawBook(
          fileData,
          bookId,
          (done, total, message) => {
            if (!cancelled) {
              setExtractionProgress(
                message ??
                  (total > 0
                    ? `Extracting… ${done} / ${total} sections`
                    : "Extracting book…"),
              );
            }
          },
          controller.signal,
          recordTiming,
        );

        if (cancelled) return;

        setExtractedBook(result);
        setToc(result.toc);
        setExtractionProgress(null);
        timingOutcome = "fresh extraction";

        void (async () => {
          await yieldToReaderPaint();
          try {
            await measureAsync(
              recordTiming,
              "reader:cache-save-total",
              () => saveRawBook(result, recordTiming),
              { detail: `${result.sections.length} sections` },
            );
          } catch (e) {
            console.warn("Failed to cache book:", e);
          } finally {
            if (!cancelled) {
              logBookTimings(file.name, "background cache save", timingEntries);
            }
          }
        })();
      } catch (e) {
        if (controller.signal.aborted) {
          timingOutcome = "aborted";
          return;
        }
        timingOutcome = "failed";
        throw e;
      } finally {
        reportTiming(recordTiming, "reader:total", readerStartedAt, {
          detail: timingOutcome,
        });
        if (!cancelled) {
          logBookTimings(file.name, timingOutcome, timingEntries);
        }
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
            Page {estimatedPosition.page} of {estimatedPosition.total}
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
