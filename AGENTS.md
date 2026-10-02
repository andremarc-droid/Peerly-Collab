# Cool-lab

## Product
Cool-lab is a quiz platform for effective, collaborative learning. Instructors create and configure quizzes; students answer individually or in groups of two or more as configured by the instructor. Question types include multiple choice, fill in the blank, identification, and flashcards, with more to come. Pacing options are self-paced, timed, or waiting until all students have answered before moving on. Learning principles: retrieval before reveal, immediate feedback with explanations, missed questions return in mastery mode, and reward practice rather than speed.

## Conventions
- Use strict TypeScript and feature-based folders: `src/app`, `src/features/<feature>`, `src/lib`, `src/shared/ui`, and `src/types`.
- Keep modules small and focused (aim for under 300 lines). Do not create one large service class.
- Use the modular Firebase v10 SDK in small files.
- Use Tailwind only, with no inline styles. Build mobile-first and accessibly: labels, visible focus states, and never rely on color alone.
- Never hard-code secrets or silently fall back to dummy config. Missing environment variables must produce a clear error.
- Write tests for logic you add.
- Use the existing oxlint setup; do not add ESLint.
