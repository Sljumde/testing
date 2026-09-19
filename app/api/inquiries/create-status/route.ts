import { type NextRequest, NextResponse } from "next/server"
import { getServerSession } from "@/lib/auth"
import { callKorosunoAppsScript, getKorosunoConfig } from "@/lib/korosuno-create"
import { getInquiryQueueStatus, setInquiryQueueStatus } from "@/lib/inquiry-queue"

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

export async function GET(request: NextRequest) {
  const routeStartedAt = Date.now()
  const session = await getServerSession()

  if (!session) {
    return NextResponse.json({ success: false, message: "Not authenticated" }, { status: 401 })
  }

  const requestId = request.nextUrl.searchParams.get("requestId")?.trim() || ""
  if (!UUID_PATTERN.test(requestId)) {
    return NextResponse.json({ success: false, message: "Invalid requestId", errorCode: "INVALID_REQUEST_ID" }, { status: 400 })
  }

  const queuedStatus = await getInquiryQueueStatus(requestId)
  if (queuedStatus) {
    if (queuedStatus.actorEmail.toLowerCase() !== session.email.toLowerCase()) {
      return NextResponse.json({ success: false, message: "Inquiry request not found" }, { status: 404 })
    }

    if (queuedStatus.status === "QUEUED" || queuedStatus.status === "PROCESSING") {
      return NextResponse.json(
        {
          success: false,
          pending: true,
          requestId,
          status: queuedStatus.status,
          stage: queuedStatus.status,
          qstashMessageId: queuedStatus.qstashMessageId,
          message: "Submission queued. Confirming Inquiry Number...",
        },
        { status: 202 },
      )
    }

    const shouldVerifyKorosunoStatus =
      queuedStatus.status === "FAILED" && queuedStatus.errorCode === "KOROSUNO_UNCERTAIN_RESPONSE"

    if (queuedStatus.status === "FAILED" && !shouldVerifyKorosunoStatus) {
      return NextResponse.json({
        success: false,
        pending: false,
        requestId,
        status: "FAILED",
        errorCode: queuedStatus.errorCode || "INQUIRY_CREATE_FAILED",
        errorMessage: queuedStatus.errorMessage || "Inquiry submission failed",
        message: queuedStatus.errorMessage || "Inquiry submission failed",
      })
    }

    if (queuedStatus.status === "SUCCESS" && queuedStatus.inquiryNo) {
      return NextResponse.json({
        success: true,
        pending: false,
        requestId,
        status: "SUCCESS",
        stage: "SUCCESS",
        inquiryNo: queuedStatus.inquiryNo,
        company: queuedStatus.company,
        contactName: queuedStatus.contactName,
        actorEmail: queuedStatus.actorEmail,
      })
    }
  }

  const config = getKorosunoConfig()
  if (!config.configured) {
    return NextResponse.json(
      { success: false, requestId, message: "Inquiry status service is not configured", errorCode: "KOROSUNO_CONFIG_MISSING" },
      { status: 503 },
    )
  }

  const {
    response,
    body,
    rawResponse,
    contentType,
    durationMs: appsScriptDurationMs,
    uncertain,
  } = await callKorosunoAppsScript("getKorosunoInquiryStatus", {
    requestId,
    actorEmail: session.email,
  })

  if (uncertain || !body) {
    console.error("Korosuno create status response uncertain", {
      requestId,
      httpStatus: response?.status || null,
      contentType,
      responsePreview: rawResponse.slice(0, 300),
      durationMs: appsScriptDurationMs,
    })

    return NextResponse.json(
      {
        success: false,
        pending: true,
        requestId,
        status: "WRITING",
        stage: "STATUS_CONFIRMATION_UNCERTAIN",
      },
      { status: 202 },
    )
  }

  console.info("[inquiry-create-status]", {
    requestId,
    actorEmail: session.email,
    stage: body.stage || body.status || "getKorosunoInquiryStatus",
    routeDurationMs: Date.now() - routeStartedAt,
    appsScriptDurationMs,
    inquiryNo: body.inquiryNo,
    result: body.success === true ? "success" : "failed",
    errorCode: body.errorCode || null,
  })

  if (body.status === "WRITING") {
    if (queuedStatus?.status === "FAILED" && queuedStatus.errorCode === "KOROSUNO_UNCERTAIN_RESPONSE") {
      await setInquiryQueueStatus({
        ...queuedStatus,
        status: "PROCESSING",
        updatedAt: new Date().toISOString(),
        errorCode: undefined,
        errorMessage: undefined,
      })
    }

    return NextResponse.json({
      success: false,
      pending: true,
      requestId,
      status: "WRITING",
      stage: body.stage,
    })
  }

  if (body.status === "FAILED") {
    if (queuedStatus) {
      await setInquiryQueueStatus({
        ...queuedStatus,
        status: "FAILED",
        updatedAt: new Date().toISOString(),
        errorCode: body.errorCode || "KOROSUNO_CREATE_FAILED",
        errorMessage: body.errorMessage || "Inquiry submission failed",
      })
    }

    return NextResponse.json({
      success: false,
      pending: false,
      requestId,
      status: "FAILED",
      errorCode: body.errorCode || "KOROSUNO_CREATE_FAILED",
      errorMessage: body.errorMessage || "Inquiry submission failed",
    })
  }

  if (body.ok !== true && body.success !== true) {
    if (queuedStatus?.status === "FAILED" && queuedStatus.errorCode === "KOROSUNO_UNCERTAIN_RESPONSE") {
      await setInquiryQueueStatus({
        ...queuedStatus,
        status: "FAILED",
        updatedAt: new Date().toISOString(),
        errorCode: body.errorCode || "KOROSUNO_STATUS_FAILED",
        errorMessage: body.errorMessage || "Failed to read inquiry status",
      })
    }

    return NextResponse.json(
      {
        success: false,
        pending: false,
        requestId,
        status: body.status,
        stage: body.stage,
        errorMessage: body.errorMessage || "Failed to read inquiry status",
        errorCode: body.errorCode || "KOROSUNO_STATUS_FAILED",
      },
      { status: 502 },
    )
  }

  if (queuedStatus && body.inquiryNo) {
    await setInquiryQueueStatus({
      ...queuedStatus,
      status: "SUCCESS",
      updatedAt: new Date().toISOString(),
      inquiryNo: String(body.inquiryNo),
      company: body.company || queuedStatus.company,
      contactName: body.contactName || queuedStatus.contactName,
      errorCode: undefined,
      errorMessage: undefined,
    })
  }

  return NextResponse.json({
    success: true,
    pending: false,
    requestId,
    status: "SUCCESS",
    stage: body.stage,
    inquiryNo: body.inquiryNo,
    company: body.company,
    contactName: body.contactName,
    actorEmail: body.actorEmail || session.email,
  })
}
