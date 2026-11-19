import { useEffect, useMemo, useRef, useState } from 'react'
import type { FormEvent, KeyboardEvent } from 'react'
import { useChat } from '@ai-sdk/react'
import { DefaultChatTransport } from 'ai'
import { Bot, LoaderCircle, MessageCircle, Mic, MicOff, Send, X } from 'lucide-react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'

type SpeechRecognitionResultEvent = {
  results: ArrayLike<ArrayLike<{ transcript: string }>>
}

type SpeechRecognitionErrorEvent = {
  error: string
}

type SpeechRecognitionLike = {
  lang: string
  continuous: boolean
  interimResults: boolean
  onresult: ((event: SpeechRecognitionResultEvent) => void) | null
  onerror: ((event: SpeechRecognitionErrorEvent) => void) | null
  onend: (() => void) | null
  start: () => void
  stop: () => void
  abort: () => void
}

type SpeechRecognitionConstructor = new () => SpeechRecognitionLike
type WindowWithSpeechRecognition = Window & {
  SpeechRecognition?: SpeechRecognitionConstructor
  webkitSpeechRecognition?: SpeechRecognitionConstructor
}

function getSpeechRecognitionConstructor() {
  if (typeof window === 'undefined') return undefined
  const speechWindow = window as WindowWithSpeechRecognition
  return speechWindow.SpeechRecognition ?? speechWindow.webkitSpeechRecognition
}

function ChatWidget() {
  const [open, setOpen] = useState(false)
  const [draft, setDraft] = useState('')
  const [isListening, setIsListening] = useState(false)
  const [voiceError, setVoiceError] = useState<string | null>(null)
  const messagesRef = useRef<HTMLDivElement>(null)
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null)
  const recognitionBaseDraftRef = useRef('')
  const transport = useMemo(() => new DefaultChatTransport({ api: '/api/chat' }), [])
  const { messages, sendMessage, status, error, clearError, stop } = useChat({ transport })
  const busy = status === 'submitted' || status === 'streaming'
  const SpeechRecognition = getSpeechRecognitionConstructor()

  useEffect(() => {
    if (open && messagesRef.current) {
      messagesRef.current.scrollTop = messagesRef.current.scrollHeight
    }
  }, [messages, open])

  useEffect(() => {
    if (!open && recognitionRef.current) {
      recognitionRef.current.abort()
      recognitionRef.current = null
      setIsListening(false)
    }
  }, [open])

  useEffect(() => () => recognitionRef.current?.abort(), [])

  function toggleVoiceInput() {
    if (recognitionRef.current) {
      recognitionRef.current.stop()
      return
    }

    if (!SpeechRecognition) return

    const recognition = new SpeechRecognition()
    recognition.lang = navigator.language || 'en-US'
    recognition.continuous = false
    recognition.interimResults = true
    recognitionBaseDraftRef.current = draft.trimEnd()
    setVoiceError(null)

    recognition.onresult = (event) => {
      const transcript = Array.from(event.results, (result) => result[0]?.transcript ?? '').join('')
      setDraft([recognitionBaseDraftRef.current, transcript].filter(Boolean).join(' '))
    }
    recognition.onerror = (event) => {
      const errorMessages: Record<string, string> = {
        'audio-capture': 'No microphone was found.',
        'not-allowed': 'Microphone access was denied. Allow access and try again.',
        'service-not-allowed': 'Voice input is blocked by the browser.',
        'no-speech': 'No speech was detected. Try again.',
      }
      setVoiceError(errorMessages[event.error] ?? 'Voice input failed. Please try again.')
      setIsListening(false)
      recognitionRef.current = null
    }
    recognition.onend = () => {
      if (recognitionRef.current === recognition) recognitionRef.current = null
      setIsListening(false)
    }
    recognitionRef.current = recognition

    try {
      recognition.start()
      setIsListening(true)
    } catch {
      recognitionRef.current = null
      setIsListening(false)
      setVoiceError('Could not start voice input. Please try again.')
    }
  }

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
        <button
          type="button"
          onClick={toggleVoiceInput}
          disabled={!SpeechRecognition}
          aria-label={isListening ? 'Stop voice input' : 'Start voice input'}
          aria-pressed={isListening}
          title={!SpeechRecognition ? 'Voice input is not supported in this browser' : undefined}
          className={`ai-chat-mic${isListening ? ' listening' : ''}`}
        >
          {isListening ? <Mic size={17} /> : <MicOff size={17} />}
        </button>
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
      {(isListening || voiceError || !SpeechRecognition) && <div className={`ai-chat-voice-status${voiceError ? ' error' : ''}`} role="status" aria-live="polite">
        {voiceError || (!SpeechRecognition
          ? 'Voice input is not supported in this browser.'
          : 'Listening… Speak now, then tap the microphone to stop.')}
      </div>}
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
