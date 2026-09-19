import { type NextRequest, NextResponse } from "next/server"
import { getServerSession } from "@/lib/auth"
import { getSupabaseAdminClient } from "@/lib/supabase/server"

const CONTACT_SELECT = `
  company_id,
  company_name,
  contact_id,
  contact_person_name,
  phone,
  email,
  category,
  location
`

function serializeSupabaseError(error: unknown) {
  if (!error || typeof error !== "object") return { message: String(error) }
  const value = error as { message?: string; code?: string; details?: string; hint?: string }
  return {
    message: value.message || "Supabase lookup failed",
    code: value.code || "",
    details: value.details || null,
    hint: value.hint || null,
  }
}

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession()
    if (!session) {
      return NextResponse.json({ success: false, message: "Not authenticated" }, { status: 401 })
    }

    const searchParams = request.nextUrl.searchParams
    const companyName = (searchParams.get("company") || "").trim()
    const mode = searchParams.get("mode") === "contacts" ? "contacts" : "suggestions"

    const supabase = getSupabaseAdminClient()

    if (!companyName) {
      return NextResponse.json({ success: true, data: [] })
    }

    if (mode === "contacts") {
      const { data, error } = await supabase
        .from("client_lookup")
        .select(CONTACT_SELECT)
        .eq("company_name_normalized", companyName.toLowerCase())
        .order("contact_person_name")

      if (error) {
        console.error("[client-lookup]", serializeSupabaseError(error))
        return NextResponse.json(
          { success: false, message: "Unable to load contacts for this company." },
          { status: 500 },
        )
      }

      return NextResponse.json({ success: true, data: data || [] })
    }

    const { data, error } = await supabase
      .from("client_lookup")
      .select("company_id, company_name")
      .ilike("company_name", `%${companyName}%`)
      .limit(12)

    if (error) {
      console.error("[client-lookup]", serializeSupabaseError(error))
      return NextResponse.json(
        { success: false, message: "Unable to search companies." },
        { status: 500 },
      )
    }

    return NextResponse.json({ success: true, data: data || [] })
  } catch (error) {
    console.error("[client-lookup]", error)
    return NextResponse.json({ success: false, message: "Client lookup failed" }, { status: 500 })
  }
}
