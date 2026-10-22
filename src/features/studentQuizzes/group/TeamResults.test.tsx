import { describe, expect, it } from 'vitest'
import '@testing-library/jest-dom/vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { TeamResults } from './TeamResults'
import type { Team, TeamReveal } from '../../quizzes/types/team'

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

describe('TeamResults', () => {

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
