"use client"

import type React from "react"
import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { Mail, Lock, ArrowRight, Shield, Eye, EyeOff } from "lucide-react"
import { toast } from "react-toastify"

const loginArtworkNames = [
  "login-art-28.jpg",
  "money-makers.png",
  "download (44).jpg",
  "download (46).jpg",
  "download (47).jpg",
  "download (52).jpg",
  "download (57).jpg",
  "download (58).jpg",
  "download (66).jpg",
  "For the tennis lovers_.jpg",
  "37+ Stunning Bonsaï Wallpapers – Free Download Now!.jpg",
]

export default function LoginPage() {
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")
  const [artworkSrc, setArtworkSrc] = useState<string>(`/login-art/${encodeURIComponent(loginArtworkNames[0])}`)
  const router = useRouter()

  useEffect(() => {
    const randomArtwork = loginArtworkNames[Math.floor(Math.random() * loginArtworkNames.length)]
    setArtworkSrc(`/login-art/${encodeURIComponent(randomArtwork)}`)
  }, [])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError("")

    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      })

      const data = await res.json()

      if (data.success) {
        toast.success("Login successful! Redirecting...")
        setTimeout(() => {
          router.push("/dashboard")
          router.refresh()
        }, 800)
      } else {
        setError(data.message || "Invalid email or password")
        toast.error(data.message || "Invalid email or password")
      }
    } catch (err) {
      setError("Login failed. Please try again.")
      toast.error("Login failed. Please try again.")
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="relative min-h-screen w-full overflow-hidden bg-[#050506] text-[#F8F7F4]">
      {loading && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 px-4">
          <div className="rounded-3xl bg-white p-6 shadow-2xl">
            <div className="animate-spin rounded-full h-12 w-12 border-4 border-[#050506] border-t-transparent"></div>
            <p className="mt-4 text-sm font-medium text-[#050506]">Logging in...</p>
          </div>
        </div>
      )}

      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_20%_20%,rgba(255,255,255,0.14)_1px,transparent_1px),radial-gradient(circle_at_80%_40%,rgba(255,255,255,0.08)_1px,transparent_1px)] bg-[length:180px_180px,260px_260px] opacity-40" />

        <div className="relative mx-auto flex w-full items-center px-4 py-8" style={{ width: "min(1180px,88vw)", height: "min(700px,82vh)", minHeight: "650px" }}>
          <div className="w-full h-full mx-auto rounded-[34px] shadow-[0_40px_90px_rgba(0,0,0,0.35)] overflow-hidden bg-[#FCFBF8] lg:grid lg:grid-cols-[56%_44%]">
          {/* LEFT ARTWORK PANEL */}
          <aside className="relative overflow-hidden rounded-l-[34px] rounded-r-none lg:p-0">
            {/* Full-bleed artwork that touches card edges */}
            <div className="absolute inset-0 lg:[clip-path:polygon(0_0,100%_0,91%_100%,0_100%)]">
              {/* Ambient blurred background (same artwork) */}
              <img src={artworkSrc} alt="" aria-hidden className="pointer-events-none absolute inset-0 h-full w-full object-cover scale-[1.2] blur-3xl saturate-125 brightness-[0.7]" />

              {/* Very subtle gold inset line (inset from card edge) */}
              <div className="pointer-events-none absolute inset-[16px] lg:[clip-path:polygon(0_0,100%_0,91%_100%,0_100%)]" style={{ border: "0.7px solid rgba(190,150,92,0.5)", boxShadow: "0 0 12px rgba(190,150,92,0.06)", borderRadius: 0 }} />

              {/* Sharp foreground artwork (no inner grey frame) */}
              <img src={artworkSrc} alt="Login artwork" className="pointer-events-none absolute inset-0 h-full w-full object-cover" style={{ transform: "scale(1.04)", transformOrigin: "center" }} />
            </div>
          </aside>

          {/* RIGHT LOGIN SECTION */}
          <main className="relative z-20 flex flex-col items-center justify-center p-10" style={{ marginLeft: '-30px' }}>
            <div className="w-full max-w-[440px]" style={{ maxWidth: "440px" }}>
              <div className="mb-[44px]">
                <h1 className="text-[22px] font-semibold uppercase tracking-[0.32em] text-[#29292D]">Brownwall CRM 3.0</h1>
                <p className="mt-[14px] text-[15px] italic text-[#68686F]">Everything important is waiting.</p>
              </div>

              {error && (
                <div className="mb-6 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</div>
              )}

              <form onSubmit={handleSubmit} className="flex flex-col w-full">
                <div style={{ marginTop: '42px' }} />
                <div className="mb-6">
                  <label className="block text-[12px] font-semibold uppercase tracking-[0.24em] text-[#515158]">Email</label>
                  <div className="relative mt-[9px]">
                    <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required placeholder="alchemist@brownwall.com" className="w-full h-[56px] rounded-[15px] bg-[#F8F7F3] px-[18px] text-[16px] text-[#1F1F1F] outline-none" style={{ border: '1px solid #E3E1DB' }} />
                    <div className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-[#8C8B90]"><Mail className="h-5 w-5" /></div>
                  </div>
                </div>

                <div className="mb-6">
                  <label className="block text-[12px] font-semibold uppercase tracking-[0.24em] text-[#515158]">Password</label>
                  <div className="relative mt-[9px]">
                    <input type={showPassword ? 'text' : 'password'} value={password} onChange={(e) => setPassword(e.target.value)} required placeholder="••••••••" className="w-full h-[56px] rounded-[15px] bg-[#F8F7F3] px-[18px] pr-12 text-[16px] text-[#1F1F1F] outline-none" style={{ border: '1px solid #E3E1DB' }} />
                    <button type="button" onClick={() => setShowPassword((p) => !p)} className="absolute right-4 top-1/2 -translate-y-1/2 text-[#8C8B90]" aria-label={showPassword ? 'Hide password' : 'Show password'}>{showPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}</button>
                  </div>
                </div>

                <div className="mt-[30px]">
                  <button type="submit" disabled={loading} className="group relative w-full h-[58px] rounded-[15px] bg-[#111214] text-white text-[15px] font-semibold flex items-center justify-center transition-transform duration-150 active:scale-[0.985] hover:-translate-y-[1px] shadow-[0_10px_30px_rgba(0,0,0,0.12)]">
                    <span>{loading ? 'Logging in...' : 'Step Inside'}</span>
                    <ArrowRight className="ml-3 h-5 w-5 transform transition-transform duration-150 group-hover:translate-x-1" />
                  </button>
                </div>

                <div style={{ height: 38 }} />

                <div className="text-center text-[13px] text-[#8A898F]">Built for speed, accuracy, and scale.</div>
              </form>
                  </div>
                </main>
        </div>
      </div>
    </div>
  )
}
