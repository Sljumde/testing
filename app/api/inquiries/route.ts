import { type NextRequest, NextResponse } from "next/server"
import { getServerSession } from "@/lib/auth"
import { getSupabaseUserRoleInfo } from "@/lib/supabase-roles"
import { getSupabaseInquiryPage } from "@/lib/supabase-inquiries"
import { createAppLogger } from "@/lib/app-logger"

export async function GET(request: NextRequest) {
  const logger = await createAppLogger({
    route: "/api/inquiries",
    method: "GET",
    action: "READ",
    resource: "inquiries",
    operation: "list_inquiries",
    query: "inquiries paginated + crm_inquiry_view selected columns",
  })

  try {
    const session = logger.session || await getServerSession()

    if (!session) {
      await logger.failure({ statusCode: 401, error: new Error("Not authenticated") })
      return NextResponse.json({ success: false, message: "Not authenticated" }, { status: 401 })
    }

    const roleInfo = await getSupabaseUserRoleInfo(session.email)
    const searchParams = request.nextUrl.searchParams
    const page = Number(searchParams.get("page") || 1)
    const pageSize = Number(searchParams.get("pageSize") || 50)
    const sort = searchParams.get("sort") || "inquiryNo.desc"
    const data = await getSupabaseInquiryPage(roleInfo.authorizedEmails, { page, pageSize, sort })

    await logger.success({
      statusCode: 200,
      metadata: {
        rowCount: data.items.length,
        total: data.total,
        page: data.page,
        pageSize: data.pageSize,
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
