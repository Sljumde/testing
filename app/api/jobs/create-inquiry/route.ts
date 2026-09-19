import { verifySignatureAppRouter } from "@upstash/qstash/nextjs"
import {
  normalizeInquiryBusinessPayload,
  stableInquiryContentHash,
  stablePayloadHash,
  validateInquiryBusinessPayload,
} from "@/lib/inquiry-create"
import {
  getInquiryQueueStatus,
  markInquiryFailed,
  markInquiryProcessing,
  markInquirySuccess,
  type InquiryCreateJob,
} from "@/lib/inquiry-queue"
import { createSupabaseInquiry } from "@/lib/supabase-inquiry-sync"
import { getSupabaseAdminClient } from "@/lib/supabase/server"

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
    businessPayload: normalizeInquiryBusinessPayload(rawJob.businessPayload as Record<string, unknown>),
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

  const validation = validateInquiryBusinessPayload(job.businessPayload)
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
    const result = await createSupabaseInquiry({
      supabase: getSupabaseAdminClient(),
      actorEmail: job.actorEmail,
      requestId: job.requestId,
      payload: job.businessPayload,
    })

    await markInquirySuccess(job, {
      inquiryNo: result.inquiryNo,
      company: result.company || job.businessPayload.company,
      contactName: result.contactName || job.businessPayload.contactName,
    })

    console.info("[inquiry-create-worker]", {
      requestId: job.requestId,
      actorEmail: job.actorEmail,
      inquiryNo: result.inquiryNo,
      routeDurationMs: Date.now() - routeStartedAt,
      result: "success",
    })

    return Response.json({ success: true, inquiryNo: result.inquiryNo })
  } catch (error) {
    await markInquiryFailed(job, {
      errorCode: error instanceof Error ? error.message : "INQUIRY_WORKER_ERROR",
      errorMessage: "Inquiry worker failed before confirming creation. Check worker logs before retrying this request.",
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
