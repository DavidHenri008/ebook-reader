import { useRef, type ChangeEvent } from "react";
import styled from "@emotion/styled";
import UploadFileIcon from "@mui/icons-material/UploadFile";
import CircularProgress from "@mui/material/CircularProgress";
import { Button } from "./ui";

//#region Styled Components
const HiddenInput = styled.input`
  display: none;
`;
//#endregion

interface FilePickerProps {
  /** Called when user selects one or more EPUB files */
  onFileSelect: (files: File[]) => void;
  /** Optional custom button text */
  label?: string;
  /** Disables the button and shows a spinner */
  disabled?: boolean;
}

function FilePicker({
  onFileSelect,
  label = "Open EPUB",
  disabled = false,
}: FilePickerProps) {
  const inputRef = useRef<HTMLInputElement>(null);

  const handleChange = (e: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    if (files.length > 0) {
      onFileSelect(files);
      // Reset input so the same file(s) can be selected again
      e.target.value = "";
    }
  };

  const handleClick = () => {
    inputRef.current?.click();
  };

  return (
    <>
      <HiddenInput
        ref={inputRef}
        type="file"
        accept=".epub,application/epub+zip"
        multiple
        onChange={handleChange}
      />
      <Button
        type="button"
        $variant="filled"
        onClick={handleClick}
        disabled={disabled}
        startIcon={
          disabled ? (
            <CircularProgress size="1em" color="inherit" />
          ) : (
            <UploadFileIcon />
          )
        }
      >
        {label}
      </Button>
    </>
  );
}

export default FilePicker;
