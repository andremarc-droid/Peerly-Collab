import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import '@testing-library/jest-dom/vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { Timestamp } from 'firebase/firestore'
import { QuizIntroPage } from './QuizIntroPage'
import { defaultQuizSettings } from '../quizzes/schemas/settings'
import type { Quiz } from '../quizzes/types'
import { getQuiz } from '../quizzes/services/quizService'
import { listUserAttempts } from '../quizzes/services/attemptService'
import { listQuestions } from '../quizzes/services/questionService'

vi.mock('../../app/AppShell', () => ({ AppShell: ({ children }: { children: React.ReactNode }) => <>{children}</> }))
vi.mock('../auth/useAuth', () => ({ useAuth: () => ({ user: { uid: 'student-1', email: 's@example.test', displayName: 'Student' }, profile: { name: 'Student' } }) }))
vi.mock('../quizzes/services/quizService', () => ({ getQuiz: vi.fn() }))
vi.mock('../quizzes/services/attemptService', () => ({ listUserAttempts: vi.fn(), startAttempt: vi.fn() }))
vi.mock('../quizzes/services/questionService', () => ({ listQuestions: vi.fn() }))

const base: Quiz & { id: string } = {
  ownerId: 'teacher', ownerName: 'Instructor', classId: 'class-1', title: 'Team quiz', description: '', tags: [], mode: 'quiz', status: 'published', questionCount: 2,
  createdAt: Timestamp.fromMillis(1), updatedAt: Timestamp.fromMillis(1), publishedAt: Timestamp.fromMillis(1), settings: defaultQuizSettings('quiz'), id: 'quiz-1',
}
const groupQuiz: Quiz & { id: string } = {
  ...base,
  settings: { ...base.settings, participation: { type: 'group', groupSize: 3, answerMode: 'representative', teamFormation: 'self', waitForEveryone: true, questionTimeSec: null } },
}

function renderIntro() {
  return render(<MemoryRouter initialEntries={['/student/quizzes/quiz-1']}><Routes>
    <Route path="/student/quizzes/:quizId" element={<QuizIntroPage />} />
    <Route path="/student/quizzes/:quizId/team" element={<p>Team flow</p>} />
  </Routes></MemoryRouter>)
}

beforeEach(() => {
  vi.mocked(listUserAttempts).mockResolvedValue([])
  vi.mocked(listQuestions).mockResolvedValue([])
})
afterEach(() => { cleanup(); vi.clearAllMocks() })

describe('QuizIntroPage with group quizzes', () => {
  it('sends a group quiz to the team flow without loading its questions or attempts', async () => {
    vi.mocked(getQuiz).mockResolvedValue(groupQuiz)
    renderIntro()
    expect(await screen.findByText('Team flow')).toBeInTheDocument()
    expect(listQuestions).not.toHaveBeenCalled()
    expect(listUserAttempts).not.toHaveBeenCalled()
  })

  it('keeps showing the normal intro for a solo quiz', async () => {
    vi.mocked(getQuiz).mockResolvedValue(base)
    vi.mocked(listQuestions).mockResolvedValue([{ id: 'q1' }])
    renderIntro()
    expect(await screen.findByRole('button', { name: 'Start quiz' })).toBeInTheDocument()
    expect(screen.queryByText('Team flow')).not.toBeInTheDocument()
  })

  it('says so when the quiz is no longer published', async () => {
    vi.mocked(getQuiz).mockResolvedValue({ ...groupQuiz, status: 'draft' })
    renderIntro()
    expect(await screen.findByText('This quiz is no longer available.')).toBeInTheDocument()
    expect(screen.queryByText('Team flow')).not.toBeInTheDocument()
  })
})
