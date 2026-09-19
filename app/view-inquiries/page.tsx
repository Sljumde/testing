import { redirect } from "next/navigation"
import { getServerSession } from "@/lib/auth"
import { getSupabaseUserRoleInfo } from "@/lib/supabase-roles"
import { getSupabaseInquiryPage } from "@/lib/supabase-inquiries"
import ViewInquiriesClient from "@/components/view-inquiries-client"

export default async function ViewInquiriesPage() {
  const session = await getServerSession()

  if (!session) {
    redirect("/login")
  }

  const roleInfo = await getSupabaseUserRoleInfo(session.email)
  const inquiryPage = await getSupabaseInquiryPage(roleInfo.authorizedEmails, {
    page: 1,
    pageSize: 50,
    sort: "inquiryNo.desc",
  })

  return (
    <ViewInquiriesClient
      userEmail={session.email}
      userRole={roleInfo.role}
      authorizedEmails={roleInfo.authorizedEmails}
      initialInquiries={inquiryPage.items}
      initialPage={inquiryPage.page}
      initialPageSize={inquiryPage.pageSize}
      initialTotal={inquiryPage.total}
      initialTotalPages={inquiryPage.totalPages}
    />
  )
}
