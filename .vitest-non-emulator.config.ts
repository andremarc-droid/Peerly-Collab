import { mergeConfig } from 'vitest/config'
import base from './vitest.config'

export default mergeConfig(base, {
  test: {
    exclude: [
      '**/node_modules/**', '**/dist/**',
      'src/lib/firebase/firestore.rules.test.ts', 'src/lib/firebase/stress.rules.test.ts', 'src/lib/firebase/quiz.rules.test.ts', 'src/lib/firebase/module.rules.test.ts',
      'src/features/flashcards/youtubeTranscript.rules.test.ts', 'src/features/studyEngine/studyEngine.rules.test.ts', 'src/features/chatbot/sharing.rules.test.ts', 'src/features/flashcards/flashcards.rules.test.ts',
      'src/features/classes/services/classroom.services.test.ts', 'src/features/classes/services/classroom.rules.test.ts', 'src/features/groups/groups.rules.test.ts', 'src/features/learningSharing/inviteCodes.rules.test.ts',
      'src/features/profile/accountData.lessons.test.ts', 'src/features/learningCanvas/collab/collab.rules.test.ts', 'src/features/lessons/newAccountPersonalWorkspace.rules.test.ts', 'src/features/stats/stats.rules.test.ts',
      'src/features/lessons/lessons.rules.test.ts', 'src/features/quizzes/services/quizService.test.ts', 'src/features/modules/services.test.ts', 'src/features/learningCanvas/learningCanvas.rules.test.ts', 'src/features/learningCanvas/services.test.ts',
    ],
  },
})
