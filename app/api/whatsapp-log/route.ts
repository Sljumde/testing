import { NextResponse } from "next/server"
import { getServerSession } from "@/lib/auth"
import { appendToSheet } from "@/lib/sheets"

export async function POST(request: Request) {
  try {
    const session = await getServerSession()
    if (!session) {
      return NextResponse.json({ success: false, message: "Not authenticated" }, { status: 401 })
    }

    const body = await request.json()
    const { recipients, inquiryNumbers, messageBody, timestamp } = body

    const logEntry = [
      timestamp,
      session.email,
      recipients.join(", "),
      inquiryNumbers.join(" / "),
      messageBody,
      `Bulk WhatsApp - ${recipients.length} recipients`,
    ]

    await appendToSheet("WhatsApp", logEntry)

    return NextResponse.json({
      success: true,
      message: `WhatsApp logged for ${recipients.length} contact(s)`,
    })
  } catch (error) {
    console.error("Error logging WhatsApp:", error)
    return NextResponse.json({ success: false, message: "Failed to log WhatsApp" }, { status: 500 })
  }
}
