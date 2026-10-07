# Individual Learning item sharing

Learning items are shared individually. Creating an invite for one item does not grant access to the owner's other Learning content.

## Item types

| Learning item | Shared data | Collaboration |
| --- | --- | --- |
| Canvas | Existing `classes/{classId}/learningCanvases/{canvasId}` and its `content/main` | Viewer/editor roles, active class membership, live canvas cursors and presence, merged editor saves, append-only activity |
| Note | A learning canvas with `sourceCanvasId == 'note'` | Uses the canvas invite, access, presence, and activity model |
| Flashcard deck | `classes/{classId}/flashcardDecks/{deckId}` | Viewer/editor roles, active class membership, presence, append-only edit and sharing activity |
| Graph view | `classes/{classId}/graphViews/{graphId}` | A saved graph configuration containing included item IDs and positions; viewer/editor roles, active class membership, active/offline presence, and activity |
| AI Tutor conversation | `sharedTutorThreads/{threadId}` | Only explicitly shared threads are copied from device storage; viewer/editor roles, presence, and activity. Images are stored in message subcollections and capped at 350,000 base64 characters each. |

Owners create one invite link per item, choose viewer or editor access, and may set an expiry. Canvas, deck, and graph invitees must remain active members of the associated class. Tutor conversations have no class association and are shared with authenticated invitees through their individual thread link. Owners can change collaborator roles or remove access; invite acceptance never grants access to other items.

Unshared Tutor conversations remain in the learner's IndexedDB. Shared threads and their attached images are persisted to Firestore. Graph views store only selected item IDs and layout positions, not copies of the referenced learning materials.

Rules tests cover item isolation, invite acceptance and revocation, role boundaries, presence ownership, and append-only activity. Run the targeted suites with the Firebase Auth and Firestore emulators; do not deploy the rules as part of local validation.
