"use client"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { Menu } from "lucide-react"
import { useState } from "react"
import { Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip"
const links = [
  { label: "Home", href: "/dashboard", tagline: "Everything at a glance." },
  { label: "Inquiries", href: "/view-inquiries", tagline: "Every lead matters." },
  { label: "Client DB", href: "/customers", tagline: "Relationships, remembered." },
  { label: "Keystone", href: "/timeless", tagline: "The center of execution" },
]
export function CrmNav() { const path = usePathname(); const [open, setOpen] = useState(false); return <nav className="sticky top-0 z-50 border-b border-[#6B3D28]/10 bg-[#FFFCF8]/90 backdrop-blur-xl"><div className="mx-auto flex max-w-7xl items-center gap-3 px-4 py-3"><Link href="/dashboard" className="mr-auto font-bold text-[#3E2723]">BrownWall <span className="text-[#E9783D]">CRM</span></Link><div className="hidden items-center gap-1 md:flex">{links.map((link) => <Tooltip key={link.href}><TooltipTrigger asChild><Link href={link.href} className={`rounded-full px-3 py-2 text-sm font-medium ${path === link.href ? "bg-[#FFD6A5]/55 text-[#A64B22]" : "text-[#6D4C41] hover:bg-[#FFF1E4]"}`}>{link.label}</Link></TooltipTrigger><TooltipContent side="bottom" className="bg-[#3E2723] text-[#FFFCF8] text-xs rounded-lg px-3 py-1.5">{link.tagline}</TooltipContent></Tooltip>)}<Tooltip><TooltipTrigger asChild><Link href="/inquiry" className="ml-2 rounded-full bg-[#E9783D] px-4 py-2 text-sm font-bold text-white shadow-sm hover:bg-[#CA5E2B]">New Inquiry</Link></TooltipTrigger><TooltipContent side="bottom" className="bg-[#3E2723] text-[#FFFCF8] text-xs rounded-lg px-3 py-1.5">Create opportunity.</TooltipContent></Tooltip></div><button className="rounded-lg p-2 md:hidden" onClick={() => setOpen(!open)} aria-label="Menu"><Menu /></button></div>{open && <div className="grid gap-1 border-t p-3 md:hidden">{links.map((link) => <Link key={link.href} href={link.href} className="rounded-lg px-3 py-2" onClick={() => setOpen(false)}>{link.label}</Link>)}<Link href="/inquiry" className="rounded-lg bg-[#E9783D] px-3 py-2 font-bold text-white">New Inquiry</Link></div>}</nav> }
