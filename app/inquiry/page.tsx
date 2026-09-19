import { redirect } from "next/navigation"
import { getServerSession } from "@/lib/auth"
import InquiryForm from "@/components/inquiry-form"

export default async function InquiryPage() {
  const session = await getServerSession()

  if (!session) {
    redirect("/login")
  }

  return <InquiryForm userEmail={session.email} />
}
