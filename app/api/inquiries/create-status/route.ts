import { type NextRequest, NextResponse } from "next/server"
import { getServerSession } from "@/lib/auth"
import { getInquiryQueueStatus } from "@/lib/inquiry-queue"
import { getSupabaseAdminClient } from "@/lib/supabase/server"

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

export async function GET(request: NextRequest) {
  const session = await getServerSession()

  if (!session) {
    return NextResponse.json({ success: false, message: "Not authenticated" }, { status: 401 })
  }

  const requestId = request.nextUrl.searchParams.get("requestId")?.trim() || ""
  if (!UUID_PATTERN.test(requestId)) {
    return NextResponse.json({ success: false, message: "Invalid requestId", errorCode: "INVALID_REQUEST_ID" }, { status: 400 })
  }

  const queuedStatus = await getInquiryQueueStatus(requestId)
  if (!queuedStatus || queuedStatus.actorEmail.toLowerCase() !== session.email.toLowerCase()) {
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

  if (queuedStatus.status === "FAILED") {
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
    const { data: confirmedRow, error: confirmError } = await getSupabaseAdminClient()
      .from("inquiries")
      .select("inquiry_no")
      .eq("inquiry_no", queuedStatus.inquiryNo)
      .maybeSingle()

    if (confirmError) {
      return NextResponse.json(
        {
          success: false,
          pending: false,
          requestId,
          status: "FAILED",
          errorCode: "SUPABASE_CONFIRMATION_FAILED",
          message: "Inquiry was submitted, but Supabase confirmation failed. Please contact administrator.",
        },
        { status: 500 },
      )
    }

    if (!confirmedRow) {
      return NextResponse.json(
        {
          success: false,
          pending: false,
          requestId,
          status: "FAILED",
          errorCode: "SUCCESS_ROW_MISSING",
          message: `Inquiry ${queuedStatus.inquiryNo} was reported created but is missing in Supabase.`,
        },
        { status: 409 },
      )
    }
  }

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
