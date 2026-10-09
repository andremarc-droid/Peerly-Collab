import { GraduationCap, UserRound, type LucideIcon } from 'lucide-react'
import type { UserRole } from '../auth/roleIntent'

export interface RoleChoice {
  role: UserRole
  title: string
  description: string
  Icon: LucideIcon
}

/** The two roles in the order they are shown and in the order arrow keys move through them. */
export const roleChoices: RoleChoice[] = [
  { role: 'student', title: 'Student', description: 'Answer quizzes, practice and learn with others', Icon: UserRound },
  { role: 'instructor', title: 'Instructor', description: 'Create quizzes and guide your learners', Icon: GraduationCap },
]
