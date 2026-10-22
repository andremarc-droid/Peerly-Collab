import { describe, expect, it } from 'vitest'
import '@testing-library/jest-dom/vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { Timestamp } from 'firebase/firestore'
import { TeamResults } from './TeamResults'
import type { Team, TeamReveal } from '../../quizzes/types/team'
import type { QuizRecord } from '../../quizzes/services/quizService'

const mockTeam: Team = {
  id: 'team-1',
  name: 'Canvas Team',
  memberIds: ['m1', 'm2'],
  memberNames: { m1: 'Alice', m2: 'Bob' },
  representativeId: 'm1',
  code: null,
  studyGroupId: null,
  status: 'submitted',
  score: null,
  maxScore: null,
}

const mockCanvasQuiz: QuizRecord = {
  id: 'quiz-canvas',
  ownerId: 'teacher',
  ownerName: 'Instructor',
  classId: 'class-1',
  title: 'Canvas Quiz',
  description: '',
  tags: [],
  mode: 'canvas',
  boardKind: 'blank',
  status: 'published',
  questionCount: 1,
  createdAt: Timestamp.fromMillis(1),
  updatedAt: Timestamp.fromMillis(1),
  publishedAt: Timestamp.fromMillis(1),
  settings: {
    answerReveal: 'never',
    participation: { type: 'group', groupSize: 2, answerMode: 'representative', teamFormation: 'assigned', waitForEveryone: false, questionTimeSec: null },
    scoreVisibility: 'after_release',
    scoresReleased: false,
    timeLimitMinutes: null,
    attemptsAllowed: 1,
    shuffleQuestions: false,
    shuffleOptions: false,
  },
}

describe('TeamResults', () => {
  it('renders "Submitted. Your instructor will check your board." for blank canvas with unreleased score', () => {
    render(
      <MemoryRouter>
        <TeamResults team={mockTeam} reveals={[]} quiz={mockCanvasQuiz} />
      </MemoryRouter>,
    )

    expect(screen.getByText(/Canvas Team finished/i)).toBeInTheDocument()
    expect(screen.getByText('Submitted. Your instructor will check your board.')).toBeInTheDocument()
    expect(screen.getByText(/Your team’s concept board has been submitted/i)).toBeInTheDocument()
  })

  it('renders standard score text for regular quizzes when score is null', () => {
    render(
      <MemoryRouter>
        <TeamResults team={mockTeam} reveals={[]} />
      </MemoryRouter>,
    )

    expect(screen.getByText('Your instructor decides when scores are shown. Check back later.')).toBeInTheDocument()
    expect(screen.getByText('Details for each question are not available.')).toBeInTheDocument()
  })

  it('renders question by question list when reveals are present', () => {
    const reveals: TeamReveal[] = [
      {
        index: 0,
        questionId: 'q1',
        question: { type: 'choice', prompt: 'Which one?', points: 5, options: [] },
        finalAnswer: 'opt-a',
        picks: {},
        lockedBy: 'm1',
        auto: false,
        result: { correct: true, pointsAwarded: 5, correctAnswer: 'opt-a', explanation: 'Good job!' },
      },
    ]

    render(
      <MemoryRouter>
        <TeamResults team={{ ...mockTeam, score: 5, maxScore: 5 }} reveals={reveals} />
      </MemoryRouter>,
    )

    expect(screen.getByText('5 / 5')).toBeInTheDocument()
    expect(screen.getByText(/Which one\?/i)).toBeInTheDocument()
    expect(screen.getByText(/Good job!/i)).toBeInTheDocument()
  })
})
