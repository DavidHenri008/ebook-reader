import styled from "@emotion/styled";
import type { BookMeta } from "../types";

//#region Styled Components
const Card = styled.div`
  position: relative;
  display: flex;
  flex-direction: column;
  width: 140px;
  cursor: pointer;
  transition: transform 0.2s;

  &:hover {
    transform: translateY(-4px);
  }

  &:hover .remove-btn {
    opacity: 1;
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

const RemoveButton = styled.button`
  position: absolute;
  top: 4px;
  right: 4px;
  width: 24px;
  height: 24px;
  border: none;
  border-radius: 50%;
  background-color: rgba(0, 0, 0, 0.6);
  color: white;
  font-size: 14px;
  cursor: pointer;
  opacity: 0;
  transition: opacity 0.2s;
  display: flex;
  align-items: center;
  justify-content: center;

  &:hover {
    background-color: rgba(220, 38, 38, 0.9);
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
}

/**
 * BookCard component displays a book in the library grid.
 * Shows cover image, title, author, and a remove button on hover.
 */
function BookCard({ book, onClick, onRemove }: BookCardProps) {
  const handleRemove = (e: React.MouseEvent) => {
    e.stopPropagation();
    onRemove(book);
  };

  return (
    <Card onDoubleClick={() => onClick(book)}>
      <CoverWrapper>
        {book.coverUrl ? (
          <Cover src={book.coverUrl} alt={book.title} />
        ) : (
          <PlaceholderCover>
            {book.title.charAt(0).toUpperCase()}
          </PlaceholderCover>
        )}
        <RemoveButton
          className="remove-btn"
          onClick={handleRemove}
          title="Remove from library"
        >
          X
        </RemoveButton>
      </CoverWrapper>
      <Title title={book.title}>{book.title}</Title>
      {book.author && <Author title={book.author}>{book.author}</Author>}
    </Card>
  );
}

export default BookCard;
