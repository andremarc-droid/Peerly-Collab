# Peerly Collab

Peerly Collab is a collaborative quiz platform for effective learning. Start the Vite development server with `npm run dev` after creating a local `.env` from `.env.example` and providing Firebase settings. Missing Firebase settings fail with a clear error when Firebase modules are imported.

Run `npm run typecheck`, `npm run lint`, `npm run test`, and `npm run build` to check the project. Start local Firebase Auth and Firestore emulators with `npm run emulators`; this uses the isolated `demo-peerly-collab` project id.

Firebase Functions live in `functions/` and require Node.js 22. Local Auth, Firestore, and Functions emulators are available through `npm run emulators` (which builds the functions first). Deploy graph deletion with `npx firebase deploy --only functions:deleteSharedGraph` after selecting the intended Firebase project; deployment builds the TypeScript function automatically. Functions deployment requires a billing-enabled Firebase project. Graph deletion runs server-side, scans matching invite codes in 500-document pages, and recursively deletes the graph's collaboration records; Firestore operation costs depend on the amount of saved collaboration data.
