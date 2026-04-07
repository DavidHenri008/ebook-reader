import { useState, useEffect, useCallback } from "react";
import styled from "@emotion/styled";
import { useNavigate } from "react-router-dom";
import { BookCard, FilePicker } from "../components";
import {
  getAllBooks,
  addBookToLibrary,
  removeBookFromLibrary,
  getBookFile,
} from "../storage";
import type { BookMeta } from "../types";

//#region Styled Components
const Container = styled.div`
  min-height: 100vh;
  background-color: var(--bg);
  padding: 2rem;
`;

const Header = styled.header`
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 2rem;
`;

const Title = styled.h1`
  margin: 0;
  font-size: 2rem;
  font-weight: 300;
  color: var(--text-heading);
`;

const LibraryGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(140px, 1fr));
  gap: 1.5rem;
  justify-items: center;
`;

const EmptyState = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 4rem 2rem;
  text-align: center;
`;

const EmptyTitle = styled.h2`
  margin: 0 0 0.5rem;
  font-size: 1.5rem;
  font-weight: 400;
  color: var(--text-heading);
`;

const EmptyText = styled.p`
  margin: 0 0 1.5rem;
  font-size: 1rem;
  color: var(--text);
`;

const LoadingText = styled.div`
  text-align: center;
  padding: 4rem;
  color: var(--text);
`;
//#endregion

function HomePage() {
  const navigate = useNavigate();
  const [books, setBooks] = useState<BookMeta[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isAdding, setIsAdding] = useState(false);

  const sortByTitle = useCallback(
    (list: BookMeta[]) =>
      [...list].sort((a, b) => a.title.localeCompare(b.title)),
    [],
  );

  const loadLibrary = useCallback(async () => {
    setIsLoading(true);
    const allBooks = await getAllBooks();
    setBooks(sortByTitle(allBooks));
    setIsLoading(false);
  }, [sortByTitle]);

  // Load library on mount
  useEffect(() => {
    loadLibrary();
  }, [loadLibrary]);

  const handleFileSelect = useCallback(
    async (files: File[]) => {
      setIsAdding(true);
      try {
        const results = await Promise.all(
          files.map((file) => addBookToLibrary(file)),
        );
        setBooks((prev) => {
          const existingIds = new Set(prev.map((b) => b.id));
          const toAdd = results.filter((b) => !existingIds.has(b.id));
          return toAdd.length > 0 ? sortByTitle([...prev, ...toAdd]) : prev;
        });
      } finally {
        setIsAdding(false);
      }
    },
    [sortByTitle],
  );

  const handleBookClick = useCallback(
    async (book: BookMeta) => {
      const file = await getBookFile(book.id);
      if (file) {
        navigate("/reader", { state: { file, bookId: book.id } });
      }
    },
    [navigate],
  );

  const handleRemoveBook = useCallback(async (book: BookMeta) => {
    if (confirm(`Remove "${book.title}" from your library?`)) {
      await removeBookFromLibrary(book.id);
      setBooks((prev) => prev.filter((b) => b.id !== book.id));
    }
  }, []);

  if (isLoading) {
    return (
      <Container>
        <LoadingText>Loading library...</LoadingText>
      </Container>
    );
  }

  return (
    <Container>
      <Header>
        <Title>My Library</Title>
        <FilePicker
          onFileSelect={handleFileSelect}
          label="+ Add Book"
          disabled={isAdding}
        />
      </Header>

      {books.length === 0 ? (
        <EmptyState>
          <EmptyTitle>Your library is empty</EmptyTitle>
          <EmptyText>Add your first EPUB book to get started</EmptyText>
        </EmptyState>
      ) : (
        <LibraryGrid>
          {books.map((book) => (
            <BookCard
              key={book.id}
              book={book}
              onClick={handleBookClick}
              onRemove={handleRemoveBook}
            />
          ))}
        </LibraryGrid>
      )}
    </Container>
  );
}

export default HomePage;
