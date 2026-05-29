import { useCallback, useRef, useState } from "react";
import Dialog, { type DialogState } from "./Dialog";

interface ConfirmOptions {
  confirmLabel?: string;
  cancelLabel?: string;
}

export interface UseDialogsResult {
  /** Show a confirm dialog. Resolves to `true` if confirmed, `false` otherwise. */
  confirm: (message: string, options?: ConfirmOptions) => Promise<boolean>;
  /** Show an alert dialog. Resolves once dismissed. */
  alert: (message: string) => Promise<void>;
  /** Render this where the dialog should mount (e.g. at the end of the page). */
  dialog: React.ReactNode;
}

/**
 * In-app replacement for the native `confirm`/`alert` dialogs.
 *
 * Returns promise-based `confirm`/`alert` functions plus a `dialog` node to
 * render. Only one dialog is shown at a time; a new request replaces any
 * pending one (resolving the previous request as cancelled).
 */
export function useDialogs(): UseDialogsResult {
  const [state, setState] = useState<DialogState | null>(null);
  const resolverRef = useRef<((value: boolean) => void) | null>(null);

  const open = useCallback(
    (next: DialogState) =>
      new Promise<boolean>((resolve) => {
        resolverRef.current?.(false);
        resolverRef.current = resolve;
        setState(next);
      }),
    [],
  );

  const settle = useCallback((value: boolean) => {
    const resolve = resolverRef.current;
    resolverRef.current = null;
    setState(null);
    resolve?.(value);
  }, []);

  const confirm = useCallback(
    (message: string, options?: ConfirmOptions) =>
      open({
        message,
        kind: "confirm",
        confirmLabel: options?.confirmLabel ?? "OK",
        cancelLabel: options?.cancelLabel ?? "Cancel",
      }),
    [open],
  );

  const alert = useCallback(
    async (message: string) => {
      await open({
        message,
        kind: "alert",
        confirmLabel: "OK",
        cancelLabel: "Cancel",
      });
    },
    [open],
  );

  const dialog = state ? (
    <Dialog
      state={state}
      onConfirm={() => settle(true)}
      onCancel={() => settle(false)}
    />
  ) : null;

  return { confirm, alert, dialog };
}
