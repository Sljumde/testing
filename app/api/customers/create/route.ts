import { type NextRequest, NextResponse } from "next/server"
import { getServerSession } from "@/lib/auth"
import { addNewCustomer } from "@/lib/sheets"

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession()

    if (!session) {
      return NextResponse.json({ success: false, message: "Not authenticated" }, { status: 401 })
    }

    const customerData = await request.json()
    const result = await addNewCustomer(customerData)

    return NextResponse.json(result)
  } catch (error) {
    console.error("Error creating customer:", error)
    return NextResponse.json({ success: false, message: "Failed to create customer" }, { status: 500 })
  }
}
