export type CustomerPermission =
  | "customer.read.own"
  | "customer.read.team"
  | "customer.read.all"
  | "customer.audit.read"
  | "customer.export"

const ROLE_PERMISSIONS: Record<string, ReadonlySet<CustomerPermission>> = {
  EMPLOYEE: new Set(["customer.read.own"]),
  HEAD: new Set(["customer.read.own", "customer.read.team"]),
  BOSS: new Set(["customer.read.own", "customer.read.team", "customer.read.all", "customer.audit.read", "customer.export"]),
}

export function hasCustomerPermission(role: string, permission: CustomerPermission): boolean {
  return ROLE_PERMISSIONS[role]?.has(permission) ?? false
}

export function requireCustomerPermission(role: string, permission: CustomerPermission): void {
  if (!hasCustomerPermission(role, permission)) throw new CustomerPermissionError(permission)
}

export class CustomerPermissionError extends Error {
  constructor(public readonly permission: CustomerPermission) {
    super(`Missing permission: ${permission}`)
    this.name = "CustomerPermissionError"
  }
}
