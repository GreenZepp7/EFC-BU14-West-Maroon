import { useEffect, useMemo, useRef, useState } from 'react'
import type { FormEvent, KeyboardEvent } from 'react'
import { useChat } from '@ai-sdk/react'
import { DefaultChatTransport } from 'ai'
import { Bot, LoaderCircle, MessageCircle, Send, X } from 'lucide-react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'

function ChatWidget() {
  const [open, setOpen] = useState(false)
  const [draft, setDraft] = useState('')
  const messagesRef = useRef<HTMLDivElement>(null)
  const transport = useMemo(() => new DefaultChatTransport({ api: '/api/chat' }), [])
  const { messages, sendMessage, status, error, clearError, stop } = useChat({ transport })
  const busy = status === 'submitted' || status === 'streaming'

  useEffect(() => {
    if (open && messagesRef.current) {
      messagesRef.current.scrollTop = messagesRef.current.scrollHeight
    }
  }, [messages, open])

  function submitMessage(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const text = draft.trim()
    if (!text || busy) return

    clearError()
    setDraft('')
    void sendMessage({ text })
  }

  function handleKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault()
      event.currentTarget.form?.requestSubmit()
    }
  }

  return <div className="ai-chat">
    {open && <section className="ai-chat-panel" aria-label="AI team chat">
      <header className="ai-chat-header">
        <span className="ai-chat-avatar"><Bot size={18} /></span>
        <div>
          <strong>Team assistant</strong>
          <small>Ask about matches and practices</small>
        </div>
        <button className="ai-chat-close" type="button" onClick={() => setOpen(false)} aria-label="Close chat">
          <X size={18} />
        </button>
      </header>

      <div className="ai-chat-messages" ref={messagesRef} role="log" aria-live="polite">
        {!messages.length && <div className="ai-chat-welcome">
          <Bot size={23} />
          <strong>How can I help?</strong>
          <p>Ask me about the upcoming team schedule.</p>
        </div>}
        {messages.map((message) => {
          const text = message.parts
            .filter((part) => part.type === 'text')
            .map((part) => part.text)
            .join('')
          if (!text) return null

          return <div key={message.id} className={`ai-chat-message ${message.role === 'user' ? 'user' : 'assistant'}`}>
            {message.role === 'assistant'
              ? <ReactMarkdown remarkPlugins={[remarkGfm]}>{text}</ReactMarkdown>
              : text}
          </div>
        })}
        {busy && <div className="ai-chat-typing"><LoaderCircle size={14} />Thinking…</div>}
        {error && <p className="ai-chat-error">{error.message}</p>}
      </div>

      <form className="ai-chat-form" onSubmit={submitMessage}>
        <textarea
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Ask about the schedule…"
          aria-label="Message the team assistant"
          rows={1}
        />
        {busy ? (
          <button type="button" onClick={() => stop()} aria-label="Stop response" className="ai-chat-send">
            <X size={17} />
          </button>
        ) : (
          <button type="submit" disabled={!draft.trim()} aria-label="Send message" className="ai-chat-send">
            <Send size={16} />
          </button>
        )}
      </form>
    </section>}

    <button
      type="button"
      className="ai-chat-launcher"
      onClick={() => setOpen((current) => !current)}
      aria-label={open ? 'Close AI chat' : 'Open AI chat'}
      aria-expanded={open}
    >
      {open ? <X size={23} /> : <MessageCircle size={23} />}
    </button>
  </div>
}

export default ChatWidget
