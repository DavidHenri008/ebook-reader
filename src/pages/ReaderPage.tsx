import { useState, useRef, useEffect, useCallback } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import styled from "@emotion/styled";
import { EpubViewer } from "../components";
import {
  saveReadingState,
  loadReadingState,
  updateLastOpened,
} from "../storage";
import type { TocItem, ReadingState } from "../types";

//#region Styled Components
const Container = styled.div`
  display: grid;
  grid-template-rows: auto 1fr;
  grid-template-columns: 260px 1fr;
  height: 100vh;
  overflow: hidden;
  width: 100vw;
`;

const Centered = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 100vh;
  gap: 1rem;
`;

const Toolbar = styled.div`
  grid-column: 1 / -1;
  grid-row: 1;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0.5rem 1rem;
  border-bottom: 1px solid var(--border);
  background-color: var(--bg);
  z-index: 10;
`;



const Sidebar = styled.nav`
  grid-column: 1;
  grid-row: 2;
  overflow-y: auto;
  overflow-x: hidden;
  border-right: 1px solid var(--border);
  background-color: var(--bg);
  padding: 0.75rem 0;
  box-sizing: border-box;
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

const ViewerWrapper = styled.div`
  grid-column: 2;
  grid-row: 2;
  min-width: 0;
  overflow: hidden;
  background-color: var(--bg);
`;

const ViewerInner = styled.div<{ zoom: number }>`
  width: calc(760px * ${(p) => p.zoom} / 100);
  min-width: 100%;
  height: 100%;
`;

const BookTitle = styled.span`
  font-size: 0.875rem;
  color: var(--text);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  max-width: 40%;
`;

const FontControls = styled.div`
  display: flex;
  align-items: center;
  gap: 0.5rem;
`;

const ZoomLabel = styled.span`
  font-size: 0.75rem;
  color: var(--text);
  min-width: 3.5rem;
  text-align: center;
`;

const Button = styled.button`
  padding: 0.5rem 1rem;
  border: 1px solid var(--border);
  border-radius: 4px;
  background-color: var(--bg);
  color: var(--text);
  cursor: pointer;
  font-size: 0.875rem;

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
//#endregion

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

  const [file] = useState<File | null>(locationState?.file ?? null);
  const [bookId] = useState<string | null>(locationState?.bookId ?? null);
  const [readingState, setReadingState] = useState<ReadingState | null>(null);
  const [toc, setToc] = useState<TocItem[]>([]);
  const goToRef = useRef<((href: string) => void) | null>(null);

  useEffect(() => {
    if (bookId) updateLastOpened(bookId);
  }, [bookId]);

  useEffect(() => {
    if (!bookId) return;
    let cancelled = false;
    loadReadingState(bookId).then((state) => {
      if (!cancelled) setReadingState(state);
    });
    return () => {
      cancelled = true;
    };
  }, [bookId]);

  const handleLocationChange = useCallback(
    (cfi: string) => {
      if (!bookId) return;
      saveReadingState(bookId, { lastLocationCfi: cfi });
    },
    [bookId],
  );

  const changeZoom = useCallback(
    (delta: number) => {
      if (!bookId || !readingState) return;
      const current = Number.isFinite(readingState.zoom)
        ? readingState.zoom
        : 100;
      const newZoom = Math.max(50, Math.min(200, current + delta));
      setReadingState((prev) => (prev ? { ...prev, zoom: newZoom } : prev));
      saveReadingState(bookId, { zoom: newZoom });
    },
    [bookId, readingState],
  );

  const handleNavigate = useCallback((href: string) => {
    goToRef.current?.(href);
  }, []);

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

  return (
    <Container>
      <Toolbar>
        <Button onClick={() => navigate("/")}>← Library</Button>
        <BookTitle>{file.name}</BookTitle>
        <FontControls>
          <Button onClick={() => changeZoom(-10)}>−</Button>
          <ZoomLabel>{readingState.zoom}%</ZoomLabel>
          <Button onClick={() => changeZoom(10)}>+</Button>
        </FontControls>
      </Toolbar>

        <Sidebar>
          <SidebarTitle>Contents</SidebarTitle>
          {toc.length > 0 ? (
            <TocList items={toc} onNavigate={handleNavigate} />
          ) : (
            <EmptySidebar>No chapters found</EmptySidebar>
          )}
        </Sidebar>

        <ViewerWrapper>
          <ViewerInner zoom={readingState.zoom}>
            <EpubViewer
              file={file}
              zoom={readingState.zoom}
              initialLocation={readingState.lastLocationCfi}
              onLocationChange={handleLocationChange}
              onTocLoaded={setToc}
              onReady={(fn) => {
                goToRef.current = fn;
              }}
            />
          </ViewerInner>
        </ViewerWrapper>
    </Container>
  );
}

export default ReaderPage;
