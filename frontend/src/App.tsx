import React from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider, useAuth } from "@/context/AuthContext";
import { ThemeProvider } from "@/context/ThemeContext";
import { LanguageProvider } from "@/context/LanguageContext";
import { ProtectedRoute } from "@/components/auth/ProtectedRoute";
import { Layout } from "@/components/layout/Layout";
import { Login } from "@/pages/Login";
import { SuperAdminDashboard } from "@/pages/SuperAdminDashboard";
import { Dashboard } from "@/pages/Dashboard";
import { TransactionsPage } from "@/pages/TransactionsPage";
import { ReportsPage } from "@/pages/ReportsPage";
import { StationsPage } from "@/pages/StationsPage";
import { SettingsPage } from "@/pages/SettingsPage";

/**
 * Role-based home page:
 * - super_admin → SuperAdminDashboard (genel istasyon özeti)
 * - station_manager / cashier → Dashboard (vardiya mutabakatı)
 */
const RoleBasedHome: React.FC = () => {
  const { user } = useAuth();
  if (user?.role === "super_admin") return <SuperAdminDashboard />;
  return <Dashboard />;
};

export const App: React.FC = () => {
  return (
    <BrowserRouter>
      <LanguageProvider>
        <ThemeProvider>
          <AuthProvider>
            <Routes>
              <Route path="/login" element={<Login />} />

              <Route element={<ProtectedRoute />}>
                <Route element={<Layout />}>
                  {/* Ana sayfa: role'e göre farklı dashboard */}
                  <Route path="/" element={<RoleBasedHome />} />

                  {/* Müdür paneli (vardiya mutabakatı) — tüm roller erişebilir */}
                  <Route path="/shifts" element={<Dashboard />} />

                  {/* Diğer sayfalar */}
                  <Route path="/transactions" element={<TransactionsPage />} />
                  <Route path="/reports" element={<ReportsPage />} />
                  <Route path="/stations" element={<StationsPage />} />
                  <Route path="/settings" element={<SettingsPage />} />
                </Route>
              </Route>

              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </AuthProvider>
        </ThemeProvider>
      </LanguageProvider>
    </BrowserRouter>
  );
};

export default App;
