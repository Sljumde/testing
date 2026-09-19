import { NextResponse } from "next/server"
import { getServerSession } from "@/lib/auth"
import { getSupabaseAdminClient, getSupabaseConfig, getSupabaseProjectHost } from "@/lib/supabase/server"

export async function GET() {
  try {
    const session = await getServerSession()
    if (!session) {
      return NextResponse.json({ success: false, message: "Not authenticated" }, { status: 401 })
    }

    const config = getSupabaseConfig()
    if (!config.configured) {
      return NextResponse.json(
        {
          success: false,
          message: "Supabase is not configured",
          configured: {
            url: Boolean(config.url),
            publishableKey: Boolean(config.publishableKey),
            secretKey: Boolean(config.secretKey),
          },
        },
        { status: 503 },
      )
    }

    const supabase = getSupabaseAdminClient()
    const { data, error } = await supabase.auth.admin.listUsers({ page: 1, perPage: 1 })

    if (error) {
      return NextResponse.json(
        {
          success: false,
          message: "Supabase connection failed",
          projectHost: getSupabaseProjectHost(),
          error: error.message,
        },
        { status: 502 },
      )
    }

    return NextResponse.json({
      success: true,
      message: "Supabase connection is working",
      projectHost: getSupabaseProjectHost(),
      checked: "auth.admin.listUsers",
      sampleUserCount: data.users.length,
    })
  } catch (error) {
    console.error("Supabase health check error:", error)
    return NextResponse.json({ success: false, message: "Supabase health check failed" }, { status: 500 })
  }
}
