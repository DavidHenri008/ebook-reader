import { useCallback, useEffect, useRef } from "react";
import styled from "@emotion/styled";
import { Button, FilePicker, IconButton } from "../../components";

const Toolbar = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
  flex-wrap: wrap;
  margin-bottom: 1.5rem;
`;

const LibraryActions = styled.div`
  display: flex;
  align-items: center;
  justify-content: flex-start;
  flex-wrap: wrap;
  gap: 0.75rem;
  width: 100%;
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

interface HomeToolbarProps {
  isAdding: boolean;
  isRefreshing: boolean;
  isClearingCache: boolean;
  theme: "light" | "dark";
  onAddFromDrive: () => void;
  onFileSelect: (files: File[]) => void;
  onCreateFolder: () => void;
  onRefresh: () => void;
  onChangeFolder: () => void;
  onClearCachedBooks: () => void;
  onToggleTheme: () => void;
}

function HomeToolbar({
  isAdding,
  isRefreshing,
  isClearingCache,
  theme,
  onAddFromDrive,
  onFileSelect,
  onCreateFolder,
  onRefresh,
  onChangeFolder,
  onClearCachedBooks,
  onToggleTheme,
}: HomeToolbarProps) {
  const settingsMenuRef = useRef<HTMLDetailsElement>(null);

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

  return (
    <Toolbar>
      <LibraryActions>
        <Button
          type="button"
          $variant="filled"
          onClick={onAddFromDrive}
          disabled={isAdding}
        >
          Add
        </Button>
        <FilePicker
          onFileSelect={onFileSelect}
          label="Upload"
          disabled={isAdding}
        />
        <Button type="button" onClick={onCreateFolder}>
          Create folder
        </Button>
        <IconButton
          type="button"
          aria-label={isRefreshing ? "Refreshing library" : "Refresh library"}
          title={isRefreshing ? "Refreshing library" : "Refresh library"}
          onClick={onRefresh}
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
                onChangeFolder();
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
                onClearCachedBooks();
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
                onToggleTheme();
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
  );
}

export default HomeToolbar;
