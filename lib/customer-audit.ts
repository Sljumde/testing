import { appendToSheet, getSheetData } from "./sheets"
import type { Session } from "./auth"

export type CustomerAuditAction = "CLIENT_OPENED" | "SEND_TO_DEVICE" | "EMAIL_ACTION" | "COPY_ATTEMPT" | "CONTEXT_MENU_ATTEMPT" | "SEARCH" | "FILTER" | "PAGE_CHANGE" | "UNAUTHORIZED_ACCESS"
export type RiskLevel = "LOW" | "MEDIUM" | "HIGH"

export interface CustomerAuditContext {
  session: Session
  action: CustomerAuditAction
  request: Request
  customerCode?: string
  company?: string
  success?: boolean
  metadata?: Record<string, string | number | boolean>
}

const RISK_BY_ACTION: Record<CustomerAuditAction, RiskLevel> = {
  CLIENT_OPENED: "LOW", SEND_TO_DEVICE: "LOW", EMAIL_ACTION: "LOW", SEARCH: "LOW", FILTER: "LOW", PAGE_CHANGE: "LOW",
  COPY_ATTEMPT: "MEDIUM", CONTEXT_MENU_ATTEMPT: "MEDIUM", UNAUTHORIZED_ACCESS: "HIGH",
}

export async function writeCustomerAudit(context: CustomerAuditContext): Promise<void> {
  const ip = context.request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown"
  const agent = context.request.headers.get("user-agent") || "unknown"
  try {
    await appendToSheet("AuditLogs", [[
      new Date().toISOString(), context.session.email, context.session.role, context.action,
      context.customerCode || "", context.company || "", ip, agent.slice(0, 250),
      context.session.sessionId || "legacy-session", context.success === false ? "FAILURE" : "SUCCESS",
      RISK_BY_ACTION[context.action], JSON.stringify(context.metadata || {}), "OPEN",
    ]])
  } catch (error) {
    // Customer access must not fail just because the optional audit sheet is absent/unavailable.
    console.error("Unable to write customer audit:", error instanceof Error ? error.message : "Unknown error")
  }
}

export interface SecurityEvent {
  timestamp: string; userEmail: string; role: string; action: string; customerCode: string; company: string
  ip: string; device: string; sessionId: string; result: string; riskLevel: RiskLevel; metadata: string; investigationStatus: string
}

export async function getSecurityEvents(limit = 200): Promise<SecurityEvent[]> {
  const rows = await getSheetData("AuditLogs")
  return rows.slice(-limit).reverse().map((row) => ({
    timestamp: String(row[0] || ""), userEmail: String(row[1] || ""), role: String(row[2] || ""), action: String(row[3] || ""),
    customerCode: String(row[4] || ""), company: String(row[5] || ""), ip: String(row[6] || ""), device: String(row[7] || ""),
    sessionId: String(row[8] || ""), result: String(row[9] || ""), riskLevel: (["LOW", "MEDIUM", "HIGH"].includes(String(row[10])) ? row[10] : "LOW") as RiskLevel,
    metadata: String(row[11] || "{}"), investigationStatus: String(row[12] || "OPEN"),
  }))
}
