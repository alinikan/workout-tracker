import React from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import "./styles.css";

// main.tsx is the browser entry point. Vite loads index.html, this script finds the #root element,
// and React takes over rendering from there.
const root = document.getElementById("root");

if (!root) {
  // Failing loudly here is better than rendering nothing; a missing root means index.html changed
  // in a way that breaks the entire app.
  throw new Error("Root element #root was not found.");
}

createRoot(root).render(
  // StrictMode helps catch unsafe effects during development. It does not change the production
  // bundle behavior users receive from Vercel.
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
