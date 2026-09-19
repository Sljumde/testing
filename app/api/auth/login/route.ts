import { type NextRequest, NextResponse } from "next/server"
import { validateLogin } from "@/lib/sheets"
import { createSession } from "@/lib/auth"
import { createSupabasePasswordSession } from "@/lib/supabase/server"

export async function POST(request: NextRequest) {
  try {
    const { email, password } = await request.json()

    const result = await validateLogin(email, password)

    if (result.success) {
      try {
        const supabaseUser = await createSupabasePasswordSession(email, password)
        if (supabaseUser.email?.toLowerCase() !== String(email).toLowerCase()) {
          return NextResponse.json(
            { success: false, message: "Supabase authenticated as a different user" },
            { status: 401 },
          )
        }
      } catch (error) {
        console.error("Supabase login error:", error)
        return NextResponse.json(
          {
            success: false,
            message: "CRM login is valid, but Supabase authentication failed. Check this user's Supabase Auth account.",
          },
          { status: 401 },
        )
      }

      await createSession(email, result.role || "EMPLOYEE")
      return NextResponse.json(
        {
          success: true,
          message: "Login successful",
          token: email, // Simple identifier - consider using actual JWT token if needed
        },
        { status: 200 },
      )
    }

    return NextResponse.json(result, { status: 401 })
  } catch (error) {
    console.error("Login error:", error)
    return NextResponse.json({ success: false, message: "Login error occurred" }, { status: 500 })
  }
}
