import { NextResponse } from "next/server"
import { getServerSession } from "@/lib/auth"
import { getTimeline } from "@/lib/dashboard-analytics"
export async function GET(request: Request) { try { const session = await getServerSession(); if (!session) return NextResponse.json({ success: false }, { status: 401 }); return NextResponse.json({ success: true, data: await getTimeline(session.email, new URL(request.url).searchParams) }) } catch (error) { console.error("Timeline error", error); const invalid=error instanceof Error&&error.message==="INVALID_DATE_RANGE"; return NextResponse.json({ success:false, message:invalid?"Select a valid seven-day range":"Unable to load calendar" }, { status:invalid?400:500 }) } }
