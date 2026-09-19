export const CUSTOMER_COLUMNS = {
  cid: 0,
  company: 1,
  contactName: 2,
  phone: 3,
  email: 4,
  inquiries: 5,
  sampleCost: 6,
  conversion: 7,
  revenue: 8,
  avgGp: 9,
  successRatio: 10,
  ownershipEmails: 11,
  city: 12,
  state: 13,
  category: 14,
} as const

export interface CustomerListItem {
  rowNumber?: number
  customerCode: string
  cid: string
  company: string
  city: string
  state: string
  contactName: string
  designation: string
  phone: string
  email: string
  inquiries: string
  sampleCost: string
  conversion: string
  revenue: string
  avgGp: string
  successRatio: string
  ownershipEmails: string
  salesPersonEmail: string
  leadOwnership: string
  clientCategory: string
}

export type CustomerSortField =
  | "company"
  | "contactName"
  | "phone"
  | "email"
  | "inquiries"
  | "sampleCost"
  | "conversion"
  | "revenue"
  | "avgGp"
  | "successRatio"

export interface CustomerListQuery {
  page: number
  pageSize: 15
  search: string
  company: string[]
  city: string[]
  state: string[]
  clientCategory: string[]
  revenueRange: string
  sampleCostRange: string
  sort: CustomerSortField
  direction: "asc" | "desc"
}

export interface CustomerListResult {
  items: CustomerListItem[]
  page: number
  pageSize: 15
  total: number
  totalPages: number
  filterOptions: { companies: string[]; cities: string[]; states: string[]; categories: string[] }
}

export function sheetCell(row: unknown[], index: number): string {
  const value = row[index]
  return value == null ? "" : String(value).trim()
}

export function toCustomerListItem(row: unknown[]): CustomerListItem {
  return {
    customerCode: sheetCell(row, CUSTOMER_COLUMNS.phone),
    cid: sheetCell(row, CUSTOMER_COLUMNS.cid),
    company: sheetCell(row, CUSTOMER_COLUMNS.company),
    city: sheetCell(row, CUSTOMER_COLUMNS.city),
    state: sheetCell(row, CUSTOMER_COLUMNS.state),
    contactName: sheetCell(row, CUSTOMER_COLUMNS.contactName),
    phone: sheetCell(row, CUSTOMER_COLUMNS.phone),
    email: sheetCell(row, CUSTOMER_COLUMNS.email),
    inquiries: sheetCell(row, CUSTOMER_COLUMNS.inquiries),
    sampleCost: sheetCell(row, CUSTOMER_COLUMNS.sampleCost),
    conversion: sheetCell(row, CUSTOMER_COLUMNS.conversion),
    revenue: sheetCell(row, CUSTOMER_COLUMNS.revenue),
    avgGp: sheetCell(row, CUSTOMER_COLUMNS.avgGp),
    successRatio: sheetCell(row, CUSTOMER_COLUMNS.successRatio),
    ownershipEmails: sheetCell(row, CUSTOMER_COLUMNS.ownershipEmails),
    salesPersonEmail: sheetCell(row, CUSTOMER_COLUMNS.ownershipEmails),
    leadOwnership: sheetCell(row, CUSTOMER_COLUMNS.ownershipEmails),
    clientCategory: sheetCell(row, CUSTOMER_COLUMNS.category),
    designation: "",
  }
}

export function normalizeIndianPhone(value: string): string | null {
  const compact = value.trim().replace(/[\s().-]/g, "")
  if (/^[6-9]\d{9}$/.test(compact)) return `+91${compact}`
  if (/^91[6-9]\d{9}$/.test(compact)) return `+${compact}`
  if (/^\+91[6-9]\d{9}$/.test(compact)) return compact
  return /^\+\d{8,15}$/.test(compact) ? compact : null
}
