import { NextResponse } from "next/server"
import { z } from "zod"
import { getServerSession } from "@/lib/auth"
import { getAuthorizedCustomer, getUserRoleInfo } from "@/lib/sheets"
import { writeCustomerAudit } from "@/lib/customer-audit"

const openSchema = z.object({ customerCode: z.string().trim().min(1).max(50) })

export async function POST(request: Request) {
  try {
    const session = await getServerSession()
    if (!session) {
      return NextResponse.json({ success: false, message: "Not authenticated" }, { status: 401 })
    }

    const parsed = openSchema.safeParse(await request.json())
    if (!parsed.success) {
      return NextResponse.json({ success: false, message: "Invalid customer code" }, { status: 400 })
    }

    const roleInfo = await getUserRoleInfo(session.email)
    const customer = await getAuthorizedCustomer(
      parsed.data.customerCode,
      roleInfo.authorizedEmails,
      roleInfo.role === "BOSS",
    )
    if (!customer) {
      return NextResponse.json({ success: false, message: "Client not found" }, { status: 404 })
    }

    await writeCustomerAudit({ session, request, action: "CLIENT_OPENED", customerCode: customer.customerCode, company: customer.company })

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error("Customer open audit error:", error instanceof Error ? error.message : "Unknown error")
    return NextResponse.json({ success: false, message: "Unable to log client access" }, { status: 500 })
  }
}
