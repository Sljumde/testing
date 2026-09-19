import { NextResponse } from "next/server"
import { getServerSession } from "@/lib/auth"
import { getUserRoleInfo } from "@/lib/sheets"
import { getSupabaseInquiryRows } from "@/lib/supabase-inquiries"
import { createAppLogger } from "@/lib/app-logger"

export async function GET() {
  const logger = await createAppLogger({
    route: "/api/inquiries",
    method: "GET",
    action: "READ",
    resource: "inquiries",
    operation: "list_inquiries",
    query: 'crm_inquiry_view.select("*").in("Sales Person Email", authorizedEmails)',
  })

  try {
    const session = logger.session || await getServerSession()

    if (!session) {
      await logger.failure({ statusCode: 401, error: new Error("Not authenticated") })
      return NextResponse.json({ success: false, message: "Not authenticated" }, { status: 401 })
    }

    const roleInfo = await getUserRoleInfo(session.email)
    const data = await getSupabaseInquiryRows(roleInfo.authorizedEmails)

    await logger.success({
      statusCode: 200,
      metadata: {
        rowCount: data.length,
        authorizedEmailCount: roleInfo.authorizedEmails.length,
      },
    })
    return NextResponse.json({ success: true, data })
  } catch (error) {
    console.error("Error fetching inquiries:", error)
    await logger.failure({ statusCode: 500, error })
    return NextResponse.json({ success: false, message: "Failed to fetch inquiries" }, { status: 500 })
  }
}
