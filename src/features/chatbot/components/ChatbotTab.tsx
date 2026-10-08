import { useEffect, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Bot, MessagesSquare, Plus, Share2, X } from 'lucide-react'
import { Alert } from '../../../shared/ui/Alert'
import { Button } from '../../../shared/ui/Button'
import { ConfirmDialog } from '../../../shared/ui/ConfirmDialog'
import { Spinner } from '../../../shared/ui/Spinner'
import { useAuth } from '../../auth/useAuth'
import { useChatbot } from '../useChatbot'
import { useTutorSharing } from '../useTutorSharing'
import type { ChatThread } from '../types'
import { Composer } from './Composer'
import { MessageBubble } from './MessageBubble'
import { ThreadSharingPanel } from './ThreadSharingPanel'
import { ThreadList } from './ThreadList'
import '../chatbot.css'

interface ChatbotTabProps {
  /** Name of the class selected in the Learning hub, if any. */
  classLabel?: string
  /** Floating-panel layout: no desktop sidebar, fills its container, chat history always in the drawer. */
  compact?: boolean
}

/** One-tap conversation starters shown on an empty chat. Each one asks the tutor to take the lead. */
const STARTERS: Array<{ label: string; prompt: string }> = [
  { label: 'How do I use this app?', prompt: 'How do I use the Learning page in Peerly Collab? Walk me through the tabs (Canvases, Notes, Flashcards and Graph view), the AI Tutor button, and what I can do in each.' },
  { label: 'Explain a concept', prompt: 'Help me understand a concept step by step. Ask me which concept I want to start with.' },
  { label: 'Quiz me', prompt: 'Quiz me one question at a time. Ask me which topic I want to practice first.' },
  { label: 'Check my work', prompt: 'I want to check my reasoning on a problem. Ask me to share the problem and my attempt.' },
  { label: 'Plan my study time', prompt: 'Help me make a short study plan. Ask me about the subject and how much time I have.' },
]

export function ChatbotTab({ classLabel, compact = false }: ChatbotTabProps) {
  const { user } = useAuth()
  const chat = useChatbot({ uid: user?.uid, classLabel })
  const sharing = useTutorSharing(user?.uid, user?.displayName || user?.email || 'Learner', chat)
  const [searchParams] = useSearchParams()
  const selectThread = chat.selectThread
  const [listOpen, setListOpen] = useState(false)
  const [shareOpen, setShareOpen] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<ChatThread | null>(null)
  const scroller = useRef<HTMLDivElement>(null)
  const listTrigger = useRef<HTMLButtonElement>(null)
  const drawerClose = useRef<HTMLButtonElement>(null)

  const messages = chat.activeThread?.messages ?? []
  const lastMessage = messages[messages.length - 1]
  const savedThreads = chat.threads.filter((thread) => thread.messages.length > 0)
  const localThreads = savedThreads.filter((thread) => thread.sharedRole === undefined || thread.sharedRole === 'owner')
  const sharedThreads = savedThreads.filter((thread) => thread.sharedRole === 'viewer' || thread.sharedRole === 'editor')
  const viewOnly = chat.activeThread?.sharedRole === 'viewer'
  const canStart = Boolean(user) && chat.ready && !chat.configIssue && !viewOnly && !chat.isSending

  useEffect(() => {
    const requestedThread = searchParams.get('thread')
    if (chat.ready && requestedThread && chat.activeId !== requestedThread && chat.threads.some((thread) => thread.id === requestedThread)) {
      selectThread(requestedThread)
    }
  }, [chat.activeId, chat.ready, chat.threads, searchParams, selectThread])

  useEffect(() => {
    const element = scroller.current
    if (element) element.scrollTop = element.scrollHeight
  }, [messages.length, chat.isSending, chat.activeId])

  // Phone/tablet chat drawer: Escape closes it and focus moves in, then back to the button that opened it.
  useEffect(() => {
    if (!listOpen) return undefined
    const trigger = listTrigger.current
    drawerClose.current?.focus()
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') setListOpen(false)
    }
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('keydown', onKeyDown)
      trigger?.focus()
    }
  }, [listOpen])

  function startNewChat() {
    chat.newChat()
    setListOpen(false)
  }

  const chatList = savedThreads.length === 0 ? (
    <p className="m-0 p-3 text-sm text-navy-800-72">Your chats will appear here.</p>
  ) : (
    <div className="grid gap-4">
      {localThreads.length > 0 && (
        <section aria-label="Your tutor conversations" className="grid gap-2">
          {sharedThreads.length > 0 && <h3 className="m-0 px-2 text-sm font-bold text-navy-900">Your chats</h3>}
          <ThreadList threads={localThreads} activeId={chat.activeId} onSelect={(id) => { chat.selectThread(id); setListOpen(false) }} onDelete={setDeleteTarget} />
        </section>
      )}
      {sharedThreads.length > 0 && (
        <section aria-label="Shared tutor conversations" className="grid gap-2">
          <h3 className="m-0 px-2 text-sm font-bold text-navy-900">Shared with you</h3>
          <ThreadList threads={sharedThreads} activeId={chat.activeId} onSelect={(id) => { chat.selectThread(id); setListOpen(false) }} onDelete={setDeleteTarget} />
        </section>
      )}
    </div>
  )

  const subtitle = chat.activeThread?.sharedRole === 'viewer'
    ? 'You have view-only access to this shared conversation.'
    : chat.activeThread?.sharedRole === 'editor'
      ? 'You can add messages to this shared conversation.'
      : chat.activeThread?.summary
        ? 'Long chat: older messages are summarized so the tutor keeps the context.'
        : 'Ask about a concept, or attach a photo of your notes or homework.'

  const hasAlerts = Boolean(chat.configIssue || chat.error || chat.storageWarning)
  // In the floating panel the phone layout is used at every screen size.
  const lgHidden = compact ? '' : 'lg:hidden'

  return (
    <div className={compact ? 'grid h-full min-h-0' : 'grid gap-4 lg:grid-cols-[280px_minmax(0,1fr)]'}>
      {/* Desktop: chat history sidebar. Phone and tablet use the drawer inside the conversation instead. */}
      <div className={compact ? 'hidden' : 'hidden content-start gap-3 lg:grid'}>
        <Button type="button" variant="primary" onClick={chat.newChat} disabled={!user}>
          <Plus size={16} aria-hidden="true" />
          <span>New chat</span>
        </Button>
        <div id="tutor-chat-list" className="rounded-3xl border border-navy-900-12 bg-white p-2">
          {chatList}
        </div>
      </div>

      <section
        aria-label="AI tutor conversation"
        className={compact
          ? 'relative flex h-full min-h-0 min-w-0 flex-col overflow-hidden bg-white'
          : 'relative flex h-[calc(100dvh-8rem)] min-h-[30rem] min-w-0 flex-col overflow-hidden rounded-3xl border border-navy-900-12 bg-white shadow-sm lg:h-[max(760px,calc(100dvh-120px))]'}
      >
        <header className="flex items-center gap-1 border-b border-navy-900-12 px-2 py-2 sm:gap-3 sm:px-4 sm:py-3">
          <button
            ref={listTrigger}
            type="button"
            className={`tutor-header-btn ${lgHidden}`}
            aria-label={`Chats (${savedThreads.length})`}
            aria-expanded={listOpen}
            aria-controls="tutor-chat-drawer"
            onClick={() => setListOpen((open) => !open)}
          >
            <MessagesSquare size={20} aria-hidden="true" />
          </button>
          <span className="hidden size-10 shrink-0 items-center justify-center rounded-2xl bg-navy-900 text-white sm:inline-flex" aria-hidden="true">
            <Bot size={20} />
          </span>
          <div className="min-w-0 flex-1 px-1 sm:px-0">
            <h2 className="m-0 truncate text-base font-bold text-navy-900 sm:text-lg">
              {chat.activeThread && messages.length > 0 ? chat.activeThread.title : 'AI tutor'}
            </h2>
            <p className="m-0 truncate text-sm text-navy-800-72">{subtitle}</p>
          </div>
          {chat.activeThread && user && (
            <button
              type="button"
              className={`tutor-header-btn ${lgHidden}`}
              aria-label="Sharing options"
              aria-expanded={shareOpen}
              aria-controls="tutor-sharing"
              onClick={() => setShareOpen((open) => !open)}
            >
              <Share2 size={20} aria-hidden="true" />
            </button>
          )}
          <button type="button" className={`tutor-header-btn ${lgHidden}`} aria-label="New chat" onClick={startNewChat} disabled={!user}>
            <Plus size={22} aria-hidden="true" />
          </button>
        </header>

        {chat.activeThread && user && (
          <div
            id="tutor-sharing"
            className={`${shareOpen ? 'block' : 'hidden'} max-h-[50dvh] overflow-y-auto ${compact ? '' : 'lg:block lg:max-h-none lg:overflow-visible'}`}
          >
            <ThreadSharingPanel
              thread={chat.activeThread}
              uid={user.uid}
              displayName={user.displayName || user.email || 'Learner'}
              onShare={sharing.shareThread}
              error={sharing.error}
              onClearError={sharing.clearError}
            />
          </div>
        )}

        <div ref={scroller} className="tutor-log min-h-0 flex-1 overflow-y-auto overflow-x-hidden px-3 py-4 sm:p-4" role="log" aria-live="polite" aria-label="Messages">
          {!user || !chat.ready ? (
            <div className="grid place-items-center py-10">
              <Spinner label="Loading your chats" />
            </div>
          ) : messages.length === 0 ? (
            <div className="grid max-w-xl gap-4 py-4 sm:py-6">
              <div className="grid gap-2">
                <h3 className="m-0 text-2xl font-bold text-navy-900 sm:text-xl">What are you studying today?</h3>
                <p className="m-0 text-navy-900-88">
                  I can explain topics step by step, check your reasoning, and read images you attach. I can also show
                  you how to use this app. I remember everything in this chat, so you can keep building on earlier
                  answers. Start a new chat for a new topic.
                </p>
              </div>
              {!viewOnly && (
                <ul className="m-0 flex list-none flex-wrap gap-2 p-0" aria-label="Conversation starters">
                  {STARTERS.map((starter) => (
                    <li key={starter.label}>
                      <button
                        type="button"
                        className="tutor-chip"
                        disabled={!canStart}
                        onClick={() => { chat.send({ text: starter.prompt, images: [] }) }}
                      >
                        {starter.label}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          ) : (
            <ul className="m-0 grid list-none grid-cols-[minmax(0,1fr)] gap-4 p-0">
              {messages.map((message) => (
                <MessageBubble
                  key={message.id}
                  message={message}
                  canRetry={message === lastMessage
                    && message.role === 'user'
                    && !chat.isSending
                    && chat.activeThread?.sharedRole !== 'viewer'}
                  onRetry={chat.retry}
                />
              ))}
              {chat.isSending && (
                <li className="flex justify-start">
                  <div className="inline-flex items-center gap-2 rounded-3xl border border-navy-900-12 bg-white px-4 py-3 text-navy-900">
                    <Spinner label="The tutor is writing a reply" />
                    <span>Thinking…</span>
                  </div>
                </li>
              )}
            </ul>
          )}
        </div>

        {hasAlerts && (
          <div className="grid max-h-[30dvh] gap-3 overflow-y-auto px-3 pb-3 sm:px-4">
            {chat.configIssue && (
              <Alert tone="error" label="AI tutor is not set up">
                {chat.configIssue}
              </Alert>
            )}
            {chat.error && (
              <Alert
                tone="error"
                label="The tutor could not reply"
                action={
                  <Button type="button" variant="secondary" onClick={chat.dismissError}>
                    Dismiss
                  </Button>
                }
              >
                {chat.error}
              </Alert>
            )}
            {chat.storageWarning && (
              <Alert tone="warning" label="Chats are not being saved">
                This browser blocked local storage, so chats will be lost when you close or reload the page.
              </Alert>
            )}
          </div>
        )}

        <Composer
          key={chat.activeId ?? 'new'}
          disabled={!user || !chat.ready || Boolean(chat.configIssue) || chat.activeThread?.sharedRole === 'viewer'}
          busy={chat.isSending}
          allowDocuments={chat.activeThread?.sharedRole === undefined}
          onSend={chat.send}
          onStop={chat.stop}
        />

        <p className={`m-0 hidden px-4 pb-3 text-sm text-navy-800-72 ${compact ? '' : 'lg:block'}`}>
          Unshared chats stay on this device. Explicitly shared conversations sync to Peerly for invited people.
          Your messages, images and the text of any documents you add are sent to Groq to generate replies. Documents
          are read in your browser and stay on this device.
        </p>
        <details className={`px-4 pb-3 text-sm text-navy-800-72 ${lgHidden}`}>
          <summary className="flex min-h-11 cursor-pointer items-center font-semibold text-navy-800">How your chats are stored</summary>
          <p className="m-0 pb-1">
            Unshared chats stay on this device. Explicitly shared conversations sync to Peerly for invited people.
            Your messages, images and the text of any documents you add are sent to Groq to generate replies. Documents
            are read in your browser and stay on this device.
          </p>
        </details>

        {/* Phone and tablet: chat history slides over the conversation, like the Claude and Gemini apps. */}
        {listOpen && (
          <div className={`absolute inset-0 z-30 flex ${lgHidden}`} role="dialog" aria-modal="true" aria-label="Chats">
            <aside id="tutor-chat-drawer" className="tutor-drawer flex h-full w-[min(88%,20rem)] flex-col gap-3 bg-white p-3 shadow-lg">
              <div className="flex items-center justify-between gap-2">
                <h3 className="m-0 px-1 text-lg font-bold text-navy-900">Chats</h3>
                <button ref={drawerClose} type="button" className="tutor-header-btn" aria-label="Close chats" onClick={() => setListOpen(false)}>
                  <X size={20} aria-hidden="true" />
                </button>
              </div>
              <Button type="button" variant="primary" onClick={startNewChat} disabled={!user}>
                <Plus size={16} aria-hidden="true" />
                <span>New chat</span>
              </Button>
              <div className="min-h-0 flex-1 overflow-y-auto">{chatList}</div>
            </aside>
            <button type="button" className="min-w-0 flex-1 cursor-default border-0 bg-navy-900-30" aria-label="Close chats" tabIndex={-1} onClick={() => setListOpen(false)} />
          </div>
        )}
      </section>

      <ConfirmDialog
        open={Boolean(deleteTarget)}
        title="Delete this chat?"
        description={`"${deleteTarget?.title ?? 'This chat'}" and its images will be removed from this device. This cannot be undone.`}
        confirmLabel="Delete chat"
        onClose={() => setDeleteTarget(null)}
        onConfirm={() => {
          if (deleteTarget) chat.deleteThread(deleteTarget.id)
        }}
      />
    </div>
  )
}
