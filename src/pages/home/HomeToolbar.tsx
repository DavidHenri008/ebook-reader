import { useState } from "react";
import styled from "@emotion/styled";
import AddIcon from "@mui/icons-material/Add";
import CreateNewFolderIcon from "@mui/icons-material/CreateNewFolder";
import DarkModeIcon from "@mui/icons-material/DarkMode";
import DeleteSweepIcon from "@mui/icons-material/DeleteSweep";
import DriveFolderUploadIcon from "@mui/icons-material/DriveFolderUpload";
import LightModeIcon from "@mui/icons-material/LightMode";
import RefreshIcon from "@mui/icons-material/Refresh";
import SettingsIcon from "@mui/icons-material/Settings";
import ListItemIcon from "@mui/material/ListItemIcon";
import Menu from "@mui/material/Menu";
import MenuItem from "@mui/material/MenuItem";
import Tooltip from "@mui/material/Tooltip";
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

const SettingsMenuIcon = styled(ListItemIcon)`
  && {
    color: inherit;
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
  const [settingsAnchor, setSettingsAnchor] = useState<HTMLElement | null>(
    null,
  );

  const closeSettingsMenu = () => setSettingsAnchor(null);

  return (
    <Toolbar>
      <LibraryActions>
        <Button
          type="button"
          $variant="filled"
          startIcon={<AddIcon />}
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
        <Button
          type="button"
          startIcon={<CreateNewFolderIcon />}
          onClick={onCreateFolder}
        >
          Create folder
        </Button>
        <Tooltip
          title={isRefreshing ? "Refreshing library" : "Refresh library"}
        >
          <span>
            <IconButton
              type="button"
              aria-label={
                isRefreshing ? "Refreshing library" : "Refresh library"
              }
              onClick={onRefresh}
              disabled={isRefreshing}
            >
              <RefreshIcon />
            </IconButton>
          </span>
        </Tooltip>
        <Tooltip title="Library settings">
          <IconButton
            aria-label="Library settings"
            aria-controls={settingsAnchor ? "library-settings-menu" : undefined}
            aria-haspopup="true"
            aria-expanded={settingsAnchor ? "true" : undefined}
            onClick={(event) => setSettingsAnchor(event.currentTarget)}
          >
            <SettingsIcon />
          </IconButton>
        </Tooltip>
        <Menu
          id="library-settings-menu"
          anchorEl={settingsAnchor}
          open={Boolean(settingsAnchor)}
          onClose={closeSettingsMenu}
          anchorOrigin={{ vertical: "bottom", horizontal: "right" }}
          transformOrigin={{ vertical: "top", horizontal: "right" }}
          slotProps={{
            paper: {
              sx: {
                mt: 1,
                minWidth: "14rem",
                border: "1px solid var(--border)",
                bgcolor: "var(--bg)",
                color: "var(--text)",
              },
            },
          }}
        >
          <MenuItem
            onClick={() => {
              closeSettingsMenu();
              onChangeFolder();
            }}
            disabled={isRefreshing}
          >
            <SettingsMenuIcon>
              <DriveFolderUploadIcon />
            </SettingsMenuIcon>
            Change Google Drive folder
          </MenuItem>
          <MenuItem
            onClick={() => {
              closeSettingsMenu();
              onClearCachedBooks();
            }}
            disabled={isClearingCache}
          >
            <SettingsMenuIcon>
              <DeleteSweepIcon />
            </SettingsMenuIcon>
            {isClearingCache ? "Clearing..." : "Clear cached books"}
          </MenuItem>
          <MenuItem
            onClick={() => {
              closeSettingsMenu();
              onToggleTheme();
            }}
          >
            <SettingsMenuIcon>
              {theme === "light" ? <DarkModeIcon /> : <LightModeIcon />}
            </SettingsMenuIcon>
            {theme === "light"
              ? "Switch to dark theme"
              : "Switch to light theme"}
          </MenuItem>
        </Menu>
      </LibraryActions>
    </Toolbar>
  );
}

export default HomeToolbar;
