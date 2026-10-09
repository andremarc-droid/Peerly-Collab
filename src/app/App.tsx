import { lazy, Suspense } from 'react'
import { Navigate, Outlet, Route, Routes, useParams } from 'react-router-dom'
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
const ModuleWorkspacePage = lazy(() => import('../features/modules/ModuleWorkspacePage').then((module) => ({ default: module.ModuleWorkspacePage })))
const InstructorQuizzesPage = lazy(() => import('../features/quizzes/dashboard/InstructorQuizzesPage').then((module) => ({ default: module.InstructorQuizzesPage })))
const QuizEditorPage = lazy(() => import('../features/quizzes/editor/QuizEditorPage').then((module) => ({ default: module.QuizEditorPage })))
const QuizResultsPage = lazy(() => import('../features/quizzes/results/QuizResultsPage').then((module) => ({ default: module.QuizResultsPage })))
function LegacyQuestionsRedirect() { const { quizId } = useParams(); return <Navigate replace to={`/instructor/quizzes/${quizId}?tab=questions`} /> }
const StudentClassPage = lazy(() => import('../features/classes/StudentClassPage').then((module) => ({ default: module.StudentClassPage })))
const StudentModulePage = lazy(() => import('../features/modules/StudentModulePage').then((module) => ({ default: module.StudentModulePage })))
const AssignmentEditorPage = lazy(() => import('../features/assignments/AssignmentEditorPage').then((module) => ({ default: module.AssignmentEditorPage })))
const StudentAssignmentPage = lazy(() => import('../features/assignments/StudentAssignmentPage').then((module) => ({ default: module.StudentAssignmentPage })))
const JoinClassPage = lazy(() => import('../features/classes/JoinClassPage').then((module) => ({ default: module.JoinClassPage })))
const StudentClassesPage = lazy(() => import('../features/classes/StudentClassesPage').then((module) => ({ default: module.StudentClassesPage })))
const QuizIntroPage = lazy(() => import('../features/studentQuizzes/QuizIntroPage').then((module) => ({ default: module.QuizIntroPage })))
const QuizTakingPage = lazy(() => import('../features/studentQuizzes/QuizTakingPage').then((module) => ({ default: module.QuizTakingPage })))
const QuizResultPage = lazy(() => import('../features/studentQuizzes/QuizResultPage').then((module) => ({ default: module.QuizResultPage })))
const InstructorLearningCanvasPage = lazy(() => import('../features/learningCanvas/InstructorLearningCanvasPage').then((module) => ({ default: module.InstructorLearningCanvasPage })))
const StudentLearningCanvasPage = lazy(() => import('../features/learningCanvas/StudentLearningCanvasPage').then((module) => ({ default: module.StudentLearningCanvasPage })))
const InstructorLearningHubPage = lazy(() => import('../features/learningCanvas/InstructorLearningHubPage').then((module) => ({ default: module.InstructorLearningHubPage })))
const StudentLearningHubPage = lazy(() => import('../features/learningCanvas/StudentLearningHubPage').then((module) => ({ default: module.StudentLearningHubPage })))
const NoteEditorPage = lazy(() => import('../features/learningCanvas/NoteEditorPage').then((module) => ({ default: module.NoteEditorPage })))
const CanvasInvitePage = lazy(() => import('../features/learningCanvas/CanvasInvitePage').then((module) => ({ default: module.CanvasInvitePage })))
const TutorInvitePage = lazy(() => import('../features/chatbot/TutorInvitePage').then((module) => ({ default: module.TutorInvitePage })))
const GraphInvitePage = lazy(() => import('../features/learningCanvas/GraphInvitePage').then((module) => ({ default: module.GraphInvitePage })))
const DeckInvitePage = lazy(() => import('../features/flashcards/DeckInvitePage').then((module) => ({ default: module.DeckInvitePage })))

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
      <Route path="/learning/join/:classId/:canvasId/:token" element={<ProtectedRoute><ToastProvider><CanvasInvitePage /></ToastProvider></ProtectedRoute>} />
      <Route path="/learning/tutor/:threadId/:token" element={<ProtectedRoute><ToastProvider><TutorInvitePage /></ToastProvider></ProtectedRoute>} />
      <Route path="/learning/join-graph/:classId/:graphId/:token" element={<ProtectedRoute><ToastProvider><GraphInvitePage /></ToastProvider></ProtectedRoute>} />
      <Route path="/learning/join/deck/:classId/:deckId/:token" element={<ProtectedRoute><DeckInvitePage /></ProtectedRoute>} />
      <Route path="/instructor" element={<ProtectedRoute><RoleRoute allowedRoles={['instructor']}><ToastProvider><Outlet /></ToastProvider></RoleRoute></ProtectedRoute>}>
        <Route index element={<ClassesPage />} />
        <Route path="classes/:classId" element={<ClassPage />} />
        <Route path="classes/:classId/modules/:moduleId" element={<ModuleWorkspacePage />} />
        <Route path="classes/:classId/assignments/:assignmentId" element={<AssignmentEditorPage />} />
        <Route path="classes/:classId/learning/:canvasId" element={<InstructorLearningCanvasPage />} />
        <Route path="classes/:classId/notes/:noteId" element={<NoteEditorPage role="instructor" />} />
        <Route path="learning" element={<InstructorLearningHubPage />} />
        <Route path="quizzes" element={<InstructorQuizzesPage />} />
        <Route path="quizzes/new" element={<QuizEditorPage />} />
        <Route path="quizzes/:quizId" element={<QuizEditorPage />} />
        <Route path="quizzes/:quizId/questions" element={<LegacyQuestionsRedirect />} />
        <Route path="quizzes/:quizId/results" element={<QuizResultsPage />} />
      </Route>
      <Route path="/student" element={<ProtectedRoute><RoleRoute allowedRoles={['student']}><ToastProvider><StudentClassesPage /></ToastProvider></RoleRoute></ProtectedRoute>} />
      <Route path="/student/classes/:classId" element={<ProtectedRoute><RoleRoute allowedRoles={['student']}><ToastProvider><StudentClassPage /></ToastProvider></RoleRoute></ProtectedRoute>} />
      <Route path="/student/classes/:classId/modules/:moduleId" element={<ProtectedRoute><RoleRoute allowedRoles={['student']}><ToastProvider><StudentModulePage /></ToastProvider></RoleRoute></ProtectedRoute>} />
      <Route path="/student/classes/:classId/assignments/:assignmentId" element={<ProtectedRoute><RoleRoute allowedRoles={['student']}><ToastProvider><StudentAssignmentPage /></ToastProvider></RoleRoute></ProtectedRoute>} />
      <Route path="/student/classes/:classId/learning/:canvasId" element={<ProtectedRoute><RoleRoute allowedRoles={['student']}><ToastProvider><StudentLearningCanvasPage /></ToastProvider></RoleRoute></ProtectedRoute>} />
      <Route path="/student/learning" element={<ProtectedRoute><RoleRoute allowedRoles={['student']}><ToastProvider><StudentLearningHubPage /></ToastProvider></RoleRoute></ProtectedRoute>} />
      <Route path="/student/classes/:classId/notes/:noteId" element={<ProtectedRoute><RoleRoute allowedRoles={['student']}><ToastProvider><NoteEditorPage role="student" /></ToastProvider></RoleRoute></ProtectedRoute>} />
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
