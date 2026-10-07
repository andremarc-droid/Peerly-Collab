# Individual Learning item sharing

Learning items are shared individually. Creating an invite for one item does not grant access to the owner's other Learning content.

## Item types

| Learning item | Shared data | Collaboration |
| --- | --- | --- |
| Canvas | Existing `classes/{classId}/learningCanvases/{canvasId}` and its `content/main` | Viewer/editor roles, active class membership, live canvas cursors and presence, merged editor saves, append-only activity |
| Note | A learning canvas with `sourceCanvasId == 'note'` | Uses the canvas invite, access, presence, and activity model |
| Flashcard deck | `classes/{classId}/flashcardDecks/{deckId}` | Viewer/editor roles, active class membership, presence, append-only edit and sharing activity |
| Graph view | `classes/{classId}/graphViews/{graphId}` | A saved graph snapshot with included item labels, connections, and positions; viewer/editor roles, active/offline presence, and activity |
| AI Tutor conversation | `sharedTutorThreads/{threadId}` | Only explicitly shared threads are copied from device storage; viewer/editor roles, presence, and activity. Images are stored in message subcollections and capped at 350,000 base64 characters each. |

Owners create one eight-character invite code per item, choose viewer or editor access, and may set an expiry. Enter codes in the Learning header beside “Import .canvas”; codes are not share URLs. Graph invitees can be any authenticated Peerly user and do not need to belong to the source class. Canvas and deck invitees still need active membership in the associated class. Tutor conversations have no class association. Owners can change collaborator roles or remove access; invite acceptance never grants access to other items.

Unshared Tutor conversations remain in the learner's IndexedDB. Shared threads and their attached images are persisted to Firestore. Graph views keep a bounded display snapshot so invitees outside the source class can see the graph without granting them access to the underlying class materials.

Rules tests cover item isolation, invite acceptance and revocation, role boundaries, presence ownership, and append-only activity. Run the targeted suites with the Firebase Auth and Firestore emulators; do not deploy the rules as part of local validation.
