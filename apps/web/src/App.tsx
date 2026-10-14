import type { Role } from "@gac/shared";
import { Navigate, Route, Routes, useLocation } from "react-router-dom";
import { Layout } from "./components/Layout";
import { Spinner } from "./components/ui";
import { useAuth } from "./lib/auth";
import { AuditPage } from "./pages/AuditPage";
import { AuditRequestsPage } from "./pages/AuditRequestsPage";
import { CallsPage } from "./pages/CallsPage";
import { DashboardPage } from "./pages/DashboardPage";
import { EmailsPage } from "./pages/EmailsPage";
import { ImportPage } from "./pages/ImportPage";
import { LeadsPage } from "./pages/LeadsPage";
import { LoginPage } from "./pages/LoginPage";
import { NewLeadPage } from "./pages/NewLeadPage";
import { PipelinePage } from "./pages/PipelinePage";
import { ProfilePage } from "./pages/ProfilePage";
import { SettingsPage } from "./pages/SettingsPage";
import { SourcingPage } from "./pages/SourcingPage";
import { SuppressionsPage } from "./pages/SuppressionsPage";
import { UsersPage } from "./pages/UsersPage";

function RequireAuth() {
  const { user, loading } = useAuth();
  const location = useLocation();
  if (loading) return <Spinner />;
  // session expirée : on revient à la page d'origine après la reconnexion
  if (!user)
    return <Navigate to="/login" replace state={{ from: `${location.pathname}${location.search}` }} />;
  return <Layout />;
}

function RequireRole({ minimum, children }: { minimum: Role; children: React.ReactNode }) {
  const { can } = useAuth();
  if (!can(minimum)) {
    return (
      <div role="alert" className="rounded-2xl bg-ds-surface p-6">
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
        <Route path="pipeline" element={<PipelinePage />} />
        <Route path="leads" element={<LeadsPage />} />
        <Route
          path="leads/new"
          element={
            <RequireRole minimum="AGENT">
              <NewLeadPage />
            </RequireRole>
          }
        />
        <Route
          path="calls"
          element={
            <RequireRole minimum="AGENT">
              <CallsPage />
            </RequireRole>
          }
        />
        <Route
          path="audit-requests"
          element={
            <RequireRole minimum="AGENT">
              <AuditRequestsPage />
            </RequireRole>
          }
        />
        <Route
          path="emails"
          element={
            <RequireRole minimum="MANAGER">
              <EmailsPage />
            </RequireRole>
          }
        />
        <Route
          path="users"
          element={
            <RequireRole minimum="ADMIN">
              <UsersPage />
            </RequireRole>
          }
        />
        <Route
          path="import"
          element={
            <RequireRole minimum="ADMIN">
              <ImportPage />
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
        <Route
          path="suppressions"
          element={
            <RequireRole minimum="MANAGER">
              <SuppressionsPage />
            </RequireRole>
          }
        />
        <Route
          path="settings"
          element={
            <RequireRole minimum="MANAGER">
              <SettingsPage />
            </RequireRole>
          }
        />
        <Route
          path="sourcing"
          element={
            <RequireRole minimum="MANAGER">
              <SourcingPage />
            </RequireRole>
          }
        />
        <Route path="profile" element={<ProfilePage />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
