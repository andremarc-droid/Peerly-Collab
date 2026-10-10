# Learning domain

## Current foundation (Phase 1)

Learning is presented as one shared experience for student and instructor accounts. The personal workspace container remains the authenticated user's ID, and new canvases, notes, and flashcard decks created in Learning use that container. The library combines personal canvases and notes in that workspace with individually shared canvases and decks. Instructor-owned class material is excluded. No class, enrollment, module, or class-quiz subscription is used by the Learning hub.

Canvas and note data retain their existing locations under `classes/{workspaceId}/learningCanvases/{itemId}` and content under `content/main`; flashcard decks retain their existing `classes/{workspaceId}/flashcardDecks/{deckId}` format. Collection-group queries now find a user's own `personal` canvases, notes, and decks across class partitions. Owner-only list rules constrain those queries, and collection-group indexes support their filters and sorting. Class-owned decks remain excluded. Legacy class-scoped items remain stored. The new list rules and indexes are not deployed; deploy `firestore.rules` and `firestore.indexes.json` together before relying on class-partition discovery in production.

The Learning hub tabs are Home, Decks, Lessons, Notes, Canvases, and Groups. `?tab=flashcards` maps to Decks, `?tab=tutor` and shared tutor thread links still open the tutor dock, and `?tab=graph` maps to Canvases. The graph invite URL redirects to Learning. The graph view, graph-only helper modules, and duplicate role-specific Learning hubs are removed. Graph Firestore data, rules, and the generic invite-code resolver/tests remain untouched. Graph-specific helper tests were retired with the deleted feature; invite-code and Firestore rules tests remain.

## Phase 2 study engine

Scheduling uses a small SM-2-lite scheduler rather than FSRS: four understandable grading buttons and deterministic intervals keep v1 inspectable, while the pure `scheduleReview` boundary allows replacing it later. Ease starts at 2.5 and stays within 1.3–3.2; intervals are rounded and capped at 365 days. Again resets repetitions and schedules a 10-minute relearn, Hard grows slowly, Good uses 1/3 days then ease, and Easy uses 4/7 days then ease × 1.3. The client device clock is used. Daily new limits follow the device's local calendar day and can shift if the learner changes timezone.

Per-user progress is stored at `users/{uid}/deckProgress/{classId}~{deckId}`. Each document contains version, up to 100 card states, local `newDay`, and `newCount`. At the configured card-state shape, 100 entries are expected to remain around 13 KB, well below Firestore's 1 MiB document limit; exceeding the cap is an explicit error. Deleted cards are pruned when the deck is studied. Rules restrict reads/writes to the owner, allow only the four document fields, and enforce the card and count bounds. The UI queues overdue cards first (most overdue first), then up to the default 20 daily new cards.

Personal deck quizzes are generated in memory from embedded deck cards. Multiple choice uses deduplicated local answers as distractors and can accept validated AI distractors through the common Groq wrapper; written answers use normalized exact matching and Damerau–Levenshtein similarity (>= 0.9 for answers of at least five characters, with numeric sequences required to match), then can fall back to an AI verdict or learner self-grading. Quiz answers and grading are client-side and are practice feedback, not secure assessment. Practice attempts are stored at `users/{uid}/studyAttempts/{attemptId}`, with at most 50 reviewed questions and started/duration/time-limit metadata. The client reads the latest 20 for a deck and prunes history beyond 30 on save. Both collections have owner-only rules and study-attempt index support. The rules tests in `src/features/studyEngine/studyEngine.rules.test.ts` cover owner reads/writes/deletes, stranger and unauthenticated access, extra keys, 100-card and daily-count caps, local-day shape, review/max-score agreement, the 50-review cap, and timer bounds. They are written but have not been run successfully because the Firestore emulator is unavailable in this environment.

The deck study dialog now supports flashcards, quiz, and practice-test modes. The practice-test setup offers question count, mixed question types, untimed mode, and 5/10/15/30-minute limits; expiry submits automatically. Submitted attempts show per-question review and are retained in per-deck history. The Live game option remains visibly disabled as coming soon. Personal quiz/test question sets are not separate Firestore documents; they are generated from the deck on demand. Streak and XP remain placeholders. Written quiz responses do not block on unavailable AI; learner self-grading is available.

AI calls continue to use the existing Groq client through `src/features/studyEngine/ai.ts`; `VITE_GROQ_API_KEY` remains visible in browser code and should be moved server-side before public launch. No new dependencies were added.

## Phase 3 import pipeline (3A)

The Learning Home and Decks tabs open one lazy-loaded Create flow. It supports typed/pasted notes, locally extracted PDF/DOCX/PPTX/TXT/Markdown/CSV documents, up to four photo scans transcribed through the vision model, configurable Quizlet text, and Anki plain-text exports. Files are never uploaded. PDF/DOCX limits and password/scanned-file errors come from `src/features/documents`; PPTX reads slide text and speaker notes from the existing ZIP reader, with no added package. Photo transcription is AI-generated and must be reviewed for accuracy before card generation.

Quizlet accepts tab/comma/custom term separators and newline/semicolon/custom row separators. Anki honors `#separator:`, `#html:`, and `#columns:` headers, uses the first two columns by default, strips tags and sound markers, and warns when image media is dropped. Each parser reports valid, skipped, and truncated rows; fields are capped at 300/600 characters. Imports over 100 cards can be split into multiple personal decks (100 cards maximum each). Anki `.apkg` archives remain unsupported because reading their SQLite database would add a heavy runtime; export notes as plain text from Anki instead.

AI card generation uses only the shared `src/features/studyEngine/ai.ts` wrapper. Source is treated as untrusted data, chunked at about 6,000 characters, and capped at 10 chunks/60,000 characters. Chunks run sequentially with progress and cancellation; retry retains completed cards, deduplicates fronts, and validates every card against the existing schema. Decks are reviewed and saved with the existing personal deck service in `classes/{uid}/flashcardDecks`. Choosing Quiz saves the same deck and offers an on-the-fly Phase 2 quiz or practice test; it does not create a quiz document. Lessons remain disabled until Phase 4.

## Planned motivation model (Phase 5)

Streak and XP persistence are not implemented yet. The future design must define local-calendar-day and timezone-change behavior, daily goal handling, XP caps, and client-write tampering limits. Client-written XP must not be used for real-stakes rewards.

## Known limitations

- Lessons, YouTube imports, groups, live games, streaks, and XP remain staged for later phases.
- Progress updates are last-write-wins across devices; simultaneous study sessions can overwrite each other's progress. The device clock and local timezone determine due times and the daily new-card counter.
- Quiz and test grading run in the browser and are not secure or suitable for stakes. The Groq key configured through `VITE_GROQ_API_KEY` is exposed to browser users; move AI calls behind a server-side function before a public launch.
- Rules and collection-group indexes are source changes only until manually deployed. Study-engine rules tests are written but have not been run in the emulator here.
- The current personal-content schema continues to reuse `classes/{uid}` as a storage container; it is not a class membership relationship.
- The legacy graph data model and rules remain in Firestore for compatibility, although the app no longer exposes graph views or graph invite acceptance.
- Anki `.apkg` archives are deferred because their SQLite payload needs a heavy browser runtime; export text from Anki. Handwriting/photo transcription can be inaccurate and is always editable before generation. The configured Groq browser key is visible to learners.
