import { NextResponse } from "next/server"
import { getServerSession } from "@/lib/auth"
import { getCustomerPage, getUserRoleInfo } from "@/lib/sheets"
import { z } from "zod"
import { writeCustomerAudit } from "@/lib/customer-audit"

const querySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  search: z.string().trim().max(100).default(""),
  company: z.string().trim().max(500).default(""),
  city: z.string().trim().max(500).default(""),
  state: z.string().trim().max(500).default(""),
  clientCategory: z.string().trim().max(500).default(""),
  revenueRange: z.string().trim().max(40).default(""),
  sampleCostRange: z.string().trim().max(40).default(""),
  sort: z.enum(["company", "contactName", "phone", "email", "inquiries", "sampleCost", "conversion", "revenue", "avgGp", "successRatio", "customerCode", "city", "state", "clientCategory"]).default("revenue"),
  direction: z.enum(["asc", "desc"]).default("desc"),
})

export async function GET(request: Request) {
  try {
    const session = await getServerSession()

    if (!session) {
      return NextResponse.json({ success: false, message: "Not authenticated" }, { status: 401 })
    }

    const url = new URL(request.url)
    const parsed = querySchema.safeParse(Object.fromEntries(url.searchParams))
    if (!parsed.success) {
      return NextResponse.json({ success: false, message: "Invalid customer query" }, { status: 400 })
    }

    const roleInfo = await getUserRoleInfo(session.email)
    const legacySortMap = { customerCode: "phone", city: "inquiries", state: "revenue", clientCategory: "successRatio" } as const
    const sort = parsed.data.sort in legacySortMap
      ? legacySortMap[parsed.data.sort as keyof typeof legacySortMap]
      : parsed.data.sort as Exclude<typeof parsed.data.sort, keyof typeof legacySortMap>
    const parseMulti = (value: string) => value.split(",").map((item) => item.trim()).filter(Boolean)
    const data = await getCustomerPage(
      roleInfo.authorizedEmails,
      {
        ...parsed.data,
        company: parseMulti(parsed.data.company),
        city: parseMulti(parsed.data.city),
        state: parseMulti(parsed.data.state),
        clientCategory: parseMulti(parsed.data.clientCategory),
        sort,
        pageSize: 15,
      },
      roleInfo.role === "BOSS",
    )
    const action = parsed.data.search ? "SEARCH" : (parsed.data.state || parsed.data.clientCategory) ? "FILTER" : "PAGE_CHANGE"
    await writeCustomerAudit({ session, request, action, metadata: { page: data.page, resultCount: data.items.length } })

    return NextResponse.json({ success: true, data })
  } catch (error) {
    console.error("Error fetching customers:", error)
    return NextResponse.json({ success: false, message: "Failed to fetch customers" }, { status: 500 })
  }
}
