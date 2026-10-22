import React from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import { PrivateHybridAccess } from './components/PrivateHybridAccess';
import "./styles.css";
import "./decision-console.css";
import "./stage-cockpit.css";

const root = document.getElementById("root");

if (!root) {
  throw new Error("Missing root element.");
}

createRoot(root).render(
  <React.StrictMode>
    <PrivateHybridAccess><App /></PrivateHybridAccess>
  </React.StrictMode>
);

