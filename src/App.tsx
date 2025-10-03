import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { Login } from './pages/Login';
import { Layout } from './components/Layout';
import { UserDashboard } from './pages/UserDashboard';
import { CollectContribution } from './pages/CollectContribution';
import { UserSettlement } from './pages/UserSettlement';
import { AdminDashboard } from './pages/AdminDashboard';
import { AdminStats } from './pages/AdminStats';
import { AdminProfile } from './pages/AdminProfile';
import { AdminMembers } from './pages/AdminMembers';
import { AdminSettings } from './pages/AdminSettings';
import { AdminHealth } from './pages/AdminHealth';
import { UserProfile } from './pages/UserProfile';
import { AuthProvider } from './context/AuthContext';
import { ProtectedRoute } from './components/ProtectedRoute';
import { PrivacyPolicy } from './pages/PrivacyPolicy';

function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
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
      </AuthProvider>
    </BrowserRouter>
  );
}

export default App
