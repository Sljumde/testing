import { getUserRoleInfo } from "./sheets"
import { getSupabaseAdminClient } from "./supabase/server"

type InquiryAnalyticsRow = {
  inquiry_no: string | number | null
  inquiry_timestamp: string | null
  company_id: string | number | null
  company_name_raw: string | null
  contact_name_raw: string | null
  phone_raw: string | null
  sales_person_email_raw: string | null
  sales_person_name_raw: string | null
  sales_stage: string | null
  next_followup_date: string | null
  followup_date: string | null
  ts_backup: string | null
  revenue: string | number | null
}

const PAGE_SIZE = 1000
const GROUPS = {
  active: new Set(["discovery", "lead qualified", "sample shared", "shared quotation"]),
  hot: new Set(["final follow up", "under negotiation"]),
  won: new Set(["order won"]),
  lost: new Set(["order lost", "dead"]),
}

const text = (value: unknown) => String(value ?? "").trim()
const key = (value: unknown) => text(value).toLowerCase().replace(/\s+/g, " ")
const money = (value: unknown) => Number(text(value).replace(/[^\d.-]/g, "")) || 0

const parseDate = (value: unknown) => {
  const raw = text(value)
  if (!raw) return null

  const date = new Date(raw)
  if (!Number.isNaN(date.getTime())) return date

  const dmy = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:\s+(\d{1,2}):(\d{2}):?(\d{2})?)?$/)
  if (dmy) {
    return new Date(
      Number(dmy[3]),
      Number(dmy[2]) - 1,
      Number(dmy[1]),
      Number(dmy[4] || 0),
      Number(dmy[5] || 0),
      Number(dmy[6] || 0),
    )
  }

  return null
}

const dayKey = (date: Date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`

function salesperson(row: InquiryAnalyticsRow) {
  return text(row.sales_person_name_raw) || text(row.sales_person_email_raw)
}

function followupValue(row: InquiryAnalyticsRow) {
  return text(row.next_followup_date) || text(row.followup_date)
}

function createdValue(row: InquiryAnalyticsRow) {
  return text(row.ts_backup) || text(row.inquiry_timestamp)
}

function companyKey(row: InquiryAnalyticsRow) {
  return text(row.company_id) || key(row.company_name_raw)
}

function kpis(inquiries: InquiryAnalyticsRow[]) {
  const stages = { active: 0, hot: 0, won: 0, lost: 0, unclassified: 0 }

  for (const row of inquiries) {
    const stage = key(row.sales_stage)
    let found = false
    for (const group of ["active", "hot", "won", "lost"] as const) {
      if (GROUPS[group].has(stage)) {
        stages[group] += 1
        found = true
        break
      }
    }
    if (!found) stages.unclassified += 1
  }

  return {
    revenue: inquiries.reduce((sum, row) => sum + money(row.revenue), 0),
    customers: new Set(inquiries.map(companyKey).filter(Boolean)).size,
    inquiries: inquiries.length,
    stages,
  }
}

async function getSupabaseAnalyticsRows(authorizedEmails: string[]) {
  const supabase = getSupabaseAdminClient()
  const authorizedList = [...new Set(authorizedEmails.map(key).filter(Boolean))]
  const rows: InquiryAnalyticsRow[] = []

  if (authorizedList.length === 0) return rows

  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await supabase
      .from("inquiries")
      .select(`
        inquiry_no,
        inquiry_timestamp,
        company_id,
        company_name_raw,
        contact_name_raw,
        phone_raw,
        sales_person_email_raw,
        sales_person_name_raw,
        sales_stage,
        next_followup_date,
        followup_date,
        ts_backup,
        revenue
      `)
      .in("sales_person_email_raw", authorizedList)
      .or("is_active.is.null,is_active.eq.true")
      .range(from, from + PAGE_SIZE - 1)

    if (error) throw error
    if (!data || data.length === 0) break

    rows.push(...(data as InquiryAnalyticsRow[]))
    if (data.length < PAGE_SIZE) break
  }

  return rows
}

export async function getDashboardSummary(email: string) {
  const role = await getUserRoleInfo(email)
  const rows = await getSupabaseAnalyticsRows(role.authorizedEmails)
  const self = key(email)
  const myInquiries = rows.filter((row) => key(row.sales_person_email_raw) === self)

  const now = new Date()
  const tomorrow = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1)
  const dayAfter = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 2)
  const upcomingDays = new Set([dayKey(tomorrow), dayKey(dayAfter)])

  const upcoming = rows
    .map((row) => ({ row, date: parseDate(followupValue(row)) }))
    .filter((item): item is { row: InquiryAnalyticsRow; date: Date } => Boolean(item.date && upcomingDays.has(dayKey(item.date))))
    .sort((a, b) => +a.date - +b.date)
    .slice(0, 8)
    .map(({ row, date }) => ({
      date: dayKey(date),
      label: dayKey(date) === dayKey(tomorrow) ? "Tomorrow" : "Day After Tomorrow",
      inquiryNo: text(row.inquiry_no),
      company: text(row.company_name_raw),
      contact: text(row.contact_name_raw),
      phone: text(row.phone_raw),
      stage: text(row.sales_stage),
      salesperson: salesperson(row),
    }))

  const teamMembers = role.teamMembers
    .filter((member) => key(member.email) !== self)
    .map((member) => ({ email: text(member.email), name: text(member.email).split("@")[0] }))
    .slice(0, 30)

  const teamKpis = kpis(rows)

  return {
    role: role.role,
    team: role.role === "EMPLOYEE" ? null : teamKpis,
    mine: kpis(myInquiries),
    upcoming,
    teamMembers,
    diagnostics: { unclassifiedTeam: teamKpis.stages.unclassified },
  }
}

export async function getTimeline(email: string, params: URLSearchParams) {
  const role = await getUserRoleInfo(email)
  const rows = await getSupabaseAnalyticsRows(role.authorizedEmails)
  const type = params.get("type") || "all"
  const selectedSalesperson = key(params.get("salesperson"))
  const selectedStage = key(params.get("stage"))
  const start = parseDate(params.get("startDate"))
  const end = parseDate(params.get("endDate"))

  if (!start || !end || end < start || (+end - +start) / 86_400_000 > 6) {
    throw new Error("INVALID_DATE_RANGE")
  }

  start.setHours(0, 0, 0, 0)
  end.setHours(23, 59, 59, 999)

  let invalidDates = 0
  const rawEvents = rows
    .flatMap((row) => {
      const sources = [
        { type: "created", raw: createdValue(row) },
        { type: "follow-up", raw: followupValue(row) },
      ]

      return sources.flatMap((source) => {
        const date = parseDate(source.raw)
        if (source.raw && !date) invalidDates += 1
        if (!date) return []

        const hasTime = /\d{1,2}:\d{2}/.test(source.raw)
        return [{
          type: source.type,
          date,
          allDay: !hasTime,
          sourceValue: source.raw,
          inquiryNo: text(row.inquiry_no),
          company: text(row.company_name_raw),
          contact: text(row.contact_name_raw),
          phone: text(row.phone_raw),
          salesperson: salesperson(row),
          salespersonEmail: text(row.sales_person_email_raw),
          stage: text(row.sales_stage),
        }]
      })
    })
    .filter((event) =>
      event.date >= start &&
      event.date <= end &&
      (type === "all" || type === event.type) &&
      (!selectedSalesperson || key(event.salespersonEmail) === selectedSalesperson || key(event.salesperson) === selectedSalesperson) &&
      (!selectedStage || key(event.stage) === selectedStage),
    )
    .sort((a, b) => +a.date - +b.date)

  const unique = new Map<string, typeof rawEvents[number]>()
  for (const event of rawEvents) unique.set(`${event.inquiryNo}|${event.type}|${+event.date}`, event)

  const events = [...unique.values()].slice(0, 500).map((event) => ({ ...event, date: event.date.toISOString() }))

  return {
    events,
    diagnostics: { invalidDates, truncated: unique.size > 500 },
    filters: {
      salespeople: [...new Set(rows.map(salesperson).filter(Boolean))].sort((a, b) => a.localeCompare(b, "en", { sensitivity: "base" })),
      stages: [...new Set(rows.map((row) => text(row.sales_stage)).filter(Boolean))].sort(),
    },
  }
}
