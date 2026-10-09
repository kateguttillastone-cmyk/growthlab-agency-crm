import type { Role } from "@gac/shared";
import { Navigate, Route, Routes } from "react-router-dom";
import { Layout } from "./components/Layout";
import { Spinner } from "./components/ui";
import { useAuth } from "./lib/auth";
import { AuditPage } from "./pages/AuditPage";
import { DashboardPage } from "./pages/DashboardPage";
import { LeadsPage } from "./pages/LeadsPage";
import { LoginPage } from "./pages/LoginPage";
import { ProfilePage } from "./pages/ProfilePage";
import { UsersPage } from "./pages/UsersPage";

function RequireAuth() {
  const { user, loading } = useAuth();
  if (loading) return <Spinner />;
  if (!user) return <Navigate to="/login" replace />;
  return <Layout />;
}

function RequireRole({ minimum, children }: { minimum: Role; children: React.ReactNode }) {
  const { can } = useAuth();
  if (!can(minimum)) {
    return (
      <div role="alert" className="rounded-2xl bg-white p-6">
        <h1 className="text-xl font-bold">Accès refusé</h1>
        <p className="mt-2 text-sm">Votre rôle ne permet pas d'ouvrir cette page.</p>
      </div>
    );
  }
  return <>{children}</>;
}

export function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route element={<RequireAuth />}>
        <Route index element={<DashboardPage />} />
        <Route path="leads" element={<LeadsPage />} />
        <Route
          path="users"
          element={
            <RequireRole minimum="ADMIN">
              <UsersPage />
            </RequireRole>
          }
        />
        <Route
          path="audit"
          element={
            <RequireRole minimum="ADMIN">
              <AuditPage />
            </RequireRole>
          }
        />
        <Route path="profile" element={<ProfilePage />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
