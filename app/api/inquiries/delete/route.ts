import { NextResponse } from "next/server"
import { getServerSession } from "@/lib/auth"
import { createAppLogger } from "@/lib/app-logger"
import { getAuthenticatedSupabaseServerClient } from "@/lib/supabase/server"

function asText(value: unknown) {
  return value == null ? "" : String(value).trim()
}

function serializeSupabaseError(error: unknown) {
  if (!error || typeof error !== "object") return { message: String(error) }
  const value = error as { message?: string; code?: string; details?: string; hint?: string }
  return {
    message: value.message || "Supabase inquiry delete failed",
    code: value.code || "",
    details: value.details || null,
    hint: value.hint || null,
  }
}

export async function POST(request: Request) {
  const logger = await createAppLogger({
    route: "/api/inquiries/delete",
    method: "POST",
    action: "DELETE",
    resource: "inquiries",
    operation: "soft_delete_inquiries",
    query: 'inquiries.update({ is_active: false }).in("inquiry_no", inquiryNumbers)',
  })

  try {
    const session = logger.session || await getServerSession()

    if (!session || session.role !== "BOSS") {
      await logger.failure({
        statusCode: 403,
        error: new Error("Only BOSS can delete inquiries"),
        metadata: { role: session?.role || null },
      })
      return NextResponse.json({ success: false, message: "Only BOSS can delete inquiries" }, { status: 403 })
    }

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

    const { inquiryNumbers } = await request.json()
    const normalizedInquiryNumbers = Array.isArray(inquiryNumbers)
      ? [...new Set(inquiryNumbers.map(asText).filter(Boolean))]
      : []

    if (!normalizedInquiryNumbers.length) {
      await logger.failure({ statusCode: 400, error: new Error("No inquiry numbers provided") })
      return NextResponse.json({ success: false, message: "No inquiry numbers provided" }, { status: 400 })
    }

    const supabase = supabaseAuth.supabase
    const { data: existingRows, error: lookupError } = await supabase
      .from("inquiries")
      .select("inquiry_no, is_active")
      .in("inquiry_no", normalizedInquiryNumbers)

    if (lookupError) {
      await logger.failure({
        statusCode: 500,
        error: lookupError,
        metadata: { inquiryNumbers: normalizedInquiryNumbers, query: "inquiries.select active rows" },
      })
      return NextResponse.json(
        { success: false, message: `Failed to check inquiries: ${serializeSupabaseError(lookupError).message}` },
        { status: 500 },
      )
    }

    const foundRows = (existingRows || []) as Array<{ inquiry_no: string | number | null; is_active: boolean | null }>
    const foundInquiryNumbers = foundRows.map((row) => asText(row.inquiry_no)).filter(Boolean)
    const activeInquiryNumbers = foundRows
      .filter((row) => row.is_active !== false)
      .map((row) => asText(row.inquiry_no))
      .filter(Boolean)

    if (!foundInquiryNumbers.length) {
      await logger.failure({
        statusCode: 404,
        error: new Error("No matching inquiries found"),
        metadata: { inquiryNumbers: normalizedInquiryNumbers },
      })
      return NextResponse.json({ success: false, message: "No matching inquiries found" }, { status: 404 })
    }

    if (!activeInquiryNumbers.length) {
      await logger.success({
        statusCode: 200,
        metadata: {
          requestedInquiryNumbers: normalizedInquiryNumbers,
          deletedInquiryNumbers: foundInquiryNumbers,
          deletedCount: foundInquiryNumbers.length,
          alreadyDeletedCount: foundInquiryNumbers.length,
        },
      })

      return NextResponse.json({
        success: true,
        message: `${foundInquiryNumbers.length} inquiry(ies) already deleted`,
        deletedCount: foundInquiryNumbers.length,
        alreadyDeletedCount: foundInquiryNumbers.length,
        deletedInquiryNumbers: foundInquiryNumbers,
      })
    }

    const timestamp = new Date().toISOString()
    const { count: deletedCount, error: deleteError } = await supabase
      .from("inquiries")
      .update(
        {
          is_active: false,
          updated_at: timestamp,
        },
        { count: "exact" },
      )
      .in("inquiry_no", activeInquiryNumbers)
      .or("is_active.is.null,is_active.eq.true")

    if (deleteError) {
      await logger.failure({
        statusCode: 500,
        error: deleteError,
        metadata: { inquiryNumbers: activeInquiryNumbers, query: "inquiries.soft_delete" },
      })
      return NextResponse.json(
        { success: false, message: `Failed to delete inquiries: ${serializeSupabaseError(deleteError).message}` },
        { status: 500 },
      )
    }

    if (!deletedCount) {
      await logger.failure({
        statusCode: 403,
        error: new Error("RLS blocked inquiry delete"),
        metadata: { inquiryNumbers: activeInquiryNumbers },
      })
      return NextResponse.json({ success: false, message: "RLS blocked inquiry delete" }, { status: 403 })
    }

    await logger.success({
      statusCode: 200,
      metadata: {
        requestedInquiryNumbers: normalizedInquiryNumbers,
        deletedInquiryNumbers: activeInquiryNumbers,
        deletedCount,
        alreadyDeletedCount: foundInquiryNumbers.length - activeInquiryNumbers.length,
      },
    })

    return NextResponse.json({
      success: true,
      message: `${deletedCount} inquiry(ies) deleted`,
      deletedCount: foundInquiryNumbers.length,
      updatedCount: deletedCount,
      alreadyDeletedCount: foundInquiryNumbers.length - activeInquiryNumbers.length,
      deletedInquiryNumbers: foundInquiryNumbers,
    })
  } catch (error) {
    console.error("[inquiry-delete]", error)
    await logger.failure({ statusCode: 500, error })
    return NextResponse.json({ success: false, message: "Failed to delete inquiry" }, { status: 500 })
  }
}
