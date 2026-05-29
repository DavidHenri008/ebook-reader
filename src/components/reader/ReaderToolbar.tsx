import styled from "@emotion/styled";
import type { ReadingMode, Theme } from "../../types";

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

const BookTitle = styled.span`
  font-size: 16px;
  color: var(--text);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  max-width: 40%;
`;

const NavControls = styled.div`
  display: flex;
  align-items: center;
  gap: 8px;
  justify-content: flex-end;
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

const IconBtn = styled(Button)`
  width: 2.25rem;
  display: inline-flex;
  align-items: center;
  justify-content: center;
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

interface ReaderToolbarProps {
  bookTitle: string;
  mode: ReadingMode;
  onModeChange: (e: React.ChangeEvent<HTMLSelectElement>) => void;
  zoom: number;
  onZoomIn: () => void;
  onZoomOut: () => void;
  theme: Theme;
  onToggleTheme: () => void;
  onBackToLibrary: () => void;
  controlsDisabled: boolean;
}

function ReaderToolbar({
  bookTitle,
  mode,
  onModeChange,
  zoom,
  onZoomIn,
  onZoomOut,
  theme,
  onToggleTheme,
  onBackToLibrary,
  controlsDisabled,
}: ReaderToolbarProps) {
  return (
    <Toolbar>
      <Button onClick={onBackToLibrary}>← Library</Button>
      <BookTitle title={bookTitle}>{bookTitle}</BookTitle>
      <NavControls>
        <ModeSelect
          aria-label="Reading mode"
          value={mode}
          onChange={onModeChange}
          disabled={controlsDisabled}
        >
          <option value="scrolled">Scrolled</option>
          <option value="paginated">Paginated</option>
        </ModeSelect>
        <IconBtn onClick={onZoomOut} disabled={controlsDisabled}>
          -
        </IconBtn>
        <Zoom>{zoom}%</Zoom>
        <IconBtn onClick={onZoomIn} disabled={controlsDisabled}>
          +
        </IconBtn>
        <IconBtn
          aria-label="Toggle theme"
          title={
            theme === "light" ? "Switch to dark mode" : "Switch to light mode"
          }
          onClick={onToggleTheme}
        >
          {theme === "light" ? "☾" : "☀"}
        </IconBtn>
      </NavControls>
    </Toolbar>
  );
}

export default ReaderToolbar;
