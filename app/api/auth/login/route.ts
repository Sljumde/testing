import { type NextRequest, NextResponse } from "next/server"
import { createSession } from "@/lib/auth"
import { createSupabasePasswordSession } from "@/lib/supabase/server"
import { getSupabaseUserRoleInfo } from "@/lib/supabase-roles"

export async function POST(request: NextRequest) {
  try {
    const { email, password } = await request.json()
    const normalizedEmail = String(email || "").trim().toLowerCase()

    if (!normalizedEmail || typeof password !== "string" || !password) {
      return NextResponse.json({ success: false, message: "Email and password are required" }, { status: 400 })
    }

    try {
      const supabaseUser = await createSupabasePasswordSession(normalizedEmail, password)
      if (supabaseUser.email?.toLowerCase() !== normalizedEmail) {
        return NextResponse.json(
          { success: false, message: "Supabase authenticated as a different user" },
          { status: 401 },
        )
      }

      const roleInfo = await getSupabaseUserRoleInfo(normalizedEmail)
      await createSession(normalizedEmail, roleInfo.role || "EMPLOYEE")
      return NextResponse.json(
        {
          success: true,
          message: "Login successful",
          userEmail: normalizedEmail,
          role: roleInfo.role,
        },
        { status: 200 },
      )
    } catch (error) {
      console.error("Supabase login error:", error)
      return NextResponse.json(
        { success: false, message: "Invalid email or password" },
        { status: 401 },
      )
    }
  } catch (error) {
    console.error("Login error:", error)
    return NextResponse.json({ success: false, message: "Login error occurred" }, { status: 500 })
  }
}
