import React from "react";
import ReactDOM from "react-dom/client";
import { ApolloProvider } from "@apollo/client";
import { BrowserRouter } from "react-router-dom";
import { client } from "./apollo";
import { AuthProvider } from "./context/AuthContext";
import { ThemeProvider } from "./context/ThemeContext";
import { MuteProvider } from "./context/MuteContext";
import { SquadProvider } from "./context/SquadContext";
import { ToastProvider } from "./context/ToastContext";
import ErrorBoundary from "./components/ErrorBoundary";
import App from "./App";
import "./i18n";
import "./index.css";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <ApolloProvider client={client}>
      <ThemeProvider>
        <MuteProvider>
        <ToastProvider>
          <AuthProvider>
            <SquadProvider>
              <BrowserRouter>
                <ErrorBoundary>
                  <App />
                </ErrorBoundary>
              </BrowserRouter>
            </SquadProvider>
          </AuthProvider>
        </ToastProvider>
        </MuteProvider>
      </ThemeProvider>
    </ApolloProvider>
  </React.StrictMode>,
);
