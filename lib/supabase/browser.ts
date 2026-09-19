"use client"

import { createClient, type SupabaseClient } from "@supabase/supabase-js"

let browserClient: SupabaseClient | null = null

function requirePublicSupabaseEnv() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY

  if (!url || !publishableKey) {
    throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY")
  }

  return { url, publishableKey }
}

export function getSupabaseBrowserClient() {
  if (browserClient) return browserClient

  const { url, publishableKey } = requirePublicSupabaseEnv()
  browserClient = createClient(url, publishableKey)

  return browserClient
}
