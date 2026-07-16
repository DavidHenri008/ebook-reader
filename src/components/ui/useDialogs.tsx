import { useCallback, useRef, useState } from "react";
import Dialog, { type DialogOption, type DialogState } from "./Dialog";

interface ConfirmOptions {
  confirmLabel?: string;
  cancelLabel?: string;
}

interface PromptOptions extends ConfirmOptions {
  defaultValue?: string;
  inputLabel?: string;
}

interface SelectOptions extends ConfirmOptions {
  options: DialogOption[];
  defaultValue?: string;
  inputLabel?: string;
}

type DialogResult = boolean | string | null;

export interface UseDialogsResult {
  /** Show a confirm dialog. Resolves to `true` if confirmed, `false` otherwise. */
  confirm: (message: string, options?: ConfirmOptions) => Promise<boolean>;
  /** Show an alert dialog. Resolves once dismissed. */
  alert: (message: string) => Promise<void>;
  /** Show a text-input dialog. Resolves to the entered value or `null`. */
  prompt: (message: string, options?: PromptOptions) => Promise<string | null>;
  /** Show a choice dialog. Resolves to the selected value or `null`. */
  select: (message: string, options: SelectOptions) => Promise<string | null>;
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
  const resolverRef = useRef<((value: DialogResult) => void) | null>(null);

  const open = useCallback(
    (next: DialogState) =>
      new Promise<DialogResult>((resolve) => {
        resolverRef.current?.(null);
        resolverRef.current = resolve;
        setState(next);
      }),
    [],
  );

  const settle = useCallback((value: DialogResult) => {
    const resolve = resolverRef.current;
    resolverRef.current = null;
    setState(null);
    resolve?.(value);
  }, []);

  const confirm = useCallback(
    async (message: string, options?: ConfirmOptions) =>
      (await open({
        message,
        kind: "confirm",
        confirmLabel: options?.confirmLabel ?? "OK",
        cancelLabel: options?.cancelLabel ?? "Cancel",
      })) === true,
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

  const prompt = useCallback(
    async (message: string, options?: PromptOptions) => {
      const result = await open({
        message,
        kind: "prompt",
        confirmLabel: options?.confirmLabel ?? "OK",
        cancelLabel: options?.cancelLabel ?? "Cancel",
        defaultValue: options?.defaultValue,
        inputLabel: options?.inputLabel,
      });
      return typeof result === "string" ? result : null;
    },
    [open],
  );

  const select = useCallback(
    async (message: string, options: SelectOptions) => {
      const result = await open({
        message,
        kind: "select",
        confirmLabel: options.confirmLabel ?? "Select",
        cancelLabel: options.cancelLabel ?? "Cancel",
        defaultValue: options.defaultValue ?? options.options[0]?.value ?? "",
        inputLabel: options.inputLabel,
        options: options.options,
      });
      return typeof result === "string" ? result : null;
    },
    [open],
  );

  const dialog = state ? (
    <Dialog
      state={state}
      onConfirm={(value) => settle(value ?? true)}
      onCancel={() => settle(null)}
    />
  ) : null;

  return { confirm, alert, prompt, select, dialog };
}
