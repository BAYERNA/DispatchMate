import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { AuthProvider } from './auth/AuthContext'
import { RequireAuth } from './auth/RequireAuth'
import { LoginPage } from './pages/LoginPage'
import { SetInitialPasswordPage } from './pages/SetInitialPasswordPage'
import { AdminHomePage } from './pages/AdminHomePage'
import { AccountListPage } from './pages/AccountListPage'
import { AccountFormPage } from './pages/AccountFormPage'
import { DeviceListPage } from './pages/DeviceListPage'
import { CctvMonitorPage } from './pages/CctvMonitorPage'
import { StatisticsPage } from './pages/StatisticsPage'
import { OperationsReadinessPage } from './pages/OperationsReadinessPage'
import { OperationalIntelligencePage } from './pages/OperationalIntelligencePage'
import { GovernancePage } from './pages/GovernancePage'
import { OrganizationsPage } from './pages/OrganizationsPage'

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: false, refetchOnWindowFocus: false } },
})

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <BrowserRouter>
          <Routes>
            <Route path="/login" element={<LoginPage />} />
            <Route
              path="/operations"
              element={<RequireAuth><OperationsReadinessPage /></RequireAuth>}
            />
            <Route path="/intelligence" element={<RequireAuth><OperationalIntelligencePage /></RequireAuth>} />
            <Route path="/governance" element={<RequireAuth><GovernancePage /></RequireAuth>} />
            <Route
              path="/organizations"
              element={
                <RequireAuth allowedRoles={['SUPER_ADMIN']}>
                  <OrganizationsPage />
                </RequireAuth>
              }
            />
            <Route
              path="/initial-password"
              element={
                <RequireAuth>
                  <SetInitialPasswordPage />
                </RequireAuth>
              }
            />
            <Route
              path="/"
              element={
                <RequireAuth>
                  <AdminHomePage />
                </RequireAuth>
              }
            />
            <Route
              path="/accounts"
              element={
                <RequireAuth>
                  <AccountListPage />
                </RequireAuth>
              }
            />
            <Route
              path="/accounts/new"
              element={
                <RequireAuth>
                  <AccountFormPage mode="create" />
                </RequireAuth>
              }
            />
            <Route
              path="/accounts/:userId/edit"
              element={
                <RequireAuth>
                  <AccountFormPage mode="edit" />
                </RequireAuth>
              }
            />
            <Route
              path="/devices"
              element={
                <RequireAuth>
                  <DeviceListPage />
                </RequireAuth>
              }
            />
            <Route
              path="/statistics"
              element={
                <RequireAuth>
                  <StatisticsPage />
                </RequireAuth>
              }
            />
            <Route
              path="/cctv-monitor"
              element={
                <RequireAuth>
                  <CctvMonitorPage />
                </RequireAuth>
              }
            />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </BrowserRouter>
      </AuthProvider>
    </QueryClientProvider>
  )
}
