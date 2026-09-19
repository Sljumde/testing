import "server-only"

import { randomUUID } from "node:crypto"
import { getServerSession, type Session } from "@/lib/auth"
import { getAuthenticatedSupabaseServerClient, getSupabaseAdminClient } from "@/lib/supabase/server"

type LogStatus = "started" | "success" | "failure"
type CrudAction = "CREATE" | "READ" | "UPDATE" | "DELETE" | "AUTH" | "SYSTEM"

export type AppLogContext = {
  requestId?: string
  route: string
  method: string
  action: CrudAction
  resource: string
  operation: string
  query?: string
  targetId?: string | number | null
  metadata?: Record<string, unknown>
}

export type AppLogger = {
  requestId: string
  session: Session | null
  supabaseUserId: string | null
  startedAt: number
  success: (input?: { statusCode?: number; targetId?: string | number | null; metadata?: Record<string, unknown> }) => Promise<void>
  failure: (input: { statusCode?: number; error: unknown; targetId?: string | number | null; metadata?: Record<string, unknown> }) => Promise<void>
}

function deploymentMetadata() {
  return {
    environment: process.env.VERCEL_ENV || process.env.NODE_ENV || null,
    deploymentId: process.env.VERCEL_DEPLOYMENT_ID || null,
    deploymentUrl: process.env.VERCEL_URL || null,
    commitSha: process.env.VERCEL_GIT_COMMIT_SHA || process.env.NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA || null,
    commitRef: process.env.VERCEL_GIT_COMMIT_REF || process.env.NEXT_PUBLIC_VERCEL_GIT_COMMIT_REF || null,
  }
}

export function serializeError(error: unknown) {
  if (!error || typeof error !== "object") {
    return { message: String(error), name: "UnknownError" }
  }

  const value = error as {
    name?: string
    message?: string
    code?: string
    details?: string
    hint?: string
    stack?: string
  }

  return {
    name: value.name || "Error",
    message: value.message || String(error),
    code: value.code || null,
    details: value.details || null,
    hint: value.hint || null,
    stack: value.stack || null,
  }
}

async function getSupabaseUserId() {
  const auth = await getAuthenticatedSupabaseServerClient()
  return auth.user?.id || null
}

async function writeApplicationLog(
  context: AppLogContext,
  status: LogStatus,
  input: {
    requestId: string
    session: Session | null
    supabaseUserId: string | null
    startedAt: number
    statusCode?: number
    targetId?: string | number | null
    metadata?: Record<string, unknown>
    error?: unknown
  },
) {
  const durationMs = Date.now() - input.startedAt
  const targetId = input.targetId ?? context.targetId ?? null
  const payload = {
    request_id: input.requestId,
    route: context.route,
    method: context.method,
    action: context.action,
    resource: context.resource,
    operation: context.operation,
    query: context.query || null,
    target_id: targetId == null ? null : String(targetId),
    status,
    status_code: input.statusCode ?? null,
    duration_ms: durationMs,
    user_email: input.session?.email || null,
    user_role: input.session?.role || null,
    supabase_auth_user_id: input.supabaseUserId,
    deployment: deploymentMetadata(),
    metadata: {
      ...(context.metadata || {}),
      ...(input.metadata || {}),
    },
    error: input.error ? serializeError(input.error) : null,
  }

  try {
    const { error } = await getSupabaseAdminClient().from("application_logs").insert(payload)
    if (error) {
      console.error("[application-log] insert failed", { requestId: input.requestId, error: serializeError(error), payload })
    }
  } catch (error) {
    console.error("[application-log] insert exception", { requestId: input.requestId, error: serializeError(error), payload })
  }
}

export async function createAppLogger(context: AppLogContext): Promise<AppLogger> {
  const requestId = context.requestId || randomUUID()
  const startedAt = Date.now()
  const session = await getServerSession()
  const supabaseUserId = await getSupabaseUserId()

  await writeApplicationLog(context, "started", {
    requestId,
    session,
    supabaseUserId,
    startedAt,
  })

  return {
    requestId,
    session,
    supabaseUserId,
    startedAt,
    success: (input = {}) =>
      writeApplicationLog(context, "success", {
        requestId,
        session,
        supabaseUserId,
        startedAt,
        ...input,
      }),
    failure: (input) =>
      writeApplicationLog(context, "failure", {
        requestId,
        session,
        supabaseUserId,
        startedAt,
        ...input,
      }),
  }
}
