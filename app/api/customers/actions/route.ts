import { NextResponse } from "next/server"
import { z } from "zod"
import { getServerSession } from "@/lib/auth"
import { writeCustomerAudit } from "@/lib/customer-audit"
import { getAuthorizedCustomer, getUserRoleInfo } from "@/lib/sheets"

const schema = z.object({
  customerCode: z.string().trim().min(1).max(50),
  action: z.enum(["SEND_TO_DEVICE", "EMAIL_ACTION", "COPY_ATTEMPT", "CONTEXT_MENU_ATTEMPT"]),
})

export async function POST(request: Request) {
  try {
    const session = await getServerSession()
    if (!session) return NextResponse.json({ success: false, message: "Not authenticated" }, { status: 401 })
    const parsed = schema.safeParse(await request.json())
    if (!parsed.success) return NextResponse.json({ success: false, message: "Invalid action" }, { status: 400 })
    const role = await getUserRoleInfo(session.email)
    const customer = await getAuthorizedCustomer(
      parsed.data.customerCode,
      role.authorizedEmails,
      role.role === "BOSS",
    )
    if (!customer) {
      await writeCustomerAudit({ session, request, action: "UNAUTHORIZED_ACCESS", customerCode: parsed.data.customerCode, success: false })
      return NextResponse.json({ success: false, message: "Client not found" }, { status: 404 })
    }
    await writeCustomerAudit({ session, request, action: parsed.data.action, customerCode: customer.customerCode, company: customer.company })
    return NextResponse.json({ success: true })
  } catch (error) {
    console.error("Customer action audit error:", error instanceof Error ? error.message : "Unknown error")
    return NextResponse.json({ success: false, message: "Unable to log action" }, { status: 500 })
  }
}
