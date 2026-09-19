import { Client } from "@upstash/qstash"
import { Redis } from "@upstash/redis"
import type { KorosunoBusinessPayload } from "./korosuno-create"

export type InquiryQueueStatusName = "QUEUED" | "PROCESSING" | "SUCCESS" | "FAILED"

export type InquiryQueueStatus = {
  requestId: string
  status: InquiryQueueStatusName
  actorEmail: string
  payloadHash: string
  createdAt: string
  updatedAt: string
  qstashMessageId?: string
  inquiryNo?: string
  company?: string
  contactName?: string
  errorCode?: string
  errorMessage?: string
}

export type InquiryCreateJob = {
  requestId: string
  actorEmail: string
  businessPayload: KorosunoBusinessPayload
  payloadHash: string
}

const STATUS_TTL_SECONDS = 60 * 60 * 24
const INQUIRY_CREATE_FLOW_KEY = "inquiry-create"

let redisClient: Redis | null = null
let qstashClient: Client | null = null

function getRedis() {
  if (!redisClient) redisClient = Redis.fromEnv()
  return redisClient
}

function getQStash() {
  if (!qstashClient) qstashClient = new Client({ token: process.env.QSTASH_TOKEN! })
  return qstashClient
}

function statusKey(requestId: string) {
  return `inquiry:create:${requestId}`
}

function nowIso() {
  return new Date().toISOString()
}

export function validateQueueEnv() {
  const missing = [
    "QSTASH_TOKEN",
    "QSTASH_CURRENT_SIGNING_KEY",
    "QSTASH_NEXT_SIGNING_KEY",
    "UPSTASH_REDIS_REST_URL",
    "UPSTASH_REDIS_REST_TOKEN",
    "APP_BASE_URL",
  ].filter((key) => !process.env[key])

  if (missing.length > 0) {
    throw new Error(`Missing queue environment variables: ${missing.join(", ")}`)
  }
}

export async function getInquiryQueueStatus(requestId: string) {
  return getRedis().get<InquiryQueueStatus>(statusKey(requestId))
}

export async function setInquiryQueueStatus(status: InquiryQueueStatus) {
  await getRedis().set(statusKey(status.requestId), status, { ex: STATUS_TTL_SECONDS })
}

export async function markInquiryQueued(job: InquiryCreateJob) {
  const existing = await getInquiryQueueStatus(job.requestId)
  if (existing) return existing

  const timestamp = nowIso()
  const status: InquiryQueueStatus = {
    requestId: job.requestId,
    status: "QUEUED",
    actorEmail: job.actorEmail,
    payloadHash: job.payloadHash,
    company: job.businessPayload.company,
    contactName: job.businessPayload.contactName,
    createdAt: timestamp,
    updatedAt: timestamp,
  }

  await setInquiryQueueStatus(status)
  return status
}

export async function markInquiryProcessing(job: InquiryCreateJob) {
  const existing = await getInquiryQueueStatus(job.requestId)
  const timestamp = nowIso()
  await setInquiryQueueStatus({
    requestId: job.requestId,
    status: "PROCESSING",
    actorEmail: job.actorEmail,
    payloadHash: job.payloadHash,
    company: job.businessPayload.company,
    contactName: job.businessPayload.contactName,
    createdAt: existing?.createdAt || timestamp,
    updatedAt: timestamp,
    qstashMessageId: existing?.qstashMessageId,
  })
}

export async function markInquirySuccess(job: InquiryCreateJob, result: { inquiryNo: string; company?: string; contactName?: string }) {
  const existing = await getInquiryQueueStatus(job.requestId)
  const timestamp = nowIso()
  await setInquiryQueueStatus({
    requestId: job.requestId,
    status: "SUCCESS",
    actorEmail: job.actorEmail,
    payloadHash: job.payloadHash,
    company: result.company || job.businessPayload.company,
    contactName: result.contactName || job.businessPayload.contactName,
    createdAt: existing?.createdAt || timestamp,
    updatedAt: timestamp,
    qstashMessageId: existing?.qstashMessageId,
    inquiryNo: result.inquiryNo,
  })
}

export async function markInquiryFailed(job: InquiryCreateJob, error: { errorCode?: string; errorMessage: string }) {
  const existing = await getInquiryQueueStatus(job.requestId)
  const timestamp = nowIso()
  await setInquiryQueueStatus({
    requestId: job.requestId,
    status: "FAILED",
    actorEmail: job.actorEmail,
    payloadHash: job.payloadHash,
    company: job.businessPayload.company,
    contactName: job.businessPayload.contactName,
    createdAt: existing?.createdAt || timestamp,
    updatedAt: timestamp,
    qstashMessageId: existing?.qstashMessageId,
    errorCode: error.errorCode,
    errorMessage: error.errorMessage,
  })
}

export async function publishInquiryCreateJob(job: InquiryCreateJob) {
  validateQueueEnv()

  const baseUrl = new URL(process.env.APP_BASE_URL!).origin
  const result = await getQStash().publishJSON({
    url: `${baseUrl}/api/jobs/create-inquiry`,
    body: job,
    deduplicationId: job.requestId,
    retries: 3,
    retryDelay: "1000 * pow(2, retried)",
    timeout: 90,
    flowControl: {
      key: INQUIRY_CREATE_FLOW_KEY,
      parallelism: 1,
      rate: 1,
      period: "1s",
    },
  })

  const existing = await getInquiryQueueStatus(job.requestId)
  if (existing) {
    await setInquiryQueueStatus({ ...existing, qstashMessageId: result.messageId, updatedAt: nowIso() })
  }

  return result
}
