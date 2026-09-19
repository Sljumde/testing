import "server-only"

import type { InquiryBusinessPayload } from "@/lib/inquiry-create"
import { getSupabaseAdminClient } from "@/lib/supabase/server"
import type { SupabaseClient } from "@supabase/supabase-js"

type EmployeeRow = {
  emp_id?: number | string | null
  email_id?: string | null
  emp_full_name?: string | null
  emp_name?: string | null
}

type SyncInquiryInput = {
  inquiryNo: string
  actorEmail: string
  requestId: string
  payload: InquiryBusinessPayload
}

type DirectInquiryResult = {
  inquiryNo: string
  company?: string
  contactName?: string
}

type DirectInquiryInput = Omit<SyncInquiryInput, "inquiryNo"> & {
  supabase: SupabaseClient
}

function clean(value: unknown) {
  const text = value == null ? "" : String(value).trim()
  return text || null
}

function numericValue(value: number | "" | null | undefined) {
  return typeof value === "number" && Number.isFinite(value) ? value : null
}

function rawNumber(value: number | "" | null | undefined) {
  return value === "" || value == null || Number.isNaN(value) ? null : String(value)
}

function idValue(value: unknown) {
  return clean(value)
}

function inquiryNoValue(value: string) {
  return clean(value)
}

function normalizeEmail(value: unknown) {
  const text = clean(value)
  return text ? text.toLowerCase() : null
}

function serializeSupabaseError(error: unknown) {
  if (!error || typeof error !== "object") return { message: String(error) }
  const value = error as { message?: string; code?: string; details?: string; hint?: string }
  return {
    message: value.message || "Supabase inquiry sync failed",
    code: value.code || "",
    details: value.details || null,
    hint: value.hint || null,
  }
}

function isUniqueViolation(error: unknown) {
  if (!error || typeof error !== "object") return false
  return (error as { code?: string }).code === "23505"
}

function employeeId(row: EmployeeRow | null | undefined) {
  return row?.emp_id ?? null
}

function employeeName(row: EmployeeRow | null | undefined) {
  return clean(row?.emp_full_name) || clean(row?.emp_name)
}

async function getEmployeeByEmail(supabase: SupabaseClient, email: string | null) {
  if (!email) return null

  const { data, error } = await supabase
    .from("employees")
    .select("emp_id, email_id, emp_full_name, emp_name")
    .eq("email_id", email)
    .eq("is_active", true)
    .limit(1)
    .maybeSingle()

  if (error) {
    console.error("[inquiry-supabase-sync] employee lookup", {
      email,
      error: serializeSupabaseError(error),
    })
    return null
  }

  return (data as EmployeeRow | null) || null
}

async function getEmployeeByExactName(supabase: SupabaseClient, name: string | null) {
  if (!name) return null

  const normalizedName = name.toUpperCase()
  const { data, error } = await supabase
    .from("employees")
    .select("emp_id, email_id, emp_full_name, emp_name")
    .eq("is_active", true)
    .or(`emp_name.eq.${normalizedName},emp_full_name.eq.${normalizedName}`)
    .limit(1)
    .maybeSingle()

  if (error) {
    console.error("[inquiry-supabase-sync] employee owner lookup", {
      owner: name,
      error: serializeSupabaseError(error),
    })
    return null
  }

  return (data as EmployeeRow | null) || null
}

async function getOwnerEmployeeId(supabase: SupabaseClient, rawOwner: string) {
  const owner = clean(rawOwner)
  if (!owner) return null

  const ownerEmail = normalizeEmail(owner)
  if (ownerEmail?.includes("@")) {
    const employee = await getEmployeeByEmail(supabase, ownerEmail)
    return employeeId(employee)
  }

  const employee = await getEmployeeByExactName(supabase, owner)
  return employeeId(employee)
}

async function buildSupabaseInquiryPayload({
  supabase,
  inquiryNo,
  actorEmail,
  payload,
}: SyncInquiryInput & { supabase: SupabaseClient }) {
  const salesPersonEmail = normalizeEmail(actorEmail)
  const salesperson = await getEmployeeByEmail(supabase, salesPersonEmail)
  const salesPersonEmpId = employeeId(salesperson)
  const nextFollowupDate = clean(payload.nextFollowupDate)
  const syncedAt = new Date().toISOString()

  return {
    inquiry_no: inquiryNoValue(inquiryNo),
    inquiry_timestamp: syncedAt,

    company_id: idValue(payload.company_id),
    company_name_raw: clean(payload.company),

    contact_id: idValue(payload.contact_id),
    contact_name_raw: clean(payload.contactName),
    phone_raw: clean(payload.phone),
    email_raw: clean(payload.email),

    category_id: idValue(payload.category_id),
    category_raw: clean(payload.category),

    details: clean(payload.details),
    lead_source: clean(payload.leadSource),

    sales_person_emp_id: salesPersonEmpId,
    sales_person_email_raw: salesPersonEmail,
    sales_person_name_raw: employeeName(salesperson),

    sales_stage: clean(payload.salesStage),
    update_remarks: clean(payload.updateRemarks),
    next_steps: clean(payload.nextSteps),
    next_followup_date: nextFollowupDate,

    budget: numericValue(payload.budget),
    budget_raw: rawNumber(payload.budget),

    quantity: numericValue(payload.quantity),
    quantity_raw: rawNumber(payload.quantity),

    est_order_value: null,
    attachments: null,
    delay_days: null,

    weighted_forecast: null,
    weighted_forecast_value: null,

    sample_cost: null,
    revenue: null,
    conversion: null,

    ts_backup: null,
    followup_date: nextFollowupDate,
    followup_date_raw: nextFollowupDate,
    assumed_gp_percent: null,

    occasion: clean(payload.occasion),
    location: clean(payload.location),
    inquiry_type: clean(payload.inquiryType),

    second_owner_emp_id: await getOwnerEmployeeId(supabase, payload.secondOwner),
    second_owner_raw: clean(payload.secondOwner),

    back_office_emp_id: await getOwnerEmployeeId(supabase, payload.backOffice),
    back_office_raw: clean(payload.backOffice),

    first_owner_emp_id: await getOwnerEmployeeId(supabase, payload.firstOwner),
    first_owner_raw: clean(payload.firstOwner),

    lead_generator_emp_id: await getOwnerEmployeeId(supabase, payload.leadGenerator),
    lead_generator_raw: clean(payload.leadGenerator),

    created_by_emp_id: salesPersonEmpId,
  }
}

async function allocateInquiryNo(supabase: SupabaseClient) {
  const { data, error } = await supabase.rpc("next_inquiry_no")

  if (error) {
    console.error("[inquiry-supabase-create] inquiry number allocation failed", serializeSupabaseError(error))
    throw error
  }

  const inquiryNo = clean(data)
  if (!inquiryNo) throw new Error("Supabase did not return an inquiry number")
  return inquiryNo
}

export async function createSupabaseInquiry({
  supabase,
  actorEmail,
  requestId,
  payload,
}: DirectInquiryInput): Promise<DirectInquiryResult> {
  for (let attempt = 1; attempt <= 5; attempt += 1) {
    const inquiryNo = await allocateInquiryNo(supabase)
    const insertPayload = await buildSupabaseInquiryPayload({ supabase, inquiryNo, actorEmail, requestId, payload })

    const { error } = await supabase
      .from("inquiries")
      .insert(insertPayload)

    if (!error) {
      return {
        inquiryNo,
        company: payload.company,
        contactName: payload.contactName,
      }
    }

    if (isUniqueViolation(error)) continue

    console.error("[inquiry-supabase-create]", {
      requestId,
      inquiryNo,
      company_id: payload.company_id || null,
      contact_id: payload.contact_id || null,
      error: serializeSupabaseError(error),
    })
    throw error
  }

  throw new Error("Unable to allocate a unique Supabase inquiry number after retries")
}
