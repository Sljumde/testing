import { NextResponse } from "next/server"
import { destroySession } from "@/lib/auth"
import { clearSupabaseAuthCookies } from "@/lib/supabase/server"

export async function POST() {
  await destroySession()
  await clearSupabaseAuthCookies()
  return NextResponse.json({ success: true })
}
