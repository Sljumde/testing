import { NextResponse } from "next/server"

export async function GET() {
  try {
    // Check if environment variables are set
    const hasCoreEnv = !!(
      process.env.GOOGLE_SHEET_ID &&
      process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL &&
      process.env.GOOGLE_PRIVATE_KEY &&
      process.env.JWT_SECRET
    )
    const queueEnv = {
      qstashToken: Boolean(process.env.QSTASH_TOKEN),
      qstashCurrentSigningKey: Boolean(process.env.QSTASH_CURRENT_SIGNING_KEY),
      qstashNextSigningKey: Boolean(process.env.QSTASH_NEXT_SIGNING_KEY),
      upstashRedisRestUrl: Boolean(process.env.UPSTASH_REDIS_REST_URL),
      upstashRedisRestToken: Boolean(process.env.UPSTASH_REDIS_REST_TOKEN),
      appBaseUrl: Boolean(process.env.APP_BASE_URL),
      appBaseOrigin: process.env.APP_BASE_URL ? new URL(process.env.APP_BASE_URL).origin : null,
    }
    const hasQueueEnv = Object.entries(queueEnv)
      .filter(([key]) => key !== "appBaseOrigin")
      .every(([, value]) => Boolean(value))

    return NextResponse.json({
      status: "ok",
      timestamp: new Date().toISOString(),
      environment: hasCoreEnv ? "configured" : "missing-variables",
      queue: {
        configured: hasQueueEnv,
        ...queueEnv,
      },
    })
  } catch (error) {
    return NextResponse.json({ status: "error", message: "Health check failed" }, { status: 500 })
  }
}
