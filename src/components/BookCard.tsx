import { useId, useState } from "react";
import styled from "@emotion/styled";
import ClearAllIcon from "@mui/icons-material/ClearAll";
import DriveFileMoveIcon from "@mui/icons-material/DriveFileMove";
import MoreVertIcon from "@mui/icons-material/MoreVert";
import RemoveCircleIcon from "@mui/icons-material/RemoveCircleOutlined";
import ButtonBase from "@mui/material/ButtonBase";
import CircularProgress from "@mui/material/CircularProgress";
import IconButton from "@mui/material/IconButton";
import ListItemIcon from "@mui/material/ListItemIcon";
import Menu from "@mui/material/Menu";
import MenuItem from "@mui/material/MenuItem";
import Tooltip from "@mui/material/Tooltip";
import type { BookMeta } from "../types";

//#region Styled Components
const Card = styled.div`
  position: relative;
  width: 140px;
`;

const OpenButton = styled(ButtonBase)`
  display: flex;
  flex-direction: column;
  width: 100%;
  padding: 0;
  border: none;
  background: none;
  text-align: left;
  font: inherit;
  color: inherit;
  cursor: pointer;
  transition: transform 0.2s;

  &:hover {
    transform: translateY(-4px);
  }

  &:focus-visible {
    outline: 2px solid var(--accent);
    outline-offset: 2px;
    border-radius: 4px;
  }

  &:disabled {
    cursor: progress;
  }

  &:disabled:hover {
    transform: none;
  }
`;

const CoverWrapper = styled.div`
  position: relative;
  width: 140px;
  height: 200px;
  border-radius: 4px;
  overflow: hidden;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15);
  background-color: var(--border);
`;

const Cover = styled.img`
  width: 100%;
  height: 100%;
  object-fit: cover;
`;

const PlaceholderCover = styled.div`
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  background: linear-gradient(135deg, var(--accent-bg) 0%, var(--bg) 100%);
  color: var(--accent);
  font-size: 3rem;
  font-weight: bold;
`;

const Title = styled.div`
  margin-top: 0.5rem;
  font-size: 0.875rem;
  color: var(--text-heading);
  overflow: hidden;
  text-overflow: ellipsis;
`;

const Author = styled.div`
  font-size: 0.75rem;
  color: var(--text);
  overflow: hidden;
  text-overflow: ellipsis;
  align-self: flex-start;
`;

const ActionMenuButton = styled(IconButton)`
  position: absolute;
  right: 4px;
  top: 4px;
  z-index: 1;
  width: 40px;
  height: 40px;
  border: none;
  border-radius: 50%;
  background-color: var(--overlay-strong);
  color: white;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;

  &:hover {
    background-color: var(--overlay-strong);
  }

  &.Mui-focusVisible {
    outline: 2px solid var(--accent);
    outline-offset: 2px;
  }
`;

const ExtractingOverlay = styled.div`
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 0.5rem;
  background-color: var(--overlay-strong);
  color: white;
  font-size: 0.75rem;
`;

//#endregion

interface BookCardProps {
  /** Book metadata to display */
  book: BookMeta;
  /** Called when the book is clicked */
  onClick: (book: BookMeta) => void;
  /** Called when remove button is clicked */
  onRemove: (book: BookMeta) => void;
  /** Called when clear-cache button is clicked */
  onClearCache: (book: BookMeta) => void;
  /** Called when the user requests a different library path */
  onMove?: (book: BookMeta) => void;
  /** Whether the book is currently being extracted into the cache */
  isExtracting?: boolean;
  /** Current Drive/cache pipeline status */
  status?: string;
}

/**
 * BookCard component displays a book in the library grid.
 * Shows cover image, title, author, and a remove button on hover.
 */
function BookCard({
  book,
  onClick,
  onRemove,
  onClearCache,
  onMove,
  isExtracting = false,
  status,
}: BookCardProps) {
  const menuId = useId();
  const [menuAnchor, setMenuAnchor] = useState<HTMLElement | null>(null);
  const closeMenu = () => setMenuAnchor(null);

  return (
    <Card>
      <OpenButton
        type="button"
        onClick={() => onClick(book)}
        disabled={isExtracting}
        aria-busy={isExtracting}
      >
        <CoverWrapper>
          {book.coverUrl ? (
            <Cover src={book.coverUrl} alt={book.title} />
          ) : (
            <PlaceholderCover>
              {book.title.charAt(0).toUpperCase()}
            </PlaceholderCover>
          )}
          {(isExtracting || status) && (
            <ExtractingOverlay>
              {isExtracting && (
                <CircularProgress
                  size={28}
                  color="inherit"
                  aria-hidden="true"
                />
              )}
              <span>{status ?? "Extracting..."}</span>
            </ExtractingOverlay>
          )}
        </CoverWrapper>
        <Title title={book.title}>{book.title}</Title>
        {book.author && <Author title={book.author}>{book.author}</Author>}
      </OpenButton>
      <Tooltip title={`Actions for ${book.title}`}>
        <ActionMenuButton
          aria-label={`Actions for ${book.title}`}
          aria-controls={menuAnchor ? menuId : undefined}
          aria-haspopup="true"
          aria-expanded={menuAnchor ? "true" : undefined}
          onClick={(event) => setMenuAnchor(event.currentTarget)}
        >
          <MoreVertIcon />
        </ActionMenuButton>
      </Tooltip>
      <Menu
        id={menuId}
        anchorEl={menuAnchor}
        open={Boolean(menuAnchor)}
        onClose={closeMenu}
        anchorOrigin={{ vertical: "bottom", horizontal: "right" }}
        transformOrigin={{ vertical: "top", horizontal: "right" }}
      >
        {onMove && (
          <MenuItem
            onClick={() => {
              closeMenu();
              onMove(book);
            }}
          >
            <ListItemIcon>
              <DriveFileMoveIcon />
            </ListItemIcon>
            Move to folder
          </MenuItem>
        )}
        <MenuItem
          onClick={() => {
            closeMenu();
            onClearCache(book);
          }}
        >
          <ListItemIcon>
            <ClearAllIcon />
          </ListItemIcon>
          Clear extraction cache
        </MenuItem>
        <MenuItem
          onClick={() => {
            closeMenu();
            onRemove(book);
          }}
        >
          <ListItemIcon>
            <RemoveCircleIcon color="error" />
          </ListItemIcon>
          Remove from library
        </MenuItem>
      </Menu>
    </Card>
  );
}

export default BookCard;
