import { useState, useEffect, useCallback, useMemo } from "react";
import styled from "@emotion/styled";
import { useNavigate } from "@tanstack/react-router";
import { BookCard, FilePicker, Button, IconButton } from "../components";
import { useDialogs } from "../components/ui";
import { useAuth } from "../auth";
import {
  DriveLibraryNotConfiguredError,
  addBookToLibrary,
  addBooksFromDrivePicker,
  chooseLibraryFolder,
  clearAllRawBooks,
  createLibraryFolder,
  deleteLibraryFolder,
  deleteRawBook,
  getLibrarySnapshot,
  getStorageErrorMessage,
  loadLibraryTheme,
  refreshLibrary,
  removeBookFromLibrary,
  renameLibraryFolder,
  reorderLibraryFolder,
  saveLibraryTheme,
  setBookVirtualFolder,
} from "../storage";
import { useAppTheme } from "../styles";
import type {
  BookMeta,
  DriveLibraryInfo,
  LibrarySnapshot,
  VirtualFolder,
} from "../types";

const Container = styled.div`
  min-height: 100vh;
  background-color: var(--bg);
  padding: 2rem;
`;

const Header = styled.header`
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 1rem;
  margin-bottom: 2rem;
`;

const Title = styled.h1`
  margin: 0;
  font-size: 2rem;
  font-weight: 300;
  color: var(--text-heading);
`;

const SubtleText = styled.p`
  margin: 0.25rem 0 0;
  color: var(--text);
`;

const HeaderActions = styled.div`
  display: flex;
  align-items: center;
  justify-content: flex-end;
  flex-wrap: wrap;
  gap: 0.75rem;
`;

const Account = styled.div`
  display: flex;
  align-items: center;
  gap: 0.75rem;
  min-width: 0;
`;

const Avatar = styled.img`
  width: 2.5rem;
  height: 2.5rem;
  border-radius: 50%;
  background: var(--border);
`;

const AccountText = styled.div`
  min-width: 0;
  color: var(--text);
  font-size: 0.875rem;
`;

const AccountName = styled.div`
  color: var(--text-heading);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
`;

const Toolbar = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
  flex-wrap: wrap;
  margin-bottom: 1.5rem;
`;

const FolderBar = styled.div`
  display: flex;
  align-items: center;
  gap: 0.5rem;
  flex-wrap: wrap;
`;

const FolderButton = styled.button<{ $active?: boolean }>`
  border: 1px solid
    ${(props) => (props.$active ? "var(--accent-border)" : "var(--border)")};
  border-radius: 4px;
  background: ${(props) => (props.$active ? "var(--accent-bg)" : "var(--bg)")};
  color: ${(props) => (props.$active ? "var(--accent)" : "var(--text)")};
  padding: 0.4rem 0.65rem;
  cursor: pointer;
`;

const FolderTools = styled.div`
  display: flex;
  align-items: center;
  gap: 0.5rem;
  flex-wrap: wrap;
`;

const TextInput = styled.input`
  height: 2.5rem;
  border: 1px solid var(--border);
  border-radius: 4px;
  background: var(--bg);
  color: var(--text);
  padding: 0 0.75rem;
  font: inherit;
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

const StatusText = styled.div`
  margin-bottom: 1rem;
  color: var(--text);
`;

const ErrorText = styled.div`
  margin-bottom: 1rem;
  color: var(--danger);
`;

type ActiveFolder = "all" | "root" | string;

function HomePage() {
  const navigate = useNavigate();
  const { user, signOut } = useAuth();
  const [books, setBooks] = useState<BookMeta[]>([]);
  const [folders, setFolders] = useState<VirtualFolder[]>([]);
  const [libraryInfo, setLibraryInfo] = useState<DriveLibraryInfo | null>(null);
  const [needsFolder, setNeedsFolder] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isAdding, setIsAdding] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isClearingCache, setIsClearingCache] = useState(false);
  const [progressMessage, setProgressMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [newFolderName, setNewFolderName] = useState("");
  const [activeFolder, setActiveFolder] = useState<ActiveFolder>("all");
  const [theme, setTheme] = useAppTheme();
  const { confirm, alert, dialog } = useDialogs();

  const applySnapshot = useCallback((snapshot: LibrarySnapshot) => {
    setBooks(snapshot.books);
    setFolders(snapshot.virtualFolders);
    setLibraryInfo(snapshot.info);
    setNeedsFolder(false);
    setActiveFolder((current) =>
      current !== "all" &&
      current !== "root" &&
      !snapshot.virtualFolders.some((folder) => folder.id === current)
        ? "all"
        : current,
    );
  }, []);

  const loadLibrary = useCallback(async () => {
    setIsLoading(true);
    setErrorMessage(null);
    try {
      const snapshot = await getLibrarySnapshot();
      applySnapshot(snapshot);
      const driveTheme = await loadLibraryTheme();
      setTheme(driveTheme);
    } catch (error) {
      if (error instanceof DriveLibraryNotConfiguredError) {
        setNeedsFolder(true);
      } else {
        setErrorMessage(getStorageErrorMessage(error));
      }
    } finally {
      setIsLoading(false);
    }
  }, [applySnapshot, setTheme]);

  useEffect(() => {
    void loadLibrary();
  }, [loadLibrary]);

  const visibleBooks = useMemo(() => {
    if (activeFolder === "all") return books;
    if (activeFolder === "root") {
      return books.filter((book) => !book.virtualFolderId);
    }
    return books.filter((book) => book.virtualFolderId === activeFolder);
  }, [activeFolder, books]);

  const toggleTheme = useCallback(() => {
    const nextTheme = theme === "light" ? "dark" : "light";
    setTheme(nextTheme);
    void saveLibraryTheme(nextTheme).catch((error) => {
      setErrorMessage(getStorageErrorMessage(error));
    });
  }, [setTheme, theme]);

  const handleChooseFolder = useCallback(async () => {
    setIsRefreshing(true);
    setErrorMessage(null);
    try {
      applySnapshot(await chooseLibraryFolder());
    } catch (error) {
      setErrorMessage(getStorageErrorMessage(error));
    } finally {
      setIsRefreshing(false);
    }
  }, [applySnapshot]);

  const handleChangeFolder = useCallback(async () => {
    if (
      !(await confirm(
        "Choose a different Drive library folder? This switches the manifest the app reads; it does not move or delete Drive files.",
      ))
    ) {
      return;
    }
    await handleChooseFolder();
  }, [confirm, handleChooseFolder]);

  const handleRefresh = useCallback(async () => {
    setIsRefreshing(true);
    setErrorMessage(null);
    try {
      applySnapshot(await refreshLibrary());
      const driveTheme = await loadLibraryTheme();
      setTheme(driveTheme);
    } catch (error) {
      setErrorMessage(getStorageErrorMessage(error));
    } finally {
      setIsRefreshing(false);
    }
  }, [applySnapshot, setTheme]);

  const handleFileSelect = useCallback(
    async (files: File[]) => {
      setIsAdding(true);
      setErrorMessage(null);
      try {
        for (const file of files) {
          await addBookToLibrary(file, (message, loaded, total) => {
            setProgressMessage(formatProgress(message, loaded, total));
          });
        }
        applySnapshot(await getLibrarySnapshot());
      } catch (error) {
        setErrorMessage(getStorageErrorMessage(error));
      } finally {
        setProgressMessage(null);
        setIsAdding(false);
      }
    },
    [applySnapshot],
  );

  const handleAddFromDrive = useCallback(async () => {
    setIsAdding(true);
    setErrorMessage(null);
    try {
      await addBooksFromDrivePicker((message, loaded, total) => {
        setProgressMessage(formatProgress(message, loaded, total));
      });
      applySnapshot(await getLibrarySnapshot());
    } catch (error) {
      setErrorMessage(getStorageErrorMessage(error));
    } finally {
      setProgressMessage(null);
      setIsAdding(false);
    }
  }, [applySnapshot]);

  const handleBookClick = useCallback(
    (book: BookMeta) => {
      navigate({
        to: "/reader/$bookId",
        params: { bookId: book.id },
        state: { bookId: book.id, bookTitle: book.title, theme },
      });
    },
    [navigate, theme],
  );

  const handleRemoveBook = useCallback(
    async (book: BookMeta) => {
      if (
        await confirm(
          `Remove "${book.title}" from your library? The EPUB file stays in your Google Drive.`,
          { confirmLabel: "Remove" },
        )
      ) {
        await removeBookFromLibrary(book.id);
        setBooks((prev) =>
          prev.filter((candidate) => candidate.id !== book.id),
        );
      }
    },
    [confirm],
  );

  const handleClearCache = useCallback(
    async (book: BookMeta) => {
      if (
        await confirm(
          `Clear the extraction cache for "${book.title}"? It will be downloaded and re-extracted on next open.`,
        )
      ) {
        await deleteRawBook(book.id);
      }
    },
    [confirm],
  );

  const handleClearCachedBooks = useCallback(async () => {
    if (
      !(await confirm(
        "Clear all cached extracted books? Books stay in your Drive library, but they will download and re-extract on next open.",
      ))
    ) {
      return;
    }

    setIsClearingCache(true);
    try {
      await clearAllRawBooks();
    } catch (error) {
      await alert(getStorageErrorMessage(error));
    } finally {
      setIsClearingCache(false);
    }
  }, [confirm, alert]);

  const handleCreateFolder = useCallback(async () => {
    try {
      await createLibraryFolder(newFolderName);
      setNewFolderName("");
      applySnapshot(await getLibrarySnapshot());
    } catch (error) {
      setErrorMessage(getStorageErrorMessage(error));
    }
  }, [applySnapshot, newFolderName]);

  const handleRenameFolder = useCallback(
    async (folder: VirtualFolder) => {
      const nextName = window.prompt("Rename app folder", folder.name);
      if (nextName === null || nextName.trim() === folder.name) return;
      try {
        await renameLibraryFolder(folder.id, nextName);
        applySnapshot(await getLibrarySnapshot());
      } catch (error) {
        setErrorMessage(getStorageErrorMessage(error));
      }
    },
    [applySnapshot],
  );

  const handleDeleteFolder = useCallback(
    async (folder: VirtualFolder) => {
      if (
        !(await confirm(
          `Delete the app folder "${folder.name}"? Books stay in your library and Drive files are not moved or deleted.`,
          { confirmLabel: "Delete folder" },
        ))
      ) {
        return;
      }
      try {
        await deleteLibraryFolder(folder.id);
        applySnapshot(await getLibrarySnapshot());
      } catch (error) {
        setErrorMessage(getStorageErrorMessage(error));
      }
    },
    [applySnapshot, confirm],
  );

  const handleReorderFolder = useCallback(
    async (folderId: string, direction: "up" | "down") => {
      try {
        await reorderLibraryFolder(folderId, direction);
        applySnapshot(await getLibrarySnapshot());
      } catch (error) {
        setErrorMessage(getStorageErrorMessage(error));
      }
    },
    [applySnapshot],
  );

  const handleMoveBook = useCallback(
    async (book: BookMeta, folderId: string | undefined) => {
      setBooks((prev) =>
        prev.map((candidate) =>
          candidate.id === book.id
            ? { ...candidate, virtualFolderId: folderId }
            : candidate,
        ),
      );
      try {
        await setBookVirtualFolder(book.id, folderId);
      } catch (error) {
        setErrorMessage(getStorageErrorMessage(error));
        applySnapshot(await getLibrarySnapshot());
      }
    },
    [applySnapshot],
  );

  if (isLoading) {
    return (
      <Container>
        <LoadingText>Loading Drive library...</LoadingText>
      </Container>
    );
  }

  if (needsFolder) {
    return (
      <Container>
        <EmptyState>
          <EmptyTitle>Choose a Drive library folder</EmptyTitle>
          <EmptyText>
            The app will create an app-data folder for library.json and
            settings.json. Your EPUB files stay in Google Drive.
          </EmptyText>
          <Button
            type="button"
            $variant="filled"
            onClick={handleChooseFolder}
            disabled={isRefreshing}
          >
            {isRefreshing ? "Opening Picker..." : "Choose Drive folder"}
          </Button>
          {errorMessage && <ErrorText>{errorMessage}</ErrorText>}
        </EmptyState>
        {dialog}
      </Container>
    );
  }

  return (
    <Container>
      <Header>
        <div>
          <Title>My Library</Title>
          <SubtleText>
            {libraryInfo?.folderName
              ? `Drive folder: ${libraryInfo.folderName}`
              : "Drive-backed library"}
          </SubtleText>
        </div>
        <HeaderActions>
          {user && (
            <Account>
              {user.picture && <Avatar src={user.picture} alt="" />}
              <AccountText>
                <AccountName>{user.name}</AccountName>
                <div>{user.email}</div>
              </AccountText>
            </Account>
          )}
          <Button type="button" onClick={() => void signOut()}>
            Sign out
          </Button>
        </HeaderActions>
      </Header>

      <Toolbar>
        <HeaderActions>
          <Button type="button" onClick={handleRefresh} disabled={isRefreshing}>
            {isRefreshing ? "Refreshing..." : "Refresh"}
          </Button>
          <Button
            type="button"
            onClick={handleChangeFolder}
            disabled={isRefreshing}
          >
            Change Drive folder
          </Button>
          <Button
            type="button"
            onClick={handleClearCachedBooks}
            disabled={isClearingCache}
          >
            {isClearingCache ? "Clearing..." : "Clear cached books"}
          </Button>
          <IconButton
            aria-label="Toggle theme"
            title={
              theme === "light" ? "Switch to dark mode" : "Switch to light mode"
            }
            onClick={toggleTheme}
          >
            {theme === "light" ? "☾" : "☀"}
          </IconButton>
          <Button
            type="button"
            $variant="filled"
            onClick={handleAddFromDrive}
            disabled={isAdding}
          >
            Add from Drive
          </Button>
          <FilePicker
            onFileSelect={handleFileSelect}
            label="Upload"
            disabled={isAdding}
          />
        </HeaderActions>
      </Toolbar>

      <Toolbar>
        <FolderBar aria-label="Library views">
          <FolderButton
            type="button"
            $active={activeFolder === "all"}
            onClick={() => setActiveFolder("all")}
          >
            All
          </FolderButton>
          <FolderButton
            type="button"
            $active={activeFolder === "root"}
            onClick={() => setActiveFolder("root")}
          >
            Library root
          </FolderButton>
          {folders.map((folder, index) => (
            <FolderTools key={folder.id}>
              <FolderButton
                type="button"
                $active={activeFolder === folder.id}
                onClick={() => setActiveFolder(folder.id)}
              >
                {folder.name}
              </FolderButton>
              <Button
                type="button"
                onClick={() => void handleReorderFolder(folder.id, "up")}
                disabled={index === 0}
              >
                ↑
              </Button>
              <Button
                type="button"
                onClick={() => void handleReorderFolder(folder.id, "down")}
                disabled={index === folders.length - 1}
              >
                ↓
              </Button>
              <Button
                type="button"
                onClick={() => void handleRenameFolder(folder)}
              >
                Rename
              </Button>
              <Button
                type="button"
                onClick={() => void handleDeleteFolder(folder)}
              >
                Delete
              </Button>
            </FolderTools>
          ))}
        </FolderBar>
        <FolderTools>
          <TextInput
            aria-label="New app folder name"
            value={newFolderName}
            onChange={(event) => setNewFolderName(event.target.value)}
            placeholder="New app folder"
          />
          <Button
            type="button"
            onClick={handleCreateFolder}
            disabled={!newFolderName.trim()}
          >
            Create folder
          </Button>
        </FolderTools>
      </Toolbar>

      {progressMessage && <StatusText>{progressMessage}</StatusText>}
      {errorMessage && <ErrorText>{errorMessage}</ErrorText>}

      {books.length === 0 ? (
        <EmptyState>
          <EmptyTitle>Your library is empty</EmptyTitle>
          <EmptyText>
            Upload an EPUB or add one from Drive. App folders organize this
            library only; they do not create or move Drive folders.
          </EmptyText>
        </EmptyState>
      ) : visibleBooks.length === 0 ? (
        <EmptyState>
          <EmptyTitle>No books here</EmptyTitle>
          <EmptyText>
            Move books into this app folder from the book controls.
          </EmptyText>
        </EmptyState>
      ) : (
        <LibraryGrid>
          {visibleBooks.map((book) => (
            <BookCard
              key={book.id}
              book={book}
              folders={folders}
              onClick={handleBookClick}
              onRemove={handleRemoveBook}
              onClearCache={handleClearCache}
              onMove={handleMoveBook}
              status={isAdding ? "In library" : undefined}
            />
          ))}
        </LibraryGrid>
      )}
      {dialog}
    </Container>
  );
}

function formatProgress(
  message: string,
  loaded: number | undefined,
  total: number | undefined,
): string {
  if (!total || loaded === undefined) return message;
  return `${message} ${Math.round((loaded / total) * 100)}%`;
}

export default HomePage;
