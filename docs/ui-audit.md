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
| `CanvasBuilderPage` | Board, side panel, toolbar, connect cards dialog, unsaved changes / directed mode confirm dialogs, loading/error states | Yes | Inherits navy PageHeader, 8px-grid spacing, 44px toolbar actions, theme status feedback with icon and label, double focus rings on cards, and accessible dialog alternatives. |
| `CanvasPlayPage` | Interactive play board, touch/keyboard accessible connect cards dialog, live connection counter, connection removal list, empty/loading states | Yes | Full-height responsive board clamp, accessible list companion with labelled card pairs, 44px buttons, clear focus states, and sanitization guard. |
| `CanvasReviewView` | Review board, edge status badges, summary count pills, accessible companion list breakdown, explanation banner | Yes | Review statuses consistently use icon, text label, and theme tokens (correct, incorrect, missed); avoids reliance on color alone; accessible companion list is synchronized. |
| Student canvas quiz intro (`/student/quizzes/:quizId`) | Mode kicker, expect-list items (connect cards, card count, penalty policy), time limit, loading/unavailable states | Yes | Distinct 'CANVAS PRACTICE' PageHeader kicker, icon-led expectation cards, transparent penalty and points policy, and prominent 44px start action. |
| Student canvas quiz result (`/student/quizzes/:quizId/attempts/:attemptId/result`) | Score ring, canvas diff review, explanation banner, late submission warning, status chips | Yes | Integrated CanvasReviewView with question score breakdown, non-color-only status badges (CircleCheck/CircleX with Correct/Needs practice label and points), and navy identity. |
| `StudentModulePage` (`/student/classes/:classId/modules/:moduleId`) | Breadcrumbs, description, resources list, embedded previews, attached quizzes with independent loading, unavailable vs. load error states | Yes | Independent skeleton and error states per section; confirmed unavailable renders back link without Retry; network errors show neutral message with Retry; Drive fallback message and icons per kind. |
| Student class page › Modules section | Published module list, resource & quiz count metadata, loading skeletons, independent error alert with Retry, empty state | Yes | Independent subscription isolated from quizzes list; DataCard rows with 44px Open button; empty state renders only after snapshot confirmation. |
| Instructor class page › Modules tab | Module list with status badges, drag/reorder, more actions dropdown (open, duplicate, publish/unpublish, move, delete), new module dialog, confirm delete | Yes | DataCard module rows with icon tiles and metadata; accessible dropdown menu actions with keyboard navigation; Delete ConfirmDialog; empty and loading skeletons. |
| `ModuleWorkspacePage` (`/instructor/classes/:classId/modules/:moduleId`) | Header autosave title/description, resource list, attached quizzes picker, sticky publish bar, undo delete toast | Yes | Responsive PageHeader; 44px touch targets; debounced autosave with explicit status indicator; kind-specific Drive icons; sticky navy publish bar with high-contrast text. |
| Resource editor dialog | Resource type selector (Drive, YouTube, Link, Note), URL input, title input, live test preview, Drive sharing hint | Yes | Dialog with icon tiles; 44px switch buttons; clear Drive viewer sharing hint; live sandboxed preview; HTTPS validation; programmatic labels and error messages. |

## Final pass notes

All inventoried rows now use the light-first balance rules, shared page headers, card hierarchy, typography, feedback states, and responsive foundations. High reuse screens use sortable responsive tables, count tabs, unstriped navy stat tiles, labelled attempt feedback, and clean light class invitation panels with hero monospace codes (stripes strictly confined to the header band). The `DataTable`, `Tabs`, `StatTile`, `Button`, `Alert`, `EmptyState`, and dialog focus behavior are covered by component tests. Browser screenshot inspection was attempted but the in-app browser blocked the local preview URL; CSS breakpoints and responsive table behavior were reviewed in source and component tests instead.

## Remediation order

1. Add shared PageSection, DataTable, card variants, and consistent Dialog/Tabs/StatTile patterns.
2. Update the design gallery and shared-component tests.
3. Apply the shared patterns to class, quiz, results, student, profile, auth, and miscellaneous surfaces.
4. Revisit this table after visual and responsive checks; mark each screen “Yes” only after verifying its route and states.
