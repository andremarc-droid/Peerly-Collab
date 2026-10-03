import { collection, doc, type Firestore } from 'firebase/firestore'

export const quizRef = (db: Firestore, quizId: string) => doc(db, 'quizzes', quizId)
export const questionsRef = (db: Firestore, quizId: string) => collection(db, 'quizzes', quizId, 'questions')
export const questionRef = (db: Firestore, quizId: string, questionId: string) => doc(db, 'quizzes', quizId, 'questions', questionId)
export const answerKeysRef = (db: Firestore, quizId: string) => collection(db, 'quizzes', quizId, 'answerKeys')
export const answerKeyRef = (db: Firestore, quizId: string, questionId: string) => doc(db, 'quizzes', quizId, 'answerKeys', questionId)
export const participantsRef = (db: Firestore, quizId: string) => collection(db, 'quizzes', quizId, 'participants')
export const participantRef = (db: Firestore, quizId: string, uid: string) => doc(db, 'quizzes', quizId, 'participants', uid)
export const attemptsRef = (db: Firestore, quizId: string) => collection(db, 'quizzes', quizId, 'attempts')
export const attemptRef = (db: Firestore, quizId: string, attemptId: string) => doc(db, 'quizzes', quizId, 'attempts', attemptId)
export const resultsRef = (db: Firestore, quizId: string) => collection(db, 'quizzes', quizId, 'results')
export const resultRef = (db: Firestore, quizId: string, attemptId: string) => doc(db, 'quizzes', quizId, 'results', attemptId)
