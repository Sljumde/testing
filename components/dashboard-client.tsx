"use client"

import type React from "react"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import { Loader2, LogOut, FileText, Users, UserPlus, Eye, Mail, Lock, ArrowRight, Shield } from "lucide-react"
import { toast, Toaster } from "sonner"

interface UserInfo {
  userEmail: string
  role: string
  reportsTo: string
  teamMembers: any[]
  authorizedEmails: string[]
}

export default function DashboardClient({
  userInfo,
  initialSession,
}: { userInfo: UserInfo | null; initialSession: any }) {
  const router = useRouter()
  const [isLoggedIn, setIsLoggedIn] = useState(!!initialSession)
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")
  const [inquiryCount, setInquiryCount] = useState(0)
  const [customerCount, setCustomerCount] = useState(0)
  const [isNavigating, setIsNavigating] = useState(false)

  useEffect(() => {
    const token = typeof window !== "undefined" && localStorage.getItem("auth_token")
    if (token && !isLoggedIn) {
      setIsLoggedIn(true)
    }
  }, [isLoggedIn])

  useEffect(() => {
    if (isLoggedIn && userInfo) {
      fetchCounts()
    }
  }, [isLoggedIn, userInfo])

  const fetchCounts = async () => {
    try {
      const [inquiriesRes, customersRes] = await Promise.all([fetch("/api/inquiries"), fetch("/api/customers")])

      const inquiriesData = await inquiriesRes.json()
      const customersData = await customersRes.json()

      if (inquiriesData.success) setInquiryCount(inquiriesData.data.length)
      if (customersData.success) setCustomerCount(customersData.data.total)
    } catch (error) {
      console.error("Error fetching counts:", error)
    }
  }

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError("")

    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ email, password }),
      })

      const data = await res.json()

      if (data.success) {
        localStorage.setItem("auth_token", data.token || email)
        toast.success("Login successful!")
        setIsLoggedIn(true)
        setEmail("")
        setPassword("")
      } else {
        setError(data.message || "Invalid email or password")
        toast.error(data.message || "Invalid email or password")
      }
    } catch (err) {
      console.error("[v0] Login error:", err)
      setError("Login failed. Please try again.")
      toast.error("Login failed. Please try again.")
    } finally {
      setLoading(false)
    }
  }

  const handleLogout = async () => {
    await fetch("/api/auth/logout", { method: "POST" })
    localStorage.removeItem("auth_token")
    setIsLoggedIn(false)
    setEmail("")
    setPassword("")
  }

  const handleNavigation = (href: string) => {
    setIsNavigating(true)
    router.push(href)
  }

  if (!isLoggedIn) {
    return (
      <div className="relative min-h-screen w-full flex flex-col items-center justify-center overflow-hidden bg-gradient-to-br from-[#F5F3F0] via-[#d7ccc8] to-[#5D4037]">
        <Toaster position="top-center" richColors expand />

        {loading && (
          <div className="fixed inset-0 z-[100] bg-black/50 flex items-center justify-center">
            <div className="bg-white rounded-lg p-6 flex flex-col items-center gap-3">
              <div className="animate-spin rounded-full h-12 w-12 border-4 border-[#f9f506] border-t-transparent"></div>
              <p className="text-gray-700 font-medium">Logging in...</p>
            </div>
          </div>
        )}

        {/* Background Pattern */}
        <div
          className="absolute inset-0 opacity-50 pointer-events-none"
          style={{
            backgroundImage: "radial-gradient(rgba(212, 175, 55, 0.1) 1px, transparent 1px)",
            backgroundSize: "30px 30px",
          }}
        ></div>

        {/* Abstract Background Elements */}
        <div className="absolute top-[-10%] left-[-10%] w-[500px] h-[500px] bg-white/20 rounded-full blur-[100px] pointer-events-none"></div>
        <div className="absolute bottom-[-10%] right-[-10%] w-[600px] h-[600px] bg-[#5D4037]/20 rounded-full blur-[120px] pointer-events-none"></div>

        {/* Main Container */}
        <div className="z-10 w-full max-w-[480px] p-4">
          {/* Login Card */}
          <div className="bg-white/75 backdrop-blur-xl rounded-[2.5rem] shadow-2xl transform transition-transform duration-500 hover:-translate-y-1 p-8 sm:p-12 relative overflow-hidden border border-white/80">
            {/* Decorative top glow */}
            <div className="absolute top-0 left-1/2 -translate-x-1/2 w-32 h-1 bg-gradient-to-r from-transparent via-[#f9f506] to-transparent opacity-60"></div>

            {/* Logo Section */}
            <div className="flex flex-col items-center justify-center mb-10">
              <div className="mb-6">
                <img
                  src="https://brownwall.com/wp-content/uploads/2024/04/cropped-BROWNWALL-new-LOGO-secondary-2.png"
                  alt="BrownWall Logo"
                  className="h-16 w-auto object-contain"
                />
              </div>
              <h2 className="text-[#3E2723] tracking-tight text-[28px] font-bold leading-tight text-center">
                BrownWall CRM
              </h2>
              <p className="text-[#6D4C41] text-sm font-medium tracking-widest uppercase mt-1">Enterprise Access</p>
            </div>

            {/* Error Message */}
            {error && (
              <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-2xl text-red-700 text-sm">{error}</div>
            )}

            {/* Form Section */}
            <form onSubmit={handleLogin} className="flex flex-col gap-6 w-full">
              {/* Email Field */}
              <div className="group">
                <label className="block text-[#4E342E] text-sm font-semibold mb-2 ml-4">Email Address</label>
                <div className="relative">
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    className="w-full h-14 bg-white/50 text-[#3E2723] placeholder:text-[#3E2723]/40 rounded-full border-none shadow-[inset_2px_2px_6px_rgba(0,0,0,0.05),inset_-2px_-2px_6px_rgba(255,255,255,0.8)] focus:ring-2 focus:ring-[#f9f506]/50 focus:shadow-[0_0_15px_rgba(249,245,6,0.15)] px-6 pr-12 text-base outline-none transition-all duration-300"
                    placeholder="admin@brownwall.com"
                  />
                  <div className="absolute right-5 top-1/2 -translate-y-1/2 text-[#6D4C41] pointer-events-none">
                    <Mail className="h-5 w-5" />
                  </div>
                </div>
              </div>

              {/* Password Field */}
              <div className="group">
                <label className="block text-[#4E342E] text-sm font-semibold mb-2 ml-4">Password</label>
                <div className="relative">
                  <input
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    className="w-full h-14 bg-white/50 text-[#3E2723] placeholder:text-[#3E2723]/40 rounded-full border-none shadow-[inset_2px_2px_6px_rgba(0,0,0,0.05),inset_-2px_-2px_6px_rgba(255,255,255,0.8)] focus:ring-2 focus:ring-[#f9f506]/50 focus:shadow-[0_0_15px_rgba(249,245,6,0.15)] px-6 pr-12 text-base outline-none transition-all duration-300"
                    placeholder="••••••••"
                  />
                  <div className="absolute right-5 top-1/2 -translate-y-1/2 text-[#6D4C41] pointer-events-none">
                    <Lock className="h-5 w-5" />
                  </div>
                </div>
              </div>

              {/* Forgot Password Link */}
              <div className="flex justify-end px-2">
                <a
                  href="#"
                  className="text-[#D4AF37] text-sm font-medium hover:text-[#4E342E] transition-colors duration-200"
                >
                  Forgot Password?
                </a>
              </div>

              {/* Login Button */}
              <button
                type="submit"
                disabled={loading}
                className="relative w-full h-14 mt-2 rounded-full overflow-hidden group/btn shadow-lg transition-all hover:shadow-[#f9f506]/20 disabled:opacity-50"
              >
                <div className="absolute inset-0 bg-gradient-to-r from-[#3E2723] via-[#4E342E] to-[#3E2723]"></div>
                {/* Shimmer Effect */}
                <div className="absolute inset-0 translate-x-[-100%] group-hover/btn:translate-x-[100%] transition-transform duration-700 bg-gradient-to-r from-transparent via-white/10 to-transparent skew-x-12"></div>
                <div className="relative flex items-center justify-center gap-2 h-full w-full">
                  <span
                    className="text-[#f9f506] font-bold tracking-wide text-lg"
                    style={{ textShadow: "0 0 10px rgba(212, 175, 55, 0.3)" }}
                  >
                    {loading ? "Logging in..." : "Login to CRM"}
                  </span>
                  {!loading && (
                    <ArrowRight className="text-[#f9f506] group-hover/btn:translate-x-1 transition-transform h-5 w-5" />
                  )}
                </div>
              </button>
            </form>

            {/* Footer */}
            <div className="mt-10 text-center border-t border-[#3E2723]/5 pt-6">
              <p className="text-[#6D4C41]/70 text-xs leading-relaxed font-medium">
                Empowering BrownWall Systems.
                <br />
                Built for speed, accuracy, and scale.
              </p>
            </div>
          </div>

          {/* Bottom Branding */}
          <div className="mt-8 flex items-center justify-center gap-2 opacity-60">
            <Shield className="text-[#4E342E] h-4 w-4" />
            <span className="text-[#4E342E] text-xs font-bold tracking-widest uppercase">Secured by BrownWall</span>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#F5F3F0] via-[#e6ddd8] to-[#d7ccc8]">
      <Toaster position="top-center" richColors expand />

      {isNavigating && (
        <div className="fixed inset-0 bg-black/20 backdrop-blur-sm z-50 flex items-center justify-center">
          <div className="bg-white rounded-2xl p-6 shadow-2xl flex flex-col items-center gap-3">
            <Loader2 className="h-8 w-8 animate-spin text-[#5D4037]" />
            <p className="text-sm font-medium text-[#3E2723]">Loading...</p>
          </div>
        </div>
      )}

      <nav className="bg-gradient-to-r from-[#3E2723] via-[#4E342E] to-[#5D4037] text-white p-4 shadow-lg">
        <div className="max-w-7xl mx-auto flex justify-between items-center">
          <div className="flex items-center gap-4">
            <img
              src="https://brownwall.com/wp-content/uploads/2024/04/cropped-BROWNWALL-new-LOGO-secondary-2.png"
              alt="BrownWall"
              className="h-8 w-auto"
            />
            <h1 className="text-xl md:text-2xl font-bold" style={{ textShadow: "0 0 10px rgba(249, 245, 6, 0.2)" }}>
              CRM Dashboard
            </h1>
          </div>
          <div className="flex items-center gap-3 md:gap-4">
            <span className="text-xs md:text-sm text-[#f9f506] font-medium truncate max-w-[120px] md:max-w-[200px]">
              {userInfo?.userEmail}
            </span>
            <button
              onClick={handleLogout}
              className="bg-[#f9f506] text-[#3E2723] px-3 md:px-4 py-2 rounded-lg hover:bg-[#D4AF37] transition-colors font-semibold flex items-center gap-2"
            >
              <LogOut className="h-4 w-4" />
              <span className="hidden sm:inline">Logout</span>
            </button>
          </div>
        </div>
      </nav>

      <div className="max-w-7xl mx-auto p-4 md:p-8">
        <div className="mb-8">
          <h2 className="text-2xl md:text-3xl font-bold text-[#3E2723] mb-2">Welcome to Your CRM</h2>
          <p className="text-[#6D4C41]">Manage your inquiries, customers, and team all in one place</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 md:gap-6 mb-8">
          <div className="bg-white/90 backdrop-blur p-6 rounded-2xl shadow-lg border-l-4 border-[#5D4037]">
            <div className="flex justify-between items-start">
              <div>
                <p className="text-[#6D4C41] text-sm uppercase mb-1 font-semibold">Total Inquiries</p>
                <p className="text-3xl font-bold text-[#3E2723]">{inquiryCount}</p>
              </div>
              <div className="bg-[#5D4037]/10 p-3 rounded-xl">
                <FileText className="w-6 h-6 text-[#5D4037]" />
              </div>
            </div>
          </div>

          <div className="bg-white/90 backdrop-blur p-6 rounded-2xl shadow-lg border-l-4 border-[#D4AF37]">
            <div className="flex justify-between items-start">
              <div>
                <p className="text-[#6D4C41] text-sm uppercase mb-1 font-semibold">Total Customers</p>
                <p className="text-3xl font-bold text-[#3E2723]">{customerCount}</p>
              </div>
              <div className="bg-[#D4AF37]/10 p-3 rounded-xl">
                <Users className="w-6 h-6 text-[#D4AF37]" />
              </div>
            </div>
          </div>

          <div className="bg-white/90 backdrop-blur p-6 rounded-2xl shadow-lg border-l-4 border-[#4E342E]">
            <div className="flex justify-between items-start">
              <div>
                <p className="text-[#6D4C41] text-sm uppercase mb-1 font-semibold">Team Members</p>
                <p className="text-3xl font-bold text-[#3E2723]">{userInfo?.teamMembers.length || 0}</p>
              </div>
              <div className="bg-[#4E342E]/10 p-3 rounded-xl">
                <Users className="w-6 h-6 text-[#4E342E]" />
              </div>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 md:gap-6">
          <div onClick={() => handleNavigation("/view-inquiries")} className="cursor-pointer group">
            <div className="bg-white/90 backdrop-blur p-6 rounded-2xl shadow-lg hover:shadow-2xl transition-all duration-300 border border-[#e6ddd8] group-hover:border-[#D4AF37]">
              <div className="flex flex-col items-center text-center gap-3">
                <div className="bg-gradient-to-br from-[#5D4037] to-[#4E342E] p-4 rounded-2xl group-hover:scale-110 transition-transform">
                  <Eye className="w-7 h-7 text-[#f9f506]" />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-[#3E2723] mb-1">View & Edit</h3>
                  <p className="text-sm text-[#6D4C41]">Manage all inquiries</p>
                </div>
                <span className="text-[#D4AF37] font-semibold text-sm group-hover:translate-x-1 transition-transform inline-block">
                  View Inquiries →
                </span>
              </div>
            </div>
          </div>

          <div onClick={() => handleNavigation("/customers")} className="cursor-pointer group">
            <div className="bg-white/90 backdrop-blur p-6 rounded-2xl shadow-lg hover:shadow-2xl transition-all duration-300 border border-[#e6ddd8] group-hover:border-[#D4AF37]">
              <div className="flex flex-col items-center text-center gap-3">
                <div className="bg-gradient-to-br from-[#D4AF37] to-[#b8941f] p-4 rounded-2xl group-hover:scale-110 transition-transform">
                  <Users className="w-7 h-7 text-[#3E2723]" />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-[#3E2723] mb-1">Customer DB</h3>
                  <p className="text-sm text-[#6D4C41]">View customer info</p>
                </div>
                <span className="text-[#D4AF37] font-semibold text-sm group-hover:translate-x-1 transition-transform inline-block">
                  View Customers →
                </span>
              </div>
            </div>
          </div>

          <div onClick={() => handleNavigation("/inquiry")} className="cursor-pointer group">
            <div className="bg-white/90 backdrop-blur p-6 rounded-2xl shadow-lg hover:shadow-2xl transition-all duration-300 border border-[#e6ddd8] group-hover:border-[#D4AF37]">
              <div className="flex flex-col items-center text-center gap-3">
                <div className="bg-gradient-to-br from-[#4E342E] to-[#3E2723] p-4 rounded-2xl group-hover:scale-110 transition-transform">
                  <FileText className="w-7 h-7 text-[#f9f506]" />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-[#3E2723] mb-1">New Inquiry</h3>
                  <p className="text-sm text-[#6D4C41]">Add inquiry</p>
                </div>
                <span className="text-[#D4AF37] font-semibold text-sm group-hover:translate-x-1 transition-transform inline-block">
                  Create Inquiry →
                </span>
              </div>
            </div>
          </div>

          <div aria-hidden="true" className="hidden">
            <div className="bg-white/90 backdrop-blur p-6 rounded-2xl shadow-lg hover:shadow-2xl transition-all duration-300 border border-[#e6ddd8] group-hover:border-[#D4AF37]">
              <div className="flex flex-col items-center text-center gap-3">
                <div className="bg-gradient-to-br from-[#6D4C41] to-[#5D4037] p-4 rounded-2xl group-hover:scale-110 transition-transform">
                  <UserPlus className="w-7 h-7 text-[#f9f506]" />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-[#3E2723] mb-1">New Customer</h3>
                  <p className="text-sm text-[#6D4C41]">Add customer</p>
                </div>
                <span className="text-[#D4AF37] font-semibold text-sm group-hover:translate-x-1 transition-transform inline-block">
                  Add Customer →
                </span>
              </div>
            </div>
          </div>
        </div>

        {userInfo && userInfo.role !== "EMPLOYEE" && userInfo.teamMembers.length > 0 && (
          <div className="mt-8 bg-white/90 backdrop-blur p-6 rounded-2xl shadow-lg border border-[#e6ddd8]">
            <h3 className="text-xl font-bold text-[#3E2723] mb-4">Your Team</h3>
            <div className="space-y-2">
              {userInfo.teamMembers.map((member, index) => (
                <div
                  key={index}
                  className="flex items-center gap-3 p-3 bg-[#F5F3F0] rounded-xl hover:bg-[#e6ddd8] transition-colors"
                >
                  <div className="bg-[#5D4037] p-2 rounded-full">
                    <Users className="w-5 h-5 text-[#f9f506]" />
                  </div>
                  <div>
                    <p className="font-semibold text-[#3E2723]">{member.email}</p>
                    <p className="text-sm text-[#6D4C41]">{member.role}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
