import { redirect } from "next/navigation"
import { getServerSession } from "@/lib/auth"
import { getDashboardSummary } from "@/lib/dashboard-analytics"
import ExecutiveDashboardClient from "@/components/executive-dashboard-client"

export default async function DashboardPage() {
  const session = await getServerSession()

  if (!session) redirect("/login")

  try {
    const summary = await getDashboardSummary(session.email)
    return <ExecutiveDashboardClient initialData={summary} />
  } catch (error) {
    console.error("Dashboard summary error", error)
    return <ExecutiveDashboardClient initialError="Unable to load dashboard" />
  }
}
