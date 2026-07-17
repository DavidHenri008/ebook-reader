import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { registerSW } from "virtual:pwa-register";
import { AppThemeProvider, GlobalStyles } from "./styles";
import App from "./App";
import { AuthProvider } from "./auth";

registerSW({ immediate: true });

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <AppThemeProvider>
      <GlobalStyles />
      <AuthProvider>
        <App />
      </AuthProvider>
    </AppThemeProvider>
  </StrictMode>,
);
