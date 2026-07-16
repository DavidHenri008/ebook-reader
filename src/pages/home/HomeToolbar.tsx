import { useState } from "react";
import styled from "@emotion/styled";
import AddIcon from "@mui/icons-material/Add";
import CreateNewFolderIcon from "@mui/icons-material/CreateNewFolder";
import DarkModeIcon from "@mui/icons-material/DarkMode";
import DeleteSweepIcon from "@mui/icons-material/DeleteSweep";
import DriveFolderUploadIcon from "@mui/icons-material/DriveFolderUpload";
import LightModeIcon from "@mui/icons-material/LightMode";
import RefreshIcon from "@mui/icons-material/Refresh";
import SearchIcon from "@mui/icons-material/Search";
import SettingsIcon from "@mui/icons-material/Settings";
import SortByAlphaIcon from "@mui/icons-material/SortByAlpha";
import InputAdornment from "@mui/material/InputAdornment";
import ListItemIcon from "@mui/material/ListItemIcon";
import Menu from "@mui/material/Menu";
import MenuItem from "@mui/material/MenuItem";
import TextField from "@mui/material/TextField";
import Tooltip from "@mui/material/Tooltip";
import { Button, FilePicker, IconButton } from "../../components";

const Toolbar = styled.div`
  display: flex;
  align-items: center;
  gap: 0.75rem;
  margin-bottom: 1rem;
  width: 100%;
  padding-bottom: 2px;
`;

interface HomeToolbarProps {
  isAdding: boolean;
  isRefreshing: boolean;
  isClearingCache: boolean;
  theme: "light" | "dark";
  searchQuery: string;
  sortDirection: "asc" | "desc";
  onAddFromDrive: () => void;
  onFileSelect: (files: File[]) => void;
  onCreateFolder: () => void;
  onRefresh: () => void;
  onChangeFolder: () => void;
  onClearCachedBooks: () => void;
  onToggleTheme: () => void;
  onSearchQueryChange: (query: string) => void;
  onToggleSortDirection: () => void;
}

function HomeToolbar({
  isAdding,
  isRefreshing,
  isClearingCache,
  theme,
  searchQuery,
  sortDirection,
  onAddFromDrive,
  onFileSelect,
  onCreateFolder,
  onRefresh,
  onChangeFolder,
  onClearCachedBooks,
  onToggleTheme,
  onSearchQueryChange,
  onToggleSortDirection,
}: HomeToolbarProps) {
  const [settingsAnchor, setSettingsAnchor] = useState<HTMLElement | null>(
    null,
  );

  const closeSettingsMenu = () => setSettingsAnchor(null);

  return (
    <Toolbar>
      <TextField
        type="search"
        size="small"
        value={searchQuery}
        onChange={(event) => onSearchQueryChange(event.target.value)}
        slotProps={{
          input: {
            startAdornment: (
              <InputAdornment position="start">
                <SearchIcon fontSize="small" />
              </InputAdornment>
            ),
          },
        }}
        sx={{ flex: "0 1 250px", maxWidth: "250px", minWidth: "12rem" }}
      />
      <Button
        type="button"
        $variant="filled"
        startIcon={<AddIcon />}
        onClick={onAddFromDrive}
        disabled={isAdding}
      >
        Add
      </Button>
      <Button
        type="button"
        startIcon={<CreateNewFolderIcon />}
        onClick={onCreateFolder}
      >
        Folder
      </Button>
      <FilePicker
        onFileSelect={onFileSelect}
        label="Upload"
        disabled={isAdding}
      />
      <Tooltip title={isRefreshing ? "Refreshing library" : "Refresh library"}>
        <span>
          <IconButton
            type="button"
            aria-label={isRefreshing ? "Refreshing library" : "Refresh library"}
            onClick={onRefresh}
            disabled={isRefreshing}
          >
            <RefreshIcon />
          </IconButton>
        </span>
      </Tooltip>
      <Tooltip title={sortDirection === "asc" ? "Sort Z to A" : "Sort A to Z"}>
        <IconButton
          type="button"
          aria-label={sortDirection === "asc" ? "Sort Z to A" : "Sort A to Z"}
          onClick={onToggleSortDirection}
          sx={{ marginLeft: "auto", flex: "0 0 auto" }}
        >
          <SortByAlphaIcon />
        </IconButton>
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
              border: 1,
              borderColor: "divider",
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
          <ListItemIcon>
            <DriveFolderUploadIcon />
          </ListItemIcon>
          Change Google Drive folder
        </MenuItem>
        <MenuItem
          onClick={() => {
            closeSettingsMenu();
            onClearCachedBooks();
          }}
          disabled={isClearingCache}
        >
          <ListItemIcon>
            <DeleteSweepIcon />
          </ListItemIcon>
          {isClearingCache ? "Clearing..." : "Clear cached books"}
        </MenuItem>
        <MenuItem
          onClick={() => {
            closeSettingsMenu();
            onToggleTheme();
          }}
        >
          <ListItemIcon>
            {theme === "light" ? <DarkModeIcon /> : <LightModeIcon />}
          </ListItemIcon>
          {theme === "light" ? "Switch to dark theme" : "Switch to light theme"}
        </MenuItem>
      </Menu>
    </Toolbar>
  );
}

export default HomeToolbar;
