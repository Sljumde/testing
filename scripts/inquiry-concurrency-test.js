const crypto = require("node:crypto")
const fs = require("node:fs")
const { Client } = require("@upstash/qstash")
const { Redis } = require("@upstash/redis")

function argValue(name) {
  const prefix = `--${name}=`
  const inline = process.argv.find((arg) => arg.startsWith(prefix))
  if (inline) return inline.slice(prefix.length)

  const index = process.argv.indexOf(`--${name}`)
  return index >= 0 ? process.argv[index + 1] : undefined
}

const COUNT = Number(argValue("count") || process.env.INQUIRY_CONCURRENCY_TEST_COUNT || 10)
const POLL_SECONDS = Number(process.env.INQUIRY_CONCURRENCY_TEST_POLL_SECONDS || 180)
const ACTOR_EMAIL = process.env.INQUIRY_TEST_ACTOR_EMAIL || "qstash-concurrency-test@brownwall.in"
const FLOW_KEY = "inquiry-create"

function loadLocalEnv() {
  if (!fs.existsSync(".env.local")) return

  for (const line of fs.readFileSync(".env.local", "utf8").split(/\r?\n/)) {
    const match = line.match(/^\s*([^#][^=]*)=(.*)$/)
    if (!match) continue

    const key = match[1].trim()
    let value = match[2].trim()
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1)
    }
    if (!process.env[key]) process.env[key] = value
  }
}

function assertRealRunRequested() {
  if (!process.argv.includes("--yes")) {
    console.error("This creates real inquiry records.")
    console.error("Run again with: npm run test:inquiry-concurrency -- --yes")
    process.exit(1)
  }
}

function assertEnv() {
  const missing = [
    "APP_BASE_URL",
    "QSTASH_TOKEN",
    "UPSTASH_REDIS_REST_URL",
    "UPSTASH_REDIS_REST_TOKEN",
  ].filter((key) => !process.env[key])

  if (missing.length) {
    throw new Error(`Missing environment variables: ${missing.join(", ")}`)
  }
}

function stablePayloadHash(payload) {
  const stable = Object.keys(payload)
    .sort()
    .reduce((acc, key) => {
      acc[key] = payload[key]
      return acc
    }, {})

  return crypto.createHash("sha256").update(JSON.stringify(stable)).digest("hex")
}

function statusKey(requestId) {
  return `inquiry:create:${requestId}`
}

function makePayload(runId, index) {
  const suffix = `${runId}-${String(index + 1).padStart(2, "0")}`
  return {
    company: `QStash Concurrency Test ${suffix}`,
    contactName: `Concurrency Contact ${index + 1}`,
    phone: `90000${String(index + 1).padStart(5, "0")}`,
    email: `concurrency.${suffix}@example.com`,
    category: "Concurrency Test",
    details: "Automated queue concurrency test inquiry. Safe to identify and remove after verification.",
    leadSource: "Automation Test",
    salesStage: "Discovery",
    updateRemarks: "Created by QStash concurrency test",
    nextSteps: "Concurrency verification",
    nextFollowupDate: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString().slice(0, 10),
    budget: 1000 + index,
    quantity: 10 + index,
    occasion: "Concurrency Test",
    location: "Test Location",
    inquiryType: "Test",
    secondOwner: "Automation",
    backOffice: "Automation",
    firstOwner: "Automation",
    leadGenerator: "Automation",
  }
}

async function main() {
  assertRealRunRequested()
  loadLocalEnv()
  assertEnv()

  const redis = Redis.fromEnv()
  const qstash = new Client({ token: process.env.QSTASH_TOKEN })
  const target = `${new URL(process.env.APP_BASE_URL).origin}/api/jobs/create-inquiry`
  const runId = new Date().toISOString().replace(/[-:.TZ]/g, "").slice(0, 14)

  const jobs = Array.from({ length: COUNT }, (_, index) => {
    const businessPayload = makePayload(runId, index)
    return {
      requestId: crypto.randomUUID(),
      actorEmail: ACTOR_EMAIL,
      businessPayload,
      payloadHash: stablePayloadHash(businessPayload),
    }
  })

  console.log(JSON.stringify({ phase: "start", count: COUNT, target, actorEmail: ACTOR_EMAIL, runId }))

  await Promise.all(
    jobs.map((job) =>
      redis.set(
        statusKey(job.requestId),
        {
          requestId: job.requestId,
          status: "QUEUED",
          actorEmail: job.actorEmail,
          payloadHash: job.payloadHash,
          company: job.businessPayload.company,
          contactName: job.businessPayload.contactName,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
        { ex: 60 * 60 },
      ),
    ),
  )

  const publishResults = await Promise.all(
    jobs.map((job) =>
      qstash.publishJSON({
        url: target,
        body: job,
        deduplicationId: job.requestId,
        retries: 0,
        timeout: 90,
        flowControl: {
          key: FLOW_KEY,
          parallelism: 1,
          rate: 1,
          period: "1s",
        },
      }),
    ),
  )

  await Promise.all(
    jobs.map(async (job, index) => {
      const existing = await redis.get(statusKey(job.requestId))
      await redis.set(
        statusKey(job.requestId),
        { ...existing, qstashMessageId: publishResults[index].messageId, updatedAt: new Date().toISOString() },
        { ex: 60 * 60 },
      )
    }),
  )

  console.log(
    JSON.stringify({
      phase: "published",
      messages: publishResults.map((result, index) => ({
        requestId: jobs[index].requestId,
        messageId: result.messageId,
      })),
    }),
  )

  let statuses = []
  const maxAttempts = Math.ceil(POLL_SECONDS / 3)
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    await new Promise((resolve) => setTimeout(resolve, 3000))
    statuses = await Promise.all(jobs.map((job) => redis.get(statusKey(job.requestId))))
    const counts = statuses.reduce((acc, status) => {
      const name = status?.status || "MISSING"
      acc[name] = (acc[name] || 0) + 1
      return acc
    }, {})
    console.log(JSON.stringify({ phase: "poll", attempt, counts }))

    if (statuses.every((status) => status && status.status !== "QUEUED" && status.status !== "PROCESSING")) {
      break
    }
  }

  const results = jobs.map((job, index) => ({
    index: index + 1,
    requestId: job.requestId,
    company: job.businessPayload.company,
    status: statuses[index]?.status || "MISSING",
    inquiryNo: statuses[index]?.inquiryNo || "",
    errorCode: statuses[index]?.errorCode || "",
    errorMessage: statuses[index]?.errorMessage || "",
  }))

  const inquiryNos = results.map((result) => result.inquiryNo).filter(Boolean)
  const duplicateInquiryNos = inquiryNos.filter((value, index) => inquiryNos.indexOf(value) !== index)

  console.log(JSON.stringify({ phase: "results", results }, null, 2))
  console.log(
    JSON.stringify(
      {
        phase: "summary",
        total: results.length,
        success: results.filter((result) => result.status === "SUCCESS").length,
        failed: results.filter((result) => result.status === "FAILED").length,
        pending: results.filter((result) => result.status === "QUEUED" || result.status === "PROCESSING").length,
        inquiryNos,
        uniqueInquiryNos: [...new Set(inquiryNos)],
        duplicateInquiryNos: [...new Set(duplicateInquiryNos)],
      },
      null,
      2,
    ),
  )

  if (duplicateInquiryNos.length > 0) process.exit(2)
  if (results.some((result) => result.status !== "SUCCESS")) process.exit(3)
}

main().catch((error) => {
  console.error(JSON.stringify({ phase: "error", message: error.message }))
  process.exit(1)
})
