import { useCallback, useEffect, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import { ArrowLeft, LogIn, LogOut, MessageCircle, Send, ShieldCheck, Trash2 } from 'lucide-react'
import type { Session } from '@supabase/supabase-js'
import type { Database } from './database.types'
import { supabase } from './supabase'

type Member = Database['public']['Tables']['beta_members']['Row']
type MemberAccess = Pick<Member, 'user_id' | 'display_name' | 'role' | 'active' | 'created_at'>
type Message = Database['public']['Tables']['beta_messages']['Row']
type MessageView = Message & { author: Pick<Member, 'display_name' | 'role'> | null }
type PushStatus = 'checking' | 'unsupported' | 'off' | 'on' | 'denied' | 'error'
const memberRoles: Member['role'][] = ['parent', 'coach', 'player']

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

function decodeVapidPublicKey(value: string) {
  const padding = '='.repeat((4 - value.length % 4) % 4)
  const base64 = (value + padding).replace(/-/g, '+').replace(/_/g, '/')
  return Uint8Array.from(atob(base64), (character) => character.charCodeAt(0))
}

function isIosDevice() {
  return /iPhone|iPad|iPod/.test(navigator.userAgent)
    || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
}

function isInstalledApp() {
  return window.matchMedia('(display-mode: standalone)').matches
    || (navigator as Navigator & { standalone?: boolean }).standalone === true
}

async function savePushSubscription(client: NonNullable<typeof supabase>, userId: string, subscription: PushSubscription) {
  const keys = subscription.toJSON().keys
  if (!keys?.p256dh || !keys.auth) throw new Error('The browser returned an incomplete push subscription.')

  const { error } = await client.from('beta_push_subscriptions').upsert({
    user_id: userId,
    endpoint: subscription.endpoint,
    p256dh: keys.p256dh,
    auth: keys.auth,
  }, { onConflict: 'user_id,endpoint' })
  if (error) throw error
}

async function removePushSubscription(
  client: NonNullable<typeof supabase>,
  userId: string,
  subscription: PushSubscription,
) {
  await subscription.unsubscribe()
  const { error } = await client.from('beta_push_subscriptions')
    .delete()
    .eq('user_id', userId)
    .eq('endpoint', subscription.endpoint)
  if (error) throw error
}

function Messages() {
  const client = supabase
  const [session, setSession] = useState<Session | null>(null)
  const [authReady, setAuthReady] = useState(false)
  const [authBusy, setAuthBusy] = useState(false)
  const [authError, setAuthError] = useState('')
  const [member, setMember] = useState<MemberAccess | null>(null)
  const [memberChecked, setMemberChecked] = useState(false)
  const [memberAttempt, setMemberAttempt] = useState(0)
  const [memberError, setMemberError] = useState('')
  const [pushStatus, setPushStatus] = useState<PushStatus>('checking')
  const [pushError, setPushError] = useState('')
  const [rosterAdmin, setRosterAdmin] = useState(false)
  const [showRoster, setShowRoster] = useState(false)
  const [roster, setRoster] = useState<Member[]>([])
  const [rosterLoading, setRosterLoading] = useState(false)
  const [rosterError, setRosterError] = useState('')
  const [rosterActionId, setRosterActionId] = useState<string | null>(null)
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

  useEffect(() => {
    if (!client || !session || !member) {
      setPushStatus('off')
      setPushError('')
      return
    }

    if (!window.isSecureContext || !('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) {
      setPushStatus('unsupported')
      return
    }

    let active = true
    setPushStatus('checking')
    setPushError('')
    void (async () => {
      const registration = await navigator.serviceWorker.register('/sw.js')
      const subscription = await registration.pushManager.getSubscription()
      if (!active) return

      if (Notification.permission === 'denied') {
        setPushStatus('denied')
      } else if (subscription && Notification.permission === 'granted') {
        await savePushSubscription(client, session.user.id, subscription)
        if (active) setPushStatus('on')
      } else {
        setPushStatus('off')
      }
    })().catch((error: unknown) => {
      if (active) {
        setPushError(errorText(error))
        setPushStatus('error')
      }
    })

    return () => { active = false }
  }, [client, member, session])

  const loadRoster = useCallback(async (accessToken: string) => {
    const response = await fetch('/api/admin-members', {
      headers: { Authorization: `Bearer ${accessToken}` },
    })
    if (response.status === 403) {
      setRosterAdmin(false)
      setShowRoster(false)
      return
    }
    const result = await response.json() as { error?: string; members?: Member[] }
    if (!response.ok) throw new Error(result.error ?? 'Could not load the admin panel.')
    setRosterAdmin(true)
    setRoster(result.members ?? [])
  }, [])

  useEffect(() => {
    if (!session) {
      setRosterAdmin(false)
      setShowRoster(false)
      setRoster([])
      setRosterError('')
      return
    }

    let active = true
    setRosterLoading(true)
    setRosterError('')
    void loadRoster(session.access_token).catch((error: unknown) => {
      if (active) setRosterError(errorText(error))
    }).finally(() => {
      if (active) setRosterLoading(false)
    })
    return () => { active = false }
  }, [session, loadRoster])

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

  async function enablePushNotifications() {
    if (!client || !session || !member) return
    setPushError('')

    if (isIosDevice() && !isInstalledApp()) {
      setPushError('On iPhone or iPad, add this site to your Home Screen and open the installed app first. Web push requires iOS 16.4 or newer.')
      return
    }

    const publicKey = import.meta.env.VITE_VAPID_PUBLIC_KEY?.trim()
    if (!publicKey) {
      setPushError('Push notifications are not configured on this site yet.')
      return
    }

    setPushStatus('checking')
    try {
      const permission = Notification.permission === 'granted'
        ? 'granted'
        : await Notification.requestPermission()
      if (permission !== 'granted') {
        setPushStatus(permission === 'denied' ? 'denied' : 'off')
        return
      }

      const registration = await navigator.serviceWorker.register('/sw.js')
      const existingSubscription = await registration.pushManager.getSubscription()
      const subscription = existingSubscription ?? await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: decodeVapidPublicKey(publicKey),
      })
      await savePushSubscription(client, session.user.id, subscription)
      setPushStatus('on')
    } catch (error) {
      setPushError(errorText(error))
      setPushStatus('error')
    }
  }

  async function disablePushNotifications() {
    if (!client || !session) return
    setPushStatus('checking')
    setPushError('')
    try {
      const registration = await navigator.serviceWorker.getRegistration('/')
      const subscription = await registration?.pushManager.getSubscription()
      if (subscription) await removePushSubscription(client, session.user.id, subscription)
      setPushStatus('off')
    } catch (error) {
      setPushError(errorText(error))
      setPushStatus('error')
    }
  }

  async function updateRosterMember(userId: string, role: Member['role'], active: boolean) {
    if (!session || rosterActionId) return
    setRosterActionId(userId)
    setRosterError('')
    try {
      const response = await fetch('/api/admin-members', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${session.access_token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ user_id: userId, role, active }),
      })
      const result = await response.json() as { error?: string; member?: Member }
      if (!response.ok || !result.member) throw new Error(result.error ?? 'Could not update messaging access.')
      setRoster((current) => current.map((item) => item.user_id === userId ? result.member! : item))
      if (userId === session.user.id) {
        setMember(result.member)
        setMemberChecked(true)
      }
    } catch (error) {
      setRosterError(errorText(error))
    } finally {
      setRosterActionId(null)
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
          <div className="eyebrow"><span />PARENTS, COACHES &amp; PLAYERS <b>·</b> BETA</div>
          <h1>Team messages</h1>
          <p>A private group space for approved parents, coaches, and players.</p>
        </div>
        <ShieldCheck size={25} aria-hidden="true" />
      </section>

      {session && rosterAdmin && <section className="panel messages-access-panel">
        <button className="messages-secondary-button" type="button" onClick={() => setShowRoster((visible) => !visible)}>
          {showRoster ? 'Hide admin panel' : 'Manage parent and coach access'}
        </button>
        {showRoster && <div className="messages-admin-panel">
          <h2>Messaging access</h2>
          <p>Approve a signed-in user as a parent, coach, or player, or change/revoke their access.</p>
          {rosterError && <p className="messages-inline-error" role="alert">{rosterError}</p>}
          {rosterLoading ? <p role="status">Loading accounts…</p> : roster.length ? roster.map((candidate) =>
            <div className="messages-admin-member" key={candidate.user_id}>
              <div>
                <strong>{candidate.display_name}</strong>
                <span>{candidate.email ?? 'No email'} · {candidate.active ? candidate.role : 'Pending'}</span>
              </div>
              {candidate.active ? <>
                {memberRoles.filter((role) => role !== candidate.role).map((role) => <button
                  className="messages-secondary-button" type="button" key={role} disabled={rosterActionId !== null}
                  onClick={() => void updateRosterMember(candidate.user_id, role, true)}>
                  Make {role}
                </button>)}
                <button className="messages-secondary-button" type="button" disabled={rosterActionId !== null}
                  onClick={() => void updateRosterMember(candidate.user_id, candidate.role, false)}>
                  Revoke
                </button>
              </> : <>
                {memberRoles.map((role) => <button className="messages-primary-button" type="button" key={role}
                  disabled={rosterActionId !== null}
                  onClick={() => void updateRosterMember(candidate.user_id, role, true)}>
                  Approve {role}
                </button>)}
              </>}
            </div>
          ) : !rosterLoading ? <p>No signed-in users yet.</p> : null}
        </div>}
      </section>}
      {session && rosterError && !rosterAdmin && <p className="messages-inline-error messages-page-error" role="alert">{rosterError}</p>}

      {!client ? <section className="panel messages-access-panel">
        <h2>Messaging is not configured yet</h2>
        <p>Add <code>VITE_SUPABASE_URL</code> and <code>VITE_SUPABASE_PUBLISHABLE_KEY</code> to the environment, apply the Supabase schema, and enable Google sign-in.</p>
      </section> : !authReady ? <section className="panel messages-access-panel" role="status">
        <p>Checking sign-in…</p>
      </section> : !session ? <section className="panel messages-access-panel">
        <h2>Parent and coach messages</h2>
        <p>Sign in with the Google account approved for the team. Only approved parents, coaches, and players can read or send messages.</p>
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
        <p><strong>{session.user.email ?? 'This Google account'}</strong> is signed in, but is not on the approved parent-and-coach roster yet. Ask a messaging admin to approve this account.</p>
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
          <div className="messages-push-controls">
            {isIosDevice() && !isInstalledApp() && <p>On iPhone or iPad, add this site to your Home Screen and open it there to enable push notifications (iOS 16.4+).</p>}
            <button
              className="messages-secondary-button"
              type="button"
              onClick={() => void (pushStatus === 'on' ? disablePushNotifications() : enablePushNotifications())}
              disabled={pushStatus === 'checking' || pushStatus === 'denied' || pushStatus === 'unsupported' || (isIosDevice() && !isInstalledApp())}
            >
              {pushStatus === 'checking' ? 'Checking notifications…' :
                pushStatus === 'on' ? 'Turn off notifications' :
                  pushStatus === 'denied' ? 'Notifications blocked in browser settings' :
                    pushStatus === 'unsupported' ? 'Push notifications unsupported' : 'Enable notifications'}
            </button>
            {pushStatus === 'unsupported' && <p>Use a supported browser on HTTPS. iPhone and iPad require iOS 16.4+ and the Home Screen app.</p>}
            {pushError && <p className="messages-inline-error" role="alert">{pushError}</p>}
          </div>
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
