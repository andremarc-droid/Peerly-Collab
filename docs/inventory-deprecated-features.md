# Phase 0 Inventory: Deprecated Features and Removal Analysis

This document provides a comprehensive inventory of all code, assets, rules, Cloud Functions, and documentation for the four features slated for removal:
1. **The "Game" tab and live games feature**
2. **The "Group" tab and legacy study groups feature**
3. **The YouTube transcript import when creating decks**
4. **The photo/scan import (camera/OCR) when creating decks**

It also evaluates all shared files to prove whether they have active callers elsewhere in the codebase.

---

## 1. Feature (a): The "Game" Tab & Backend

### Routes & Navigation
- Route: `/learning/games/:gameId` in `src/app/App.tsx` (loads `GamePage.tsx` wrapped in `ProtectedRoute`, `RoleRoute`, `ToastProvider`).
- Tab: `'games'` in `LearningTab` type (`src/features/learningCanvas/library.ts`).
- Tab item in `LearningHubPage.tsx`:
  - `tabNames` array contains `'games'`.
  - `labels` record contains `games: 'Games'`.
  - Lazy import `const GamesTab = lazy(() => import('../games/GamesTab').then(...))`.
  - Tab content renderer branches on `tab === 'games'`.
- Flashcard Study Dialog:
  - `FlashcardStudyDialog.tsx`: imports `HostGameButton` from `src/features/games`, includes `'game'` in `StudyMode` union, renders "Live game" button and `<HostGameButton>`.

### Client Components, Services & Logic (`src/features/games/`)
- Directory: `src/features/games/`
  - `GamesTab.tsx`: Tab view to enter a game code or view active hosting.
  - `GamePage.tsx`: Live game view for participants and hosts.
  - `components/GameLeaderboard.tsx`: End of game leaderboard.
  - `components/GameLobby.tsx`: Lobby waiting for players to join.
  - `components/GameQuestionView.tsx`: Question answering UI during a live game.
  - `components/HostGameButton.tsx`: Launch game modal/button for a deck or lesson.
  - `components/HostGroupGame.tsx`: Group game launcher.
  - `components/JoinGameForm.tsx`: Pin entry form for joining games.
  - `useGameSession.ts`: Live listener hook for game session state.
  - `timing.ts`: Countdown timer utilities for question pacing.
  - `types.ts`: Game schema, participant, and question types.
  - `schemas.ts`: Runtime validation schemas.
  - `services.ts`: HTTPS callables invoking Cloud Functions (`createGame`, `joinGame`, `startGame`, `submitAnswer`, `advanceQuestion`, `syncGame`, `endGame`, `kickPlayer`, `deleteGame`, `cleanupGames`).
  - `index.ts`: Public barrel exporting `HostGameButton`.

### Account Deletion Integration
- `src/features/profile/accountData.ts`:
  - Imports `cleanupGames` from `../games/services`.
  - Calls `await cleanupGames()` during account deletion cascade.
- Tests:
  - `src/features/profile/accountData.games.test.ts` (dedicated test file for game cleanup in deletion).
  - `src/features/profile/accountData.groupQuiz.test.ts` (mocks `cleanupGames`).
  - `src/features/profile/accountData.lessons.test.ts` (mocks `cleanupGames`).

### Cloud Functions (`functions/src/`)
- `functions/src/liveGames.ts`: Main entrypoints for game lifecycles.
- `functions/src/gameData.ts`: Database transactions and document readers/writers.
- `functions/src/gameLogic.ts`: Scoring, streak bonuses, question progression.
- `functions/src/gameRequests.ts`: Request parsing and input validation.
- `functions/src/gameReveal.ts`: Answer reveal scheduling.
- `functions/src/index.ts`:
  - Exported callables:
    - `createGame`
    - `joinGame`
    - `startGame`
    - `submitAnswer`
    - `advanceQuestion`
    - `syncGame`
    - `endGame`
    - `kickPlayer`
    - `deleteGame`
    - `cleanupGames`

### Cloud Functions Tests
- `functions/src/liveGames.emulator.test.ts`
- `functions/src/gameLogic.test.ts`
- `functions/src/gameRequests.test.ts`

### Firestore Collections & Rules
- Collections:
  - `games/{gameId}`
  - `games/{gameId}/players/{playerId}`
  - `games/{gameId}/state/{stateId}`
  - `games/{gameId}/private/{privateId}`
  - `games/{gameId}/answers/{answerId}`
  - `gamePlayerSessions/{uid}`
  - `gameHosts/{uid}`
  - `gameCodes/{code}`
- `firestore.rules`:
  - Lines 2132–2178: rules block for `match /games/{gameId}`, `match /gamePlayerSessions/{uid}`, `match /gameHosts/{uid}`.
- `firestore.indexes.json`:
  - Field overrides for `games` (`expiresAt` TTL) and `gameCodes` (`expiresAt` TTL) (lines 210–220).
- Rules Tests:
  - `src/features/games/games.rules.test.ts`

---

## 2. Feature (b): The Legacy "Group" Tab & Backend

*Note: Classroom group quizzes (`groupQuiz*` in `functions/` and `src/features/quizzes/teams/`, `src/features/studentQuizzes/group/`) are separate educational features for class quizzes and MUST be preserved.*

### Routes & Navigation
- Tab: `'groups'` in `LearningTab` type (`src/features/learningCanvas/library.ts`).
- Tab item in `LearningHubPage.tsx`:
  - `tabNames` array contains `'groups'`.
  - `labels` record contains `groups: 'Groups'`.
  - Lazy import `const GroupsTab = lazy(() => import('../groups/GroupsTab').then(...))`.
  - Fallback tab content renders `<GroupsTab/>`.

### Client Components, Services & Logic (`src/features/groups/`)
- Directory: `src/features/groups/`
  - `GroupsTab.tsx`: Groups hub, listing groups, join modal, create group modal.
  - `joinLogic.ts`: Client join code parsing and validation.
  - `limits.ts`: Group member limits and resource sharing caps.
  - `schemas.ts`: Zod/runtime schemas for groups.
  - `services.ts`: Group callables and Firestore watchers (`createStudyGroup`, `deleteStudyGroup`, `joinStudyGroup`, `leaveStudyGroup`, `removeStudyGroupMember`, `cleanupGroups`, `shareStudyItem`, `unshareStudyItem`, `watchMyGroups`, `watchGroupMembers`, `watchGroupShares`).
  - `types.ts`: Group domain definitions.

### Client Tests
- `src/features/groups/GroupsTab.test.tsx`
- `src/features/groups/joinLogic.test.ts`
- `src/features/groups/schemas.test.ts`
- `src/features/groups/services.test.ts`
- `src/features/groups/groups.rules.test.ts`

### Class Quizzes Cross-reference
- `src/features/studentQuizzes/group/TeamEntry.tsx`:
  - Currently imports `watchMyGroups` from `../../groups/services`.
  - Provides an optional shortcut to pre-fill a team with a study group.
  - Must be decoupled so class group quiz teams don't depend on the legacy `groups` feature.

### Account Deletion Integration
- `src/features/profile/accountData.ts`:
  - Imports `cleanupGroups` from `../groups/services`.
  - Calls `await cleanupGroups()` during account deletion cascade.
- Tests:
  - `src/features/profile/accountData.games.test.ts` (mocks `cleanupGroups`).
  - `src/features/profile/accountData.groupQuiz.test.ts` (mocks `cleanupGroups`).
  - `src/features/profile/accountData.lessons.test.ts` (mocks `cleanupGroups`).

### Cloud Functions (`functions/src/`)
- `functions/src/studyGroups.ts`: Implementation of study group creation, deletion, joining, leaving, member removal, sharing snapshots, and cleanup.
- `functions/src/index.ts`:
  - Exported callables:
    - `createStudyGroup`
    - `deleteStudyGroup`
    - `previewStudyGroup`
    - `joinStudyGroup`
    - `leaveStudyGroup`
    - `removeStudyGroupMember`
    - `cleanupStudyGroups`
    - `shareStudyItem`
    - `unshareStudyItem`

### Firestore Collections & Rules
- Collections:
  - `groups/{groupId}`
  - `groups/{groupId}/members/{memberUid}`
  - `groups/{groupId}/shares/{shareId}`
  - `groups/{groupId}/sharedContent/{shareId}`
  - `users/{uid}/groupState/{stateId}`
  - `users/{uid}/groupMemberships/{groupId}`
  - `learningInviteCodes/{code}` (where `kind == 'group'`)
- `firestore.rules`:
  - Lines 1792, 1798, 1805–1811: `learningInviteCodes` references to `group`.
  - Lines 1814–1901: `match /groups/{groupId}` and subcollections.
  - Lines 1903–1913: `match /users/{uid}/groupState/{stateId}`, `match /users/{uid}/groupMemberships/{groupId}`, `match /{path=**}/groupMemberships/{groupId}`.
- `firestore.indexes.json`:
  - Lines 145–151: Collection group index for `groupMemberships` (`uid ASC, joinedAt DESC`).

---

## 3. Feature (c): YouTube Link Import for Flashcard Decks

### UI & Creation Flow
- `src/features/flashcards/create/CreateLearningFlow.tsx`:
  - Source type `'youtube'` in `SourceType` union.
  - State variables: `youtubeUrl`, `youtubeBusy`, `youtubeError`.
  - Method: `fetchYoutube()`.
  - Input section rendering YouTube URL input and "Fetch transcript" button.
  - Imports `isSupportedYoutubeUrl`, `normalizeYoutubeUrl`, `requestYoutubeTranscript` from `../youtubeTranscript`.
- `src/features/flashcards/create/CreateLearningFlow.test.tsx`:
  - Tests for YouTube URL error handling and transcript mocking.

### Client Services & Logic
- `src/features/flashcards/youtubeTranscript.ts`:
  - Validation: `isSupportedYoutubeUrl`, `normalizeYoutubeUrl`.
  - Service: `requestYoutubeTranscript(url)` invoking `fetchYoutubeTranscript` callable.
- Client Tests:
  - `src/features/flashcards/youtubeTranscript.test.ts`
  - `src/features/flashcards/youtubeTranscript.rules.test.ts`

### Cloud Functions (`functions/src/`)
- `functions/src/youtubeTranscript.ts`:
  - `fetchTranscriptForUser()`
  - `youtubeTimedTextProvider`
  - Quota checking on `youtubeTranscriptRateLimits/{uid}`
- `functions/src/youtubeTranscript.test.ts`:
  - Unit tests for transcript parser and timed text fetcher.
- `functions/src/index.ts`:
  - Exported callable: `fetchYoutubeTranscript`.

### Firestore Collections & Rules
- Collection:
  - `youtubeTranscriptRateLimits/{uid}`
- `firestore.rules`:
  - Line 1783: `match /youtubeTranscriptRateLimits/{uid} { allow read, write: if false; }`

---

## 4. Feature (d): Photo/Scan Import for Flashcard Decks

### UI & Creation Flow
- `src/features/flashcards/create/CreateLearningFlow.tsx`:
  - Source type `'photo'` in `SourceType` union.
  - State variables: `photoBusy`, `photoErrors`.
  - Method: `transcribePhotos(files: File[])`.
  - File picker: `<input type="file" accept="image/jpeg,image/png,image/webp" multiple ... />`.
  - Inline prompt sending images to Groq via `aiComplete()`.
  - Dynamically imports `prepareChatImages` from `src/features/chatbot/images`.

---

## 5. Verification of Shared Files (Caller Audit)

The instructions require proving whether any shared file has remaining users before deciding whether to delete or keep it.

### File 1: `src/features/canvas/imageProcessing.ts`
- **Imports search query:** `imageProcessing`
- **Active callers found:**
  1. `src/features/learningCanvas/LearningCanvas.tsx`: Used for image upload, dimension calculation, and canvas image node rendering.
  2. `src/features/learningCanvas/components/nodes/ImageCard.tsx`: Used for image sizing and processing in spatial canvas nodes.
  3. `src/features/chatbot/sharedThreadService.ts`: Used for thread image attachment handling.
  4. `src/features/chatbot/contextBuilder.ts`: Used for image token estimation.
- **Verdict: MUST BE KEPT.** Essential shared utility with multiple non-deprecated callers.

### File 2: `src/features/chatbot/images.ts`
- **Imports search query:** `chatbot/images` or `prepareChatImages`
- **Active callers found:**
  1. `src/features/chatbot/components/Composer.tsx` (Line 8, 45): AI Tutor composer handles user-uploaded images for chat queries.
  2. `src/features/chatbot/components/Composer.test.tsx`: Unit tests for chat image attachment.
  3. `src/features/chatbot/images.test.ts`: Unit tests for chat image processing.
  4. `src/features/flashcards/create/CreateLearningFlow.tsx` (Line 110): Only used in `transcribePhotos`.
- **Verdict: MUST BE KEPT.** Once `transcribePhotos` in `CreateLearningFlow.tsx` is removed, `images.ts` remains actively and critically used by the AI Tutor (`Composer.tsx`).

### File 3: `src/features/quizzes/teams/` & `src/features/studentQuizzes/group/`
- **Active callers:** Core classroom group quiz feature for instructor-led quizzes.
- **Verdict: MUST BE KEPT.** Only the shortcut dependency in `TeamEntry.tsx` to `groups/services.ts` will be severed.

### File 4: `src/features/flashcards/youtubeTranscript.ts`
- **Active callers:** Only `CreateLearningFlow.tsx` and its own test files. Zero remaining callers outside the deprecated feature.
- **Verdict: SAFE TO DELETE.**

---

## 6. Documentation and AGENTS.md Updates Needed
- `AGENTS.md`: Remove mentions of live games host speed bonus/controls in games, and any legacy group tabs. Keep classroom group quiz information intact.
- `docs/learning-domain.md`: Remove sections describing the YouTube Cloud Function, timed-text endpoints, quota collections, and photo transcription.
- `docs/learning-rework-prompt.md`: Note deprecation and removal of YouTube import and photo/scan import.

---

## 7. Migration & Legacy Data Strategy
- Legacy Decks created from YouTube or photo scans: Flashcard deck documents store arrays of `{ front, back }` cards. Once created, they are standard flashcard decks with no operational dependency on YouTube or photo APIs. They continue to load and study normally with zero data loss.
- Legacy `games` and `groups` documents:
  - Client code will safely ignore them.
  - A dry-run CLI cleanup script (`scripts/cleanup-deprecated-collections.ts`) will be provided, defaulting to safe dry-run mode and requiring `--apply` and explicit emulator connection or project checks before performing batch deletions.
