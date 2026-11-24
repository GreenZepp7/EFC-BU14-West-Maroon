import { createClient } from '@supabase/supabase-js'
import { z } from 'zod'
import type { Database } from '../src/database.types'

const updateSchema = z.object({
  user_id: z.string().uuid(),
  role: z.enum(['parent', 'coach']),
  active: z.boolean(),
})

function jsonResponse(status: number, body: Record<string, unknown>) {
  return Response.json(body, {
    status,
    headers: { 'cache-control': 'no-store' },
  })
}

async function getAdminClient(request: Request) {
  const supabaseUrl = process.env.VITE_SUPABASE_URL?.trim()
  const publishableKey = process.env.VITE_SUPABASE_PUBLISHABLE_KEY?.trim()
  const allowedAdmins = (process.env.MESSAGES_ADMIN_EMAILS ?? '')
    .split(',')
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean)

  if (!supabaseUrl || !publishableKey || !allowedAdmins.length) {
    return { response: jsonResponse(503, { error: 'Messaging administration is not configured.' }) }
  }

  const authorization = request.headers.get('authorization')
  const accessToken = authorization?.match(/^Bearer\s+(.+)$/i)?.[1]
  if (!accessToken) return { response: jsonResponse(401, { error: 'Sign in is required.' }) }

  const authClient = createClient<Database>(supabaseUrl, publishableKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
  const { data: { user }, error: authError } = await authClient.auth.getUser(accessToken)
  if (authError || !user) return { response: jsonResponse(401, { error: 'Your sign-in has expired.' }) }

  if (!user.email || !user.email_confirmed_at || !allowedAdmins.includes(user.email.toLowerCase())) {
    return { response: jsonResponse(403, { error: 'Administrator access is required.' }) }
  }

  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()
  if (!serviceRoleKey) {
    return { response: jsonResponse(503, { error: 'Messaging administration is not configured.' }) }
  }

  const adminClient = createClient<Database>(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
  return { adminClient, user }
}

export async function GET(request: Request) {
  try {
    const result = await getAdminClient(request)
    if ('response' in result) return result.response

    const { data, error } = await result.adminClient
      .from('beta_members')
      .select('user_id, email, display_name, role, active, created_at')
      .order('created_at', { ascending: false })
    if (error) {
      console.error('Could not load messaging members:', error)
      return jsonResponse(502, { error: 'Could not load messaging members.' })
    }

    return jsonResponse(200, { members: data })
  } catch (error) {
    console.error('Messaging member list failed:', error)
    return jsonResponse(500, { error: 'Could not load messaging members.' })
  }
}

export async function POST(request: Request) {
  try {
    const result = await getAdminClient(request)
    if ('response' in result) return result.response

    let body: unknown
    try {
      body = await request.json()
    } catch {
      return jsonResponse(400, { error: 'The request body must be valid JSON.' })
    }

    const parsed = updateSchema.safeParse(body)
    if (!parsed.success) return jsonResponse(400, { error: 'The member update is invalid.' })

    const { user_id, role, active } = parsed.data
    const { data, error } = await result.adminClient
      .from('beta_members')
      .update({ role, active })
      .eq('user_id', user_id)
      .select('user_id, email, display_name, role, active, created_at')
      .maybeSingle()
    if (error) {
      console.error('Could not update messaging member:', error)
      return jsonResponse(502, { error: 'Could not update messaging access.' })
    }
    if (!data) return jsonResponse(404, { error: 'That user has not signed in to messaging yet.' })

    return jsonResponse(200, { member: data })
  } catch (error) {
    console.error('Messaging member update failed:', error)
    return jsonResponse(500, { error: 'Could not update messaging access.' })
  }
}
