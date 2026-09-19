import { redirect } from "next/navigation"
import { getServerSession } from "@/lib/auth"
import { hasCustomerPermission } from "@/lib/customer-permissions"
import SecurityActivityClient from "@/security-activity-client"

export default async function SecurityActivityPage() {
  const session = await getServerSession()
  if (!session) redirect("/login")
  if (!hasCustomerPermission(session.role, "customer.audit.read")) redirect("/dashboard")
  return <SecurityActivityClient />
}
