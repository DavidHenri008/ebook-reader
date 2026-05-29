import styled from "@emotion/styled";
import type { BookMeta } from "../types";

//#region Styled Components
const Card = styled.div`
  position: relative;
  width: 140px;

  &:hover .action-btn,
  &:focus-within .action-btn {
    opacity: 1;
  }
`;

const OpenButton = styled.button`
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
  font-weight: 500;
  color: var(--text-heading);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
`;

const Author = styled.div`
  font-size: 0.75rem;
  color: var(--text);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
`;

const ActionOverlay = styled.div`
  position: absolute;
  top: 0;
  left: 0;
  width: 140px;
  height: 200px;
  pointer-events: none;
`;

const ActionButton = styled.button`
  position: absolute;
  right: 4px;
  width: 24px;
  height: 24px;
  border: none;
  border-radius: 50%;
  background-color: var(--overlay-strong);
  color: white;
  font-size: 14px;
  cursor: pointer;
  opacity: 0;
  pointer-events: auto;
  transition: opacity 0.2s;
  display: flex;
  align-items: center;
  justify-content: center;

  &:focus-visible {
    opacity: 1;
    outline: 2px solid var(--accent);
    outline-offset: 2px;
  }
`;

const RemoveButton = styled(ActionButton)`
  top: 4px;

  &:hover {
    background-color: var(--danger);
  }
`;

const ClearCacheButton = styled(ActionButton)`
  bottom: 4px;

  &:hover {
    background-color: var(--info);
  }
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
}

/**
 * BookCard component displays a book in the library grid.
 * Shows cover image, title, author, and a remove button on hover.
 */
function BookCard({ book, onClick, onRemove, onClearCache }: BookCardProps) {
  const handleRemove = (e: React.MouseEvent) => {
    e.stopPropagation();
    onRemove(book);
  };

  const handleClearCache = (e: React.MouseEvent) => {
    e.stopPropagation();
    onClearCache(book);
  };

  return (
    <Card>
      <OpenButton type="button" onClick={() => onClick(book)}>
        <CoverWrapper>
          {book.coverUrl ? (
            <Cover src={book.coverUrl} alt={book.title} />
          ) : (
            <PlaceholderCover>
              {book.title.charAt(0).toUpperCase()}
            </PlaceholderCover>
          )}
        </CoverWrapper>
        <Title title={book.title}>{book.title}</Title>
        {book.author && <Author title={book.author}>{book.author}</Author>}
      </OpenButton>
      <ActionOverlay>
        <RemoveButton
          type="button"
          className="action-btn"
          onClick={handleRemove}
          aria-label={`Remove ${book.title} from library`}
          title="Remove from library"
        >
          X
        </RemoveButton>
        <ClearCacheButton
          type="button"
          className="action-btn"
          onClick={handleClearCache}
          aria-label={`Clear extraction cache for ${book.title}`}
          title="Clear extraction cache"
        >
          ↺
        </ClearCacheButton>
      </ActionOverlay>
    </Card>
  );
}

export default BookCard;
