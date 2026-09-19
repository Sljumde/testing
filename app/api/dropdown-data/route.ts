import { NextResponse } from "next/server"
import { getServerSession } from "@/lib/auth"
import { getDropdownData, getCompanyContacts } from "@/lib/sheets"

export async function GET() {
  try {
    const session = await getServerSession()
    if (!session) {
      return NextResponse.json({ success: false, message: "Not authenticated" }, { status: 401 })
    }

    const dropdownData = await getDropdownData()
    let companyContacts: Awaited<ReturnType<typeof getCompanyContacts>> = []

    try {
      companyContacts = await getCompanyContacts()
    } catch (error) {
      console.warn("Company contacts could not be loaded:", error)
    }

    return NextResponse.json({ 
      success: true, 
      data: dropdownData,
      companyContacts 
    })
  } catch (error) {
    console.error("Error fetching dropdown data:", error)
    return NextResponse.json({ success: false, message: "Failed to fetch dropdown data" }, { status: 500 })
  }
}
