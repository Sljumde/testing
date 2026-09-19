import { redirect } from "next/navigation"
import { getServerSession } from "@/lib/auth"
import TimelessScheduleCalendar from "@/components/timeless-schedule-calendar"
export default async function TimelessPage() { if (!await getServerSession()) redirect("/login"); return <TimelessScheduleCalendar/> }
