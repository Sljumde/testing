import { createHash, randomUUID } from "node:crypto"

export type InquiryBusinessPayload = {
  company_id: string
  contact_id: string
  category_id: string
  company: string
  contactName: string
  phone: string
  email: string
  category: string
  details: string
  leadSource: string
  salesStage: string
  updateRemarks: string
  nextSteps: string
  nextFollowupDate: string
  budget: number | ""
  quantity: number | ""
  occasion: string
  location: string
  inquiryType: string
  secondOwner: string
  backOffice: string
  firstOwner: string
  leadGenerator: string
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

const REQUIRED_FIELDS: Array<keyof InquiryBusinessPayload> = [
  "company",
  "contactName",
  "phone",
  "category",
  "salesStage",
  "nextSteps",
  "nextFollowupDate",
  "budget",
  "quantity",
  "occasion",
  "location",
  "inquiryType",
  "secondOwner",
  "backOffice",
  "firstOwner",
  "leadGenerator",
]

function normalizeText(value: unknown) {
  return value == null ? "" : String(value).trim()
}

function normalizeNumberOrBlank(value: unknown): number | "" {
  if (value == null || String(value).trim() === "") return ""
  const parsed = Number(String(value).replace(/,/g, ""))
  if (!Number.isFinite(parsed)) return Number.NaN
  return parsed
}

export function normalizeRequestId(value: unknown) {
  const requestId = normalizeText(value)
  return UUID_PATTERN.test(requestId) ? requestId : randomUUID()
}

export function normalizeInquiryBusinessPayload(input: Record<string, unknown>): InquiryBusinessPayload {
  return {
    company_id: normalizeText(input.company_id),
    contact_id: normalizeText(input.contact_id),
    category_id: normalizeText(input.category_id),
    company: normalizeText(input.company),
    contactName: normalizeText(input.contactName),
    phone: normalizeText(input.phone),
    email: normalizeText(input.email),
    category: normalizeText(input.category),
    details: normalizeText(input.details),
    leadSource: normalizeText(input.leadSource),
    salesStage: normalizeText(input.salesStage),
    updateRemarks: normalizeText(input.updateRemarks),
    nextSteps: normalizeText(input.nextSteps),
    nextFollowupDate: normalizeText(input.nextFollowupDate),
    budget: normalizeNumberOrBlank(input.budget),
    quantity: normalizeNumberOrBlank(input.quantity),
    occasion: normalizeText(input.occasion),
    location: normalizeText(input.location),
    inquiryType: normalizeText(input.inquiryType),
    secondOwner: normalizeText(input.secondOwner),
    backOffice: normalizeText(input.backOffice),
    firstOwner: normalizeText(input.firstOwner),
    leadGenerator: normalizeText(input.leadGenerator),
  }
}

export function validateInquiryBusinessPayload(payload: InquiryBusinessPayload) {
  const missing = REQUIRED_FIELDS.filter((field) => payload[field] === "")
  if (missing.length > 0) {
    return { valid: false, message: `Missing required fields: ${missing.join(", ")}` }
  }

  if (Number.isNaN(payload.budget) || Number.isNaN(payload.quantity)) {
    return { valid: false, message: "Budget and Quantity must be valid numbers" }
  }

  return { valid: true, message: "" }
}

export function stablePayloadHash(payload: InquiryBusinessPayload) {
  const stable = Object.keys(payload)
    .sort()
    .reduce<Record<string, unknown>>((acc, key) => {
      acc[key] = payload[key as keyof InquiryBusinessPayload]
      return acc
    }, {})

  return createHash("sha256").update(JSON.stringify(stable)).digest("hex")
}

export function stableInquiryContentHash(payload: InquiryBusinessPayload) {
  const { company_id: _companyId, contact_id: _contactId, category_id: _categoryId, ...contentPayload } = payload
  const stable = Object.keys(contentPayload)
    .sort()
    .reduce<Record<string, unknown>>((acc, key) => {
      acc[key] = contentPayload[key as keyof typeof contentPayload]
      return acc
    }, {})

  return createHash("sha256").update(JSON.stringify(stable)).digest("hex")
}
