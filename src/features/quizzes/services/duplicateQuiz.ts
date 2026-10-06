import { collection, doc, getDoc, getDocs, Timestamp, updateDoc, writeBatch, type Firestore } from 'firebase/firestore'
import { firestore } from '../../../lib/firebase/firestore'
import { parseQuiz, validateQuestionAnswerPair } from '../schemas'
import { answerKeysRef, imagesRef, questionsRef, quizRef } from './paths'

export async function duplicateQuiz(quizId: string, db: Firestore = firestore, classIdOverride?: string): Promise<string> {
  const sourceRef = quizRef(db, quizId)
  const sourceSnapshot = await getDoc(sourceRef)
  if (!sourceSnapshot.exists()) throw new Error('Quiz not found')
  const [questionSnapshot, keySnapshot, imageSnapshot] = await Promise.all([
    getDocs(questionsRef(db, quizId)),
    getDocs(answerKeysRef(db, quizId)),
    getDocs(imagesRef(db, quizId)),
  ])
  const source = parseQuiz(sourceSnapshot.data())
  const classId = classIdOverride ?? source.classId
  if (!classId) throw new Error('Assign this unassigned quiz to a class before duplicating it.')
  const copyId = doc(collection(db, 'quizzes')).id
  const copyRef = quizRef(db, copyId)
  const now = Timestamp.now()
  const copiedQuiz = {
    ...source,
    classId,
    title: `Copy of ${source.title}`,
    ...(source.mode === 'canvas' ? { boardKind: source.boardKind ?? 'prebuilt' } : {}),
    status: 'draft' as const,
    questionCount: 0,
    createdAt: now,
    updatedAt: now,
    publishedAt: null,
    settings: { ...source.settings, scoresReleased: false },
  }

  // 1. Commit the copied quiz document first
  const firstBatch = writeBatch(db)
  firstBatch.set(copyRef, copiedQuiz)
  await firstBatch.commit()

  // 2. If canvas mode, duplicate all images with new IDs in size-aware batches before the board
  const imageIdMap = new Map<string, string>()
  if (source.mode === 'canvas' && !imageSnapshot.empty) {
    const MAX_BATCH_BYTES = 3 * 1024 * 1024 // 3 MiB cap per batch
    let currentImageBatch = writeBatch(db)
    let currentBatchBytes = 0

    for (const imgDoc of imageSnapshot.docs) {
      const newImageRef = doc(imagesRef(db, copyId))
      imageIdMap.set(imgDoc.id, newImageRef.id)
      const data = imgDoc.data()
      const payload = {
        data: data.data,
        mimeType: data.mimeType,
        width: data.width,
        height: data.height,
        bytes: data.bytes,
        createdAt: now,
      }
      const itemBytes = (payload.data?.length ?? 0) + 1024
      if (currentBatchBytes + itemBytes > MAX_BATCH_BYTES) {
        await currentImageBatch.commit()
        currentImageBatch = writeBatch(db)
        currentBatchBytes = 0
      }
      currentImageBatch.set(newImageRef, payload)
      currentBatchBytes += itemBytes
    }

    if (currentBatchBytes > 0) {
      await currentImageBatch.commit()
    }
  }

  // 3. Duplicate questions and answer keys, remapping imageIds on canvas board cards
  const keysByQuestion = new Map(keySnapshot.docs.map((key) => [key.id, key.data()]))
  const operations = questionSnapshot.docs.map((snapshot) => {
    const { id } = snapshot
    const targetQuestionRef = source.mode === 'canvas' && id === 'board'
      ? doc(db, 'quizzes', copyId, 'questions', 'board')
      : doc(collection(db, 'quizzes', copyId, 'questions'))
    const isBlankBoard = source.mode === 'canvas' && source.boardKind === 'blank' && id === 'board'
    const answerKey = keysByQuestion.get(id)
    if (!answerKey && !isBlankBoard) throw new Error(`Missing answer key for question ${id}`)

    let rawQuestionData = snapshot.data()
    if (source.mode === 'canvas' && id === 'board' && Array.isArray(rawQuestionData.cards)) {
      rawQuestionData = {
        ...rawQuestionData,
        cards: rawQuestionData.cards.map((card: Record<string, unknown>) => {
          if (card.type === 'image' && typeof card.imageId === 'string' && imageIdMap.has(card.imageId)) {
            return {
              ...card,
              imageId: imageIdMap.get(card.imageId)!,
            }
          }
          return card
        }),
      }
    }

    if (isBlankBoard) {
      const pair = validateQuestionAnswerPair(rawQuestionData, null, { boardKind: 'blank' })
      return { questionRef: targetQuestionRef, question: pair.question, key: null }
    }

    const pair = validateQuestionAnswerPair(rawQuestionData, answerKey, { allowLegacyImages: true })
    return { questionRef: targetQuestionRef, question: pair.question, key: pair.answerKey }
  })

  for (let start = 0; start < operations.length; start += 200) {
    const batch = writeBatch(db)
    for (const item of operations.slice(start, start + 200)) {
      batch.set(item.questionRef, item.question)
      if (item.key) batch.set(doc(db, 'quizzes', copyId, 'answerKeys', item.questionRef.id), item.key)
    }
    await batch.commit()
  }

  if (questionSnapshot.size > 0) await updateDoc(copyRef, { questionCount: questionSnapshot.size, updatedAt: Timestamp.now() })
  return copyId
}
