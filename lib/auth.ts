import { cookies } from "next/headers"
import { SignJWT, jwtVerify } from "jose"
import { randomUUID } from "node:crypto"
import { validateEnv } from "./env"

export interface Session {
  email: string
  role: string
  sessionId?: string
}

function getSecretKey() {
  const { JWT_SECRET } = validateEnv()
  return new TextEncoder().encode(JWT_SECRET)
}

export async function createSession(email: string, role: string) {
  const SECRET_KEY = getSecretKey()

  const token = await new SignJWT({ email, role, sessionId: randomUUID() })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("24h")
    .sign(SECRET_KEY)

  const cookieStore = await cookies()
  cookieStore.set("session", token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 60 * 60 * 24, // 24 hours
  })
}

export async function getServerSession(): Promise<Session | null> {
  const cookieStore = await cookies()
  const token = cookieStore.get("session")

  if (!token) {
    return null
  }

  try {
    const SECRET_KEY = getSecretKey()
    const verified = await jwtVerify(token.value, SECRET_KEY)
    const { email, role, sessionId } = verified.payload
    if (typeof email !== "string" || typeof role !== "string") return null
    return { email, role, sessionId: typeof sessionId === "string" ? sessionId : undefined }
  } catch (error) {
    return null
  }
}

export const verifySession = getServerSession

export async function destroySession() {
  const cookieStore = await cookies()
  cookieStore.delete("session")
}
