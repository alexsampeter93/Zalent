import React from "react";
import ReactDOM from "react-dom/client";
// Fuentes autoalojadas de la marca Olaz (sin CDN).
// Titulares en Archivo (sans con carácter), cuerpo en Work Sans.
import "@fontsource/archivo/600.css";
import "@fontsource/archivo/700.css";
import "@fontsource/archivo/800.css";
import "@fontsource/work-sans/400.css";
import "@fontsource/work-sans/500.css";
import "@fontsource/work-sans/600.css";
import "@fontsource/work-sans/700.css";
import "./shell/olaz-theme.css";
import App from "./App";
import { applyMode, getMode } from "./lib/theme";

// Aplica el tema guardado cuanto antes (evita parpadeo y cubre el bloqueo).
applyMode(getMode());

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
