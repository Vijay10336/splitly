import { createTheme } from "@mui/material/styles";

// Shared with design.css; semantic roles stay stable across all screens.
export const colors = {
  canvas: "#fcf8f2",
  surface: "#ffffff",
  ink: "#29352f",
  muted: "#626875",
  border: "#e1e3e8",
  primary: "#ad4d28",
  primaryDark: "#873b1f",
  success: "#24734e",
  warning: "#966009",
  error: "#b63c4c",
};
export const theme = createTheme({
  palette: {
    primary: {
      main: colors.primary,
      dark: colors.primaryDark,
      contrastText: "#fff",
    },
    success: { main: colors.success },
    warning: { main: colors.warning },
    error: { main: colors.error },
    text: { primary: colors.ink, secondary: colors.muted },
    background: { default: colors.canvas, paper: colors.surface },
    divider: colors.border,
  },
  typography: {
    fontFamily:
      '"Inter Variable", Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    fontSize: 13,
    button: {
      textTransform: "none",
      fontWeight: 600,
      fontSize: 13,
      letterSpacing: 0,
    },
  },
  shape: { borderRadius: 8 },
  components: {
    MuiButton: {
      defaultProps: { disableElevation: true },
      styleOverrides: {
        root: {
          minHeight: 38,
          gap: 8,
          padding: "8px 14px",
          transition: "background-color 120ms, border-color 120ms",
          boxShadow: "none",
          "&.Mui-focusVisible": {
            outline: "3px solid #b9c8f5",
            outlineOffset: 2,
          },
        },
        outlined: {
          borderColor: colors.border,
          color: colors.ink,
          backgroundColor: colors.surface,
          "&:hover": { borderColor: "#bac0cc", backgroundColor: "#f7f8fa" },
        },
      },
    },
    MuiChip: {
      styleOverrides: {
        root: { height: 26, borderRadius: 5, fontSize: 11, fontWeight: 550 },
        label: { padding: "0 8px" },
      },
    },
    MuiDialog: {
      styleOverrides: {
        paper: {
          borderRadius: 12,
          border: "1px solid #e1e3e8",
          boxShadow: "0 16px 64px #181c3233",
          margin: 16,
          maxHeight: "calc(100% - 32px)",
          backgroundImage: "none",
        },
      },
    },
    MuiBackdrop: { styleOverrides: { root: { backgroundColor: "#161b2d66" } } },
  },
});
