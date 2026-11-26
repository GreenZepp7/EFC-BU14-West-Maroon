import { timingSafeEqual } from 'node:crypto'
import { createClient } from '@supabase/supabase-js'
import { sendNotification, setVapidDetails } from 'web-push'
import { z } from 'zod'
import type { Database } from '../src/database.types'

const webhookSchema = z.object({
  type: z.literal('INSERT'),
  schema: z.literal('public'),
  table: z.literal('beta_messages'),
  record: z.object({
    sender_id: z.string().uuid(),
  }),
})

function jsonResponse(status: number, body: Record<string, unknown>) {
  return Response.json(body, {
    status,
    headers: { 'cache-control': 'no-store' },
  })
}

function matchesSecret(provided: string | null, expected: string) {
  if (!provided) return false
  const providedBuffer = Buffer.from(provided)
  const expectedBuffer = Buffer.from(expected)
  return providedBuffer.length === expectedBuffer.length && timingSafeEqual(providedBuffer, expectedBuffer)
}

function getStatusCode(error: unknown) {
  return error && typeof error === 'object' && 'statusCode' in error
    ? Number(error.statusCode)
    : undefined
}

export async function POST(request: Request) {
  const supabaseUrl = process.env.VITE_SUPABASE_URL?.trim()
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()
  const publicKey = process.env.VITE_VAPID_PUBLIC_KEY?.trim()
  const privateKey = process.env.VAPID_PRIVATE_KEY?.trim()
  const subject = process.env.VAPID_SUBJECT?.trim()
  const webhookSecret = process.env.MESSAGES_PUSH_WEBHOOK_SECRET?.trim()

  if (!supabaseUrl || !serviceRoleKey || !publicKey || !privateKey || !subject || !webhookSecret) {
    return jsonResponse(503, { error: 'Message push notifications are not configured.' })
  }

  if (!matchesSecret(request.headers.get('x-messages-push-secret'), webhookSecret)) {
    return jsonResponse(401, { error: 'Invalid webhook authorization.' })
  }

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return jsonResponse(400, { error: 'The request body must be valid JSON.' })
  }

  const parsed = webhookSchema.safeParse(body)
  if (!parsed.success) return jsonResponse(400, { error: 'The database event is invalid.' })

  const adminClient = createClient<Database>(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  try {
    setVapidDetails(subject, publicKey, privateKey)
    const { data: members, error: membersError } = await adminClient
      .from('beta_members')
      .select('user_id')
      .eq('active', true)
    if (membersError) throw membersError

    const recipients = (members ?? [])
      .map((member) => member.user_id)
      .filter((userId) => userId !== parsed.data.record.sender_id)
    if (!recipients.length) return jsonResponse(200, { sent: 0 })

    const { data: subscriptions, error: subscriptionsError } = await adminClient
      .from('beta_push_subscriptions')
      .select('user_id, endpoint, p256dh, auth')
      .in('user_id', recipients)
    if (subscriptionsError) throw subscriptionsError

    const results = await Promise.all((subscriptions ?? []).map(async (subscription) => {
      try {
        await sendNotification({
          endpoint: subscription.endpoint,
          keys: { p256dh: subscription.p256dh, auth: subscription.auth },
        }, JSON.stringify({ url: '/?view=messages' }))
        return true
      } catch (error) {
        const statusCode = getStatusCode(error)
        if (statusCode === 404 || statusCode === 410) {
          const { error: deleteError } = await adminClient.from('beta_push_subscriptions')
            .delete()
            .eq('user_id', subscription.user_id)
            .eq('endpoint', subscription.endpoint)
          if (deleteError) console.error('Could not remove an expired push subscription:', deleteError)
        } else {
          console.error('Push delivery failed with status:', statusCode ?? 'unknown')
        }
        return false
      }
    }))

    return jsonResponse(200, { sent: results.filter(Boolean).length })
  } catch (error) {
    console.error('Message push delivery failed:', error)
    return jsonResponse(502, { error: 'Could not deliver message notifications.' })
  }
}
