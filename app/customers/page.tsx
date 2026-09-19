import { redirect } from "next/navigation"
import { getServerSession } from "@/lib/auth"
import { getUserRoleInfo } from "@/lib/sheets"
import ClientIntelligenceClient from "@/components/client-intelligence-client"

export default async function CustomersPage() {
  const session = await getServerSession()

  if (!session) {
    redirect("/login")
  }

  const roleInfo = await getUserRoleInfo(session.email)

  return <ClientIntelligenceClient userInfo={{ ...roleInfo, sessionId: session.sessionId }} />
}
