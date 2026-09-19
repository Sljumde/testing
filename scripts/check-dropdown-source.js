const fs = require("node:fs")
const { google } = require("googleapis")

function loadLocalEnv() {
  if (!fs.existsSync(".env.local")) return

  for (const line of fs.readFileSync(".env.local", "utf8").split(/\r?\n/)) {
    const index = line.indexOf("=")
    if (index <= 0 || line.trim().startsWith("#")) continue

    const key = line.slice(0, index).trim()
    let value = line.slice(index + 1).trim()
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1)
    }
    if (!process.env[key]) process.env[key] = value
  }
}

async function main() {
  loadLocalEnv()

  const auth = new google.auth.GoogleAuth({
    credentials: {
      client_email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
      private_key: process.env.GOOGLE_PRIVATE_KEY.replace(/\\n/g, "\n"),
    },
    scopes: ["https://www.googleapis.com/auth/spreadsheets.readonly"],
  })
  const sheets = google.sheets({ version: "v4", auth })
  const spreadsheetId = process.env.GOOGLE_SHEET_ID

  const metadata = await sheets.spreadsheets.get({
    spreadsheetId,
    fields: "sheets.properties.title",
  })

  const titles = (metadata.data.sheets || []).map((sheet) => sheet.properties.title)
  const result = {
    hasDropdownData: titles.includes("DropdownData"),
    hasCompanyContacts: titles.includes("CompanyContacts"),
    matchingTabs: titles.filter((title) => /dropdown|contact|company/i.test(title)),
  }

  if (result.hasDropdownData) {
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: "DropdownData!A:ZZ",
    })
    const values = response.data.values || []
    const headers = values[0] || []

    result.dropdownHeaders = headers
    result.dropdownColumns = headers.map((header, index) => ({
      header,
      nonEmptyCount: values.slice(1).filter((row) => String(row[index] || "").trim()).length,
      samples: values
        .slice(1)
        .map((row) => String(row[index] || "").trim())
        .filter(Boolean)
        .slice(0, 5),
    }))
  }

  if (result.hasCompanyContacts) {
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: "CompanyContacts!1:5",
    })
    const values = response.data.values || []
    result.companyContactHeaders = values[0] || []
    result.companyContactSampleRows = values.slice(1)
  }

  console.log(JSON.stringify(result, null, 2))
}

main().catch((error) => {
  console.error(JSON.stringify({ message: error.message, code: error.code, errors: error.errors }, null, 2))
  process.exit(1)
})
