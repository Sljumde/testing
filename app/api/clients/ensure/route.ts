import { type NextRequest, NextResponse } from "next/server"
import { getServerSession } from "@/lib/auth"
import { getSupabaseAdminClient } from "@/lib/supabase/server"
import { createAppLogger, type AppLogger } from "@/lib/app-logger"

type ContactRow = {
  contact_id: number | string
  contact_person_name: string | null
  phone_no: string | null
  email: string | null
  city: string | null
  state: string | null
}

function text(value: unknown) {
  return value == null ? "" : String(value).trim()
}

function key(value: unknown) {
  return text(value).toLowerCase()
}

function normalizePhone(value: unknown) {
  return text(value).replace(/\D/g, "")
}

function splitLocation(value: unknown) {
  const raw = text(value)
  if (!raw) return { city: "", state: "" }
  const [city, ...stateParts] = raw.split(",").map((part) => part.trim()).filter(Boolean)
  return { city: city || raw, state: stateParts.join(", ") }
}

function joinLocation(city: string, state: string) {
  return [city, state].filter(Boolean).join(", ")
}

function sameContact(existing: ContactRow, input: { contactName: string; phone: string; email: string }) {
  const existingName = key(existing.contact_person_name)
  const inputName = key(input.contactName)
  const existingPhone = normalizePhone(existing.phone_no)
  const inputPhone = normalizePhone(input.phone)
  const existingEmail = key(existing.email)
  const inputEmail = key(input.email)

  if (inputPhone && existingPhone && inputPhone === existingPhone) return true
  if (inputEmail && existingEmail && inputEmail === existingEmail) return true
  return Boolean(inputName && existingName && inputName === existingName)
}

function serializeSupabaseError(error: unknown) {
  if (!error || typeof error !== "object") return { message: String(error) }
  const value = error as { message?: string; code?: string; details?: string; hint?: string }
  return {
    message: value.message || "Supabase client save failed",
    code: value.code || "",
    details: value.details || null,
    hint: value.hint || null,
  }
}

async function findExistingCompany(supabase: ReturnType<typeof getSupabaseAdminClient>, companyName: string) {
  const normalizedCompanyName = companyName.toLowerCase()

  const lookupResult = await supabase
    .from("client_lookup")
    .select("company_id, company_name")
    .eq("company_name_normalized", normalizedCompanyName)
    .limit(1)

  if (lookupResult.error) return { company: null, error: lookupResult.error }

  const lookupCompany = lookupResult.data?.[0]
  if (lookupCompany) {
    return {
      company: lookupCompany as { company_id: number | string; company_name: string },
      error: null,
    }
  }

  const companyResult = await supabase
    .from("companies")
    .select("company_id, company_name")
    .ilike("company_name", companyName)
    .limit(20)

  if (companyResult.error) return { company: null, error: companyResult.error }

  const company = (companyResult.data || []).find((row) => key(row.company_name) === normalizedCompanyName)
  return {
    company: (company as { company_id: number | string; company_name: string } | undefined) || null,
    error: null,
  }
}

export async function POST(request: NextRequest) {
  let logger: AppLogger | null = null

  try {
    const body = await request.json()
    logger = await createAppLogger({
      route: "/api/clients/ensure",
      method: "POST",
      action: "CREATE",
      resource: "clients",
      operation: "ensure_company_contact_category",
      query: "companies/client_lookup.select + companies.insert + contacts.insert + company_categories.upsert",
      metadata: {
        company: body?.company || null,
        contactName: body?.contactName || null,
        category: body?.category || null,
      },
    })

    const session = logger.session || await getServerSession()
    if (!session) {
      await logger.failure({ statusCode: 401, error: new Error("Not authenticated") })
      return NextResponse.json({ success: false, message: "Not authenticated" }, { status: 401 })
    }

    const companyName = text(body.company)
    const contactName = text(body.contactName)
    const phone = normalizePhone(body.phone)
    const email = text(body.email)
    const categoryName = text(body.category)
    const { city, state } = splitLocation(body.location)

    if (!companyName || !contactName) {
      await logger.failure({
        statusCode: 400,
        error: new Error("Company and Contact Name are required before saving a new client."),
      })
      return NextResponse.json(
        { success: false, message: "Company and Contact Name are required before saving a new client." },
        { status: 400 },
      )
    }

    const supabase = getSupabaseAdminClient()

    const { company: existingCompany, error: companyLookupError } = await findExistingCompany(supabase, companyName)

    if (companyLookupError) {
      console.error("[clients-ensure] company lookup", serializeSupabaseError(companyLookupError))
      await logger.failure({
        statusCode: 500,
        error: companyLookupError,
        metadata: { query: "client_lookup.select/company.select", companyName },
      })
      return NextResponse.json({ success: false, message: "Unable to check existing company." }, { status: 500 })
    }

    let company = existingCompany as { company_id: number | string; company_name: string } | null
    let categoryId: number | string | null = null

    if (!company) {
      const { data: newCompany, error: companyError } = await supabase
        .from("companies")
        .insert({
          company_name: companyName,
        })
        .select("company_id, company_name")
        .single()

      if (companyError) {
        console.error("[clients-ensure] company insert", serializeSupabaseError(companyError))
        await logger.failure({
          statusCode: 500,
          error: companyError,
          metadata: { query: "companies.insert", companyName },
        })
        return NextResponse.json({ success: false, message: "Unable to create company." }, { status: 500 })
      }

      company = newCompany as { company_id: number | string; company_name: string }
    }

    const { data: existingContacts, error: contactLookupError } = await supabase
      .from("contacts")
      .select("contact_id, contact_person_name, phone_no, email, city, state")
      .eq("company_id", company.company_id)
      .limit(200)

    if (contactLookupError) {
      console.error("[clients-ensure] contact lookup", serializeSupabaseError(contactLookupError))
      await logger.failure({
        statusCode: 500,
        targetId: company.company_id,
        error: contactLookupError,
        metadata: { query: "contacts.select", company_id: company.company_id },
      })
      return NextResponse.json({ success: false, message: "Unable to check existing contacts." }, { status: 500 })
    }

    let contact = ((existingContacts || []) as ContactRow[]).find((candidate) =>
      sameContact(candidate, { contactName, phone, email }),
    )

    if (!contact) {
      const { data: newContact, error: contactError } = await supabase
        .from("contacts")
        .insert({
          company_id: company.company_id,
          contact_person_name: contactName,
          phone_no: phone || null,
          email: email || null,
          city: city || null,
          state: state || null,
          is_primary: true,
          is_active: true,
        })
        .select("contact_id, contact_person_name, phone_no, email, city, state")
        .single()

      if (contactError) {
        console.error("[clients-ensure] contact insert", serializeSupabaseError(contactError))
        await logger.failure({
          statusCode: 500,
          targetId: company.company_id,
          error: contactError,
          metadata: { query: "contacts.insert", company_id: company.company_id },
        })
        return NextResponse.json({ success: false, message: "Unable to create contact." }, { status: 500 })
      }

      contact = newContact as ContactRow
    }

    if (categoryName) {
      const { data: category, error: categoryError } = await supabase
        .from("categories")
        .select("category_id, category_name")
        .ilike("category_name", categoryName)
        .eq("is_active", true)
        .maybeSingle()

      if (categoryError) {
        console.error("[clients-ensure] category lookup", serializeSupabaseError(categoryError))
        await logger.failure({
          statusCode: 207,
          targetId: company.company_id,
          error: categoryError,
          metadata: { query: "categories.select", categoryName },
        })
      } else if (category) {
        categoryId = category.category_id as number | string
        const { error: relationshipError } = await supabase
          .from("company_categories")
          .upsert(
            {
              company_id: company.company_id,
              category_id: category.category_id,
            },
            {
              onConflict: "company_id,category_id",
              ignoreDuplicates: true,
            },
          )

        if (relationshipError) {
          console.error("[clients-ensure] category relationship", serializeSupabaseError(relationshipError))
          await logger.failure({
            statusCode: 207,
            targetId: company.company_id,
            error: relationshipError,
            metadata: { query: "company_categories.upsert", company_id: company.company_id, category_id: category.category_id },
          })
        }
      }
    }

    await logger.success({
      statusCode: 200,
      targetId: company.company_id,
      metadata: {
        company_id: company.company_id,
        contact_id: contact.contact_id,
        category_id: categoryId,
        companyCreated: !existingCompany,
        contactCreated: !((existingContacts || []) as ContactRow[]).some((candidate) =>
          sameContact(candidate, { contactName, phone, email }),
        ),
      },
    })

    return NextResponse.json({
      success: true,
      data: {
        company_id: company.company_id,
        company_name: company.company_name,
        contact_id: contact.contact_id,
        category_id: categoryId,
        contact_person_name: contact.contact_person_name || contactName,
        phone: contact.phone_no || phone,
        email: contact.email || email,
        category: categoryName,
        location: joinLocation(contact.city || city, contact.state || state),
      },
    })
  } catch (error) {
    console.error("[clients-ensure]", error)
    await logger?.failure({ statusCode: 500, error })
    return NextResponse.json({ success: false, message: "Unable to save client." }, { status: 500 })
  }
}
