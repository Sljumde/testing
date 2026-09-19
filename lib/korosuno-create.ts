import { createHash, randomUUID } from "node:crypto"

export type InquiryCreateMode = "korosuno" | "legacy"

export type KorosunoBusinessPayload = {
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

export type KorosunoCreateResult = {
  ok?: boolean
  success?: boolean
  requestId?: string
  inquiryNo?: string
  created?: boolean
  idempotent?: boolean
  company?: string
  contactName?: string
  actorEmail?: string
  korosunoRow?: number
  status?: string
  stage?: string
  errorCode?: string | null
  errorMessage?: string | null
  timings?: Record<string, unknown>
}

export type KorosunoAppsScriptCall = {
  response: Response | null
  body: KorosunoCreateResult | null
  rawResponse: string
  contentType: string
  durationMs: number
  uncertain: boolean
  errorCode?: string
}

export const CREATE_REQUEST_TIMEOUT_MS = 60_000

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

const REQUIRED_FIELDS: Array<keyof KorosunoBusinessPayload> = [
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

export function getInquiryCreateMode(): InquiryCreateMode {
  return process.env.INQUIRY_CREATE_MODE === "legacy" ? "legacy" : "korosuno"
}

export function getKorosunoConfig() {
  const url = process.env.CRM_APPS_SCRIPT_URL
  const secret = process.env.CRM_APPS_SCRIPT_SECRET
  return { url, secret, configured: Boolean(url && secret) }
}

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

export function normalizeKorosunoBusinessPayload(input: Record<string, unknown>): KorosunoBusinessPayload {
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

export function validateKorosunoBusinessPayload(payload: KorosunoBusinessPayload) {
  const missing = REQUIRED_FIELDS.filter((field) => payload[field] === "")
  if (missing.length > 0) {
    return { valid: false, message: `Missing required fields: ${missing.join(", ")}` }
  }

  if (Number.isNaN(payload.budget) || Number.isNaN(payload.quantity)) {
    return { valid: false, message: "Budget and Quantity must be valid numbers" }
  }

  return { valid: true, message: "" }
}

export function stablePayloadHash(payload: KorosunoBusinessPayload) {
  const stable = Object.keys(payload)
    .sort()
    .reduce<Record<string, unknown>>((acc, key) => {
      acc[key] = payload[key as keyof KorosunoBusinessPayload]
      return acc
    }, {})

  return createHash("sha256").update(JSON.stringify(stable)).digest("hex")
}

export function stableInquiryContentHash(payload: KorosunoBusinessPayload) {
  const { company_id: _companyId, contact_id: _contactId, category_id: _categoryId, ...contentPayload } = payload
  const stable = Object.keys(contentPayload)
    .sort()
    .reduce<Record<string, unknown>>((acc, key) => {
      acc[key] = contentPayload[key as keyof typeof contentPayload]
      return acc
    }, {})

  return createHash("sha256").update(JSON.stringify(stable)).digest("hex")
}

export async function callKorosunoAppsScript(
  action: string,
  body: Record<string, unknown>,
  timeoutMs = CREATE_REQUEST_TIMEOUT_MS,
): Promise<KorosunoAppsScriptCall> {
  const { url, secret, configured } = getKorosunoConfig()
  if (!configured || !url || !secret) {
    return {
      response: null,
      body: {
        ok: false,
        success: false,
        errorCode: "KOROSUNO_CONFIG_MISSING",
        errorMessage: "Apps Script configuration is missing",
      },
      rawResponse: "",
      contentType: "",
      durationMs: 0,
      uncertain: false,
    }
  }

  const startedAt = Date.now()
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), timeoutMs)

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify({ action, secret, ...body }),
      cache: "no-store",
      signal: controller.signal,
    })
    const rawResponse = await response.text()
    const durationMs = Date.now() - startedAt
    const contentType = response.headers.get("content-type") || ""

    if (!rawResponse.trim() || !contentType.toLowerCase().includes("json")) {
      return { response, body: null, rawResponse, contentType, durationMs, uncertain: true, errorCode: "APPS_SCRIPT_UNCERTAIN_RESPONSE" }
    }

    try {
      return { response, body: JSON.parse(rawResponse), rawResponse, contentType, durationMs, uncertain: false }
    } catch {
      return { response, body: null, rawResponse, contentType, durationMs, uncertain: true, errorCode: "APPS_SCRIPT_INVALID_JSON" }
    }
  } catch (error) {
    return {
      response: null,
      body: null,
      rawResponse: "",
      contentType: "",
      durationMs: Date.now() - startedAt,
      uncertain: true,
      errorCode: error instanceof Error && error.name === "AbortError" ? "APPS_SCRIPT_TIMEOUT" : "APPS_SCRIPT_NETWORK_ERROR",
    }
  } finally {
    clearTimeout(timeout)
  }
}
