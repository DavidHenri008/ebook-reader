import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { registerSW } from "virtual:pwa-register";
import { GlobalStyles } from "./styles";
import App from "./App";
import { isNative } from "./platform/platform";

// The PWA service worker is only useful for the web target. Inside a native
// Capacitor WebView it is redundant and can cause stale-cache/update bugs, so
// registration is gated to non-native platforms.
if (!isNative()) {
  registerSW({ immediate: true });
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <GlobalStyles />
    <App />
  </StrictMode>,
);
