import { Navigate, Route, Routes } from 'react-router-dom'
import { LandingPage } from '../features/landing/LandingPage'
import { RolePage } from '../features/auth/RolePage'
import { NotFoundPage } from '../features/misc/NotFoundPage'
import { AccountPlaceholderPage } from '../features/misc/AccountPlaceholderPage'
import { DesignPage } from '../features/misc/DesignPage'

export function AppRoutes() {
  return (
    <Routes>
      <Route path="/" element={<LandingPage />} />
      <Route path="/role" element={<RolePage />} />
      <Route path="/signup" element={<AccountPlaceholderPage mode="signup" />} />
      <Route path="/signin" element={<AccountPlaceholderPage mode="signin" />} />
      {import.meta.env.DEV && <Route path="/design" element={<DesignPage />} />}
      <Route path="/404" element={<NotFoundPage />} />
      <Route path="*" element={<Navigate to="/404" replace />} />
    </Routes>
  )
}
