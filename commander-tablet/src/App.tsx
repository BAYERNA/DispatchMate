import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { AuthProvider } from './auth/AuthContext'
import { RequireAuth } from './auth/RequireAuth'
import { LoginPage } from './pages/LoginPage'
import { SetInitialPasswordPage } from './pages/SetInitialPasswordPage'
import { ActiveIncidentsPage } from './pages/ActiveIncidentsPage'
import { IncidentMonitoringPage } from './pages/IncidentMonitoringPage'
import { ResponderDetailPage } from './pages/ResponderDetailPage'
import { TrainingPage } from './pages/TrainingPage'
import { DroneMapPage } from './pages/DroneMapPage'

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
              path="/training"
              element={<RequireAuth><TrainingPage /></RequireAuth>}
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
                  <ActiveIncidentsPage />
                </RequireAuth>
              }
            />
            <Route
              path="/incidents/:incidentId"
              element={
                <RequireAuth>
                  <IncidentMonitoringPage />
                </RequireAuth>
              }
            />
            <Route
              path="/incidents/:incidentId/responders/:userId"
              element={
                <RequireAuth>
                  <ResponderDetailPage />
                </RequireAuth>
              }
            />
            <Route
              path="/drones/map"
              element={
                <RequireAuth>
                  <DroneMapPage />
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
