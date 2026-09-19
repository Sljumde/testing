"use client"

import type React from "react"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { ArrowLeft, Save, RefreshCw, LogOut } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { toast, Toaster } from "sonner"

interface Props {
  userEmail: string
}

export default function AddCustomerClient({ userEmail }: Props) {
  const router = useRouter()
  const [isLoading, setIsLoading] = useState(false)
  const [dropdownData, setDropdownData] = useState<Record<string, string[]>>({})
  const [formData, setFormData] = useState({
    company: "",
    address: "",
    city: "",
    pinCode: "",
    state: "",
    contactPerson: "",
    designation: "",
    phone: "",
    email: "",
    notes: "",
    salesPersonEmail: userEmail,
    leadOwnership: "",
    clientCategory: "",
  })

  useEffect(() => {
    fetchDropdownData()
  }, [])

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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (
      !formData.company ||
      !formData.contactPerson ||
      !formData.designation ||
      !formData.email ||
      !formData.leadOwnership
    ) {
      toast.error("Please fill in all required fields")
      return
    }

    setIsLoading(true)

    try {
      const res = await fetch("/api/customers/add", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(formData),
      })

      const result = await res.json()

      if (result.success) {
        toast.success(`Customer added successfully! Code: ${result.customerCode}`)
        setTimeout(() => {
          router.push("/customers")
        }, 1500)
      } else {
        toast.error(`Failed to add customer: ${result.message}`)
      }
    } catch (error) {
      toast.error("Error adding customer")
    } finally {
      setIsLoading(false)
    }
  }

  const handleReset = () => {
    setFormData({
      company: "",
      address: "",
      city: "",
      pinCode: "",
      state: "",
      contactPerson: "",
      designation: "",
      phone: "",
      email: "",
      notes: "",
      salesPersonEmail: userEmail,
      leadOwnership: "",
      clientCategory: "",
    })
    toast.info("Form reset")
  }

  const handleLogout = async () => {
    await fetch("/api/auth/logout", { method: "POST" })
    router.push("/login")
  }

  const indianStates = [
    "Andhra Pradesh",
    "Arunachal Pradesh",
    "Assam",
    "Bihar",
    "Chhattisgarh",
    "Goa",
    "Gujarat",
    "Haryana",
    "Himachal Pradesh",
    "Jharkhand",
    "Karnataka",
    "Kerala",
    "Madhya Pradesh",
    "Maharashtra",
    "Manipur",
    "Meghalaya",
    "Mizoram",
    "Nagaland",
    "Odisha",
    "Punjab",
    "Rajasthan",
    "Sikkim",
    "Tamil Nadu",
    "Telangana",
    "Tripura",
    "Uttar Pradesh",
    "Uttarakhand",
    "West Bengal",
    "Andaman and Nicobar Islands",
    "Chandigarh",
    "Dadra and Nagar Haveli and Daman and Diu",
    "Delhi",
    "Jammu and Kashmir",
    "Ladakh",
    "Lakshadweep",
    "Puducherry",
  ]

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#F5F3F0] via-[#e6ddd8] to-[#d7ccc8]">
      <Toaster position="top-center" richColors expand />

      {isLoading && (
        <div className="fixed inset-0 z-[100] bg-black/50 flex items-center justify-center">
          <div className="bg-white rounded-2xl p-6 flex flex-col items-center gap-3">
            <div className="animate-spin rounded-full h-12 w-12 border-4 border-[#5D4037] border-t-transparent"></div>
            <p className="text-[#3E2723] font-medium">Adding customer...</p>
          </div>
        </div>
      )}

      <header className="bg-gradient-to-r from-[#3E2723] via-[#4E342E] to-[#5D4037] text-white shadow-lg sticky top-0 z-50">
        <div className="max-w-full px-4 md:px-6 py-3 md:py-4">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-3 md:gap-6 min-w-0">
              <Link
                href="/dashboard"
                className="text-lg md:text-2xl font-bold hover:opacity-90 transition-opacity whitespace-nowrap"
                style={{ textShadow: "0 0 10px rgba(249, 245, 6, 0.2)" }}
              >
                CRM
              </Link>
              <div className="hidden sm:flex items-center gap-2 text-xs md:text-sm text-[#f9f506] opacity-90 min-w-0">
                <span>/</span>
                <span className="truncate">Add Customer</span>
              </div>
            </div>
            <div className="flex items-center gap-2 md:gap-4">
              <div className="text-xs md:text-sm text-[#f9f506] truncate max-w-[120px] md:max-w-[200px]">
                {userEmail}
              </div>
              <Button variant="ghost" size="sm" onClick={handleLogout} className="text-[#f9f506] hover:bg-white/20 p-2">
                <LogOut className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </div>
      </header>

      <div className="max-w-4xl mx-auto p-4 md:p-8">
        <div className="mb-6">
          <Link href="/customers">
            <Button
              variant="outline"
              size="sm"
              className="gap-2 bg-white/90 border-[#6D4C41] text-[#3E2723] hover:bg-white"
            >
              <ArrowLeft className="h-4 w-4" />
              Back to Customers
            </Button>
          </Link>
        </div>

        <div className="bg-white/90 backdrop-blur rounded-2xl shadow-lg border border-[#e6ddd8] p-6 md:p-8">
          <h2 className="text-2xl md:text-3xl font-bold text-[#3E2723] mb-6">Add New Customer</h2>

          <form onSubmit={handleSubmit} className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="md:col-span-2">
                <label className="block text-sm font-medium text-[#4E342E] mb-1">
                  Company <span className="text-red-500">*</span>
                </label>
                <Input
                  value={formData.company}
                  onChange={(e) => setFormData({ ...formData, company: e.target.value })}
                  placeholder="Enter company name"
                  className="h-11 border-[#6D4C41]/30 focus:ring-[#D4AF37] focus:border-[#D4AF37]"
                  required
                />
              </div>

              <div className="md:col-span-2">
                <label className="block text-sm font-medium text-[#4E342E] mb-1">Address</label>
                <textarea
                  value={formData.address}
                  onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                  placeholder="Enter address"
                  className="w-full min-h-[80px] p-3 border border-[#6D4C41]/30 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#D4AF37] focus:border-[#D4AF37]"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-[#4E342E] mb-1">City</label>
                <Input
                  value={formData.city}
                  onChange={(e) => setFormData({ ...formData, city: e.target.value })}
                  placeholder="Enter city"
                  className="h-11 border-[#6D4C41]/30 focus:ring-[#D4AF37] focus:border-[#D4AF37]"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-[#4E342E] mb-1">Pin Code</label>
                <Input
                  value={formData.pinCode}
                  onChange={(e) => setFormData({ ...formData, pinCode: e.target.value })}
                  placeholder="Enter pin code"
                  className="h-11 border-[#6D4C41]/30 focus:ring-[#D4AF37] focus:border-[#D4AF37]"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-[#4E342E] mb-1">State</label>
                <Select value={formData.state} onValueChange={(v) => setFormData({ ...formData, state: v })}>
                  <SelectTrigger className="h-11 border-[#6D4C41]/30 focus:ring-[#D4AF37]">
                    <SelectValue placeholder="Select state" />
                  </SelectTrigger>
                  <SelectContent className="max-h-[300px]">
                    {indianStates.map((state) => (
                      <SelectItem key={state} value={state}>
                        {state}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Contact Person <span className="text-red-500">*</span>
                </label>
                <Input
                  value={formData.contactPerson}
                  onChange={(e) => setFormData({ ...formData, contactPerson: e.target.value })}
                  placeholder="Enter contact person name"
                  className="h-11 border-[#6D4C41]/30 focus:ring-[#D4AF37] focus:border-[#D4AF37]"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Designation <span className="text-red-500">*</span>
                </label>
                <Input
                  value={formData.designation}
                  onChange={(e) => setFormData({ ...formData, designation: e.target.value })}
                  placeholder="Enter designation"
                  className="h-11 border-[#6D4C41]/30 focus:ring-[#D4AF37] focus:border-[#D4AF37]"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Phone</label>
                <Input
                  value={formData.phone}
                  onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                  placeholder="Enter phone number"
                  className="h-11 border-[#6D4C41]/30 focus:ring-[#D4AF37] focus:border-[#D4AF37]"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Email <span className="text-red-500">*</span>
                </label>
                <Input
                  type="email"
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  placeholder="Enter email address"
                  className="h-11 border-[#6D4C41]/30 focus:ring-[#D4AF37] focus:border-[#D4AF37]"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Sales Person Email</label>
                <Input
                  type="email"
                  value={formData.salesPersonEmail}
                  onChange={(e) => setFormData({ ...formData, salesPersonEmail: e.target.value })}
                  placeholder="Enter sales person email"
                  className="h-11 border-[#6D4C41]/30 focus:ring-[#D4AF37] focus:border-[#D4AF37]"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-[#4E342E] mb-1">
                  Lead Ownership <span className="text-red-500">*</span>
                </label>
                <Select
                  value={formData.leadOwnership}
                  onValueChange={(v) => setFormData({ ...formData, leadOwnership: v })}
                >
                  <SelectTrigger className="h-11 border-[#6D4C41]/30 focus:ring-[#D4AF37]">
                    <SelectValue placeholder="Select lead ownership" />
                  </SelectTrigger>
                  <SelectContent>
                    {(dropdownData.LeadOwnership || dropdownData[Object.keys(dropdownData)[7]] || []).map((opt) => (
                      <SelectItem key={opt} value={opt}>
                        {opt}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <label className="block text-sm font-medium text-[#4E342E] mb-1">Client Category</label>
                <Select
                  value={formData.clientCategory}
                  onValueChange={(v) => setFormData({ ...formData, clientCategory: v })}
                >
                  <SelectTrigger className="h-11 border-[#6D4C41]/30 focus:ring-[#D4AF37]">
                    <SelectValue placeholder="Select client category" />
                  </SelectTrigger>
                  <SelectContent>
                    {(dropdownData.Category || []).map((opt) => (
                      <SelectItem key={opt} value={opt}>
                        {opt}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="md:col-span-2">
                <label className="block text-sm font-medium text-[#4E342E] mb-1">Notes</label>
                <textarea
                  value={formData.notes}
                  onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                  placeholder="Enter any additional notes"
                  className="w-full min-h-[80px] p-3 border border-[#6D4C41]/30 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#D4AF37] focus:border-[#D4AF37]"
                />
              </div>
            </div>

            <div className="flex flex-col sm:flex-row gap-3 pt-4">
              <Button
                type="submit"
                disabled={isLoading}
                className="flex-1 bg-[#4E342E] hover:bg-[#3E2723] text-[#f9f506] h-11 gap-2"
              >
                <Save className="h-4 w-4" />
                Submit
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={handleReset}
                disabled={isLoading}
                className="flex-1 h-11 gap-2 bg-white border-[#6D4C41] text-[#3E2723] hover:bg-[#F5F3F0]"
              >
                <RefreshCw className="h-4 w-4" />
                Reset
              </Button>
            </div>
          </form>
        </div>
      </div>
    </div>
  )
}
