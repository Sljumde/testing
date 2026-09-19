import { redirect } from "next/navigation"
import { getServerSession } from "@/lib/auth"
import { getUserRoleInfo } from "@/lib/sheets"
import { getSupabaseInquiryRows } from "@/lib/supabase-inquiries"
import ViewInquiriesClient from "@/components/view-inquiries-client"

export default async function ViewInquiriesPage() {
  const session = await getServerSession()

  if (!session) {
    redirect("/login")
  }

  const roleInfo = await getUserRoleInfo(session.email)
  const inquiries = await getSupabaseInquiryRows(roleInfo.authorizedEmails)

  return (
    <ViewInquiriesClient
      userEmail={session.email}
      userRole={roleInfo.role}
      authorizedEmails={roleInfo.authorizedEmails}
      initialInquiries={inquiries}
    />
  )
}
