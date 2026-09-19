"use client"

import type React from "react"
import { useState, useEffect, useRef } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { toast } from "react-toastify"
import { SoftLoader } from "@/components/route-change-loader"

const STATUS_POLL_INTERVAL_MS = 2_000
const STATUS_POLL_MAX_DURATION_MS = 90_000
const COMPANY_LOOKUP_DEBOUNCE_MS = 300
const COMPANY_NOT_FOUND_MESSAGE = "Company not found. Fill the same fields and it will be saved on submit."
const COMPANY_NO_CONTACTS_MESSAGE = "No contacts found for this company. Type a contact and it will be saved on submit."

type ClientLookupRow = {
  company_id: number | string
  company_name: string
  contact_id: number | string | null
  category_id?: number | string | null
  contact_person_name: string | null
  phone: string | null
  email: string | null
  category: string | null
  location: string | null
}

type CompanySuggestion = {
  company_id: number | string
  company_name: string
}

type ClientLookupResponse<T> = {
  success: boolean
  data?: T[]
  message?: string
}

type ClientEnsureResponse = {
  success: boolean
  message?: string
  data?: ClientLookupRow
}

type InquirySubmissionResult = {
  requestId: string
  inquiryNo: string
  company: string
  contactName: string
  salesPersonEmail: string
  created?: boolean
  idempotent?: boolean
}

function allowsManualClientEntry(message: string) {
  return (
    message === COMPANY_NOT_FOUND_MESSAGE ||
    message === COMPANY_NO_CONTACTS_MESSAGE
  )
}

export default function InquiryForm({ userEmail }: { userEmail: string }) {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [confirming, setConfirming] = useState(false)
  const [submitError, setSubmitError] = useState("")
  const [confirmationTimedOut, setConfirmationTimedOut] = useState(false)
  const [successResult, setSuccessResult] = useState<InquirySubmissionResult | null>(null)
  const submissionRef = useRef<{ requestId: string; payload: Record<string, unknown> } | null>(null)
  const redirectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const clientLookupRequestRef = useRef(0)
  const [dropdownData, setDropdownData] = useState<Record<string, string[]>>({})
  const [dropdownError, setDropdownError] = useState("")
  const [companyContacts, setCompanyContacts] = useState<ClientLookupRow[]>([])
  const [selectedCompanyId, setSelectedCompanyId] = useState<number | string | null>(null)
  const [selectedContactId, setSelectedContactId] = useState<string>("")
  const [selectedCategoryId, setSelectedCategoryId] = useState<number | string | null>(null)
  const [contactsLoading, setContactsLoading] = useState(false)
  const [companyLookupError, setCompanyLookupError] = useState("")
  const [companyOpen, setCompanyOpen] = useState(false)
  const [filteredCompanies, setFilteredCompanies] = useState<CompanySuggestion[]>([])
  const [contactOpen, setContactOpen] = useState(false)
  const [contactSearch, setContactSearch] = useState("")
  const [formData, setFormData] = useState({
    company: "",
    contactName: "",
    phone: "",
    email: "",
    category: "",
    details: "",
    leadSource: "",
    salesPersonEmail: userEmail,
    salesStage: "",
    updateRemarks: "",
    nextSteps: "",
    nextFollowupDate: "",
    budget: "",
    quantity: "",
    occasion: "",
    location: "",
    inquiryType: "",
    secondOwner: "",
    backOffice: "",
    firstOwner: "",
    leadGenerator: "",
  })

  useEffect(() => {
    fetchDropdownData()
    return () => {
      if (redirectTimerRef.current) clearTimeout(redirectTimerRef.current)
    }
  }, [])

  const fetchDropdownData = async () => {
    try {
      const res = await fetch("/api/dropdown-data", {
        cache: "no-store",
        credentials: "same-origin",
      })
      const data = await res.json()
      if (data.success) {
        setDropdownData(data.data)
        setDropdownError("")
      } else {
        setDropdownError(data.message || "Dropdown data could not be loaded.")
      }
    } catch (error) {
      console.error("Error fetching dropdown data:", error)
      setDropdownError("Dropdown data could not be loaded. Please refresh or sign in again.")
    }
  }

  const normalizeSubmissionPayload = () => ({
    company_id: selectedCompanyId,
    contact_id: selectedContactId || "",
    category_id: selectedCategoryId || "",
    company: formData.company.trim(),
    contactName: formData.contactName.trim(),
    phone: formData.phone.trim(),
    email: formData.email.trim(),
    category: formData.category.trim(),
    details: formData.details.trim(),
    leadSource: formData.leadSource.trim(),
    salesStage: formData.salesStage.trim(),
    updateRemarks: formData.updateRemarks.trim(),
    nextSteps: formData.nextSteps.trim(),
    nextFollowupDate: formData.nextFollowupDate.trim(),
    budget: formData.budget === "" ? "" : Number(formData.budget),
    quantity: formData.quantity === "" ? "" : Number(formData.quantity),
    occasion: formData.occasion.trim(),
    location: formData.location.trim(),
    inquiryType: formData.inquiryType.trim(),
    secondOwner: formData.secondOwner.trim(),
    backOffice: formData.backOffice.trim(),
    firstOwner: formData.firstOwner.trim(),
    leadGenerator: formData.leadGenerator.trim(),
  })

  const ensureClientBeforeSubmit = async () => {
    if (selectedCompanyId && selectedContactId) {
      return {
        company_id: selectedCompanyId,
        contact_id: selectedContactId,
        category_id: selectedCategoryId || "",
      }
    }

    const res = await fetch("/api/clients/ensure", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "same-origin",
      body: JSON.stringify({
        company: formData.company.trim(),
        contactName: formData.contactName.trim(),
        phone: formData.phone.trim(),
        email: formData.email.trim(),
        category: formData.category.trim(),
        location: formData.location.trim(),
      }),
    })
    const result = (await res.json()) as ClientEnsureResponse

    if (!res.ok || !result.success || !result.data) {
      throw new Error(result.message || "Unable to save client before creating inquiry.")
    }

    const client = result.data
    const nextCompanyId = client.company_id
    const nextContactId = String(client.contact_id || "")
    setSelectedCompanyId(nextCompanyId)
    setSelectedContactId(nextContactId)
    setSelectedCategoryId(client.category_id || null)
    setCompanyContacts([client])
    setCompanyLookupError("")
    setFormData((prev) => ({
      ...prev,
      company: client.company_name || prev.company,
      contactName: client.contact_person_name || prev.contactName,
      phone: client.phone || prev.phone,
      email: client.email || prev.email,
      category: client.category || prev.category,
      location: client.location || prev.location,
    }))

    return {
      company_id: nextCompanyId,
      contact_id: nextContactId,
      category_id: client.category_id || "",
    }
  }

  const clearSelectedClient = () => {
    setSelectedCompanyId(null)
    setSelectedContactId("")
    setSelectedCategoryId(null)
    setCompanyContacts([])
    setContactSearch("")
    setCompanyLookupError("")
    setFormData((prev) => ({
      ...prev,
      contactName: "",
      phone: "",
      email: "",
      category: "",
      location: "",
    }))
  }

  const fetchCompanySuggestions = async (companyName: string) => {
    const search = companyName.trim()
    if (!search) {
      setFilteredCompanies([])
      return
    }

    let result: ClientLookupResponse<CompanySuggestion>
    let res: Response
    try {
      res = await fetch(`/api/client-lookup?mode=suggestions&company=${encodeURIComponent(search)}`, {
        cache: "no-store",
        credentials: "same-origin",
      })
      result = (await res.json()) as ClientLookupResponse<CompanySuggestion>
    } catch (error) {
      console.warn("Company search failed:", error instanceof Error ? error.message : String(error))
      setFilteredCompanies([])
      return
    }

    if (!res.ok || !result.success) {
      console.warn("Company search failed:", result.message || res.statusText)
      setFilteredCompanies([])
      return
    }

    const unique = new Map<string, CompanySuggestion>()
    for (const row of result.data || []) {
      if (row.company_id && row.company_name) {
        unique.set(String(row.company_id), {
          company_id: row.company_id as number | string,
          company_name: String(row.company_name),
        })
      }
    }

    setFilteredCompanies([...unique.values()].sort((left, right) => left.company_name.localeCompare(right.company_name)))
  }

  const fetchCompanyContacts = async (companyName: string) => {
    const normalizedCompanyName = companyName.trim()
    if (!normalizedCompanyName) {
      clearSelectedClient()
      return
    }

    const requestToken = clientLookupRequestRef.current + 1
    clientLookupRequestRef.current = requestToken
    setContactsLoading(true)
    setCompanyLookupError("")

    try {
      const res = await fetch(`/api/client-lookup?mode=contacts&company=${encodeURIComponent(normalizedCompanyName)}`, {
        cache: "no-store",
        credentials: "same-origin",
      })
      const result = (await res.json()) as ClientLookupResponse<ClientLookupRow>

      if (!res.ok || !result.success) {
        throw new Error(result.message || "Unable to load contacts for this company.")
      }

      if (requestToken !== clientLookupRequestRef.current) return

      const rows = result.data || []
      if (rows.length === 0) {
        setSelectedCompanyId(null)
        setSelectedContactId("")
        setSelectedCategoryId(null)
        setCompanyContacts([])
        setContactSearch("")
        setCompanyLookupError(COMPANY_NOT_FOUND_MESSAGE)
        return
      }

      const contactsById = new Map<string, ClientLookupRow>()
      for (const row of rows) {
        if (row.contact_id == null) continue

        const contactKey = String(row.contact_id)
        const existing = contactsById.get(contactKey)
        if (!existing) {
          contactsById.set(contactKey, row)
          continue
        }

        const categories = new Set(
          [existing.category, row.category]
            .flatMap((value) => String(value || "").split(","))
            .map((value) => value.trim())
            .filter(Boolean),
        )

        contactsById.set(contactKey, {
          ...existing,
          category: [...categories].join(", "),
          phone: existing.phone || row.phone,
          email: existing.email || row.email,
          location: existing.location || row.location,
        })
      }

      setSelectedCompanyId(rows[0].company_id)
      setSelectedCategoryId(rows.find((row) => row.category_id)?.category_id || null)
      const contacts = [...contactsById.values()]
      setCompanyContacts(contacts)
      if (contacts.length === 0) {
        setSelectedContactId("")
        setContactSearch("")
        setCompanyLookupError(COMPANY_NO_CONTACTS_MESSAGE)
      }
      setFormData((prev) => ({
        ...prev,
        company: rows[0].company_name || normalizedCompanyName,
      }))
    } catch (error) {
      if (requestToken !== clientLookupRequestRef.current) return
      console.warn("Client lookup failed:", error instanceof Error ? error.message : String(error))
      setSelectedCompanyId(null)
      setSelectedContactId("")
      setSelectedCategoryId(null)
      setCompanyContacts([])
      setContactSearch("")
      setCompanyLookupError("Unable to load contacts for this company.")
    } finally {
      if (requestToken === clientLookupRequestRef.current) setContactsLoading(false)
    }
  }

  const showSuccess = (result: InquirySubmissionResult) => {
    setSuccessResult(result)
    setConfirming(false)
    setLoading(true)
    toast.success(`Inquiry #${result.inquiryNo} submitted successfully!`, { autoClose: 2500 })
    redirectTimerRef.current = setTimeout(() => {
      router.push("/dashboard")
    }, 3000)
  }

  const pollCreateStatus = async (requestId: string) => {
    setConfirming(true)
    setLoading(true)
    setConfirmationTimedOut(false)
    setSubmitError("Submission received. Confirming Inquiry Number...")
    const startedAt = Date.now()

    while (Date.now() - startedAt < STATUS_POLL_MAX_DURATION_MS) {
      await new Promise((resolve) => setTimeout(resolve, STATUS_POLL_INTERVAL_MS))

      try {
        const res = await fetch(`/api/inquiries/create-status?requestId=${encodeURIComponent(requestId)}`, { cache: "no-store" })
        const data = await res.json()

        if (data.success && data.status === "SUCCESS" && data.inquiryNo) {
          showSuccess({
            requestId,
            inquiryNo: data.inquiryNo,
            company: data.company || String(submissionRef.current?.payload.company || ""),
            contactName: data.contactName || String(submissionRef.current?.payload.contactName || ""),
            salesPersonEmail: userEmail,
          })
          return
        }

        if (data.status === "FAILED" && data.errorCode === "KOROSUNO_UNCERTAIN_RESPONSE") {
          setSubmitError("Submission may already be recorded. Checking the original request...")
          continue
        }

        if (data.status === "FAILED") {
          setConfirming(false)
          setLoading(false)
          setSubmitError(data.message || "Inquiry submission failed. Please correct and submit again.")
          setConfirmationTimedOut(false)
          if (data.errorCode === "VALIDATION_FAILED") {
            submissionRef.current = null
          }
          return
        }
      } catch {
        // The original request may still be finishing, so keep polling with the same requestId.
      }
    }

    setConfirming(false)
    setLoading(true)
    setConfirmationTimedOut(true)
    setSubmitError("Your submission may already be recorded. Please check with your administrator before submitting again.")
  }

  const checkAgain = async () => {
    const requestId = submissionRef.current?.requestId
    if (!requestId || successResult) return
    await pollCreateStatus(requestId)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (loading || confirming || successResult) return
    setLoading(true)
    setSubmitError("")

    if (!submissionRef.current) {
      let clientIds: { company_id: number | string | null; contact_id: string; category_id: number | string | null }
      try {
        clientIds = await ensureClientBeforeSubmit()
      } catch (error) {
        const message = error instanceof Error ? error.message : "Unable to save client before creating inquiry."
        setSubmitError(message)
        toast.error(message)
        setLoading(false)
        return
      }

      submissionRef.current = {
        requestId: crypto.randomUUID(),
        payload: {
          ...normalizeSubmissionPayload(),
          ...clientIds,
        },
      }
    }

    const submission = submissionRef.current

    try {
      const res = await fetch("/api/inquiries/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...submission.payload, requestId: submission.requestId }),
      })

      const data = await res.json()

      if (data.success) {
        showSuccess({
          requestId: data.requestId || submission.requestId,
          inquiryNo: data.inquiryNo,
          company: data.company || String(submission.payload.company || ""),
          contactName: data.contactName || String(submission.payload.contactName || ""),
          salesPersonEmail: data.salesPersonEmail || userEmail,
          created: data.created,
          idempotent: data.idempotent,
        })
      } else if (res.status >= 400 && res.status < 500 && data.errorCode !== "KOROSUNO_CREATE_FAILED") {
        setSubmitError(data.message || "Please correct the inquiry details.")
        toast.error(data.message || "Please correct the inquiry details.")
        submissionRef.current = null
        setLoading(false)
      } else {
        await pollCreateStatus(submission.requestId)
      }
    } catch {
      await pollCreateStatus(submission.requestId)
    }
  }

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    const { name, value } = e.target

    // Auto-uppercase for specific text fields
    const uppercaseFields = ["details", "updateRemarks"]
    let processedValue = value

    if (uppercaseFields.includes(name)) {
      processedValue = value.toUpperCase()
    }

    // Limit phone number to 10 digits only
    if (name === "phone") {
      processedValue = value.replace(/\D/g, "").slice(0, 10)
    }

    if (name === "category") {
      setSelectedCategoryId(null)
    }

    // Handle company field with filtering
    if (name === "company") {
      processedValue = value.toUpperCase()
      setSelectedCompanyId(null)
      setSelectedContactId("")
      setSelectedCategoryId(null)
      setCompanyContacts([])
      setContactSearch("")
      setCompanyLookupError("")
      setFilteredCompanies([])
      setCompanyOpen(true)
      // Reset selected client fields when company changes.
      setFormData(prev => ({
        ...prev,
        company: processedValue,
        contactName: "",
        phone: "",
        email: "",
        category: "",
        location: "",
      }))
      return
    }

    setFormData({ ...formData, [name]: processedValue })
  }

  useEffect(() => {
    const companyName = formData.company.trim()
    if (!companyName) {
      setFilteredCompanies([])
      return
    }

    const timer = setTimeout(() => {
      fetchCompanySuggestions(companyName)
    }, COMPANY_LOOKUP_DEBOUNCE_MS)

    return () => clearTimeout(timer)
  }, [formData.company])

  const handleCompanySelect = (company: CompanySuggestion) => {
    setFormData({ ...formData, company: company.company_name.toUpperCase(), contactName: "", phone: "", email: "", category: "", location: "" })
    setSelectedCompanyId(company.company_id)
    setSelectedContactId("")
    setSelectedCategoryId(null)
    setCompanyContacts([])
    setContactSearch("")
    setCompanyLookupError("")
    setCompanyOpen(false)
    fetchCompanyContacts(company.company_name)
  }

  const handleContactSelect = (contactId: string) => {
    const selectedContact = companyContacts.find((contact) => String(contact.contact_id) === contactId)

    if (selectedContact) {
      setSelectedContactId(contactId)
      setSelectedCategoryId(selectedContact.category_id || null)
      setFormData({
        ...formData,
        contactName: selectedContact.contact_person_name || "",
        phone: selectedContact.phone || "",
        email: selectedContact.email || "",
        category: selectedContact.category || "",
        location: selectedContact.location || "",
      })
    }
    setContactOpen(false)
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-500 via-purple-500 to-pink-500">
      {/* Full-page loading overlay */}
      {(loading || confirming) && !confirmationTimedOut && !successResult && (
        <SoftLoader
          label={confirming || confirmationTimedOut ? "Submission received. Confirming Inquiry Number..." : "Creating inquiry..."}
          detail={confirming || confirmationTimedOut ? "Checking the original request. Please keep this tab open." : "Saving to Supabase. Please keep this tab open."}
        />
      )}
      {confirmationTimedOut && !successResult && (
        <div className="fixed inset-0 z-[120] grid place-items-center bg-black/55 px-4">
          <div className="w-full max-w-md rounded-2xl bg-white p-7 text-center shadow-2xl">
            <h3 className="text-xl font-bold text-gray-900">Submission received</h3>
            <p className="mt-4 text-sm font-medium text-gray-700">
              Your submission may already be recorded. Please check with your administrator before submitting again.
            </p>
            <button
              type="button"
              onClick={checkAgain}
              className="mt-6 w-full rounded-lg bg-blue-700 px-4 py-3 font-semibold text-white transition-colors hover:bg-blue-800"
            >
              Check Again
            </button>
          </div>
        </div>
      )}
      {successResult && (
        <div className="fixed inset-0 z-[120] grid place-items-center bg-black/50 px-4">
          <div className="w-full max-w-md rounded-2xl bg-white p-7 text-center shadow-2xl">
            <h3 className="text-2xl font-bold text-gray-900">Inquiry Submitted</h3>
            <div className="mt-5 space-y-2 text-left text-sm text-gray-700">
              <p><span className="font-semibold text-gray-900">Inquiry No:</span> #{successResult.inquiryNo}</p>
              <p><span className="font-semibold text-gray-900">Company:</span> {successResult.company}</p>
              <p><span className="font-semibold text-gray-900">Contact:</span> {successResult.contactName}</p>
              <p><span className="font-semibold text-gray-900">Submitted By:</span> {successResult.salesPersonEmail}</p>
            </div>
            <button
              type="button"
              onClick={() => router.push("/dashboard")}
              className="mt-6 w-full rounded-lg bg-blue-700 px-4 py-3 font-semibold text-white transition-colors hover:bg-blue-800"
            >
              Go to Dashboard
            </button>
          </div>
        </div>
      )}
      <nav className="bg-white/10 backdrop-blur-md text-white p-4 shadow-lg">
        <div className="max-w-7xl mx-auto flex justify-between items-center">
          <div className="flex items-center gap-4">
            <Link href="/dashboard" className="text-2xl font-bold hover:opacity-80">
              CRM
            </Link>
            <span className="text-sm opacity-75">/ New Inquiry</span>
          </div>
          <span className="text-sm">{userEmail}</span>
        </div>
      </nav>

      <div className="max-w-4xl mx-auto p-8">
        <div className="bg-white/95 backdrop-blur-md rounded-lg shadow-2xl p-8">
          <h2 className="text-3xl font-bold text-gray-800 mb-6 text-center">Create New Inquiry</h2>

          <form onSubmit={handleSubmit} className="space-y-6">
            {dropdownError && (
              <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-800">
                {dropdownError}
              </div>
            )}
            {submitError && (
              <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-medium text-amber-900">
                {submitError}
                {confirmationTimedOut && (
                  <button
                    type="button"
                    onClick={checkAgain}
                    className="mt-3 block rounded-lg bg-amber-900 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-amber-950"
                  >
                    Check Again
                  </button>
                )}
              </div>
            )}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Company <span className="text-red-500">*</span>
                </label>
                <div className="relative">
                  <input
                    type="text"
                    name="company"
                    value={formData.company}
                    onChange={handleChange}
                    onFocus={() => {
                      if (formData.company) fetchCompanySuggestions(formData.company)
                      setCompanyOpen(true)
                    }}
                    onBlur={() => {
                      setTimeout(() => setCompanyOpen(false), 200)
                      fetchCompanyContacts(formData.company)
                    }}
                    required
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    placeholder="Type company name..."
                    autoComplete="off"
                  />
                  {companyOpen && filteredCompanies.length > 0 && (
                    <div className="absolute z-10 w-full bg-white border border-gray-300 rounded-lg shadow-lg mt-1 max-h-48 overflow-y-auto">
                      {filteredCompanies.map((company) => (
                        <div
                          key={company.company_id}
                          onClick={() => handleCompanySelect(company)}
                          className="px-4 py-2 hover:bg-blue-100 cursor-pointer text-gray-700 hover:text-gray-900 transition-colors"
                        >
                          {company.company_name}
                        </div>
                      ))}
                    </div>
                  )}
                  {companyLookupError && (
                    <p className="mt-1 text-xs font-medium text-amber-700">{companyLookupError}</p>
                  )}
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Contact Name <span className="text-red-500">*</span>
                </label>
                <div className="relative">
                  <input
                    type="text"
                    name="contactName"
                    value={formData.contactName}
                    onChange={(e) => {
                      const value = e.target.value
                      setContactSearch(value)
                      setSelectedContactId("")
                      setSelectedCategoryId(null)
                      setFormData((prev) => ({
                        ...prev,
                        contactName: value.toUpperCase(),
                        phone: "",
                        email: "",
                        category: "",
                        location: "",
                      }))
                      setContactOpen(true)
                    }}
                    onFocus={() => {
                      if (
                        formData.company &&
                        companyContacts.length === 0 &&
                        !contactsLoading &&
                        !allowsManualClientEntry(companyLookupError)
                      ) {
                        fetchCompanyContacts(formData.company)
                      }
                      setContactOpen(true)
                    }}
                    onBlur={() => setTimeout(() => setContactOpen(false), 200)}
                    required
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    placeholder={
                      contactsLoading && !allowsManualClientEntry(companyLookupError)
                        ? "Loading contacts..."
                        : formData.company
                          ? "Select or type contact..."
                          : "Select company first"
                    }
                    autoComplete="off"
                    disabled={!formData.company || (contactsLoading && !allowsManualClientEntry(companyLookupError))}
                  />
                  {contactOpen && companyContacts.length > 0 && formData.company && (
                    <div className="absolute z-10 w-full bg-white border border-gray-300 rounded-lg shadow-lg mt-1 overflow-hidden">
                      {/* Search input in dropdown */}
                      <div className="p-2 border-b border-gray-200 sticky top-0 bg-gray-50">
                        <input
                          type="text"
                          placeholder="Search contacts..."
                          value={contactSearch}
                          onChange={(e) => setContactSearch(e.target.value)}
                          className="w-full px-3 py-2 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                          onClick={(e) => e.stopPropagation()}
                          autoComplete="off"
                        />
                      </div>
                      {/* Filtered results */}
                      <div className="max-h-48 overflow-y-auto">
                        {companyContacts
                          .filter((contact) =>
                            (contact.contact_person_name || "").toUpperCase().includes(contactSearch.toUpperCase())
                          )
                          .map((contact) => (
                            <div
                              key={String(contact.contact_id)}
                              onClick={() => {
                                handleContactSelect(String(contact.contact_id))
                                setContactSearch("")
                              }}
                              className="px-4 py-2 hover:bg-blue-100 cursor-pointer text-gray-700 hover:text-gray-900 transition-colors text-sm"
                            >
                              {contact.contact_person_name}
                            </div>
                          ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Phone <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  name="phone"
                  value={formData.phone}
                  onChange={handleChange}
                  required
                  pattern="[0-9]{10}"
                  maxLength={10}
                  placeholder="10-digit phone number"
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
                <input
                  type="email"
                  name="email"
                  value={formData.email}
                  onChange={handleChange}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Category <span className="text-red-500">*</span>
                </label>
                <select
                  name="category"
                  value={formData.category}
                  onChange={handleChange}
                  required
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                >
                  <option value="">Select Category</option>
                  {formData.category && !(dropdownData.Category || []).includes(formData.category) && (
                    <option value={formData.category}>{formData.category}</option>
                  )}
                  {(dropdownData.Category || []).map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Sales Stage <span className="text-red-500">*</span>
                </label>
                <select
                  name="salesStage"
                  value={formData.salesStage}
                  onChange={handleChange}
                  required
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                >
                  <option value="">Select Sales Stage</option>
                  {(dropdownData.SalesStage || []).map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Lead Source</label>
                <select
                  name="leadSource"
                  value={formData.leadSource}
                  onChange={handleChange}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                >
                  <option value="">Select Lead Source</option>
                  {(dropdownData.LeadSource || []).map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Next Steps <span className="text-red-500">*</span>
                </label>
                <select
                  name="nextSteps"
                  value={formData.nextSteps}
                  onChange={handleChange}
                  required
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                >
                  <option value="">Select Next Steps</option>
                  {(dropdownData.NextSteps || []).map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Next Followup Date <span className="text-red-500">*</span>
                </label>
                <input
                  type="date"
                  name="nextFollowupDate"
                  value={formData.nextFollowupDate}
                  onChange={handleChange}
                  required
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Budget <span className="text-red-500">*</span>
                </label>
                <input
                  type="number"
                  name="budget"
                  value={formData.budget}
                  onChange={handleChange}
                  required
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Quantity <span className="text-red-500">*</span>
                </label>
                <input
                  type="number"
                  name="quantity"
                  value={formData.quantity}
                  onChange={handleChange}
                  required
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Occasion <span className="text-red-500">*</span>
                </label>
                <select
                  name="occasion"
                  value={formData.occasion}
                  onChange={handleChange}
                  required
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                >
                  <option value="">Select Occasion</option>
                  {(dropdownData.Occasion || []).map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Location <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  name="location"
                  value={formData.location}
                  onChange={handleChange}
                  list="location-options"
                  required
                  placeholder="Type or select location"
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
                <datalist id="location-options">
                  {(dropdownData.Location || dropdownData[Object.keys(dropdownData)[8]] || []).map((option) => (
                    <option key={option} value={option} />
                  ))}
                </datalist>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Inquiry Type <span className="text-red-500">*</span>
                </label>
                <select
                  name="inquiryType"
                  value={formData.inquiryType}
                  onChange={handleChange}
                  required
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                >
                  <option value="">Select Inquiry Type</option>
                  {(dropdownData.InquiryType || []).map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  1st Owner <span className="text-red-500">*</span>
                </label>
                <select
                  name="firstOwner"
                  value={formData.firstOwner}
                  onChange={handleChange}
                  required
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                >
                  <option value="">Select 1st Owner</option>
                  {(dropdownData.FirstOwner || []).map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  2nd Owner <span className="text-red-500">*</span>
                </label>
                <select
                  name="secondOwner"
                  value={formData.secondOwner}
                  onChange={handleChange}
                  required
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                >
                  <option value="">Select 2nd Owner</option>
                  {(dropdownData.SecondOwner || []).map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Back Office <span className="text-red-500">*</span>
                </label>
                <select
                  name="backOffice"
                  value={formData.backOffice}
                  onChange={handleChange}
                  required
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                >
                  <option value="">Select Back Office</option>
                  {(dropdownData.BackOffice || []).map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Lead Generator <span className="text-red-500">*</span>
                </label>
                <select
                  name="leadGenerator"
                  value={formData.leadGenerator}
                  onChange={handleChange}
                  required
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                >
                  <option value="">Select Lead Generator</option>
                  {(dropdownData.LeadGenerator || []).map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Details</label>
              <textarea
                name="details"
                value={formData.details}
                onChange={handleChange}
                rows={4}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              ></textarea>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Update Remarks</label>
              <input
                type="text"
                name="updateRemarks"
                value={formData.updateRemarks}
                onChange={handleChange}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>

            <div className="flex gap-4 pt-4">
              <button
                type="submit"
                disabled={loading || confirming || Boolean(successResult)}
                className="flex-1 bg-gradient-to-r from-blue-600 to-blue-700 text-white py-3 rounded-lg hover:from-blue-700 hover:to-blue-800 transition-all disabled:from-gray-400 disabled:to-gray-500 font-semibold shadow-lg hover:shadow-xl disabled:opacity-75"
              >
                {loading ? (
                  <span className="flex items-center justify-center gap-2">
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                    Saving...
                  </span>
                ) : (
                  "Create Inquiry"
                )}
              </button>
              <Link
                href="/dashboard"
                aria-disabled={loading || confirming}
                onClick={(event) => {
                  if (loading || confirming) event.preventDefault()
                }}
                className="flex-1 bg-gray-200 text-gray-700 py-3 rounded-lg hover:bg-gray-300 transition-colors text-center font-semibold aria-disabled:pointer-events-none aria-disabled:opacity-50"
              >
                Cancel
              </Link>
            </div>
          </form>
        </div>
      </div>
    </div>
  )
}

