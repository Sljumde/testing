import { NextResponse } from "next/server"
import { getServerSession } from "@/lib/auth"
import { getUserRoleInfo } from "@/lib/sheets"
import { getAuthenticatedSupabaseServerClient } from "@/lib/supabase/server"
import { createAppLogger, type AppLogger } from "@/lib/app-logger"
import type { SupabaseClient } from "@supabase/supabase-js"

const INQUIRY_COLUMN_COUNT = 46
const EDITABLE_COLUMNS = new Set([2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 29, 30, 31, 32, 33])
const HEAD_EDITABLE_COLUMNS = new Set([2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15])
const EMPLOYEE_EDITABLE_COLUMNS = new Set([2, 3, 4, 5, 6, 7, 8, 10, 11, 12, 13, 14, 15])
const NUMERIC_COLUMNS = new Set([14, 15])
const TEXT_COLUMNS = new Set([2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 29, 30, 31, 32, 33])
const COLUMN_LETTERS = [
  "A", "B", "C", "D", "E", "F", "G", "H", "I", "J", "K", "L",
  "M", "N", "O", "P", "Q", "R", "S", "T", "U", "V", "W", "X",
  "Y", "Z", "AA", "AB", "AC", "AD", "AE", "AF", "AG", "AH", "AI", "AJ",
]

const FIELD_LABELS = new Map<number, string>([
  [2, "Company"],
  [3, "Contact Name"],
  [4, "Phone"],
  [5, "Email"],
  [6, "Category"],
  [7, "Details"],
  [8, "Lead Source"],
  [9, "Sales Person"],
  [10, "Sales Stage"],
  [11, "Update Remarks"],
  [12, "Next Steps"],
  [13, "Next Followup Date"],
  [14, "Budget"],
  [15, "Quantity"],
  [29, "Inquiry Type"],
  [30, "2nd Owner"],
  [31, "Back Office"],
  [32, "1st Owner"],
  [33, "Lead Generator"],
])

type EmployeeRow = {
  emp_id: number | string
  email_id: string | null
  emp_full_name: string | null
  emp_name: string | null
}

type InquiryRecord = Record<string, unknown>

function asText(value: unknown) {
  return value == null ? "" : String(value)
}

function clean(value: unknown) {
  const text = asText(value).trim()
  return text || null
}

function normalizeTextCell(value: unknown) {
  const text = asText(value)
  return /^[=+\-@]/.test(text) ? `'${text}` : text
}

function normalizeEditableCell(columnIndex: number, value: unknown) {
  if (NUMERIC_COLUMNS.has(columnIndex)) {
    const text = asText(value).trim()
    if (!text) return { ok: true as const, value: "" }
    const numeric = Number(text.replace(/,/g, ""))
    if (!Number.isFinite(numeric)) {
      return { ok: false as const, message: `Invalid numeric value in column ${COLUMN_LETTERS[columnIndex]}` }
    }
    return { ok: true as const, value: numeric }
  }

  if (TEXT_COLUMNS.has(columnIndex)) {
    return { ok: true as const, value: normalizeTextCell(value) }
  }

  return { ok: true as const, value: asText(value) }
}

function serializeSupabaseError(error: unknown) {
  if (!error || typeof error !== "object") return { message: String(error) }
  const value = error as { message?: string; code?: string; details?: string; hint?: string }
  return {
    message: value.message || "Supabase inquiry update failed",
    code: value.code || "",
    details: value.details || null,
    hint: value.hint || null,
  }
}

function editableColumnsForRole(role: string) {
  if (role === "BOSS") return EDITABLE_COLUMNS
  if (role === "HEAD") return HEAD_EDITABLE_COLUMNS
  if (role === "EMPLOYEE") return EMPLOYEE_EDITABLE_COLUMNS
  return new Set<number>()
}

function employeeName(employee: EmployeeRow | null) {
  return clean(employee?.emp_full_name) || clean(employee?.emp_name)
}

async function findEmployeeByEmail(supabase: SupabaseClient, email: string) {
  const { data, error } = await supabase
    .from("employees")
    .select("emp_id, email_id, emp_full_name, emp_name")
    .eq("email_id", email.toLowerCase())
    .eq("is_active", true)
    .limit(1)
    .maybeSingle()

  if (error) throw error
  return (data as EmployeeRow | null) || null
}

async function findEmployeeByNameOrEmail(supabase: SupabaseClient, rawValue: string) {
  const value = rawValue.trim()
  if (!value) return null
  if (value.includes("@")) return findEmployeeByEmail(supabase, value.toLowerCase())

  const normalized = value.toUpperCase()
  const { data, error } = await supabase
    .from("employees")
    .select("emp_id, email_id, emp_full_name, emp_name")
    .eq("is_active", true)
    .or(`emp_name.eq.${normalized},emp_full_name.eq.${normalized}`)
    .limit(1)
    .maybeSingle()

  if (error) throw error
  return (data as EmployeeRow | null) || null
}

async function findCategoryId(supabase: SupabaseClient, categoryName: string) {
  const category = categoryName.trim()
  if (!category) return null

  const { data, error } = await supabase
    .from("categories")
    .select("category_id")
    .ilike("category_name", category)
    .eq("is_active", true)
    .limit(1)
    .maybeSingle()

  if (error) throw error
  return (data as { category_id?: number | string } | null)?.category_id ?? null
}

function currentValueForColumn(record: InquiryRecord, columnIndex: number) {
  switch (columnIndex) {
    case 2: return asText(record.company_name_raw)
    case 3: return asText(record.contact_name_raw)
    case 4: return asText(record.phone_raw)
    case 5: return asText(record.email_raw)
    case 6: return asText(record.category_raw)
    case 7: return asText(record.details)
    case 8: return asText(record.lead_source)
    case 9: return asText(record.sales_person_email_raw)
    case 10: return asText(record.sales_stage)
    case 11: return asText(record.update_remarks)
    case 12: return asText(record.next_steps)
    case 13: return asText(record.next_followup_date).slice(0, 10)
    case 14: return asText(record.budget_raw || record.budget)
    case 15: return asText(record.quantity_raw || record.quantity)
    case 29: return asText(record.inquiry_type)
    case 30: return asText(record.second_owner_raw)
    case 31: return asText(record.back_office_raw)
    case 32: return asText(record.first_owner_raw)
    case 33: return asText(record.lead_generator_raw)
    default: return ""
  }
}

async function applyColumnUpdate(
  supabase: SupabaseClient,
  target: Record<string, unknown>,
  columnIndex: number,
  value: unknown,
) {
  switch (columnIndex) {
    case 2:
      target.company_name_raw = clean(value)
      break
    case 3:
      target.contact_name_raw = clean(value)
      break
    case 4:
      target.phone_raw = clean(value)
      break
    case 5:
      target.email_raw = clean(value)
      break
    case 6:
      target.category_raw = clean(value)
      target.category_id = await findCategoryId(supabase, asText(value))
      break
    case 7:
      target.details = clean(value)
      break
    case 8:
      target.lead_source = clean(value)
      break
    case 9: {
      const email = asText(value).trim().toLowerCase()
      const employee = email ? await findEmployeeByEmail(supabase, email) : null
      target.sales_person_email_raw = email || null
      target.sales_person_emp_id = employee?.emp_id ?? null
      target.sales_person_name_raw = employeeName(employee)
      break
    }
    case 10:
      target.sales_stage = clean(value)
      break
    case 11:
      target.update_remarks = clean(value)
      break
    case 12:
      target.next_steps = clean(value)
      break
    case 13:
      target.next_followup_date = clean(value)
      break
    case 14:
      target.budget = value === "" ? null : value
      target.budget_raw = value === "" ? null : String(value)
      break
    case 15:
      target.quantity = value === "" ? null : value
      target.quantity_raw = value === "" ? null : String(value)
      break
    case 29:
      target.inquiry_type = clean(value)
      break
    case 30: {
      const raw = asText(value)
      const employee = await findEmployeeByNameOrEmail(supabase, raw)
      target.second_owner_raw = clean(raw)
      target.second_owner_emp_id = employee?.emp_id ?? null
      break
    }
    case 31: {
      const raw = asText(value)
      const employee = await findEmployeeByNameOrEmail(supabase, raw)
      target.back_office_raw = clean(raw)
      target.back_office_emp_id = employee?.emp_id ?? null
      break
    }
    case 32: {
      const raw = asText(value)
      const employee = await findEmployeeByNameOrEmail(supabase, raw)
      target.first_owner_raw = clean(raw)
      target.first_owner_emp_id = employee?.emp_id ?? null
      break
    }
    case 33: {
      const raw = asText(value)
      const employee = await findEmployeeByNameOrEmail(supabase, raw)
      target.lead_generator_raw = clean(raw)
      target.lead_generator_emp_id = employee?.emp_id ?? null
      break
    }
  }
}

export async function POST(request: Request) {
  let logger: AppLogger | null = null

  try {
    const { updates } = await request.json()
    logger = await createAppLogger({
      route: "/api/inquiries/update",
      method: "POST",
      action: "UPDATE",
      resource: "inquiries",
      operation: "update_inquiries",
      query: 'inquiries.update(updatePayload, { count: "exact" }).eq("inquiry_no", inquiryNo)',
      metadata: {
        updateCount: Array.isArray(updates) ? updates.length : null,
        inquiryNumbers: Array.isArray(updates) ? updates.map((update) => asText(update?.inquiryNo)).filter(Boolean) : [],
      },
    })

    const session = logger.session || await getServerSession()

    if (!session) {
      await logger.failure({ statusCode: 401, error: new Error("Not authenticated") })
      return NextResponse.json({ success: false, message: "Not authenticated" }, { status: 401 })
    }

    if (!updates || !Array.isArray(updates)) {
      await logger.failure({ statusCode: 400, error: new Error("Invalid updates data") })
      return NextResponse.json({ success: false, message: "Invalid updates data" }, { status: 400 })
    }

    const roleInfo = await getUserRoleInfo(session.email)
    const supabaseAuth = await getAuthenticatedSupabaseServerClient()

    if (supabaseAuth.error || !supabaseAuth.supabase || !supabaseAuth.user) {
      await logger.failure({ statusCode: 401, error: new Error(supabaseAuth.error || "Supabase authentication required") })
      return NextResponse.json({ success: false, message: supabaseAuth.error || "Supabase authentication required" }, { status: 401 })
    }

    if (supabaseAuth.user.email?.toLowerCase() !== session.email.toLowerCase()) {
      await logger.failure({
        statusCode: 401,
        error: new Error("Supabase session does not match the CRM login user"),
        metadata: { supabaseEmail: supabaseAuth.user.email || null },
      })
      return NextResponse.json(
        { success: false, message: "Supabase session does not match the CRM login user" },
        { status: 401 },
      )
    }

    const supabase = supabaseAuth.supabase
    const responseUpdates: Array<{ inquiryNo: string; updatedFields: string[]; updatedAt: string }> = []

    for (const update of updates) {
      const { inquiryNo, data } = update
      const inquiryNoText = asText(inquiryNo).trim()

      if (!inquiryNoText) {
        await logger.failure({ statusCode: 400, error: new Error("Invalid Inquiry No") })
        return NextResponse.json({ success: false, message: "Invalid Inquiry No" }, { status: 400 })
      }

      if (!Array.isArray(data) || data.length !== INQUIRY_COLUMN_COUNT) {
        await logger.failure({
          statusCode: 400,
          targetId: inquiryNoText,
          error: new Error(`Invalid data format: expected ${INQUIRY_COLUMN_COUNT} columns`),
          metadata: { receivedColumnCount: Array.isArray(data) ? data.length : null },
        })
        return NextResponse.json(
          { success: false, message: `Invalid data format: expected ${INQUIRY_COLUMN_COUNT} columns` },
          { status: 400 },
        )
      }

      if (asText(data[0]).trim() !== inquiryNoText) {
        await logger.failure({ statusCode: 400, targetId: inquiryNoText, error: new Error("Inquiry No cannot be changed") })
        return NextResponse.json({ success: false, message: "Inquiry No cannot be changed" }, { status: 400 })
      }

      const { data: currentRecord, error: lookupError } = await supabase
        .from("inquiries")
        .select("*")
        .eq("inquiry_no", inquiryNoText)
        .maybeSingle()

      if (lookupError) throw lookupError
      if (!currentRecord) {
        await logger.failure({ statusCode: 404, targetId: inquiryNoText, error: new Error(`Inquiry ${inquiryNoText} not found`) })
        return NextResponse.json({ success: false, message: `Inquiry ${inquiryNoText} not found` }, { status: 404 })
      }

      if (currentRecord.is_active === false) {
        await logger.failure({
          statusCode: 404,
          targetId: inquiryNoText,
          error: new Error(`Inquiry ${inquiryNoText} is deleted`),
        })
        return NextResponse.json({ success: false, message: `Inquiry ${inquiryNoText} is deleted` }, { status: 404 })
      }

      const salesPersonEmail = asText(currentRecord.sales_person_email_raw).toLowerCase().trim()
      const canEdit =
        roleInfo.role === "BOSS" ||
        (roleInfo.role === "HEAD" && roleInfo.authorizedEmails.some((email) => email.toLowerCase() === salesPersonEmail)) ||
        (roleInfo.role === "EMPLOYEE" && session.email.toLowerCase() === salesPersonEmail)

      if (!canEdit) {
        await logger.failure({
          statusCode: 403,
          targetId: inquiryNoText,
          error: new Error(`No permission to edit inquiry ${inquiryNoText}`),
          metadata: { salesPersonEmail },
        })
        return NextResponse.json(
          { success: false, message: `No permission to edit inquiry ${inquiryNoText}` },
          { status: 403 },
        )
      }

      const roleEditableColumns = editableColumnsForRole(roleInfo.role)
      const updatePayload: Record<string, unknown> = {}
      const updatedFields: string[] = []

      for (const columnIndex of EDITABLE_COLUMNS) {
        const normalized = normalizeEditableCell(columnIndex, data[columnIndex])
        if (!normalized.ok) {
          await logger.failure({ statusCode: 400, targetId: inquiryNoText, error: new Error(normalized.message) })
          return NextResponse.json({ success: false, message: normalized.message }, { status: 400 })
        }

        const oldValue = currentValueForColumn(currentRecord as InquiryRecord, columnIndex)
        const newValue = asText(normalized.value)
        if (oldValue === newValue) continue

        if (!roleEditableColumns.has(columnIndex)) {
          const fieldName = FIELD_LABELS.get(columnIndex) || COLUMN_LETTERS[columnIndex] || `Column ${columnIndex}`
          await logger.failure({
            statusCode: 403,
            targetId: inquiryNoText,
            error: new Error(`${roleInfo.role} cannot edit ${fieldName}`),
            metadata: { columnIndex, fieldName, role: roleInfo.role },
          })
          return NextResponse.json(
            { success: false, message: `${roleInfo.role} cannot edit ${fieldName}` },
            { status: 403 },
          )
        }

        await applyColumnUpdate(supabase, updatePayload, columnIndex, normalized.value)
        updatedFields.push(FIELD_LABELS.get(columnIndex) || COLUMN_LETTERS[columnIndex])
      }

      const timestamp = new Date().toISOString()
      if (!updatedFields.length) {
        responseUpdates.push({ inquiryNo: inquiryNoText, updatedFields: [], updatedAt: timestamp })
        continue
      }

      updatePayload.inquiry_timestamp = timestamp
      updatePayload.updated_at = timestamp
      if (!currentRecord.ts_backup) {
        updatePayload.ts_backup = currentRecord.inquiry_timestamp || timestamp
      }

      const { count: updatedCount, error: updateError } = await supabase
        .from("inquiries")
        .update(updatePayload, { count: "exact" })
        .eq("inquiry_no", inquiryNoText)

      if (updateError) {
        console.error("[inquiry-update]", {
          inquiryNo: inquiryNoText,
          error: serializeSupabaseError(updateError),
        })
        await logger.failure({ statusCode: 500, targetId: inquiryNoText, error: updateError, metadata: { updatedFields } })
        return NextResponse.json(
          {
            success: false,
            message: `Failed to update inquiry ${inquiryNoText}: ${serializeSupabaseError(updateError).message}`,
          },
          { status: 500 },
        )
      }

      if (!updatedCount) {
        await logger.failure({
          statusCode: 403,
          targetId: inquiryNoText,
          error: new Error(`RLS blocked update for inquiry ${inquiryNoText}`),
          metadata: { updatedFields },
        })
        return NextResponse.json(
          { success: false, message: `RLS blocked update for inquiry ${inquiryNoText}` },
          { status: 403 },
        )
      }

      responseUpdates.push({ inquiryNo: inquiryNoText, updatedFields, updatedAt: timestamp })
    }

    await logger.success({
      statusCode: 200,
      targetId: responseUpdates.length === 1 ? responseUpdates[0].inquiryNo : null,
      metadata: {
        updatedCount: responseUpdates.length,
        updatedFields: responseUpdates.flatMap((update) => update.updatedFields),
      },
    })

    return NextResponse.json({
      success: true,
      inquiryNo: responseUpdates.length === 1 ? responseUpdates[0].inquiryNo : undefined,
      updatedFields: responseUpdates.flatMap((update) => update.updatedFields),
      updatedAt: responseUpdates[responseUpdates.length - 1]?.updatedAt,
      updates: responseUpdates,
    })
  } catch (error) {
    console.error("[inquiry-update]", error)
    await logger?.failure({ statusCode: 500, error })
    return NextResponse.json(
      {
        success: false,
        message: `Failed to update inquiries: ${error instanceof Error ? error.message : "Unknown error"}`,
      },
      { status: 500 },
    )
  }
}
