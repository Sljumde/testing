import { redirect } from "next/navigation"
import { getServerSession } from "@/lib/auth"

export default async function Home() {
  const session = await getServerSession()

  redirect("/dashboard")
}
