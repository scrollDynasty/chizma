import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router";
import { App } from "./App";
import { AuthProvider } from "./lib/auth";
import "./i18n";
import "./index.css";

const root = document.getElementById("root");
if (!root) throw new Error("Root element #root not found");

const queryClient = new QueryClient();
// Vite's BASE_URL is "/chizma/"; the router wants it without the trailing slash.
const basename = import.meta.env.BASE_URL.replace(/\/$/, "");

createRoot(root).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <BrowserRouter basename={basename}>
        <AuthProvider>
          <App />
        </AuthProvider>
      </BrowserRouter>
    </QueryClientProvider>
  </StrictMode>,
);
