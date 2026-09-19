import { redirect } from "next/navigation"
import { getServerSession } from "@/lib/auth"
import ExecutiveDashboardClient from "@/components/executive-dashboard-client"

export default async function DashboardPage() {
  const session = await getServerSession()

  if (!session) redirect("/login")
  return <ExecutiveDashboardClient />
}
