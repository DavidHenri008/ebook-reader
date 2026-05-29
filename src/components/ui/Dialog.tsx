import { useEffect, useRef } from "react";
import styled from "@emotion/styled";
import Button from "./Button";

export type DialogKind = "confirm" | "alert";

export interface DialogState {
  message: string;
  kind: DialogKind;
  confirmLabel: string;
  cancelLabel: string;
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

const Actions = styled.div`
  display: flex;
  justify-content: flex-end;
  gap: 0.5rem;
`;
//#endregion

interface DialogProps {
  state: DialogState;
  onConfirm: () => void;
  onCancel: () => void;
}

/**
 * Presentational modal dialog. State and promise resolution are owned by
 * `useDialogs`; this component only renders and handles dismissal input.
 */
function Dialog({ state, onConfirm, onCancel }: DialogProps) {
  const confirmRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    confirmRef.current?.focus();
  }, []);

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
      <Box role="alertdialog" aria-modal="true" aria-label={state.message}>
        <Message>{state.message}</Message>
        <Actions>
          {state.kind === "confirm" && (
            <Button type="button" onClick={onCancel}>
              {state.cancelLabel}
            </Button>
          )}
          <Button
            ref={confirmRef}
            type="button"
            $variant="filled"
            onClick={onConfirm}
          >
            {state.confirmLabel}
          </Button>
        </Actions>
      </Box>
    </Backdrop>
  );
}

export default Dialog;
