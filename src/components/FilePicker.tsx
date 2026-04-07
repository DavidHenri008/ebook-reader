import { useRef, type ChangeEvent } from "react";
import styled from "@emotion/styled";
import { keyframes } from "@emotion/react";

//#region Styled Components
const spin = keyframes`
  to { transform: rotate(360deg); }
`;

const HiddenInput = styled.input`
  display: none;
`;

const PickerButton = styled.button`
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.75rem 1.5rem;
  border: 1px solid var(--border);
  border-radius: 4px;
  background-color: var(--accent-bg);
  color: var(--accent);
  cursor: pointer;
  font-size: 1rem;
  font-weight: 500;
  transition:
    border-color 0.2s,
    opacity 0.2s;

  &:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }

  &:hover:not(:disabled) {
    border-color: var(--accent-border);
  }

  &:focus-visible {
    outline: 2px solid var(--accent);
    outline-offset: 2px;
  }
`;

const Spinner = styled.span`
  display: inline-block;
  width: 0.9em;
  height: 0.9em;
  border: 2px solid currentColor;
  border-top-color: transparent;
  border-radius: 50%;
  animation: ${spin} 0.7s linear infinite;
  flex-shrink: 0;
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
      <PickerButton type="button" onClick={handleClick} disabled={disabled}>
        {disabled && <Spinner aria-hidden="true" />}
        {label}
      </PickerButton>
    </>
  );
}

export default FilePicker;
