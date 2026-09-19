export const PROTECTED_PAGE_PATHS = ["/dashboard", "/customers", "/inquiry", "/view-inquiries", "/timeless"]

const PAGE_ROLE_RULES: Array<{ path: string; roles: Set<string> }> = [
]

export function normalizeRole(role: string) {
  return role.trim().toUpperCase()
}

export function isProtectedPage(pathname: string) {
  return PROTECTED_PAGE_PATHS.some((path) => pathname.startsWith(path))
}

export function canAccessPage(pathname: string, role: string) {
  const normalizedRole = normalizeRole(role)
  const rule = PAGE_ROLE_RULES.find((item) => pathname.startsWith(item.path))
  return rule ? rule.roles.has(normalizedRole) : isProtectedPage(pathname)
}
