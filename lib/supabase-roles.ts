import "server-only"

import { getSupabaseAdminClient } from "@/lib/supabase/server"

export type RoleInfo = {
  userEmail: string
  role: string
  reportsTo: string
  teamMembers: Array<{ email: string; role: string; reportsTo: string; name?: string }>
  authorizedEmails: string[]
}

type EmployeeRoleRow = {
  emp_id: number | string | null
  team_id: number | string | null
  emp_full_name: string | null
  emp_name: string | null
  email_id: string | null
  role_id: number | string | null
}

type RoleRow = {
  role_id: number | string | null
  role_name: string | null
}

function normalizeEmail(value: unknown) {
  return String(value || "").trim().toLowerCase()
}

function normalizeRole(value: unknown) {
  const role = String(value || "").trim().toUpperCase()
  return role || "EMPLOYEE"
}

function displayName(employee: EmployeeRoleRow) {
  return String(employee.emp_full_name || employee.emp_name || employee.email_id || "").trim()
}

async function getRoleNameById() {
  const { data, error } = await getSupabaseAdminClient().from("roles").select("role_id, role_name")
  if (error) throw error

  return new Map(
    ((data || []) as RoleRow[]).map((role) => [String(role.role_id), normalizeRole(role.role_name)]),
  )
}

function toTeamMember(employee: EmployeeRoleRow, roleNameById: Map<string, string>) {
  return {
    email: normalizeEmail(employee.email_id),
    role: roleNameById.get(String(employee.role_id)) || "EMPLOYEE",
    reportsTo: "",
    name: displayName(employee),
  }
}

export async function getSupabaseUserRoleInfo(userEmail: string): Promise<RoleInfo> {
  const supabase = getSupabaseAdminClient()
  const email = normalizeEmail(userEmail)
  const roleNameById = await getRoleNameById()

  const { data: employee, error: employeeError } = await supabase
    .from("employees")
    .select("emp_id, team_id, emp_full_name, emp_name, email_id, role_id")
    .eq("email_id", email)
    .eq("is_active", true)
    .limit(1)
    .maybeSingle()

  if (employeeError) throw employeeError

  if (!employee) {
    return {
      userEmail,
      role: "EMPLOYEE",
      reportsTo: "",
      teamMembers: [],
      authorizedEmails: [userEmail],
    }
  }

  const currentEmployee = employee as EmployeeRoleRow
  const role = roleNameById.get(String(currentEmployee.role_id)) || "EMPLOYEE"

  if (role === "BOSS") {
    const { data, error } = await supabase
      .from("employees")
      .select("emp_id, team_id, emp_full_name, emp_name, email_id, role_id")
      .eq("is_active", true)

    if (error) throw error

    const employees = ((data || []) as EmployeeRoleRow[]).filter((item) => normalizeEmail(item.email_id))
    return {
      userEmail,
      role,
      reportsTo: "",
      teamMembers: employees
        .filter((item) => normalizeEmail(item.email_id) !== email)
        .map((item) => toTeamMember(item, roleNameById)),
      authorizedEmails: employees.map((item) => normalizeEmail(item.email_id)),
    }
  }

  if (role === "HEAD" && currentEmployee.team_id != null) {
    const { data, error } = await supabase
      .from("employees")
      .select("emp_id, team_id, emp_full_name, emp_name, email_id, role_id")
      .eq("is_active", true)
      .eq("team_id", currentEmployee.team_id)

    if (error) throw error

    const employees = ((data || []) as EmployeeRoleRow[]).filter((item) => normalizeEmail(item.email_id))
    return {
      userEmail,
      role,
      reportsTo: "",
      teamMembers: employees
        .filter((item) => normalizeEmail(item.email_id) !== email)
        .map((item) => toTeamMember(item, roleNameById)),
      authorizedEmails: employees.map((item) => normalizeEmail(item.email_id)),
    }
  }

  return {
    userEmail,
    role,
    reportsTo: "",
    teamMembers: [],
    authorizedEmails: [email],
  }
}
