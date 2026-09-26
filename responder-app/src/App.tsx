import { lazy, Suspense } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { AuthProvider } from './auth/AuthContext'
import { RequireAuth } from './auth/RequireAuth'

const LoginPage = lazy(() => import('./pages/LoginPage').then(({ LoginPage }) => ({ default: LoginPage })))
const SetInitialPasswordPage = lazy(() => import('./pages/SetInitialPasswordPage').then(({ SetInitialPasswordPage }) => ({ default: SetInitialPasswordPage })))
const ResponderHomePage = lazy(() => import('./pages/ResponderHomePage').then(({ ResponderHomePage }) => ({ default: ResponderHomePage })))
const ReportListPage = lazy(() => import('./pages/ReportListPage').then(({ ReportListPage }) => ({ default: ReportListPage })))
const ReportEditPage = lazy(() => import('./pages/ReportEditPage').then(({ ReportEditPage }) => ({ default: ReportEditPage })))
const ReportAnalysisPage = lazy(() => import('./pages/ReportAnalysisPage').then(({ ReportAnalysisPage }) => ({ default: ReportAnalysisPage })))

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: false, refetchOnWindowFocus: false } },
})

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <BrowserRouter>
          <Suspense fallback={<div className="spinner-text">화면을 불러오는 중…</div>}>
            <Routes>
            <Route path="/login" element={<LoginPage />} />
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
                  <ResponderHomePage />
                </RequireAuth>
              }
            />
            <Route
              path="/reports"
              element={
                <RequireAuth>
                  <ReportListPage />
                </RequireAuth>
              }
            />
            <Route
              path="/reports/:reportId"
              element={
                <RequireAuth>
                  <ReportEditPage />
                </RequireAuth>
              }
            />
            <Route
              path="/reports/:reportId/analysis"
              element={
                <RequireAuth>
                  <ReportAnalysisPage />
                </RequireAuth>
              }
            />
            <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </Suspense>
        </BrowserRouter>
      </AuthProvider>
    </QueryClientProvider>
  )
}
