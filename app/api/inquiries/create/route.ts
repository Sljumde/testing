import { after, type NextRequest, NextResponse } from "next/server"
import { getServerSession } from "@/lib/auth"
import {
  normalizeInquiryBusinessPayload,
  normalizeRequestId,
  stableInquiryContentHash,
  validateInquiryBusinessPayload,
} from "@/lib/inquiry-create"
import { markInquiryFailed, markInquirySuccess } from "@/lib/inquiry-queue"
import { createSupabaseInquiry } from "@/lib/supabase-inquiry-sync"
import { getAuthenticatedSupabaseServerClient, getSupabaseAdminClient } from "@/lib/supabase/server"
import { createAppLogger, type AppLogger } from "@/lib/app-logger"

function serializeCreateError(error: unknown) {
  if (!error || typeof error !== "object") {
    return {
      name: "Error",
      message: String(error),
      code: null,
      details: null,
      hint: null,
    }
  }

  const value = error as { name?: string; message?: string; code?: string; details?: string; hint?: string }
  return {
    name: value.name || "SupabaseCreateError",
    message: value.message || String(error),
    code: value.code || null,
    details: value.details || null,
    hint: value.hint || null,
  }
}

export async function POST(request: NextRequest) {
  const routeStartedAt = Date.now()
  let requestId = ""
  let actorEmail = ""
  let businessPayload: ReturnType<typeof normalizeInquiryBusinessPayload> | null = null
  let logger: AppLogger | null = null

  try {
    const rawBody = await request.json()
    requestId = normalizeRequestId(rawBody?.requestId)
    logger = await createAppLogger({
      requestId,
      route: "/api/inquiries/create",
      method: "POST",
      action: "CREATE",
      resource: "inquiries",
      operation: "create_inquiry",
      query: "inquiries.insert(insertPayload)",
      metadata: {
        company: rawBody?.company || null,
        contactName: rawBody?.contactName || null,
      },
    })

    const session = logger.session || await getServerSession()

    if (!session) {
      await logger.failure({ statusCode: 401, error: new Error("Not authenticated") })
      return NextResponse.json({ success: false, message: "Not authenticated" }, { status: 401 })
    }

    actorEmail = session.email
    const supabaseAuth = await getAuthenticatedSupabaseServerClient()

    if (supabaseAuth.error || !supabaseAuth.supabase || !supabaseAuth.user) {
      await logger.failure({ statusCode: 401, error: new Error(supabaseAuth.error || "Supabase authentication required") })
      return NextResponse.json({ success: false, message: supabaseAuth.error || "Supabase authentication required" }, { status: 401 })
    }

    if (supabaseAuth.user.email?.toLowerCase() !== actorEmail.toLowerCase()) {
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

    businessPayload = normalizeInquiryBusinessPayload(rawBody || {})
    const validation = validateInquiryBusinessPayload(businessPayload)
    const payloadHash = stableInquiryContentHash(businessPayload)

    if (!validation.valid) {
      console.warn("[inquiry-create]", {
        requestId,
        actorEmail,
        stage: "validation",
        result: "failed",
        errorCode: "VALIDATION_FAILED",
        routeDurationMs: Date.now() - routeStartedAt,
      })
      await logger.failure({ statusCode: 400, error: new Error(validation.message), metadata: { errorCode: "VALIDATION_FAILED" } })
      return NextResponse.json(
        { success: false, requestId, message: validation.message, errorCode: "VALIDATION_FAILED" },
        { status: 400 },
      )
    }

    const job = {
      requestId,
      actorEmail,
      businessPayload,
      payloadHash,
    }

    const result = await createSupabaseInquiry({
      supabase: getSupabaseAdminClient(),
      actorEmail,
      requestId,
      payload: businessPayload,
    })
    const responseCompany = result.company || businessPayload.company
    const responseContactName = result.contactName || businessPayload.contactName

    await logger.success({
      statusCode: 200,
      targetId: result.inquiryNo,
      metadata: {
        inquiryNo: result.inquiryNo,
        company_id: businessPayload.company_id || null,
        contact_id: businessPayload.contact_id || null,
      },
    })

    after(() =>
      markInquirySuccess(job, {
        inquiryNo: result.inquiryNo,
        company: responseCompany,
        contactName: responseContactName,
      }).catch((statusError) => {
        console.error("[inquiry-create] status update failed", {
          requestId,
          inquiryNo: result.inquiryNo,
          error: serializeCreateError(statusError),
        })
      }),
    )

    console.info("[inquiry-create]", {
      requestId,
      actorEmail,
      inquiryNo: result.inquiryNo,
      routeDurationMs: Date.now() - routeStartedAt,
      result: "success",
    })

    return NextResponse.json({
      success: true,
      requestId,
      inquiryNo: result.inquiryNo,
      company: responseCompany,
      contactName: responseContactName,
      salesPersonEmail: actorEmail,
    })
  } catch (error) {
    const serializedError = serializeCreateError(error)

    if (requestId && actorEmail && businessPayload) {
      try {
        await markInquiryFailed(
          {
            requestId,
            actorEmail,
            businessPayload,
            payloadHash: stableInquiryContentHash(businessPayload),
          },
          {
            errorCode: serializedError.code || serializedError.name || "SUPABASE_CREATE_FAILED",
            errorMessage: serializedError.message || "Failed to create inquiry in Supabase",
          },
        )
      } catch {
        // Preserve the original error response even if status logging fails.
      }
    }

    console.error("[inquiry-create]", {
      requestId,
      actorEmail,
      stage: "exception",
      result: "failed",
      routeDurationMs: Date.now() - routeStartedAt,
      errorCode: serializedError.code || serializedError.name || "UNKNOWN_ERROR",
      errorMessage: serializedError.message,
      errorDetails: serializedError.details,
      errorHint: serializedError.hint,
    })
    await logger?.failure({ statusCode: 500, error })
    return NextResponse.json(
      {
        success: false,
        message: process.env.NODE_ENV === "production" ? "Failed to create inquiry" : serializedError.message,
        errorCode: serializedError.code || serializedError.name || "SUPABASE_CREATE_FAILED",
        details: process.env.NODE_ENV === "production" ? undefined : serializedError.details,
        hint: process.env.NODE_ENV === "production" ? undefined : serializedError.hint,
      },
      { status: 500 },
    )
  }
}
