import { NextResponse } from "next/server"
import { getServerSession } from "@/lib/auth"

export async function GET() {
  const session = await getServerSession()

  if (!session) {
    return NextResponse.json({ success: false, message: "Not authenticated" }, { status: 401 })
  }

  return NextResponse.json({
    success: true,
    data: {
      email: session.email,
      role: session.role,
    },
  })
}
