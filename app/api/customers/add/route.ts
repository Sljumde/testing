import { NextResponse } from "next/server"
import { getServerSession } from "@/lib/auth"
import { addCustomer } from "@/lib/sheets"

export async function POST(request: Request) {
  try {
    const session = await getServerSession()

    if (!session) {
      return NextResponse.json({ success: false, message: "Not authenticated" }, { status: 401 })
    }

    const customerData = await request.json()

    const result = await addCustomer(customerData)

    if (result.success) {
      return NextResponse.json({
        success: true,
        message: result.message,
        customerCode: result.customerCode,
      })
    } else {
      return NextResponse.json({ success: false, message: result.message }, { status: 400 })
    }
  } catch (error) {
    console.error("Error adding customer:", error)
    return NextResponse.json({ success: false, message: "Failed to add customer" }, { status: 500 })
  }
}
