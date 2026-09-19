"use client"

import { useEffect, useState, type ComponentType, type ReactNode } from "react"
import Link from "next/link"
import { usePathname, useRouter } from "next/navigation"
import {
  CalendarClock,
  ClipboardList,
  LayoutGrid,
  LogOut,
  Menu,
  UserRoundSearch,
  X,
  Zap,
  type LucideProps,
} from "lucide-react"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import { RouteChangeLoader } from "@/components/route-change-loader"

type NavItem = {
  label: string
  tagline: string
  href: string
  icon: ComponentType<LucideProps>
  match: (path: string) => boolean
}

const baseItems: NavItem[] = [
  {
    label: "Home",
    tagline: "Everything at a glance.",
    href: "/dashboard",
    icon: LayoutGrid,
    match: (path) => path === "/dashboard",
  },
  {
    label: "Inquiries",
    tagline: "Every lead matters.",
    href: "/view-inquiries",
    icon: ClipboardList,
    match: (path) => path.startsWith("/view-inquiries"),
  },
  {
    label: "Client DB",
    tagline: "Relationships, remembered.",
    href: "/customers",
    icon: UserRoundSearch,
    match: (path) => path.startsWith("/customers"),
  },
  {
    label: "Keystone",
    tagline: "The center of execution.",
    href: "/timeless",
    icon: CalendarClock,
    match: (path) => path.startsWith("/timeless"),
  },
]

function navItems() {
  return baseItems
}

export function DesktopNavigation({ path }: { path: string }) {
  const items = navItems()
  const inquiryActive = path === "/inquiry"

  return (
    <TooltipProvider delayDuration={120}>
      <div className="hidden items-center rounded-[22px] border border-[#eadfd7] bg-[#fffdfb] px-2 py-2 shadow-[0_16px_44px_rgba(62,39,35,0.08),inset_0_1px_0_rgba(255,255,255,0.96)] md:flex">
        {items.map((item) => {
          const Icon = item.icon
          const active = item.match(path)

          return (
            <Tooltip key={item.href}>
              <TooltipTrigger asChild>
                <Link
                  href={item.href}
                  className={`flex h-[70px] min-w-[98px] flex-col items-center justify-center gap-1.5 rounded-[20px] px-4 text-[12px] font-bold outline-none transition focus-visible:ring-2 focus-visible:ring-[#f26b22] ${
                    active
                      ? "bg-[#fff0e4] text-[#e85f19] shadow-[0_14px_32px_rgba(232,95,25,0.13)]"
                      : "text-[#4b342c] hover:bg-[#fff6ef]"
                  }`}
                >
                  <Icon className={`h-[22px] w-[22px] ${active ? "text-[#f26b22]" : "text-[#4b342c]"}`} strokeWidth={2.15} />
                  <span>{item.label}</span>
                </Link>
              </TooltipTrigger>
              <TooltipContent side="bottom" className="rounded-lg bg-[#3E2723] px-3 py-1.5 text-xs text-[#FFFCF8]">
                {item.tagline}
              </TooltipContent>
            </Tooltip>
          )
        })}

        <div className="mx-5 h-[52px] w-px bg-[#eadfd7]" />

        <Tooltip>
          <TooltipTrigger asChild>
            <Link
              href="/inquiry"
              className={`flex h-[70px] min-w-[112px] flex-col items-center justify-center gap-1.5 rounded-[20px] px-4 text-[12px] font-bold text-[#5b3b31] outline-none transition hover:bg-[#fff6ef] focus-visible:ring-2 focus-visible:ring-[#f26b22] ${
                inquiryActive ? "bg-[#fff0e4] text-[#e85f19]" : ""
              }`}
            >
              <span className="grid h-[42px] w-[42px] place-items-center rounded-full border border-[#f6d7c2] bg-[#fff2e9] text-[#f26b22]">
                <Zap className="h-5 w-5" strokeWidth={2.15} />
              </span>
              <span>New Inquiry</span>
            </Link>
          </TooltipTrigger>
          <TooltipContent side="bottom" className="rounded-lg bg-[#3E2723] px-3 py-1.5 text-xs text-[#FFFCF8]">
            Create opportunity.
          </TooltipContent>
        </Tooltip>
      </div>
    </TooltipProvider>
  )
}

export function MobileNavigation({
  path,
  open,
  close,
  logout,
}: {
  path: string
  open: boolean
  close: () => void
  logout: () => void
}) {
  if (!open) return null

  const items = navItems()

  return (
    <div className="border-t border-[#eadfd7] bg-[#fffaf6] p-3 md:hidden">
      <div className="grid gap-1">
        {items.map((item) => {
          const Icon = item.icon
          const active = item.match(path)

          return (
            <Link
              key={item.href}
              href={item.href}
              onClick={close}
              className={`flex min-h-12 items-center gap-3 rounded-2xl px-3 text-sm font-bold ${
                active ? "bg-[#fff0e4] text-[#e85f19]" : "text-[#4b342c]"
              }`}
            >
              <Icon className="h-5 w-5" />
              {item.label}
            </Link>
          )
        })}
        <Link
          href="/inquiry"
          onClick={close}
          className="flex min-h-12 items-center gap-3 rounded-2xl bg-[#fff0e4] px-3 text-sm font-bold text-[#e85f19]"
        >
          <Zap className="h-5 w-5" />
          New Inquiry
        </Link>
        <button onClick={logout} className="flex min-h-12 items-center gap-3 rounded-2xl px-3 text-left text-sm font-bold text-[#4b342c]">
          <LogOut className="h-5 w-5" />
          Logout
        </button>
      </div>
    </div>
  )
}

export function GlobalHeader() {
  const path = usePathname()
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [scrolled, setScrolled] = useState(false)

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 4)
    onScroll()
    window.addEventListener("scroll", onScroll, { passive: true })
    return () => window.removeEventListener("scroll", onScroll)
  }, [])

  useEffect(() => setOpen(false), [path])

  const logout = async () => {
    await fetch("/api/auth/logout", { method: "POST" })
    localStorage.removeItem("auth_token")
    router.push("/login")
    router.refresh()
  }

  return (
    <header
      className={`sticky top-0 z-[100] border-b border-[#eadfd7] bg-[#fbf4ee]/95 backdrop-blur-xl transition-shadow ${
        scrolled ? "shadow-[0_8px_24px_rgba(89,45,22,.08)]" : ""
      }`}
    >
      <div className="mx-auto flex min-h-[108px] max-w-7xl items-center gap-6 px-4">
        <Link
          href="/dashboard"
          className="mr-auto hidden whitespace-nowrap text-2xl font-black tracking-tight text-[#3E2723] outline-none focus-visible:ring-2 focus-visible:ring-[#f26b22] lg:block"
        >
          <span className="bg-gradient-to-r from-cyan-400 to-pink-500 bg-clip-text text-transparent">AI</span>{" "}
          <span className="text-[#e85f19]">CRM</span>
        </Link>
        <div className="mx-auto md:mx-0">
          <DesktopNavigation path={path} />
        </div>
        <button
          onClick={logout}
          className="hidden min-h-11 min-w-11 items-center justify-center rounded-full text-[#6f564d] transition hover:bg-[#fff0e4] hover:text-[#e85f19] md:flex"
          aria-label="Log out"
        >
          <LogOut className="h-5 w-5" strokeWidth={2.15} />
        </button>
        <Link href="/dashboard" className="mr-auto whitespace-nowrap text-xl font-black tracking-tight text-[#3E2723] md:hidden">
          <span className="bg-gradient-to-r from-cyan-400 to-pink-500 bg-clip-text text-transparent">AI</span>{" "}
          <span className="text-[#e85f19]">CRM</span>
        </Link>
        <Link href="/inquiry" className="rounded-full bg-[#fff0e4] px-3 py-2 text-xs font-bold text-[#e85f19] sm:hidden">
          New Inquiry
        </Link>
        <button
          onClick={() => setOpen(!open)}
          className="grid min-h-11 min-w-11 place-items-center rounded-xl text-[#4b342c] md:hidden"
          aria-expanded={open}
          aria-label="Toggle navigation"
        >
          {open ? <X /> : <Menu />}
        </button>
      </div>
      <MobileNavigation path={path} open={open} close={() => setOpen(false)} logout={logout} />
    </header>
  )
}

export default function AppShell({ children }: { children: ReactNode }) {
  const path = usePathname()
  const authenticated = ["/dashboard", "/view-inquiries", "/customers", "/inquiry", "/timeless"].some((route) =>
    path.startsWith(route),
  )

  if (!authenticated) return <>{children}<RouteChangeLoader /></>

  const route = path.startsWith("/customers")
    ? "customers"
    : path.startsWith("/view-inquiries")
      ? "inquiries"
      : path.startsWith("/inquiry")
        ? "new-inquiry"
        : path.startsWith("/timeless")
          ? "timeless"
          : "dashboard"

  return (
    <div className="min-h-screen overflow-x-hidden bg-[#FFF8F2]">
      <GlobalHeader />
      <div className={`authenticated-shell-content route-${route}`}>{children}</div>
      <RouteChangeLoader />
    </div>
  )
}
