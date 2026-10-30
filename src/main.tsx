import "@fontsource-variable/inter";
import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";
import "./styles/icon-motion.css";
import { AppErrorBoundary } from "./components/AppErrorBoundary";
import { installChunkErrorGuard, stripRecoveryParam } from "./lib/appRecovery";
import { registerAppServiceWorker } from "./lib/pwa";

declare global {
  interface Window {
    __ttaBooted?: boolean;
  }
}

installChunkErrorGuard();
stripRecoveryParam();

createRoot(document.getElementById("root")!).render(
  <AppErrorBoundary>
    <App />
  </AppErrorBoundary>,
);

// Tell public/boot-guard.js that the bundle loaded and React took over.
window.__ttaBooted = true;
document.getElementById("tta-boot-fallback")?.remove();

registerAppServiceWorker();
