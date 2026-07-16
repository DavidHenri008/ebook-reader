import { useState, useEffect, useCallback, useMemo, useRef } from "react";
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

const TitleContainer = styled.div`
  display: flex;
  align-items: flex-end;
  gap: 12px;
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

const LibraryActions = styled(HeaderActions)`
  width: 100%;
  justify-content: flex-start;
`;

const SettingsMenu = styled.details`
  position: relative;
  margin-left: auto;
`;

const SettingsSummary = styled.summary`
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 2.5rem;
  height: 2.5rem;
  border: 1px solid var(--border);
  border-radius: 4px;
  background-color: var(--bg);
  color: var(--text);
  cursor: pointer;
  font-size: 1.25rem;
  list-style: none;

  &::-webkit-details-marker {
    display: none;
  }

  &:hover {
    border-color: var(--accent-border);
    color: var(--accent);
  }

  &:focus-visible {
    outline: 2px solid var(--accent);
    outline-offset: 2px;
  }
`;

const SettingsPanel = styled.div`
  position: absolute;
  z-index: 10;
  top: calc(100% + 0.5rem);
  right: 0;
  display: grid;
  min-width: 14rem;
  padding: 0.35rem;
  border: 1px solid var(--border);
  border-radius: 4px;
  background: var(--bg);
  box-shadow: 0 0.5rem 1.5rem rgb(0 0 0 / 18%);
`;

const SettingsItem = styled.button`
  width: 100%;
  padding: 0.65rem 0.75rem;
  border: 0;
  border-radius: 3px;
  background: transparent;
  color: var(--text);
  cursor: pointer;
  font: inherit;
  text-align: left;

  &:hover:not(:disabled),
  &:focus-visible {
    background: var(--accent-bg);
    color: var(--accent);
    outline: none;
  }

  &:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }
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

const FolderNavigation = styled.nav`
  display: grid;
  gap: 0.75rem;
  margin-bottom: 1.5rem;
`;

const Breadcrumb = styled.div`
  display: flex;
  align-items: center;
  gap: 0.4rem;
  min-width: 0;
  color: var(--text);
`;

const BreadcrumbButton = styled.button<{ $current?: boolean }>`
  min-width: 0;
  padding: 0;
  border: 0;
  background: transparent;
  color: ${(props) =>
    props.$current ? "var(--text-heading)" : "var(--accent)"};
  cursor: ${(props) => (props.$current ? "default" : "pointer")};
  font: inherit;
  font-weight: ${(props) => (props.$current ? 600 : 400)};
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;

  &:focus-visible {
    outline: 2px solid var(--accent);
    outline-offset: 2px;
  }
`;

const FolderCard = styled.div`
  position: relative;
  width: 140px;

  &:hover .folder-action,
  &:focus-within .folder-action {
    opacity: 1;
  }
`;

const FolderOpenButton = styled.button`
  display: flex;
  flex-direction: column;
  width: 100%;
  padding: 0;
  border: 0;
  background: none;
  color: inherit;
  cursor: pointer;
  font: inherit;
  text-align: left;
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

const FolderCover = styled.div`
  display: flex;
  align-items: center;
  justify-content: center;
  width: 140px;
  height: 200px;
  border: 1px solid var(--accent-border);
  border-radius: 4px;
  background: var(--accent-bg);
  box-shadow: 0 2px 8px rgb(0 0 0 / 15%);
`;

const FolderShape = styled.div`
  position: relative;
  width: 82px;
  height: 58px;
  border-radius: 4px;
  background: var(--accent);

  &::before {
    position: absolute;
    top: -12px;
    left: 0;
    width: 36px;
    height: 16px;
    border-radius: 4px 4px 0 0;
    background: var(--accent);
    content: "";
  }
`;

const FolderTitle = styled.div`
  width: 100%;
  margin-top: 0.5rem;
  overflow: hidden;
  color: var(--text-heading);
  font-size: 0.875rem;
  font-weight: 500;
  text-overflow: ellipsis;
  white-space: nowrap;
`;

const FolderAction = styled.button`
  position: absolute;
  right: 4px;
  width: 24px;
  height: 24px;
  border: 0;
  border-radius: 50%;
  background: var(--overlay-strong);
  color: white;
  cursor: pointer;
  font-size: 14px;
  opacity: 0;
  transition: opacity 0.2s;

  &:focus-visible {
    opacity: 1;
    outline: 2px solid var(--accent);
    outline-offset: 2px;
  }
`;

const RenameFolderButton = styled(FolderAction)`
  top: 4px;

  &:hover {
    background: var(--info);
  }
`;

const DeleteFolderButton = styled(FolderAction)`
  top: 36px;

  &:hover {
    background: var(--danger);
  }
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

function HomePage() {
  const navigate = useNavigate();
  const settingsMenuRef = useRef<HTMLDetailsElement>(null);
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
  const [activeFolder, setActiveFolder] = useState<string | undefined>();
  const [theme, setTheme] = useAppTheme();
  const { confirm, alert, prompt, select, dialog } = useDialogs();

  const closeSettingsMenu = useCallback(() => {
    if (settingsMenuRef.current) settingsMenuRef.current.open = false;
  }, []);

  useEffect(() => {
    const handlePointerDown = (event: PointerEvent) => {
      const menu = settingsMenuRef.current;
      if (menu?.open && !menu.contains(event.target as Node)) {
        menu.open = false;
      }
    };
    document.addEventListener("pointerdown", handlePointerDown);
    return () => document.removeEventListener("pointerdown", handlePointerDown);
  }, []);

  const applySnapshot = useCallback((snapshot: LibrarySnapshot) => {
    setBooks(snapshot.books);
    setFolders(snapshot.virtualFolders);
    setLibraryInfo(snapshot.info);
    setNeedsFolder(false);
    setActiveFolder((current) =>
      current &&
      !snapshot.virtualFolders.some((folder) => folder.id === current)
        ? undefined
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
    return books.filter((book) => book.virtualFolderId === activeFolder);
  }, [activeFolder, books]);

  const childFolders = useMemo(
    () => folders.filter((folder) => folder.parentId === activeFolder),
    [activeFolder, folders],
  );

  const folderPath = useMemo(() => {
    const byId = new Map(folders.map((folder) => [folder.id, folder]));
    const path: VirtualFolder[] = [];
    const visited = new Set<string>();
    let currentId = activeFolder;
    while (currentId && !visited.has(currentId)) {
      visited.add(currentId);
      const folder = byId.get(currentId);
      if (!folder) break;
      path.unshift(folder);
      currentId = folder.parentId;
    }
    return path;
  }, [activeFolder, folders]);

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
        "Do you want to choose a different Google Drive library folder?",
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
          await addBookToLibrary(
            file,
            (message, loaded, total) => {
              setProgressMessage(formatProgress(message, loaded, total));
            },
            activeFolder,
          );
        }
        applySnapshot(await getLibrarySnapshot());
      } catch (error) {
        setErrorMessage(getStorageErrorMessage(error));
      } finally {
        setProgressMessage(null);
        setIsAdding(false);
      }
    },
    [activeFolder, applySnapshot],
  );

  const handleAddFromDrive = useCallback(async () => {
    setIsAdding(true);
    setErrorMessage(null);
    try {
      await addBooksFromDrivePicker((message, loaded, total) => {
        setProgressMessage(formatProgress(message, loaded, total));
      }, activeFolder);
      applySnapshot(await getLibrarySnapshot());
    } catch (error) {
      setErrorMessage(getStorageErrorMessage(error));
    } finally {
      setProgressMessage(null);
      setIsAdding(false);
    }
  }, [activeFolder, applySnapshot]);

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
        "Clear all cached extracted books? Books stay in your Google Drive library, but they will download and re-extract on next open.",
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
    const name = await prompt("New folder name", {
      confirmLabel: "Create folder",
      inputLabel: "Folder name",
    });
    if (name === null) return;
    try {
      await createLibraryFolder(name, activeFolder);
      applySnapshot(await getLibrarySnapshot());
    } catch (error) {
      setErrorMessage(getStorageErrorMessage(error));
    }
  }, [activeFolder, applySnapshot, prompt]);

  const handleRenameFolder = useCallback(
    async (folder: VirtualFolder) => {
      const nextName = await prompt("Rename folder", {
        confirmLabel: "Rename",
        defaultValue: folder.name,
        inputLabel: "Folder name",
      });
      if (nextName === null || nextName.trim() === folder.name) return;
      try {
        await renameLibraryFolder(folder.id, nextName);
        applySnapshot(await getLibrarySnapshot());
      } catch (error) {
        setErrorMessage(getStorageErrorMessage(error));
      }
    },
    [applySnapshot, prompt],
  );

  const handleDeleteFolder = useCallback(
    async (folder: VirtualFolder) => {
      if (
        !(await confirm(
          `Delete the app folder "${folder.name}"? Books stay in your library and Google Drive files are not moved or deleted.`,
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

  const handleMoveBook = useCallback(
    async (book: BookMeta) => {
      const folderId = await select(`Move "${book.title}"`, {
        confirmLabel: "Move",
        inputLabel: "Destination folder",
        defaultValue: book.virtualFolderId ?? "",
        options: [
          { label: "Library", value: "" },
          ...folders
            .map((folder) => ({
              label: `Library / ${getFolderPath(folder, folders)}`,
              value: folder.id,
            }))
            .sort((a, b) => a.label.localeCompare(b.label)),
        ],
      });
      if (folderId === null) return;
      const destinationId = folderId || undefined;
      if (destinationId === book.virtualFolderId) return;
      setBooks((prev) =>
        prev.map((candidate) =>
          candidate.id === book.id
            ? { ...candidate, virtualFolderId: destinationId }
            : candidate,
        ),
      );
      try {
        await setBookVirtualFolder(book.id, destinationId);
      } catch (error) {
        setErrorMessage(getStorageErrorMessage(error));
        applySnapshot(await getLibrarySnapshot());
      }
    },
    [applySnapshot, folders, select],
  );

  if (isLoading) {
    return (
      <Container>
        <LoadingText>Loading Google Drive library...</LoadingText>
      </Container>
    );
  }

  if (needsFolder) {
    return (
      <Container>
        <EmptyState>
          <EmptyTitle>Choose a Google Drive library folder</EmptyTitle>
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
            {isRefreshing ? "Opening Picker..." : "Choose Google Drive folder"}
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
        <TitleContainer>
          <Title>Epub Library</Title>
          <SubtleText>
            {libraryInfo?.folderName
              ? `Google Drive folder: ${libraryInfo.folderName}`
              : "Google Drive backed library"}
          </SubtleText>
        </TitleContainer>
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
        <LibraryActions>
          <Button
            type="button"
            $variant="filled"
            onClick={handleAddFromDrive}
            disabled={isAdding}
          >
            Add
          </Button>
          <FilePicker
            onFileSelect={handleFileSelect}
            label="Upload"
            disabled={isAdding}
          />
          <Button type="button" onClick={() => void handleCreateFolder()}>
            Create folder
          </Button>
          <IconButton
            type="button"
            aria-label={isRefreshing ? "Refreshing library" : "Refresh library"}
            title={isRefreshing ? "Refreshing library" : "Refresh library"}
            onClick={handleRefresh}
            disabled={isRefreshing}
          >
            ↻
          </IconButton>
          <SettingsMenu ref={settingsMenuRef}>
            <SettingsSummary
              aria-label="Library settings"
              title="Library settings"
            >
              ⚙
            </SettingsSummary>
            <SettingsPanel role="menu">
              <SettingsItem
                type="button"
                role="menuitem"
                onClick={() => {
                  closeSettingsMenu();
                  void handleChangeFolder();
                }}
                disabled={isRefreshing}
              >
                Change Google Drive folder
              </SettingsItem>
              <SettingsItem
                type="button"
                role="menuitem"
                onClick={() => {
                  closeSettingsMenu();
                  void handleClearCachedBooks();
                }}
                disabled={isClearingCache}
              >
                {isClearingCache ? "Clearing..." : "Clear cached books"}
              </SettingsItem>
              <SettingsItem
                type="button"
                role="menuitem"
                onClick={() => {
                  closeSettingsMenu();
                  toggleTheme();
                }}
              >
                {theme === "light"
                  ? "Switch to dark theme"
                  : "Switch to light theme"}
              </SettingsItem>
            </SettingsPanel>
          </SettingsMenu>
        </LibraryActions>
      </Toolbar>

      <FolderNavigation aria-label="Library folders">
        <Breadcrumb>
          <BreadcrumbButton
            type="button"
            $current={!activeFolder}
            onClick={() => setActiveFolder(undefined)}
            aria-current={!activeFolder ? "page" : undefined}
          >
            Library
          </BreadcrumbButton>
          {folderPath.map((folder, index) => {
            const isCurrent = index === folderPath.length - 1;
            return (
              <div key={folder.id}>
                <span aria-hidden="true">/ </span>
                <BreadcrumbButton
                  type="button"
                  $current={isCurrent}
                  onClick={() => setActiveFolder(folder.id)}
                  aria-current={isCurrent ? "page" : undefined}
                >
                  {folder.name}
                </BreadcrumbButton>
              </div>
            );
          })}
        </Breadcrumb>
      </FolderNavigation>

      {progressMessage && <StatusText>{progressMessage}</StatusText>}
      {errorMessage && <ErrorText>{errorMessage}</ErrorText>}

      {books.length === 0 && childFolders.length === 0 ? (
        <EmptyState>
          <EmptyTitle>Your library is empty</EmptyTitle>
          <EmptyText>
            Upload an EPUB or add one from Google Drive. App folders organize
            this library only; they do not create or move Google Drive folders.
          </EmptyText>
        </EmptyState>
      ) : visibleBooks.length === 0 && childFolders.length === 0 ? (
        <EmptyState>
          <EmptyTitle>No books here</EmptyTitle>
          <EmptyText>
            Add a book here or open one of the folders above.
          </EmptyText>
        </EmptyState>
      ) : (
        <LibraryGrid>
          {childFolders.map((folder) => (
            <FolderCard key={folder.id}>
              <FolderOpenButton
                type="button"
                onClick={() => setActiveFolder(folder.id)}
              >
                <FolderCover aria-hidden="true">
                  <FolderShape />
                </FolderCover>
                <FolderTitle title={folder.name}>{folder.name}</FolderTitle>
              </FolderOpenButton>
              <RenameFolderButton
                type="button"
                className="folder-action"
                onClick={() => void handleRenameFolder(folder)}
                aria-label={`Rename ${folder.name}`}
                title="Rename folder"
              >
                ✎
              </RenameFolderButton>
              <DeleteFolderButton
                type="button"
                className="folder-action"
                onClick={() => void handleDeleteFolder(folder)}
                aria-label={`Delete ${folder.name}`}
                title="Delete folder"
              >
                X
              </DeleteFolderButton>
            </FolderCard>
          ))}
          {visibleBooks.map((book) => (
            <BookCard
              key={book.id}
              book={book}
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

function getFolderPath(
  folder: VirtualFolder,
  folders: VirtualFolder[],
): string {
  const byId = new Map(folders.map((candidate) => [candidate.id, candidate]));
  const names = [folder.name];
  const visited = new Set([folder.id]);
  let parentId = folder.parentId;
  while (parentId && !visited.has(parentId)) {
    visited.add(parentId);
    const parent = byId.get(parentId);
    if (!parent) break;
    names.unshift(parent.name);
    parentId = parent.parentId;
  }
  return names.join(" / ");
}

export default HomePage;
