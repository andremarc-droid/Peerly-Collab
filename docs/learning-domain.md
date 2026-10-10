# Learning domain

## Current foundation (Phase 1)

Learning is presented as one shared experience for student and instructor accounts. The personal workspace container remains the authenticated user's ID, and new canvases, notes, and flashcard decks created in Learning use that container. The library combines personal canvases and notes in that workspace with individually shared canvases and decks. Instructor-owned class material is excluded. No class, enrollment, module, or class-quiz subscription is used by the Learning hub.

Canvas and note data retain their existing locations under `classes/{workspaceId}/learningCanvases/{itemId}` and content under `content/main`; flashcard decks retain their existing `classes/{workspaceId}/flashcardDecks/{deckId}` format. This phase adds no Firestore paths or rules. Legacy class-scoped items remain stored. The current client only discovers personal items in the user's workspace plus individually shared items; it does not perform a cross-class owner search.

The Learning hub tabs are Home, Decks, Lessons, Notes, Canvases, and Groups. `?tab=flashcards` maps to Decks, `?tab=tutor` and shared tutor thread links still open the tutor dock, and `?tab=graph` maps to Canvases. The graph invite URL redirects to Learning. The graph view, graph-only helper modules, and duplicate role-specific Learning hubs are removed. Graph Firestore data, rules, and the generic invite-code resolver/tests remain untouched. Graph-specific helper tests were retired with the deleted feature; invite-code and Firestore rules tests remain.

## Planned study progress model (Phase 2)

Spaced repetition is not implemented yet. The planned model stores one owner-only progress document per `(userId, deckId)` with a bounded map of card IDs to per-card state. The implementation must enforce a deck-size limit, cap serialized progress below Firestore's 1 MiB document limit, and explicitly handle overflow. The scheduling algorithm will be chosen and documented with the Phase 2 implementation.

Personal quizzes, practice-test history, question generation, and due-card counts are also not implemented in this phase. The Home tab displays honest placeholders instead of fabricated counts or streaks.

## Planned motivation model (Phase 5)

Streak and XP persistence are not implemented yet. The future design must define local-calendar-day and timezone-change behavior, daily goal handling, XP caps, and client-write tampering limits. Client-written XP must not be used for real-stakes rewards.

## Known limitations

- Lessons, import flows, groups, live games, spaced repetition, streaks, and XP are staged for later phases.
- The current personal-content schema continues to reuse `classes/{uid}` as a storage container; it is not a class membership relationship.
- The legacy graph data model and rules remain in Firestore for compatibility, although the app no longer exposes graph views or graph invite acceptance.
