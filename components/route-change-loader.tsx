"use client"

import { useEffect, useState } from "react"
import { usePathname } from "next/navigation"

type SoftLoaderProps = {
  label?: string
  detail?: string
  blockPointerEvents?: boolean
}

export function SoftLoader({
  label = "Loading...",
  detail = "Just a moment",
  blockPointerEvents = true,
}: SoftLoaderProps) {
  return (
    <div
      className={`fixed inset-0 z-[9999] flex items-center justify-center bg-[#FFFCF8]/75 backdrop-blur-xl transition-opacity duration-300 ${
        blockPointerEvents ? "pointer-events-auto" : "pointer-events-none"
      }`}
      aria-live="polite"
      aria-busy="true"
    >
      <div className="flex min-w-[220px] flex-col items-center gap-5 rounded-[28px] border border-white/70 bg-white/70 px-8 py-7 text-center shadow-[0_24px_70px_rgba(89,45,22,0.14)]">
        <div className="relative h-14 w-14">
          <div className="absolute inset-0 rounded-full bg-gradient-to-br from-[#FFE7D2] via-white to-[#F2E8FF] shadow-inner" />
          <div className="absolute inset-1 rounded-full border border-white/80" />
          <div className="absolute inset-0 rounded-full border-[3px] border-transparent border-t-[#E9783D] border-r-[#C65F2E] animate-spin" />
          <div className="absolute left-1/2 top-1/2 h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-[#E9783D]/80 shadow-[0_0_18px_rgba(233,120,61,0.45)]" />
        </div>
        <div className="space-y-1">
          <p className="text-sm font-bold text-[#3E2723]">{label}</p>
          <p className="text-xs font-medium text-[#80685E]">{detail}</p>
        </div>
      </div>
    </div>
  )
}

export function RouteSwish() {
  return (
    <div className="pointer-events-none fixed inset-x-0 top-0 z-[9999] h-1 overflow-hidden bg-transparent" aria-hidden="true">
      <div className="h-full w-1/3 animate-[route-swish_650ms_cubic-bezier(0.22,1,0.36,1)] rounded-full bg-gradient-to-r from-transparent via-[#E9783D] to-transparent shadow-[0_0_18px_rgba(233,120,61,0.45)]" />
    </div>
  )
}

export function RouteChangeLoader() {
  const pathname = usePathname()
  const [loading, setLoading] = useState(false)
  const [prevPath, setPrevPath] = useState(pathname)

  useEffect(() => {
    const handleClick = (event: MouseEvent) => {
      if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return

      const target = event.target as HTMLElement | null
      const anchor = target?.closest("a[href]") as HTMLAnchorElement | null
      if (!anchor || anchor.target || anchor.hasAttribute("download")) return

      const nextUrl = new URL(anchor.href, window.location.href)
      if (nextUrl.origin !== window.location.origin || nextUrl.pathname === window.location.pathname) return

      setLoading(true)
    }

    document.addEventListener("click", handleClick, true)
    return () => document.removeEventListener("click", handleClick, true)
  }, [])

  useEffect(() => {
    if (pathname !== prevPath) {
      setLoading(true)
      setPrevPath(pathname)
      // Brief delay so the loader is visible before the page renders
      const timer = setTimeout(() => setLoading(false), 450)
      return () => clearTimeout(timer)
    }
  }, [pathname, prevPath])

  useEffect(() => {
    if (!loading) return
    const timer = setTimeout(() => setLoading(false), 650)
    return () => clearTimeout(timer)
  }, [loading])

  if (!loading) return null
  return <RouteSwish />

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-[#FFFCF8]/80 backdrop-blur-sm transition-opacity duration-300">
      <div className="flex flex-col items-center gap-4">
        <div className="relative h-10 w-10">
          <div className="absolute inset-0 rounded-full border-2 border-[#78482D]/10" />
          <div className="absolute inset-0 rounded-full border-2 border-transparent border-t-[#E9783D] animate-spin" />
        </div>
        <p className="text-sm font-medium text-[#80685E] animate-pulse">Loading…</p>
      </div>
    </div>
  )
}
