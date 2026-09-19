import { NextResponse } from "next/server"
import { getServerSession } from "@/lib/auth"
import { getDashboardSummary } from "@/lib/dashboard-analytics"
export async function GET() { try { const session = await getServerSession(); if (!session) return NextResponse.json({ success: false }, { status: 401 }); return NextResponse.json({ success: true, data: await getDashboardSummary(session.email) }) } catch (error) { console.error("Dashboard summary error", error); return NextResponse.json({ success: false, message: "Unable to load dashboard" }, { status: 500 }) } }
