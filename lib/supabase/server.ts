import "server-only"

import { cookies } from "next/headers"
import { createClient, type SupabaseClient } from "@supabase/supabase-js"
import type { User } from "@supabase/supabase-js"

let adminClient: SupabaseClient | null = null

const ACCESS_TOKEN_COOKIE = "crm-supabase-access-token"
const REFRESH_TOKEN_COOKIE = "crm-supabase-refresh-token"

export function getSupabaseConfig() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
  const secretKey = process.env.SUPABASE_SECRET_KEY

  return {
    url,
    publishableKey,
    secretKey,
    configured: Boolean(url && publishableKey && secretKey),
  }
}

export function getSupabaseProjectHost() {
  const { url } = getSupabaseConfig()
  if (!url) return null

  try {
    return new URL(url).host
  } catch {
    return null
  }
}

export function getSupabaseAdminClient() {
  if (adminClient) return adminClient

  const { url, secretKey } = getSupabaseConfig()
  if (!url || !secretKey) {
    throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SECRET_KEY")
  }

  adminClient = createClient(url, secretKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  })

  return adminClient
}

function getSupabaseAnonClient() {
  const { url, publishableKey } = getSupabaseConfig()
  if (!url || !publishableKey) {
    throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY")
  }

  return createClient(url, publishableKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  })
}

function getSupabaseUserClient(accessToken: string) {
  const { url, publishableKey } = getSupabaseConfig()
  if (!url || !publishableKey) {
    throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY")
  }

  return createClient(url, publishableKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
    global: {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    },
  })
}

async function setSupabaseAuthCookies(accessToken: string, refreshToken: string, expiresIn?: number) {
  const cookieStore = await cookies()
  const secure = process.env.NODE_ENV === "production"

  cookieStore.set(ACCESS_TOKEN_COOKIE, accessToken, {
    httpOnly: true,
    secure,
    sameSite: "lax",
    path: "/",
    maxAge: expiresIn || 60 * 60,
  })

  cookieStore.set(REFRESH_TOKEN_COOKIE, refreshToken, {
    httpOnly: true,
    secure,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  })
}

export async function clearSupabaseAuthCookies() {
  const cookieStore = await cookies()
  cookieStore.delete(ACCESS_TOKEN_COOKIE)
  cookieStore.delete(REFRESH_TOKEN_COOKIE)
}

export async function createSupabasePasswordSession(email: string, password: string) {
  const supabase = getSupabaseAnonClient()
  const { data, error } = await supabase.auth.signInWithPassword({ email, password })

  if (error || !data.session || !data.user) {
    throw new Error(error?.message || "Supabase authentication failed")
  }

  await setSupabaseAuthCookies(
    data.session.access_token,
    data.session.refresh_token,
    data.session.expires_in,
  )

  return data.user
}

type AuthenticatedSupabaseResult =
  | { supabase: SupabaseClient; user: User; error: null }
  | { supabase: null; user: null; error: string }

export async function getAuthenticatedSupabaseServerClient(): Promise<AuthenticatedSupabaseResult> {
  const cookieStore = await cookies()
  const accessToken = cookieStore.get(ACCESS_TOKEN_COOKIE)?.value
  const refreshToken = cookieStore.get(REFRESH_TOKEN_COOKIE)?.value

  if (!accessToken && !refreshToken) {
    return { supabase: null, user: null, error: "Missing Supabase authentication session" }
  }

  if (accessToken) {
    const supabase = getSupabaseUserClient(accessToken)
    const {
      data: { user },
      error,
    } = await supabase.auth.getUser(accessToken)

    if (!error && user) {
      return { supabase, user, error: null }
    }
  }

  if (!refreshToken) {
    return { supabase: null, user: null, error: "Supabase authentication session expired" }
  }

  const refreshClient = getSupabaseAnonClient()
  const { data, error } = await refreshClient.auth.refreshSession({ refresh_token: refreshToken })

  if (error || !data.session || !data.user) {
    await clearSupabaseAuthCookies()
    return { supabase: null, user: null, error: error?.message || "Unable to refresh Supabase authentication session" }
  }

  await setSupabaseAuthCookies(
    data.session.access_token,
    data.session.refresh_token,
    data.session.expires_in,
  )

  return {
    supabase: getSupabaseUserClient(data.session.access_token),
    user: data.user,
    error: null,
  }
}
