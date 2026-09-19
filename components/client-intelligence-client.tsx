"use client"

import { useCallback, useEffect, useMemo, useState, type SyntheticEvent } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import {
  ArrowDownAZ,
  ArrowUpAZ,
  ChevronsUpDown,
  ChevronLeft,
  ChevronRight,
  LockKeyhole,
  LogOut,
  RefreshCw,
  Search,
  ShieldCheck,
  Users,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Toaster, toast } from "sonner"
import {
  normalizeIndianPhone,
  type CustomerListItem,
  type CustomerListResult,
  type CustomerSortField,
} from "@/lib/customer-schema"
import { CustomerDataViewV3 as CustomerDataView } from "@/components/customer-data-view-v3"

interface UserInfo {
  userEmail: string
  role: string
  authorizedEmails: string[]
  sessionId?: string
}

interface CustomerResponse {
  success: boolean
  data?: CustomerListResult
  message?: string
}

const EMPTY_RESULT: CustomerListResult = {
  items: [],
  page: 1,
  pageSize: 15,
  total: 0,
  totalPages: 1,
  filterOptions: { companies: [], cities: [], states: [], categories: [] },
}

const REVENUE_RANGES = ["0-1lac", "1-5lac", "5-10lac", "10-25lac", "25-50lac", "50lac-1cr", "1cr+"] as const
const SAMPLE_COST_RANGES = ["0-500", "500-1k", "1k-2k", "2k-4k", "4k-6k", "6k-10k"] as const

function joinList(values: string[]) {
  return values.join(",")
}

function toggleSelection(values: string[], next: string) {
  return values.includes(next) ? values.filter((value) => value !== next) : [...values, next]
}

function MultiSelectFilter({
  label,
  placeholder,
  options,
  value,
  onChange,
}: {
  label: string
  placeholder: string
  options: string[]
  value: string[]
  onChange: (values: string[]) => void
}) {
  const [open, setOpen] = useState(false)
  const [draft, setDraft] = useState<string[]>(value)
  const [query, setQuery] = useState("")

  useEffect(() => {
    if (!open) {
      setDraft(value)
      setQuery("")
    }
  }, [value, open])

  const toggleDraft = (next: string) => {
    setDraft((current) => toggleSelection(current, next))
  }

  const filteredOptions = options.filter((option) =>
    option.toLowerCase().includes(query.trim().toLowerCase()),
  )

  return (
    <div className="relative min-w-0">
      <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-[0.12em] text-[#8B7466]">{label}</label>
      <button
        type="button"
        onClick={() => setOpen((current) => !current)}
        className="flex h-12 w-full items-center justify-between rounded-xl border border-[#DCCABD] bg-white px-3.5 py-2 text-sm shadow-[0_1px_0_rgba(255,255,255,0.9)] transition-colors hover:border-[#CDAA95]"
      >
        <span className={`truncate pr-3 ${value.length > 0 ? "text-[#4A3428]" : "text-[#8B7466]"}`}>
          {value.length > 0 ? `${value.length} selected` : placeholder}
        </span>
        <ChevronsUpDown className="h-4 w-4 shrink-0 text-[#9B7B68]" />
      </button>
      {open && (
        <div className="absolute z-50 mt-2 w-full rounded-2xl border border-[#DCCABD] bg-white p-2.5 shadow-[0_18px_40px_rgba(89,45,22,0.14)]">
          <Input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={`Search ${label.toLowerCase()}`}
            className="mb-2 h-9 rounded-lg border-[#E3D5CA] bg-[#FFFDFC] text-sm"
          />
          <div className="max-h-52 space-y-1 overflow-y-auto pr-1">
            {filteredOptions.map((option) => (
              <label
                key={option}
                className="flex cursor-pointer items-center gap-2 rounded-lg px-2.5 py-2 text-sm hover:bg-[#FFF4E8]"
              >
                <input
                  type="checkbox"
                  checked={draft.includes(option)}
                  onChange={() => toggleDraft(option)}
                  className="h-3.5 w-3.5 rounded border-[#C9B8AA]"
                />
                <span className="truncate text-[#4A3428]">{option}</span>
              </label>
            ))}
            {filteredOptions.length === 0 && (
              <div className="px-2 py-3 text-xs text-[#80685E]">No matches found</div>
            )}
          </div>
          <div className="mt-2 flex items-center justify-between gap-2 border-t border-[#78482D]/10 pt-2">
            <button
              type="button"
              onClick={() => {
                setDraft([])
                setQuery("")
              }}
              className="rounded px-2 py-1 text-xs font-semibold text-[#8F431F] hover:bg-[#FFF4E8]"
            >
              Clear
            </button>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => {
                  setDraft(value)
                  setQuery("")
                  setOpen(false)
                }}
                className="rounded px-2 py-1 text-xs font-semibold text-[#80685E] hover:bg-[#F6EFE8]"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => {
                  onChange(draft)
                  setOpen(false)
                }}
                className="rounded bg-[#E9783D] px-2.5 py-1 text-xs font-semibold text-white hover:bg-[#C65F2E]"
              >
                Apply
              </button>
            </div>
          </div>
        </div>
      )}
      {value.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {value.map((item) => (
            <button
              key={item}
              type="button"
              onClick={() => onChange(toggleSelection(value, item))}
              className="rounded-full border border-[#F0D2BC] bg-[#FFF4E8] px-2.5 py-1 text-[11px] font-semibold text-[#8F431F]"
            >
              {item} x
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

function ProtectedValue({
  children,
  href,
  customerCode,
}: {
  children: string
  href?: string
  customerCode?: string
}) {
  const stop = (action: "COPY_ATTEMPT" | "CONTEXT_MENU_ATTEMPT") => (event: SyntheticEvent) => {
    event.preventDefault()
    if (customerCode) {
      void fetch("/api/customers/actions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ customerCode, action }),
      })
    }
  }

  const stopOnly = (event: SyntheticEvent) => event.preventDefault()
  const styles = "inline-block max-w-full select-none break-words [-webkit-user-select:none] [-webkit-touch-callout:none]"

  return href ? (
    <a
      href={href}
      draggable={false}
      onCopy={stop("COPY_ATTEMPT")}
      onCut={stop("COPY_ATTEMPT")}
      onContextMenu={stop("CONTEXT_MENU_ATTEMPT")}
      onDragStart={stopOnly}
      className={`${styles} text-[#C65F2E] hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#E9783D]`}
    >
      {children}
    </a>
  ) : (
    <span
      draggable={false}
      onCopy={stop("COPY_ATTEMPT")}
      onCut={stop("COPY_ATTEMPT")}
      onContextMenu={stop("CONTEXT_MENU_ATTEMPT")}
      onDragStart={stopOnly}
      className={styles}
    >
      {children}
    </span>
  )
}

function Watermark({ email, sessionId }: { email: string; sessionId?: string }) {
  const [timestamp, setTimestamp] = useState(() => new Date().toLocaleString("en-IN"))
  const name = email.split("@")[0]?.replace(/[._-]+/g, " ").toUpperCase() || "USER"

  useEffect(() => {
    const timer = window.setInterval(() => setTimestamp(new Date().toLocaleString("en-IN")), 60_000)
    return () => window.clearInterval(timer)
  }, [])

  const text = `BROWNWALL CONFIDENTIAL | ${name} | ${email} | ${timestamp} | ${sessionId || "LEGACY SESSION"}`

  return (
    <div aria-hidden="true" className="pointer-events-none fixed inset-0 z-40 overflow-hidden opacity-[0.045]">
      <div className="absolute -inset-[35%] flex rotate-[-24deg] flex-wrap content-center gap-x-20 gap-y-24 text-[13px] font-bold tracking-[0.18em] text-[#3A241C]">
        {Array.from({ length: 48 }, (_, index) => (
          <span key={index} className="whitespace-nowrap">
            {text}
          </span>
        ))}
      </div>
    </div>
  )
}

export default function ClientIntelligenceClient({ userInfo }: { userInfo: UserInfo }) {
  const router = useRouter()
  const [result, setResult] = useState<CustomerListResult>(EMPTY_RESULT)
  const [loading, setLoading] = useState(true)
  const [refreshKey, setRefreshKey] = useState(0)
  const [page, setPage] = useState(1)
  const [searchInput, setSearchInput] = useState("")
  const [search, setSearch] = useState("")
  const [companies, setCompanies] = useState<string[]>([])
  const [cities, setCities] = useState<string[]>([])
  const [states, setStates] = useState<string[]>([])
  const [categories, setCategories] = useState<string[]>([])
  const [revenueRange, setRevenueRange] = useState("")
  const [sampleCostRange, setSampleCostRange] = useState("")
  const [sort, setSort] = useState<CustomerSortField>("revenue")
  const [direction, setDirection] = useState<"asc" | "desc">("desc")
  const [error, setError] = useState("")

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setPage(1)
      setSearch(searchInput.trim())
    }, 350)
    return () => window.clearTimeout(timer)
  }, [searchInput])

  const fetchCustomers = useCallback(
    async (signal: AbortSignal) => {
      setLoading(true)
      setError("")
      const params = new URLSearchParams({
        page: String(page),
        search,
        company: joinList(companies),
        city: joinList(cities),
        state: joinList(states),
        clientCategory: joinList(categories),
        revenueRange,
        sampleCostRange,
        sort,
        direction,
      })

      try {
        const response = await fetch(`/api/customers?${params}`, { signal, cache: "no-store" })
        const payload = (await response.json()) as CustomerResponse
        if (!response.ok || !payload.success || !payload.data) {
          throw new Error(payload.message || "Unable to load clients")
        }
        setResult(payload.data)
        if (payload.data.page !== page) setPage(payload.data.page)
      } catch (reason) {
        if (reason instanceof DOMException && reason.name === "AbortError") return
        setError(reason instanceof Error ? reason.message : "Unable to load clients")
      } finally {
        if (!signal.aborted) setLoading(false)
      }
    },
    [page, search, companies, cities, states, categories, revenueRange, sampleCostRange, sort, direction, refreshKey],
  )

  useEffect(() => {
    const controller = new AbortController()
    void fetchCustomers(controller.signal)
    return () => controller.abort()
  }, [fetchCustomers])

  useEffect(() => {
    const handleSort = (event: Event) => {
      const detail = (event as CustomEvent<{ field: CustomerSortField }>).detail
      if (!detail?.field) return
      setPage(1)
      if (detail.field === sort) {
        setDirection((value) => (value === "asc" ? "desc" : "asc"))
      } else {
        setSort(detail.field)
        setDirection(detail.field === "company" || detail.field === "contactName" || detail.field === "email" ? "asc" : "desc")
      }
    }

    window.addEventListener("customer-sort", handleSort)
    return () => window.removeEventListener("customer-sort", handleSort)
  }, [sort])

  const options = useMemo(
    () => ({
      states: [...new Set(result.items.map((item) => item.state).filter(Boolean))].sort(),
      categories: [...new Set(result.items.map((item) => item.clientCategory).filter(Boolean))].sort(),
    }),
    [result.items],
  )

  const start = result.total === 0 ? 0 : (result.page - 1) * 15 + 1
  const end = Math.min(result.page * 15, result.total)
  const pages = Array.from({ length: result.totalPages }, (_, index) => index + 1).filter(
    (number) => number === 1 || number === result.totalPages || Math.abs(number - result.page) <= 1,
  )

  const logout = async () => {
    await fetch("/api/auth/logout", { method: "POST" })
    router.push("/login")
    router.refresh()
  }

  const phoneHref = (phone: string) => {
    const normalized = normalizeIndianPhone(phone)
    return normalized ? `tel:${normalized}` : undefined
  }

  const emailHref = (email: string) => (email ? `mailto:${email}` : undefined)

  return (
    <main className="client-intelligence-shell min-h-screen overflow-x-hidden bg-[#FFF7F0] text-[#3A241C]">
      <Toaster position="top-center" richColors />
      <Watermark email={userInfo.userEmail} sessionId={userInfo.sessionId} />

      <div aria-hidden="true" className="pointer-events-none fixed inset-0 overflow-hidden">
        <div className="absolute -left-24 top-12 h-80 w-80 rounded-full bg-[#FFB36B]/25 blur-3xl" />
        <div className="absolute right-0 top-40 h-96 w-96 rounded-full bg-[#C7A7FF]/15 blur-3xl" />
        <div className="absolute bottom-0 left-1/3 h-80 w-80 rounded-full bg-[#F2A6A0]/15 blur-3xl" />
      </div>

      <header className="sticky top-0 z-50 border-b border-[#78482D]/10 bg-[#FFFCF8]/90 shadow-[0_8px_30px_rgba(89,45,22,0.05)] backdrop-blur-xl">
        <div className="mx-auto flex max-w-[1500px] flex-wrap items-center justify-between gap-3 px-4 py-3 md:px-8">
          <div className="min-w-0 flex-1">
            <Link href="/dashboard" className="text-xs font-semibold text-[#80685E] transition-colors hover:text-[#E9783D]">
              CRM / Dashboard
            </Link>
            <h1 className="truncate text-xl font-bold tracking-[-0.02em] md:text-2xl">Client Database</h1>
          </div>
          <div className="flex shrink-0 flex-wrap items-center justify-end gap-1.5 sm:gap-2">
            {userInfo.role === "BOSS" && (
              <span className="inline-flex items-center rounded-full border border-[#E9783D]/20 bg-[#FFD6A5]/40 px-2.5 py-1 text-xs font-semibold text-[#A64B22]">
                <LockKeyhole className="mr-1 h-3.5 w-3.5" />BOSS scope
              </span>
            )}
            <span className="hidden rounded-full border border-[#E9783D]/15 bg-[#FFD6A5]/45 px-3 py-1.5 text-xs font-semibold shadow-inner sm:inline-flex">
              <ShieldCheck className="mr-1.5 h-4 w-4 text-[#E9783D]" />Confidential
            </span>
            <Button variant="ghost" size="icon" onClick={logout} aria-label="Log out" className="rounded-full">
              <LogOut className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </header>

      <section className="relative z-10 mx-auto max-w-[1500px] space-y-5 p-4 md:p-8">
        <div className="client-surface rounded-[28px] border border-[#E6D5C8] bg-[linear-gradient(180deg,rgba(255,252,248,0.98),rgba(255,248,241,0.95))] p-5 shadow-[0_8px_24px_rgba(89,45,22,0.08)]">
          <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(300px,1.6fr)_repeat(3,minmax(190px,1fr))_52px]">
            <div className="min-w-0">
              <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-[0.12em] text-[#8B7466]">
                Global Search
              </label>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#80685E]" />
                <Input
                  value={searchInput}
                  onChange={(event) => setSearchInput(event.target.value)}
                  placeholder="Type to Global Search"
                  className="h-12 rounded-xl border-[#DCCABD] bg-white pl-11 text-[15px] shadow-[0_1px_0_rgba(255,255,255,0.9)]"
                />
              </div>
            </div>
            <MultiSelectFilter label="Company" placeholder="All companies" options={result.filterOptions.companies} value={companies} onChange={(next) => { setPage(1); setCompanies(next) }} />
            <MultiSelectFilter label="City" placeholder="All cities" options={result.filterOptions.cities} value={cities} onChange={(next) => { setPage(1); setCities(next) }} />
            <MultiSelectFilter label="State" placeholder="All states" options={result.filterOptions.states} value={states} onChange={(next) => { setPage(1); setStates(next) }} />
            <Button variant="outline" size="icon" className="h-12 w-12 self-end rounded-xl border-[#DCCABD] bg-white shadow-[0_1px_0_rgba(255,255,255,0.9)]" onClick={() => setRefreshKey((value) => value + 1)} disabled={loading} aria-label="Refresh customers">
              <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
            </Button>
          </div>
        </div>

        <div className="client-surface overflow-hidden rounded-[32px] border border-[#E6D5C8] bg-[#FFFCF8] shadow-[0_8px_24px_rgba(89,45,22,0.06)]">
          <div className="border-b border-[#E8D8CB] p-5">
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2 xl:grid-cols-[minmax(240px,1fr)_minmax(220px,1fr)_170px_190px_200px_52px] xl:items-end">
              <div className="flex min-h-[48px] items-end">
                <p className="text-sm font-semibold text-[#80685E]">Showing {start}-{end} of {result.total} clients</p>
              </div>
              <MultiSelectFilter label="Category" placeholder="All categories" options={result.filterOptions.categories} value={categories} onChange={(next) => { setPage(1); setCategories(next) }} />
              <div className="min-w-0">
                <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-[0.12em] text-[#8B7466]">Revenue</label>
                <Select value={revenueRange || "all"} onValueChange={(value) => { setPage(1); setRevenueRange(value === "all" ? "" : value) }}>
                  <SelectTrigger className="h-12 rounded-xl border-[#DCCABD] bg-white shadow-[0_1px_0_rgba(255,255,255,0.9)]"><SelectValue placeholder="All revenue" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All revenue</SelectItem>
                    {REVENUE_RANGES.map((value) => <SelectItem key={value} value={value}>{value}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="min-w-0">
                <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-[0.12em] text-[#8B7466]">Sample Cost</label>
                <Select value={sampleCostRange || "all"} onValueChange={(value) => { setPage(1); setSampleCostRange(value === "all" ? "" : value) }}>
                  <SelectTrigger className="h-12 rounded-xl border-[#DCCABD] bg-white shadow-[0_1px_0_rgba(255,255,255,0.9)]"><SelectValue placeholder="All sample costs" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All sample costs</SelectItem>
                    {SAMPLE_COST_RANGES.map((value) => <SelectItem key={value} value={value}>{value}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="min-w-0">
                <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-[0.12em] text-[#8B7466]">Sort</label>
                <Select value={sort} onValueChange={(value) => { setPage(1); setSort(value as CustomerSortField) }}>
                  <SelectTrigger className="h-12 w-full rounded-xl border-[#DCCABD] bg-white shadow-[0_1px_0_rgba(255,255,255,0.9)]"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="company">Sort: Company</SelectItem>
                    <SelectItem value="customerCode">Sort: Client code</SelectItem>
                    <SelectItem value="contactName">Sort: Contact</SelectItem>
                    <SelectItem value="city">Sort: City</SelectItem>
                    <SelectItem value="state">Sort: State</SelectItem>
                    <SelectItem value="clientCategory">Sort: Category</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="flex items-end">
                <Button variant="outline" size="icon" className="h-12 w-12 rounded-xl border-[#DCCABD] bg-white shadow-[0_1px_0_rgba(255,255,255,0.9)]" onClick={() => { setPage(1); setDirection((value) => value === "asc" ? "desc" : "asc") }}>
                  {direction === "asc" ? <ArrowDownAZ className="h-4 w-4" /> : <ArrowUpAZ className="h-4 w-4" />}
                </Button>
              </div>
            </div>
          </div>

          {error ? (
            <div className="p-12 text-center">
              <p className="font-semibold text-red-700">{error}</p>
              <Button className="mt-4 bg-[#E9783D]" onClick={() => setRefreshKey((value) => value + 1)}>Try again</Button>
            </div>
          ) : (
            <>
              <CustomerDataView loading={loading} items={result.items} phoneHref={phoneHref} emailHref={emailHref} />
              {!loading && result.items.length === 0 && (
                <div className="p-16 text-center">
                  <Users className="mx-auto mb-3 h-8 w-8 text-[#E9783D]" />
                  <h2 className="font-bold">No clients found</h2>
                  <p className="text-sm text-[#80685E]">No rows are assigned to your ownership email.</p>
                </div>
              )}
            </>
          )}

          <div className="flex flex-col gap-3 border-t border-[#78482D]/10 p-4 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-sm text-[#80685E]">Page {result.page} of {result.totalPages}</p>
            <nav aria-label="Client pagination" className="flex flex-wrap items-center gap-1">
              <Button variant="outline" size="sm" disabled={loading || result.page <= 1} onClick={() => setPage((value) => value - 1)}>
                <ChevronLeft className="mr-1 h-4 w-4" />Previous
              </Button>
              {pages.map((number, index) => (
                <span key={number} className="contents">
                  {index > 0 && pages[index - 1] !== number - 1 && <span className="px-1">...</span>}
                  <Button variant={number === result.page ? "default" : "outline"} size="sm" className={number === result.page ? "bg-[#E9783D] hover:bg-[#C65F2E]" : ""} disabled={loading} onClick={() => setPage(number)}>
                    {number}
                  </Button>
                </span>
              ))}
              <Button variant="outline" size="sm" disabled={loading || result.page >= result.totalPages} onClick={() => setPage((value) => value + 1)}>
                Next<ChevronRight className="ml-1 h-4 w-4" />
              </Button>
            </nav>
          </div>
        </div>
      </section>
    </main>
  )
}
