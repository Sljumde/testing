import { type NextRequest, NextResponse } from "next/server"
import { CUSTOMER_SHEET_NAME, getSheets, invalidateSheetCache } from "@/lib/sheets"
import { verifySession } from "@/lib/auth"

export async function POST(request: NextRequest) {
  try {
    const session = await verifySession()
    if (!session) {
      return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 })
    }

    const { updates } = await request.json()

    if (!updates || !Array.isArray(updates)) {
      return NextResponse.json({ success: false, message: "Invalid update data" }, { status: 400 })
    }

    const sheets = getSheets()
    const spreadsheetId = process.env.GOOGLE_SHEET_ID!

    // Get current customer data
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: `'${CUSTOMER_SHEET_NAME}'!A:AX`,
    })

    const rows = response.data.values || []
    const headerRow = rows[0]
    const dataRows = rows.slice(1)

    // Update each customer
    for (const update of updates) {
      const rowIndex = dataRows.findIndex((row) => row[0] === update.customerCode)
      if (rowIndex !== -1) {
        const actualRowIndex = rowIndex + 2 // +1 for header, +1 for 0-based to 1-based
        await sheets.spreadsheets.values.update({
          spreadsheetId,
          range: `'${CUSTOMER_SHEET_NAME}'!A${actualRowIndex}:AX${actualRowIndex}`,
          valueInputOption: "RAW",
          requestBody: {
            values: [update.data],
          },
        })
      }
    }

    invalidateSheetCache(CUSTOMER_SHEET_NAME)
    return NextResponse.json({ success: true, message: "Customers updated successfully" })
  } catch (error) {
    console.error("Error updating customers:", error)
    return NextResponse.json({ success: false, message: "Error updating customers" }, { status: 500 })
  }
}
