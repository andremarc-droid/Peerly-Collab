# Security Rules Review & Hardening Pass

This document details the security hardening updates applied to `firestore.rules`, the specific attacks and threats mitigated, the remaining architectural limits, and a production deployment checklist.

---

## 1. Rule Changes & Attacks Prevented

### 1.1 Class Code Hijacking (`classCodes/{code}`)
* **Rule Change**:
  * Split `allow create, update` into separate operations.
  * `create` retains validation ensuring the join code does not yet exist (`!exists(...)`) and references a valid class owned by `request.auth.uid`.
  * `update` now explicitly requires `resource.data.ownerId == request.auth.uid && resource.data.classId == request.resource.data.classId`.
* **Attacks Prevented**:
  * **Class Code Takeover**: Previously, an instructor could overwrite another instructor's `classCodes/{code}` projection by generating or intentionally guessing an existing code during class creation. With the split rule, attempting to create a class with a code that already exists fails in the batch write.
  * **Direct Document Tampering**: Instructor B cannot update Instructor A's class code document directly.
  * **Class Re-pointing**: An owner cannot modify `classId` on an existing code projection to redirect an active code to a different class.

### 1.2 Attempt Quotas & Integrity (`quizzes/{quizId}/participants/{uid}` & `attempts/{attemptId}`)
* **Rule Change**:
  * On `participants/{uid}` update where `activeAttemptId` transitions from `null` to a new attempt ID:
    * Enforces `quiz.settings.attemptsAllowed == null || request.resource.data.attemptCount <= quiz.settings.attemptsAllowed`.
  * On `attempts/{attemptId}` create:
    * Enforces `request.resource.data.attemptNumber == getAfter(/databases/$(database)/documents/quizzes/$(quizId)/participants/$(request.auth.uid)).data.attemptCount`.
* **Attacks Prevented**:
  * **Bypassing Attempt Limits**: Students attempting to circumvent UI restrictions by issuing raw Firestore batch writes could previously create unlimited attempts or inflate `attemptCount` past `attemptsAllowed`.
  * **Desynchronized Attempt Records**: Students cannot create orphan attempt documents or forge `attemptNumber` independently of their participant record.

### 1.3 Time Integrity (`quizzes/{quizId}/attempts/{attemptId}`)
* **Rule Change**:
  * On `attempts/{attemptId}` create:
    * Requires `request.resource.data.startedAt == request.time`.
  * On `attempts/{attemptId}` update setting `status` to `'submitted'`:
    * If `settings.timeLimitMinutes != null`, requires:
      `request.time <= resource.data.startedAt + duration.value(settings.timeLimitMinutes * 60 + 120, 's')`.
* **Attacks Prevented**:
  * **Backdated Start Times**: Students cannot fabricate a past `startedAt` timestamp to bypass timers or manipulate duration reporting.
  * **Late Submissions**: In timed quizzes, submissions made after the allocated duration plus a 120-second network grace period are rejected at the database level.
  * **Untimed Compatibility**: Quizzes without a time limit (`timeLimitMinutes == null`) remain unconstrained.
  * *Note on Client Behavior*: The client timer triggers auto-submission immediately when the countdown reaches 0 (`timeLimitMinutes * 60` seconds), well within the 120-second grace window, preventing false denials caused by ordinary network jitter.

### 1.4 Module Resource URL Restrictions (`validResource`)
* **Rule Change**:
  * For type `'drive'`: URL must match `^https://(drive|docs)\.google\.com/.*`.
  * For type `'youtube'`: URL must match `^https://(www\.)?(youtube\.com|youtu\.be|youtube-nocookie\.com)/.*`.
  * For type `'link'`: URL must be a valid HTTPS URL (`^https://[^ ]+$`).
* **Attacks Prevented**:
  * **Lookalike Domain Phishing**: Previously, prefix checks like `url.matches('https://drive.google.com')` could match attacker domains such as `https://drive.google.com.attacker.com/malware`. The strict regular expression boundary prevents spoofing.
  * **Dangerous Schemes**: Prevents injection of `javascript:`, `data:`, or `http:` schemes in embedded resources.

### 1.5 Profile User Enumeration (`publicProfiles/{uid}`)
* **Rule Change**:
  * Changed `allow read: if signedIn();` to:
    * `allow get: if signedIn();`
    * `allow list: if false;`
* **Attacks Prevented**:
  * **Bulk Profile Scraping / Enumeration**: Any signed-in user could previously run a collection query on `publicProfiles` and harvest all student and instructor display names, roles, and avatar URLs. Direct document lookups (`get`) by UID remain allowed for displaying collaborator profiles.

### 1.6 Size Caps & DoS Prevention
* **Rule Change**:
  * `quizzes/{quizId}`: `title` <= 200 chars, `description` <= 2000 chars, `tags` list <= 20 items.
  * `quizzes/{quizId}/questions/{questionId}`: `prompt` <= 2000 chars, option `text` <= 500 chars (checked via helper across bounded options).
  * `quizzes/{quizId}/attempts/{attemptId}`: `answers` map <= 200 keys.
  * `enrollments/{classId}_{uid}`: `studentName` <= 120 chars, `studentPhotoURL` <= 2000 chars.
* **Attacks Prevented**:
  * **Payload Flooding / Resource Exhaustion**: Malicious clients sending multi-megabyte payloads to exhaust client rendering performance or inflate Firestore storage and bandwidth costs.
  * **Client Synchronization**: Form validators and schemas (`schemas/index.ts`, `questionDraft.ts`, `validation.ts`, `ClassPage.tsx`, `ProfilePage.tsx`) enforce identical limits with user-friendly error messages before reaching Firestore rules.

---

## 2. Known Remaining Limitations

1. **Client-Side Grading and Answer Key Visibility**:
   * *Status*: In v1, attempt grading occurs in the browser.
   * *Risk*: Answer keys are readable by enrolled participants who start an attempt. A determined student using browser Developer Tools can inspect answer keys during quiz taking or submit forged result grades if writing to results directly.
   * *Mitigation Plan*: Transition `gradeAttempt` and results creation to a trusted Cloud Function / backend service with Firestore Admin SDK privileges in v2.
2. **Question Exposure Prior to Attempt**:
   * *Status*: Questions for published quizzes are readable by any student actively enrolled in the quiz's class.
   * *Risk*: Students can query and review questions before initiating their official attempt timer.
   * *Mitigation Plan*: Secure questions behind an attempt-session Cloud Function or expose questions progressively as attempts advance.
3. **Client-Side Join Lookup Throttling**:
   * *Status*: Failed class code lookup throttling (5 failed attempts per 10 minutes) is tracked in-memory in the browser.
   * *Risk*: A client can bypass the cooldown by clearing memory, refreshing the tab, or issuing direct Firestore requests.
   * *Mitigation Plan*: Rate-limit join code lookups using Firebase App Check, Cloud Functions with Redis/Firestore counters, or Cloud Armor.
4. **Self-Selected Roles**:
   * *Status*: Users choose `student` or `instructor` during onboarding, and this role is written to `publicProfiles` and `users/{uid}`.
   * *Risk*: Students can sign up as instructors to create arbitrary classes and quizzes.
   * *Mitigation Plan*: Verify instructor roles via Firebase Auth custom claims set by administrative approval or single sign-on (SSO) email domain checks.

---

## 3. Production Deployment Checklist

- [ ] **Verification**:
  - [ ] TypeScript check passes: `npm run typecheck` (`tsc -b`).
  - [ ] Linter check passes: `npm run lint` (`oxlint`).
  - [ ] Emulator test suite passes (all tests passing):
    ```powershell
    $env:JAVA_HOME='C:\Program Files\Eclipse Adoptium\jdk-21.0.2.13-hotspot'; $env:PATH="$env:JAVA_HOME\bin;$env:PATH"; $env:XDG_CONFIG_HOME='node_modules/.cache/firebase-cli-config'; npx firebase emulators:exec --only auth,firestore --project demo-peerly-collab "npx vitest run --maxWorkers=1"
    ```
  - [ ] Production build succeeds: `npm run build`.
- [ ] **Rules & Indexes Deployment**:
  - [ ] Deploy Firestore rules to Firebase: `firebase deploy --only firestore:rules`
  - [ ] Deploy Firestore composite indexes: `firebase deploy --only firestore:indexes`
- [ ] **Application Deployment**:
  - [ ] Deploy built web application artifacts (`dist/`) to hosting provider.
- [ ] **Post-Deploy Smoke Test**:
  - [ ] Create a class as an instructor and verify join code generation.
  - [ ] Verify rotating a class code generates a new lookup and updates the class.
  - [ ] Join the class as a student and confirm enrollment transitions.
  - [ ] Start and submit a timed quiz attempt within the time limit.
  - [ ] Attempt to submit a quiz attempt after expiration (+ 120s grace) and confirm permission denial.
  - [ ] Check Firebase Console / Google Cloud Operations logs for unexpected `PERMISSION_DENIED` errors.
