import { useCallback, useEffect, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import { ArrowLeft, LogIn, LogOut, MessageCircle, Send, ShieldCheck, Trash2 } from 'lucide-react'
import type { Session } from '@supabase/supabase-js'
import type { Database } from './database.types'
import { supabase } from './supabase'

type Member = Database['public']['Tables']['beta_members']['Row']
type Message = Database['public']['Tables']['beta_messages']['Row']
type MessageView = Message & { author: Pick<Member, 'display_name' | 'role'> | null }

function errorText(error: unknown) {
  return error instanceof Error ? error.message : 'Something went wrong. Please try again.'
}

function messageTime(value: string) {
  return new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(new Date(value))
}

function Messages() {
  const client = supabase
  const [session, setSession] = useState<Session | null>(null)
  const [authReady, setAuthReady] = useState(false)
  const [authBusy, setAuthBusy] = useState(false)
  const [authError, setAuthError] = useState('')
  const [member, setMember] = useState<Member | null>(null)
  const [memberChecked, setMemberChecked] = useState(false)
  const [memberAttempt, setMemberAttempt] = useState(0)
  const [memberError, setMemberError] = useState('')
  const [messages, setMessages] = useState<MessageView[]>([])
  const [messagesLoading, setMessagesLoading] = useState(false)
  const [messagesError, setMessagesError] = useState('')
  const [realtimeError, setRealtimeError] = useState('')
  const [draft, setDraft] = useState('')
  const [sending, setSending] = useState(false)
  const [deletingId, setDeletingId] = useState<number | null>(null)
  const messageListRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!client) return
    let active = true
    const { data: { subscription } } = client.auth.onAuthStateChange((_event, nextSession) => {
      if (!active) return
      setAuthError('')
      setSession(nextSession)
      setAuthReady(true)
    })

    void client.auth.getSession().then(({ data, error }) => {
      if (!active) return
      if (error) setAuthError(error.message)
      setSession(data.session)
      setAuthReady(true)
    }).catch((error: unknown) => {
      if (active) {
        setAuthError(errorText(error))
        setAuthReady(true)
      }
    })

    return () => {
      active = false
      subscription.unsubscribe()
    }
  }, [client])

  useEffect(() => {
    if (!client || !session) {
      setMember(null)
      setMemberChecked(false)
      setMemberError('')
      return
    }

    let active = true
    setMemberChecked(false)
    setMemberError('')
    void (async () => {
      try {
        const { data, error } = await client.from('beta_members')
          .select('user_id, display_name, role, active, created_at')
          .eq('user_id', session.user.id)
          .maybeSingle()
        if (!active) return
        if (error) setMemberError(error.message)
        setMember(data?.active ? data : null)
        setMemberChecked(true)
      } catch (error) {
        if (active) {
          setMemberError(errorText(error))
          setMemberChecked(true)
        }
      }
    })()

    return () => { active = false }
  }, [client, session, memberAttempt])

  const loadMessages = useCallback(async () => {
    if (!client || !member) return
    setMessagesLoading(true)
    setMessagesError('')
    try {
      const { data, error } = await client.from('beta_messages')
        .select('id, sender_id, body, created_at')
        .order('created_at', { ascending: false })
        .limit(200)
      if (error) throw error

      const rows = [...(data ?? [])].reverse()
      const senderIds = [...new Set(rows.map((message) => message.sender_id))]
      let authors: Pick<Member, 'user_id' | 'display_name' | 'role'>[] = []
      if (senderIds.length) {
        const { data: memberRows, error: memberRowsError } = await client.from('beta_members')
          .select('user_id, display_name, role')
          .in('user_id', senderIds)
        if (memberRowsError) throw memberRowsError
        authors = memberRows ?? []
      }
      const authorsById = new Map(authors.map((author) => [author.user_id, author]))
      setMessages(rows.map((message) => ({
        ...message,
        author: authorsById.get(message.sender_id) ?? null,
      })))
    } catch (error) {
      setMessagesError(errorText(error))
    } finally {
      setMessagesLoading(false)
    }
  }, [client, member])

  useEffect(() => {
    if (!client || !member) {
      setMessages([])
      return
    }

    setRealtimeError('')
    const channel = client.channel('beta-messages')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'beta_messages' }, () => {
        void loadMessages()
      })
      .subscribe((status) => {
        if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
          setRealtimeError('Live updates are unavailable. Reload the page to check for new messages.')
        } else if (status === 'SUBSCRIBED') {
          setRealtimeError('')
        }
      })
    void loadMessages()

    return () => {
      void client.removeChannel(channel)
    }
  }, [client, member, loadMessages])

  useEffect(() => {
    const list = messageListRef.current
    if (list) list.scrollTo({ top: list.scrollHeight })
  }, [messages])

  async function signIn() {
    if (!client) return
    setAuthBusy(true)
    setAuthError('')
    try {
      const { error } = await client.auth.signInWithOAuth({
        provider: 'google',
        options: { redirectTo: `${window.location.origin}/?view=messages` },
      })
      if (error) throw error
    } catch (error) {
      setAuthError(errorText(error))
      setAuthBusy(false)
    }
  }

  async function signOut() {
    if (!client) return
    setAuthError('')
    try {
      const { error } = await client.auth.signOut()
      if (error) setAuthError(error.message)
    } catch (error) {
      setAuthError(errorText(error))
    }
  }

  async function sendMessage(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const body = draft.trim()
    if (!client || !session || !member || !body || sending) return

    setSending(true)
    setMessagesError('')
    try {
      const { error } = await client.from('beta_messages').insert({
        sender_id: session.user.id,
        body,
      })
      if (error) throw error
      setDraft('')
    } catch (error) {
      setMessagesError(errorText(error))
    } finally {
      setSending(false)
    }
  }

  async function deleteMessage(messageId: number) {
    if (!client || member?.role !== 'coach' || deletingId !== null) return
    if (!window.confirm('Remove this message for everyone?')) return

    setDeletingId(messageId)
    setMessagesError('')
    try {
      const { error } = await client.from('beta_messages').delete().eq('id', messageId)
      if (error) throw error
      await loadMessages()
    } catch (error) {
      setMessagesError(errorText(error))
    } finally {
      setDeletingId(null)
    }
  }

  return <div className="messages-shell">
    <header className="topbar">
      <a className="brand" href="/" aria-label="Eastside FC season dashboard">
        <img className="brand-logo" src="/eastside-fc-wordmark.png" alt="Eastside FC" />
        <span className="brand-label"><small>Season tracker</small></span>
      </a>
      <div className="topbar-actions">
        <a className="source-link" href="/"><ArrowLeft size={14} />Season dashboard</a>
        <a className="source-link messages-tab-link active" href="/?view=messages" aria-current="page">
          <MessageCircle size={14} />Team messages <span className="beta-label">Under development</span>
        </a>
      </div>
    </header>

    <main className="messages-page">
      <section className="messages-title">
        <div>
          <div className="eyebrow"><span />PARENTS &amp; COACHES <b>·</b> BETA</div>
          <h1>Team messages</h1>
          <p>A private group space for approved parents and coaches.</p>
        </div>
        <ShieldCheck size={25} aria-hidden="true" />
      </section>

      {!client ? <section className="panel messages-access-panel">
        <h2>Messaging is not configured yet</h2>
        <p>Add <code>VITE_SUPABASE_URL</code> and <code>VITE_SUPABASE_PUBLISHABLE_KEY</code> to the environment, apply the Supabase schema, and enable Google sign-in.</p>
      </section> : !authReady ? <section className="panel messages-access-panel" role="status">
        <p>Checking sign-in…</p>
      </section> : !session ? <section className="panel messages-access-panel">
        <h2>Parent and coach access</h2>
        <p>Sign in with the Google account approved for the team. Only accounts added to the beta roster can read or send messages.</p>
        <button className="messages-primary-button" type="button" onClick={() => void signIn()} disabled={authBusy}>
          <LogIn size={16} />{authBusy ? 'Connecting…' : 'Continue with Google'}
        </button>
      </section> : !memberChecked ? <section className="panel messages-access-panel" role="status">
        <p>Checking your beta access…</p>
      </section> : memberError ? <section className="panel messages-access-panel">
        <h2>Could not check beta access</h2>
        <p>{memberError}</p>
        <button className="messages-secondary-button" type="button" onClick={() => setMemberAttempt((attempt) => attempt + 1)}>Try again</button>
        <button className="messages-secondary-button" type="button" onClick={() => void signOut()}><LogOut size={15} />Sign out</button>
      </section> : !member ? <section className="panel messages-access-panel">
        <h2>Access is pending</h2>
        <p><strong>{session.user.email ?? 'This Google account'}</strong> is signed in, but is not on the approved parent-and-coach roster yet. Ask a coach to approve this account.</p>
        <button className="messages-secondary-button" type="button" onClick={() => setMemberAttempt((attempt) => attempt + 1)}>Check access again</button>
        <button className="messages-secondary-button" type="button" onClick={() => void signOut()}><LogOut size={15} />Sign out</button>
      </section> : <>
        <section className="panel messages-panel">
          <div className="messages-panel-heading">
            <div>
              <h2>Team group</h2>
              <p>Signed in as {member.display_name} · {member.role}</p>
            </div>
            <button className="messages-secondary-button" type="button" onClick={() => void signOut()}><LogOut size={15} />Sign out</button>
          </div>
          <p className="messages-safety-note">Parents and coaches only. Keep messages team-related; don’t share sensitive information. Not monitored for emergencies.</p>
          {realtimeError && <p className="messages-inline-error" role="status">{realtimeError}</p>}
          {messagesError && <p className="messages-inline-error" role="alert">{messagesError}</p>}
          <div className="messages-list" ref={messageListRef} role="log" aria-label="Team messages" aria-live="polite">
            {messagesLoading && messages.length === 0 ? <p className="messages-empty">Loading messages…</p> :
              messages.length ? messages.map((message) => <article className={`message-item ${message.sender_id === session.user.id ? 'own' : ''}`} key={message.id}>
                <div className="message-item-heading">
                  <strong>{message.author?.display_name ?? 'Former member'}</strong>
                  <span>{message.author?.role ?? 'member'} · {messageTime(message.created_at)}</span>
                  {member.role === 'coach' && <button
                    className="message-delete-button"
                    type="button"
                    aria-label={`Delete message from ${message.author?.display_name ?? 'former member'}`}
                    title="Remove message"
                    disabled={deletingId !== null}
                    onClick={() => void deleteMessage(message.id)}
                  ><Trash2 size={13} /></button>}
                </div>
                <p>{message.body}</p>
              </article>) : <p className="messages-empty">{messagesLoading ? 'Loading messages…' : 'No messages yet. Start the conversation.'}</p>}
          </div>
          <form className="messages-compose" onSubmit={(event) => void sendMessage(event)}>
            <label className="visually-hidden" htmlFor="message-draft">Write a team message</label>
            <textarea
              id="message-draft"
              maxLength={2000}
              rows={2}
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              placeholder="Write a team message…"
              required
            />
            <button className="messages-primary-button" type="submit" disabled={!draft.trim() || sending}>
              <Send size={15} />{sending ? 'Sending…' : 'Send'}
            </button>
          </form>
          <p className="messages-character-count">{draft.length}/2000</p>
        </section>
      </>}

      {authError && <p className="messages-inline-error messages-page-error" role="alert">{authError}</p>}
      <footer className="messages-footer">
        {session && <span>Signed in as {session.user.email}</span>}
        <a href="/">Back to season dashboard</a>
      </footer>
    </main>
  </div>
}

export default Messages
