import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App.js";
import "./styles.css";

/**
 * Browser entry point. Mounts the Charts read surface into `#root`. Pure
 * bootstrap; all behavior lives in `App` and the `charts/` module.
 */
const container = document.getElementById("root");

if (container === null) {
  throw new Error("Root container #root was not found.");
}

createRoot(container).render(
  <StrictMode>
    <App />
  </StrictMode>
);
