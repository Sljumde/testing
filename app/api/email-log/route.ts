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
    const { recipients, inquiryNumbers, subject, body: emailBody, timestamp } = body

    const logEntry = [
      timestamp,
      session.email,
      recipients.join(", "),
      inquiryNumbers.join(" / "),
      subject,
      emailBody,
      `Bulk Email - ${recipients.length} recipients`,
    ]

    await appendToSheet("Mailer", logEntry)

    return NextResponse.json({
      success: true,
      message: `Email logged for ${recipients.length} contact(s)`,
    })
  } catch (error) {
    console.error("Error logging email:", error)
    return NextResponse.json({ success: false, message: "Failed to log email" }, { status: 500 })
  }
}
