import { verifySignatureAppRouter } from "@upstash/qstash/nextjs"
import {
  callKorosunoAppsScript,
  getInquiryCreateMode,
  normalizeKorosunoBusinessPayload,
  stableInquiryContentHash,
  stablePayloadHash,
  validateKorosunoBusinessPayload,
} from "@/lib/korosuno-create"
import {
  getInquiryQueueStatus,
  markInquiryFailed,
  markInquiryProcessing,
  markInquirySuccess,
  type InquiryCreateJob,
} from "@/lib/inquiry-queue"
import { saveNewInquiry } from "@/lib/sheets"
import { syncKorosunoInquiryToSupabase } from "@/lib/supabase-inquiry-sync"

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

function isValidJob(value: unknown): value is InquiryCreateJob {
  if (!value || typeof value !== "object") return false
  const job = value as Partial<InquiryCreateJob>
  return (
    typeof job.requestId === "string" &&
    UUID_PATTERN.test(job.requestId) &&
    typeof job.actorEmail === "string" &&
    job.actorEmail.includes("@") &&
    typeof job.payloadHash === "string" &&
    typeof job.businessPayload === "object" &&
    job.businessPayload !== null
  )
}

async function handler(request: Request) {
  const routeStartedAt = Date.now()
  const rawJob = await request.json()

  if (!isValidJob(rawJob)) {
    return Response.json({ success: false, message: "Invalid inquiry job" }, { status: 400 })
  }

  const job: InquiryCreateJob = {
    requestId: rawJob.requestId,
    actorEmail: rawJob.actorEmail.trim().toLowerCase(),
    businessPayload: normalizeKorosunoBusinessPayload(rawJob.businessPayload as Record<string, unknown>),
    payloadHash: rawJob.payloadHash,
  }

  const contentPayloadHash = stableInquiryContentHash(job.businessPayload)
  const fullPayloadHash = stablePayloadHash(job.businessPayload)
  if (contentPayloadHash !== job.payloadHash && fullPayloadHash !== job.payloadHash) {
    await markInquiryFailed(job, {
      errorCode: "PAYLOAD_HASH_MISMATCH",
      errorMessage: "Inquiry payload hash mismatch",
    })
    return Response.json({ success: true, failed: true, errorCode: "PAYLOAD_HASH_MISMATCH" })
  }

  const validation = validateKorosunoBusinessPayload(job.businessPayload)
  if (!validation.valid) {
    await markInquiryFailed(job, {
      errorCode: "VALIDATION_FAILED",
      errorMessage: validation.message,
    })
    return Response.json({ success: true, failed: true, errorCode: "VALIDATION_FAILED" })
  }

  const existingStatus = await getInquiryQueueStatus(job.requestId)
  if (existingStatus?.status === "SUCCESS" && existingStatus.inquiryNo) {
    return Response.json({ success: true, idempotent: true, inquiryNo: existingStatus.inquiryNo })
  }
  if (
    existingStatus &&
    existingStatus.payloadHash !== job.payloadHash &&
    existingStatus.payloadHash !== contentPayloadHash &&
    existingStatus.payloadHash !== fullPayloadHash
  ) {
    await markInquiryFailed(job, {
      errorCode: "REQUEST_ID_PAYLOAD_MISMATCH",
      errorMessage: "The same requestId was used with different inquiry data",
    })
    return Response.json({ success: true, failed: true, errorCode: "REQUEST_ID_PAYLOAD_MISMATCH" })
  }

  await markInquiryProcessing(job)

  try {
    if (getInquiryCreateMode() === "legacy") {
      const result = await saveNewInquiry({
        ...job.businessPayload,
        salesPersonEmail: job.actorEmail,
      })

      if (!result.success || result.inquiryNo == null) {
        await markInquiryFailed(job, {
          errorCode: "LEGACY_CREATE_FAILED",
          errorMessage: result.message || "Legacy inquiry creation failed",
        })
        return Response.json({ success: true, failed: true, errorCode: "LEGACY_CREATE_FAILED" })
      }

      await markInquirySuccess(job, {
        inquiryNo: String(result.inquiryNo),
        company: job.businessPayload.company,
        contactName: job.businessPayload.contactName,
      })
      return Response.json({ success: true, inquiryNo: String(result.inquiryNo) })
    }

    const { response, body, rawResponse, contentType, durationMs, uncertain } = await callKorosunoAppsScript(
      "createKorosunoInquiry",
      {
        requestId: job.requestId,
        actorEmail: job.actorEmail,
        businessPayload: job.businessPayload,
        payloadHash: job.payloadHash,
      },
    )

    if (uncertain || !body) {
      await markInquiryFailed(job, {
        errorCode: "KOROSUNO_UNCERTAIN_RESPONSE",
        errorMessage: "Korosuno did not return a confirmed create result. Check Apps Script execution logs before retrying this request.",
      })
      console.error("[inquiry-create-worker]", {
        requestId: job.requestId,
        stage: "korosuno_uncertain",
        httpStatus: response?.status || null,
        contentType,
        responsePreview: rawResponse.slice(0, 300),
        durationMs,
      })
      return Response.json({ success: true, failed: true, errorCode: "KOROSUNO_UNCERTAIN_RESPONSE" })
    }

    const success = body.ok === true && body.success === true && body.inquiryNo != null
    if (!success) {
      const errorCode = body.errorCode || "KOROSUNO_CREATE_FAILED"
      const errorMessage = body.errorMessage || "Failed to create inquiry"
      await markInquiryFailed(job, { errorCode, errorMessage })

      return Response.json({ success: true, failed: true, errorCode })
    }

    try {
      await syncKorosunoInquiryToSupabase({
        inquiryNo: String(body.inquiryNo),
        actorEmail: job.actorEmail,
        requestId: job.requestId,
        payload: job.businessPayload,
      })
    } catch (error) {
      console.error("[inquiry-create-worker] supabase sync failed after Korosuno success", {
        requestId: job.requestId,
        inquiryNo: String(body.inquiryNo),
        company_id: job.businessPayload.company_id || null,
        contact_id: job.businessPayload.contact_id || null,
        error: error instanceof Error ? error.message : String(error),
      })
    }

    await markInquirySuccess(job, {
      inquiryNo: String(body.inquiryNo),
      company: body.company || job.businessPayload.company,
      contactName: body.contactName || job.businessPayload.contactName,
    })

    console.info("[inquiry-create-worker]", {
      requestId: job.requestId,
      actorEmail: job.actorEmail,
      inquiryNo: body.inquiryNo,
      routeDurationMs: Date.now() - routeStartedAt,
      appsScriptDurationMs: durationMs,
      result: "success",
    })

    return Response.json({ success: true, inquiryNo: String(body.inquiryNo) })
  } catch (error) {
    await markInquiryFailed(job, {
      errorCode: error instanceof Error ? error.message : "INQUIRY_WORKER_ERROR",
      errorMessage: "Inquiry worker failed before confirming creation. Check worker and Apps Script logs before retrying this request.",
    })
    console.error("[inquiry-create-worker]", {
      requestId: job.requestId,
      actorEmail: job.actorEmail,
      stage: "exception",
      routeDurationMs: Date.now() - routeStartedAt,
      errorCode: error instanceof Error ? error.message : "UNKNOWN_ERROR",
    })
    throw error
  }
}

export const POST = verifySignatureAppRouter(handler)
