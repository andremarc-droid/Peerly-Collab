/**
 * Short "how to use the Learning page" guide for the AI tutor.
 *
 * It is added to the system prompt ONLY when the learner is asking how to use the app, because the tutor
 * runs on a tight token budget (see constants.ts). Keep it compact and update it when the Learning UI changes.
 */
export const APP_GUIDE = [
  'APP GUIDE for Peerly Collab, Learning page. Use it to answer questions about how to use the app. Give short numbered steps naming the exact buttons and tabs. If a detail is not covered here, say you are not sure and point to the nearest tab instead of inventing a feature.',
  'Tabs at the top of Learning: Canvases, Notes, Flashcards, Graph view. The AI Tutor is not a tab: it is the round "AI Tutor" button at the bottom-right of the screen. The "Import .canvas" button (top right) imports a JSON Canvas file as a new canvas. The invite-code box (top right) opens something someone shared with you, such as a canvas, note, graph or tutor chat.',
  'Canvases: a canvas is a visual whiteboard of cards and connections. Students see "From your instructors" (published boards: "View board" or "Save copy" to get an editable copy) and "My study canvases". Press "New Canvas" to make one and "Open canvas" to edit it. "Share" creates an invite code. The ⋮ menu has Rename, Export (.canvas) and Delete. Instructors also get Duplicate and "Publish to learners" or "Unpublish (make draft)"; only published canvases are visible to students.',
  'Notes: write study notes (students) or concept notes (instructors). Every note also appears as a node in the Graph view, and "View in graph" jumps there.',
  'Flashcards: create decks and cards by hand, or use the AI generate panel to make cards from your own text, notes, modules, or an imported PDF, DOCX or TXT document.',
  'Graph view: a knowledge graph of your notes, canvases, modules and quizzes. Use the search box and the Notes/Canvases/Modules/Quizzes chips to filter. "Add Node" creates a note or canvas; link two nodes with the connect tool (the link icon); drag a node to move it and it stays where you put it. Toolbar: zoom in/out, "Reset view" (center and reset zoom), Full screen (Esc exits), and auto-arrange. "Share graph" makes an invite code with "View only" or edit access and a code expiry; collaborators and the activity history appear in a side panel. "My graph", "Create new graph view" and "Import from class" manage graph views.',
  'AI Tutor: chat to learn a topic. Attach up to 2 images or 2 documents (PDF, DOCX, TXT) with the paperclip in the message box. Chats are saved on this device. "New chat" starts a fresh topic. Share a conversation from the sharing options. Open it from the round AI Tutor button at the bottom-right of the screen, on any tab.',
].join('\n')

const HELP_INTENT = /\b(how (do|can|should|would|to)|how does|where (do|can|is|are)|what (is|are|does)|can i|is there a way|steps?|guide|tutorial|walk me through|show me|explain)\b/i
const APP_TERMS = /\b(canvas(es)?|board|notes?|flashcards?|decks?|graph( view)?|knowledge graph|node|nodes|ai tutor|tutor|invite|share|sharing|import|export|publish|unpublish|modules?|quizzes|quiz|learning (page|tab|hub)|this (app|page|tab)|the app|peerly|toolbar|full ?screen|minimap|collaborat\w*)\b/i
const APP_ONLY = /\b(peerly|this app|the app|learning (page|tab|hub)|how to use|how do i use)\b/i

/** True when the text looks like a question about using the app (not about a school subject). */
export function isAppHelpQuestion(text: string): boolean {
  const value = text.trim()
  if (!value) return false
  if (APP_ONLY.test(value)) return true
  return HELP_INTENT.test(value) && APP_TERMS.test(value)
}

/**
 * Looks at the most recent learner messages, so a follow-up such as "and how do I share it?" keeps the guide.
 * `texts` must be ordered oldest to newest and contain learner messages only.
 */
export function wantsAppGuide(texts: string[], lookback = 2): boolean {
  return texts.slice(-lookback).some(isAppHelpQuestion)
}
