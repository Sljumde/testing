const KOROSUNO_SHEET = "Korosuno";
const REQUEST_LOG_SHEET = "InquiryRequestLog";
const SEQUENCE_SHEET = "InquirySequence";
const SEQUENCE_FLOOR_PROPERTY = "INQUIRY_SEQUENCE_FLOOR";
const SHARED_SECRET_PROPERTY = "CRM_APPS_SCRIPT_SECRET";
const LEASE_MS = 90 * 1000;

const KOROSUNO_HEADERS = [
  "Inquiry No",
  "Timestamp",
  "Company",
  "Contact Name",
  "Phone",
  "Email",
  "Category",
  "Details",
  "Lead Source",
  "Sales Person Email",
  "Sales Stage",
  "Update Remarks",
  "Next Steps",
  "Next Followup Date",
  "Budget",
  "Quantity",
  "TS Backup",
  "OCCASSION",
  "LOCATION",
  "Inquiry Type",
  "2nd Owner",
  "Back Office",
  "1st Owner",
  "Lead Generator",
];

const REQUEST_LOG_HEADERS = [
  "REQUEST_ID",
  "INQUIRY_NO",
  "STATUS",
  "STAGE",
  "ACTOR_EMAIL",
  "PAYLOAD_HASH",
  "ROW_JSON",
  "KOROSUNO_ROW",
  "ATTEMPT_TOKEN",
  "LEASE_UNTIL",
  "CREATED_AT",
  "UPDATED_AT",
  "ERROR_CODE",
  "ERROR_MESSAGE",
];

function doPost(e) {
  try {
    const request = JSON.parse((e && e.postData && e.postData.contents) || "{}");
    validateSecret_(request.secret);

    if (request.action === "createKorosunoInquiry") {
      return json_(createKorosunoInquiry_(request));
    }
    if (request.action === "getKorosunoInquiryStatus") {
      return json_(getKorosunoInquiryStatus_(request));
    }

    return json_(failure_("UNKNOWN_ACTION", "Unknown action", 400));
  } catch (error) {
    return json_(failure_(error.code || "APPS_SCRIPT_ERROR", error.message || String(error), error.status || 500));
  }
}

function setupKorosuno() {
  const ss = SpreadsheetApp.getActive();
  ensureHeaders_(ss, KOROSUNO_SHEET, KOROSUNO_HEADERS);
  ensureHeaders_(ss, REQUEST_LOG_SHEET, REQUEST_LOG_HEADERS);

  let sequenceSheet = ss.getSheetByName(SEQUENCE_SHEET);
  if (!sequenceSheet) sequenceSheet = ss.insertSheet(SEQUENCE_SHEET);
  if (sequenceSheet.getRange("A1").getValue() !== "COUNTER") {
    sequenceSheet.getRange("A1").setValue("COUNTER");
  }
  if (!Number(sequenceSheet.getRange("B1").getValue())) {
    sequenceSheet.getRange("B1").setValue(20000);
  }

  return {
    ok: true,
    korosunoHeaders: KOROSUNO_HEADERS,
    requestLogHeaders: REQUEST_LOG_HEADERS,
    sequenceB1: Number(sequenceSheet.getRange("B1").getValue()),
  };
}

function repairInquirySequence() {
  const lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    const ss = SpreadsheetApp.getActive();
    setupKorosuno();

    const sequenceSheet = ss.getSheetByName(SEQUENCE_SHEET);
    const previousB1 = toNumber_(sequenceSheet.getRange("B1").getValue());
    const maxFromInquiries = maxFromColumnA_(ss, "Inquiries");
    const maxFromKorosuno = maxFromColumnA_(ss, KOROSUNO_SHEET);
    const maxFromBackup = maxFromColumnA_(ss, "BACKUP");
    const maxFromDeleted = maxFromColumnA_(ss, "DELETED");
    const maxFromRequestLog = maxFromRequestLog_(ss);
    const storedBefore = toNumber_(PropertiesService.getScriptProperties().getProperty(SEQUENCE_FLOOR_PROPERTY));
    const finalB1 = Math.max(previousB1, maxFromInquiries, maxFromKorosuno, maxFromBackup, maxFromDeleted, maxFromRequestLog, storedBefore, 20000);

    sequenceSheet.getRange("A1:B1").setValues([["COUNTER", finalB1]]);
    PropertiesService.getScriptProperties().setProperty(SEQUENCE_FLOOR_PROPERTY, String(finalB1));

    return {
      ok: true,
      previousB1,
      maximumFromInquiries: maxFromInquiries,
      maximumFromKorosuno: maxFromKorosuno,
      maximumFromBACKUP: maxFromBackup,
      maximumFromDELETED: maxFromDeleted,
      maximumFromInquiryRequestLog: maxFromRequestLog,
      finalCorrectedB1: finalB1,
      storedFloor: finalB1,
    };
  } finally {
    lock.releaseLock();
  }
}

function createKorosunoInquiry_(request) {
  const timings = {};
  const totalStartedAt = Date.now();
  const requestId = requireUuid_(request.requestId);
  const actorEmail = requireEmail_(request.actorEmail);
  const payload = normalizePayload_(request.businessPayload || {});
  const payloadHash = stablePayloadHash_(payload);
  const suppliedHash = String(request.payloadHash || "");

  if (suppliedHash && suppliedHash !== payloadHash) {
    throw appError_("PAYLOAD_HASH_MISMATCH", "Payload hash mismatch", 409);
  }

  const lock = LockService.getScriptLock();
  const lockStartedAt = Date.now();
  lock.waitLock(30000);
  timings.scriptLockWaitMs = Date.now() - lockStartedAt;

  let rowJson;
  let inquiryNo;
  let attemptToken;
  let logRowNumber;
  let created = false;

  try {
    const ss = SpreadsheetApp.getActive();
    const lookupStartedAt = Date.now();
    const existing = findRequestLog_(ss, requestId);
    timings.requestLogLookupMs = Date.now() - lookupStartedAt;

    if (existing) {
      if (existing.PAYLOAD_HASH && existing.PAYLOAD_HASH !== payloadHash) {
        return failure_("REQUEST_ID_PAYLOAD_MISMATCH", "The same requestId was used with different inquiry data", 409);
      }

      if (existing.STATUS === "SUCCESS") {
        const existingRow = JSON.parse(existing.ROW_JSON || "[]");
        return successResponse_(requestId, existing, existingRow, true, false, timings, totalStartedAt);
      }

      if (existing.STATUS === "WRITING" && new Date(existing.LEASE_UNTIL).getTime() > Date.now()) {
        return {
          ok: true,
          success: false,
          requestId,
          status: "WRITING",
          stage: existing.STAGE || "KOROSUNO_WRITE_PENDING",
          inquiryNo: String(existing.INQUIRY_NO || ""),
          errorCode: "PENDING",
          timings: finishTimings_(timings, totalStartedAt),
        };
      }

      inquiryNo = toNumber_(existing.INQUIRY_NO);
      rowJson = existing.ROW_JSON;
      attemptToken = Utilities.getUuid();
      logRowNumber = existing.rowNumber;
      updateRequestLog_(ss, logRowNumber, {
        STATUS: "WRITING",
        STAGE: "RECOVERY_CLAIMED",
        ATTEMPT_TOKEN: attemptToken,
        LEASE_UNTIL: new Date(Date.now() + LEASE_MS).toISOString(),
        UPDATED_AT: timestamp_(),
        ERROR_CODE: "",
        ERROR_MESSAGE: "",
      });
    } else {
      const allocationStartedAt = Date.now();
      inquiryNo = allocateInquiryNo_(ss);
      timings.sequenceAllocationMs = Date.now() - allocationStartedAt;
      const ts = timestamp_();
      const row = buildKorosunoRow_(inquiryNo, ts, actorEmail, payload);
      rowJson = JSON.stringify(row);
      attemptToken = Utilities.getUuid();
      logRowNumber = appendRequestLog_(ss, {
        REQUEST_ID: requestId,
        INQUIRY_NO: inquiryNo,
        STATUS: "WRITING",
        STAGE: "RESERVED",
        ACTOR_EMAIL: actorEmail,
        PAYLOAD_HASH: payloadHash,
        ROW_JSON: rowJson,
        KOROSUNO_ROW: "",
        ATTEMPT_TOKEN: attemptToken,
        LEASE_UNTIL: new Date(Date.now() + LEASE_MS).toISOString(),
        CREATED_AT: ts,
        UPDATED_AT: ts,
        ERROR_CODE: "",
        ERROR_MESSAGE: "",
      });
      created = true;
    }
  } finally {
    lock.releaseLock();
  }

  const row = JSON.parse(rowJson);
  let korosunoRow = findInquiryNoRow_(KOROSUNO_SHEET, inquiryNo);

  if (!korosunoRow) {
    const appendStartedAt = Date.now();
    korosunoRow = appendKorosunoRow_(row);
    timings.korosunoAppendMs = Date.now() - appendStartedAt;
  }

  const finalLock = LockService.getScriptLock();
  finalLock.waitLock(30000);
  try {
    const ss = SpreadsheetApp.getActive();
    const current = findRequestLog_(ss, requestId);
    if (!current || current.ATTEMPT_TOKEN !== attemptToken) {
      return failure_("ATTEMPT_TOKEN_LOST", "Request ownership changed during write", 409);
    }

    const finalizeStartedAt = Date.now();
    updateRequestLog_(ss, current.rowNumber, {
      STATUS: "SUCCESS",
      STAGE: "KOROSUNO_SAVED",
      KOROSUNO_ROW: korosunoRow,
      UPDATED_AT: timestamp_(),
      ERROR_CODE: "",
      ERROR_MESSAGE: "",
    });
    timings.logFinalizationMs = Date.now() - finalizeStartedAt;

    return successResponse_(requestId, { INQUIRY_NO: inquiryNo, KOROSUNO_ROW: korosunoRow, ACTOR_EMAIL: actorEmail, STAGE: "KOROSUNO_SAVED" }, row, false, created, timings, totalStartedAt);
  } finally {
    finalLock.releaseLock();
  }
}

function getKorosunoInquiryStatus_(request) {
  const requestId = requireUuid_(request.requestId);
  const ss = SpreadsheetApp.getActive();
  const existing = findRequestLog_(ss, requestId);
  if (!existing) {
    return failure_("REQUEST_NOT_FOUND", "Request not found", 404);
  }
  const row = existing.ROW_JSON ? JSON.parse(existing.ROW_JSON) : [];
  return {
    ok: true,
    success: true,
    requestId,
    status: existing.STATUS,
    stage: existing.STAGE,
    inquiryNo: String(existing.INQUIRY_NO || "") || null,
    company: row[2] || "",
    contactName: row[3] || "",
    errorCode: existing.ERROR_CODE || null,
  };
}

function allocateInquiryNo_(ss) {
  let sequenceSheet = ss.getSheetByName(SEQUENCE_SHEET);
  if (!sequenceSheet) sequenceSheet = ss.insertSheet(SEQUENCE_SHEET);
  if (sequenceSheet.getRange("A1").getValue() !== "COUNTER") {
    sequenceSheet.getRange("A1").setValue("COUNTER");
  }

  const currentB1 = toNumber_(sequenceSheet.getRange("B1").getValue());
  const storedFloor = toNumber_(PropertiesService.getScriptProperties().getProperty(SEQUENCE_FLOOR_PROPERTY));
  const nextInquiryNo = Math.max(currentB1, storedFloor, 20000) + 1;
  sequenceSheet.getRange("B1").setValue(nextInquiryNo);
  PropertiesService.getScriptProperties().setProperty(SEQUENCE_FLOOR_PROPERTY, String(nextInquiryNo));
  return nextInquiryNo;
}

function buildKorosunoRow_(inquiryNo, ts, actorEmail, payload) {
  return [
    String(inquiryNo),
    ts,
    payload.company,
    payload.contactName,
    payload.phone,
    payload.email,
    payload.category,
    payload.details,
    payload.leadSource,
    actorEmail,
    payload.salesStage,
    payload.updateRemarks,
    payload.nextSteps,
    payload.nextFollowupDate,
    payload.budget,
    payload.quantity,
    ts,
    payload.occasion,
    payload.location,
    payload.inquiryType,
    payload.secondOwner,
    payload.backOffice,
    payload.firstOwner,
    payload.leadGenerator,
  ].map((value) => value === null || value === undefined || Number.isNaN(value) ? "" : value);
}

function appendKorosunoRow_(row) {
  const response = Sheets.Spreadsheets.Values.append(
    { values: [row] },
    SpreadsheetApp.getActive().getId(),
    `${KOROSUNO_SHEET}!A:X`,
    { valueInputOption: "RAW", insertDataOption: "INSERT_ROWS" }
  );
  const updatedRange = response.updates && response.updates.updatedRange;
  const match = String(updatedRange || "").match(/![A-Z]+(\d+):/);
  if (!match) throw appError_("APPEND_RANGE_MISSING", "Could not determine appended Korosuno row", 500);
  return Number(match[1]);
}

function findInquiryNoRow_(sheetName, inquiryNo) {
  const sheet = SpreadsheetApp.getActive().getSheetByName(sheetName);
  if (!sheet || sheet.getLastRow() < 2) return null;
  const values = sheet.getRange(2, 1, sheet.getLastRow() - 1, 1).getValues();
  for (let i = 0; i < values.length; i += 1) {
    if (toNumber_(values[i][0]) === inquiryNo) return i + 2;
  }
  return null;
}

function normalizePayload_(payload) {
  const normalized = {
    company: text_(payload.company),
    contactName: text_(payload.contactName),
    phone: text_(payload.phone),
    email: text_(payload.email),
    category: text_(payload.category),
    details: text_(payload.details),
    leadSource: text_(payload.leadSource),
    salesStage: text_(payload.salesStage),
    updateRemarks: text_(payload.updateRemarks),
    nextSteps: text_(payload.nextSteps),
    nextFollowupDate: text_(payload.nextFollowupDate),
    budget: numberOrBlank_(payload.budget),
    quantity: numberOrBlank_(payload.quantity),
    occasion: text_(payload.occasion),
    location: text_(payload.location),
    inquiryType: text_(payload.inquiryType),
    secondOwner: text_(payload.secondOwner),
    backOffice: text_(payload.backOffice),
    firstOwner: text_(payload.firstOwner),
    leadGenerator: text_(payload.leadGenerator),
  };

  ["company", "contactName", "phone", "category", "salesStage", "nextSteps", "nextFollowupDate", "budget", "quantity", "occasion", "location", "inquiryType", "secondOwner", "backOffice", "firstOwner", "leadGenerator"].forEach((key) => {
    if (normalized[key] === "") throw appError_("VALIDATION_FAILED", `Missing required field: ${key}`, 400);
  });

  return normalized;
}

function stablePayloadHash_(payload) {
  const ordered = {};
  Object.keys(payload).sort().forEach((key) => {
    ordered[key] = payload[key];
  });
  const digest = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, JSON.stringify(ordered), Utilities.Charset.UTF_8);
  return digest.map((byte) => (`0${(byte < 0 ? byte + 256 : byte).toString(16)}`).slice(-2)).join("");
}

function findRequestLog_(ss, requestId) {
  const sheet = ss.getSheetByName(REQUEST_LOG_SHEET);
  if (!sheet || sheet.getLastRow() < 2) return null;
  const rows = sheet.getRange(2, 1, sheet.getLastRow() - 1, REQUEST_LOG_HEADERS.length).getValues();
  for (let i = 0; i < rows.length; i += 1) {
    if (rows[i][0] === requestId) {
      const record = { rowNumber: i + 2 };
      REQUEST_LOG_HEADERS.forEach((header, index) => {
        record[header] = rows[i][index];
      });
      return record;
    }
  }
  return null;
}

function appendRequestLog_(ss, record) {
  const sheet = ss.getSheetByName(REQUEST_LOG_SHEET);
  sheet.appendRow(REQUEST_LOG_HEADERS.map((header) => record[header] === undefined ? "" : record[header]));
  return sheet.getLastRow();
}

function updateRequestLog_(ss, rowNumber, patch) {
  const sheet = ss.getSheetByName(REQUEST_LOG_SHEET);
  Object.keys(patch).forEach((key) => {
    const index = REQUEST_LOG_HEADERS.indexOf(key);
    if (index >= 0) sheet.getRange(rowNumber, index + 1).setValue(patch[key]);
  });
}

function ensureHeaders_(ss, sheetName, headers) {
  let sheet = ss.getSheetByName(sheetName);
  if (!sheet) sheet = ss.insertSheet(sheetName);
  sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
  return sheet;
}

function maxFromColumnA_(ss, sheetName) {
  const sheet = ss.getSheetByName(sheetName);
  if (!sheet || sheet.getLastRow() < 2) return 0;
  return Math.max.apply(null, sheet.getRange(2, 1, sheet.getLastRow() - 1, 1).getValues().map((row) => toNumber_(row[0])).concat([0]));
}

function maxFromRequestLog_(ss) {
  const sheet = ss.getSheetByName(REQUEST_LOG_SHEET);
  if (!sheet || sheet.getLastRow() < 2) return 0;
  return Math.max.apply(null, sheet.getRange(2, 2, sheet.getLastRow() - 1, 1).getValues().map((row) => toNumber_(row[0])).concat([0]));
}

function successResponse_(requestId, record, row, idempotent, created, timings, totalStartedAt) {
  return {
    ok: true,
    success: true,
    requestId,
    inquiryNo: String(record.INQUIRY_NO || ""),
    created,
    idempotent,
    company: row[2] || "",
    contactName: row[3] || "",
    actorEmail: record.ACTOR_EMAIL || row[9] || "",
    korosunoRow: toNumber_(record.KOROSUNO_ROW) || null,
    stage: record.STAGE || "KOROSUNO_SAVED",
    timings: finishTimings_(timings, totalStartedAt),
  };
}

function finishTimings_(timings, totalStartedAt) {
  timings.totalAppsScriptDurationMs = Date.now() - totalStartedAt;
  return timings;
}

function validateSecret_(secret) {
  const expected = PropertiesService.getScriptProperties().getProperty(SHARED_SECRET_PROPERTY);
  if (!expected || secret !== expected) throw appError_("UNAUTHORIZED", "Invalid Apps Script secret", 401);
}

function requireUuid_(value) {
  const text = String(value || "").trim();
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(text)) {
    throw appError_("INVALID_REQUEST_ID", "Invalid requestId", 400);
  }
  return text;
}

function requireEmail_(value) {
  const text = String(value || "").trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(text)) throw appError_("INVALID_ACTOR_EMAIL", "Invalid actorEmail", 400);
  return text;
}

function timestamp_() {
  return Utilities.formatDate(new Date(), "Asia/Kolkata", "yyyy-MM-dd HH:mm:ss");
}

function text_(value) {
  return value === null || value === undefined ? "" : String(value).trim();
}

function numberOrBlank_(value) {
  if (value === null || value === undefined || String(value).trim() === "") return "";
  const parsed = Number(String(value).replace(/,/g, ""));
  if (!Number.isFinite(parsed)) throw appError_("VALIDATION_FAILED", "Budget and Quantity must be valid numbers", 400);
  return parsed;
}

function toNumber_(value) {
  const parsed = Number(String(value || "").replace(/[^\d.-]/g, ""));
  return Number.isFinite(parsed) ? parsed : 0;
}

function failure_(code, message, status) {
  return { ok: false, success: false, errorCode: code, errorMessage: message, statusCode: status || 500 };
}

function appError_(code, message, status) {
  const error = new Error(message);
  error.code = code;
  error.status = status;
  return error;
}

function json_(payload) {
  return ContentService.createTextOutput(JSON.stringify(payload)).setMimeType(ContentService.MimeType.JSON);
}
