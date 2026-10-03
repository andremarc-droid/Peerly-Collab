# Classroom domain v1

## Records

- `classes/{classId}` is the instructor-owned source of truth for class details, the six-character join code, join settings, lifecycle state, and a theme pattern accent. Member counts are never stored on this document.
- `classCodes/{CODE}` is a direct-get-only lookup projection for class previews. It is not authoritative; enrollment rules compare the submitted code and join state to the current class document.
- `enrollments/{classId}_{uid}` is the canonical membership record. `active` grants access to published class quizzes, `pending` waits for instructor approval, and `blocked` prevents the student from recreating the document.
- New `quizzes/{quizId}` records include `classId`. Legacy records without it parse as unassigned, remain in the owner's library, and cannot be published. Class reassignment is restricted to drafts and active classes of the same instructor.

## Join flow

Join codes use `ABCDEFGHJKMNPQRSTUVWXYZ23456789`; generation uses `crypto.getRandomValues` with rejection sampling to avoid modulo bias. Input normalization uppercases and removes spaces and hyphens. A student first reads one `classCodes/{CODE}` document for its preview, then writes `enrollments/{classId}_{uid}`. The lookup can be stale or forged, so Firestore rules re-check that the current class is active, joining is enabled, the code still matches, and the student's profile role is `student`. Approval-required classes create `pending` records; others create `active` records. The signed-in student can read their own enrollment to distinguish active, pending, and blocked states.

Five failed lookups in ten minutes start a ten-minute in-memory client cooldown. This is a deterrent only and is reset by a successful lookup; it is not a security boundary.

## Access rules and query behavior

Class reads are limited to the owner and active members. A direct class-code lookup is signed-in-only and listing the code index is denied. Enrollment writes use the deterministic document ID; only students create their own enrollment, while class owners manage statuses or remove records. Owners should list enrollments with both `ownerId == currentUid` and `classId == requestedClassId`; students list their own records with `uid == currentUid`. Those filters make each query provable by Firestore rules, which are not filters.

Students query published quizzes with both `classId == requestedClassId` and `status == 'published'`. Rules additionally require an active enrollment in that quiz's class. Questions, answer keys, attempts, and results retain their quiz-level owner access; student access now also requires that membership. `classCodes` previews do not grant class or quiz access.

`firestore.indexes.json` includes indexes for instructor class lists, owner enrollment rosters and counts, student enrollment lists, owner class quiz lists/counts, and published quizzes within a class. No member counters are maintained by clients; services use `getCountFromServer`.

## Limits

Join-code throttling is in-memory per browser session and can be bypassed. The rules remain the security boundary. Quiz grading still happens in the browser, so a determined participant can inspect answer keys they are permitted to read; move grading behind a trusted server before using this for high-stakes assessments. Class cascade deletion removes class enrollments and the class's quizzes and quiz subcollections in bounded batches, but it is intentionally irreversible.
