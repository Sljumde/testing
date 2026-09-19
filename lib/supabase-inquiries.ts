import "server-only"

import { getSupabaseAdminClient } from "@/lib/supabase/server"

export type InquiryRow = string[]
export type InquiryPageResult = {
  items: InquiryRow[]
  page: number
  pageSize: number
  total: number
  totalPages: number
}
export type InquiryPageFilters = {
  inquiryNo?: string[]
  company?: string[]
  salesStage?: string[]
  salesPersonEmail?: string[]
  followupDateFrom?: string
  followupDateTo?: string
}

type CrmInquiryViewRow = Record<string, unknown>

const PAGE_SIZE = 1000
const INQUIRY_ROW_LENGTH = 46
const DEFAULT_PAGE_SIZE = 50
const MAX_PAGE_SIZE = 100

const VIEW_SELECT_COLUMNS = [
  '"Inquiry No"',
  '"Timestamp"',
  '"Company"',
  '"Contact Name"',
  '"Phone"',
  '"Email"',
  '"Category"',
  '"Details"',
  '"Lead Source"',
  '"Sales Person Email"',
  '"Sales Stage"',
  '"Update Remarks"',
  '"Next Steps"',
  '"Next Followup Date"',
  '"Budget"',
  '"Quantity"',
  '"Est Order Value"',
  '"Attachments"',
  '"Delay Days"',
  '"Weighted Forecast"',
  '"Sampe Cost"',
  '"REVENUE"',
  '"CONVERSION"',
  '"TS Backup"',
  '"Sales Person Name"',
  '"Followup Date"',
  '"ASSUMED GP%"',
  '"OCCASSION"',
  '"LOCATION"',
  '"Inquiry Type"',
  '"2nd Owner"',
  '"Back Office"',
  '"1st Owner"',
  '"Lead Generator"',
  '"Avg Profit Margin(%)"',
  '"Profit Margin Tags"',
  '"Avg Closure_Days"',
  '"Big Bulls"',
].join(",")

function text(value: unknown) {
  return value == null ? "" : String(value)
}

function cleanList(values?: string[]) {
  return [...new Set((values || []).map((value) => value.trim()).filter(Boolean))]
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

export async function getSupabaseInquiryPage(
  authorizedEmails: string[],
  input: { page?: number; pageSize?: number; sort?: string; filters?: InquiryPageFilters } = {},
): Promise<InquiryPageResult> {
  const supabase = getSupabaseAdminClient()
  const authorizedList = [...new Set(authorizedEmails.map((email) => email.toLowerCase().trim()).filter(Boolean))]
  const pageSize = Math.max(1, Math.min(MAX_PAGE_SIZE, input.pageSize || DEFAULT_PAGE_SIZE))
  const requestedPage = Math.max(1, input.page || 1)

  if (authorizedList.length === 0) {
    return { items: [], page: 1, pageSize, total: 0, totalPages: 1 }
  }

  const ascending = input.sort?.endsWith(".asc") || false
  const orderColumn =
    input.sort?.startsWith("timestamp.") ? "inquiry_timestamp" :
    input.sort?.startsWith("company.") ? "company_name_raw" :
    input.sort?.startsWith("salesStage.") ? "sales_stage" :
    input.sort?.startsWith("salesPerson.") ? "sales_person_email_raw" :
    input.sort?.startsWith("followupDate.") ? "next_followup_date" :
    "inquiry_no"
  const from = (requestedPage - 1) * pageSize
  const to = from + pageSize - 1
  const filters = input.filters || {}
  const filterInquiryNos = cleanList(filters.inquiryNo)
  const filterCompanies = cleanList(filters.company)
  const filterSalesStages = cleanList(filters.salesStage)
  const filterSalesPeople = cleanList(filters.salesPersonEmail).map((email) => email.toLowerCase())

  let query = supabase
    .from("inquiries")
    .select("inquiry_no", { count: "exact" })
    .in("sales_person_email_raw", authorizedList)
    .or("is_active.is.null,is_active.eq.true")

  if (filterInquiryNos.length) query = query.in("inquiry_no", filterInquiryNos)
  if (filterCompanies.length) query = query.in("company_name_raw", filterCompanies)
  if (filterSalesStages.length) query = query.in("sales_stage", filterSalesStages)
  if (filterSalesPeople.length) query = query.in("sales_person_email_raw", filterSalesPeople)
  if (filters.followupDateFrom) query = query.gte("next_followup_date", filters.followupDateFrom)
  if (filters.followupDateTo) query = query.lte("next_followup_date", filters.followupDateTo)

  const { data: activePage, error, count } = await query
    .order(orderColumn, { ascending, nullsFirst: false })
    .range(from, to)

  if (error) throw error

  const total = count || 0
  const totalPages = Math.max(1, Math.ceil(total / pageSize))
  const page = Math.min(requestedPage, totalPages)
  const inquiryNumbers = ((activePage || []) as Array<{ inquiry_no: string | number | null }>)
    .map((row) => text(row.inquiry_no).trim())
    .filter(Boolean)

  if (inquiryNumbers.length === 0) {
    return { items: [], page, pageSize, total, totalPages }
  }

  const { data: viewRows, error: viewError } = await supabase
    .from("crm_inquiry_view")
    .select(VIEW_SELECT_COLUMNS)
    .in("Inquiry No", inquiryNumbers)

  if (viewError) throw viewError

  const rowByInquiryNo = new Map(
    ((viewRows || []) as unknown as CrmInquiryViewRow[]).map((row) => [viewCell(row, "Inquiry No").trim(), toInquiryRow(row)]),
  )

  return {
    items: inquiryNumbers.map((inquiryNo) => rowByInquiryNo.get(inquiryNo)).filter((row): row is InquiryRow => Boolean(row)),
    page,
    pageSize,
    total,
    totalPages,
  }
}
