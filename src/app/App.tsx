import { Outlet, Route, Routes } from 'react-router-dom'
import { LandingPage } from '../features/landing/LandingPage'
import { RolePage } from '../features/auth/RolePage'
import { SignupPage } from '../features/auth/SignupPage'
import { SigninPage } from '../features/auth/SigninPage'
import { ForgotPasswordPage } from '../features/auth/ForgotPasswordPage'
import { ProfilePage } from '../features/profile/ProfilePage'
import { NotFoundPage } from '../features/misc/NotFoundPage'
import { DesignPage } from '../features/misc/DesignPage'
import { ProtectedRoute, PublicRoute, RoleRoute } from './RouteGuards'
import { DashboardHome } from '../features/dashboard/DashboardHome'
import { ClassesPage } from '../features/classes/ClassesPage'
import { ClassPage } from '../features/classes/ClassPage'
import { JoinClassPage } from '../features/classes/JoinClassPage'
import { InstructorQuizzesPage } from '../features/quizzes/dashboard/InstructorQuizzesPage'
import { QuizEditorPage } from '../features/quizzes/editor/QuizEditorPage'
import { QuestionBuilderPage } from '../features/quizzes/builder/QuestionBuilderPage'
import { ToastProvider } from '../shared/ui/ToastProvider'

export function AppRoutes() {
  return (
    <Routes>
      <Route path="/" element={<LandingPage />} />
      <Route path="/role" element={<PublicRoute><RolePage /></PublicRoute>} />
      <Route path="/signup" element={<PublicRoute><SignupPage /></PublicRoute>} />
      <Route path="/signin" element={<PublicRoute><SigninPage /></PublicRoute>} />
      <Route path="/forgot-password" element={<PublicRoute><ForgotPasswordPage /></PublicRoute>} />
      <Route path="/profile" element={<ProtectedRoute><ProfilePage /></ProtectedRoute>} />
      <Route path="/join/:code" element={<ProtectedRoute><RoleRoute allowedRoles={['student']}><ToastProvider><JoinClassPage /></ToastProvider></RoleRoute></ProtectedRoute>} />
      <Route path="/instructor" element={<ProtectedRoute><RoleRoute allowedRoles={['instructor']}><ToastProvider><Outlet /></ToastProvider></RoleRoute></ProtectedRoute>}>
        <Route index element={<ClassesPage />} />
        <Route path="classes/:classId" element={<ClassPage />} />
        <Route path="quizzes" element={<InstructorQuizzesPage />} />
        <Route path="quizzes/new" element={<QuizEditorPage />} />
        <Route path="quizzes/:quizId" element={<QuizEditorPage />} />
        <Route path="quizzes/:quizId/questions" element={<QuestionBuilderPage />} />
      </Route>
      <Route path="/student" element={<ProtectedRoute><RoleRoute allowedRoles={['student']}><DashboardHome role="student" /></RoleRoute></ProtectedRoute>} />
      {import.meta.env.DEV && <Route path="/design" element={<DesignPage />} />}
      <Route path="/404" element={<NotFoundPage />} />
      <Route path="*" element={<NotFoundPage />} />
    </Routes>
  )
}
