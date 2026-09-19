"use client"

import { useState, useEffect, useMemo, useRef } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import {
  ChevronDown,
  ChevronUp,
  Filter,
  X,
  Edit,
  Save,
  MessageCircle,
  LogOut,
  RefreshCw,
  ChevronLeft,
  ChevronRight,
  Mail,
  Check,
  Trash2,
} from "lucide-react"
import { toast, Toaster } from "sonner"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog"
import { Textarea } from "@/components/ui/textarea"
import { Checkbox } from "@/components/ui/checkbox"

type InquiryRow = string[]
type SortKey =
  | "inquiryNo"
  | "timestamp"
  | "company"
  | "contactName"
  | "phone"
  | "email"
  | "category"
  | "details"
  | "leadSource"
  | "salesPerson"
  | "salesStage"
  | "updateRemarks"
  | "nextSteps"
  | "nextFollowupDate"
  | "budget"
  | "quantity"
  | "estOrderValue"
  | "attachments"
  | "delayDays"
  | "followupDate"
  | "occasion"
  | "location"
  | "inquiryType"
  | "secondOwner"
  | "backOffice"
  | "firstOwner"
  | "leadGenerator"

type SortConfig = {
  key: SortKey | null
  direction: "asc" | "desc"
  keyMapping: Record<SortKey, number>
}

const EDIT_SAVE_TIMEOUT_MS = 60_000
const INQUIRY_ROW_LENGTH = 46
const EDIT_COMPARE_COLUMNS = [2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 29, 30, 31, 32, 33]
const tableCellClass = "p-2 md:p-3 border-r align-top overflow-hidden break-words whitespace-normal"
const tableTextClass = "block max-w-full whitespace-normal break-words text-xs leading-snug"
const tableInputClass = "h-8 w-full min-w-0 max-w-full text-xs whitespace-normal break-words"
const tableSelectTriggerClass = "h-8 w-full min-w-0 max-w-full text-xs whitespace-normal [&>span]:block [&>span]:max-w-full [&>span]:truncate"
const SORT_KEY_MAPPING: Record<SortKey, number> = {
  inquiryNo: 0,
  timestamp: 1,
  company: 2,
  contactName: 3,
  phone: 4,
  email: 5,
  category: 6,
  details: 7,
  leadSource: 8,
  salesPerson: 9,
  salesStage: 10,
  updateRemarks: 11,
  nextSteps: 12,
  nextFollowupDate: 13,
  budget: 14,
  quantity: 15,
  estOrderValue: 16,
  attachments: 17,
  delayDays: 18,
  followupDate: 19,
  occasion: 27,
  location: 28,
  inquiryType: 29,
  secondOwner: 30,
  backOffice: 31,
  firstOwner: 32,
  leadGenerator: 33,
}

interface Props {
  userEmail: string
  userRole: string
  authorizedEmails: string[]
  initialInquiries: InquiryRow[]
  initialPage: number
  initialPageSize: number
  initialTotal: number
  initialTotalPages: number
}

export default function ViewInquiriesClient({
  userEmail,
  userRole,
  authorizedEmails,
  initialInquiries,
  initialPage,
  initialPageSize,
  initialTotal,
  initialTotalPages,
}: Props) {
  const router = useRouter()
  const [inquiries, setInquiries] = useState<InquiryRow[]>(initialInquiries)
  const [filteredInquiries, setFilteredInquiries] = useState<InquiryRow[]>(initialInquiries)
  const [editingRows, setEditingRows] = useState<Set<string>>(new Set())
  const [selectedRows, setSelectedRows] = useState<Set<string>>(new Set())
  const [editedData, setEditedData] = useState<Map<string, Record<number, string>>>(new Map())
  const [showFilters, setShowFilters] = useState(false)
  const [dropdownData, setDropdownData] = useState<Record<string, string[]>>({})
  const [currentPage, setCurrentPage] = useState(initialPage)
  const [rowsPerPage] = useState(initialPageSize)
  const [serverTotal, setServerTotal] = useState(initialTotal)
  const [serverTotalPages, setServerTotalPages] = useState(initialTotalPages)
  const [sortConfig, setSortConfig] = useState<SortConfig>({ key: "inquiryNo", direction: "desc", keyMapping: SORT_KEY_MAPPING })
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [saveStatus, setSaveStatus] = useState("")
  const [inquiryNoSearch, setInquiryNoSearch] = useState("")
  const didMountServerFiltersRef = useRef(false)

  const formatINR = (value: string | number | undefined | null) => {
    if (value === null || value === undefined || value === "") return ""
    const cleaned = String(value).replace(/[^0-9\-\.]/g, "")
    if (cleaned === "") return String(value)
    const num = Math.floor(Number(cleaned))
    if (isNaN(num)) return String(value)
    const sign = num < 0 ? "-" : ""
    const abs = Math.abs(num).toString()
    const last3 = abs.slice(-3)
    const rest = abs.slice(0, -3)
    const formattedRest = rest ? rest.replace(/\B(?=(\d{2})+(?!\d))/g, ",") + "," : ""
    return sign + formattedRest + last3
  }

  const [showWhatsAppDialog, setShowWhatsAppDialog] = useState(false)
  const [showEmailDialog, setShowEmailDialog] = useState(false)
  const [emailSubject, setEmailSubject] = useState("")
  const [emailBody, setEmailBody] = useState("")
  const [whatsappMessage, setWhatsappMessage] = useState("")
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [deletingInquiries, setDeletingInquiries] = useState<Set<string>>(new Set())

  const [filters, setFilters] = useState({
    inquiryNo: [] as string[], // Changed to string array
    company: [] as string[], // Changed to string array
    contactName: [] as string[], // Changed to string array
    phone: "",
    email: [] as string[], // Changed to string array
    category: [] as string[],
    leadSource: [] as string[],
    salesStage: [] as string[],
    nextSteps: [] as string[],
    occasion: [] as string[],
    location: [] as string[],
    inquiryType: [] as string[],
    firstOwner: [] as string[], // Changed to string array
    salesPersonEmail: [] as string[], // Changed to string array
    avgHeavyLifters: [] as string[],
    heavyLiftersTags: [] as string[],
    avgClosureDays: [] as string[],
    bigBulls: [] as string[],
    followupDateFrom: "",
    followupDateTo: "",
  })

  const uniqueInquiryNos = useMemo(
    () => [...new Set(inquiries.map((row) => row[0]).filter(Boolean))].sort(),
    [inquiries],
  )
  const uniqueCompanies = useMemo(
    () => [...new Set(inquiries.map((row) => row[2]).filter(Boolean))].sort(),
    [inquiries],
  )
  const uniqueContactNames = useMemo(
    () => [...new Set(inquiries.map((row) => row[3]).filter(Boolean))].sort(),
    [inquiries],
  )
  const uniqueEmails = useMemo(() => [...new Set(inquiries.map((row) => row[5]).filter(Boolean))].sort(), [inquiries])
  const uniqueFirstOwners = useMemo(
    () => [...new Set(inquiries.map((row) => row[32]).filter(Boolean))].sort(),
    [inquiries],
  )
  const uniqueSalesPersons = useMemo(
    () => [...new Set(inquiries.map((row) => row[9]).filter(Boolean))].sort(),
    [inquiries],
  )
  const uniqueAvgHeavyLifters = useMemo(
    () => [...new Set(inquiries.map((row) => row[42]).filter(Boolean))].sort(),
    [inquiries],
  )
  const uniqueHeavyLiftersTags = useMemo(
    () => [...new Set(inquiries.map((row) => row[43]).filter(Boolean))].sort(),
    [inquiries],
  )
  const uniqueAvgClosureDays = useMemo(
    () => [...new Set(inquiries.map((row) => row[44]).filter(Boolean))].sort(),
    [inquiries],
  )
  const uniqueBigBulls = useMemo(
    () => [...new Set(inquiries.map((row) => row[45]).filter(Boolean))].sort(),
    [inquiries],
  )

  useEffect(() => {
    fetchDropdownData()
  }, [])

  useEffect(() => {
    applyClientOnlyFilters()
  }, [
    inquiries,
    filters.contactName,
    filters.phone,
    filters.email,
    filters.category,
    filters.leadSource,
    filters.nextSteps,
    filters.occasion,
    filters.location,
    filters.inquiryType,
    filters.firstOwner,
    filters.avgHeavyLifters,
    filters.heavyLiftersTags,
    filters.avgClosureDays,
    filters.bigBulls,
  ])

  useEffect(() => {
    if (!didMountServerFiltersRef.current) {
      didMountServerFiltersRef.current = true
      return
    }
    void loadInquiryPage(1, sortConfig, { silent: true })
  }, [
    filters.inquiryNo,
    filters.company,
    filters.salesStage,
    filters.salesPersonEmail,
    filters.followupDateFrom,
    filters.followupDateTo,
  ])

  const fetchDropdownData = async () => {
    try {
      const res = await fetch("/api/dropdown-data")
      const data = await res.json()
      if (data.success) {
        setDropdownData(data.data)
      }
    } catch (error) {
      console.error("Error fetching dropdown data:", error)
    }
  }

  const applyClientOnlyFilters = () => {
    let filtered = [...inquiries]

    if (filters.contactName.length > 0) {
      filtered = filtered.filter((row) => filters.contactName.includes(row[3]))
    }
    if (filters.phone) {
      filtered = filtered.filter((row) => row[4]?.toLowerCase().includes(filters.phone.toLowerCase()))
    }
    if (filters.email.length > 0) {
      filtered = filtered.filter((row) => filters.email.includes(row[5]))
    }
    if (filters.firstOwner.length > 0) {
      filtered = filtered.filter((row) => filters.firstOwner.includes(row[32]))
    }

    // Multiselect filters
    if (filters.category.length > 0) {
      filtered = filtered.filter((row) => filters.category.includes(row[6]))
    }
    if (filters.leadSource.length > 0) {
      filtered = filtered.filter((row) => filters.leadSource.includes(row[8]))
    }
    if (filters.nextSteps.length > 0) {
      filtered = filtered.filter((row) => filters.nextSteps.includes(row[12]))
    }
    if (filters.occasion.length > 0) {
      filtered = filtered.filter((row) => filters.occasion.includes(row[27]))
    }
    if (filters.location.length > 0) {
      filtered = filtered.filter((row) => filters.location.includes(row[28]))
    }
    if (filters.inquiryType.length > 0) {
      filtered = filtered.filter((row) => filters.inquiryType.includes(row[29]))
    }
    if (filters.avgHeavyLifters.length > 0) {
      filtered = filtered.filter((row) => filters.avgHeavyLifters.includes(row[42]))
    }
    if (filters.heavyLiftersTags.length > 0) {
      filtered = filtered.filter((row) => filters.heavyLiftersTags.includes(row[43]))
    }
    if (filters.avgClosureDays.length > 0) {
      filtered = filtered.filter((row) => filters.avgClosureDays.includes(row[44]))
    }
    if (filters.bigBulls.length > 0) {
      filtered = filtered.filter((row) => filters.bigBulls.includes(row[45]))
    }

    setFilteredInquiries(filtered)
  }

  const totalPages = serverTotalPages

  const canEditRow = (row: InquiryRow) => {
    const rowSalesEmail = row[9]?.toLowerCase().trim()
    if (userRole === "BOSS") return true
    if (userRole === "HEAD" && authorizedEmails.some((e) => e.toLowerCase() === rowSalesEmail)) return true
    if (userRole === "EMPLOYEE" && userEmail.toLowerCase() === rowSalesEmail) return true
    return false
  }

  const isEditableByEmployee = (columnIndex: number) => {
    // Company(2), Contact Name(3), Phone(4), Email(5), Category(6), Details(7),
    // Lead Source(8), Sales Stage(10), Update Remarks(11), Next Steps(12),
    // Next Followup Date(13), Budget(14), Quantity(15) - REMOVED Lead Qualifier(35)
    const employeeEditableColumns = [2, 3, 4, 5, 6, 7, 8, 10, 11, 12, 13, 14, 15]
    return employeeEditableColumns.includes(columnIndex)
  }

  const canEditColumn = (columnIndex: number, row: InquiryRow) => {
    if (!canEditRow(row)) return false

    if (userRole === "BOSS") return true
    if (userRole === "HEAD") {
      const restrictedCols = [29, 30, 31, 32, 33] // Inquiry Type, 2nd Owner, Back Office, 1st Owner, Lead Generator
      return !restrictedCols.includes(columnIndex)
    }
    if (userRole === "EMPLOYEE") {
      return isEditableByEmployee(columnIndex)
    }
    return false
  }

  const toggleSelectRow = (inquiryNo: string) => {
    const newSelected = new Set(selectedRows)
    if (newSelected.has(inquiryNo)) {
      newSelected.delete(inquiryNo)
    } else {
      newSelected.add(inquiryNo)
    }
    setSelectedRows(newSelected)
  }

  const enableBulkEdit = () => {
    if (selectedRows.size === 0) {
      toast.warning("Please select at least one row to edit")
      return
    }

    const unauthorized = Array.from(selectedRows).filter((inquiryNo) => {
      const row = filteredInquiries.find((r) => r[0] === inquiryNo)
      return row && !canEditRow(row)
    })

    if (unauthorized.length > 0) {
      toast.error(`You don't have permission to edit ${unauthorized.length} selected row(s)`)
      return
    }

    setEditingRows(new Set(selectedRows))
    toast.success(`${selectedRows.size} row(s) in edit mode`)
  }

  const cancelEdit = () => {
    setEditingRows(new Set())
    setEditedData(new Map())
    toast.info("Edit cancelled")
  }

  const updateCellValue = (inquiryNo: string, colIndex: number, value: string) => {
    const currentEdits = editedData.get(inquiryNo) || {}
    const updatedEdits = { ...currentEdits, [colIndex]: value }
    const newEditedData = new Map(editedData)
    newEditedData.set(inquiryNo, updatedEdits)
    setEditedData(newEditedData)
  }

  const applyRowsLocally = (updates: Array<{ inquiryNo: string; data: InquiryRow }>) => {
    setInquiries((current) =>
      current.map((row) => {
        const update = updates.find((item) => item.inquiryNo === row[0])
        return update ? update.data : row
      }),
    )
    setFilteredInquiries((current) =>
      current.map((row) => {
        const update = updates.find((item) => item.inquiryNo === row[0])
        return update ? update.data : row
      }),
    )
  }

  const apiSort = (config = sortConfig) => {
    if (config.key === "timestamp") return `timestamp.${config.direction}`
    if (config.key === "company") return `company.${config.direction}`
    if (config.key === "salesStage") return `salesStage.${config.direction}`
    if (config.key === "salesPerson") return `salesPerson.${config.direction}`
    if (config.key === "nextFollowupDate" || config.key === "followupDate") return `followupDate.${config.direction}`
    return `inquiryNo.${config.direction === "asc" ? "asc" : "desc"}`
  }

  const appendServerFilterParams = (params: URLSearchParams) => {
    filters.inquiryNo.forEach((value) => params.append("inquiryNo", value))
    filters.company.forEach((value) => params.append("company", value))
    filters.salesStage.forEach((value) => params.append("salesStage", value))
    filters.salesPersonEmail.forEach((value) => params.append("salesPersonEmail", value))
    if (filters.followupDateFrom) params.set("followupDateFrom", filters.followupDateFrom)
    if (filters.followupDateTo) params.set("followupDateTo", filters.followupDateTo)
  }

  const loadInquiryPage = async (page: number, config = sortConfig, options: { silent?: boolean } = {}) => {
    setIsRefreshing(true)
    try {
      const params = new URLSearchParams({
        page: String(page),
        pageSize: String(rowsPerPage),
        sort: apiSort(config),
      })
      appendServerFilterParams(params)
      const res = await fetch(`/api/inquiries?${params}`, { cache: "no-store" })
      const payload = await res.json()
      if (!res.ok || !payload.success) throw new Error(payload.message || "Failed to fetch inquiries")

      const next = payload.data
      const items = Array.isArray(next?.items) ? next.items : Array.isArray(next) ? next : []
      setInquiries(items)
      setFilteredInquiries(items)
      setCurrentPage(Number(next?.page || page))
      setServerTotal(Number(next?.total || items.length))
      setServerTotalPages(Number(next?.totalPages || 1))
      setSelectedRows(new Set())
      setEditingRows(new Set())
      setEditedData(new Map())
      if (!options.silent) toast.success("Data refreshed")
    } catch (error) {
      if (!options.silent) toast.error(error instanceof Error ? error.message : "Error refreshing data")
    } finally {
      setIsRefreshing(false)
    }
  }

  const fetchInquiryByNo = async (inquiryNo: string) => {
    const params = new URLSearchParams({
      page: "1",
      pageSize: "1",
      sort: "inquiryNo.desc",
    })
    params.append("inquiryNo", inquiryNo)
    const res = await fetch(`/api/inquiries?${params}`, { cache: "no-store" })
    const data = await res.json()
    const items = data.success && Array.isArray(data.data?.items) ? data.data.items : []
    return (items as InquiryRow[]).find((row) => row[0] === inquiryNo) || null
  }

  const rowsMatchEditedPayload = (authoritativeRow: InquiryRow, editedRow: InquiryRow) => {
    return EDIT_COMPARE_COLUMNS.every((columnIndex) => String(authoritativeRow[columnIndex] ?? "") === String(editedRow[columnIndex] ?? ""))
  }

  const confirmUncertainSave = async (updates: Array<{ inquiryNo: string; data: InquiryRow }>) => {
    setSaveStatus("Confirming changes...")
    for (const update of updates) {
      const authoritativeRow = await fetchInquiryByNo(update.inquiryNo)
      if (!authoritativeRow || !rowsMatchEditedPayload(authoritativeRow, update.data)) {
        toast.error("Could not confirm whether changes were saved. Please refresh before trying again.")
        return false
      }
    }

    applyRowsLocally(updates)
    toast.success("Inquiry updated")
    setEditingRows(new Set())
    setEditedData(new Map())
    setSelectedRows(new Set())
    void refreshData({ silent: true })
    return true
  }

  const handleSave = async () => {
    if (isLoading) return
    if (!editingRows.size) {
      toast.error("No changes to save")
      return
    }

    setIsLoading(true)
    setSaveStatus("Saving changes...")
    try {
      const updates = Array.from(editingRows).map((inquiryNo) => {
        // Find the original row from the *full* inquiries list for accurate updates
        const row = inquiries.find((r) => r[0] === inquiryNo)
        if (!row) return null

        const edits = editedData.get(inquiryNo)
        if (!edits) return null

        const updatedRow = [...row]

        // Preserve display-only Sheet columns through AT when saving editable fields.
        while (updatedRow.length < INQUIRY_ROW_LENGTH) {
          updatedRow.push("")
        }
        if (updatedRow.length > INQUIRY_ROW_LENGTH) {
          updatedRow.length = INQUIRY_ROW_LENGTH
        }

        const originalTimestamp = String(row[1] || "")
        const tsBackup = String(updatedRow[23] || updatedRow[1] || "") // If no backup, use current timestamp

        // Apply edits
        Object.entries(edits).forEach(([colIdx, value]) => {
          const idx = Number.parseInt(colIdx)
          if (idx >= 0 && idx < INQUIRY_ROW_LENGTH) {
            updatedRow[idx] = String(value ?? "")
          }
        })

        // Update timestamp to current time (column B/index 1)
        updatedRow[1] = new Date().toLocaleString("en-IN", { timeZone: "Asia/Kolkata" })

        // Preserve original timestamp in ts backup (column X/index 23)
        updatedRow[23] = tsBackup

        return {
          inquiryNo,
          data: updatedRow,
          originalTimestamp,
        }
      })

      const validUpdates = updates.filter((u): u is { inquiryNo: string; data: InquiryRow; originalTimestamp: string } => u !== null)

      if (!validUpdates.length) {
        toast.error("No valid updates to save")
        setIsLoading(false)
        setSaveStatus("")
        return
      }

      const controller = new AbortController()
      const timeout = setTimeout(() => controller.abort(), EDIT_SAVE_TIMEOUT_MS)
      let res: Response
      let rawResponse = ""

      try {
        res = await fetch("/api/inquiries/update", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ updates: validUpdates }),
          signal: controller.signal,
        })
        rawResponse = await res.text()
      } catch {
        await confirmUncertainSave(validUpdates)
        return
      } finally {
        clearTimeout(timeout)
      }

      let result: any
      try {
        result = JSON.parse(rawResponse)
      } catch {
        await confirmUncertainSave(validUpdates)
        return
      }

      if (result.success) {
        applyRowsLocally(validUpdates)
        toast.success("Inquiry updated")
        setEditingRows(new Set()) // Clear editing mode for all rows
        setEditedData(new Map()) // Clear edited data
        setSelectedRows(new Set()) // Deselect all rows
        void refreshData({ silent: true })
      } else if (result.errorCode === "STALE_EDIT") {
        toast.error("This inquiry was changed by another user. Refresh before saving your changes.")
      } else {
        toast.error(`Failed to save: ${result.message}`)
      }
    } catch (error) {
      console.error("[v0] Save error:", error)
      toast.error("Failed to save changes")
    } finally {
      setIsLoading(false)
      setSaveStatus("")
    }
  }

  const refreshData = async (options: { silent?: boolean } = {}) => {
    await loadInquiryPage(currentPage, sortConfig, options)
  }

  const handleLogout = async () => {
    await fetch("/api/auth/logout", { method: "POST" })
    router.push("/login")
  }

  const handleDeleteClick = () => {
    if (selectedRows.size === 0) {
      toast.warning("Please select at least one inquiry to delete")
      return
    }

    if (userRole !== "BOSS") {
      toast.error("Only BOSS can delete inquiries")
      return
    }

    setDeletingInquiries(new Set(selectedRows))
    setShowDeleteConfirm(true)
  }

  const confirmDelete = async () => {
    setIsLoading(true)
    try {
      const res = await fetch("/api/inquiries/delete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ inquiryNumbers: Array.from(deletingInquiries) }),
      })

      const result = await res.json()

      if (result.success) {
        toast.success(`${result.deletedCount} inquiry(ies) deleted`)
        setShowDeleteConfirm(false)
        setSelectedRows(new Set())
        await refreshData()
      } else {
        toast.error(`Failed to delete: ${result.message}`)
      }
    } catch (error) {
      console.error("[v0] Delete error:", error)
      toast.error("Error deleting inquiries")
    } finally {
      setIsLoading(false)
    }
  }

  const resetFilters = () => {
    setFilters({
      inquiryNo: [], // Reset to empty array
      company: [], // Reset to empty array
      contactName: [], // Reset to empty array
      phone: "",
      email: [], // Reset to empty array
      category: [],
      leadSource: [],
      salesStage: [],
      nextSteps: [],
      occasion: [],
      location: [],
      inquiryType: [],
      firstOwner: [], // Reset to empty array
      salesPersonEmail: [], // Reset to empty array
      avgHeavyLifters: [],
      heavyLiftersTags: [],
      avgClosureDays: [],
      bigBulls: [],
      followupDateFrom: "",
      followupDateTo: "",
    })
    // When filters are reset, we should also clear selections and editing state
    setSelectedRows(new Set())
    setEditingRows(new Set())
    setEditedData(new Map())
    toast.success("Filters reset")
  }

  const handleWhatsAppLog = () => {
    if (selectedRows.size === 0) {
      toast.warning("Please select at least one inquiry")
      return
    }
    setWhatsappMessage("") // Clear message on open
    setShowWhatsAppDialog(true)
  }

  const handleEmailLog = () => {
    if (selectedRows.size === 0) {
      toast.warning("Please select at least one inquiry")
      return
    }
    setEmailSubject("") // Clear subject on open
    setEmailBody("") // Clear body on open
    setShowEmailDialog(true)
  }

  const submitWhatsAppLog = async () => {
    if (!whatsappMessage.trim()) {
      toast.error("Please enter a message")
      return
    }

    setIsLoading(true)

    // Fetch the full data for selected rows to get phone numbers
    const selectedData = Array.from(selectedRows)
      .map((inquiryNo) => inquiries.find((r) => r[0] === inquiryNo)) // Use full inquiries for accurate data
      .filter(Boolean)

    const phoneNumbers = selectedData.map((row) => row?.[4]).filter(Boolean)

    if (phoneNumbers.length === 0) {
      setIsLoading(false)
      toast.error("No phone numbers found in selected inquiries")
      return
    }

    const logData = {
      senderEmail: userEmail,
      recipients: phoneNumbers,
      inquiryNumbers: Array.from(selectedRows),
      messageBody: whatsappMessage,
      timestamp: new Date().toISOString(),
    }

    try {
      const res = await fetch("/api/whatsapp-log", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(logData),
      })

      const result = await res.json()
      if (result.success) {
        toast.success(`WhatsApp logged for ${phoneNumbers.length} contact(s)`)
        setShowWhatsAppDialog(false)
        setSelectedRows(new Set())
        await refreshData() // Refresh data after action
      } else {
        toast.error("Failed to log WhatsApp")
      }
    } catch (error) {
      toast.error("Error logging WhatsApp")
    } finally {
      setIsLoading(false)
    }
  }

  const submitEmailLog = async () => {
    if (!emailSubject.trim() || !emailBody.trim()) {
      toast.error("Please enter both subject and body")
      return
    }

    setIsLoading(true)

    // Fetch the full data for selected rows to get email addresses
    const selectedData = Array.from(selectedRows)
      .map((inquiryNo) => inquiries.find((r) => r[0] === inquiryNo)) // Use full inquiries for accurate data
      .filter(Boolean)

    const emails = selectedData.map((row) => row?.[5]).filter(Boolean)

    if (emails.length === 0) {
      setIsLoading(false)
      toast.error("No email addresses found in selected inquiries")
      return
    }

    const logData = {
      senderEmail: userEmail,
      recipients: emails,
      inquiryNumbers: Array.from(selectedRows),
      subject: emailSubject,
      body: emailBody,
      timestamp: new Date().toISOString(),
    }

    try {
      const res = await fetch("/api/email-log", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(logData),
      })

      const result = await res.json()
      if (result.success) {
        toast.success(`Email logged for ${emails.length} contact(s)`)
        setShowEmailDialog(false)
        setSelectedRows(new Set())
        await refreshData() // Refresh data after action
      } else {
        toast.error("Failed to log email")
      }
    } catch (error) {
      toast.error("Error logging email")
    } finally {
      setIsLoading(false)
    }
  }

  const getRoleColor = () => {
    switch (userRole) {
      case "BOSS":
        return "bg-purple-500 text-white"
      case "HEAD":
        return "bg-blue-500 text-white"
      default:
        return "bg-green-500 text-white"
    }
  }

  const MultiSelectCombobox = ({
    values,
    options,
    placeholder,
    onChange,
  }: {
    values: string[]
    options: string[]
    placeholder: string
    onChange: (values: string[]) => void
  }) => {
    const [open, setOpen] = useState(false)

    return (
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            role="combobox"
            aria-expanded={open}
            className="w-full h-10 justify-between text-sm font-normal bg-transparent"
          >
            {values.length > 0 ? `${values.length} selected` : placeholder}
            <ChevronDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-full p-0" align="start">
          <Command>
            <CommandInput placeholder={`Search ${placeholder.toLowerCase()}...`} className="h-9" />
            <CommandList>
              <CommandEmpty>No results found.</CommandEmpty>
              <CommandGroup className="max-h-64 overflow-auto">
                {options.map((option) => (
                  <CommandItem
                    key={option}
                    value={option}
                    onSelect={() => {
                      const newValues = values.includes(option)
                        ? values.filter((v) => v !== option)
                        : [...values, option]
                      onChange(newValues)
                    }}
                  >
                    <div
                      className={`mr-2 flex h-4 w-4 items-center justify-center rounded-sm border border-primary ${
                        values.includes(option) ? "bg-primary text-primary-foreground" : "opacity-50"
                      }`}
                    >
                      {values.includes(option) && <Check className="h-3 w-3" />}
                    </div>
                    {option}
                  </CommandItem>
                ))}
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
    )
  }

  const toggleFilterValue = (filterKey: keyof typeof filters, value: string) => {
    const currentValues = filters[filterKey] as string[]
    const newValues = currentValues.includes(value)
      ? currentValues.filter((v) => v !== value)
      : [...currentValues, value]
    setFilters({ ...filters, [filterKey]: newValues })
  }

  const handleSortActual = (key: SortKey) => {
    let direction: "asc" | "desc" = "asc"
    if (sortConfig.key === key && sortConfig.direction === "asc") {
      direction = "desc"
    }
    const nextConfig = { key, direction, keyMapping: SORT_KEY_MAPPING }
    setSortConfig(nextConfig)
    void loadInquiryPage(1, nextConfig, { silent: true })
  }

  const currentPageData = filteredInquiries
  const filteredRowCount = serverTotal
  const exactInquiryNoSearch = inquiryNoSearch.trim()
  const showExactInquiryNoSearch =
    exactInquiryNoSearch.length > 0 &&
    !filters.inquiryNo.includes(exactInquiryNoSearch) &&
    !uniqueInquiryNos.includes(exactInquiryNoSearch)

  // Corrected handleSelectAll
  const handleSelectAll = () => {
    if (selectedRows.size === currentPageData.length) {
      setSelectedRows(new Set())
    } else {
      const currentPageIds = currentPageData.map((row) => row[0])
      setSelectedRows(new Set(currentPageIds))
    }
  }

  // Corrected handleSelectRow
  const handleSelectRow = (inquiryNo: string) => {
    const newSelected = new Set(selectedRows)
    if (newSelected.has(inquiryNo)) {
      newSelected.delete(inquiryNo)
    } else {
      newSelected.add(inquiryNo)
    }
    setSelectedRows(newSelected)
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <Toaster position="top-center" richColors expand />

      {isLoading && (
        <div className="fixed inset-0 z-[100] bg-black/50 flex items-center justify-center">
          <div className="bg-white rounded-lg p-6 flex flex-col items-center gap-3">
            <div className="animate-spin rounded-full h-12 w-12 border-4 border-orange-600 border-t-transparent"></div>
            <p className="text-gray-700 font-medium">Processing...</p>
          </div>
        </div>
      )}

      <header className="bg-gradient-to-r from-orange-500 via-orange-600 to-red-500 text-white shadow-lg sticky top-0 z-50">
        <div className="max-w-full px-4 md:px-6 py-3 md:py-4">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-3 md:gap-6 min-w-0">
              <Link
                href="/dashboard"
                className="text-lg md:text-2xl font-bold hover:opacity-90 transition-opacity whitespace-nowrap"
              >
                CRM
              </Link>
              <div className="hidden sm:flex items-center gap-2 text-xs md:text-sm opacity-90 min-w-0">
                <span>/</span>
                <span className="truncate">View Inquiries</span>
                <span className="ml-1 md:ml-2 px-2 py-0.5 md:py-1 bg-white/20 rounded-md font-medium whitespace-nowrap text-xs">
                  {filteredInquiries.length}
                </span>
              </div>
            </div>
            <div className="flex items-center gap-2 md:gap-4">
              <div className="text-xs md:text-sm truncate max-w-[120px] md:max-w-[200px]">{userEmail}</div>
              <Button variant="ghost" size="sm" onClick={handleLogout} className="text-white hover:bg-white/20 p-2">
                <LogOut className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </div>
      </header>

      <div className="max-w-full p-3 md:p-6 space-y-3 md:space-y-4">
        <div className="bg-white rounded-lg shadow-sm border p-3 md:p-4">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-2">
              <Button
                variant={showFilters ? "default" : "outline"}
                size="sm"
                onClick={() => setShowFilters(!showFilters)}
                className="gap-2 text-xs md:text-sm h-9"
              >
                <Filter className="h-3 w-3 md:h-4 md:w-4" />
                Filters
                {showFilters ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
              </Button>

              {Object.values(filters).some((v) => (Array.isArray(v) ? v.length > 0 : v !== "")) && (
                <Button variant="ghost" size="sm" onClick={resetFilters} className="gap-2 text-xs md:text-sm h-9">
                  <X className="h-3 w-3 md:h-4 md:w-4" />
                  Reset
                </Button>
              )}

              <Button
                variant="outline"
                size="sm"
                onClick={() => refreshData()}
                disabled={isRefreshing}
                className="gap-2 text-xs md:text-sm bg-transparent h-9"
              >
                <RefreshCw className={`h-3 w-3 md:h-4 md:w-4 ${isRefreshing ? "animate-spin" : ""}`} />
                <span className="hidden sm:inline">Refresh</span>
              </Button>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              {selectedRows.size > 0 && (
                <>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleWhatsAppLog}
                    disabled={isLoading}
                    className="gap-2 bg-green-50 hover:bg-green-100 text-green-700 border-green-300 text-xs md:text-sm h-9"
                  >
                    <MessageCircle className="h-3 w-3 md:h-4 md:w-4" />
                    WhatsApp
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleEmailLog}
                    disabled={isLoading}
                    className="gap-2 bg-blue-50 hover:bg-blue-100 text-blue-700 border-blue-300 text-xs md:text-sm h-9"
                  >
                    <Mail className="h-3 w-3 md:h-4 md:w-4" />
                    Email
                  </Button>
                  {userRole === "BOSS" && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={handleDeleteClick}
                      disabled={isLoading}
                      className="gap-2 bg-red-50 hover:bg-red-100 text-red-700 border-red-300 text-xs md:text-sm h-9"
                    >
                      <Trash2 className="h-3 w-3 md:h-4 md:w-4" />
                      Delete
                    </Button>
                  )}
                </>
              )}

              {editingRows.size > 0 ? (
                <>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={cancelEdit}
                    className="text-xs md:text-sm bg-transparent h-9"
                  >
                    Cancel
                  </Button>
                  <Button
                    size="sm"
                    onClick={handleSave} // Changed from saveEdits to handleSave
                    disabled={isLoading}
                    className="gap-2 bg-green-600 hover:bg-green-700 text-xs md:text-sm h-9"
                  >
                    <Save className="h-3 w-3 md:h-4 md:w-4" />
                    {isLoading ? saveStatus || "Saving changes..." : `Save (${editingRows.size})`}
                  </Button>
                </>
              ) : (
                <Button
                  size="sm"
                  onClick={enableBulkEdit}
                  disabled={selectedRows.size === 0}
                  className="gap-2 bg-orange-600 hover:bg-orange-700 text-xs md:text-sm h-9"
                >
                  <Edit className="h-3 w-3 md:h-4 md:w-4" />
                  Edit ({selectedRows.size})
                </Button>
              )}
            </div>
          </div>
        </div>

        {showFilters && (
          <div className="bg-white rounded-lg shadow-sm border overflow-hidden animate-in slide-in-from-top duration-300">
            <div className="bg-gradient-to-r from-orange-50 to-orange-100 border-b px-4 py-3">
              <h3 className="text-sm md:text-base font-semibold text-gray-800 flex items-center gap-2">
                <Filter className="h-4 w-4 text-orange-600" />
                Sales & Business Filters
              </h3>
            </div>

            <div className="p-4 md:p-6 space-y-6">
              {/* Searchable Multiselect Filters */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-4">
                {/* Inquiry No */}
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-gray-700">Inquiry No</label>
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button
                        variant="outline"
                        className="w-full h-11 justify-between px-3 text-sm border-gray-300 focus:ring-2 focus:ring-orange-500 focus:border-orange-500 rounded-lg bg-transparent"
                      >
                        {filters.inquiryNo.length > 0 ? `${filters.inquiryNo.length} selected` : "Select inquiry no..."}
                        <ChevronDown className="ml-2 h-4 w-4 opacity-50" />
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-[280px] p-0">
                      <Command>
                        <CommandInput
                          placeholder="Search inquiry no..."
                          className="h-9"
                          value={inquiryNoSearch}
                          onValueChange={setInquiryNoSearch}
                        />
                        <CommandList>
                          <CommandEmpty>No inquiry found.</CommandEmpty>
                          <CommandGroup>
                            {showExactInquiryNoSearch && (
                              <CommandItem
                                key={`exact-${exactInquiryNoSearch}`}
                                value={exactInquiryNoSearch}
                                onSelect={() => {
                                  setFilters({ ...filters, inquiryNo: [...filters.inquiryNo, exactInquiryNoSearch] })
                                  setInquiryNoSearch("")
                                }}
                              >
                                Search exact inquiry no {exactInquiryNoSearch}
                              </CommandItem>
                            )}
                            {uniqueInquiryNos.map((inq) => (
                              <CommandItem
                                key={inq}
                                onSelect={() => {
                                  const newValues = filters.inquiryNo.includes(inq)
                                    ? filters.inquiryNo.filter((v) => v !== inq)
                                    : [...filters.inquiryNo, inq]
                                  setFilters({ ...filters, inquiryNo: newValues })
                                  setInquiryNoSearch("")
                                }}
                              >
                                {inq}
                                {filters.inquiryNo.includes(inq) && <Check className="ml-auto h-4 w-4" />}
                              </CommandItem>
                            ))}
                          </CommandGroup>
                        </CommandList>
                      </Command>
                    </PopoverContent>
                  </Popover>
                  {filters.inquiryNo.length > 0 && (
                    <div className="flex flex-wrap gap-1 mt-1">
                      {filters.inquiryNo.slice(0, 3).map((val) => (
                        <span
                          key={val}
                          className="inline-flex items-center gap-1 px-1.5 py-0.5 bg-orange-100 text-orange-700 rounded text-xs"
                        >
                          {val}
                          <X
                            className="h-3 w-3 cursor-pointer"
                            onClick={() =>
                              setFilters({ ...filters, inquiryNo: filters.inquiryNo.filter((v) => v !== val) })
                            }
                          />
                        </span>
                      ))}
                      {filters.inquiryNo.length > 3 && (
                        <span className="text-xs text-gray-500">+{filters.inquiryNo.length - 3} more</span>
                      )}
                    </div>
                  )}
                </div>

                {/* Company */}
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-gray-700">Company</label>
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button
                        variant="outline"
                        className="w-full h-11 justify-between px-3 text-sm border-gray-300 focus:ring-2 focus:ring-orange-500 focus:border-orange-500 rounded-lg bg-transparent"
                      >
                        {filters.company.length > 0 ? `${filters.company.length} selected` : "Select company..."}
                        <ChevronDown className="ml-2 h-4 w-4 opacity-50" />
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-[280px] p-0">
                      <Command>
                        <CommandInput placeholder="Search company..." className="h-9" />
                        <CommandList>
                          <CommandEmpty>No company found.</CommandEmpty>
                          <CommandGroup>
                            {uniqueCompanies.map((comp) => (
                              <CommandItem
                                key={comp}
                                onSelect={() => {
                                  const newValues = filters.company.includes(comp)
                                    ? filters.company.filter((v) => v !== comp)
                                    : [...filters.company, comp]
                                  setFilters({ ...filters, company: newValues })
                                }}
                              >
                                {comp}
                                {filters.company.includes(comp) && <Check className="ml-auto h-4 w-4" />}
                              </CommandItem>
                            ))}
                          </CommandGroup>
                        </CommandList>
                      </Command>
                    </PopoverContent>
                  </Popover>
                  {filters.company.length > 0 && (
                    <div className="flex flex-wrap gap-1 mt-1">
                      {filters.company.slice(0, 3).map((val) => (
                        <span
                          key={val}
                          className="inline-flex items-center gap-1 px-1.5 py-0.5 bg-blue-100 text-blue-700 rounded text-xs"
                        >
                          {val}
                          <X
                            className="h-3 w-3 cursor-pointer"
                            onClick={() =>
                              setFilters({ ...filters, company: filters.company.filter((v) => v !== val) })
                            }
                          />
                        </span>
                      ))}
                      {filters.company.length > 3 && (
                        <span className="text-xs text-gray-500">+{filters.company.length - 3} more</span>
                      )}
                    </div>
                  )}
                </div>

                {/* Contact Name */}
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-gray-700">Contact Name</label>
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button
                        variant="outline"
                        className="w-full h-11 justify-between px-3 text-sm border-gray-300 focus:ring-2 focus:ring-orange-500 focus:border-orange-500 rounded-lg bg-transparent"
                      >
                        {filters.contactName.length > 0
                          ? `${filters.contactName.length} selected`
                          : "Select contact..."}
                        <ChevronDown className="ml-2 h-4 w-4 opacity-50" />
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-[280px] p-0">
                      <Command>
                        <CommandInput placeholder="Search contact..." className="h-9" />
                        <CommandList>
                          <CommandEmpty>No contact found.</CommandEmpty>
                          <CommandGroup>
                            {uniqueContactNames.map((name) => (
                              <CommandItem
                                key={name}
                                onSelect={() => {
                                  const newValues = filters.contactName.includes(name)
                                    ? filters.contactName.filter((v) => v !== name)
                                    : [...filters.contactName, name]
                                  setFilters({ ...filters, contactName: newValues })
                                }}
                              >
                                {name}
                                {filters.contactName.includes(name) && <Check className="ml-auto h-4 w-4" />}
                              </CommandItem>
                            ))}
                          </CommandGroup>
                        </CommandList>
                      </Command>
                    </PopoverContent>
                  </Popover>
                  {filters.contactName.length > 0 && (
                    <div className="flex flex-wrap gap-1 mt-1">
                      {filters.contactName.slice(0, 3).map((val) => (
                        <span
                          key={val}
                          className="inline-flex items-center gap-1 px-1.5 py-0.5 bg-green-100 text-green-700 rounded text-xs"
                        >
                          {val}
                          <X
                            className="h-3 w-3 cursor-pointer"
                            onClick={() =>
                              setFilters({ ...filters, contactName: filters.contactName.filter((v) => v !== val) })
                            }
                          />
                        </span>
                      ))}
                      {filters.contactName.length > 3 && (
                        <span className="text-xs text-gray-500">+{filters.contactName.length - 3} more</span>
                      )}
                    </div>
                  )}
                </div>

                {/* Phone */}
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-gray-700">Phone</label>
                  <Input
                    placeholder="Phone"
                    value={filters.phone}
                    onChange={(e) => setFilters({ ...filters, phone: e.target.value })}
                    className="h-11 px-3 text-sm border-gray-300 focus:ring-2 focus:ring-orange-500 focus:border-orange-500 rounded-lg"
                  />
                </div>

                {/* Email */}
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-gray-700">Email</label>
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button
                        variant="outline"
                        className="w-full h-11 justify-between px-3 text-sm border-gray-300 focus:ring-2 focus:ring-orange-500 focus:border-orange-500 rounded-lg bg-transparent"
                      >
                        {filters.email.length > 0 ? `${filters.email.length} selected` : "Select email..."}
                        <ChevronDown className="ml-2 h-4 w-4 opacity-50" />
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-[280px] p-0">
                      <Command>
                        <CommandInput placeholder="Search email..." className="h-9" />
                        <CommandList>
                          <CommandEmpty>No email found.</CommandEmpty>
                          <CommandGroup>
                            {uniqueEmails.map((email) => (
                              <CommandItem
                                key={email}
                                onSelect={() => {
                                  const newValues = filters.email.includes(email)
                                    ? filters.email.filter((v) => v !== email)
                                    : [...filters.email, email]
                                  setFilters({ ...filters, email: newValues })
                                }}
                              >
                                {email}
                                {filters.email.includes(email) && <Check className="ml-auto h-4 w-4" />}
                              </CommandItem>
                            ))}
                          </CommandGroup>
                        </CommandList>
                      </Command>
                    </PopoverContent>
                  </Popover>
                  {filters.email.length > 0 && (
                    <div className="flex flex-wrap gap-1 mt-1">
                      {filters.email.slice(0, 3).map((val) => (
                        <span
                          key={val}
                          className="inline-flex items-center gap-1 px-1.5 py-0.5 bg-purple-100 text-purple-700 rounded text-xs max-w-[120px] truncate"
                        >
                          {val}
                          <X
                            className="h-3 w-3 cursor-pointer flex-shrink-0"
                            onClick={() => setFilters({ ...filters, email: filters.email.filter((v) => v !== val) })}
                          />
                        </span>
                      ))}
                      {filters.email.length > 3 && (
                        <span className="text-xs text-gray-500">+{filters.email.length - 3} more</span>
                      )}
                    </div>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-4">
                {/* Category */}
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-gray-700">Category</label>
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button
                        variant="outline"
                        className="w-full h-11 justify-between px-3 text-sm border-gray-300 focus:ring-2 focus:ring-orange-500 focus:border-orange-500 rounded-lg bg-transparent"
                      >
                        {filters.category.length > 0 ? `${filters.category.length} selected` : "Select category..."}
                        <ChevronDown className="ml-2 h-4 w-4 opacity-50" />
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-[280px] p-0">
                      <Command>
                        <CommandList>
                          <CommandGroup>
                            {(dropdownData.Category || []).map((cat) => (
                              <CommandItem
                                key={cat}
                                onSelect={() => {
                                  const newValues = filters.category.includes(cat)
                                    ? filters.category.filter((v) => v !== cat)
                                    : [...filters.category, cat]
                                  setFilters({ ...filters, category: newValues })
                                }}
                              >
                                {cat}
                                {filters.category.includes(cat) && <Check className="ml-auto h-4 w-4" />}
                              </CommandItem>
                            ))}
                          </CommandGroup>
                        </CommandList>
                      </Command>
                    </PopoverContent>
                  </Popover>
                  {filters.category.length > 0 && (
                    <div className="flex flex-wrap gap-1 mt-1">
                      {filters.category.map((val) => (
                        <span
                          key={val}
                          className="inline-flex items-center gap-1 px-1.5 py-0.5 bg-indigo-100 text-indigo-700 rounded text-xs"
                        >
                          {val}
                          <X
                            className="h-3 w-3 cursor-pointer"
                            onClick={() =>
                              setFilters({ ...filters, category: filters.category.filter((v) => v !== val) })
                            }
                          />
                        </span>
                      ))}
                    </div>
                  )}
                </div>

                {/* Lead Source */}
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-gray-700">Lead Source</label>
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button
                        variant="outline"
                        className="w-full h-11 justify-between px-3 text-sm border-gray-300 focus:ring-2 focus:ring-orange-500 focus:border-orange-500 rounded-lg bg-transparent"
                      >
                        {filters.leadSource.length > 0 ? `${filters.leadSource.length} selected` : "Select source..."}
                        <ChevronDown className="ml-2 h-4 w-4 opacity-50" />
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-[280px] p-0">
                      <Command>
                        <CommandList>
                          <CommandGroup>
                            {(dropdownData.LeadSource || []).map((src) => (
                              <CommandItem
                                key={src}
                                onSelect={() => {
                                  const newValues = filters.leadSource.includes(src)
                                    ? filters.leadSource.filter((v) => v !== src)
                                    : [...filters.leadSource, src]
                                  setFilters({ ...filters, leadSource: newValues })
                                }}
                              >
                                {src}
                                {filters.leadSource.includes(src) && <Check className="ml-auto h-4 w-4" />}
                              </CommandItem>
                            ))}
                          </CommandGroup>
                        </CommandList>
                      </Command>
                    </PopoverContent>
                  </Popover>
                  {filters.leadSource.length > 0 && (
                    <div className="flex flex-wrap gap-1 mt-1">
                      {filters.leadSource.map((val) => (
                        <span
                          key={val}
                          className="inline-flex items-center gap-1 px-1.5 py-0.5 bg-pink-100 text-pink-700 rounded text-xs"
                        >
                          {val}
                          <X
                            className="h-3 w-3 cursor-pointer"
                            onClick={() =>
                              setFilters({ ...filters, leadSource: filters.leadSource.filter((v) => v !== val) })
                            }
                          />
                        </span>
                      ))}
                    </div>
                  )}
                </div>

                {/* Sales Stage */}
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-gray-700">Sales Stage</label>
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button
                        variant="outline"
                        className="w-full h-11 justify-between px-3 text-sm border-gray-300 focus:ring-2 focus:ring-orange-500 focus:border-orange-500 rounded-lg bg-transparent"
                      >
                        {filters.salesStage.length > 0 ? `${filters.salesStage.length} selected` : "Select stage..."}
                        <ChevronDown className="ml-2 h-4 w-4 opacity-50" />
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-[280px] p-0">
                      <Command>
                        <CommandList>
                          <CommandGroup>
                            {(dropdownData.SalesStage || []).map((stage) => (
                              <CommandItem
                                key={stage}
                                onSelect={() => {
                                  const newValues = filters.salesStage.includes(stage)
                                    ? filters.salesStage.filter((v) => v !== stage)
                                    : [...filters.salesStage, stage]
                                  setFilters({ ...filters, salesStage: newValues })
                                }}
                              >
                                {stage}
                                {filters.salesStage.includes(stage) && <Check className="ml-auto h-4 w-4" />}
                              </CommandItem>
                            ))}
                          </CommandGroup>
                        </CommandList>
                      </Command>
                    </PopoverContent>
                  </Popover>
                  {filters.salesStage.length > 0 && (
                    <div className="flex flex-wrap gap-1 mt-1">
                      {filters.salesStage.map((val) => (
                        <span
                          key={val}
                          className="inline-flex items-center gap-1 px-1.5 py-0.5 bg-amber-100 text-amber-700 rounded text-xs"
                        >
                          {val}
                          <X
                            className="h-3 w-3 cursor-pointer"
                            onClick={() =>
                              setFilters({ ...filters, salesStage: filters.salesStage.filter((v) => v !== val) })
                            }
                          />
                        </span>
                      ))}
                    </div>
                  )}
                </div>

                {/* Next Steps */}
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-gray-700">Next Steps</label>
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button
                        variant="outline"
                        className="w-full h-11 justify-between px-3 text-sm border-gray-300 focus:ring-2 focus:ring-orange-500 focus:border-orange-500 rounded-lg bg-transparent"
                      >
                        {filters.nextSteps.length > 0 ? `${filters.nextSteps.length} selected` : "Select next steps..."}
                        <ChevronDown className="ml-2 h-4 w-4 opacity-50" />
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-[280px] p-0">
                      <Command>
                        <CommandList>
                          <CommandGroup>
                            {(dropdownData.NextSteps || []).map((step) => (
                              <CommandItem
                                key={step}
                                onSelect={() => {
                                  const newValues = filters.nextSteps.includes(step)
                                    ? filters.nextSteps.filter((v) => v !== step)
                                    : [...filters.nextSteps, step]
                                  setFilters({ ...filters, nextSteps: newValues })
                                }}
                              >
                                {step}
                                {filters.nextSteps.includes(step) && <Check className="ml-auto h-4 w-4" />}
                              </CommandItem>
                            ))}
                          </CommandGroup>
                        </CommandList>
                      </Command>
                    </PopoverContent>
                  </Popover>
                  {filters.nextSteps.length > 0 && (
                    <div className="flex flex-wrap gap-1 mt-1">
                      {filters.nextSteps.map((val) => (
                        <span
                          key={val}
                          className="inline-flex items-center gap-1 px-1.5 py-0.5 bg-teal-100 text-teal-700 rounded text-xs"
                        >
                          {val}
                          <X
                            className="h-3 w-3 cursor-pointer"
                            onClick={() =>
                              setFilters({ ...filters, nextSteps: filters.nextSteps.filter((v) => v !== val) })
                            }
                          />
                        </span>
                      ))}
                    </div>
                  )}
                </div>

                {/* Occasion */}
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-gray-700">Occasion</label>
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button
                        variant="outline"
                        className="w-full h-11 justify-between px-3 text-sm border-gray-300 focus:ring-2 focus:ring-orange-500 focus:border-orange-500 rounded-lg bg-transparent"
                      >
                        {filters.occasion.length > 0 ? `${filters.occasion.length} selected` : "Select occasion..."}
                        <ChevronDown className="ml-2 h-4 w-4 opacity-50" />
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-[280px] p-0">
                      <Command>
                        <CommandList>
                          <CommandGroup>
                            {(dropdownData.Occasion || []).map((occ) => (
                              <CommandItem
                                key={occ}
                                onSelect={() => {
                                  const newValues = filters.occasion.includes(occ)
                                    ? filters.occasion.filter((v) => v !== occ)
                                    : [...filters.occasion, occ]
                                  setFilters({ ...filters, occasion: newValues })
                                }}
                              >
                                {occ}
                                {filters.occasion.includes(occ) && <Check className="ml-auto h-4 w-4" />}
                              </CommandItem>
                            ))}
                          </CommandGroup>
                        </CommandList>
                      </Command>
                    </PopoverContent>
                  </Popover>
                  {filters.occasion.length > 0 && (
                    <div className="flex flex-wrap gap-1 mt-1">
                      {filters.occasion.map((val) => (
                        <span
                          key={val}
                          className="inline-flex items-center gap-1 px-1.5 py-0.5 bg-rose-100 text-rose-700 rounded text-xs"
                        >
                          {val}
                          <X
                            className="h-3 w-3 cursor-pointer"
                            onClick={() =>
                              setFilters({ ...filters, occasion: filters.occasion.filter((v) => v !== val) })
                            }
                          />
                        </span>
                      ))}
                    </div>
                  )}
                </div>

                {/* Location */}
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-gray-700">Location</label>
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button
                        variant="outline"
                        className="w-full h-11 justify-between px-3 text-sm border-gray-300 focus:ring-2 focus:ring-orange-500 focus:border-orange-500 rounded-lg bg-transparent"
                      >
                        {filters.location.length > 0 ? `${filters.location.length} selected` : "Select location..."}
                        <ChevronDown className="ml-2 h-4 w-4 opacity-50" />
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-[280px] p-0">
                      <Command>
                        <CommandList>
                          <CommandGroup>
                            {(dropdownData.Location || []).map((loc) => (
                              <CommandItem
                                key={loc}
                                onSelect={() => {
                                  const newValues = filters.location.includes(loc)
                                    ? filters.location.filter((v) => v !== loc)
                                    : [...filters.location, loc]
                                  setFilters({ ...filters, location: newValues })
                                }}
                              >
                                {loc}
                                {filters.location.includes(loc) && <Check className="ml-auto h-4 w-4" />}
                              </CommandItem>
                            ))}
                          </CommandGroup>
                        </CommandList>
                      </Command>
                    </PopoverContent>
                  </Popover>
                  {filters.location.length > 0 && (
                    <div className="flex flex-wrap gap-1 mt-1">
                      {filters.location.map((val) => (
                        <span
                          key={val}
                          className="inline-flex items-center gap-1 px-1.5 py-0.5 bg-cyan-100 text-cyan-700 rounded text-xs"
                        >
                          {val}
                          <X
                            className="h-3 w-3 cursor-pointer"
                            onClick={() =>
                              setFilters({ ...filters, location: filters.location.filter((v) => v !== val) })
                            }
                          />
                        </span>
                      ))}
                    </div>
                  )}
                </div>

                {/* Inquiry Type */}
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-gray-700">Inquiry Type</label>
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button
                        variant="outline"
                        className="w-full h-11 justify-between px-3 text-sm border-gray-300 focus:ring-2 focus:ring-orange-500 focus:border-orange-500 rounded-lg bg-transparent"
                      >
                        {filters.inquiryType.length > 0 ? `${filters.inquiryType.length} selected` : "Select type..."}
                        <ChevronDown className="ml-2 h-4 w-4 opacity-50" />
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-[280px] p-0">
                      <Command>
                        <CommandList>
                          <CommandGroup>
                            {(dropdownData.InquiryType || []).map((type) => (
                              <CommandItem
                                key={type}
                                onSelect={() => {
                                  const newValues = filters.inquiryType.includes(type)
                                    ? filters.inquiryType.filter((v) => v !== type)
                                    : [...filters.inquiryType, type]
                                  setFilters({ ...filters, inquiryType: newValues })
                                }}
                              >
                                {type}
                                {filters.inquiryType.includes(type) && <Check className="ml-auto h-4 w-4" />}
                              </CommandItem>
                            ))}
                          </CommandGroup>
                        </CommandList>
                      </Command>
                    </PopoverContent>
                  </Popover>
                  {filters.inquiryType.length > 0 && (
                    <div className="flex flex-wrap gap-1 mt-1">
                      {filters.inquiryType.map((val) => (
                        <span
                          key={val}
                          className="inline-flex items-center gap-1 px-1.5 py-0.5 bg-violet-100 text-violet-700 rounded text-xs"
                        >
                          {val}
                          <X
                            className="h-3 w-3 cursor-pointer"
                            onClick={() =>
                              setFilters({ ...filters, inquiryType: filters.inquiryType.filter((v) => v !== val) })
                            }
                          />
                        </span>
                      ))}
                    </div>
                  )}
                </div>

                {/* 1st Owner */}
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-gray-700">1st Owner</label>
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button
                        variant="outline"
                        className="w-full h-11 justify-between px-3 text-sm border-gray-300 focus:ring-2 focus:ring-orange-500 focus:border-orange-500 rounded-lg bg-transparent"
                      >
                        {filters.firstOwner.length > 0 ? `${filters.firstOwner.length} selected` : "Select owner..."}
                        <ChevronDown className="ml-2 h-4 w-4 opacity-50" />
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-[280px] p-0">
                      <Command>
                        <CommandInput placeholder="Search owner..." className="h-9" />
                        <CommandList>
                          <CommandEmpty>No owner found.</CommandEmpty>
                          <CommandGroup>
                            {uniqueFirstOwners.map((owner) => (
                              <CommandItem
                                key={owner}
                                onSelect={() => {
                                  const newValues = filters.firstOwner.includes(owner)
                                    ? filters.firstOwner.filter((v) => v !== owner)
                                    : [...filters.firstOwner, owner]
                                  setFilters({ ...filters, firstOwner: newValues })
                                }}
                              >
                                {owner}
                                {filters.firstOwner.includes(owner) && <Check className="ml-auto h-4 w-4" />}
                              </CommandItem>
                            ))}
                          </CommandGroup>
                        </CommandList>
                      </Command>
                    </PopoverContent>
                  </Popover>
                  {filters.firstOwner.length > 0 && (
                    <div className="flex flex-wrap gap-1 mt-1">
                      {filters.firstOwner.slice(0, 3).map((val) => (
                        <span
                          key={val}
                          className="inline-flex items-center gap-1 px-1.5 py-0.5 bg-lime-100 text-lime-700 rounded text-xs"
                        >
                          {val}
                          <X
                            className="h-3 w-3 cursor-pointer"
                            onClick={() =>
                              setFilters({ ...filters, firstOwner: filters.firstOwner.filter((v) => v !== val) })
                            }
                          />
                        </span>
                      ))}
                      {filters.firstOwner.length > 3 && (
                        <span className="text-xs text-gray-500">+{filters.firstOwner.length - 3} more</span>
                      )}
                    </div>
                  )}
                </div>

                {/* Sales Person Email */}
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-gray-700">Sales Person</label>
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button
                        variant="outline"
                        className="w-full h-11 justify-between px-3 text-sm border-gray-300 focus:ring-2 focus:ring-orange-500 focus:border-orange-500 rounded-lg bg-transparent"
                      >
                        {filters.salesPersonEmail.length > 0
                          ? `${filters.salesPersonEmail.length} selected`
                          : "Select person..."}
                        <ChevronDown className="ml-2 h-4 w-4 opacity-50" />
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-[280px] p-0">
                      <Command>
                        <CommandInput placeholder="Search person..." className="h-9" />
                        <CommandList>
                          <CommandEmpty>No person found.</CommandEmpty>
                          <CommandGroup>
                            {uniqueSalesPersons.map((person) => (
                              <CommandItem
                                key={person}
                                onSelect={() => {
                                  const newValues = filters.salesPersonEmail.includes(person)
                                    ? filters.salesPersonEmail.filter((v) => v !== person)
                                    : [...filters.salesPersonEmail, person]
                                  setFilters({ ...filters, salesPersonEmail: newValues })
                                }}
                              >
                                {person}
                                {filters.salesPersonEmail.includes(person) && <Check className="ml-auto h-4 w-4" />}
                              </CommandItem>
                            ))}
                          </CommandGroup>
                        </CommandList>
                      </Command>
                    </PopoverContent>
                  </Popover>
                  {filters.salesPersonEmail.length > 0 && (
                    <div className="flex flex-wrap gap-1 mt-1">
                      {filters.salesPersonEmail.slice(0, 3).map((val) => (
                        <span
                          key={val}
                          className="inline-flex items-center gap-1 px-1.5 py-0.5 bg-sky-100 text-sky-700 rounded text-xs max-w-[120px] truncate"
                        >
                          {val}
                          <X
                            className="h-3 w-3 cursor-pointer flex-shrink-0"
                            onClick={() =>
                              setFilters({
                                ...filters,
                                salesPersonEmail: filters.salesPersonEmail.filter((v) => v !== val),
                              })
                            }
                          />
                        </span>
                      ))}
                      {filters.salesPersonEmail.length > 3 && (
                        <span className="text-xs text-gray-500">+{filters.salesPersonEmail.length - 3} more</span>
                      )}
                    </div>
                  )}
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-gray-700">Avg Profit Margin(%)</label>
                  <MultiSelectCombobox
                    values={filters.avgHeavyLifters}
                    options={uniqueAvgHeavyLifters}
                    placeholder="Select avg profit margin..."
                    onChange={(values) => setFilters({ ...filters, avgHeavyLifters: values })}
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-gray-700">Profit Margin Tags</label>
                  <MultiSelectCombobox
                    values={filters.heavyLiftersTags}
                    options={uniqueHeavyLiftersTags}
                    placeholder="Select profit margin tags..."
                    onChange={(values) => setFilters({ ...filters, heavyLiftersTags: values })}
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-gray-700">Avg Closure_Days</label>
                  <MultiSelectCombobox
                    values={filters.avgClosureDays}
                    options={uniqueAvgClosureDays}
                    placeholder="Select closure days..."
                    onChange={(values) => setFilters({ ...filters, avgClosureDays: values })}
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-gray-700">Big Bulls</label>
                  <MultiSelectCombobox
                    values={filters.bigBulls}
                    options={uniqueBigBulls}
                    placeholder="Select big bulls..."
                    onChange={(values) => setFilters({ ...filters, bigBulls: values })}
                  />
                </div>
              </div>

              {/* Date Filters */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-gray-700">Followup Date From</label>
                  <Input
                    type="date"
                    value={filters.followupDateFrom}
                    onChange={(e) => setFilters({ ...filters, followupDateFrom: e.target.value })}
                    className="h-11 px-3 text-sm border-gray-300 focus:ring-2 focus:ring-orange-500 focus:border-orange-500 rounded-lg"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-gray-700">Followup Date To</label>
                  <Input
                    type="date"
                    value={filters.followupDateTo}
                    onChange={(e) => setFilters({ ...filters, followupDateTo: e.target.value })}
                    className="h-11 px-3 text-sm border-gray-300 focus:ring-2 focus:ring-orange-500 focus:border-orange-500 rounded-lg"
                  />
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Table */}
        <div className="bg-white rounded-lg shadow-sm border overflow-hidden">
          <div className="block">
            <div className="flex-1 overflow-auto" style={{ maxHeight: "calc(100vh - 280px)" }}>
              <table className="min-w-[4160px] w-full table-fixed border-separate border-spacing-0 text-sm" style={{ tableLayout: "fixed" }}>
                <colgroup>
                  <col style={{ width: "44px" }} />
                  <col style={{ width: "92px" }} />
                  <col style={{ width: "100px" }} />
                  <col style={{ width: "220px" }} />
                  <col style={{ width: "170px" }} />
                  <col style={{ width: "13ch" }} />
                  <col style={{ width: "18ch" }} />
                  <col style={{ width: "120px" }} />
                  <col style={{ width: "256px" }} />
                  <col style={{ width: "120px" }} />
                  <col style={{ width: "140px" }} />
                <col style={{ width: "120px" }} />
                <col style={{ width: "200px" }} />
                <col style={{ width: "120px" }} />
                <col style={{ width: "130px" }} />
                <col style={{ width: "108px" }} />
                <col style={{ width: "72px" }} />
                <col style={{ width: "120px" }} />
                <col style={{ width: "100px" }} />
                <col style={{ width: "140px" }} />
                <col style={{ width: "120px" }} />
                <col style={{ width: "120px" }} />
                <col style={{ width: "120px" }} />
                <col style={{ width: "120px" }} />
                <col style={{ width: "140px" }} />
                <col style={{ width: "160px" }} />
                <col style={{ width: "160px" }} />
                <col style={{ width: "140px" }} />
                <col style={{ width: "120px" }} />
              </colgroup>
              <thead className="sticky top-0 z-10 bg-gradient-to-r from-orange-500 via-red-500 to-pink-500 text-white shadow-md">
                <tr>
                  <th className="p-2 md:p-3 border-r text-xs md:text-sm font-semibold whitespace-nowrap">
                    <Checkbox
                      checked={selectedRows.size > 0 && selectedRows.size === currentPageData.length}
                      onCheckedChange={handleSelectAll}
                      className="border-white"
                    />
                  </th>
                  <th
                    className="p-2 md:p-3 border-r text-xs md:text-sm font-semibold whitespace-nowrap cursor-pointer hover:bg-orange-600/30"
                    onClick={() => handleSortActual("inquiryNo")}
                  >
                    Inquiry No {sortConfig.key === "inquiryNo" && (sortConfig.direction === "asc" ? "↑" : "↓")}
                  </th>
                  <th
                    className="p-2 md:p-3 border-r text-xs md:text-sm font-semibold whitespace-nowrap cursor-pointer hover:bg-orange-600/30"
                    onClick={() => handleSortActual("timestamp")}
                  >
                    Timestamp {sortConfig.key === "timestamp" && (sortConfig.direction === "asc" ? "↑" : "↓")}
                  </th>
                  <th
                    className="p-2 md:p-3 border-r text-xs md:text-sm font-semibold whitespace-nowrap cursor-pointer hover:bg-orange-600/30"
                    onClick={() => handleSortActual("company")}
                  >
                    Company {sortConfig.key === "company" && (sortConfig.direction === "asc" ? "↑" : "↓")}
                  </th>
                  <th className="p-2 md:p-3 border-r text-xs md:text-sm font-semibold whitespace-nowrap">
                    Contact Name
                  </th>
                  <th className="p-2 md:p-3 border-r text-xs md:text-sm font-semibold whitespace-nowrap">Phone</th>
                  <th className="p-2 md:p-3 border-r text-xs md:text-sm font-semibold whitespace-nowrap">Email</th>
                  <th className="p-2 md:p-3 border-r text-xs md:text-sm font-semibold whitespace-nowrap">Category</th>
                  <th className="p-2 md:p-3 border-r text-xs md:text-sm font-semibold whitespace-nowrap">Details</th>
                  <th className="p-2 md:p-3 border-r text-xs md:text-sm font-semibold whitespace-nowrap">
                    Lead Source
                  </th>
                  <th
                    className="p-2 md:p-3 border-r text-xs md:text-sm font-semibold whitespace-nowrap cursor-pointer hover:bg-orange-600/30"
                    onClick={() => handleSortActual("salesPerson")}
                  >
                    Sales Person {sortConfig.key === "salesPerson" && (sortConfig.direction === "asc" ? "↑" : "↓")}
                  </th>
                  <th
                    className="p-2 md:p-3 border-r text-xs md:text-sm font-semibold whitespace-nowrap cursor-pointer hover:bg-orange-600/30"
                    onClick={() => handleSortActual("salesStage")}
                  >
                    Sales Stage {sortConfig.key === "salesStage" && (sortConfig.direction === "asc" ? "↑" : "↓")}
                  </th>
                  <th className="p-2 md:p-3 border-r text-xs md:text-sm font-semibold whitespace-nowrap">
                    Update Remarks
                  </th>
                  <th className="p-2 md:p-3 border-r text-xs md:text-sm font-semibold whitespace-nowrap">Next Steps</th>
                  <th
                    className="p-2 md:p-3 border-r text-xs md:text-sm font-semibold whitespace-nowrap cursor-pointer hover:bg-orange-600/30"
                    onClick={() => handleSortActual("nextFollowupDate")}
                  >
                    Next Followup Date{" "}
                    {sortConfig.key === "nextFollowupDate" && (sortConfig.direction === "asc" ? "↑" : "↓")}
                  </th>
                  <th className="p-2 md:p-3 border-r text-xs md:text-sm font-semibold whitespace-nowrap">Budget</th>
                  <th className="p-2 md:p-3 border-r text-xs md:text-sm font-semibold whitespace-nowrap">Quantity</th>
                  <th className="p-2 md:p-3 border-r text-xs md:text-sm font-semibold whitespace-nowrap">
                    Est Order Value
                  </th>
                  <th className="p-2 md:p-3 border-r text-xs md:text-sm font-semibold whitespace-nowrap">Occasion</th>
                  <th className="p-2 md:p-3 border-r text-xs md:text-sm font-semibold whitespace-nowrap">Location</th>
                  <th className="p-2 md:p-3 border-r text-xs md:text-sm font-semibold whitespace-nowrap">
                    Inquiry Type
                  </th>
                  <th className="p-2 md:p-3 border-r text-xs md:text-sm font-semibold whitespace-nowrap">2nd Owner</th>
                  <th className="p-2 md:p-3 border-r text-xs md:text-sm font-semibold whitespace-nowrap">
                    Back Office
                  </th>
                  <th className="p-2 md:p-3 border-r text-xs md:text-sm font-semibold whitespace-nowrap">1st Owner</th>
                  <th className="p-2 md:p-3 border-r text-xs md:text-sm font-semibold whitespace-nowrap">
                    Lead Generator
                  </th>
                  <th className="p-2 md:p-3 border-r text-xs md:text-sm font-semibold whitespace-nowrap">
                    Avg Profit Margin(%)
                  </th>
                  <th className="p-2 md:p-3 border-r text-xs md:text-sm font-semibold whitespace-nowrap">
                    Profit Margin Tags
                  </th>
                  <th className="p-2 md:p-3 border-r text-xs md:text-sm font-semibold whitespace-nowrap">
                    Avg Closure_Days
                  </th>
                  <th className="p-2 md:p-3 border-r text-xs md:text-sm font-semibold whitespace-nowrap">
                    Big Bulls
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {currentPageData.map((row) => {
                  const inquiryNo = row[0]
                  const isSelected = selectedRows.has(inquiryNo)
                  const isEditing = editingRows.has(inquiryNo)
                  const edits = editedData.get(inquiryNo) || {}

                  return (
                    <tr
                      key={inquiryNo}
                      className={`hover:bg-amber-50/30 transition-colors ${isSelected ? "bg-amber-50" : ""}`}
                    >
                      <td className={tableCellClass}>
                        <Checkbox checked={isSelected} onCheckedChange={() => handleSelectRow(inquiryNo)} />
                      </td>
                      <td className="p-2 md:p-3 border-r text-xs whitespace-nowrap font-semibold text-amber-900">
                        {row[0]}
                      </td>
                      <td className="p-2 md:p-3 border-r text-xs">
                        <span className="break-words whitespace-normal text-xs" title={row[1]}>{row[1]}</span>
                      </td>

                      {/* Company - Column 2 - EMPLOYEE can edit */}
                      <td className={tableCellClass}>
                        {isEditing && canEditColumn(2, row) ? (
                          <Input
                            value={edits[2] !== undefined ? String(edits[2]) : String(row[2] || "")}
                            onChange={(e) => updateCellValue(inquiryNo, 2, e.target.value)}
                            className={tableInputClass}
                          />
                        ) : (
                          <span className={tableTextClass} title={row[2]}>
                            {row[2]}
                          </span>
                        )}
                      </td>

                      {/* Contact Name - Column 3 - EMPLOYEE can edit */}
                      <td className={tableCellClass}>
                        {isEditing && canEditColumn(3, row) ? (
                          <Input
                            value={edits[3] !== undefined ? String(edits[3]) : String(row[3] || "")}
                            onChange={(e) => updateCellValue(inquiryNo, 3, e.target.value)}
                            className={tableInputClass}
                          />
                        ) : (
                          <span className={tableTextClass} title={row[3]}>{row[3]}</span>
                        )}
                      </td>

                      {/* Phone - Column 4 - EMPLOYEE can edit */}
                      <td className={tableCellClass}>
                        {isEditing && canEditColumn(4, row) ? (
                          <Input
                            value={edits[4] !== undefined ? String(edits[4]) : String(row[4] || "")}
                            onChange={(e) => updateCellValue(inquiryNo, 4, e.target.value)}
                            className={tableInputClass}
                          />
                        ) : (
                          <span className={tableTextClass} title={row[4]}>{row[4]}</span>
                        )}
                      </td>

                      {/* Email - Column 5 - EMPLOYEE can edit */}
                      <td className={tableCellClass}>
                        {isEditing && canEditColumn(5, row) ? (
                          <Input
                            value={edits[5] !== undefined ? String(edits[5]) : String(row[5] || "")}
                            onChange={(e) => updateCellValue(inquiryNo, 5, e.target.value)}
                            className={tableInputClass}
                          />
                        ) : (
                          <span className={tableTextClass} title={row[5]}>
                            {row[5]}
                          </span>
                        )}
                      </td>

                      {/* Category - Column 6 - EMPLOYEE can edit */}
                      <td className={tableCellClass}>
                        {isEditing && canEditColumn(6, row) ? (
                          <Select
                            value={edits[6] !== undefined ? String(edits[6]) : String(row[6] || "")}
                            onValueChange={(v) => updateCellValue(inquiryNo, 6, v)}
                          >
                            <SelectTrigger className={tableSelectTriggerClass}>
                              <SelectValue placeholder={row[6] || "Select..."} />
                            </SelectTrigger>
                            <SelectContent>
                              {(dropdownData.Category || []).map((opt) => (
                                <SelectItem key={opt} value={opt} className="text-xs">
                                  {opt}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        ) : (
                          <span className={tableTextClass} title={row[6]}>
                            {row[6]}
                          </span>
                        )}
                      </td>

                      {/* Details - Column 7 - EMPLOYEE can edit */}
                      <td className={tableCellClass}>
                        {isEditing && canEditColumn(7, row) ? (
                          <textarea
                            value={edits[7] !== undefined ? String(edits[7]) : String(row[7] || "")}
                            onChange={(e) => updateCellValue(inquiryNo, 7, e.target.value)}
                            className="h-16 w-full min-w-0 max-w-full resize-none whitespace-normal break-words rounded border px-2 py-1 text-[10px] leading-snug"
                          />
                        ) : (
                          <span className="block max-w-full break-words whitespace-normal text-[10px] leading-snug" title={row[7]}>
                            {row[7]}
                          </span>
                        )}
                      </td>

                      {/* Lead Source - Column 8 - EMPLOYEE can edit */}
                      <td className={tableCellClass}>
                        {isEditing && canEditColumn(8, row) ? (
                          <Select
                            value={edits[8] !== undefined ? String(edits[8]) : String(row[8] || "")}
                            onValueChange={(v) => updateCellValue(inquiryNo, 8, v)}
                          >
                            <SelectTrigger className={tableSelectTriggerClass}>
                              <SelectValue placeholder={row[8] || "Select..."} />
                            </SelectTrigger>
                            <SelectContent>
                              {(dropdownData.LeadSource || []).map((opt) => (
                                <SelectItem key={opt} value={opt} className="text-xs">
                                  {opt}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        ) : (
                          <span className={tableTextClass} title={row[8]}>
                            {row[8]}
                          </span>
                        )}
                      </td>

                      {/* Sales Person - Column 9 - BOSS can edit via dropdown */}
                      <td className={tableCellClass}>
                        {isEditing && userRole === "BOSS" ? (
                          <Select
                            value={edits[9] !== undefined ? String(edits[9]) : String(row[9] || "")}
                            onValueChange={(v) => updateCellValue(inquiryNo, 9, v)}
                          >
                            <SelectTrigger className={tableSelectTriggerClass}>
                              <SelectValue placeholder={row[9] || "Select..."} />
                            </SelectTrigger>
                            <SelectContent>
                              {(dropdownData.SalesPerson || []).map((opt) => (
                                <SelectItem key={opt} value={opt} className="text-xs">
                                  {opt}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        ) : (
                          <span className={tableTextClass} title={row[9]}>{row[9]}</span>
                        )}
                      </td>

                      {/* Sales Stage - Column 10 - EMPLOYEE can edit */}
                      <td className={tableCellClass}>
                        {isEditing && canEditColumn(10, row) ? (
                          <Select
                            value={edits[10] !== undefined ? String(edits[10]) : String(row[10] || "")}
                            onValueChange={(v) => updateCellValue(inquiryNo, 10, v)}
                          >
                            <SelectTrigger className={tableSelectTriggerClass}>
                              <SelectValue placeholder={row[10] || "Select..."} />
                            </SelectTrigger>
                            <SelectContent>
                              {(dropdownData.SalesStage || []).map((opt) => (
                                <SelectItem key={opt} value={opt} className="text-xs">
                                  {opt}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        ) : (
                          <span className={tableTextClass} title={row[10]}>{row[10]}</span>
                        )}
                      </td>

                      {/* Update Remarks - Column 11 - EMPLOYEE can edit */}
                      <td className={tableCellClass}>
                        {isEditing && canEditColumn(11, row) ? (
                          <textarea
                            value={edits[11] !== undefined ? String(edits[11]) : String(row[11] || "")}
                            onChange={(e) => updateCellValue(inquiryNo, 11, e.target.value)}
                            className="h-16 w-full min-w-0 max-w-full resize-none whitespace-normal break-words rounded border px-2 py-1 text-[10px] leading-snug"
                          />
                        ) : (
                          <span className="block max-w-full break-words whitespace-normal text-[10px] leading-snug" title={row[11]}>
                            {row[11]}
                          </span>
                        )}
                      </td>

                      {/* Next Steps - Column 12 - EMPLOYEE can edit */}
                      <td className={tableCellClass}>
                        {isEditing && canEditColumn(12, row) ? (
                          <Select
                            value={edits[12] !== undefined ? String(edits[12]) : String(row[12] || "")}
                            onValueChange={(v) => updateCellValue(inquiryNo, 12, v)}
                          >
                            <SelectTrigger className={tableSelectTriggerClass}>
                              <SelectValue placeholder={row[12] || "Select..."} />
                            </SelectTrigger>
                            <SelectContent>
                              {(dropdownData.NextSteps || []).map((opt) => (
                                <SelectItem key={opt} value={opt} className="text-xs">
                                  {opt}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        ) : (
                          <span className={tableTextClass} title={row[12]}>{row[12]}</span>
                        )}
                      </td>

                      <td className="p-2 md:p-3 border-r">
                        {isEditing && canEditColumn(13, row) ? (
                          <Input
                            type="date"
                            value={edits[13] !== undefined ? String(edits[13]) : String(row[13] || "")}
                            onChange={(e) => updateCellValue(inquiryNo, 13, e.target.value)}
                            className={tableInputClass}
                          />
                        ) : (
                          <span className={tableTextClass} title={row[13]}>{row[13]}</span>
                        )}
                      </td>

                      <td className={tableCellClass}>
                        {isEditing && canEditColumn(14, row) ? (
                          <Input
                            value={edits[14] !== undefined ? String(edits[14]) : String(row[14] || "")}
                            onChange={(e) => updateCellValue(inquiryNo, 14, e.target.value)}
                            className={tableInputClass}
                          />
                        ) : (
                          <span className={tableTextClass} title={row[14]}>{row[14]}</span>
                        )}
                      </td>

                      <td className={tableCellClass}>
                        {isEditing && canEditColumn(15, row) ? (
                          <Input
                            value={edits[15] !== undefined ? String(edits[15]) : String(row[15] || "")}
                            onChange={(e) => updateCellValue(inquiryNo, 15, e.target.value)}
                            className={tableInputClass}
                          />
                        ) : (
                          <span className={tableTextClass} title={row[15]}>{row[15]}</span>
                        )}
                      </td>

                      <td className={tableCellClass}>
                        <span className="block max-w-full break-words whitespace-normal text-[11px] font-semibold leading-snug" title={row[16]}>₹{formatINR(row[16])}</span>
                      </td>

                      <td className={tableCellClass}>
                        <span className="block max-w-full break-words whitespace-normal text-[11px] leading-snug" title={row[27]}>
                          {row[27]}
                        </span>
                      </td>

                      {/* Location - Column 28 - NOT editable by EMPLOYEE */}
                      <td className={tableCellClass}>
                        <span className={tableTextClass} title={row[28]}>{row[28]}</span>
                      </td>

                      {/* Inquiry Type - Column 29 - Only BOSS can edit */}
                      <td className={tableCellClass}>
                        {isEditing && canEditColumn(29, row) ? (
                          <Select
                            value={edits[29] !== undefined ? String(edits[29]) : String(row[29] || "")}
                            onValueChange={(v) => updateCellValue(inquiryNo, 29, v)}
                          >
                            <SelectTrigger className={tableSelectTriggerClass}>
                              <SelectValue placeholder={row[29] || "Select..."} />
                            </SelectTrigger>
                            <SelectContent>
                              {(dropdownData.InquiryType || []).map((opt) => (
                                <SelectItem key={opt} value={opt} className="text-xs">
                                  {opt}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        ) : (
                          <span className={tableTextClass} title={row[29]}>{row[29]}</span>
                        )}
                      </td>

                      {/* 2nd Owner - Column 30 - Only BOSS/HEAD can edit */}
                      <td className={tableCellClass}>
                        {isEditing && canEditColumn(30, row) ? (
                          <Select
                            value={edits[30] !== undefined ? String(edits[30]) : String(row[30] || "")}
                            onValueChange={(v) => updateCellValue(inquiryNo, 30, v)}
                          >
                            <SelectTrigger className={tableSelectTriggerClass}>
                              <SelectValue placeholder={row[30] || "Select..."} />
                            </SelectTrigger>
                            <SelectContent>
                              {(dropdownData.SecondOwner || []).map((opt) => (
                                <SelectItem key={opt} value={opt} className="text-xs">
                                  {opt}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        ) : (
                          <span className={tableTextClass} title={row[30]}>{row[30]}</span>
                        )}
                      </td>

                      {/* Back Office - Column 31 - Only BOSS/HEAD can edit */}
                      <td className={tableCellClass}>
                        {isEditing && canEditColumn(31, row) ? (
                          <Select
                            value={edits[31] !== undefined ? String(edits[31]) : String(row[31] || "")}
                            onValueChange={(v) => updateCellValue(inquiryNo, 31, v)}
                          >
                            <SelectTrigger className={tableSelectTriggerClass}>
                              <SelectValue placeholder={row[31] || "Select..."} />
                            </SelectTrigger>
                            <SelectContent>
                              {(dropdownData.BackOffice || []).map((opt) => (
                                <SelectItem key={opt} value={opt} className="text-xs">
                                  {opt}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        ) : (
                          <span className={tableTextClass} title={row[31]}>{row[31]}</span>
                        )}
                      </td>

                      {/* 1st Owner - Column 32 - Only BOSS/HEAD can edit */}
                      <td className={tableCellClass}>
                        {isEditing && canEditColumn(32, row) ? (
                          <Select
                            value={edits[32] !== undefined ? String(edits[32]) : String(row[32] || "")}
                            onValueChange={(v) => updateCellValue(inquiryNo, 32, v)}
                          >
                            <SelectTrigger className={tableSelectTriggerClass}>
                              <SelectValue placeholder={row[32] || "Select..."} />
                            </SelectTrigger>
                            <SelectContent>
                              {(dropdownData.FirstOwner || []).map((opt) => (
                                <SelectItem key={opt} value={opt} className="text-xs">
                                  {opt}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        ) : (
                          <span className={tableTextClass} title={row[32]}>{row[32]}</span>
                        )}
                      </td>

                      {/* Lead Generator - Column 33 - BOSS/HEAD only */}
                      <td className={tableCellClass}>
                        {isEditing && canEditColumn(33, row) ? (
                          <Select
                            value={edits[33] !== undefined ? String(edits[33]) : String(row[33] || "")}
                            onValueChange={(v) => updateCellValue(inquiryNo, 33, v)}
                          >
                            <SelectTrigger className={tableSelectTriggerClass}>
                              <SelectValue placeholder={row[33] || "Select..."} />
                            </SelectTrigger>
                            <SelectContent>
                              {(dropdownData.LeadGenerator || []).map((opt) => (
                                <SelectItem key={opt} value={opt} className="text-xs">
                                  {opt}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        ) : (
                          <span className={tableTextClass} title={row[33]}>{row[33]}</span>
                        )}
                      </td>

                      <td className={tableCellClass}>
                        <span className={tableTextClass} title={row[42]}>{row[42]}</span>
                      </td>
                      <td className={tableCellClass}>
                        <span className={tableTextClass} title={row[43]}>{row[43]}</span>
                      </td>
                      <td className={tableCellClass}>
                        <span className={tableTextClass} title={row[44]}>{row[44]}</span>
                      </td>
                      <td className={tableCellClass}>
                        <span className={tableTextClass} title={row[45]}>{row[45]}</span>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>

          {totalPages > 1 && (
            <div className="flex items-center justify-between p-3 md:p-4 border-t bg-gray-50">
              <div className="text-xs md:text-sm text-gray-600">
                Page {currentPage} of {totalPages} ({filteredRowCount} total)
              </div>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => loadInquiryPage(Math.max(1, currentPage - 1))}
                  disabled={currentPage === 1 || isRefreshing}
                  className="h-8 text-xs md:text-sm"
                >
                  <ChevronLeft className="h-3 w-3 md:h-4 md:w-4" />
                  Prev
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => loadInquiryPage(Math.min(totalPages, currentPage + 1))}
                  disabled={currentPage === totalPages || isRefreshing}
                  className="h-8 text-xs md:text-sm"
                >
                  Next
                  <ChevronRight className="h-3 w-3 md:h-4 md:w-4" />
                </Button>
              </div>
            </div>
          )}
        </div>
      </div>

      <Dialog open={showWhatsAppDialog} onOpenChange={setShowWhatsAppDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Send WhatsApp to {selectedRows.size} Contact(s)</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">From (User Email):</label>
              <Input value={userEmail} readOnly className="bg-gray-50" />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Message Body:</label>
              <Textarea
                value={whatsappMessage}
                onChange={(e) => setWhatsappMessage(e.target.value)}
                placeholder="Enter your WhatsApp message..."
                rows={6}
                className="resize-none"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowWhatsAppDialog(false)} disabled={isLoading}>
              Cancel
            </Button>
            <Button
              onClick={submitWhatsAppLog}
              disabled={isLoading}
              className="bg-green-600 hover:bg-green-700 text-white"
            >
              {isLoading ? "Sending..." : `Send to ${selectedRows.size} Contact(s)`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showEmailDialog} onOpenChange={setShowEmailDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Send Email to {selectedRows.size} Contact(s)</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">From (User Email):</label>
              <Input value={userEmail} readOnly className="bg-gray-50" />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Subject:</label>
              <Input
                value={emailSubject}
                onChange={(e) => setEmailSubject(e.target.value)}
                placeholder="Enter email subject..."
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Body:</label>
              <Textarea
                value={emailBody}
                onChange={(e) => setEmailBody(e.target.value)}
                placeholder="Enter email body..."
                rows={6}
                className="resize-none"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowEmailDialog(false)} disabled={isLoading}>
              Cancel
            </Button>
            <Button onClick={submitEmailLog} disabled={isLoading} className="bg-blue-600 hover:bg-blue-700 text-white">
              {isLoading ? "Sending..." : `Send to ${selectedRows.size} Contact(s)`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showDeleteConfirm} onOpenChange={setShowDeleteConfirm}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-red-600">Delete Inquiries</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <p className="text-sm text-gray-700">
              Are you sure you want to delete {deletingInquiries.size} inquiry(ies)? They will be hidden from active inquiry views.
            </p>
            <div className="bg-red-50 border border-red-200 rounded p-3">
              <p className="text-xs font-medium text-red-800">Selected Inquiry Numbers:</p>
              <p className="text-xs text-red-700 mt-2">{Array.from(deletingInquiries).join(", ")}</p>
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setShowDeleteConfirm(false)
                setDeletingInquiries(new Set())
              }}
              disabled={isLoading}
            >
              Cancel
            </Button>
            <Button
              onClick={confirmDelete}
              disabled={isLoading}
              className="bg-red-600 hover:bg-red-700 text-white"
            >
              {isLoading ? "Deleting..." : "Delete Permanently"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  </div>
  )
}
