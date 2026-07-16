import { useEffect, useRef, useState } from "react";
import styled from "@emotion/styled";
import Button from "./Button";

export type DialogKind = "confirm" | "alert" | "prompt" | "select";

export interface DialogOption {
  label: string;
  value: string;
}

export interface DialogState {
  message: string;
  kind: DialogKind;
  confirmLabel: string;
  cancelLabel: string;
  defaultValue?: string;
  inputLabel?: string;
  options?: DialogOption[];
}

//#region Styled components
const Backdrop = styled.div`
  position: fixed;
  inset: 0;
  z-index: 1000;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 1rem;
  background: var(--overlay);
`;

const Box = styled.div`
  width: 100%;
  max-width: 24rem;
  background: var(--bg);
  color: var(--text);
  border: 1px solid var(--border);
  border-radius: 8px;
  box-shadow: 0 10px 30px rgba(0, 0, 0, 0.25);
  padding: 1.25rem;
`;

const Message = styled.p`
  margin: 0 0 1.25rem;
  color: var(--text-heading);
  font-size: 1rem;
  line-height: 1.5;
`;

const Input = styled.input`
  width: 100%;
  height: 2.5rem;
  margin: -0.5rem 0 1.25rem;
  padding: 0 0.75rem;
  border: 1px solid var(--border);
  border-radius: 4px;
  background: var(--bg);
  color: var(--text);
  font: inherit;

  &:focus-visible {
    outline: 2px solid var(--accent);
    outline-offset: 2px;
  }
`;

const Select = styled.select`
  width: 100%;
  min-height: 2.5rem;
  margin: -0.5rem 0 1.25rem;
  padding: 0.5rem 0.75rem;
  border: 1px solid var(--border);
  border-radius: 4px;
  background: var(--bg);
  color: var(--text);
  font: inherit;

  &:focus-visible {
    outline: 2px solid var(--accent);
    outline-offset: 2px;
  }
`;

const Actions = styled.div`
  display: flex;
  justify-content: flex-end;
  gap: 0.5rem;
`;
//#endregion

interface DialogProps {
  state: DialogState;
  onConfirm: (value?: string) => void;
  onCancel: () => void;
}

/**
 * Presentational modal dialog. State and promise resolution are owned by
 * `useDialogs`; this component only renders and handles dismissal input.
 */
function Dialog({ state, onConfirm, onCancel }: DialogProps) {
  const confirmRef = useRef<HTMLButtonElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [inputValue, setInputValue] = useState(state.defaultValue ?? "");

  useEffect(() => {
    if (state.kind === "prompt") inputRef.current?.focus();
    else confirmRef.current?.focus();
  }, [state.kind]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onCancel();
      }
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [onCancel]);

  return (
    <Backdrop
      onClick={(event) => {
        if (event.target === event.currentTarget) onCancel();
      }}
    >
      <Box
        as="form"
        role="alertdialog"
        aria-modal="true"
        aria-label={state.message}
        onSubmit={(event) => {
          event.preventDefault();
          onConfirm(inputValue);
        }}
      >
        <Message>{state.message}</Message>
        {state.kind === "prompt" && (
          <Input
            ref={inputRef}
            aria-label={state.inputLabel ?? state.message}
            value={inputValue}
            onChange={(event) => setInputValue(event.target.value)}
          />
        )}
        {state.kind === "select" && (
          <Select
            aria-label={state.inputLabel ?? state.message}
            value={inputValue}
            onChange={(event) => setInputValue(event.target.value)}
          >
            {state.options?.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </Select>
        )}
        <Actions>
          {state.kind !== "alert" && (
            <Button type="button" onClick={onCancel}>
              {state.cancelLabel}
            </Button>
          )}
          <Button
            ref={confirmRef}
            type={
              state.kind === "prompt" || state.kind === "select"
                ? "submit"
                : "button"
            }
            $variant="filled"
            onClick={() => {
              if (state.kind !== "prompt" && state.kind !== "select")
                onConfirm();
            }}
            disabled={state.kind === "prompt" && !inputValue.trim()}
          >
            {state.confirmLabel}
          </Button>
        </Actions>
      </Box>
    </Backdrop>
  );
}

export default Dialog;
