"use client"

import { useEffect, useState } from "react"
import { ArrowDown, ArrowUp, ChevronsUpDown } from "lucide-react"
import type { CustomerListItem, CustomerSortField } from "@/lib/customer-schema"

interface Props { loading: boolean; items: CustomerListItem[]; phoneHref: (value: string) => string | undefined; emailHref: (value: string) => string | undefined }
const columns: Array<{ label: string; field: CustomerSortField }> = [
  { label: "CID", field: "company" }, { label: "Company Name", field: "company" }, { label: "Contact Person", field: "contactName" },
  { label: "Phone", field: "phone" }, { label: "Email", field: "email" },
  { label: "Inquiries", field: "inquiries" }, { label: "Sample Cost", field: "sampleCost" },
  { label: "Conversion", field: "conversion" }, { label: "Revenue", field: "revenue" },
  { label: "Avg Gp", field: "avgGp" }, { label: "Success Ratio", field: "successRatio" },
]

function AuroraRows() {
  return <div className="space-y-3 p-4">{Array.from({ length: 7 }, (_, row) => <div key={row} className="aurora-skeleton h-12 overflow-hidden rounded-xl bg-[#F4EAE3]/65"><div className="aurora-wave h-full w-[45%]" /></div>)}<style jsx>{`
    .aurora-wave { background: linear-gradient(100deg, transparent 0%, rgba(255,179,107,.12) 18%, rgba(199,167,255,.22) 42%, rgba(242,166,160,.18) 64%, transparent 100%); filter: blur(7px); animation: aurora-slide 3.8s ease-in-out infinite; }
    @keyframes aurora-slide { 0% { transform: translateX(-130%) scaleX(.8); opacity:.35 } 50% { opacity:.85 } 100% { transform: translateX(340%) scaleX(1.15); opacity:.3 } }
    @media (prefers-reduced-motion: reduce) { .aurora-wave { animation: none; transform: translateX(80%); } }
  `}</style></div>
}

export function CustomerDataViewV3({ loading, items, phoneHref, emailHref }: Props) {
  const [active, setActive] = useState<CustomerSortField>("revenue")
  const [direction, setDirection] = useState<"asc" | "desc">("desc")
  const sortBy = (field: CustomerSortField) => {
    const next = field === active ? (direction === "asc" ? "desc" : "asc") : (field === "company" || field === "contactName" || field === "email" ? "asc" : "desc")
    setActive(field); setDirection(next)
    window.dispatchEvent(new CustomEvent("customer-sort", { detail: { field } }))
  }
  useEffect(() => {
    document.querySelectorAll(".client-intelligence-shell table tbody td:nth-child(4) a, .client-intelligence-shell article .grid > p:first-child")
      .forEach((element) => element.classList.add("protected-phone"))
  }, [loading, items])
  if (loading) return <AuroraRows />
  return <>
    <style jsx global>{`
      .protected-phone {
        user-select: none;
        -webkit-user-select: none;
        -webkit-touch-callout: none;
      }
    `}</style>
    <div className="hidden max-h-[65vh] overflow-auto md:block"><table className="w-full min-w-[1450px] text-left text-sm"><thead className="sticky top-0 z-20 bg-[#FFF7F0] text-xs uppercase tracking-wider text-[#80685E] shadow-sm"><tr><th className="p-4">#</th>{columns.map(({ label, field }) => <th key={`${label}-${field}`} className="p-0"><button type="button" onClick={() => sortBy(field)} className="flex w-full items-center gap-1.5 p-4 text-left font-semibold hover:bg-[#FFD6A5]/35" aria-label={`Sort by ${label}`}><span>{label}</span>{active === field ? direction === "asc" ? <ArrowUp className="h-3.5 w-3.5" /> : <ArrowDown className="h-3.5 w-3.5" /> : <ChevronsUpDown className="h-3.5 w-3.5 opacity-45" />}</button></th>)}</tr></thead><tbody>{items.map((c) => <tr key={`${c.cid}-${c.phone}-${c.rowNumber}`} className="border-b border-[#78482D]/10 hover:bg-[#FFD6A5]/20"><td className="p-4 text-[#80685E]">{c.rowNumber}</td><td className="p-4 font-semibold text-[#E9783D]">{c.cid || "—"}</td><td className="p-4 font-semibold">{c.company || "—"}</td><td className="p-4">{c.contactName || "—"}</td><td className="p-4"><a href={phoneHref(c.phone)} className="text-[#C65F2E]">{c.phone || "—"}</a></td><td className="p-4"><a href={emailHref(c.email)} className="text-[#C65F2E]">{c.email || "—"}</a></td><td className="p-4">{c.inquiries || "—"}</td><td className="p-4">{c.sampleCost || "—"}</td><td className="p-4">{c.conversion || "—"}</td><td className="p-4">{c.revenue || "—"}</td><td className="p-4">{c.avgGp || "—"}</td><td className="p-4">{c.successRatio || "—"}</td></tr>)}</tbody></table></div>
    <div className="space-y-3 p-3 md:hidden">{items.map((c) => <article key={`${c.cid}-${c.phone}-${c.rowNumber}`} className="rounded-2xl border border-[#78482D]/10 bg-white p-4 shadow-sm"><p className="text-xs font-bold text-[#E9783D]">#{c.rowNumber}</p><p className="text-xs font-semibold text-[#80685E]">CID: {c.cid || "—"}</p><h2 className="font-bold">{c.company || "Unnamed company"}</h2><p className="text-sm">{c.contactName || "—"}</p><div className="mt-3 grid grid-cols-2 gap-2 text-sm"><p>{c.phone}</p><p className="truncate">{c.email}</p><p>Inquiries: {c.inquiries || "—"}</p><p>Sample: {c.sampleCost || "—"}</p><p>Conversion: {c.conversion || "—"}</p><p>Revenue: {c.revenue || "—"}</p><p>Avg GP: {c.avgGp || "—"}</p><p>Success: {c.successRatio || "—"}</p></div></article>)}</div>
  </>
}

