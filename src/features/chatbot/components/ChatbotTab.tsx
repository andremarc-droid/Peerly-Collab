import { useEffect, useRef, useState } from 'react'
import { Bot, MessagesSquare, Plus } from 'lucide-react'
import { Alert } from '../../../shared/ui/Alert'
import { Button } from '../../../shared/ui/Button'
import { ConfirmDialog } from '../../../shared/ui/ConfirmDialog'
import { Spinner } from '../../../shared/ui/Spinner'
import { useAuth } from '../../auth/useAuth'
import { useChatbot } from '../useChatbot'
import type { ChatThread } from '../types'
import { Composer } from './Composer'
import { MessageBubble } from './MessageBubble'
import { ThreadList } from './ThreadList'

interface ChatbotTabProps {
  /** Name of the class selected in the Learning hub, if any. */
  classLabel?: string
}

export function ChatbotTab({ classLabel }: ChatbotTabProps) {
  const { user } = useAuth()
  const chat = useChatbot({ uid: user?.uid, classLabel })
  const [listOpen, setListOpen] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<ChatThread | null>(null)
  const scroller = useRef<HTMLDivElement>(null)

  const messages = chat.activeThread?.messages ?? []
  const lastMessage = messages[messages.length - 1]
  const savedThreads = chat.threads.filter((thread) => thread.messages.length > 0)

  useEffect(() => {
    const element = scroller.current
    if (element) element.scrollTop = element.scrollHeight
  }, [messages.length, chat.isSending, chat.activeId])

  return (
    <div className="grid gap-4 lg:grid-cols-[280px_minmax(0,1fr)]">
      <div className="grid content-start gap-3">
        <div className="flex items-center gap-2">
          <Button type="button" variant="primary" className="flex-1" onClick={chat.newChat} disabled={!user}>
            <Plus size={16} aria-hidden="true" />
            <span>New chat</span>
          </Button>
          <Button
            type="button"
            variant="secondary"
            className="lg:hidden"
            aria-expanded={listOpen}
            aria-controls="tutor-chat-list"
            onClick={() => setListOpen((open) => !open)}
          >
            <MessagesSquare size={16} aria-hidden="true" />
            <span>Chats ({savedThreads.length})</span>
          </Button>
        </div>

        <div
          id="tutor-chat-list"
          className={`${listOpen ? 'block' : 'hidden'} rounded-3xl border border-navy-900-12 bg-white p-2 lg:block`}
        >
          {savedThreads.length === 0 ? (
            <p className="m-0 p-3 text-sm text-navy-800-72">Your chats will appear here.</p>
          ) : (
            <ThreadList
              threads={savedThreads}
              activeId={chat.activeId}
              onSelect={(id) => {
                chat.selectThread(id)
                setListOpen(false)
              }}
              onDelete={setDeleteTarget}
            />
          )}
        </div>
      </div>

      <section
        aria-label="AI tutor conversation"
        className="flex h-[max(80dvh,600px)] min-w-0 lg:h-[max(760px,calc(100dvh-120px))] flex-col overflow-hidden rounded-3xl border border-navy-900-12 bg-white shadow-sm"
      >
        <header className="flex items-center gap-3 border-b border-navy-900-12 px-4 py-3">
          <span className="inline-flex size-10 items-center justify-center rounded-2xl bg-navy-900 text-white" aria-hidden="true">
            <Bot size={20} />
          </span>
          <div className="min-w-0">
            <h2 className="m-0 truncate text-lg font-bold text-navy-900">
              {chat.activeThread && messages.length > 0 ? chat.activeThread.title : 'AI tutor'}
            </h2>
            <p className="m-0 text-sm text-navy-800-72">
              {chat.activeThread?.summary
                ? 'Long chat: older messages are summarized so the tutor keeps the context.'
                : 'Ask about a concept, or attach a photo of your notes or homework.'}
            </p>
          </div>
        </header>

        <div ref={scroller} className="min-h-0 flex-1 overflow-y-auto p-4" role="log" aria-live="polite" aria-label="Messages">
          {!user || !chat.ready ? (
            <div className="grid place-items-center py-10">
              <Spinner label="Loading your chats" />
            </div>
          ) : messages.length === 0 ? (
            <div className="grid max-w-xl gap-3 py-6">
              <h3 className="m-0 text-xl font-bold text-navy-900">What are you studying today?</h3>
              <p className="m-0 text-navy-900-88">
                I can explain topics step by step, check your reasoning, and read images you attach. I remember
                everything in this chat, so you can keep building on earlier answers. Start a new chat for a new topic.
              </p>
            </div>
          ) : (
            <ul className="m-0 grid list-none gap-4 p-0">
              {messages.map((message) => (
                <MessageBubble
                  key={message.id}
                  message={message}
                  canRetry={message === lastMessage && message.role === 'user' && !chat.isSending}
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

        <div className="grid gap-3 px-4">
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

        <Composer
          key={chat.activeId ?? 'new'}
          disabled={!user || !chat.ready || Boolean(chat.configIssue)}
          busy={chat.isSending}
          onSend={chat.send}
          onStop={chat.stop}
        />
        <p className="m-0 px-4 pb-3 text-sm text-navy-800-72">
          Chats are saved on this device only. Your messages and images are sent to Groq to generate replies.
        </p>
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
