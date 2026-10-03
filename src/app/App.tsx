import { lazy, Suspense } from 'react'
import { Outlet, Route, Routes } from 'react-router-dom'
import { LandingPage } from '../features/landing/LandingPage'
import { RolePage } from '../features/auth/RolePage'
import { SignupPage } from '../features/auth/SignupPage'
import { SigninPage } from '../features/auth/SigninPage'
import { ForgotPasswordPage } from '../features/auth/ForgotPasswordPage'
import { NotFoundPage } from '../features/misc/NotFoundPage'
import { ProtectedRoute, PublicRoute, RoleRoute } from './RouteGuards'
import { ToastProvider } from '../shared/ui/ToastProvider'
import { AppShellLoading } from './AppShell'

const ProfilePage = lazy(() => import('../features/profile/ProfilePage').then((module) => ({ default: module.ProfilePage })))
const DesignPage = lazy(() => import('../features/misc/DesignPage').then((module) => ({ default: module.DesignPage })))
const ClassesPage = lazy(() => import('../features/classes/ClassesPage').then((module) => ({ default: module.ClassesPage })))
const ClassPage = lazy(() => import('../features/classes/ClassPage').then((module) => ({ default: module.ClassPage })))
const InstructorQuizzesPage = lazy(() => import('../features/quizzes/dashboard/InstructorQuizzesPage').then((module) => ({ default: module.InstructorQuizzesPage })))
const QuizEditorPage = lazy(() => import('../features/quizzes/editor/QuizEditorPage').then((module) => ({ default: module.QuizEditorPage })))
const QuestionBuilderPage = lazy(() => import('../features/quizzes/builder/QuestionBuilderPage').then((module) => ({ default: module.QuestionBuilderPage })))
const QuizResultsPage = lazy(() => import('../features/quizzes/results/QuizResultsPage').then((module) => ({ default: module.QuizResultsPage })))
const StudentClassPage = lazy(() => import('../features/classes/StudentClassPage').then((module) => ({ default: module.StudentClassPage })))
const JoinClassPage = lazy(() => import('../features/classes/JoinClassPage').then((module) => ({ default: module.JoinClassPage })))
const StudentQuizCatalogPage = lazy(() => import('../features/studentQuizzes/StudentQuizCatalogPage').then((module) => ({ default: module.StudentQuizCatalogPage })))
const QuizIntroPage = lazy(() => import('../features/studentQuizzes/QuizIntroPage').then((module) => ({ default: module.QuizIntroPage })))
const QuizTakingPage = lazy(() => import('../features/studentQuizzes/QuizTakingPage').then((module) => ({ default: module.QuizTakingPage })))
const QuizResultPage = lazy(() => import('../features/studentQuizzes/QuizResultPage').then((module) => ({ default: module.QuizResultPage })))

export function AppRoutes() {
  return (
    <Suspense fallback={<AppShellLoading />}>
    <Routes>
      <Route path="/" element={<LandingPage />} />
      <Route path="/role" element={<PublicRoute><RolePage /></PublicRoute>} />
      <Route path="/signup" element={<PublicRoute><SignupPage /></PublicRoute>} />
      <Route path="/signin" element={<PublicRoute><SigninPage /></PublicRoute>} />
      <Route path="/forgot-password" element={<PublicRoute><ForgotPasswordPage /></PublicRoute>} />
      <Route path="/profile" element={<ProtectedRoute><ProfilePage /></ProtectedRoute>} />
      <Route path="/join" element={<ToastProvider><JoinClassPage /></ToastProvider>} />
      <Route path="/join/:code" element={<ToastProvider><JoinClassPage /></ToastProvider>} />
      <Route path="/instructor" element={<ProtectedRoute><RoleRoute allowedRoles={['instructor']}><ToastProvider><Outlet /></ToastProvider></RoleRoute></ProtectedRoute>}>
        <Route index element={<ClassesPage />} />
        <Route path="classes/:classId" element={<ClassPage />} />
        <Route path="quizzes" element={<InstructorQuizzesPage />} />
        <Route path="quizzes/new" element={<QuizEditorPage />} />
        <Route path="quizzes/:quizId" element={<QuizEditorPage />} />
        <Route path="quizzes/:quizId/questions" element={<QuestionBuilderPage />} />
        <Route path="quizzes/:quizId/results" element={<QuizResultsPage />} />
      </Route>
      <Route path="/student" element={<ProtectedRoute><RoleRoute allowedRoles={['student']}><ToastProvider><StudentQuizCatalogPage /></ToastProvider></RoleRoute></ProtectedRoute>} />
      <Route path="/student/classes/:classId" element={<ProtectedRoute><RoleRoute allowedRoles={['student']}><ToastProvider><StudentClassPage /></ToastProvider></RoleRoute></ProtectedRoute>} />
      <Route path="/student/quizzes/:quizId" element={<ProtectedRoute><RoleRoute allowedRoles={['student']}><QuizIntroPage /></RoleRoute></ProtectedRoute>} />
      <Route path="/student/quizzes/:quizId/attempts/:attemptId" element={<ProtectedRoute><RoleRoute allowedRoles={['student']}><ToastProvider><QuizTakingPage /></ToastProvider></RoleRoute></ProtectedRoute>} />
      <Route path="/student/quizzes/:quizId/attempts/:attemptId/result" element={<ProtectedRoute><RoleRoute allowedRoles={['student']}><QuizResultPage /></RoleRoute></ProtectedRoute>} />
      {import.meta.env.DEV && <Route path="/design" element={<DesignPage />} />}
      <Route path="/404" element={<NotFoundPage />} />
      <Route path="*" element={<NotFoundPage />} />
    </Routes>
    </Suspense>
  )
}
