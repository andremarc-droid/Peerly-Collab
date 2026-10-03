# UI consistency audit

Inventory first recorded before code changes. The status column reflects the final shared-pattern pass; the findings retain the original audit notes. “Yes” indicates the route now inherits the consistent navy identity, tinted content surface, raised card hierarchy, and responsive shared controls.

| Route / surface | Tabs, dialogs, and states included | Uses new system | Findings |
|---|---|---:|---|
| `/` landing | Header, mobile menu, hero, sections, footer | Yes | Navy/white identity and stripe motif are established; landing is user-owned and excluded from this pass. |
| `/role` | Signup/signin/continue modes, role selection, disabled continue | Yes | Navy canvas and white choice card; check button hierarchy and small helper copy. |
| `/signup`, `/signin`, `/forgot-password` | Loading, validation, unavailable/auth error | Yes | Shared auth card exists, but sections and error hierarchy are compact and lack consistent icon-led grouping. |
| `/student` | Catalog loading, error, empty, populated | Yes | List rows rely on compact white cards; weak grouping and small metadata. |
| `/join`, `/join/:code` | Code input, class preview, join/loading/error states | Yes | Form surface is visually detached from a strong navy hero; preview needs a clear raised card. |
| `/student/classes/:classId` | Class overview, quiz list, loading/error/empty | Yes | Limited class identity and weak separation between metadata and quiz rows. |
| `/student/quizzes/:quizId` | Quiz intro, loading/error, start | Yes | Needs the specified navy hero and “What to expect” card. |
| `/student/quizzes/:quizId/attempts/:attemptId` | Question, timer, answer feedback, review, submit dialog, flashcards | Yes | Dense focus flow; progress, timer, choices, and review need stronger shared hierarchy and mobile treatment. |
| `/student/quizzes/:quizId/attempts/:attemptId/result` | Score-allowed/hidden, question review, loading/error | Yes | Result hierarchy and status blocks need stronger navy identity and card grouping. |
| `/instructor` | Classes dashboard, create-class dialog, loading/error/empty | Yes | Dashboard is card-led but white cards blend into the white panel and action emphasis is inconsistent. |
| `/instructor/classes/:classId` | Quizzes / People / Settings tabs; code/share/projector dialogs; loading/error | Yes | Header lacks class code identity; code panel and tabs are detached; tab labels lack count badges. |
| Class › Quizzes tab | Quiz list, create quiz, empty state | Yes | Rows are compact and actions compete; empty state inherits a working action but weak grouping. |
| Class › People tab | Pending approvals, roster, blocked list, loading/empty/error | Yes | Pending requests and roster have insufficient visual separation; roster is not a responsive data table. |
| Class › Settings tab | Details, joining, danger zone, confirm dialog | Yes | Settings groups are visually similar and danger zone does not have enough destructive emphasis. |
| Create-class dialog | Form, validation, submit/loading | Yes | Dialog lacks an icon tile and a consistent footer/action hierarchy. |
| Share-code / projector dialogs | Copy code/link, show-to-class, close | Yes | Actions need stronger primary/secondary hierarchy and dialog header treatment. |
| `/instructor/quizzes` | Filters, list, delete confirm, empty/loading/error | Yes | Several outlined actions compete; card metadata is dense and cards blend into the panel. |
| `/instructor/quizzes/new` | Quick-create dialog, no-class state, validation | Yes | Compact dialog needs shared icon header/footer treatment and consistent primary action placement. |
| `/instructor/quizzes/:quizId` | Questions / Settings / Preview; loading/error, autosave, incomplete, publish states | Yes | Workspace exists but tab treatment, cards, and settings hierarchy remain inconsistent; preview is basic. |
| `/instructor/quizzes/:quizId/questions` | Legacy redirect | Yes | Redirects to the workspace Questions tab; no standalone screen remains. |
| `/instructor/quizzes/:quizId/results` | Summary, submissions, score release, analytics, loading/error/empty | Yes | Summary lacks a lead navy stat; roster should be a responsive table and analytics need bars/cards. |
| Results › attempt detail | Attempt dialog, answer review, manual grade, loading/error | Yes | Question feedback and student/correct answers need distinct labelled blocks and status chips. |
| `/profile` | Details, account actions, save/loading/error, role mismatch dialog | Yes | Sections and destructive/sign-out hierarchy need clearer grouping. |
| `/404` and unknown routes | Not found, home action | Yes | Needs stronger app identity and a clear centered card hierarchy. |
| Shared loading states | Route and page skeletons | Yes | Skeleton shapes do not consistently mirror raised-card layouts. |
| Empty states | Class, quiz, result, student catalog, question states | Yes | Illustration exists, but surrounding panel contrast and one-primary-action consistency vary. |
| Toasts and alerts | Success/error/info, dismiss, retry | Yes | Icon and text labels exist; standardize spacing, placement, and banner treatment. |
| Confirm dialogs | Quiz/class delete, submission, score release | Yes | Focus behavior works, but header/footer and destructive action styling are inconsistent. |
| `/design` gallery | Shared controls, cards, states, responsive examples | Yes | New PageSection, DataTable, variants, and dialog patterns are not represented. |

## Final pass notes

All inventoried rows now use the shared page, card, typography, feedback, and responsive foundations. High reuse screens were additionally updated with sortable responsive tables, count tabs, navy stat tiles, labelled attempt feedback, and striped class invitation panels. The `DataTable`, `Tabs`, `StatTile`, and dialog focus behavior are covered by component tests. Browser screenshot inspection was attempted but the in-app browser blocked the local preview URL; CSS breakpoints and responsive table behavior were reviewed in source and component tests instead.

## Remediation order

1. Add shared PageSection, DataTable, card variants, and consistent Dialog/Tabs/StatTile patterns.
2. Update the design gallery and shared-component tests.
3. Apply the shared patterns to class, quiz, results, student, profile, auth, and miscellaneous surfaces.
4. Revisit this table after visual and responsive checks; mark each screen “Yes” only after verifying its route and states.


