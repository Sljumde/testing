"use client"

import { useState, useEffect } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { Filter, ChevronDown, ChevronUp, X, LogOut, RefreshCw, Edit, Save, XIcon } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { toast, Toaster } from "sonner"

interface UserInfo {
  userEmail: string
  role: string
  authorizedEmails: string[]
}

export default function CustomersClient({ userInfo }: { userInfo: UserInfo }) {
  const router = useRouter()
  const [customers, setCustomers] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [showFilters, setShowFilters] = useState(false)
  const [dropdownData, setDropdownData] = useState<Record<string, string[]>>({})
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [editMode, setEditMode] = useState(false)
  const [editingRows, setEditingRows] = useState<Set<string>>(new Set())
  const [editedData, setEditedData] = useState<Map<string, Record<number, string>>>(new Map())
  const [selectedRows, setSelectedRows] = useState<Set<string>>(new Set())

  const [filters, setFilters] = useState({
    customerCode: "",
    cid: "",
    company: "",
    city: "",
    state: [] as string[],
    contactPerson: "",
    phone: "",
    email: "",
    clientCategory: [] as string[],
    leadOwnership: [] as string[],
  })

  useEffect(() => {
    fetchCustomers()
    fetchDropdownData()
  }, [])

  const fetchCustomers = async () => {
    try {
      const res = await fetch("/api/customers")
      const data = await res.json()

      if (data.success) {
        setCustomers(data.data)
      }
    } catch (error) {
      console.error("Error fetching customers:", error)
    } finally {
      setLoading(false)
    }
  }

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

  const refreshData = async () => {
    setIsRefreshing(true)
    try {
      await fetchCustomers()
      setFilters({
        customerCode: "",
        cid: "",
        company: "",
        city: "",
        state: [],
        contactPerson: "",
        phone: "",
        email: "",
        clientCategory: [],
        leadOwnership: [],
      })
      setSelectedRows(new Set())
      toast.success("Data refreshed")
    } catch (error) {
      toast.error("Error refreshing data")
    } finally {
      setIsRefreshing(false)
    }
  }

  const handleLogout = async () => {
    await fetch("/api/auth/logout", { method: "POST" })
    router.push("/login")
    router.refresh()
  }

  const filteredCustomers = customers.filter((customer) => {
    if (filters.customerCode && !customer[0]?.toLowerCase().includes(filters.customerCode.toLowerCase())) return false
    if (filters.cid && !customer[1]?.toLowerCase().includes(filters.cid.toLowerCase())) return false
    if (filters.company && !customer[2]?.toLowerCase().includes(filters.company.toLowerCase())) return false
    if (filters.city && !customer[7]?.toLowerCase().includes(filters.city.toLowerCase())) return false
    if (filters.state.length > 0 && !filters.state.includes(customer[9])) return false
    if (filters.contactPerson && !customer[10]?.toLowerCase().includes(filters.contactPerson.toLowerCase())) return false
    if (filters.phone && !customer[12]?.includes(filters.phone)) return false
    if (filters.email && !customer[13]?.toLowerCase().includes(filters.email.toLowerCase())) return false
    if (filters.clientCategory.length > 0 && !filters.clientCategory.includes(customer[51])) return false
    if (filters.leadOwnership.length > 0 && !filters.leadOwnership.includes(customer[50])) return false
    return true
  })

  const resetFilters = () => {
    setFilters({
      customerCode: "",
      cid: "",
      company: "",
      city: "",
      state: [],
      contactPerson: "",
      phone: "",
      email: "",
      clientCategory: [],
      leadOwnership: [],
    })
    setSelectedRows(new Set())
    toast.success("Filters reset")
  }

  const toggleFilterValue = (filterKey: keyof typeof filters, value: string) => {
    const currentValues = filters[filterKey] as string[]
    const newValues = currentValues.includes(value)
      ? currentValues.filter((v) => v !== value)
      : [...currentValues, value]
    setFilters({ ...filters, [filterKey]: newValues })
  }

  const enableBulkEdit = () => {
    if (selectedRows.size === 0) {
      toast.warning("Please select at least one customer to edit")
      return
    }
    setEditMode(true)
    setEditingRows(new Set(selectedRows))
    toast.success("Edit mode enabled")
  }

  const cancelEdit = () => {
    setEditMode(false)
    setEditingRows(new Set())
    setEditedData(new Map())
    setSelectedRows(new Set())
    toast.info("Edit cancelled")
  }

  const updateCellValue = (customerCode: string, columnIndex: number, value: string) => {
    const current = editedData.get(customerCode) || {}
    current[columnIndex] = value
    editedData.set(customerCode, current)
    setEditedData(new Map(editedData))
  }

  const saveChanges = async () => {
    const updates: any[] = []
    editedData.forEach((changes, customerCode) => {
      const row = customers.find((c) => c[0] === customerCode)
      if (row) {
        const updatedRow = [...row]
        Object.entries(changes).forEach(([colIndex, value]) => {
          updatedRow[Number.parseInt(colIndex)] = value
        })
        updates.push({ customerCode, data: updatedRow })
      }
    })

    if (updates.length === 0) {
      toast.warning("No changes to save")
      return
    }

    try {
      const res = await fetch("/api/customers/update", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ updates }),
      })

      const data = await res.json()

      if (data.success) {
        toast.success(`Updated ${updates.length} customer(s)`)
        await fetchCustomers()
        setEditMode(false)
        setEditingRows(new Set())
        setEditedData(new Map())
        setSelectedRows(new Set())
      } else {
        toast.error(data.message || "Failed to save changes")
      }
    } catch (error) {
      toast.error("Error saving changes")
    }
  }

  const toggleSelectRow = (customerCode: string) => {
    const newSelected = new Set(selectedRows)
    if (newSelected.has(customerCode)) {
      newSelected.delete(customerCode)
    } else {
      newSelected.add(customerCode)
    }
    setSelectedRows(newSelected)
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <Toaster position="top-center" richColors expand />

      {loading && (
        <div className="fixed inset-0 z-[100] bg-black/50 flex items-center justify-center">
          <div className="bg-white rounded-lg p-6 flex flex-col items-center gap-3">
            <div className="animate-spin rounded-full h-12 w-12 border-4 border-teal-600 border-t-transparent"></div>
            <p className="text-gray-700 font-medium">Loading...</p>
          </div>
        </div>
      )}

      <header className="bg-gradient-to-r from-teal-500 via-cyan-600 to-blue-500 text-white shadow-lg sticky top-0 z-50">
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
                <span className="truncate">Customer Database</span>
                <span className="ml-1 md:ml-2 px-2 py-0.5 md:py-1 bg-white/20 rounded-md font-medium whitespace-nowrap text-xs">
                  {filteredCustomers.length}
                </span>
              </div>
            </div>
            <div className="flex items-center gap-2 md:gap-4">
              <div className="text-xs md:text-sm truncate max-w-[120px] md:max-w-[200px]">{userInfo.userEmail}</div>
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

              {!editMode ? (
                <>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={enableBulkEdit}
                    disabled={selectedRows.size === 0}
                    className="gap-2 text-xs md:text-sm h-9 bg-transparent"
                  >
                    <Edit className="h-3 w-3 md:h-4 md:w-4" />
                    Edit
                  </Button>
                </>
              ) : (
                <>
                  <Button
                    variant="default"
                    size="sm"
                    onClick={saveChanges}
                    className="gap-2 text-xs md:text-sm bg-green-600 hover:bg-green-700 h-9"
                  >
                    <Save className="h-3 w-3 md:h-4 md:w-4" />
                    Save
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={cancelEdit}
                    className="gap-2 text-xs md:text-sm h-9 bg-transparent"
                  >
                    <XIcon className="h-3 w-3 md:h-4 md:w-4" />
                    Cancel
                  </Button>
                </>
              )}

              {Object.values(filters).some((v) => (Array.isArray(v) ? v.length > 0 : v !== "")) && (
                <Button variant="ghost" size="sm" onClick={resetFilters} className="gap-2 text-xs md:text-sm h-9">
                  <X className="h-3 w-3 md:h-4 md:w-4" />
                  Reset
                </Button>
              )}

              <Button
                variant="outline"
                size="sm"
                onClick={refreshData}
                disabled={isRefreshing}
                className="gap-2 text-xs md:text-sm bg-transparent h-9"
              >
                <RefreshCw className={`h-3 w-3 md:h-4 md:w-4 ${isRefreshing ? "animate-spin" : ""}`} />
                <span className="hidden sm:inline">Refresh</span>
              </Button>
            </div>

            <Link
              href="/customers/new"
              className="bg-green-600 text-white px-3 md:px-4 py-2 rounded-md hover:bg-green-700 transition-colors text-xs md:text-sm font-semibold text-center h-9 flex items-center justify-center"
            >
              + Add Customer
            </Link>
          </div>
        </div>

        {showFilters && (
          <div className="bg-white rounded-lg shadow-sm border overflow-hidden animate-in slide-in-from-top duration-300">
            <div className="bg-gradient-to-r from-gray-50 to-gray-100 border-b px-4 py-3">
              <h3 className="text-sm md:text-base font-semibold text-gray-800 flex items-center gap-2">
                <Filter className="h-4 w-4 text-teal-600" />
                Customer Filters
              </h3>
            </div>

            <div className="p-4 md:p-6 space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-4">
                <Input
                  placeholder="Customer Code"
                  value={filters.customerCode}
                  onChange={(e) => setFilters({ ...filters, customerCode: e.target.value })}
                  className="text-sm h-10"
                />
                <Input
                  placeholder="CID"
                  value={filters.cid}
                  onChange={(e) => setFilters({ ...filters, cid: e.target.value })}
                  className="text-sm h-10"
                />
                <Input
                  placeholder="Company"
                  value={filters.company}
                  onChange={(e) => setFilters({ ...filters, company: e.target.value })}
                  className="text-sm h-10"
                />
                <Input
                  placeholder="City"
                  value={filters.city}
                  onChange={(e) => setFilters({ ...filters, city: e.target.value })}
                  className="text-sm h-10"
                />
                <Input
                  placeholder="Contact Person"
                  value={filters.contactPerson}
                  onChange={(e) => setFilters({ ...filters, contactPerson: e.target.value })}
                  className="text-sm h-10"
                />
                <Input
                  placeholder="Phone"
                  value={filters.phone}
                  onChange={(e) => setFilters({ ...filters, phone: e.target.value })}
                  className="text-sm h-10"
                />
                <Input
                  placeholder="Email"
                  value={filters.email}
                  onChange={(e) => setFilters({ ...filters, email: e.target.value })}
                  className="text-sm h-10"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                <div className="space-y-2">
                  <label className="text-xs font-medium text-gray-700">State</label>
                  <Select
                    value=""
                    onValueChange={(v) => {
                      if (v && !filters.state.includes(v)) {
                        setFilters({ ...filters, state: [...filters.state, v] })
                      }
                    }}
                  >
                    <SelectTrigger className="text-sm h-10">
                      <SelectValue
                        placeholder={filters.state.length > 0 ? `${filters.state.length} selected` : "Select..."}
                      />
                    </SelectTrigger>
                    <SelectContent>
                      {(dropdownData.State || []).map((opt) => (
                        <SelectItem key={opt} value={opt} className="text-sm">
                          {opt}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {filters.state.length > 0 && (
                    <div className="flex flex-wrap gap-1">
                      {filters.state.map((val) => (
                        <span
                          key={val}
                          className="inline-flex items-center gap-1 px-2 py-1 bg-blue-100 text-blue-700 rounded text-xs"
                        >
                          {val}
                          <X className="h-3 w-3 cursor-pointer" onClick={() => toggleFilterValue("state", val)} />
                        </span>
                      ))}
                    </div>
                  )}
                </div>

                <div className="space-y-2">
                  <label className="text-xs font-medium text-gray-700">Client Category</label>
                  <Select
                    value=""
                    onValueChange={(v) => {
                      if (v && !filters.clientCategory.includes(v)) {
                        setFilters({ ...filters, clientCategory: [...filters.clientCategory, v] })
                      }
                    }}
                  >
                    <SelectTrigger className="text-sm h-10">
                      <SelectValue
                        placeholder={
                          filters.clientCategory.length > 0 ? `${filters.clientCategory.length} selected` : "Select..."
                        }
                      />
                    </SelectTrigger>
                    <SelectContent>
                      {(dropdownData.ClientCategory || []).map((opt) => (
                        <SelectItem key={opt} value={opt} className="text-sm">
                          {opt}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {filters.clientCategory.length > 0 && (
                    <div className="flex flex-wrap gap-1">
                      {filters.clientCategory.map((val) => (
                        <span
                          key={val}
                          className="inline-flex items-center gap-1 px-2 py-1 bg-green-100 text-green-700 rounded text-xs"
                        >
                          {val}
                          <X
                            className="h-3 w-3 cursor-pointer"
                            onClick={() => toggleFilterValue("clientCategory", val)}
                          />
                        </span>
                      ))}
                    </div>
                  )}
                </div>

                <div className="space-y-2">
                  <label className="text-xs font-medium text-gray-700">Lead Ownership</label>
                  <Select
                    value=""
                    onValueChange={(v) => {
                      if (v && !filters.leadOwnership.includes(v)) {
                        setFilters({ ...filters, leadOwnership: [...filters.leadOwnership, v] })
                      }
                    }}
                  >
                    <SelectTrigger className="text-sm h-10">
                      <SelectValue
                        placeholder={
                          filters.leadOwnership.length > 0 ? `${filters.leadOwnership.length} selected` : "Select..."
                        }
                      />
                    </SelectTrigger>
                    <SelectContent>
                      {(dropdownData.LeadOwnership || []).map((opt) => (
                        <SelectItem key={opt} value={opt} className="text-sm">
                          {opt}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {filters.leadOwnership.length > 0 && (
                    <div className="flex flex-wrap gap-1">
                      {filters.leadOwnership.map((val) => (
                        <span
                          key={val}
                          className="inline-flex items-center gap-1 px-2 py-1 bg-purple-100 text-purple-700 rounded text-xs"
                        >
                          {val}
                          <X
                            className="h-3 w-3 cursor-pointer"
                            onClick={() => toggleFilterValue("leadOwnership", val)}
                          />
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

        <div className="bg-white rounded-lg shadow-sm border overflow-hidden">
          <div className="overflow-auto" style={{ height: "calc(100vh - 250px)", maxHeight: "800px" }}>
            <table className="w-full text-xs md:text-sm border-collapse">
              <thead className="sticky top-0 z-30 bg-teal-600 text-white shadow-md">
                <tr>
                  <th className="p-2 md:p-3 text-left border-r border-teal-500 font-semibold whitespace-nowrap">
                    <input
                      type="checkbox"
                      checked={filteredCustomers.length > 0 && selectedRows.size === filteredCustomers.length}
                      onChange={() => {
                        if (selectedRows.size === filteredCustomers.length) {
                          setSelectedRows(new Set())
                        } else {
                          setSelectedRows(new Set(filteredCustomers.map((c) => c[0])))
                        }
                      }}
                      className="cursor-pointer"
                    />
                  </th>
                  {[
                    "Customer Code",
                    "CID",
                    "Company",
                    "Address",
                    "City",
                    "Pin Code",
                    "State",
                    "Contact Person",
                    "Designation",
                    "Phone",
                    "Email",
                    "Notes",
                    "Lead Ownership",
                    "Client Category",
                  ].map((header) => (
                    <th
                      key={header}
                      className="p-2 md:p-3 text-left border-r border-teal-500 font-semibold whitespace-nowrap"
                    >
                      {header}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filteredCustomers.length === 0 ? (
                  <tr>
                    <td colSpan={15} className="p-8 md:p-12 text-center text-gray-500 text-sm md:text-base">
                      No customers found
                    </td>
                  </tr>
                ) : (
                  filteredCustomers.map((customer, index) => {
                    const customerCode = customer[0]
                    const isEditing = editingRows.has(customerCode)
                    const edits = editedData.get(customerCode) || {}

                    return (
                      <tr key={index} className="border-b hover:bg-teal-50/50 transition-colors">
                        <td className="p-2 md:p-3 border-r">
                          <input
                            type="checkbox"
                            checked={selectedRows.has(customerCode)}
                            onChange={() => toggleSelectRow(customerCode)}
                            className="cursor-pointer"
                          />
                        </td>
                        <td className="p-2 md:p-3 border-r font-medium text-teal-600 whitespace-nowrap">
                          {customerCode}
                        </td>
                        <td className="p-2 md:p-3 border-r whitespace-nowrap text-teal-700">
                          {customer[1]}
                        </td>
                        <td className="p-2 md:p-3 border-r max-w-[150px] md:max-w-[200px]">
                          {isEditing ? (
                            <Input
                              value={edits[2] !== undefined ? edits[2] : customer[2]}
                              onChange={(e) => updateCellValue(customerCode, 2, e.target.value)}
                              className="min-w-[150px] h-8 text-xs"
                            />
                          ) : (
                            <span className="line-clamp-2" title={customer[2]}>
                              {customer[2]}
                            </span>
                          )}
                        </td>
                        <td className="p-2 md:p-3 border-r max-w-[150px] md:max-w-[200px]">
                          {isEditing ? (
                            <textarea
                              value={edits[6] !== undefined ? edits[6] : customer[6]}
                              onChange={(e) => updateCellValue(customerCode, 6, e.target.value)}
                              className="w-full min-w-[150px] h-16 text-xs border rounded px-2 py-1 resize-none"
                            />
                          ) : (
                            <span className="line-clamp-2 text-xs leading-relaxed" title={customer[6]}>
                              {customer[6]}
                            </span>
                          )}
                        </td>
                        <td className="p-2 md:p-3 border-r whitespace-nowrap">
                          {isEditing ? (
                            <Input
                              value={edits[7] !== undefined ? edits[7] : customer[7]}
                              onChange={(e) => updateCellValue(customerCode, 7, e.target.value)}
                              className="min-w-[100px] h-8 text-xs"
                            />
                          ) : (
                            customer[7]
                          )}
                        </td>
                        <td className="p-2 md:p-3 border-r whitespace-nowrap">{customer[8]}</td>
                        <td className="p-2 md:p-3 border-r whitespace-nowrap">{customer[9]}</td>
                        <td className="p-2 md:p-3 border-r whitespace-nowrap">
                          {isEditing ? (
                            <Input
                              value={edits[10] !== undefined ? edits[10] : customer[10]}
                              onChange={(e) => updateCellValue(customerCode, 10, e.target.value)}
                              className="min-w-[120px] h-8 text-xs"
                            />
                          ) : (
                            customer[10]
                          )}
                        </td>
                        <td className="p-2 md:p-3 border-r text-xs text-gray-600 whitespace-nowrap">{customer[11]}</td>
                        <td className="p-2 md:p-3 border-r whitespace-nowrap">
                          {isEditing ? (
                            <Input
                              value={edits[12] !== undefined ? edits[12] : customer[12]}
                              onChange={(e) => updateCellValue(customerCode, 12, e.target.value)}
                              className="min-w-[120px] h-8 text-xs"
                            />
                          ) : (
                            customer[12]
                          )}
                        </td>
                        <td className="p-2 md:p-3 border-r max-w-[150px] md:max-w-[200px]">
                          {isEditing ? (
                            <Input
                              value={edits[13] !== undefined ? edits[13] : customer[13]}
                              onChange={(e) => updateCellValue(customerCode, 13, e.target.value)}
                              className="min-w-[150px] h-8 text-xs"
                            />
                          ) : (
                            <span className="line-clamp-1 text-xs" title={customer[13]}>
                              {customer[13]}
                            </span>
                          )}
                        </td>
                        <td className="p-2 md:p-3 border-r max-w-[150px] md:max-w-[200px]">
                          {isEditing ? (
                            <textarea
                              value={edits[39] !== undefined ? edits[39] : customer[39]}
                              onChange={(e) => updateCellValue(customerCode, 39, e.target.value)}
                              className="w-full min-w-[150px] h-16 text-xs border rounded px-2 py-1 resize-none"
                            />
                          ) : (
                            <span className="line-clamp-2 text-xs leading-relaxed" title={customer[39]}>
                              {customer[39]}
                            </span>
                          )}
                        </td>
                        <td className="p-2 md:p-3 border-r text-xs whitespace-nowrap">{customer[50]}</td>
                        <td className="p-2 md:p-3 border-r text-xs whitespace-nowrap">{customer[51]}</td>
                      </tr>
                    )
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  )
}
