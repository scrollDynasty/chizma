import { Route, Routes } from "react-router";
import { Layout } from "@/components/Layout";
import { RequireAuth } from "@/components/RequireAuth";
import { AuthCallback } from "@/pages/AuthCallback";
import { Home } from "@/pages/Home";
import { Login } from "@/pages/Login";
import { NewSite } from "@/pages/NewSite";

export function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<Home />} />
        <Route path="login" element={<Login />} />
        <Route path="auth/callback" element={<AuthCallback />} />
        <Route path="*" element={<Home />} />
      </Route>
      {/* The editor is full-screen, outside the page layout. */}
      <Route
        path="new"
        element={
          <RequireAuth>
            <NewSite />
          </RequireAuth>
        }
      />
    </Routes>
  );
}
