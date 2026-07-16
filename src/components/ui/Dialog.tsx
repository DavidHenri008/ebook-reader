import { useState } from "react";
import MuiButton from "@mui/material/Button";
import MuiDialog from "@mui/material/Dialog";
import DialogActions from "@mui/material/DialogActions";
import DialogContent from "@mui/material/DialogContent";
import DialogContentText from "@mui/material/DialogContentText";
import MenuItem from "@mui/material/MenuItem";
import TextField from "@mui/material/TextField";

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

interface DialogProps {
  state: DialogState;
  onConfirm: (value?: string) => void;
  onCancel: () => void;
}

function Dialog({ state, onConfirm, onCancel }: DialogProps) {
  const [inputValue, setInputValue] = useState(state.defaultValue ?? "");
  const hasInput = state.kind === "prompt" || state.kind === "select";

  return (
    <MuiDialog
      open
      onClose={onCancel}
      aria-label={state.message}
      slotProps={{
        paper: {
          sx: {
            width: "100%",
            maxWidth: "24rem",
            border: 1,
            borderColor: "divider",
            borderRadius: 2,
          },
        },
        backdrop: { sx: { bgcolor: "var(--overlay)" } },
      }}
    >
      <form
        onSubmit={(event) => {
          event.preventDefault();
          onConfirm(inputValue);
        }}
      >
        <DialogContent>
          <DialogContentText sx={{ mb: hasInput ? 2.5 : 0 }}>
            {state.message}
          </DialogContentText>
          {state.kind === "prompt" && (
            <TextField
              autoFocus
              fullWidth
              label={state.inputLabel ?? state.message}
              value={inputValue}
              onChange={(event) => setInputValue(event.target.value)}
            />
          )}
          {state.kind === "select" && (
            <TextField
              select
              autoFocus
              fullWidth
              label={state.inputLabel ?? state.message}
              value={inputValue}
              onChange={(event) => setInputValue(event.target.value)}
            >
              {state.options?.map((option) => (
                <MenuItem key={option.value} value={option.value}>
                  {option.label}
                </MenuItem>
              ))}
            </TextField>
          )}
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2.5 }}>
          {state.kind !== "alert" && (
            <MuiButton onClick={onCancel}>{state.cancelLabel}</MuiButton>
          )}
          <MuiButton
            autoFocus={!hasInput}
            type={hasInput ? "submit" : "button"}
            variant="contained"
            onClick={() => {
              if (!hasInput) onConfirm();
            }}
            disabled={state.kind === "prompt" && !inputValue.trim()}
          >
            {state.confirmLabel}
          </MuiButton>
        </DialogActions>
      </form>
    </MuiDialog>
  );
}

export default Dialog;
