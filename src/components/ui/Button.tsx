import { forwardRef } from "react";
import MuiButton from "@mui/material/Button";
import MuiIconButton from "@mui/material/IconButton";
import type { ButtonProps as MuiButtonProps } from "@mui/material/Button";
import type { IconButtonProps as MuiIconButtonProps } from "@mui/material/IconButton";

export type ButtonVariant = "filled" | "outlined";

export interface ButtonProps extends Omit<MuiButtonProps, "variant"> {
  $variant?: ButtonVariant;
}

const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { $variant = "outlined", sx, ...props },
  ref,
) {
  return (
    <MuiButton
      ref={ref}
      variant={$variant === "filled" ? "contained" : "outlined"}
      disableElevation
      sx={{
        minHeight: "2.5rem",
        borderRadius: 1,
        borderColor: "var(--border)",
        bgcolor: $variant === "filled" ? "var(--accent-bg)" : "var(--bg)",
        color: $variant === "filled" ? "var(--accent)" : "var(--text)",
        fontSize: "1rem",
        fontWeight: 500,
        textTransform: "none",
        "&:hover": {
          borderColor: "var(--accent-border)",
          bgcolor: "var(--accent-bg)",
          color: "var(--accent)",
        },
        ...sx,
      }}
      {...props}
    />
  );
});

const IconButton = forwardRef<HTMLButtonElement, MuiIconButtonProps>(
  function IconButton({ sx, ...props }, ref) {
    return (
      <MuiIconButton
        ref={ref}
        sx={{
          width: "2.5rem",
          height: "2.5rem",
          border: "1px solid var(--border)",
          borderRadius: 1,
          bgcolor: "var(--bg)",
          color: "var(--text)",
          "&:hover": {
            borderColor: "var(--accent-border)",
            bgcolor: "var(--accent-bg)",
            color: "var(--accent)",
          },
          ...sx,
        }}
        {...props}
      />
    );
  },
);

export default Button;
export { IconButton };
