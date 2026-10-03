# Modules domain v1

## Model

Modules live at `classes/{classId}/modules/{moduleId}` and contain owner, title (1–120 characters), description (up to 1000), order, draft/published status, up to ten attached quiz IDs, resource count (0–10), and timestamps. Resources are child documents under `resources/{resourceId}` and can be Drive, YouTube, generic HTTPS links, or plain text (up to 5000 characters). Resource ordering is explicit. There are no uploads, progress records, or completion states; files remain in the instructor's Drive. Students read published modules; class owners manage all module content.

## Link parsing and embeds

Drive links accept single files in Drive file/open/uc formats and Docs, Sheets, or Slides document links. Folder links are rejected. YouTube accepts watch, short, shorts, embed, and live links. Generic links allow HTTP(S), remove control characters, reject user information and other schemes, and are limited to 2000 characters. Only `drive.google.com`, `docs.google.com`, and `www.youtube-nocookie.com` are embeddable; generic URLs always open in a new tab. The service should render Drive and YouTube embeds through the URL builders in `links.ts` and offer an open-in-Drive fallback.

## Security and indexes

Only a class owner can create, update, or delete modules/resources. Owners can list all modules in their own class. Active members can list only published modules and read their resources only while the parent module is published. Pending, blocked, and non-members have no module access. Firestore rules validate fields and require the parent module's post-batch `resourceCount` not to exceed ten for resource mutations. Client services keep the count synchronized in the same batch. Published module queries order by `order` and use the `modules(status, order)` collection-group index.

Attached quizzes are checked by the service for matching class and owner. Reads tolerate deleted quiz references by treating them as unavailable. Quiz deletion removes its ID from linked modules on a best-effort basis.

## Known limits

Access to a Drive file depends on that file's own sharing settings, not class membership; anyone holding its link may be able to open it. School Google accounts may block “Anyone with the link” sharing. Embeds may appear blank when third-party cookies are blocked. Review `firestore.rules` and the `modules(status, order)` index before deployment. This workflow does not deploy rules or indexes.
