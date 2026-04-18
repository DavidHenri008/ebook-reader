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
`;
const Sidebar = styled.div`
  border-right: 1px solid var(--border);
  background-color: var(--bg);
  padding: 0.75rem 0;
  box-sizing: border-box;
  min-width: 200px;
  max-width: 300px;
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
  flex: 1;
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
const Zoom = styled.span`
  font-size: 16px;
  color: var(--text);
`;

const ToggleLabel = styled.label`
  display: flex;
  align-items: center;
  gap: 6px;
  cursor: pointer;
  font-size: 14px;
  color: var(--text);
  user-select: none;
`;

const ToggleInput = styled.input`
  appearance: none;
  width: 36px;
  height: 20px;
  background-color: var(--border);
  border-radius: 10px;
  position: relative;
  cursor: pointer;
  transition: background-color 0.2s;

  &::after {
    content: "";
    position: absolute;
    width: 14px;
    height: 14px;
    background: white;
    border-radius: 50%;
    top: 3px;
    left: 3px;
    transition: transform 0.2s;
  }

  &:checked {
    background-color: var(--accent);
  }

  &:checked::after {
    transform: translateX(16px);
  }
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
  const [zoom, setZoom] = useState(100);
  const [file] = useState<File | null>(locationState?.file ?? null);
  const [bookId] = useState<string | null>(locationState?.bookId ?? null);
  const [readingState, setReadingState] = useState<ReadingState | null>(null);
  const [toggleValue, setToggleValue] = useState(false);
  const [toc, setToc] = useState<TocItem[]>([]);
  const controlsRef = useRef<{
    goTo: (href: string) => void;
    prev: () => void;
    next: () => void;
  } | null>(null);

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
        setToggleValue(state.mode === "paginated");
      }
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

  const handleNavigate = useCallback((href: string) => {
    controlsRef.current?.goTo(href);
  }, []);

  const handlePrev = useCallback(() => controlsRef.current?.prev(), []);
  const handleNext = useCallback(() => controlsRef.current?.next(), []);
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

  const handleToggleChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const value = e.target.checked;
      setToggleValue(value);
      if (bookId)
        saveReadingState(bookId, { mode: value ? "paginated" : "scrolled" });
    },
    [bookId],
  );

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
    <Root>
      <Toolbar>
        <Button onClick={() => navigate("/")}>← Library</Button>
        <NavControls>
          <Button onClick={handlePrev}>‹</Button>
          <BookTitle>{file.name}</BookTitle>
          <Button onClick={handleNext}>›</Button>
        </NavControls>
        <NavControls>
          <ToggleLabel>
            Scrolled
            <ToggleInput
              type="checkbox"
              checked={toggleValue}
              onChange={handleToggleChange}
            />
            Paginated
          </ToggleLabel>
          <Button onClick={zoomOut}>-</Button>
          <Zoom>{zoom}</Zoom>
          <Button onClick={zoomIn}>+</Button>
        </NavControls>
      </Toolbar>
      <Container>
        <Sidebar>
          <SidebarTitle>Contents</SidebarTitle>
          {toc.length > 0 ? (
            <TocList items={toc} onNavigate={handleNavigate} />
          ) : (
            <EmptySidebar>No chapters found</EmptySidebar>
          )}
        </Sidebar>

        <EpubViewer
          file={file}
          initialLocation={readingState.lastLocationCfi}
          onLocationChange={handleLocationChange}
          onTocLoaded={setToc}
          onReady={(controls) => {
            controlsRef.current = controls;
          }}
          zoom={zoom}
          mode={toggleValue ? "paginated" : "scrolled"}
        />
      </Container>
    </Root>
  );
}

export default ReaderPage;
