// Global polyfill: eth-crypto and other libs expect Node.js Buffer in browser
import { Buffer } from "buffer";
globalThis.Buffer = Buffer;

import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { TrustProtocolProvider } from "./hooks/useTrustProtocol.js";
import App from "./App.jsx";
import "./index.css";

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <BrowserRouter>
      <TrustProtocolProvider>
        <App />
      </TrustProtocolProvider>
    </BrowserRouter>
  </React.StrictMode>
);

