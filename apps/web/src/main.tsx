import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App.js";
import "./index.css";
import "./design/fonts.js";
import "./design/tokens.css";
import "./design/base.css";
import "./design/shell.css";
import "./design/home.css";
import "./design/studio.css";
import "./design/lab.css";
import "./design/trust.css";
import "./design/refinements.css";

const rootElement = document.getElementById("root");
if (!rootElement) {
  throw new Error("Failed to find root element");
}

ReactDOM.createRoot(rootElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
