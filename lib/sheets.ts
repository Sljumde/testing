import { google } from "googleapis"
import { validateEnv } from "./env"
import {
  CUSTOMER_COLUMNS,
  type CustomerListItem,
  type CustomerListQuery,
  type CustomerListResult,
  sheetCell,
  toCustomerListItem,
} from "./customer-schema"

let env: ReturnType<typeof validateEnv> | null = null
let sheetsClient: ReturnType<typeof google.sheets> | null = null
const SHEET_CACHE_TTL_MS = 30_000
const sheetCache = new Map<string, { expiresAt: number; values: any[][] }>()

export const CUSTOMER_SHEET_NAME = "SR CUSTOMER DATA"

function getEnv() {
  if (!env) {
    env = validateEnv()
  }
  return env
}

export function getGoogleSheetsClient() {
  if (sheetsClient) return sheetsClient

  const { GOOGLE_SERVICE_ACCOUNT_EMAIL, GOOGLE_PRIVATE_KEY } = getEnv()

  const auth = new google.auth.GoogleAuth({
    credentials: {
      client_email: GOOGLE_SERVICE_ACCOUNT_EMAIL,
      private_key: GOOGLE_PRIVATE_KEY,
    },
    scopes: ["https://www.googleapis.com/auth/spreadsheets"],
  })

  sheetsClient = google.sheets({ version: "v4", auth })
  return sheetsClient
}

export const getSheets = getGoogleSheetsClient

export async function getSheetData(sheetName: string) {
  const cached = sheetCache.get(sheetName)
  if (cached && cached.expiresAt > Date.now()) return cached.values

  const sheets = getGoogleSheetsClient()
  const { GOOGLE_SHEET_ID } = getEnv()

  const response = await sheets.spreadsheets.values.get({
    spreadsheetId: GOOGLE_SHEET_ID,
    range: `${sheetName}!A:ZZ`,
  })

  const values = response.data.values || []
  sheetCache.set(sheetName, { expiresAt: Date.now() + SHEET_CACHE_TTL_MS, values })
  return values
}

export function invalidateSheetCache(sheetName?: string) {
  if (sheetName) {
    sheetCache.delete(sheetName)
    return
  }
  sheetCache.clear()
}

export async function appendSheetData(sheetName: string, values: any[][]) {
  const sheets = getGoogleSheetsClient()
  const { GOOGLE_SHEET_ID } = getEnv()

  const response = await sheets.spreadsheets.values.append({
    spreadsheetId: GOOGLE_SHEET_ID,
    range: `${sheetName}!A:A`,
    valueInputOption: "USER_ENTERED",
    requestBody: {
      values,
    },
  })

  invalidateSheetCache(sheetName)
  return response.data
}

export async function appendToSheet(sheetName: string, row: any[]) {
  await appendSheetData(sheetName, [row])
}

export async function updateSheetData(sheetName: string, range: string, values: any[][]) {
  const sheets = getGoogleSheetsClient()
  const { GOOGLE_SHEET_ID } = getEnv()

  await sheets.spreadsheets.values.update({
    spreadsheetId: GOOGLE_SHEET_ID,
    range: `${sheetName}!${range}`,
    valueInputOption: "USER_ENTERED",
    requestBody: {
      values,
    },
  })
  invalidateSheetCache(sheetName)
}

export async function batchUpdateSheetData(sheetName: string, updates: Array<{ range: string; values: any[][] }>) {
  if (!updates.length) return

  const sheets = getGoogleSheetsClient()
  const { GOOGLE_SHEET_ID } = getEnv()

  await sheets.spreadsheets.values.batchUpdate({
    spreadsheetId: GOOGLE_SHEET_ID,
    requestBody: {
      valueInputOption: "USER_ENTERED",
      data: updates.map((update) => ({
        range: `${sheetName}!${update.range}`,
        values: update.values,
      })),
    },
  })
  invalidateSheetCache(sheetName)
}

const LOCKED_INQUIRY_COLUMNS = [20, 21, 22] as const

function normalizeSheetValue(value: unknown) {
  return value == null ? "" : String(value)
}

function padRowToLength(row: unknown[], length: number) {
  const next = [...row]
  while (next.length < length) {
    next.push("")
  }
  return next
}

export function preserveLockedInquiryColumns(nextRow: unknown[], currentRow: unknown[]) {
  const merged = padRowToLength(nextRow, 36)
  for (const columnIndex of LOCKED_INQUIRY_COLUMNS) {
    merged[columnIndex] = currentRow[columnIndex] ?? ""
  }
  return merged
}

export async function appendInquiryRow(values: unknown[]) {
  const leftSegment = values.slice(0, 20)
  const rightSegment = values.slice(23, 36)
  const appendResult = await appendSheetData("Inquiries", [leftSegment])
  const lastRow = getRowNumberFromRange(appendResult?.updates?.updatedRange)

  if (lastRow) {
    await updateSheetData("Inquiries", `X${lastRow}:AJ${lastRow}`, [rightSegment])
  }

  return { appendResult, lastRow }
}

export async function updateInquiryRowPreservingLockedColumns(rowNumber: number, values: unknown[]) {
  const leftSegment = values.slice(0, 20)
  const rightSegment = values.slice(23, 36)

  await updateSheetData("Inquiries", `A${rowNumber}:T${rowNumber}`, [leftSegment])
  await updateSheetData("Inquiries", `X${rowNumber}:AJ${rowNumber}`, [rightSegment])
}

export async function appendCrucialLogEntries(entries: Array<[string, string, string, string, string, string]>) {
  if (!entries.length) return

  await ensureSheetExists("Crucial")
  await appendSheetData("Crucial", entries.map((entry) => entry.map(normalizeSheetValue)))
}

function escapeSheetName(sheetName: string) {
  return sheetName.replace(/'/g, "''")
}

function getRowNumberFromRange(range?: string | null) {
  const match = range?.match(/![A-Z]+(\d+):/)
  return match ? Number.parseInt(match[1], 10) : null
}

async function ensureSheetExists(sheetName: string) {
  const sheets = getGoogleSheetsClient()
  const { GOOGLE_SHEET_ID } = getEnv()

  const spreadsheet = await sheets.spreadsheets.get({
    spreadsheetId: GOOGLE_SHEET_ID,
    fields: "sheets.properties.title",
  })

  const exists = spreadsheet.data.sheets?.some((sheet) => sheet.properties?.title === sheetName)
  if (exists) return

  try {
    await sheets.spreadsheets.batchUpdate({
      spreadsheetId: GOOGLE_SHEET_ID,
      requestBody: {
        requests: [
          {
            addSheet: {
              properties: {
                title: sheetName,
              },
            },
          },
        ],
      },
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : ""
    if (!message.includes("already exists")) {
      throw error
    }
  }
}

let inquiryCreateQueue = Promise.resolve()

async function runQueued<T>(task: () => Promise<T>): Promise<T> {
  const run = inquiryCreateQueue.then(task, task)
  inquiryCreateQueue = run.then(
    () => undefined,
    () => undefined,
  )
  return run
}

async function allocateInquiryNumber() {
  const sequenceSheetName = "InquirySequence"
  await ensureSheetExists(sequenceSheetName)

  const sheets = getGoogleSheetsClient()
  const { GOOGLE_SHEET_ID } = getEnv()
  const sequenceRangePrefix = `'${escapeSheetName(sequenceSheetName)}'`

  let sequenceData = await getSheetData(sequenceSheetName)

  // Initialize if first time
  if (!sequenceData[0]?.[0]) {
    const inquiriesData = await getSheetData("Inquiries")
    const inquiryNumbers = inquiriesData
      .slice(2)
      .map((row) => Number.parseInt(row[0], 10))
      .filter((n) => !isNaN(n) && n > 0)
    const baseInquiryNo = inquiryNumbers.length > 0 ? Math.max(...inquiryNumbers) : 20000

    await sheets.spreadsheets.values.update({
      spreadsheetId: GOOGLE_SHEET_ID,
      range: `${sequenceRangePrefix}!A1:B1`,
      valueInputOption: "USER_ENTERED",
      requestBody: {
        values: [["COUNTER", baseInquiryNo]],
      },
    })

    sequenceData = [["COUNTER", baseInquiryNo]]
  }

  // Read current counter from B1 (where it's stored)
  let currentCounter = 20000
  if (sequenceData[0]?.[1]) {
    currentCounter = Number.parseInt(sequenceData[0][1], 10) || 20000
  }

  // Increment counter by 1
  const nextInquiryNo = currentCounter + 1

  // Write new counter value back to B1
  await sheets.spreadsheets.values.update({
    spreadsheetId: GOOGLE_SHEET_ID,
    range: `${sequenceRangePrefix}!B1`,
    valueInputOption: "USER_ENTERED",
    requestBody: {
      values: [[nextInquiryNo]],
    },
  })

  return nextInquiryNo
}

export async function getUserRoleInfo(userEmail: string) {
  const data = await getSheetData("UserRoles")

  if (data.length <= 1) {
    return {
      userEmail,
      role: "EMPLOYEE",
      reportsTo: "",
      teamMembers: [],
      authorizedEmails: [userEmail],
    }
  }

  const headers = data[0]
  const rows = data.slice(1)

  const userRoleMap = new Map()
  const reportsToMap = new Map<string, string[]>()

  rows.forEach((row) => {
    if (row[0]) {
      const email = row[0].toString().toLowerCase().trim()
      userRoleMap.set(email, {
        role: row[1] || "EMPLOYEE",
        reportsTo: row[2] || "",
      })

      if (row[2]) {
        // Split by comma to support multiple managers
        const managerEmails = row[2]
          .toString()
          .split(",")
          .map((m: string) => m.toLowerCase().trim())
          .filter((m: string) => m.length > 0)

        managerEmails.forEach((managerEmail: string) => {
          if (!reportsToMap.has(managerEmail)) {
            reportsToMap.set(managerEmail, [])
          }
          reportsToMap.get(managerEmail)!.push(email)
        })
      }
    }
  })

  const userKey = userEmail.toLowerCase().trim()
  const userData = userRoleMap.get(userKey) || { role: "EMPLOYEE", reportsTo: "" }

  let authorizedEmails = [userEmail]
  let teamMembers: any[] = []

  if (userData.role === "BOSS") {
    authorizedEmails = Array.from(userRoleMap.keys())
    teamMembers = rows
      .filter((row) => row[1] === "HEAD" || row[1] === "EMPLOYEE")
      .map((row) => ({ email: row[0], role: row[1], reportsTo: row[2] }))
  } else if (userData.role === "HEAD") {
    teamMembers = (reportsToMap.get(userKey) || []).map((email) => ({
      email: email,
      role: userRoleMap.get(email)?.role || "EMPLOYEE",
      reportsTo: userRoleMap.get(email)?.reportsTo || "",
    }))

    authorizedEmails = [userEmail, ...(reportsToMap.get(userKey) || [])]
    console.log("[v0] HEAD user:", userEmail, "reportsToMap:", reportsToMap.get(userKey), "authorizedEmails:", authorizedEmails)
  }

  return {
    userEmail,
    role: userData.role,
    reportsTo: userData.reportsTo,
    teamMembers,
    authorizedEmails,
  }
}

export async function validateLogin(email: string, password: string) {
  const data = await getSheetData("Users")

  if (data.length <= 1) {
    return { success: false, message: "Users sheet not found" }
  }

  const rows = data.slice(1)
  const credentials: Record<string, string> = {}

  rows.forEach((row) => {
    const storedEmail = row[0]
    const storedPassword = row[1] ? row[1].toString() : ""
    credentials[storedEmail] = storedPassword
  })

  if (credentials[email] && credentials[email] === password) {
    const roleInfo = await getUserRoleInfo(email)

    // Log login attempt
    await logUserLogin(email, true)

    return {
      success: true,
      message: "Login successful",
      userEmail: email,
      role: roleInfo.role,
      teamCount: roleInfo.teamMembers.length,
    }
  }

  await logUserLogin(email, false)
  return {
    success: false,
    message: "Invalid email or password",
  }
}

async function logUserLogin(email: string, success: boolean) {
  try {
    const timestamp = new Date().toLocaleString("en-IN", { timeZone: "Asia/Kolkata" })
    const status = success ? "SUCCESS" : "FAILED"

    await appendSheetData("LoginLogs", [[timestamp, email, status, "N/A", "N/A"]])
  } catch (error) {
    console.error("Error logging login attempt:", error)
  }
}

export async function getInquiryData(authorizedEmails: string[]) {
  const data = await getSheetData("Inquiries")

  if (data.length < 3) return []

  const rows = data.slice(2)
  const authorizedSet = new Set(authorizedEmails.map((email) => email.toLowerCase().trim()))

  return rows.filter((row) => {
    const salesPersonEmail = (row[9] || "").toString().trim().toLowerCase()
    return authorizedSet.has(salesPersonEmail)
  })
}

export async function getCustomerData(authorizedEmails: string[], canViewAll = false) {
  const data = await getSheetData(CUSTOMER_SHEET_NAME)

  if (data.length < 2) return []

  const rows = data.slice(1)
  const authorizedSet = new Set(authorizedEmails.map((email) => email.toLowerCase().trim()))

  if (canViewAll) return rows

  return rows.filter((row) => {
    const owners = sheetCell(row, CUSTOMER_COLUMNS.ownershipEmails)
      .split(",").map((email) => email.trim().toLowerCase()).filter(Boolean)
    return owners.some((email) => authorizedSet.has(email))
  })
}

export async function getCustomerPage(
  authorizedEmails: string[],
  query: CustomerListQuery,
  canViewAll = false,
): Promise<CustomerListResult> {
  const data = await getSheetData(CUSTOMER_SHEET_NAME)
  const authorizedSet = new Set(authorizedEmails.map((email) => email.toLowerCase().trim()))
  const search = query.search.toLowerCase()

  const items = data
    .slice(1)
    .filter((row: unknown[]) => {
      if (canViewAll) return true
      const owners = sheetCell(row, CUSTOMER_COLUMNS.ownershipEmails)
        .split(",").map((email) => email.trim().toLowerCase()).filter(Boolean)
      return owners.some((email) => authorizedSet.has(email))
    })
    .map((row: unknown[]) => toCustomerListItem(row))

  const matchesRange = (value: string, range: string) => {
    if (!range) return true
    const numeric = Number(value.replace(/[^\d.-]/g, ""))
    if (Number.isNaN(numeric)) return false
    switch (range) {
      case "0-1lac": return numeric >= 0 && numeric < 100000
      case "1-5lac": return numeric >= 100000 && numeric < 500000
      case "5-10lac": return numeric >= 500000 && numeric < 1000000
      case "10-25lac": return numeric >= 1000000 && numeric < 2500000
      case "25-50lac": return numeric >= 2500000 && numeric < 5000000
      case "50lac-1cr": return numeric >= 5000000 && numeric < 10000000
      case "1cr+": return numeric >= 10000000
      case "0-500": return numeric >= 0 && numeric < 500
      case "500-1k": return numeric >= 500 && numeric < 1000
      case "1k-2k": return numeric >= 1000 && numeric < 2000
      case "2k-4k": return numeric >= 2000 && numeric < 4000
      case "4k-6k": return numeric >= 4000 && numeric < 6000
      case "6k-10k": return numeric >= 6000 && numeric < 10000
      default: return true
    }
  }
  const filterOptions = {
    companies: [...new Set(items.map((item) => item.company).filter(Boolean))].sort((a, b) => a.localeCompare(b, "en", { sensitivity: "base" })),
    cities: [...new Set(items.map((item) => item.city).filter(Boolean))].sort((a, b) => a.localeCompare(b, "en", { sensitivity: "base" })),
    states: [...new Set(items.map((item) => item.state).filter(Boolean))].sort((a, b) => a.localeCompare(b, "en", { sensitivity: "base" })),
    categories: [...new Set(items.map((item) => item.clientCategory).filter(Boolean))].sort((a, b) => a.localeCompare(b, "en", { sensitivity: "base" })),
  }

  const filteredItems = items
    .filter((customer) => {
      if (query.company.length > 0 && !query.company.some((value) => customer.company.toLowerCase() === value.toLowerCase())) return false
      if (query.city.length > 0 && !query.city.some((value) => customer.city.toLowerCase() === value.toLowerCase())) return false
      if (query.state.length > 0 && !query.state.some((value) => customer.state.toLowerCase() === value.toLowerCase())) return false
      if (query.clientCategory.length > 0 && !query.clientCategory.some((value) => customer.clientCategory.toLowerCase() === value.toLowerCase())) return false
      if (!matchesRange(customer.revenue, query.revenueRange)) return false
      if (!matchesRange(customer.sampleCost, query.sampleCostRange)) return false
      if (!search) return true
      return [
        customer.customerCode,
        customer.company,
        customer.contactName,
        customer.phone,
        customer.email,
        customer.inquiries,
        customer.revenue,
      ].some((value) => value.toLowerCase().includes(search))
    })

  filteredItems.sort((left, right) => {
    const numericFields = new Set(["phone", "inquiries", "sampleCost", "conversion", "revenue", "avgGp", "successRatio"])
    const cleanNumber = (value: string) => Number(value.replace(/[^\d.-]/g, "")) || 0
    const leftValue = left[query.sort]
    const rightValue = right[query.sort]
    const comparison = numericFields.has(query.sort)
      ? cleanNumber(leftValue) - cleanNumber(rightValue)
      : leftValue.localeCompare(rightValue, "en", { numeric: true, sensitivity: "base" })
    if (comparison !== 0) return query.direction === "asc" ? comparison : -comparison
    return left.company.localeCompare(right.company, "en", { numeric: true, sensitivity: "base" })
  })

  const total = filteredItems.length
  const totalPages = Math.max(1, Math.ceil(total / query.pageSize))
  const page = Math.min(query.page, totalPages)
  const start = (page - 1) * query.pageSize

  return {
    items: filteredItems.slice(start, start + query.pageSize).map((item, index) => ({ ...item, rowNumber: start + index + 1 })),
    page,
    pageSize: query.pageSize,
    total,
    totalPages,
    filterOptions,
  }
}

export async function getAuthorizedCustomer(
  customerCode: string,
  authorizedEmails: string[],
  canViewAll = false,
): Promise<CustomerListItem | null> {
  const data = await getSheetData(CUSTOMER_SHEET_NAME)
  const authorizedSet = new Set(authorizedEmails.map((email) => email.toLowerCase().trim()))
  const row = data.slice(1).find((candidate: unknown[]) => {
    return (
      sheetCell(candidate, CUSTOMER_COLUMNS.phone) === customerCode &&
      (canViewAll || sheetCell(candidate, CUSTOMER_COLUMNS.ownershipEmails)
        .split(",").map((email) => email.trim().toLowerCase()).filter(Boolean)
        .some((email) => authorizedSet.has(email)))
    )
  })

  return row ? toCustomerListItem(row) : null
}

export async function saveNewInquiry(formData: any) {
  return runQueued(async () => {
    const { GOOGLE_SHEET_ID } = getEnv()
    const newInquiryNo = await allocateInquiryNumber()
    const currentTimestamp = new Date().toLocaleString("en-IN", { timeZone: "Asia/Kolkata" })
    const quantity = Number.parseFloat(formData.quantity) || 0
    const budget = Number.parseFloat(formData.budget) || 0

    const row = new Array(36).fill("")

    row[0] = String(newInquiryNo)
    row[1] = currentTimestamp
    row[2] = formData.company || ""
    row[3] = formData.contactName || ""
    row[4] = formData.phone || ""
    row[5] = formData.email || ""
    row[6] = formData.category || ""
    row[7] = formData.details || ""
    row[8] = formData.leadSource || ""
    row[9] = formData.salesPersonEmail || ""
    row[10] = formData.salesStage || ""
    row[11] = formData.updateRemarks || ""
    row[12] = formData.nextSteps || ""
    row[13] = formData.nextFollowupDate || ""
    row[14] = budget
    row[15] = quantity
    row[19] = formData.delaydays || ""
    row[23] = currentTimestamp // TS Backup
    row[27] = formData.occasion || ""
    row[28] = formData.location || ""
    row[29] = formData.inquiryType || ""
    row[30] = formData.secondOwner || ""
    row[31] = formData.backOffice || ""
    row[32] = formData.firstOwner || ""
    row[33] = formData.leadGenerator || ""
    // row[34] is empty now (was leadQualifier)
    row[35] = "Registered" // Status column

    const { lastRow } = await appendInquiryRow(row)

    if (lastRow) {
      const sheets = getGoogleSheetsClient()
      await sheets.spreadsheets.values.update({
        spreadsheetId: GOOGLE_SHEET_ID,
        range: `Inquiries!Q${lastRow}`,
        valueInputOption: "USER_ENTERED",
        requestBody: {
          values: [[`=IF(AND(ISNUMBER(P${lastRow}), ISNUMBER(O${lastRow})), P${lastRow}*O${lastRow}, "")`]],
        },
      })
    }

    // Also push to BACKUP sheet
    await appendSheetData("BACKUP", [row])

    return {
      success: true,
      message: `Inquiry #${newInquiryNo} saved successfully.`,
      inquiryNo: newInquiryNo,
    }
  })
}

export async function addNewCustomer(customerData: any) {
  const data = await getSheetData(CUSTOMER_SHEET_NAME)
  const { GOOGLE_SHEET_ID } = getEnv()

  let maxNumber = 750

  for (let i = 1; i < data.length; i++) {
    const code = data[i][0]
    if (code && typeof code === "string" && code.startsWith("V")) {
      const numberPart = Number.parseInt(code.slice(1))
      if (!isNaN(numberPart) && numberPart > maxNumber) {
        maxNumber = numberPart
      }
    }
  }

  const newCustomerCode = "V" + (maxNumber + 1)
  const rowData = new Array(52).fill("")

  rowData[0] = newCustomerCode
  rowData[2] = customerData.company
  rowData[5] = customerData.address
  rowData[6] = customerData.city
  rowData[7] = customerData.pinCode
  rowData[8] = customerData.state
  rowData[9] = customerData.contactPerson
  rowData[10] = customerData.designation
  rowData[11] = customerData.phone
  rowData[12] = customerData.email
  rowData[38] = customerData.notes
  rowData[42] = customerData.salesPersonEmail
  rowData[49] = customerData.leadOwnership
  rowData[50] = customerData.clientCategory

  await appendSheetData(CUSTOMER_SHEET_NAME, [rowData])

  return {
    success: true,
    message: "Customer added successfully",
    customerCode: newCustomerCode,
  }
}

export const addCustomer = addNewCustomer

export async function getDropdownData() {
  const data = await getSheetData("DropdownData")

  if (data.length < 1) return {}

  const headers = data[0]
  const dropdownData: Record<string, string[]> = {}
  const canonicalHeaders: Record<string, string> = {
    category: "Category",
    leadsource: "LeadSource",
    salesstage: "SalesStage",
    nextsteps: "NextSteps",
    occasion: "Occasion",
    location: "Location",
    inquirytype: "InquiryType",
    secondowner: "SecondOwner",
    "2ndowner": "SecondOwner",
    backoffice: "BackOffice",
    firstowner: "FirstOwner",
    "1stowner": "FirstOwner",
    leadgenerator: "LeadGenerator",
    salesperson: "SalesPerson",
    company: "Company",
    contact: "Contact",
    email: "Email",
  }

  headers.forEach((header, colIndex) => {
    if (!header || header.toString().trim() === "") return

    const headerName = header.toString().trim()
    const normalizedHeader = headerName.toLowerCase().replace(/[^a-z0-9]/g, "")
    const canonicalHeader = canonicalHeaders[normalizedHeader] || headerName
    const values = new Set<string>()
    for (let i = 1; i < data.length; i++) {
      const value = data[i][colIndex]
      if (value && value.toString().trim() !== "") {
        values.add(value.toString().trim())
      }
    }

    const options = Array.from(values).sort()
    dropdownData[canonicalHeader] = options
    if (canonicalHeader !== headerName) {
      dropdownData[headerName] = options
    }
  })

  return dropdownData
}

export async function getCompanyContacts() {
  const data = await getSheetData("CompanyContacts")

  if (data.length < 2) return []

  const headers = data[0]
  const contacts: Array<{
    company: string
    contactName: string
    phone: string
    email: string
  }> = []

  const companyIdx = headers.findIndex((h) => h?.toString().toLowerCase() === "company name")
  const contactNameIdx = headers.findIndex((h) => h?.toString().toLowerCase() === "contact name")
  const phoneIdx = headers.findIndex((h) => h?.toString().toLowerCase() === "phone")
  const emailIdx = headers.findIndex((h) => h?.toString().toLowerCase() === "email")

  for (let i = 1; i < data.length; i++) {
    const row = data[i]
    if (row[companyIdx] && row[contactNameIdx]) {
      contacts.push({
        company: row[companyIdx]?.toString().trim() || "",
        contactName: row[contactNameIdx]?.toString().trim() || "",
        phone: row[phoneIdx]?.toString().trim() || "",
        email: row[emailIdx]?.toString().trim() || "",
      })
    }
  }

  return contacts
}
