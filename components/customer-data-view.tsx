import { Skeleton } from "@/components/ui/skeleton"
import type { CustomerListItem } from "@/lib/customer-schema"

interface Props {
  loading: boolean
  items: CustomerListItem[]
  phoneHref: (value: string) => string | undefined
  emailHref: (value: string) => string | undefined
}

const headings = ["Company Name", "Contact Person", "Phone", "Email", "Inquiries", "Sample Cost", "Conversion", "Revenue", "Avg Gp", "Success Ratio"]

export function CustomerDataView({ loading, items, phoneHref, emailHref }: Props) {
  if (loading) return <div className="space-y-3 p-4">{Array.from({ length: 6 }, (_, index) => <Skeleton key={index} className="h-12 w-full" />)}</div>

  return <>
    <div className="hidden overflow-x-auto md:block"><table className="w-full min-w-[1250px] text-left text-sm"><thead className="bg-[#FFF7F0] text-xs uppercase tracking-wider text-[#80685E]"><tr>{headings.map((heading) => <th key={heading} className="p-4">{heading}</th>)}</tr></thead><tbody>{items.map((customer) => <tr key={`${customer.phone}-${customer.company}`} className="border-b border-[#78482D]/10 hover:bg-[#FFD6A5]/20"><td className="p-4 font-semibold">{customer.company || "—"}</td><td className="p-4">{customer.contactName || "—"}</td><td className="p-4"><a href={phoneHref(customer.phone)} className="text-[#C65F2E]">{customer.phone || "—"}</a></td><td className="p-4"><a href={emailHref(customer.email)} className="text-[#C65F2E]">{customer.email || "—"}</a></td><td className="p-4">{customer.inquiries || "—"}</td><td className="p-4">{customer.sampleCost || "—"}</td><td className="p-4">{customer.conversion || "—"}</td><td className="p-4">{customer.revenue || "—"}</td><td className="p-4">{customer.avgGp || "—"}</td><td className="p-4">{customer.successRatio || "—"}</td></tr>)}</tbody></table></div>
    <div className="space-y-3 p-3 md:hidden">{items.map((customer) => <article key={`${customer.phone}-${customer.company}`} className="rounded-2xl border border-[#78482D]/10 bg-white p-4 shadow-sm"><h2 className="font-bold">{customer.company || "Unnamed company"}</h2><p className="mt-1 text-sm">{customer.contactName || "—"}</p><div className="mt-3 grid grid-cols-2 gap-2 text-sm"><a href={phoneHref(customer.phone)}>{customer.phone || "—"}</a><a href={emailHref(customer.email)} className="truncate">{customer.email || "—"}</a><p>Inquiries: {customer.inquiries || "—"}</p><p>Sample Cost: {customer.sampleCost || "—"}</p><p>Conversion: {customer.conversion || "—"}</p><p>Revenue: {customer.revenue || "—"}</p><p>Avg GP: {customer.avgGp || "—"}</p><p>Success: {customer.successRatio || "—"}</p></div></article>)}</div>
  </>
}
