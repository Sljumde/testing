import "server-only"

import { getSupabaseAdminClient } from "@/lib/supabase/server"

export type InquiryRow = string[]

type CrmInquiryViewRow = Record<string, unknown>

const PAGE_SIZE = 1000
const INQUIRY_ROW_LENGTH = 46

function text(value: unknown) {
  return value == null ? "" : String(value)
}

function viewCell(row: CrmInquiryViewRow, key: string) {
  return text(row[key])
}

export function toInquiryRow(row: CrmInquiryViewRow): InquiryRow {
  const output = Array(INQUIRY_ROW_LENGTH).fill("")

  output[0] = viewCell(row, "Inquiry No")
  output[1] = viewCell(row, "Timestamp")
  output[2] = viewCell(row, "Company")
  output[3] = viewCell(row, "Contact Name")
  output[4] = viewCell(row, "Phone")
  output[5] = viewCell(row, "Email")
  output[6] = viewCell(row, "Category")
  output[7] = viewCell(row, "Details")
  output[8] = viewCell(row, "Lead Source")
  output[9] = viewCell(row, "Sales Person Email")
  output[10] = viewCell(row, "Sales Stage")
  output[11] = viewCell(row, "Update Remarks")
  output[12] = viewCell(row, "Next Steps")
  output[13] = viewCell(row, "Next Followup Date")
  output[14] = viewCell(row, "Budget")
  output[15] = viewCell(row, "Quantity")
  output[16] = viewCell(row, "Est Order Value")
  output[17] = viewCell(row, "Attachments")
  output[18] = viewCell(row, "Delay Days")
  output[19] = viewCell(row, "Weighted Forecast")
  output[20] = viewCell(row, "Sampe Cost")
  output[21] = viewCell(row, "REVENUE")
  output[22] = viewCell(row, "CONVERSION")
  output[23] = viewCell(row, "TS Backup")
  output[24] = viewCell(row, "Sales Person Name")
  output[25] = viewCell(row, "Followup Date")
  output[26] = viewCell(row, "ASSUMED GP%")
  output[27] = viewCell(row, "OCCASSION")
  output[28] = viewCell(row, "LOCATION")
  output[29] = viewCell(row, "Inquiry Type")
  output[30] = viewCell(row, "2nd Owner")
  output[31] = viewCell(row, "Back Office")
  output[32] = viewCell(row, "1st Owner")
  output[33] = viewCell(row, "Lead Generator")

  output[42] = viewCell(row, "Avg Profit Margin(%)")
  output[43] = viewCell(row, "Profit Margin Tags")
  output[44] = viewCell(row, "Avg Closure_Days")
  output[45] = viewCell(row, "Big Bulls")

  return output
}

export async function getSupabaseInquiryRows(authorizedEmails: string[]) {
  const supabase = getSupabaseAdminClient()
  const authorizedList = [...new Set(authorizedEmails.map((email) => email.toLowerCase().trim()).filter(Boolean))]
  const rows: InquiryRow[] = []

  if (authorizedList.length === 0) return rows

  const activeInquiryNumbers = new Set<string>()
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await supabase
      .from("inquiries")
      .select("inquiry_no")
      .in("sales_person_email_raw", authorizedList)
      .or("is_active.is.null,is_active.eq.true")
      .range(from, from + PAGE_SIZE - 1)

    if (error) throw error
    if (!data || data.length === 0) break

    for (const row of data as Array<{ inquiry_no: string | number | null }>) {
      const inquiryNo = text(row.inquiry_no).trim()
      if (inquiryNo) activeInquiryNumbers.add(inquiryNo)
    }

    if (data.length < PAGE_SIZE) break
  }

  if (activeInquiryNumbers.size === 0) return rows

  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await supabase
      .from("crm_inquiry_view")
      .select("*")
      .in("Sales Person Email", authorizedList)
      .range(from, from + PAGE_SIZE - 1)

    if (error) throw error
    if (!data || data.length === 0) break

    for (const row of data as CrmInquiryViewRow[]) {
      if (!activeInquiryNumbers.has(viewCell(row, "Inquiry No").trim())) continue
      rows.push(toInquiryRow(row))
    }

    if (data.length < PAGE_SIZE) break
  }

  return rows
}
