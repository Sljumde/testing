import { type NextRequest, NextResponse } from "next/server"
import { jwtVerify } from "jose"
import { canAccessPage, isProtectedPage } from "./lib/permissions"

function getSecretKey() {
  const JWT_SECRET = process.env.JWT_SECRET
  if (!JWT_SECRET) {
    throw new Error("JWT_SECRET is not defined")
  }
  return new TextEncoder().encode(JWT_SECRET)
}

async function verifyAuth(request: NextRequest) {
  const token = request.cookies.get("session")?.value

  if (!token) {
    return null
  }

  try {
    const SECRET_KEY = getSecretKey()
    const verified = await jwtVerify(token, SECRET_KEY)
    return verified.payload
  } catch (error) {
    return null
  }
}

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl

  if (isProtectedPage(pathname)) {
    const session = await verifyAuth(request)

    if (!session) {
      // Redirect to login if no session
      const loginUrl = new URL("/login", request.url)
      const response = NextResponse.redirect(loginUrl)
      response.cookies.delete("session") // Clear any invalid session
      return response
    }

    if (typeof session.role !== "string" || !canAccessPage(pathname, session.role)) {
      return NextResponse.redirect(new URL("/dashboard", request.url))
    }
  }

  if (pathname === "/login") {
    const session = await verifyAuth(request)
    if (session) {
      return NextResponse.redirect(new URL("/dashboard", request.url))
    }
  }

  if (pathname === "/") {
    const session = await verifyAuth(request)
    const redirectUrl = session ? "/dashboard" : "/login"
    return NextResponse.redirect(new URL(redirectUrl, request.url))
  }

  return NextResponse.next()
}

export const config = {
  matcher: ["/((?!api|_next/static|_next/image|_next/icon|favicon.ico|public).*)"],
}
