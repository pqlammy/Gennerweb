import React, { Suspense, lazy } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { Login } from './pages/Login';
import { Layout } from './components/Layout';
import { AuthProvider } from './context/AuthContext';
import { ProtectedRoute } from './components/ProtectedRoute';
import { PrivacyPolicy } from './pages/PrivacyPolicy';

const UserDashboard = lazy(() => import('./pages/UserDashboard').then((module) => ({ default: module.UserDashboard })));
const CollectContribution = lazy(() => import('./pages/CollectContribution').then((module) => ({ default: module.CollectContribution })));
const UserSettlement = lazy(() => import('./pages/UserSettlement').then((module) => ({ default: module.UserSettlement })));
const UserProfile = lazy(() => import('./pages/UserProfile').then((module) => ({ default: module.UserProfile })));

const AdminDashboard = lazy(() => import('./pages/AdminDashboard').then((module) => ({ default: module.AdminDashboard })));
const AdminStats = lazy(() => import('./pages/AdminStats').then((module) => ({ default: module.AdminStats })));
const AdminProfile = lazy(() => import('./pages/AdminProfile').then((module) => ({ default: module.AdminProfile })));
const AdminMembers = lazy(() => import('./pages/AdminMembers').then((module) => ({ default: module.AdminMembers })));
const AdminSettings = lazy(() => import('./pages/AdminSettings').then((module) => ({ default: module.AdminSettings })));
const AdminHealth = lazy(() => import('./pages/AdminHealth').then((module) => ({ default: module.AdminHealth })));

function SuspenseFallback() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-[#0b0f19] text-gray-200">
      <div className="text-center">
        <div className="mx-auto mb-3 h-10 w-10 animate-spin rounded-full border-2 border-transparent border-t-[var(--primary-color,#dc2626)]"></div>
        <p className="text-sm tracking-wide text-gray-400">Lade Inhalte …</p>
      </div>
    </div>
  );
}

function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Suspense fallback={<SuspenseFallback />}>
          <Routes>
            <Route path="/login" element={<Login />} />
            <Route path="/privacy" element={<PrivacyPolicy />} />

            {/* User Routes */}
            <Route
              path="/dashboard"
              element={
                <ProtectedRoute>
                  <Layout>
                    <UserDashboard />
                  </Layout>
                </ProtectedRoute>
              }
            />
            <Route
              path="/dashboard/collect"
              element={
                <ProtectedRoute>
                  <Layout>
                    <CollectContribution />
                  </Layout>
                </ProtectedRoute>
              }
            />
            <Route
              path="/dashboard/settlement"
              element={
                <ProtectedRoute>
                  <Layout>
                    <UserSettlement />
                  </Layout>
                </ProtectedRoute>
              }
            />
            <Route
              path="/dashboard/profile"
              element={
                <ProtectedRoute>
                  <Layout>
                    <UserProfile />
                  </Layout>
                </ProtectedRoute>
              }
            />

            {/* Admin Routes */}
            <Route
              path="/admin"
              element={
                <ProtectedRoute requireAdmin>
                  <Layout>
                    <AdminDashboard />
                  </Layout>
                </ProtectedRoute>
              }
            />
            <Route
              path="/admin/stats"
              element={
                <ProtectedRoute requireAdmin>
                  <Layout>
                    <AdminStats />
                  </Layout>
                </ProtectedRoute>
              }
            />
            <Route
              path="/admin/health"
              element={
                <ProtectedRoute requireAdmin>
                  <Layout>
                    <AdminHealth />
                  </Layout>
                </ProtectedRoute>
              }
            />
            <Route
              path="/admin/members"
              element={
                <ProtectedRoute requireAdmin>
                  <Layout>
                    <AdminMembers />
                  </Layout>
                </ProtectedRoute>
              }
            />
            <Route
              path="/admin/settings"
              element={
                <ProtectedRoute requireAdmin>
                  <Layout>
                    <AdminSettings />
                  </Layout>
                </ProtectedRoute>
              }
            />
            <Route
              path="/admin/profile"
              element={
                <ProtectedRoute requireAdmin>
                  <Layout>
                    <AdminProfile />
                  </Layout>
                </ProtectedRoute>
              }
            />

            <Route path="*" element={<Navigate to="/login" replace />} />
          </Routes>
        </Suspense>
      </AuthProvider>
    </BrowserRouter>
  );
}

export default App
