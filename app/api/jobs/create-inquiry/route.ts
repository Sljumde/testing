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

function deploymentMetadata() {
  return {
    environment: process.env.VERCEL_ENV || process.env.NODE_ENV || null,
    deploymentId: process.env.VERCEL_DEPLOYMENT_ID || null,
    deploymentUrl: process.env.VERCEL_URL || null,
    commitSha: process.env.VERCEL_GIT_COMMIT_SHA || process.env.NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA || null,
    commitRef: process.env.VERCEL_GIT_COMMIT_REF || process.env.NEXT_PUBLIC_VERCEL_GIT_COMMIT_REF || null,
  }
}

function serializeError(error: unknown) {
  if (!error || typeof error !== "object") return { name: "Error", message: String(error) }
  const value = error as { name?: string; message?: string; code?: string; details?: string; hint?: string; stack?: string }
  return {
    name: value.name || "Error",
    message: value.message || String(error),
    code: value.code || null,
    details: value.details || null,
    hint: value.hint || null,
    stack: value.stack || null,
  }
}

async function writeWorkerLog(
  job: InquiryCreateJob,
  status: "started" | "success" | "failure",
  input: {
    startedAt: number
    statusCode?: number
    targetId?: string | number | null
    metadata?: Record<string, unknown>
    error?: unknown
  },
) {
  const payload = {
    request_id: job.requestId,
    route: "/api/jobs/create-inquiry",
    method: "POST",
    action: "CREATE",
    resource: "inquiries",
    operation: "worker_create_inquiry",
    query: "inquiries.insert(insertPayload)",
    target_id: input.targetId == null ? null : String(input.targetId),
    status,
    status_code: input.statusCode ?? null,
    duration_ms: Date.now() - input.startedAt,
    user_email: job.actorEmail,
    user_role: null,
    supabase_auth_user_id: null,
    deployment: deploymentMetadata(),
    metadata: {
      company: job.businessPayload.company,
      contactName: job.businessPayload.contactName,
      company_id: job.businessPayload.company_id || null,
      contact_id: job.businessPayload.contact_id || null,
      ...(input.metadata || {}),
    },
    error: input.error ? serializeError(input.error) : null,
  }

  const { error } = await getSupabaseAdminClient().from("application_logs").insert(payload)
  if (error) console.error("[inquiry-create-worker-log] insert failed", { requestId: job.requestId, error: serializeError(error) })
}

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
  await writeWorkerLog(job, "started", { startedAt: routeStartedAt })

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
    await writeWorkerLog(job, "success", {
      startedAt: routeStartedAt,
      statusCode: 200,
      targetId: result.inquiryNo,
      metadata: { inquiryNo: result.inquiryNo },
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
    await writeWorkerLog(job, "failure", {
      startedAt: routeStartedAt,
      statusCode: 500,
      error,
    })
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
