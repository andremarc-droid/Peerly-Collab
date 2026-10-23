/**
 * Dry-run and emulator migration script: copies legacy `sharedDecks` to general `sharedItems`.
 * Does NOT delete original `sharedDecks` documents.
 * Run in PowerShell:
 *   npx tsx scripts/migrate-shared-decks-to-items.ts [--apply]
 */
import { initializeApp } from 'firebase/app'
import {
  collectionGroup,
  doc,
  getDocs,
  getFirestore,
  serverTimestamp,
  setDoc,
} from 'firebase/firestore'

const isApply = process.argv.includes('--apply')

const firebaseConfig = {
  projectId: process.env.VITE_FIREBASE_PROJECT_ID || 'demo-peerly-collab',
  apiKey: 'demo-api-key',
}

const app = initializeApp(firebaseConfig)
const db = getFirestore(app)

async function runMigration() {
  console.log(`Starting sharedDecks -> sharedItems migration (${isApply ? 'APPLY' : 'DRY RUN'})...`)

  const decksSnap = await getDocs(collectionGroup(db, 'sharedDecks'))
  console.log(`Found ${decksSnap.size} legacy sharedDecks document(s).`)

  let migratedCount = 0

  for (const deckDoc of decksSnap.docs) {
    const segments = deckDoc.ref.path.split('/')
    if (segments[0] !== 'studyGroups' || !segments[1]) continue
    const groupId = segments[1]
    const data = deckDoc.data()

    const sharedItem = {
      id: deckDoc.id,
      kind: 'deck',
      title: data.title || 'Untitled Deck',
      summary: data.description || '',
      payload: {
        cardCount: data.cardCount || data.cards?.length || 0,
        cards: data.cards || [],
        sourceClassId: data.sourceClassId || '',
      },
      sharedByUid: data.sharedByUid,
      sharedByName: data.sharedByName || 'Learner',
      sharedAt: data.sharedAt || serverTimestamp(),
      version: 1,
      originalItemId: data.deckId || deckDoc.id,
    }

    if (isApply) {
      const targetRef = doc(db, 'studyGroups', groupId, 'sharedItems', deckDoc.id)
      await setDoc(targetRef, sharedItem, { merge: true })
      console.log(`[APPLIED] Migrated deck ${deckDoc.id} into studyGroups/${groupId}/sharedItems`)
    } else {
      console.log(`[DRY-RUN] Would migrate deck "${sharedItem.title}" (${deckDoc.id}) in group ${groupId}`)
    }
    migratedCount += 1
  }

  console.log(`Migration finished. Total items processed: ${migratedCount}.`)
}

runMigration().catch((err) => {
  console.error('Migration failed:', err)
  process.exit(1)
})
