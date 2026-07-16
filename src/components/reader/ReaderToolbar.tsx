import styled from "@emotion/styled";
import ArrowBackIcon from "@mui/icons-material/ArrowBack";
import DarkModeIcon from "@mui/icons-material/DarkMode";
import LightModeIcon from "@mui/icons-material/LightMode";
import ZoomInIcon from "@mui/icons-material/ZoomIn";
import ZoomOutIcon from "@mui/icons-material/ZoomOut";
import MuiButton from "@mui/material/Button";
import IconButton from "@mui/material/IconButton";
import ToggleButton from "@mui/material/ToggleButton";
import ToggleButtonGroup from "@mui/material/ToggleButtonGroup";
import Tooltip from "@mui/material/Tooltip";
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

const Zoom = styled.span`
  font-size: 16px;
  color: var(--text);
`;

interface ReaderToolbarProps {
  bookTitle: string;
  mode: ReadingMode;
  onModeChange: (mode: ReadingMode) => void;
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
      <MuiButton startIcon={<ArrowBackIcon />} onClick={onBackToLibrary}>
        Library
      </MuiButton>
      <BookTitle title={bookTitle}>{bookTitle}</BookTitle>
      <NavControls>
        <ToggleButtonGroup
          exclusive
          size="small"
          aria-label="Reading mode"
          value={mode}
          onChange={(_event, value: ReadingMode | null) => {
            if (value) onModeChange(value);
          }}
          disabled={controlsDisabled}
        >
          <ToggleButton value="scrolled">Scrolled</ToggleButton>
          <ToggleButton value="paginated">Paginated</ToggleButton>
        </ToggleButtonGroup>
        <Tooltip title="Zoom out">
          <span>
            <IconButton
              aria-label="Zoom out"
              onClick={onZoomOut}
              disabled={controlsDisabled}
            >
              <ZoomOutIcon />
            </IconButton>
          </span>
        </Tooltip>
        <Zoom>{zoom}%</Zoom>
        <Tooltip title="Zoom in">
          <span>
            <IconButton
              aria-label="Zoom in"
              onClick={onZoomIn}
              disabled={controlsDisabled}
            >
              <ZoomInIcon />
            </IconButton>
          </span>
        </Tooltip>
        <Tooltip
          title={
            theme === "light" ? "Switch to dark mode" : "Switch to light mode"
          }
        >
          <IconButton aria-label="Toggle theme" onClick={onToggleTheme}>
            {theme === "light" ? <DarkModeIcon /> : <LightModeIcon />}
          </IconButton>
        </Tooltip>
      </NavControls>
    </Toolbar>
  );
}

export default ReaderToolbar;
