/**
• ================================================================
• FINORA - GOOGLE APPS SCRIPT API
• ================================================================
• Files:
• Code.gs : API, database, authentication, loans, payments
• index.html : Borrower / public frontend (GitHub Pages)
• dashboard.html: Admin frontend
• Database:
• Google Sheets, selected by SPREADSHEET_ID Script Property
• Important:
A. Run setupDatabase() manually once after configuring properties.
C. Deploy as a Web App and use the /exec URL in API_URL.
E. Keep all secret values in Script Properties.
G. Payment verification does not itself transfer money.
I. Do not use this code to release real loans until the complete
• deployment has been security-tested and legally reviewed.
• API request format:
• POST application body as JSON text:
• {"action":"health"}
• API response format:
• {"ok":true,"message":"..."}
• {"ok":false,"message":"...","code":"..."}
• ================================================================
*/

/* ================================================================
A. DATABASE SCHEMAS
• ================================================================
*/

var FINORA_SCHEMAS = {
Users: [
"userId",
"prefix",
"fullName",
"dob",
"nationalIdHash",
"nationalIdLast4",
"phone",
"email",
"passwordSalt",
"passwordHash",
"emailVerified",
"status",
"role",
"termsVersion",
"termsAcceptedAt",
"privacyVersion",
"privacyAcceptedAt",
"createdAt",
"updatedAt",
"lastLoginAt"
 ],

EmailTokens: [
"tokenId",
"email",
"tokenHash",
"purpose",
"expiresAt",
"usedAt",
"createdAt"
 ],

VerifiedEmails: [
"verificationId",
"email",
"tokenId",
"verifiedAt",
"expiresAt",
"consumedAt",
"createdAt"
 ],

Sessions: [
"sessionId",
"userId",
"tokenHash",
"createdAt",
"expiresAt",
"lastSeenAt",
"revokedAt",
"rememberMe"
 ],

Products: [
"productId",
"name",
"description",
"minAmount",
"maxAmount",
"minInstallments",
"maxInstallments",
"frequenciesJson",
"interestRateAnnual",
"interestMethod",
"feeFixed",
"feePercent",
"enabled",
"licenseType",
"maxEffectiveAnnualRate",
"legalReviewed",
"legalReviewedAt",
"legalReviewedBy",
"createdAt",
"updatedAt"
 ],

Loans: [
"loanId",
"userId",
"productId",
"productName",
"purpose",
"purposeDetails",
"requestedAmount",
"approvedAmount",
"frequency",
"dailyMode",
"weeklyDay",
"monthlyDay",
"firstDueDate",
"installments",
"interestRateAnnual",
"interestMethod",
"status",
"appliedAt",
"reviewedBy",
"reviewedAt",
"decisionNote",
"offerExpiresAt",
"acceptedAt",
"disbursedAt",
"disbursedBy",
"disbursementRef",
"disbursementSlipUrl",
"disbursementSlipAlt",
"disbursementEmailSentAt",
"outstandingPrincipal",
"outstandingTotal",
"createdAt",
"updatedAt"
 ],

Installments: [
"installmentId",
"loanId",
"userId",
"installmentNo",
"dueDate",
"principalAmount",
"interestAmount",
"feeAmount",
"totalDue",
"paidAmount",
"status",
"reminderDueDaySentAt",
"reminderNoonSentAt",
"reminderEveningSentAt",
"overdueOneDaySentAt",
"receiptEmailSentAt",
"createdAt",
"updatedAt"
 ],

Payments: [
"paymentId",
"userId",
"loanId",
"installmentIdsJson",
"amount",
"currency",
"method",
"qrPayload",
"qrRef",
"expiresAt",
"status",
"slipAmount",
"slipTransRef",
"slipFingerprint",
"slipDate",
"slipSenderBank",
"slipReceiverBank",
"slipVerifiedAt",
"verificationMessage",
"createdAt",
"updatedAt",
"reviewedBy",
"reviewNote"
 ],

Announcements: [
"announcementId",
"title",
"placement",
"contentHtml",
"imageUrl",
"imageAlt",
"startAt",
"endAt",
"isActive",
"createdBy",
"createdAt",
"updatedAt"
 ],

Maintenance: [
"settingId",
"enabled",
"startAt",
"endAt",
"title",
"messageHtml",
"imageUrl",
"imageAlt",
"updatedBy",
"updatedAt"
 ],

Notifications: [
"notificationId",
"userId",
"title",
"contentHtml",
"loanId",
"isActive",
"createdBy",
"createdAt",
"readAt",
"dismissedAt"
 ],

SupportTickets: [
"ticketId",
"userId",
"subject",
"category",
"message",
"status",
"assignedTo",
"createdAt",
"updatedAt",
"closedAt",
"staffNote"
 ],

LoanSupplemental: [
"supplementalId",
"loanId",
"userId",
"status",
"version",
"formDataJson",
"submittedDataJson",
"returnedReason",
"adminNote",
"submittedAt",
"reviewedAt",
"reviewedBy",
"createdAt",
"updatedAt"
 ],

LoanSupplementalDocuments: [
"documentId",
"loanId",
"supplementalId",
"version",
"documentType",
"documentName",
"driveFileId",
"mimeType",
"fileSize",
"uploadedAt",
"uploadedBy",
"reviewStatus",
"reviewNote",
"reviewedAt",
"reviewedBy",
"isDeleted"
 ],

LoanSupplementalSignatures: [
"signatureId",
"loanId",
"supplementalId",
"version",
"signatureType",
"driveFileId",
"mimeType",
"fileSize",
"signedAt",
"signerUserId",
"consentTextVersion",
"verificationStatus"
 ],

LoanSupplementalConsents: [
"consentId",
"loanId",
"supplementalId",
"userId",
"version",
"consentType",
"documentVersion",
"accepted",
"acceptedAt",
"withdrawnAt",
"createdAt"
 ],

LoanSupplementalHistory: [
"historyId",
"loanId",
"supplementalId",
"version",
"actorUserId",
"actorRole",
"action",
"fieldName",
"oldValue",
"newValue",
"reason",
"timestamp",
"requestId"
 ],

LoanSupplementalVersions: [
"snapshotId",
"loanId",
"supplementalId",
"userId",
"version",
"dataJson",
"snapshotHash",
"submittedBy",
"submittedAt",
"requestId"
 ],

SystemLogs: [
"logId",
"actorUserId",
"action",
"entityType",
"entityId",
"detailsJson",
"createdAt"
 ]
};

/* ================================================================
B. WEB APP ENTRY POINTS
• ================================================================
*/

/**
• Public GET endpoint.
• Intended for basic health checking only.
*/
function doGet(e) {
try {
var action = e && e.parameter
? String(e.parameter.action || "health")
: "health";

if (action === "health") {
return jsonOutput_({
ok: true,
app: getProperty_("APP_NAME", "FINORA"),
status: "available",
timestamp: nowIso_()
});
}

return jsonOutput_({
ok: false,
message: "ไม่รองรับคำขอ GET นี้",
code: "UNSUPPORTED_GET"
});

} catch (err) {
console.error("doGet error: " + String(err));

return jsonOutput_({
ok: false,
message: "ระบบไม่สามารถดำเนินการได้",
code: "INTERNAL_ERROR"
});
}
}

/**
• Main API endpoint.
• Frontend should send:
• POST /exec
• Body: JSON.stringify({ action: "health" })
• For a static GitHub frontend, begin with a simple text/plain request
• without custom authorization headers. Browser CORS behavior must be
• tested with the deployed /exec endpoint.
*/
function doPost(e) {
try {
if (!e || !e.postData || !e.postData.contents) {
throwPublic_(
"กรุณาส่งข้อมูลคำขอให้ถูกต้อง",
"EMPTY_REQUEST"
);
}

if (e.postData.contents.length > 8 * 1024 * 1024) {
throwPublic_(
"ข้อมูลที่ส่งมีขนาดใหญ่เกินไป",
"REQUEST_TOO_LARGE"
);
}

var payload;

try {
payload = JSON.parse(e.postData.contents);
} catch (parseError) {
throwPublic_(
"รูปแบบข้อมูลไม่ถูกต้อง",
"INVALID_JSON"
);
}

if (!payload || typeof payload !== "object" ||
Array.isArray(payload)) {
throwPublic_(
"รูปแบบคำขอไม่ถูกต้อง",
"INVALID_REQUEST"
);
}

var action = String(payload.action || "").trim();

if (!action) {
throwPublic_(
"กรุณาระบุ action",
"MISSING_ACTION"
);
}

var result = dispatchApi_(action, payload);

return jsonOutput_(
Object.assign(
{
ok: true
},
result || {}
)
);

} catch (err) {
var errorMessage = String(err && err.message
? err.message
: err);

var isPublicError =
errorMessage.indexOf("FINORA_PUBLIC:") === 0;

var debugMode =
getProperty_("FINORA_DEBUG_MODE", "false").toLowerCase() === "true";

var publicMessage = isPublicError
? errorMessage.substring("FINORA_PUBLIC:".length)
: (
debugMode
? errorMessage
: "ระบบเกิดข้อผิดพลาด กรุณาลองใหม่อีกครั้ง"
);
var publicCode = "INTERNAL_ERROR";

if (isPublicError) {
var marker = publicMessage.indexOf("|CODE:");

if (marker >= 0) {
publicCode = publicMessage.substring(marker + 6);
publicMessage = publicMessage.substring(0, marker);
}
}

if (!isPublicError) {
var errorDetails =
"FINORA API ERROR: " +
errorMessage +
"\n" +
(err && err.stack ? err.stack : "");

console.error(errorDetails);
Logger.log(errorDetails);
}
}
return jsonOutput_({
ok: false,
message: publicMessage,
code: publicCode
});
}

/**
• Route every supported API action.
*/
function dispatchApi_(action, p) {
switch (action) {

/* -------- PUBLIC / SYSTEM -------- */

case "health":
return apiHealth_();

case "setupDatabase":
requireAdminSetupKey_(p);
return setupDatabase();

case "getPublicConfig":
return getPublicConfig_();

case "getMaintenanceStatus":
return getMaintenanceStatus_();

case "getAnnouncements":
return getAnnouncements_(p);

case "listProducts":
return listPublicProducts_(p);

/* -------- EMAIL VERIFICATION -------- */

case "beginEmailVerification":
return beginEmailVerification_(p);

case "confirmEmail":
return confirmEmail_(p);

case "checkEmailVerification":
return checkEmailVerification_(p);

/* -------- REGISTRATION / LOGIN -------- */

case "register":
return registerUser_(p);

case "login":
return loginUser_(p);

case "logout":
return logoutUser_(p);

case "me":
return getCurrentUserInfo_(p);

/* -------- PASSWORD RESET -------- */

case "forgotPassword":
return forgotPassword_(p);

case "validateResetToken":
return validateResetToken_(p);

case "resetPassword":
return resetPassword_(p);

/* -------- BORROWER -------- */

case "borrowerDashboard":
return borrowerDashboard_(p);

case "applyLoan":
return applyLoan_(p);

case "myLoans":
return myLoans_(p);

case "getLoanSupplemental":
return borrowerGetLoanSupplemental_(p);

case "saveLoanSupplemental":
return borrowerSaveLoanSupplemental_(p);

case "uploadLoanSupplementalFile":
return borrowerUploadLoanSupplementalFile_(p);

case "submitLoanSupplemental":
return borrowerSubmitLoanSupplemental_(p);

case "acceptLoanOffer":
return acceptLoanOffer_(p);

case "myPayments":
return myPayments_(p);

case "createPaymentQR":
return createPaymentQR_(p);

case "submitSlip":
return submitSlip_(p);

case "createSupportTicket":
return createSupportTicket_(p);

case "myTickets":
return myTickets_(p);

case "getMyNotifications":
return getMyNotifications_(p);

case "dismissNotification":
return dismissNotification_(p);

case "uploadAnnouncementImage":
return uploadAnnouncementImage_(p);

/* -------- ADMIN DASHBOARD -------- */

case "adminDashboard":
return adminDashboard_(p);

case "adminSystemHealth":
return adminSystemHealth_(p);

/* -------- ADMIN USERS -------- */

case "adminListUsers":
return adminListUsers_(p);

case "adminUpdateUserStatus":
return adminUpdateUserStatus_(p);

case "adminRevokeUserSessions":
return adminRevokeUserSessions_(p);

/* -------- ADMIN LOANS -------- */

case "adminListLoans":
return adminListLoans_(p);

case "adminDecideLoan":
return adminDecideLoan_(p);

case "adminListLoanSupplementals":
return adminListLoanSupplementals_(p);

case "adminGetLoanSupplemental":
return adminGetLoanSupplemental_(p);

case "adminReviewLoanSupplemental":
return adminReviewLoanSupplemental_(p);

case "adminMarkDisbursed":
return adminMarkDisbursed_(p);

case "adminSendLoanEmail":
return adminSendLoanEmail_(p);

/* -------- ADMIN PRODUCTS -------- */

case "adminListProducts":
return adminListProducts_(p);

case "adminSaveProduct":
return adminSaveProduct_(p);

case "adminDisableProduct":
return adminDisableProduct_(p);

/* -------- ADMIN PAYMENTS -------- */

case "adminListPayments":
return adminListPayments_(p);

case "adminReviewPayment":
return adminReviewPayment_(p);

/* -------- ADMIN ANNOUNCEMENTS -------- */

case "adminListAnnouncements":
return adminListAnnouncements_(p);

case "adminSaveAnnouncement":
return adminSaveAnnouncement_(p);

case "adminDeleteAnnouncement":
return adminDeleteAnnouncement_(p);

case "adminGetMaintenance":
return adminGetMaintenance_(p);

case "adminSaveMaintenance":
return adminSaveMaintenance_(p);

case "adminListNotifications":
return adminListNotifications_(p);

case "adminCreateNotification":
return adminCreateNotification_(p);

/* -------- ADMIN SUPPORT -------- */

case "adminListTickets":
return adminListTickets_(p);

case "adminUpdateTicket":
return adminUpdateTicket_(p);

/* -------- AUDIT -------- */

case "adminListLogs":
return adminListLogs_(p);

default:
throwPublic_(
"ไม่พบคำสั่งที่ร้องขอ",
"UNKNOWN_ACTION"
);
}
}

/* ================================================================
C. SCRIPT PROPERTIES
• ================================================================
*/

function getProperty_(name, fallback) {
var value = PropertiesService
.getScriptProperties()
.getProperty(name);

if (value === null || value === undefined ||
String(value).trim() === "") {
return fallback;
}

return String(value).trim();
}

function requireProperty_(name) {
var value = getProperty_(name, "");

if (!value) {
throwPublic_(
"ระบบยังไม่ได้ตั้งค่า " + name,
"CONFIGURATION_MISSING"
);
}

return value;
}

function getConfig_() {
return {
adminEmails: getProperty_("ADMIN_EMAILS", ""),
apiUrl: getProperty_("API_URL", ""),
appName: getProperty_("APP_NAME", "FINORA"),
appUrl: getProperty_("APP_URL", ""),
dataHashSecret: getProperty_("DATA_HASH_SECRET", ""),
googleClientId: getProperty_("GOOGLE_CLIENT_ID", ""),
imgbbApiKey: getProperty_("IMGBB_API_KEY", ""),
maxImageSizeBytes: Number(
getProperty_("MAX_IMAGE_SIZE_BYTES", "4194304")
),
minAge: Number(
getProperty_("MIN_AGE", "20")
),
privacyVersion: getProperty_("PRIVACY_VERSION", "1.0"),
rememberSessionTtlSeconds: Number(
getProperty_("REMEMBER_SESSION_TTL_SECONDS", "2592000")
),
resetTokenTtlSeconds: Number(
getProperty_("RESET_TOKEN_TTL_SECONDS", "1800")
),
sessionTtlSeconds: Number(
getProperty_("SESSION_TTL_SECONDS", "86400")
),
spreadsheetId: getProperty_("SPREADSHEET_ID", ""),
termsVersion: getProperty_("TERMS_VERSION", "1.0"),
thunderApiToken: getProperty_("THUNDER_API_TOKEN", ""),
thunderMatchAccount: (
getProperty_("THUNDER_MATCH_ACCOUNT", "true").toLowerCase() === "true"
),
thunderPromptPayMsisdn: getProperty_(
"THUNDER_QR_PROMPTPAY_MSISDN",
""
),
thunderPromptPayNatId: getProperty_(
"THUNDER_QR_PROMPTPAY_NAT_ID",
""
),
verifyTokenTtlSeconds: Number(
getProperty_("VERIFY_TOKEN_TTL_SECONDS", "1800")
)
};
}

/**
• One-time administrator bootstrap key.
• Set FINORA_SETUP_KEY in Script Properties before first deployment.
• Call setupDatabase directly from the Script Editor instead of through
• the public endpoint whenever possible.
*/
function requireAdminSetupKey_(p) {
var expected = getProperty_("FINORA_SETUP_KEY", "");

if (!expected) {
throwPublic_(
"กรุณารัน setupDatabase จาก Script Editor โดยตรง",
"SETUP_ONLY"
);
}

if (!constantTimeEqual_(
String(p.setupKey || ""),
expected
)) {
throwPublic_(
"ไม่มีสิทธิ์ดำเนินการ",
"FORBIDDEN"
);
}

return true;
}

/* ================================================================
D. AUTOMATIC GOOGLE SHEETS HEADERS
• ================================================================
*/

/**
• Run this function manually from the Apps Script Editor.
• The function:
◦ Opens the spreadsheet configured in SPREADSHEET_ID.
◦ Creates missing sheets.
◦ Creates headers for new sheets.
◦ Adds any missing headers to existing sheets.
◦ Does not clear existing rows.
*/
function setupDatabase() {
var spreadsheetId = requireProperty_("SPREADSHEET_ID");

var ss;

try {
ss = SpreadsheetApp.openById(spreadsheetId);
} catch (err) {
throwPublic_(
"ไม่สามารถเปิด Google Spreadsheet ได้ กรุณาตรวจสอบ SPREADSHEET_ID และสิทธิ์การเข้าถึง",
"SPREADSHEET_ACCESS_FAILED"
);
}

var createdSheets = [];
var updatedSheets = [];
var unchangedSheets = [];

Object.keys(FINORA_SCHEMAS).forEach(function (sheetName) {
var schema = FINORA_SCHEMAS[sheetName];
var sheet = ss.getSheetByName(sheetName);

if (!sheet) {
sheet = ss.insertSheet(sheetName);
sheet.getRange(1, 1, 1, schema.length).setValues([schema]);

sheet.setFrozenRows(1);

sheet.getRange(1, 1, 1, schema.length)
.setFontWeight("bold");

createdSheets.push(sheetName);
return;
}

var lastColumn = sheet.getLastColumn();

if (lastColumn < 1) {
sheet.getRange(1, 1, 1, schema.length).setValues([schema]);
sheet.setFrozenRows(1);
sheet.getRange(1, 1, 1, schema.length)
.setFontWeight("bold");

updatedSheets.push(sheetName);
return;
}

var existingHeaders = sheet
.getRange(1, 1, 1, lastColumn)
.getDisplayValues()[0]
.map(function (header) {
return String(header).trim();
});

var addedHeaders = [];

schema.forEach(function (header) {
if (existingHeaders.indexOf(header) === -1) {
addedHeaders.push(header);
}
});

if (addedHeaders.length > 0) {
sheet.getRange(
1,
lastColumn + 1,
1,
addedHeaders.length
).setValues([addedHeaders]);

sheet.setFrozenRows(1);

sheet.getRange(
1,
1,
1,
sheet.getLastColumn()
).setFontWeight("bold");

updatedSheets.push(sheetName);

} else {
unchangedSheets.push(sheetName);
}
});

logEvent_(
"SYSTEM",
"SETUP_DATABASE",
"DATABASE",
spreadsheetId,
{
createdSheets: createdSheets,
updatedSheets: updatedSheets
}
);

// Install the one-minute scheduled reminder trigger. Running setupDatabase()
// again will not create duplicate triggers.
var automationTriggerInstalled = false;
try {
automationTriggerInstalled = installFinoraNotificationTrigger_();
} catch (triggerError) {
console.error("FINORA reminder trigger setup failed: " + String(triggerError));
}

return {
message: "สร้างและตรวจสอบหัวตารางเรียบร้อยแล้ว",
spreadsheetId: spreadsheetId,
createdSheets: createdSheets,
updatedSheets: updatedSheets,
unchangedSheets: unchangedSheets,
notificationTriggerInstalled: automationTriggerInstalled,
timestamp: nowIso_()
};
}

/* ================================================================
E. DATABASE HELPERS
• ================================================================
*/

function openDatabase_() {
var spreadsheetId = requireProperty_("SPREADSHEET_ID");

try {
return SpreadsheetApp.openById(spreadsheetId);
} catch (err) {
throwPublic_(
"ไม่สามารถเชื่อมต่อฐานข้อมูลได้",
"DATABASE_CONNECTION_FAILED"
);
}
}

function getSheet_(sheetName) {
var ss = openDatabase_();
var sheet = ss.getSheetByName(sheetName);

if (!sheet) {
throwPublic_(
"ไม่พบตาราง " + sheetName + " กรุณารัน setupDatabase()",
"TABLE_NOT_FOUND"
);
}

return sheet;
}

function getHeaders_(sheet) {
var lastColumn = sheet.getLastColumn();

if (lastColumn < 1) {
throwPublic_(
"ตารางยังไม่มีหัวตาราง",
"TABLE_SCHEMA_MISSING"
);
}

return sheet
.getRange(1, 1, 1, lastColumn)
.getDisplayValues()[0]
.map(function (header) {
return String(header).trim();
});
}

/**
• Read date-only columns as YYYY-MM-DD in the spreadsheet's own timezone.
• Google Sheets may return a date-formatted cell as a JavaScript Date. Using
• toISOString() on such cells can shift the calendar day and adds a time part,
• which breaks repayment schedule date arithmetic.
*/
function cellToRecordValue_(value, fieldName, sheet) {
var dateOnlyFields = [
"dob",
"firstDueDate",
"dueDate",
"slipDate"
];
var isDateOnlyField = dateOnlyFields.indexOf(String(fieldName || "")) >= 0;

if (isDateOnlyField) {
var timezone = Session.getScriptTimeZone();
try {
if (sheet && sheet.getParent) {
timezone = sheet.getParent().getSpreadsheetTimeZone() || timezone;
}
} catch (ignored) {
// Fall back to the script timezone if the spreadsheet timezone is unavailable.
}

if (value instanceof Date && !isNaN(value.getTime())) {
return Utilities.formatDate(value, timezone, "yyyy-MM-dd");
}

// Normalize legacy timestamps already stored as text (for example, after an
// earlier read/write cycle), using the same spreadsheet timezone.
if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}T/.test(value)) {
var parsedDate = new Date(value);
if (!isNaN(parsedDate.getTime())) {
return Utilities.formatDate(parsedDate, timezone, "yyyy-MM-dd");
}
}
}

if (value instanceof Date) {
return value.toISOString();
}

return value;
}

function getRecords_(sheetName) {
var sheet = getSheet_(sheetName);
var lastRow = sheet.getLastRow();

if (lastRow < 2) {
return [];
}

var headers = getHeaders_(sheet);

var values = sheet.getRange(
2,
1,
lastRow - 1,
headers.length
).getValues();

return values.map(function (row, index) {
var record = {
_rowNumber: index + 2,
rowNumber: index + 2
};

headers.forEach(function (header, columnIndex) {
record[header] = cellToRecordValue_(
row[columnIndex],
header,
sheet
);
});

return record;
});
}

function appendRecord_(sheetName, record) {
var sheet = getSheet_(sheetName);
var headers = getHeaders_(sheet);
var row = [];

headers.forEach(function (header) {
var value = record[header];

if (value === undefined || value === null) {
value = "";
}

row.push(value);
});

var nextRow = Math.max(2, sheet.getLastRow() + 1);

sheet.getRange(
nextRow,
1,
1,
headers.length
).setValues([row]);

return nextRow;
}

function updateRecord_(sheetName, rowNumber, updates) {
var sheet = getSheet_(sheetName);
var headers = getHeaders_(sheet);

if (rowNumber < 2 || rowNumber > sheet.getLastRow()) {
throwPublic_(
"ไม่พบรายการที่ต้องการแก้ไข",
"RECORD_NOT_FOUND"
);
}

var range = sheet.getRange(
rowNumber,
1,
1,
headers.length
);

var row = range.getValues()[0];

headers.forEach(function (header, index) {
if (Object.prototype.hasOwnProperty.call(
updates,
header
)) {
var value = updates[header];

row[index] = (
value === undefined || value === null
) ? "" : value;
}
});

range.setValues([row]);

return true;
}

function normalizeComparable_(field, value) {
var stringValue = String(
value === undefined || value === null ? "" : value
).trim();

if (field === "email" ||
field === "tokenHash" ||
field === "nationalIdHash" ||
field === "phone") {
return stringValue.toLowerCase();
}

return stringValue;
}

function findRecord_(sheetName, field, value) {
var records = getRecords_(sheetName);
var wanted = normalizeComparable_(field, value);

for (var i = 0; i < records.length; i++) {
if (normalizeComparable_(
field,
records[i][field]
) === wanted) {
return records[i];
}
}

return null;
}

function getRecordsByField_(sheetName, field, value) {
var records = getRecords_(sheetName);
var wanted = normalizeComparable_(field, value);

return records.filter(function (record) {
return normalizeComparable_(
field,
record[field]
) === wanted;
});
}

function deleteCacheKey_(key) {
CacheService.getScriptCache().remove(key);
}

/* ================================================================
F. GENERAL UTILITIES
• ================================================================
*/

function nowIso_() {
return new Date().toISOString();
}

function uuid_() {
return Utilities.getUuid().replace(/-/g, "") +
Utilities.getUuid().replace(/-/g, "");
}

function roundMoney_(value) {
return Math.round(
(Number(value) + Number.EPSILON) * 100
) / 100;
}

function parseMoney_(value) {
var number = Number(value);

if (!isFinite(number)) {
return NaN;
}

return roundMoney_(number);
}

function parseJsonArray_(value) {
if (Array.isArray(value)) {
return value;
}

try {
var parsed = JSON.parse(String(value || "[]"));

return Array.isArray(parsed)
? parsed
: [];

} catch (err) {
return [];
}
}

function jsonOutput_(data) {
return ContentService
.createTextOutput(JSON.stringify(data))
.setMimeType(ContentService.MimeType.JSON);
}

function throwPublic_(message, code) {
throw new Error(
"FINORA_PUBLIC:" +
String(message) +
"|CODE:" +
String(code || "REQUEST_FAILED")
);
}

function constantTimeEqual_(a, b) {
a = String(a || "");
b = String(b || "");

var difference = a.length ^ b.length;
var maxLength = Math.max(a.length, b.length);

for (var i = 0; i < maxLength; i++) {
difference |=
(a.charCodeAt(i) || 0) ^
(b.charCodeAt(i) || 0);
}

return difference === 0;
}

function escapeHtml_(value) {
return String(value === undefined || value === null ? "" : value)
.replace(/&/g, "&amp;")
.replace(/</g, "&lt;")
.replace(/>/g, "&gt;")
.replace(/"/g, "&quot;")
.replace(/'/g, "&#39;");
}

function escapeAttribute_(value) {
return escapeHtml_(value);
}

function normalizeEmail_(email) {
return String(email || "").trim().toLowerCase();
}

function isValidEmail_(email) {
email = normalizeEmail_(email);
if (email.length < 6 || email.length > 254) return false;
return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}
function isValidPhone_(phone) {
return /^0[0-9]{9}$/.test(String(phone || ""));
}

function isValidDateOnly_(value) {
var text = String(value || "");
if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) return false;
var parts = text.split("-").map(Number);
var date = new Date(Date.UTC(parts[0], parts[1] - 1, parts[2]));
return date.getUTCFullYear() === parts[0] &&
date.getUTCMonth() === parts[1] - 1 &&
date.getUTCDate() === parts[2];
}

function todayDateOnly_() {
var now = new Date();

return Utilities.formatDate(
now,
"Asia/Bangkok",
"yyyy-MM-dd"
);
}

function dateOnlyToUtc_(value) {
if (!isValidDateOnly_(value)) {
return null;
}

var parts = String(value).split("-").map(Number);

return new Date(Date.UTC(
parts[0],
parts[1] - 1,
parts[2]
));
}

function dateDifferenceInYears_(dateOfBirth) {
if (!isValidDateOnly_(dateOfBirth)) {
return -1;
}

var today = todayDateOnly_().split("-").map(Number);
var born = String(dateOfBirth).split("-").map(Number);

var age = today[0] - born[0];

if (
today[1] < born[1] ||
(today[1] === born[1] && today[2] < born[2])
) {
age--;
}

return age;
}

function maskEmail_(email) {
email = normalizeEmail_(email);

var parts = email.split("@");

if (parts.length !== 2) {
return "";
}

var local = parts[0];

var maskedLocal = local.length <= 2
? local.charAt(0) + ""
: local.substring(0, 2) +
"*".repeat(Math.min(local.length - 2, 8));

return maskedLocal + "@" + parts[1];
}

function parseBoolean_(value) {
return value === true ||
String(value).toLowerCase() === "true" ||
String(value) === "1";
}

function safeUrl_(value) {
var url = String(value || "").trim();
return /^https:\/\/[^\s]+$/i.test(url) ? url : "";
}

function buildAppUrl_(parameterName, value) {
var baseUrl = requireProperty_("APP_URL");
if (!/^https:\/\//i.test(baseUrl)) {
throwPublic_("APP_URL ต้องเป็น HTTPS URL", "INVALID_APP_URL");
}
var separator = baseUrl.indexOf("?") >= 0 ? "&" : "?";
return baseUrl + separator + encodeURIComponent(parameterName) + "=" + encodeURIComponent(String(value));
}

/* ================================================================
G. HASHING AND PASSWORD VALIDATION
• ================================================================
*/

function hashSecret_(value) {
var secret = requireProperty_("DATA_HASH_SECRET");

var signature = Utilities.computeHmacSha256Signature(
String(value),
secret
);

return Utilities.base64EncodeWebSafe(signature)
.replace(/=+$/, "");
}

/**
• Iterated HMAC password hash.
• This is a practical Apps Script fallback, not a replacement for
• Argon2id or a dedicated identity provider.
• For a real money-lending platform, a maintained authentication
• service with a standard password KDF is preferable.
• Keep DATA_HASH_SECRET stable. Rotating it without a password-hash
• migration plan can lock existing users out.
/
/*
◦ FINORA Password Hash
• แก้ไขปัญหา Utilities.computeHmacSha256Signature
• โดยแปลง byte array กลับเป็นข้อความ Base64 ก่อนนำไป
• คำนวณ HMAC ในรอบถัดไป
/
/*
• FINORA Password Hash
• แก้ไขปัญหา Utilities.computeHmacSha256Signature
• โดยแปลง byte array กลับเป็นข้อความ Base64 ก่อนนำไป
• คำนวณ HMAC ในรอบถัดไป
*/
function derivePasswordHash_(password, salt) {
var secret = requireProperty_("DATA_HASH_SECRET");

var input = String(password) + "|" + String(salt);

var bytes = Utilities.computeHmacSha256Signature(
input,
secret
);

var rounds = 5000;

for (var i = 1; i < rounds; i++) {
var encoded = Utilities.base64EncodeWebSafe(bytes)
.replace(/=+$/, "");

bytes = Utilities.computeHmacSha256Signature(
encoded,
secret
);
}

return Utilities.base64EncodeWebSafe(bytes)
.replace(/=+$/, "");
}
function validatePassword_(password) {
password = String(password || "");

if (password.length < 12) {
throwPublic_(
"รหัสผ่านต้องมีอย่างน้อย 12 ตัวอักษร",
"WEAK_PASSWORD"
);
}

if (password.length > 128) {
throwPublic_(
"รหัสผ่านยาวเกินกำหนด",
"PASSWORD_TOO_LONG"
);
}

if (!/[a-z]/.test(password)) {
throwPublic_(
"รหัสผ่านต้องมีตัวอักษรภาษาอังกฤษพิมพ์เล็ก",
"WEAK_PASSWORD"
);
}

if (!/[A-Z]/.test(password)) {
throwPublic_(
"รหัสผ่านต้องมีตัวอักษรภาษาอังกฤษพิมพ์ใหญ่",
"WEAK_PASSWORD"
);
}

if (!/[0-9]/.test(password)) {
throwPublic_(
"รหัสผ่านต้องมีตัวเลขอย่างน้อยหนึ่งตัว",
"WEAK_PASSWORD"
);
}

if (!/[^A-Za-z0-9]/.test(password)) {
throwPublic_(
"รหัสผ่านต้องมีอักขระพิเศษอย่างน้อยหนึ่งตัว",
"WEAK_PASSWORD"
);
}

return true;
}

/**
• Thai citizen identification number validation.
• The complete citizen number is not stored in Users.
*/
function validateThaiNationalId_(value) {
var id = String(value || "");
if (!/^\d{13}$`/.test(id)) return false;
var sum = 0;
for (var i = 0; i < 12; i++) sum += Number(id.charAt(i)) * (13 - i);
var checkDigit = (11 - (sum % 11)) % 10;
return checkDigit === Number(id.charAt(12));
}

/* ================================================================
H. BASIC RATE LIMITING
• ================================================================
*/

function throttle_(action, identifier, maxAttempts, ttlSeconds) {
var cache = CacheService.getScriptCache();

var key = "RATE_" + hashSecret_(
String(action) + "|" + String(identifier || "unknown")
);

var currentValue = Number(cache.get(key) || "0");

if (currentValue >= maxAttempts) {
throwPublic_(
"คุณดำเนินการบ่อยเกินไป กรุณารอสักครู่แล้วลองใหม่",
"RATE_LIMITED"
);
}

cache.put(
key,
String(currentValue + 1),
ttlSeconds
);
}

/* ================================================================
I. AUDIT LOGGING
• ================================================================
*/

function logEvent_(
actorUserId,
action,
entityType,
entityId,
details
) {
try {
var sheet = getSheet_("SystemLogs");

appendRecord_("SystemLogs", {
logId: uuid_(),
actorUserId: String(actorUserId || "SYSTEM"),
action: String(action || ""),
entityType: String(entityType || ""),
entityId: String(entityId || ""),
detailsJson: JSON.stringify(details || {}),
createdAt: nowIso_()
});

} catch (err) {
console.error("Audit log write failed: " + String(err));
}
}

/* ================================================================
J. ADMIN AUTHORIZATION
• ================================================================
*/

function getAdminEmails_() {
var raw = getProperty_("ADMIN_EMAILS", "");

return raw.split(",")
.map(function (email) {
return normalizeEmail_(email);
})
.filter(function (email) {
return isValidEmail_(email);
});
}

function isAdminEmail_(email) {
return getAdminEmails_().indexOf(
normalizeEmail_(email)
) !== -1;
}

function isAdminUser_(user) {
return Boolean(
user &&
(
String(user.role).toUpperCase() === "ADMIN" ||
isAdminEmail_(user.email)
)
);
}

function safeUser_(user) {
return {
userId: String(user.userId || ""),
prefix: String(user.prefix || ""),
fullName: String(user.fullName || ""),
dob: String(user.dob || ""),
nationalIdLast4: String(user.nationalIdLast4 || ""),
phone: String(user.phone || ""),
email: String(user.email || ""),
emailVerified: parseBoolean_(user.emailVerified),
status: String(user.status || ""),
role: isAdminUser_(user) ? "ADMIN" : "USER",
createdAt: String(user.createdAt || ""),
lastLoginAt: String(user.lastLoginAt || "")
};
}

/* ================================================================
K. AUTHENTICATION AND SESSIONS
• ================================================================
*/

function getRequestToken_(p) {
return String(
p.token ||
p.accessToken ||
""
).trim();
}

function authenticate_(p) {
var token = getRequestToken_(p);

if (!token) {
throwPublic_(
"กรุณาเข้าสู่ระบบก่อน",
"AUTHENTICATION_REQUIRED"
);
}

var tokenHash = hashSecret_(token);

var session = findRecord_(
"Sessions",
"tokenHash",
tokenHash
);

if (!session) {
throwPublic_(
"เซสชันไม่ถูกต้อง กรุณาเข้าสู่ระบบใหม่",
"INVALID_SESSION"
);
}

if (String(session.revokedAt || "") !== "") {
throwPublic_(
"เซสชันนี้ถูกยกเลิกแล้ว กรุณาเข้าสู่ระบบใหม่",
"SESSION_REVOKED"
);
}

if (
!session.expiresAt ||
new Date(session.expiresAt).getTime() <= Date.now()
) {
throwPublic_(
"เซสชันหมดอายุ กรุณาเข้าสู่ระบบใหม่",
"SESSION_EXPIRED"
);
}

var user = findRecord_(
"Users",
"userId",
session.userId
);

if (!user) {
throwPublic_(
"ไม่พบบัญชีผู้ใช้",
"USER_NOT_FOUND"
);
}

if (String(user.status).toUpperCase() !== "ACTIVE") {
throwPublic_(
"บัญชีนี้ไม่สามารถใช้งานได้ กรุณาติดต่อเจ้าหน้าที่",
"ACCOUNT_DISABLED"
);
}

if (!parseBoolean_(user.emailVerified)) {
throwPublic_(
"กรุณายืนยันอีเมลก่อนใช้งาน",
"EMAIL_NOT_VERIFIED"
);
}

if (isAdminEmail_(user.email) &&
String(user.role).toUpperCase() !== "ADMIN") {
updateRecord_("Users", user.rowNumber, {
role: "ADMIN",
updatedAt: nowIso_()
});

user.role = "ADMIN";
}

return {
user: user,
session: session,
token: token
};
}

function requireAdmin_(p) {
var auth = authenticate_(p);

if (!isAdminUser_(auth.user)) {
throwPublic_(
"คุณไม่มีสิทธิ์เข้าถึงเมนูผู้ดูแลระบบ",
"ADMIN_REQUIRED"
);
}

return auth;
}

function apiHealth_() {
return {
message: "FINORA API is available",
timestamp: nowIso_()
};
}

function getPublicConfig_() {
var config = getConfig_();

return {
appName: config.appName,
minAge: config.minAge,
termsVersion: config.termsVersion,
privacyVersion: config.privacyVersion,
timestamp: nowIso_()
};
}

function getCurrentUserInfo_(p) {
var auth = authenticate_(p);

return {
user: safeUser_(auth.user),
isAdmin: isAdminUser_(auth.user)
};
}

/* ================================================================
L. EMAIL TEMPLATES AND TOKEN CREATION
• ================================================================
*/

function sendHtmlEmail_(to, subject, html, plainText) {
var recipient = normalizeEmail_(to);

if (!isValidEmail_(recipient)) {
throwPublic_(
"อีเมลปลายทางไม่ถูกต้อง",
"INVALID_EMAIL"
);
}

if (MailApp.getRemainingDailyQuota() < 1) {
throwPublic_(
"ระบบส่งอีเมลเกินโควต้ารายวัน",
"EMAIL_QUOTA_EXCEEDED"
);
}

MailApp.sendEmail({
to: recipient,
subject: String(subject || ""),
name: getProperty_("APP_NAME", "FINORA"),
body: String(plainText || "กรุณาเปิดอีเมลด้วยโปรแกรมที่รองรับ HTML"),
htmlBody: String(html || "")
});

return true;
}

function createEmailButton_(url, label) {
return (
'<a href="' + escapeAttribute_(url) + '"' +
' style="' +
'display:inline-block;' +
'padding:14px 24px;' +
'background:#173b8f;' +
'color:#ffffff;' +
'font-family:Arial,sans-serif;' +
'font-size:15px;' +
'font-weight:700;' +
'text-decoration:none;' +
'border-radius:10px;' +
'">' +
escapeHtml_(label) +
'</a>'
);
}

function baseEmailTemplate_(title, bodyHtml, buttonHtml, footer) {
var appName = escapeHtml_(
getProperty_("APP_NAME", "FINORA")
);

return (
'<!doctype html>' +
'<html lang="th">' +
'<head>' +
'<meta charset="utf-8">' +
'<meta name="viewport" content="width=device-width,initial-scale=1">' +
'</head>' +
'<body style="' +
'margin:0;background:#f3f5f9;padding:24px;' +
'font-family:Arial,Tahoma,sans-serif;color:#1b2430;' +
'">' +
'<div style="max-width:600px;margin:0 auto;">' +
'<div style="' +
'background:#102d65;padding:26px 30px;' +
'border-radius:18px 18px 0 0;color:#fff;' +
'">' +
'<div style="font-size:24px;font-weight:800;">' +
appName +
'</div>' +
'<div style="font-size:12px;opacity:.8;margin-top:6px;">' +
'FINANCIAL SERVICES' +
'</div>' +
'</div>' +
'<div style="' +
'background:#fff;padding:30px;' +
'border-radius:0 0 18px 18px;' +
'">' +
'<h1 style="' +
'font-size:23px;line-height:1.45;margin:0 0 18px;' +
'">' +
escapeHtml_(title) +
'</h1>' +
'<div style="font-size:15px;line-height:1.85;">' +
bodyHtml +
'</div>' +
'<div style="margin:26px 0;">' +
(buttonHtml || "") +
'</div>' +
'<div style="' +
'font-size:12px;color:#647084;' +
'line-height:1.7;border-top:1px solid #e5e9f1;' +
'padding-top:18px;margin-top:26px;' +
'">' +
escapeHtml_(footer || "อีเมลนี้ส่งโดยระบบอัตโนมัติของ FINORA") +
'</div>' +
'</div>' +
'</div>' +
'</body>' +
'</html>'
);
}

function createEmailToken_(
email,
purpose,
ttlSeconds
) {
var rawToken = uuid_() + uuid_();
var tokenHash = hashSecret_(rawToken);
var createdAt = nowIso_();

var record = {
tokenId: uuid_(),
email: normalizeEmail_(email),
tokenHash: tokenHash,
purpose: String(purpose),
expiresAt: new Date(
Date.now() + ttlSeconds * 1000
).toISOString(),
usedAt: "",
createdAt: createdAt
};

appendRecord_("EmailTokens", record);

return {
rawToken: rawToken,
record: record
};
}

/* ================================================================
M. EMAIL VERIFICATION
• ================================================================
*/

/**
• Called when the user clicks "ยืนยันอีเมล" on Sign up.
• This does not create a user account yet.
• A temporary confirmation token is sent to the email address.
*/
function beginEmailVerification_(p) {
var email = normalizeEmail_(p.email);

if (!isValidEmail_(email)) {
throwPublic_(
"กรุณากรอกอีเมลให้ถูกต้อง",
"INVALID_EMAIL"
);
}

throttle_(
"EMAIL_VERIFY",
email,
3,
3600
);

if (findRecord_("Users", "email", email)) {
throwPublic_(
"อีเมลนี้มีบัญชีอยู่แล้ว กรุณาเข้าสู่ระบบหรือรีเซ็ตรหัสผ่าน",
"EMAIL_ALREADY_REGISTERED"
);
}

var created = createEmailToken_(
email,
"EMAIL_VERIFY",
getConfig_().verifyTokenTtlSeconds
);

var confirmationUrl = buildAppUrl_(
"verifyEmail",
created.rawToken
);

var html = baseEmailTemplate_(
"Confirm your email address",
'<p>ขอบคุณที่สนใจสมัครใช้บริการ ' +
escapeHtml_(getProperty_("APP_NAME", "FINORA")) +
'</p>' +
'<p>โปรดยืนยันว่าอีเมลนี้เป็นของคุณโดยกดปุ่มด้านล่าง</p>' +
'<p>หากคุณไม่ได้เป็นผู้เริ่มดำเนินการนี้ กรุณาเพิกเฉยต่ออีเมลฉบับนี้</p>',
createEmailButton_(
confirmationUrl,
"Confirm email address"
),
"ลิงก์นี้ใช้ได้ภายในเวลาที่ระบุในระบบ กรุณาอย่าส่งต่อให้ผู้อื่น"
);

try {
sendHtmlEmail_(
email,
"FINORA — Confirm your email address",
html,
"กรุณาเปิดลิงก์เพื่อยืนยันอีเมล: " + confirmationUrl
);

} catch (emailError) {
updateRecord_("EmailTokens", created.record.rowNumber || 0, {
usedAt: nowIso_()
});

console.error("Email verification send failed: " + String(emailError));

throwPublic_(
"ระบบไม่สามารถส่งอีเมลได้ในขณะนี้ กรุณาตรวจสอบการตั้งค่าอีเมล",
"EMAIL_SEND_FAILED"
);
}

logEvent_(
"SYSTEM",
"EMAIL_VERIFICATION_REQUESTED",
"EMAIL",
hashSecret_(email),
{}
);

return {
message: "ส่งลิงก์ยืนยันอีเมลแล้ว",
emailMasked: maskEmail_(email),
expiresInSeconds: getConfig_().verifyTokenTtlSeconds
};
}

/**
• The index.html page reached through ?verifyEmail=TOKEN
• should call this API action with the token.
*/
function confirmEmail_(p) {
var rawToken = String(p.verifyToken || p.token || "").trim();

if (!rawToken) {
throwPublic_(
"ไม่พบโทเคนยืนยันอีเมล",
"TOKEN_REQUIRED"
);
}

var tokenHash = hashSecret_(rawToken);

var lock = LockService.getScriptLock();

if (!lock.tryLock(10000)) {
throwPublic_(
"ระบบกำลังประมวลผล กรุณาลองใหม่",
"SYSTEM_BUSY"
);
}

try {
var tokenRecord = findRecord_(
"EmailTokens",
"tokenHash",
tokenHash
);

if (!tokenRecord ||
String(tokenRecord.purpose) !== "EMAIL_VERIFY") {
throwPublic_(
"ลิงก์ยืนยันอีเมลไม่ถูกต้องหรือหมดอายุแล้ว",
"INVALID_VERIFICATION_TOKEN"
);
}

if (String(tokenRecord.usedAt || "") !== "") {
throwPublic_(
"ลิงก์นี้ถูกใช้งานแล้ว",
"TOKEN_ALREADY_USED"
);
}

if (
!tokenRecord.expiresAt ||
new Date(tokenRecord.expiresAt).getTime() <= Date.now()
) {
throwPublic_(
"ลิงก์ยืนยันอีเมลหมดอายุแล้ว กรุณาขอลิงก์ใหม่",
"TOKEN_EXPIRED"
);
}

var email = normalizeEmail_(tokenRecord.email);

updateRecord_(
"EmailTokens",
tokenRecord.rowNumber,
{
usedAt: nowIso_()
}
);

var verification = {
verificationId: uuid_(),
email: email,
tokenId: String(tokenRecord.tokenId),
verifiedAt: nowIso_(),
expiresAt: new Date(
Date.now() +
getConfig_().verifyTokenTtlSeconds * 1000
).toISOString(),
consumedAt: "",
createdAt: nowIso_()
};

appendRecord_("VerifiedEmails", verification);

logEvent_(
"SYSTEM",
"EMAIL_VERIFIED",
"EMAIL",
hashSecret_(email),
{}
);

return {
message: "ยืนยันอีเมลสำเร็จ กรุณากลับไปหน้าลงทะเบียน",
emailMasked: maskEmail_(email),
verifiedAt: verification.verifiedAt
};

} finally {
lock.releaseLock();
}
}

/**
• The signup waiting page polls this action until the email has
• been confirmed. It does not reveal whether arbitrary addresses
• exist as registered accounts.
*/
function checkEmailVerification_(p) {
var email = normalizeEmail_(p.email);

if (!isValidEmail_(email)) {
throwPublic_(
"อีเมลไม่ถูกต้อง",
"INVALID_EMAIL"
);
}

var records = getRecordsByField_(
"VerifiedEmails",
"email",
email
);

var verified = records.some(function (record) {
return (
String(record.consumedAt || "") === "" &&
record.expiresAt &&
new Date(record.expiresAt).getTime() > Date.now()
);
});

return {
verified: verified,
emailMasked: maskEmail_(email)
};
}

/* ================================================================
N. USER REGISTRATION
• ================================================================
*/

function registerUser_(p) {
var prefix = String(p.prefix || "").trim();
var fullName = String(p.fullName || "").trim();
var dob = String(p.dob || "").trim();
var nationalId = String(p.nationalId || "").trim();
var phone = String(p.phone || "").trim();
var email = normalizeEmail_(p.email);
var password = String(p.password || "");
var confirmPassword = String(
p.confirmPassword || ""
);

var allowedPrefixes = [
"เด็กหญิง",
"เด็กชาย",
"นาย",
"นาง",
"นางสาว"
 ];

if (allowedPrefixes.indexOf(prefix) === -1) {
throwPublic_(
"กรุณาเลือกคำนำหน้าให้ถูกต้อง",
"INVALID_PREFIX"
);
}

if (fullName.length < 4 || fullName.length > 150) {
throwPublic_(
"กรุณากรอกชื่อและนามสกุลให้ถูกต้อง",
"INVALID_FULL_NAME"
);
}

if (!isValidDateOnly_(dob)) {
throwPublic_(
"กรุณาเลือกวันเกิดให้ถูกต้อง",
"INVALID_DOB"
);
}

var age = dateDifferenceInYears_(dob);
var minAge = Number(getProperty_("MIN_AGE", "20"));

if (age < minAge) {
throwPublic_(
"คุณสมบัติอายุไม่เป็นไปตามเงื่อนไขการสมัคร",
"AGE_REQUIREMENT_NOT_MET"
);
}

if (!validateThaiNationalId_(nationalId)) {
throwPublic_(
"หมายเลขบัตรประชาชนไม่ถูกต้อง",
"INVALID_NATIONAL_ID"
);
}

if (!isValidPhone_(phone)) {
throwPublic_(
"กรุณากรอกหมายเลขโทรศัพท์มือถือ 10 หลักให้ถูกต้อง",
"INVALID_PHONE"
);
}

if (!isValidEmail_(email)) {
throwPublic_(
"กรุณากรอกอีเมลให้ถูกต้อง",
"INVALID_EMAIL"
);
}

validatePassword_(password);

if (password !== confirmPassword) {
throwPublic_(
"รหัสผ่านและการยืนยันรหัสผ่านไม่ตรงกัน",
"PASSWORD_MISMATCH"
);
}

if (!parseBoolean_(p.termsAccepted)) {
throwPublic_(
"กรุณายอมรับข้อกำหนดและเงื่อนไขการใช้บริการ",
"TERMS_NOT_ACCEPTED"
);
}

if (!parseBoolean_(p.privacyAcknowledged)) {
throwPublic_(
"กรุณารับทราบประกาศความเป็นส่วนตัว",
"PRIVACY_NOT_ACKNOWLEDGED"
);
}

if (findRecord_("Users", "email", email)) {
throwPublic_(
"อีเมลนี้มีบัญชีอยู่แล้ว",
"EMAIL_ALREADY_REGISTERED"
);
}

if (findRecord_("Users", "phone", phone)) {
throwPublic_(
"หมายเลขโทรศัพท์นี้ถูกใช้แล้ว",
"PHONE_ALREADY_REGISTERED"
);
}

var nationalIdHash = hashSecret_(nationalId);

if (findRecord_(
"Users",
"nationalIdHash",
nationalIdHash
)) {
throwPublic_(
"หมายเลขบัตรประชาชนนี้มีบัญชีอยู่แล้ว",
"NATIONAL_ID_ALREADY_REGISTERED"
);
}

var lock = LockService.getScriptLock();

if (!lock.tryLock(10000)) {
throwPublic_(
"ระบบกำลังประมวลผล กรุณาลองใหม่",
"SYSTEM_BUSY"
);
}

try {
if (findRecord_("Users", "email", email) ||
findRecord_("Users", "phone", phone) ||
findRecord_(
"Users",
"nationalIdHash",
nationalIdHash
)) {
throwPublic_(
"ข้อมูลนี้ถูกใช้สมัครแล้ว",
"DUPLICATE_ACCOUNT"
);
}

var verifiedRows = getRecordsByField_(
"VerifiedEmails",
"email",
email
);

var verification = null;

for (var i = verifiedRows.length - 1; i >= 0; i--) {
var candidate = verifiedRows[i];

if (
String(candidate.consumedAt || "") === "" &&
candidate.expiresAt &&
new Date(candidate.expiresAt).getTime() > Date.now()
) {
verification = candidate;
break;
}
}

if (!verification) {
throwPublic_(
"กรุณายืนยันอีเมลก่อนสมัครสมาชิก",
"EMAIL_VERIFICATION_REQUIRED"
);
}

var salt = uuid_();

var role = isAdminEmail_(email)
? "ADMIN"
: "USER";

var now = nowIso_();

var user = {
userId: uuid_(),
prefix: prefix,
fullName: fullName,
dob: dob,
nationalIdHash: nationalIdHash,
nationalIdLast4: nationalId.substring(9),
phone: phone,
email: email,
passwordSalt: salt,
passwordHash: derivePasswordHash_(
password,
salt
),
emailVerified: "TRUE",
status: "ACTIVE",
role: role,
termsVersion: getProperty_("TERMS_VERSION", "1.0"),
termsAcceptedAt: now,
privacyVersion: getProperty_("PRIVACY_VERSION", "1.0"),
privacyAcceptedAt: now,
createdAt: now,
updatedAt: now,
lastLoginAt: ""
};

appendRecord_("Users", user);

updateRecord_(
"VerifiedEmails",
verification._rowNumber,
{
consumedAt: now
}
);

logEvent_(
user.userId,
"USER_REGISTERED",
"USER",
user.userId,
{
role: role,
termsVersion: user.termsVersion,
privacyVersion: user.privacyVersion
}
);

return {
message: "สมัครสมาชิกสำเร็จ กรุณาเข้าสู่ระบบ",
user: safeUser_(user)
};

} finally {
lock.releaseLock();
}
}

/* ================================================================
O. LOGIN AND LOGOUT
• ================================================================
*/

function loginUser_(p) {
var identifier = String(
p.identifier ||
p.username ||
p.email ||
""
).trim();

var password = String(p.password || "");
var rememberMe = parseBoolean_(p.rememberMe);

if (!identifier || !password) {
throwPublic_(
"กรุณากรอกชื่อผู้ใช้หรืออีเมล และรหัสผ่าน",
"LOGIN_FIELDS_REQUIRED"
);
}

throttle_(
"LOGIN",
identifier.toLowerCase(),
10,
900
);

var user = null;

if (isValidEmail_(identifier)) {
user = findRecord_(
"Users",
"email",
normalizeEmail_(identifier)
);
} else if (isValidPhone_(identifier)) {
user = findRecord_(
"Users",
"phone",
identifier
);
}

if (!user) {
throwPublic_(
"ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง",
"INVALID_CREDENTIALS"
);
}

if (!constantTimeEqual_(
String(user.passwordHash),
derivePasswordHash_(
password,
String(user.passwordSalt)
)
)) {
throwPublic_(
"ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง",
"INVALID_CREDENTIALS"
);
}

if (!parseBoolean_(user.emailVerified)) {
throwPublic_(
"กรุณายืนยันอีเมลก่อนเข้าสู่ระบบ",
"EMAIL_NOT_VERIFIED"
);
}

if (String(user.status).toUpperCase() !== "ACTIVE") {
throwPublic_(
"บัญชีถูกระงับการใช้งาน",
"ACCOUNT_DISABLED"
);
}

var rawToken = uuid_() + uuid_();
var createdAt = nowIso_();

var ttl = rememberMe
? Number(getProperty_(
"REMEMBER_SESSION_TTL_SECONDS",
"2592000"
))
: Number(getProperty_(
"SESSION_TTL_SECONDS",
"86400"
));

if (!isFinite(ttl) || ttl < 60) {
ttl = 86400;
}

var session = {
sessionId: uuid_(),
userId: user.userId,
tokenHash: hashSecret_(rawToken),
createdAt: createdAt,
expiresAt: new Date(
Date.now() + ttl * 1000
).toISOString(),
lastSeenAt: createdAt,
revokedAt: "",
rememberMe: rememberMe ? "TRUE" : "FALSE"
};

appendRecord_("Sessions", session);

var updates = {
lastLoginAt: createdAt,
updatedAt: createdAt
};

if (isAdminEmail_(user.email)) {
updates.role = "ADMIN";
user.role = "ADMIN";
}

updateRecord_(
"Users",
user._rowNumber,
updates
);

logEvent_(
user.userId,
"USER_LOGIN",
"SESSION",
session.sessionId,
{
rememberMe: rememberMe
}
);

deleteCacheKey_(
"RATE_" + hashSecret_(
"LOGIN|" + identifier.toLowerCase()
)
);

return {
message: "เข้าสู่ระบบสำเร็จ",
token: rawToken,
expiresAt: session.expiresAt,
rememberMe: rememberMe,
user: safeUser_(user)
};
}

function logoutUser_(p) {
var token = getRequestToken_(p);

if (!token) {
return {
message: "ออกจากระบบแล้ว"
};
}

var session = findRecord_(
"Sessions",
"tokenHash",
hashSecret_(token)
);

if (session &&
String(session.revokedAt || "") === "") {
updateRecord_(
"Sessions",
session.rowNumber,
{
revokedAt: nowIso_()
}
);

logEvent_(
session.userId,
"USER_LOGOUT",
"SESSION",
session.sessionId,
{}
);
}

return {
message: "ออกจากระบบแล้ว"
};
}

/* ================================================================
P. PASSWORD RESET
• ================================================================
*/

function forgotPassword_(p) {
var email = normalizeEmail_(p.email);

if (!isValidEmail_(email)) {
throwPublic_(
"กรุณากรอกอีเมลให้ถูกต้อง",
"INVALID_EMAIL"
);
}

throttle_(
"PASSWORD_RESET",
email,
3,
3600
);

var user = findRecord_("Users", "email", email);

var message =
"หากอีเมลนี้มีบัญชีอยู่ ระบบจะส่งลิงก์รีเซ็ตรหัสผ่านให้";

if (
user &&
parseBoolean_(user.emailVerified) &&
String(user.status).toUpperCase() === "ACTIVE"
) {
try {
var created = createEmailToken_(
email,
"PASSWORD_RESET",
Number(getProperty_(
"RESET_TOKEN_TTL_SECONDS",
"1800"
))
);

var resetUrl = buildAppUrl_(
"resetPassword",
created.rawToken
);

var html = baseEmailTemplate_(
"รีเซ็ตรหัสผ่าน FINORA",
'<p>เราได้รับคำขอเปลี่ยนรหัสผ่านสำหรับบัญชีของคุณ</p>' +
'<p>กดปุ่มด้านล่างเพื่อกำหนดรหัสผ่านใหม่</p>' +
'<p>หากคุณไม่ได้ร้องขอ กรุณาเพิกเฉยต่ออีเมลฉบับนี้</p>',
createEmailButton_(
resetUrl,
"รีเซ็ตรหัสผ่าน"
),
"ลิงก์รีเซ็ตรหัสผ่านจะหมดอายุภายในเวลาที่ระบบกำหนด"
);

sendHtmlEmail_(
email,
"FINORA — รีเซ็ตรหัสผ่าน",
html,
"ลิงก์รีเซ็ตรหัสผ่าน: " + resetUrl
);

} catch (err) {
console.error(
"Password reset email error: " + String(err)
);
}
}

return {
message: message,
emailMasked: maskEmail_(email)
};
}

function validateResetToken_(p) {
var rawToken = String(
p.resetToken || p.token || ""
).trim();

if (!rawToken) {
throwPublic_(
"ไม่พบโทเคนรีเซ็ตรหัสผ่าน",
"TOKEN_REQUIRED"
);
}

var record = findRecord_(
"EmailTokens",
"tokenHash",
hashSecret_(rawToken)
);

if (!record ||
String(record.purpose) !== "PASSWORD_RESET" ||
String(record.usedAt || "") !== "" ||
!record.expiresAt ||
new Date(record.expiresAt).getTime() <= Date.now()) {
throwPublic_(
"ลิงก์รีเซ็ตรหัสผ่านไม่ถูกต้องหรือหมดอายุแล้ว",
"INVALID_RESET_TOKEN"
);
}

return {
valid: true,
emailMasked: maskEmail_(record.email)
};
}

function resetPassword_(p) {
var rawToken = String(
p.resetToken || p.token || ""
).trim();

var password = String(p.password || "");
var confirmPassword = String(
p.confirmPassword || ""
);

if (!rawToken) {
throwPublic_(
"ไม่พบโทเคนรีเซ็ตรหัสผ่าน",
"TOKEN_REQUIRED"
);
}

validatePassword_(password);

if (password !== confirmPassword) {
throwPublic_(
"รหัสผ่านใหม่และการยืนยันรหัสผ่านไม่ตรงกัน",
"PASSWORD_MISMATCH"
);
}

var lock = LockService.getScriptLock();

if (!lock.tryLock(10000)) {
throwPublic_(
"ระบบกำลังประมวลผล กรุณาลองใหม่",
"SYSTEM_BUSY"
);
}

try {
var record = findRecord_(
"EmailTokens",
"tokenHash",
hashSecret_(rawToken)
);

if (!record ||
String(record.purpose) !== "PASSWORD_RESET" ||
String(record.usedAt || "") !== "" ||
!record.expiresAt ||
new Date(record.expiresAt).getTime() <= Date.now()) {
throwPublic_(
"ลิงก์รีเซ็ตรหัสผ่านไม่ถูกต้องหรือหมดอายุแล้ว",
"INVALID_RESET_TOKEN"
);
}

var user = findRecord_(
"Users",
"email",
normalizeEmail_(record.email)
);

if (!user) {
throwPublic_(
"ไม่พบบัญชีผู้ใช้",
"USER_NOT_FOUND"
);
}

var salt = uuid_();

updateRecord_(
"Users",
user.rowNumber,
{
passwordSalt: salt,
passwordHash: derivePasswordHash_(
password,
salt
),
updatedAt: nowIso_()
}
);

updateRecord_(
"EmailTokens",
record.rowNumber,
{
usedAt: nowIso_()
}
);

revokeAllSessionsForUser_(user.userId);

logEvent_(
user.userId,
"PASSWORD_RESET",
"USER",
user.userId,
{}
);

return {
message: "เปลี่ยนรหัสผ่านสำเร็จ กรุณาเข้าสู่ระบบใหม่"
};

} finally {
lock.releaseLock();
}
}

function revokeAllSessionsForUser_(userId) {
var sessions = getRecordsByField_(
"Sessions",
"userId",
userId
);

var now = nowIso_();

sessions.forEach(function (session) {
if (String(session.revokedAt || "") === "") {
updateRecord_(
"Sessions",
session._rowNumber,
{
revokedAt: now
}
);
}
});
}

/* ================================================================
Q. PRODUCTS
• ================================================================
*/

function productIsEnabled_(product) {
return (
parseBoolean_(product.enabled) &&
parseBoolean_(product.legalReviewed) &&
Number(product.maxEffectiveAnnualRate) > 0 &&
Number(product.interestRateAnnual) >= 0 &&
Number(product.interestRateAnnual) <=
Number(product.maxEffectiveAnnualRate)
);
}

function safeProduct_(product) {
return {
productId: String(product.productId || ""),
name: String(product.name || ""),
description: String(product.description || ""),
minAmount: Number(product.minAmount || 0),
maxAmount: Number(product.maxAmount || 0),
minInstallments: Number(product.minInstallments || 0),
maxInstallments: Number(product.maxInstallments || 0),
frequencies: parseJsonArray_(product.frequenciesJson),
interestRateAnnual: Number(product.interestRateAnnual || 0),
interestMethod: String(product.interestMethod || ""),
feeFixed: Number(product.feeFixed || 0),
feePercent: Number(product.feePercent || 0),
enabled: productIsEnabled_(product)
};
}

function listPublicProducts_(p) {
var products = getRecords_("Products")
.filter(function (product) {
return productIsEnabled_(product);
})
.map(safeProduct_);

// The public product list remains usable without a session. When called by
// an authenticated borrower, mark products that already have an application.
var token = p && (p.token || p.accessToken) ? String(p.token || p.accessToken) : "";
if (token) {
var auth = authenticate_(p);
var priorLoans = getRecordsByField_("Loans", "userId", auth.user.userId);
var appliedByProduct = {};
priorLoans.forEach(function (loan) {
appliedByProduct[String(loan.productId)] = true;
});
products.forEach(function (product) {
product.alreadyApplied = appliedByProduct[String(product.productId)] === true;
});
}

return {
products: products
};
}

function adminListProducts_(p) {
requireAdmin_(p);

var products = getRecords_("Products")
.map(function (product) {
var safe = safeProduct_(product);

safe.legalReviewed = parseBoolean_(
product.legalReviewed
);

safe.licenseType = String(product.licenseType || "");
safe.maxEffectiveAnnualRate = Number(
product.maxEffectiveAnnualRate || 0
);

safe.legalReviewedAt = String(
product.legalReviewedAt || ""
);

safe.legalReviewedBy = String(
product.legalReviewedBy || ""
);

safe.createdAt = String(product.createdAt || "");
safe.updatedAt = String(product.updatedAt || "");

return safe;
});

return {
products: products
};
}

function adminSaveProduct_(p) {
var auth = requireAdmin_(p);

var productId = String(p.productId || "").trim();
var name = String(p.name || "").trim();
var description = String(p.description || "").trim();

var minAmount = parseMoney_(p.minAmount);
var maxAmount = parseMoney_(p.maxAmount);

var minInstallments = Number(p.minInstallments);
var maxInstallments = Number(p.maxInstallments);

var frequencies = parseJsonArray_(
p.frequencies || p.frequenciesJson
);

var rate = Number(p.interestRateAnnual);
var maxRate = Number(p.maxEffectiveAnnualRate);

var method = String(
p.interestMethod || "REDUCING_BALANCE"
).toUpperCase();

var fixedFee = parseMoney_(p.feeFixed || 0);
var percentFee = Number(p.feePercent || 0);

var legalReviewed = parseBoolean_(p.legalReviewed);
var enabled = parseBoolean_(p.enabled);

if (name.length < 2 || name.length > 150) {
throwPublic_(
"กรุณาระบุชื่อผลิตภัณฑ์ให้ถูกต้อง",
"INVALID_PRODUCT_NAME"
);
}

if (!isFinite(minAmount) ||
!isFinite(maxAmount) ||
minAmount <= 0 ||
maxAmount < minAmount) {
throwPublic_(
"ช่วงวงเงินสินเชื่อไม่ถูกต้อง",
"INVALID_PRODUCT_AMOUNT"
);
}

if (
!Number.isInteger(minInstallments) ||
!Number.isInteger(maxInstallments) ||
minInstallments < 1 ||
maxInstallments < minInstallments
) {
throwPublic_(
"จำนวนงวดไม่ถูกต้อง",
"INVALID_INSTALLMENTS"
);
}

if (!frequencies.length ||
frequencies.some(function (frequency) {
return ["DAILY", "WEEKLY", "MONTHLY"]
.indexOf(String(frequency).toUpperCase()) === -1;
})) {
throwPublic_(
"กรุณาเลือกความถี่การชำระให้ถูกต้อง",
"INVALID_FREQUENCIES"
);
}

if (
!isFinite(rate) ||
!isFinite(maxRate) ||
rate < 0 ||
maxRate <= 0 ||
rate > maxRate
) {
throwPublic_(
"อัตราที่กำหนดไม่ผ่านเกณฑ์ตรวจสอบของผลิตภัณฑ์",
"INVALID_INTEREST_RATE"
);
}

if (
["REDUCING_BALANCE", "FLAT"].indexOf(method) === -1
) {
throwPublic_(
"ไม่รองรับวิธีคำนวณดอกเบี้ยนี้",
"INVALID_INTEREST_METHOD"
);
}

if (
!isFinite(fixedFee) ||
fixedFee < 0 ||
!isFinite(percentFee) ||
percentFee < 0
) {
throwPublic_(
"ค่าธรรมเนียมไม่ถูกต้อง",
"INVALID_FEE"
);
}

if (enabled && !legalReviewed) {
throwPublic_(
"ต้องผ่านการตรวจสอบข้อกำกับก่อนเปิดใช้งานผลิตภัณฑ์",
"LEGAL_REVIEW_REQUIRED"
);
}

var now = nowIso_();

var existing = productId
? findRecord_("Products", "productId", productId)
: null;

var record = {
productId: productId || uuid_(),
name: name,
description: description,
minAmount: minAmount,
maxAmount: maxAmount,
minInstallments: minInstallments,
maxInstallments: maxInstallments,
frequenciesJson: JSON.stringify(
frequencies.map(function (value) {
return String(value).toUpperCase();
})
),
interestRateAnnual: rate,
interestMethod: method,
feeFixed: fixedFee,
feePercent: percentFee,
enabled: enabled ? "TRUE" : "FALSE",
licenseType: String(p.licenseType || "").trim(),
maxEffectiveAnnualRate: maxRate,
legalReviewed: legalReviewed ? "TRUE" : "FALSE",
legalReviewedAt: legalReviewed ? now : "",
legalReviewedBy: legalReviewed
? auth.user.userId
: "",
createdAt: existing
? existing.createdAt
: now,
updatedAt: now
};

if (existing) {
updateRecord_(
"Products",
existing.rowNumber,
record
);
} else {
appendRecord_("Products", record);
}

logEvent_(
auth.user.userId,
"PRODUCT_SAVED",
"PRODUCT",
record.productId,
{
enabled: record.enabled,
legalReviewed: record.legalReviewed
}
);

return {
message: "บันทึกผลิตภัณฑ์สินเชื่อแล้ว",
product: safeProduct_(record)
};
}

function adminDisableProduct_(p) {
var auth = requireAdmin_(p);

var productId = String(p.productId || "").trim();

var product = findRecord_(
"Products",
"productId",
productId
);

if (!product) {
throwPublic_(
"ไม่พบผลิตภัณฑ์สินเชื่อ",
"PRODUCT_NOT_FOUND"
);
}

updateRecord_(
"Products",
product.rowNumber,
{
enabled: "FALSE",
updatedAt: nowIso_()
}
);

logEvent_(
auth.user.userId,
"PRODUCT_DISABLED",
"PRODUCT",
productId,
{}
);

return {
message: "ปิดการใช้งานผลิตภัณฑ์แล้ว"
};
}

/* ================================================================
R. LOAN APPLICATIONS
• ================================================================
*/

function safeLoan_(loan) {
return {
loanId: String(loan.loanId || ""),
productId: String(loan.productId || ""),
productName: String(loan.productName || ""),
purpose: String(loan.purpose || "GENERAL"),
purposeDetails: String(loan.purposeDetails || ""),
requestedAmount: Number(loan.requestedAmount || 0),
approvedAmount: Number(loan.approvedAmount || 0),
frequency: String(loan.frequency || ""),
dailyMode: String(loan.dailyMode || ""),
weeklyDay: String(loan.weeklyDay || ""),
monthlyDay: Number(loan.monthlyDay || 0),
firstDueDate: String(loan.firstDueDate || ""),
installments: Number(loan.installments || 0),
interestRateAnnual: Number(loan.interestRateAnnual || 0),
interestMethod: String(loan.interestMethod || ""),
status: String(loan.status || ""),
appliedAt: String(loan.appliedAt || ""),
reviewedAt: String(loan.reviewedAt || ""),
decisionNote: String(loan.decisionNote || ""),
offerExpiresAt: String(loan.offerExpiresAt || ""),
acceptedAt: String(loan.acceptedAt || ""),
disbursedAt: String(loan.disbursedAt || ""),
disbursementRef: String(loan.disbursementRef || ""),
disbursementSlipUrl: safeUrl_(loan.disbursementSlipUrl || ""),
disbursementSlipAlt: String(loan.disbursementSlipAlt || ""),
outstandingPrincipal: Number(loan.outstandingPrincipal || 0),
outstandingTotal: Number(loan.outstandingTotal || 0),
supplementalStatus: ""
};
}

function applyLoan_(p) {
var auth = authenticate_(p);

var productId = String(p.productId || "").trim();
var amount = parseMoney_(p.amount);
var installments = Number(p.installments);
var purpose = String(p.purpose || "GENERAL").trim().toUpperCase();
var purposeDetails = String(p.purposeDetails || "").trim().slice(0, 1000);
var allowedPurposes = ["LIVING_EXPENSES", "MEDICAL", "EDUCATION", "TRAVEL", "BUSINESS", "EMERGENCY", "OTHER", "GENERAL"];
if (allowedPurposes.indexOf(purpose) === -1) {
throwPublic_("กรุณาเลือกวัตถุประสงค์สินเชื่อให้ถูกต้อง", "INVALID_LOAN_PURPOSE");
}
if (purpose === "OTHER" && purposeDetails.length < 2) {
throwPublic_("กรุณาระบุวัตถุประสงค์อื่น ๆ", "LOAN_PURPOSE_DETAILS_REQUIRED");
}

var frequency = String(
p.frequency || ""
).toUpperCase();

var dailyMode = String(
p.dailyMode || "CALENDAR"
).toUpperCase();

var weeklyDay = String(
p.weeklyDay || ""
).toUpperCase();

var monthlyDay = Number(p.monthlyDay || 0);
var firstDueDate = String(
p.firstDueDate || ""
);

var product = findRecord_(
"Products",
"productId",
productId
);

if (!product || !productIsEnabled_(product)) {
throwPublic_(
"ผลิตภัณฑ์สินเชื่อนี้ยังไม่เปิดให้สมัคร",
"PRODUCT_NOT_AVAILABLE"
);
}

if (
!isFinite(amount) ||
amount < Number(product.minAmount) ||
amount > Number(product.maxAmount)
) {
throwPublic_(
"จำนวนเงินไม่อยู่ในช่วงที่ผลิตภัณฑ์รองรับ",
"INVALID_LOAN_AMOUNT"
);
}

if (
!Number.isInteger(installments) ||
installments < Number(product.minInstallments) ||
installments > Number(product.maxInstallments)
) {
throwPublic_(
"จำนวนงวดไม่อยู่ในช่วงที่ผลิตภัณฑ์รองรับ",
"INVALID_LOAN_INSTALLMENTS"
);
}

if (
["DAILY", "WEEKLY", "MONTHLY"].indexOf(frequency) === -1
) {
throwPublic_(
"กรุณาเลือกรอบชำระเงินให้ถูกต้อง",
"INVALID_FREQUENCY"
);
}

var allowedFrequencies = parseJsonArray_(
product.frequenciesJson
).map(function (value) {
return String(value).toUpperCase();
});

if (allowedFrequencies.indexOf(frequency) === -1) {
throwPublic_(
"ผลิตภัณฑ์นี้ไม่รองรับรอบชำระที่เลือก",
"FREQUENCY_NOT_SUPPORTED"
);
}

if (!isValidDateOnly_(firstDueDate) ||
firstDueDate <= todayDateOnly_()) {
throwPublic_(
"วันที่ชำระงวดแรกต้องเป็นวันที่ในอนาคต",
"INVALID_FIRST_DUE_DATE"
);
}

if (frequency === "DAILY" &&
["CALENDAR", "BUSINESS"].indexOf(dailyMode) === -1) {
throwPublic_(
"รูปแบบการชำระรายวันไม่ถูกต้อง",
"INVALID_DAILY_MODE"
);
}

if (frequency === "WEEKLY") {
var dayNames = [
"SUNDAY",
"MONDAY",
"TUESDAY",
"WEDNESDAY",
"THURSDAY",
"FRIDAY",
"SATURDAY"
 ];

if (dayNames.indexOf(weeklyDay) === -1) {
throwPublic_(
"กรุณาเลือกวันที่ชำระประจำสัปดาห์",
"INVALID_WEEKLY_DAY"
);
}

var firstDate = dateOnlyToUtc_(firstDueDate);

if (dayNames[firstDate.getUTCDay()] !== weeklyDay) {
throwPublic_(
"วันเริ่มชำระไม่ตรงกับวันที่เลือกในสัปดาห์",
"WEEKLY_DATE_MISMATCH"
);
}
}

if (
frequency === "MONTHLY" &&
(
!Number.isInteger(monthlyDay) ||
monthlyDay < 1 ||
monthlyDay > 31
)
) {
throwPublic_(
"กรุณาเลือกวันที่ชำระรายเดือนระหว่างวันที่ 1 ถึง 31",
"INVALID_MONTHLY_DAY"
);
}

if (frequency === "MONTHLY") {
var dateParts = firstDueDate.split("-").map(Number);

var daysInMonth = new Date(Date.UTC(
dateParts[0],
dateParts[1],
0
)).getUTCDate();

var expectedDay = Math.min(
monthlyDay,
daysInMonth
);

if (dateParts[2] !== expectedDay) {
throwPublic_(
"วันที่ชำระงวดแรกไม่ตรงกับวันที่ชำระประจำเดือนที่เลือก",
"MONTHLY_DATE_MISMATCH"
);
}
}

var now = nowIso_();

var loan = {
loanId: uuid_(),
userId: auth.user.userId,
productId: product.productId,
productName: product.name,
purpose: purpose,
purposeDetails: purposeDetails,
requestedAmount: amount,
approvedAmount: 0,
frequency: frequency,
dailyMode: frequency === "DAILY" ? dailyMode : "",
weeklyDay: frequency === "WEEKLY" ? weeklyDay : "",
monthlyDay: frequency === "MONTHLY" ? monthlyDay : "",
firstDueDate: firstDueDate,
installments: installments,
interestRateAnnual: Number(product.interestRateAnnual),
interestMethod: String(product.interestMethod),
status: "PENDING_REVIEW",
appliedAt: now,
reviewedBy: "",
reviewedAt: "",
decisionNote: "",
offerExpiresAt: "",
acceptedAt: "",
disbursedAt: "",
disbursedBy: "",
disbursementRef: "",
outstandingPrincipal: 0,
outstandingTotal: 0,
createdAt: now,
updatedAt: now
};

var applicationLock = LockService.getScriptLock();
if (!applicationLock.tryLock(10000)) {
throwPublic_("ระบบกำลังประมวลผลคำขอ กรุณาลองใหม่อีกครั้ง", "SYSTEM_BUSY");
}
try {
var duplicateProductApplication = getRecordsByField_("Loans", "userId", auth.user.userId).some(function (existingLoan) {
return String(existingLoan.productId) === String(product.productId);
});
if (duplicateProductApplication) {
throwPublic_("คุณเคยสมัครผลิตภัณฑ์สินเชื่อนี้แล้ว สามารถสมัครผลิตภัณฑ์อื่นที่ยังไม่เคยสมัครได้", "PRODUCT_ALREADY_APPLIED");
}
appendRecord_("Loans", loan);
} finally {
applicationLock.releaseLock();
}

logEvent_(
auth.user.userId,
"LOAN_APPLIED",
"LOAN",
loan.loanId,
{
productId: productId,
purpose: purpose,
purposeDetails: purposeDetails,
requestedAmount: amount,
frequency: frequency,
installments: installments
}
);

createLoanStatusNotification_(
loan,
"ได้รับคำขอสินเชื่อแล้ว",
"FINORA ได้รับคำขอสินเชื่อ " + loan.loanId + " เรียบร้อยแล้ว ขณะนี้อยู่ระหว่างรอเจ้าหน้าที่ตรวจสอบ"
);

return {
message: "ส่งคำขอสินเชื่อแล้ว",
loan: safeLoan_(loan)
};
}

function acceptLoanOffer_(p) {
var auth = authenticate_(p);

var loanId = String(p.loanId || "").trim();

if (!parseBoolean_(p.acceptOffer)) {
throwPublic_(
"กรุณายืนยันยอมรับข้อเสนอสินเชื่อ",
"OFFER_NOT_ACCEPTED"
);
}

var loan = findRecord_(
"Loans",
"loanId",
loanId
);

if (!loan || String(loan.userId) !== String(auth.user.userId)) {
throwPublic_(
"ไม่พบคำขอสินเชื่อ",
"LOAN_NOT_FOUND"
);
}

if (String(loan.status) !== "APPROVED_PENDING_ACCEPTANCE") {
throwPublic_(
"คำขอนี้ไม่ได้อยู่ในสถานะรอยอมรับข้อเสนอ",
"LOAN_NOT_AWAITING_ACCEPTANCE"
);
}

requireApprovedSupplementalForLoan_(loan.loanId);

if (
loan.offerExpiresAt &&
new Date(loan.offerExpiresAt).getTime() <= Date.now()
) {
throwPublic_(
"ข้อเสนอสินเชื่อหมดอายุแล้ว",
"OFFER_EXPIRED"
);
}

updateRecord_(
"Loans",
loan.rowNumber,
{
status: "ACCEPTED_PENDING_DISBURSEMENT",
acceptedAt: nowIso_(),
updatedAt: nowIso_()
}
);

createLoanStatusNotification_(
loan,
"ยืนยันข้อเสนอสินเชื่อแล้ว",
"คุณยอมรับข้อเสนอสินเชื่อ " + loan.loanId + " เรียบร้อยแล้ว ขณะนี้คำขออยู่ระหว่างรอการดำเนินการจ่ายเงิน"
);

logEvent_(
auth.user.userId,
"LOAN_OFFER_ACCEPTED",
"LOAN",
loanId,
{}
);

return {
message: "ยืนยันข้อเสนอสินเชื่อแล้ว และกำลังรอขั้นตอนจ่ายเงิน"
};
}

/* ================================================================
S. ADMIN LOAN REVIEW
• ================================================================
*/

function adminListLoans_(p) {
requireAdmin_(p);

var filterStatus = String(p.status || "").toUpperCase();

var loans = getRecords_("Loans");

if (filterStatus) {
loans = loans.filter(function (loan) {
return String(loan.status).toUpperCase() === filterStatus;
});
}

var users = getRecords_("Users");
var userMap = {};

users.forEach(function (user) {
userMap[String(user.userId)] = user;
});

return {
loans: loans.map(function (loan) {
var record = safeLoan_(loan);
var user = userMap[String(loan.userId)];

record.customerName = user
? String(user.fullName || "")
: "";

record.customerEmail = user
? String(user.email || "")
: "";

record.customerPhone = user
? String(user.phone || "")
: "";
var supplementalRecord = findLatestLoanSupplemental_(loan.loanId);
record.supplementalId = supplementalRecord ? String(supplementalRecord.supplementalId || "") : "";
record.disbursementSlipUrl = safeUrl_(loan.disbursementSlipUrl || "");

return record;
})
};
}

function adminDecideLoan_(p) {
var auth = requireAdmin_(p);

var loanId = String(p.loanId || "").trim();

var decision = String(
p.decision || ""
).toUpperCase();

var note = String(p.note || "").trim();

if (["APPROVE", "REJECT"].indexOf(decision) === -1) {
throwPublic_(
"คำสั่งพิจารณาสินเชื่อไม่ถูกต้อง",
"INVALID_LOAN_DECISION"
);
}

if (note.length < 2 || note.length > 1000) {
throwPublic_(
"กรุณาระบุเหตุผลประกอบการพิจารณา",
"DECISION_NOTE_REQUIRED"
);
}

var loan = findRecord_(
"Loans",
"loanId",
loanId
);

if (!loan) {
throwPublic_(
"ไม่พบคำขอสินเชื่อ",
"LOAN_NOT_FOUND"
);
}

if (String(loan.status) !== "PENDING_REVIEW") {
throwPublic_(
"คำขอนี้ไม่อยู่ในสถานะรอพิจารณา",
"LOAN_NOT_PENDING"
);
}

var updates = {
reviewedBy: auth.user.userId,
reviewedAt: nowIso_(),
decisionNote: note,
updatedAt: nowIso_()
};

if (decision === "REJECT") {
updates.status = "REJECTED";

} else {
var product = findRecord_(
"Products",
"productId",
loan.productId
);

if (!product || !productIsEnabled_(product)) {
throwPublic_(
"ผลิตภัณฑ์ไม่พร้อมให้อนุมัติ",
"PRODUCT_NOT_AVAILABLE"
);
}

var approvedAmount = parseMoney_(
p.approvedAmount || loan.requestedAmount
);

if (
!isFinite(approvedAmount) ||
approvedAmount <= 0 ||
approvedAmount > Number(loan.requestedAmount) ||
approvedAmount < Number(product.minAmount) ||
approvedAmount > Number(product.maxAmount)
) {
throwPublic_(
"วงเงินอนุมัติไม่อยู่ในช่วงที่กำหนด",
"INVALID_APPROVED_AMOUNT"
);
}

updates.status = "APPROVED_PENDING_ACCEPTANCE";
updates.approvedAmount = approvedAmount;
updates.interestRateAnnual = Number(
product.interestRateAnnual
);
updates.interestMethod = String(
product.interestMethod
);
updates.offerExpiresAt = new Date(
Date.now() + 7 * 24 * 60 * 60 * 1000
).toISOString();
}

updateRecord_(
"Loans",
loan._rowNumber,
updates
);

if (decision === "APPROVE") {
ensureLoanSupplementalRecord_(loan, auth.user.userId);
}

logEvent_(
auth.user.userId,
"LOAN_DECISION",
"LOAN",
loanId,
{
decision: decision,
note: note
}
);

createLoanStatusNotification_(
loan,
decision === "APPROVE" ? "คำขอสินเชื่อได้รับการอนุมัติเบื้องต้น" : "ผลการพิจารณาคำขอสินเชื่อ",
decision === "APPROVE"
? "คำขอสินเชื่อ " + loan.loanId + " ได้รับการอนุมัติเบื้องต้นแล้ว กรุณาเข้าสู่ระบบเพื่อตรวจสอบรายละเอียดและดำเนินการในขั้นตอนถัดไป"
: "คำขอสินเชื่อ " + loan.loanId + " ได้รับการพิจารณาแล้ว กรุณาเข้าสู่ระบบเพื่อตรวจสอบรายละเอียดและหมายเหตุจากเจ้าหน้าที่"
);

return {
message: decision === "APPROVE"
? "อนุมัติข้อเสนอสินเชื่อแล้ว"
: "บันทึกผลไม่อนุมัติแล้ว",
status: updates.status
};
}

/* ================================================================
T. REPAYMENT SCHEDULE GENERATION
• ================================================================
*/

function moneyPrecision_(value) {
return Math.round(
Number(value) * 100
) / 100;
}

function addDaysToDateOnly_(dateOnly, days) {
var date = dateOnlyToUtc_(dateOnly);

if (!date) {
throwPublic_(
"วันที่ไม่ถูกต้อง",
"INVALID_DATE"
);
}

date.setUTCDate(date.getUTCDate() + Number(days));

return [
date.getUTCFullYear(),
String(date.getUTCMonth() + 1).padStart(2, "0"),
String(date.getUTCDate()).padStart(2, "0")
 ].join("-");
}

function addBusinessDays_(dateOnly, numberOfDays) {
var result = dateOnly;

for (var i = 0; i < numberOfDays; i++) {
result = addDaysToDateOnly_(result, 1);

var date = dateOnlyToUtc_(result);
var day = date.getUTCDay();

while (day === 0 || day === 6) {
result = addDaysToDateOnly_(result, 1);
date = dateOnlyToUtc_(result);
day = date.getUTCDay();
}
}

return result;
}

function addMonthsClamped_(dateOnly, monthOffset, desiredDay) {
var parts = dateOnly.split("-").map(Number);

var year = parts[0];
var monthIndex = parts[1] - 1 + Number(monthOffset);

year += Math.floor(monthIndex / 12);
monthIndex = ((monthIndex % 12) + 12) % 12;

var daysInMonth = new Date(Date.UTC(
year,
monthIndex + 1,
0
)).getUTCDate();

var day = Math.min(
Number(desiredDay),
daysInMonth
);

return [
year,
String(monthIndex + 1).padStart(2, "0"),
String(day).padStart(2, "0")
 ].join("-");
}

function getScheduleDate_(loan, installmentIndex) {
var index = Number(installmentIndex);
var start = String(loan.firstDueDate || "").trim();

// Older sheet records may contain a timestamp rather than a date-only string.
if (/^\d{4}-\d{2}-\d{2}T/.test(start)) {
var parsedStart = new Date(start);
if (!isNaN(parsedStart.getTime())) {
var timezone = Session.getScriptTimeZone();
try {
var loansSheet = getSheet_("Loans");
timezone = loansSheet.getParent().getSpreadsheetTimeZone() || timezone;
} catch (ignored) {}
start = Utilities.formatDate(parsedStart, timezone, "yyyy-MM-dd");
}
}

if (!isValidDateOnly_(start)) {
throwPublic_("วันที่เริ่มชำระเงินของสินเชื่อไม่ถูกต้อง กรุณาตรวจสอบช่อง firstDueDate ในชีต Loans", "INVALID_FIRST_DUE_DATE");
}

if (index === 0) {
return start;
}

if (String(loan.frequency) === "DAILY") {
if (String(loan.dailyMode) === "BUSINESS") {
return addBusinessDays_(start, index);
}

return addDaysToDateOnly_(start, index);
}

if (String(loan.frequency) === "WEEKLY") {
return addDaysToDateOnly_(start, index * 7);
}

if (String(loan.frequency) === "MONTHLY") {
return addMonthsClamped_(
start,
index,
Number(loan.monthlyDay)
);
}

throwPublic_(
"ไม่สามารถคำนวณวันที่ชำระได้",
"INVALID_SCHEDULE_FREQUENCY"
);
}

/**
• Creates an installment schedule for an already accepted loan.
• The interest formula here is a basic implementation:
◦ REDUCING_BALANCE: rate per repayment period
◦ FLAT: simple-interest total split across installments
• It must be checked against the signed contract and the applicable
• Thai lending rules before use with real customer loans.
*/
function generateLoanSchedule_(loan, product) {
var scheduleLock = LockService.getScriptLock();
if (!scheduleLock.tryLock(10000)) {
throwPublic_("ระบบกำลังดำเนินการ กรุณาลองจ่ายยอดสินเชื่ออีกครั้ง", "SYSTEM_BUSY");
}
try {
return generateLoanScheduleUnlocked_(loan, product);
} finally {
scheduleLock.releaseLock();
}
}

function generateLoanScheduleUnlocked_(loan, product) {
var existing = getRecordsByField_(
"Installments",
"loanId",
loan.loanId
);

if (existing.length > 0) {
throwPublic_(
"บัญชีสินเชื่อนี้มีตารางชำระเงินแล้ว",
"SCHEDULE_ALREADY_EXISTS"
);
}

var principal = moneyPrecision_(
loan.approvedAmount
);

var count = Number(loan.installments);
var annualRate = Number(loan.interestRateAnnual) / 100;
var method = String(loan.interestMethod);

var periodsPerYear =
String(loan.frequency) === "DAILY" ? 365 :
String(loan.frequency) === "WEEKLY" ? 52 :
12;

var periodRate = annualRate / periodsPerYear;

var flatInterestTotal = moneyPrecision_(
principal * annualRate * count / periodsPerYear
);

var reducingPayment = 0;

if (periodRate === 0) {
reducingPayment = principal / count;

} else {
reducingPayment =
principal * periodRate /
(1 - Math.pow(1 + periodRate, -count));
}

var fixedFee = Number(product.feeFixed || 0);

var feePercent = Number(product.feePercent || 0);

var percentageFee = moneyPrecision_(
principal * feePercent / 100
);

var feeTotal = moneyPrecision_(
fixedFee + percentageFee
);

var balance = principal;
var schedule = [];
var totalDueSum = 0;

for (var i = 0; i < count; i++) {
var interest;
var principalComponent;

if (method === "FLAT") {
interest = moneyPrecision_(
flatInterestTotal / count
);

principalComponent = moneyPrecision_(
principal / count
);

} else {
interest = moneyPrecision_(
balance * periodRate
);

if (i === count - 1) {
principalComponent = moneyPrecision_(
balance
);

} else {
principalComponent = moneyPrecision_(
reducingPayment - interest
);

principalComponent = Math.max(
0,
Math.min(principalComponent, balance)
);
}
}

if (i === count - 1) {
principalComponent = moneyPrecision_(balance);
}

balance = moneyPrecision_(
balance - principalComponent
);

var installmentFee = i === 0 ? feeTotal : 0;

var totalDue = moneyPrecision_(
principalComponent +
interest +
installmentFee
);

var dueDate = getScheduleDate_(loan, i);

var installment = {
installmentId: uuid_(),
loanId: String(loan.loanId),
userId: String(loan.userId),
installmentNo: i + 1,
dueDate: dueDate,
principalAmount: principalComponent,
interestAmount: interest,
feeAmount: installmentFee,
totalDue: totalDue,
paidAmount: 0,
status: "UNPAID",
createdAt: nowIso_(),
updatedAt: nowIso_()
};

schedule.push(installment);

totalDueSum = moneyPrecision_(
totalDueSum + totalDue
);
}

schedule.forEach(function (installment) {
appendRecord_(
"Installments",
installment
);
});

return {
count: schedule.length,
totalDue: totalDueSum,
outstandingPrincipal: principal
};
}

/**
• The admin should call this only after confirming the actual bank
• transfer took place outside this API.
*/
function adminMarkDisbursed_(p) {
var auth = requireAdmin_(p);

var loanId = String(p.loanId || "").trim();
var reference = String(
p.disbursementRef || ""
).trim();
var disbursementSlipUrl = safeUrl_(p.disbursementSlipUrl || "");

if (!disbursementSlipUrl) {
throwPublic_("กรุณาอัปโหลดสลิปการโอนเงินก่อนยืนยันการจ่ายเงิน", "DISBURSEMENT_SLIP_REQUIRED");
}

if (reference.length < 3 || reference.length > 200) {
throwPublic_(
"กรุณาระบุเลขอ้างอิงธุรกรรมการจ่ายเงิน",
"DISBURSEMENT_REFERENCE_REQUIRED"
);
}

var loan = findRecord_(
"Loans",
"loanId",
loanId
);

if (!loan) {
throwPublic_(
"ไม่พบคำขอสินเชื่อ",
"LOAN_NOT_FOUND"
);
}

if (String(loan.status) !== "ACCEPTED_PENDING_DISBURSEMENT") {
throwPublic_(
"สินเชื่อนี้ยังไม่อยู่ในสถานะพร้อมจ่ายเงิน",
"LOAN_NOT_READY_FOR_DISBURSEMENT"
);
}

requireApprovedSupplementalForLoan_(loan.loanId);

var product = findRecord_(
"Products",
"productId",
loan.productId
);

if (!product || !parseBoolean_(product.legalReviewed)) {
throwPublic_(
"ไม่สามารถจ่ายเงินได้ เนื่องจากผลิตภัณฑ์ยังไม่ผ่านการตรวจสอบ",
"PRODUCT_NOT_LEGALLY_REVIEWED"
);
}

var scheduleResult = generateLoanSchedule_(
loan,
product
);

updateRecord_(
"Loans",
loan.rowNumber,
{
status: "DISBURSED",
disbursedAt: nowIso_(),
disbursedBy: auth.user.userId,
disbursementRef: reference,
disbursementSlipUrl: disbursementSlipUrl,
disbursementSlipAlt: "หลักฐานการโอนเงินสินเชื่อ " + String(loan.loanId),
disbursementEmailSentAt: "",
outstandingPrincipal: scheduleResult.outstandingPrincipal,
outstandingTotal: scheduleResult.totalDue,
updatedAt: nowIso_()
}
);

var updatedLoan = findRecord_("Loans", "loanId", loanId) || loan;
var payoutEmailSent = sendLoanDisbursementEmail_(updatedLoan, disbursementSlipUrl);
if (payoutEmailSent) {
updateRecord_("Loans", updatedLoan.rowNumber, {
disbursementEmailSentAt: nowIso_(),
updatedAt: nowIso_()
});
}

createLoanStatusNotification_(
updatedLoan,
"โอนเงินสินเชื่อสำเร็จ",
"FINORA ได้บันทึกการโอนเงินสินเชื่อ " + loanId + " เรียบร้อยแล้ว สามารถเข้าสู่ระบบเพื่อดูรายละเอียดและสลิปการโอนได้"
);

logEvent_(
auth.user.userId,
"LOAN_MARKED_DISBURSED",
"LOAN",
loanId,
{
disbursementRef: reference,
scheduleCount: scheduleResult.count,
disbursementSlipUrl: disbursementSlipUrl,
emailSent: payoutEmailSent
}
);

return {
message: payoutEmailSent
? "บันทึกการโอนเงิน สร้างตารางชำระ และส่งอีเมลยืนยันแล้ว"
: "บันทึกการโอนเงินและสร้างตารางชำระแล้ว แต่ยังส่งอีเมลไม่ได้ กรุณาตรวจสอบโควตาหรืออีเมลผู้กู้",
emailSent: payoutEmailSent,
scheduleCount: scheduleResult.count,
outstandingPrincipal: scheduleResult.outstandingPrincipal,
outstandingTotal: scheduleResult.totalDue
};
}

/* ================================================================
U. BORROWER LOAN VIEWS
• ================================================================
*/

function getInstallmentsForLoan_(loanId) {
return getRecordsByField_(
"Installments",
"loanId",
loanId
).sort(function (a, b) {
return Number(a.installmentNo) -
Number(b.installmentNo);
});
}

function safeInstallment_(installment) {
return {
installmentId: String(installment.installmentId || ""),
loanId: String(installment.loanId || ""),
installmentNo: Number(installment.installmentNo || 0),
dueDate: String(installment.dueDate || ""),
principalAmount: Number(installment.principalAmount || 0),
interestAmount: Number(installment.interestAmount || 0),
feeAmount: Number(installment.feeAmount || 0),
totalDue: Number(installment.totalDue || 0),
paidAmount: Number(installment.paidAmount || 0),
outstandingAmount: moneyPrecision_(
Number(installment.totalDue || 0) -
Number(installment.paidAmount || 0)
),
status: String(installment.status || ""),
reminderDueDaySentAt: String(installment.reminderDueDaySentAt || ""),
reminderNoonSentAt: String(installment.reminderNoonSentAt || ""),
reminderEveningSentAt: String(installment.reminderEveningSentAt || ""),
overdueOneDaySentAt: String(installment.overdueOneDaySentAt || ""),
receiptEmailSentAt: String(installment.receiptEmailSentAt || "")
};
}

function myLoans_(p) {
var auth = authenticate_(p);

var loans = getRecordsByField_(
"Loans",
"userId",
auth.user.userId
);

return {
loans: loans.map(function (loan) {
var safe = safeLoan_(loan);

// Preserve the configured installment count before installments is replaced
// with the actual schedule array used by the payment table.
safe.installmentCount = Number(safe.installments || 0);

safe.installments = getInstallmentsForLoan_(
loan.loanId
).map(safeInstallment_);
var supplemental = findLatestLoanSupplemental_(loan.loanId);
safe.supplemental = supplemental ? safeLoanSupplementalSummary_(supplemental) : null;
safe.supplementalStatus = supplemental ? String(supplemental.status || "") : "";

return safe;
})
};
}

function borrowerDashboard_(p) {
var auth = authenticate_(p);

var loans = getRecordsByField_(
"Loans",
"userId",
auth.user.userId
);

var dueTotal = 0;

var allInstallments = [];

loans.forEach(function (loan) {
getInstallmentsForLoan_(loan.loanId).forEach(
function (installment) {
var outstanding = moneyPrecision_(
Number(installment.totalDue || 0) -
Number(installment.paidAmount || 0)
);

if (outstanding > 0) {
dueTotal = moneyPrecision_(
dueTotal + outstanding
);

allInstallments.push(
safeInstallment_(installment)
);
}
}
);
});

allInstallments.sort(function (a, b) {
return String(a.dueDate).localeCompare(
String(b.dueDate)
);
});

var activeLoans = loans.filter(function (loan) {
return String(loan.status) === "DISBURSED";
});

return {
user: safeUser_(auth.user),
totalLoans: loans.length,
activeLoans: activeLoans.length,
dueTotal: dueTotal,
nextDue: allInstallments.length
? allInstallments[0]
: null,
recentLoans: loans
.slice(-5)
.reverse()
.map(safeLoan_)
};
}

/* ================================================================
V. THUNDER SOLUTION HTTP HELPERS
• ================================================================
*/

function thunderRequest_(url, body) {
var token = requireProperty_("THUNDER_API_TOKEN");

var response;

try {
response = UrlFetchApp.fetch(url, {
method: "post",
contentType: "application/json",
headers: {
Authorization: "Bearer " + token
},
payload: JSON.stringify(body),
muteHttpExceptions: true
});

} catch (err) {
console.error("Thunder request failed: " + String(err));

throwPublic_(
"ไม่สามารถเชื่อมต่อผู้ให้บริการชำระเงินได้",
"THUNDER_NETWORK_ERROR"
);
}

var statusCode = response.getResponseCode();
var text = response.getContentText();
var json;

try {
json = JSON.parse(text);
} catch (err) {
json = null;
}

if (statusCode < 200 || statusCode >= 300) {
console.error(
"Thunder API HTTP " +
statusCode +
": " +
String(text).substring(0, 1500)
);

throwPublic_(
"ผู้ให้บริการชำระเงินปฏิเสธคำขอ กรุณาลองใหม่ภายหลัง",
"THUNDER_API_ERROR"
);
}

if (!json || typeof json !== "object") {
throwPublic_(
"ได้รับผลตอบกลับจากผู้ให้บริการในรูปแบบที่ไม่ถูกต้อง",
"THUNDER_INVALID_RESPONSE"
);
}

return json;
}

/**
• Generate a PromptPay QR for the exact amount that is owed.
• Uses only the merchant's configured PromptPay recipient:
• THUNDER_QR_PROMPTPAY_MSISDN
• or
• THUNDER_QR_PROMPTPAY_NAT_ID
• Never use the borrower's citizen ID as the payment recipient.
*/
function generateThunderQr_(amount) {
var config = getConfig_();

var body = {
type: "PROMPTPAY",
amount: moneyPrecision_(amount)
};

if (config.thunderPromptPayMsisdn) {
if (!isValidPhone_(config.thunderPromptPayMsisdn)) {
throwPublic_(
"เบอร์พร้อมเพย์ผู้รับเงินในระบบยังไม่ถูกต้อง",
"INVALID_MERCHANT_PROMPTPAY"
);
}

body.msisdn = config.thunderPromptPayMsisdn;

} else if (
/^\d{13}`$/.test(config.thunderPromptPayNatId)
) {
body.natId = config.thunderPromptPayNatId;

} else {
throwPublic_(
"กรุณากำหนดบัญชีพร้อมเพย์ผู้รับเงินใน Script Properties",
"PROMPTPAY_NOT_CONFIGURED"
);
}

var result = thunderRequest_(
"https://api.thunder.in.th/v1/qr/generate",
body
);

if (
Number(result.status) !== 200 ||
!result.data ||
!result.data.image ||
!result.data.payload
) {
console.error(
"Unexpected Thunder QR response: " +
JSON.stringify(result).substring(0, 1000)
);

throwPublic_(
"ไม่สามารถสร้าง QR Code ได้",
"QR_GENERATION_FAILED"
);
}

return {
image: String(result.data.image),
mime: String(result.data.mime || "image/png"),
payload: String(result.data.payload)
};
}

/* ================================================================
W. CREATE PAYMENT QR
• ================================================================
*/

function createPaymentQR_(p) {
var auth = authenticate_(p);

var loanId = String(p.loanId || "").trim();

var loan = findRecord_(
"Loans",
"loanId",
loanId
);

if (!loan ||
String(loan.userId) !== String(auth.user.userId)) {
throwPublic_(
"ไม่พบสินเชื่อของคุณ",
"LOAN_NOT_FOUND"
);
}

if (String(loan.status) !== "DISBURSED") {
throwPublic_(
"สินเชื่อนี้ยังไม่สามารถชำระคืนผ่านระบบได้",
"LOAN_NOT_PAYABLE"
);
}

var allInstallments = getInstallmentsForLoan_(
loanId
);

var requestedIds = parseJsonArray_(
p.installmentIds
).map(function (value) {
return String(value);
});

var unpaid = allInstallments.filter(function (item) {
return moneyPrecision_(
Number(item.totalDue || 0) -
Number(item.paidAmount || 0)
) > 0 &&
String(item.status) !== "PAID";
});

var selected;

if (requestedIds.length > 0) {
if (
requestedIds.some(function (id) {
return requestedIds.indexOf(id) !==
requestedIds.lastIndexOf(id);
})
) {
throwPublic_(
"มีการเลือกรายการงวดซ้ำ",
"DUPLICATE_INSTALLMENT"
);
}

selected = unpaid.filter(function (item) {
return requestedIds.indexOf(
String(item.installmentId)
) >= 0;
});

if (selected.length !== requestedIds.length) {
throwPublic_(
"พบรายการงวดที่ไม่ถูกต้องหรือชำระไปแล้ว",
"INVALID_INSTALLMENT_SELECTION"
);
}

} else {
selected = unpaid.length > 0
? [unpaid[0]]
: [];
}

if (selected.length === 0) {
throwPublic_(
"ไม่มีงวดที่ต้องชำระในรายการที่เลือก",
"NO_OUTSTANDING_INSTALLMENTS"
);
}

var amount = 0;

selected.forEach(function (item) {
amount = moneyPrecision_(
amount +
Number(item.totalDue || 0) -
Number(item.paidAmount || 0)
);
});

if (!isFinite(amount) || amount <= 0) {
throwPublic_(
"ยอดชำระไม่ถูกต้อง",
"INVALID_PAYMENT_AMOUNT"
);
}

var qr = generateThunderQr_(amount);

var paymentId = uuid_();
var now = nowIso_();

var payment = {
paymentId: paymentId,
userId: auth.user.userId,
loanId: loanId,
installmentIdsJson: JSON.stringify(
selected.map(function (item) {
return String(item.installmentId);
})
),
amount: amount,
currency: "THB",
method: "THUNDER_PROMPTPAY",
qrPayload: qr.payload,
qrRef: "FINORA-" + paymentId.substring(0, 12),
expiresAt: new Date(
Date.now() + 24 * 60 * 60 * 1000
).toISOString(),
status: "AWAITING_SLIP",
slipAmount: "",
slipTransRef: "",
slipDate: "",
slipSenderBank: "",
slipReceiverBank: "",
slipVerifiedAt: "",
verificationMessage: "",
createdAt: now,
updatedAt: now,
reviewedBy: "",
reviewNote: ""
};

appendRecord_("Payments", payment);

logEvent_(
auth.user.userId,
"PAYMENT_QR_CREATED",
"PAYMENT",
paymentId,
{
amount: amount,
loanId: loanId,
installmentCount: selected.length
}
);

return {
message: "สร้าง QR Code สำหรับยอดชำระแล้ว",
paymentId: paymentId,
amount: amount,
currency: "THB",
qrImageDataUrl: "data:" +
qr.mime +
";base64," +
qr.image,
expiresAt: payment.expiresAt,
installmentIds: JSON.parse(
payment.installmentIdsJson
)
};
}

/* ================================================================
X. VERIFY SLIP WITH THUNDER SOLUTION
• ================================================================
*/

/**
• The frontend sends a data URL:
• data:image/jpeg;base64,....
• This implementation does not upload bank slips to ImgBB.
• Public image hosting is unsuitable for financial proof documents.
*/
function samePaymentTarget_(a, b) {
if (!a || !b) return false;
if (String(a.loanId || "") !== String(b.loanId || "")) return false;
if (Math.abs(Number(a.amount || 0) - Number(b.amount || 0)) > 0.01) return false;
var aIds = parseJsonArray_(a.installmentIdsJson).map(String).sort();
var bIds = parseJsonArray_(b.installmentIdsJson).map(String).sort();
if (aIds.length !== bIds.length) return false;
for (var i = 0; i < aIds.length; i++) {
if (aIds[i] !== bIds[i]) return false;
}
return true;
}

function submitSlip_(p) {
var auth = authenticate_(p);

var paymentId = String(p.paymentId || "").trim();
var imageData = String(p.imageData || "").trim();

if (!imageData) {
throwPublic_(
"กรุณาเลือกรูปสลิปก่อนส่งตรวจสอบ",
"SLIP_REQUIRED"
);
}

var parsed = parseImageDataUrl_(imageData);
// Store an HMAC fingerprint only; never persist the bank-slip image itself.
var slipFingerprint = hashSecret_(parsed.mime + "|" + parsed.base64);

var configuredMax = Number(
getProperty_("MAX_IMAGE_SIZE_BYTES", "4194304")
);

var maxBytes = Math.min(
isFinite(configuredMax) && configuredMax > 0
? configuredMax
: 4194304,
4 * 1024 * 1024
);

var estimatedBytes = Math.floor(
parsed.base64.length * 3 / 4
);

if (estimatedBytes > maxBytes) {
throwPublic_(
"ขนาดไฟล์สลิปเกินที่ระบบกำหนด",
"SLIP_TOO_LARGE"
);
}

var lock = LockService.getScriptLock();

if (!lock.tryLock(10000)) {
throwPublic_(
"ระบบกำลังดำเนินการ กรุณาลองใหม่",
"SYSTEM_BUSY"
);
}

var payment;
var priorStatus = "";
var knownUnpaidFingerprint = false;

try {
payment = findRecord_(
"Payments",
"paymentId",
paymentId
);

if (!payment ||
String(payment.userId) !== String(auth.user.userId)) {
throwPublic_(
"ไม่พบรายการชำระเงิน",
"PAYMENT_NOT_FOUND"
);
}

priorStatus = String(payment.status || "");

if (priorStatus === "PAID") {
throwPublic_(
"รายการนี้ได้รับการยืนยันการชำระแล้ว ไม่สามารถชำระซ้ำได้",
"PAYMENT_ALREADY_PAID"
);
}

if (["AWAITING_SLIP", "RETRY_REQUIRED", "REVIEW_REQUIRED"].indexOf(priorStatus) === -1) {
throwPublic_(
"รายการนี้กำลังตรวจสอบหรือไม่พร้อมรับการตรวจสลิป",
"PAYMENT_NOT_READY"
);
}

var fingerprintMatches = getRecords_("Payments").filter(function (other) {
return String(other.slipFingerprint || "") === slipFingerprint;
});

var fingerprintAlreadyPaid = fingerprintMatches.some(function (other) {
return String(other.paymentId) !== String(paymentId) &&
String(other.status) === "PAID";
});

if (fingerprintAlreadyPaid) {
throwPublic_(
"สลิปนี้เคยได้รับการยืนยันการชำระสำเร็จแล้ว ไม่สามารถใช้ซ้ำได้",
"SLIP_ALREADY_PAID"
);
}

var fingerprintCurrentlyVerifying = fingerprintMatches.some(function (other) {
return String(other.paymentId) !== String(paymentId) &&
String(other.status) === "VERIFYING";
});

if (fingerprintCurrentlyVerifying) {
throwPublic_(
"สลิปนี้กำลังอยู่ระหว่างการตรวจสอบ กรุณารอผลก่อนส่งอีกครั้ง",
"SLIP_ALREADY_VERIFYING"
);
}

knownUnpaidFingerprint = fingerprintMatches.some(function (other) {
return String(other.paymentId) !== String(paymentId) &&
samePaymentTarget_(other, payment) &&
String(other.status) !== "PAID" &&
String(other.status) !== "VERIFYING";
}) || (
String(payment.slipFingerprint || "") === slipFingerprint &&
["RETRY_REQUIRED", "REVIEW_REQUIRED"].indexOf(priorStatus) >= 0
);

updateRecord_(
"Payments",
payment.rowNumber,
{
status: "VERIFYING",
slipFingerprint: slipFingerprint,
verificationMessage: "กำลังตรวจสอบสลิป",
updatedAt: nowIso_()
}
);

} finally {
lock.releaseLock();
}

var verificationResult;

try {
var requestBody = {
base64: imageData,
matchAmount: Number(payment.amount),
checkDuplicate: true,
remark: String(payment.paymentId)
};

var config = getConfig_();

if (config.thunderMatchAccount) {
requestBody.matchAccount = true;
}

verificationResult = thunderRequest_(
"https://api.thunder.in.th/v2/verify/bank",
requestBody
);

} catch (err) {
var currentPayment = findRecord_(
"Payments",
"paymentId",
paymentId
);

if (
currentPayment &&
String(currentPayment.status) === "VERIFYING"
) {
updateRecord_(
"Payments",
currentPayment.rowNumber,
{
status: "REVIEW_REQUIRED",
verificationMessage: "ผู้ให้บริการไม่สามารถยืนยันผลได้",
updatedAt: nowIso_()
}
);
}

return {
message: "ระบบยังไม่สามารถยืนยันสลิปได้ กรุณาลองใหม่ภายหลัง",
status: "REVIEW_REQUIRED",
paymentId: paymentId
};
}

var data = verificationResult.data || {};
var rawSlip = data.rawSlip || {};

if (verificationResult.success !== true) {
var failedPayment = findRecord_(
"Payments",
"paymentId",
paymentId
);

if (failedPayment) {
updateRecord_(
"Payments",
failedPayment.rowNumber,
{
status: "RETRY_REQUIRED",
verificationMessage: "ตรวจสอบสลิปไม่สำเร็จ",
updatedAt: nowIso_()
}
);
}

return {
message: "ไม่สามารถยืนยันสลิปนี้ได้ กรุณาตรวจสอบรูปภาพและลองใหม่",
status: "RETRY_REQUIRED",
paymentId: paymentId
};
}

var expectedAmount = Number(payment.amount);

var amountInSlip = Number(
data.amountInSlip !== undefined
? data.amountInSlip
: (
rawSlip.amount &&
rawSlip.amount.local
? rawSlip.amount.local.amount
: NaN
)
);

var isDuplicate = parseBoolean_(data.isDuplicate);

var amountMatched =
isFinite(amountInSlip) &&
Math.abs(amountInSlip - expectedAmount) <= 0.01 &&
data.isAmountMatched !== false;

var accountMatched = !getConfig_().thunderMatchAccount ||
Boolean(data.matchedAccount);

var transRef = String(rawSlip.transRef || "").trim();

var invalidReason = "";
var priorReferencePayments = transRef
? getRecords_("Payments").filter(function (other) {
return String(other.paymentId) !== String(paymentId) &&
String(other.slipTransRef || "") === transRef;
})
: [];

var referenceAlreadyPaid = priorReferencePayments.some(function (other) {
return String(other.status) === "PAID";
});

var referenceHasUnpaidAttempt = priorReferencePayments.some(function (other) {
return samePaymentTarget_(other, payment) &&
String(other.status) !== "PAID" &&
String(other.status) !== "VERIFYING";
});

var referenceUsedForDifferentTarget = priorReferencePayments.some(function (other) {
return !samePaymentTarget_(other, payment);
});

var samePaymentHadUnpaidReference =
String(payment.slipTransRef || "") === transRef &&
["RETRY_REQUIRED", "REVIEW_REQUIRED"].indexOf(priorStatus) >= 0;

if (referenceAlreadyPaid) {
invalidReason = "สลิปนี้มีเลขอ้างอิงตรงกับรายการที่ชำระสำเร็จแล้ว ไม่สามารถใช้ซ้ำได้";

} else if (referenceUsedForDifferentTarget) {
invalidReason = "เลขอ้างอิงธุรกรรมนี้ถูกเชื่อมโยงกับรายการชำระอื่น ไม่สามารถนำมาใช้กับรายการนี้ได้";

} else if (!amountMatched) {
invalidReason = "ยอดเงินในสลิปไม่ตรงกับยอดที่ต้องชำระ";

} else if (!accountMatched) {
invalidReason = "ไม่สามารถยืนยันบัญชีผู้รับเงินได้";

} else if (!transRef) {
invalidReason = "ไม่พบเลขอ้างอิงธุรกรรมในสลิป";

} else if (isDuplicate &&
!(knownUnpaidFingerprint || referenceHasUnpaidAttempt || samePaymentHadUnpaidReference)) {
invalidReason = "ผู้ให้บริการแจ้งว่าสลิปซ้ำ แต่ไม่พบรายการเดิมที่ยังไม่ได้รับชำระในระบบ";
}

if (invalidReason) {
var invalidPayment = findRecord_(
"Payments",
"paymentId",
paymentId
);

if (invalidPayment) {
updateRecord_(
"Payments",
invalidPayment.rowNumber,
{
status: "RETRY_REQUIRED",
slipAmount: isFinite(amountInSlip)
? amountInSlip
: "",
slipTransRef: transRef,
slipFingerprint: slipFingerprint,
verificationMessage: invalidReason,
updatedAt: nowIso_()
}
);
}

logEvent_(
auth.user.userId,
"SLIP_VERIFICATION_FAILED",
"PAYMENT",
paymentId,
{
duplicate: isDuplicate,
amountMatched: amountMatched,
accountMatched: accountMatched
}
);

return {
message: invalidReason,
status: "RETRY_REQUIRED",
paymentId: paymentId
};
}

var markResult = applyVerifiedPayment_(
paymentId,
auth.user.userId,
amountInSlip,
transRef,
rawSlip,
data
);

return markResult;
}

/**
• Converts an incoming data URL into a normalized base64 record.
*/
function parseImageDataUrl_(dataUrl) {
var match = String(dataUrl).match(
/^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=\s]+)$/i
);

if (!match) {
throwPublic_(
"รูปภาพต้องเป็น PNG, JPEG หรือ WebP ที่ถูกต้อง",
"INVALID_IMAGE_FORMAT"
);
}

return {
mime: String(match[1]).toLowerCase(),
base64: String(match[2]).replace(/\s/g, "")
};
}

/**
• Only a successful, amount-matched, non-duplicate Thunder result
• can mark a payment as paid.
*/
function applyVerifiedPayment_(
paymentId,
userId,
amountInSlip,
transRef,
rawSlip,
providerData
) {
var lock = LockService.getScriptLock();

if (!lock.tryLock(10000)) {
return {
message: "ระบบกำลังประมวลผล กรุณาตรวจสอบสถานะอีกครั้ง",
status: "REVIEW_REQUIRED",
paymentId: paymentId
};
}

try {
var payment = findRecord_(
"Payments",
"paymentId",
paymentId
);

if (!payment) {
throwPublic_(
"ไม่พบรายการชำระเงิน",
"PAYMENT_NOT_FOUND"
);
}

if (String(payment.userId) !== String(userId)) {
throwPublic_(
"ไม่มีสิทธิ์เข้าถึงรายการชำระเงินนี้",
"FORBIDDEN"
);
}

if (String(payment.status) === "PAID") {
return {
message: "รายการนี้ได้รับการยืนยันการชำระแล้ว",
status: "PAID",
paymentId: paymentId
};
}

if (String(payment.status) !== "VERIFYING") {
throwPublic_(
"สถานะการชำระเงินเปลี่ยนแปลง กรุณาตรวจสอบใหม่",
"PAYMENT_STATE_CHANGED"
);
}

var duplicateRef = getRecords_("Payments").some(
function (other) {
return (
String(other.paymentId) !== String(paymentId) &&
String(other.slipTransRef || "") ===
String(transRef) &&
String(other.status) === "PAID"
);
}
);

if (duplicateRef) {
updateRecord_(
"Payments",
payment.rowNumber,
{
status: "RETRY_REQUIRED",
verificationMessage: "เลขอ้างอิงสลิปซ้ำกับธุรกรรมที่ยืนยันแล้ว",
updatedAt: nowIso_()
}
);

return {
message: "ตรวจพบเลขอ้างอิงธุรกรรมซ้ำ",
status: "RETRY_REQUIRED",
paymentId: paymentId
};
}

var selectedIds = parseJsonArray_(
payment.installmentIdsJson
).map(String);

var installments = getRecordsByField_(
"Installments",
"loanId",
payment.loanId
);

var selected = installments.filter(function (item) {
return selectedIds.indexOf(
String(item.installmentId)
) >= 0;
});

if (selected.length !== selectedIds.length) {
updateRecord_(
"Payments",
payment.rowNumber,
{
status: "REVIEW_REQUIRED",
verificationMessage: "ไม่สามารถจับคู่รายการงวดชำระได้",
updatedAt: nowIso_()
}
);

return {
message: "ระบบต้องตรวจสอบการจับคู่รายการชำระเพิ่มเติม",
status: "REVIEW_REQUIRED",
paymentId: paymentId
};
}

var currentDue = 0;

selected.forEach(function (item) {
currentDue = moneyPrecision_(
currentDue +
Number(item.totalDue || 0) -
Number(item.paidAmount || 0)
);
});

if (
Math.abs(currentDue - Number(payment.amount)) > 0.01 ||
Math.abs(amountInSlip - Number(payment.amount)) > 0.01
) {
updateRecord_(
"Payments",
payment.rowNumber,
{
status: "REVIEW_REQUIRED",
verificationMessage: "ยอดชำระเปลี่ยนแปลงระหว่างการตรวจสอบ",
updatedAt: nowIso_()
}
);

return {
message: "ต้องตรวจสอบยอดชำระเพิ่มเติม",
status: "REVIEW_REQUIRED",
paymentId: paymentId
};
}

var now = nowIso_();

selected.forEach(function (item) {
updateRecord_(
"Installments",
item._rowNumber,
{
paidAmount: Number(item.totalDue),
status: "PAID",
updatedAt: now
}
);
});

updateRecord_(
"Payments",
payment._rowNumber,
{
status: "PAID",
slipAmount: amountInSlip,
slipTransRef: transRef,
slipDate: String(rawSlip.date || ""),
slipSenderBank: String(
rawSlip.sender &&
rawSlip.sender.bank
? rawSlip.sender.bank.name
: ""
),
slipReceiverBank: String(
rawSlip.receiver &&
rawSlip.receiver.bank
? rawSlip.receiver.bank.name
: ""
),
slipVerifiedAt: now,
verificationMessage: "ตรวจสอบการชำระสำเร็จ",
updatedAt: now
}
);

var remainingInstallments = getRecordsByField_(
"Installments",
"loanId",
payment.loanId
);

var outstandingPrincipal = 0;
var outstandingTotal = 0;

remainingInstallments.forEach(function (item) {
if (String(item.status) !== "PAID") {
outstandingPrincipal = moneyPrecision_(
outstandingPrincipal +
Number(item.principalAmount || 0)
);
}

outstandingTotal = moneyPrecision_(
outstandingTotal +
Number(item.totalDue || 0) -
Number(item.paidAmount || 0)
);
});

var loan = findRecord_(
"Loans",
"loanId",
payment.loanId
);

if (loan) {
var loanUpdates = {
outstandingPrincipal: outstandingPrincipal,
outstandingTotal: outstandingTotal,
updatedAt: now
};

if (outstandingTotal <= 0) {
loanUpdates.status = "PAID_OFF";
}

updateRecord_(
"Loans",
loan._rowNumber,
loanUpdates
);
}

logEvent_(
userId,
"PAYMENT_VERIFIED",
"PAYMENT",
paymentId,
{
amount: amountInSlip,
transRef: transRef,
loanId: payment.loanId
}
);

var receiptEmailSent = sendRepaymentReceiptEmail_(paymentId);
if (receiptEmailSent) {
var receiptTime = nowIso_();
selected.forEach(function (item) {
updateRecord_("Installments", item.rowNumber, {
receiptEmailSentAt: receiptTime,
updatedAt: receiptTime
});
});
}
createLoanStatusNotification_(
loan || findRecord_("Loans", "loanId", payment.loanId),
outstandingTotal <= 0 ? "ชำระสินเชื่อครบถ้วนแล้ว" : "รับชำระเงินเรียบร้อยแล้ว",
outstandingTotal <= 0
? "สินเชื่อ " + payment.loanId + " ได้รับการชำระครบถ้วนแล้ว และระบบบันทึกสถานะปิดบัญชีเรียบร้อยแล้ว"
: "ระบบยืนยันการชำระเงินสำหรับสินเชื่อ " + payment.loanId + " เรียบร้อยแล้ว สามารถเข้าสู่ระบบเพื่อตรวจสอบประวัติการชำระเงินได้"
);

return {
message: "ตรวจสอบสลิปและบันทึกการชำระเงินสำเร็จ",
paymentId: paymentId,
amount: amountInSlip,
status: "PAID",
receiptEmailSent: receiptEmailSent,
outstandingTotal: outstandingTotal
};

} finally {
lock.releaseLock();
}
}

/* ================================================================
Y. BORROWER PAYMENTS
• ================================================================
*/

function safePayment_(payment) {
return {
paymentId: String(payment.paymentId || ""),
loanId: String(payment.loanId || ""),
amount: Number(payment.amount || 0),
currency: String(payment.currency || "THB"),
method: String(payment.method || ""),
status: String(payment.status || ""),
slipAmount: Number(payment.slipAmount || 0),
slipTransRef: String(payment.slipTransRef || ""),
slipVerifiedAt: String(payment.slipVerifiedAt || ""),
verificationMessage: String(
payment.verificationMessage || ""
),
createdAt: String(payment.createdAt || ""),
updatedAt: String(payment.updatedAt || "")
};
}

function myPayments_(p) {
var auth = authenticate_(p);

var payments = getRecordsByField_(
"Payments",
"userId",
auth.user.userId
).sort(function (a, b) {
return String(b.createdAt).localeCompare(
String(a.createdAt)
);
});

return {
payments: payments.map(safePayment_)
};
}

/* ================================================================
Z. ADMIN PAYMENT MANAGEMENT
• ================================================================
*/

function adminListPayments_(p) {
requireAdmin_(p);

var status = String(p.status || "").toUpperCase();

var payments = getRecords_("Payments");

if (status) {
payments = payments.filter(function (payment) {
return String(payment.status).toUpperCase() === status;
});
}

var users = getRecords_("Users");

var userMap = {};

users.forEach(function (user) {
userMap[String(user.userId)] = user;
});

return {
payments: payments.map(function (payment) {
var safe = safePayment_(payment);

var user = userMap[String(payment.userId)];

safe.customerName = user
? String(user.fullName || "")
: "";

safe.customerEmail = user
? String(user.email || "")
: "";

return safe;
})
};
}

function adminReviewPayment_(p) {
var auth = requireAdmin_(p);

var paymentId = String(p.paymentId || "").trim();

var decision = String(
p.decision || ""
).toUpperCase();

var note = String(p.note || "").trim();

if (["RETRY", "REJECT"].indexOf(decision) === -1) {
throwPublic_(
"รองรับเฉพาะการส่งตรวจใหม่หรือปฏิเสธรายการ",
"INVALID_PAYMENT_REVIEW"
);
}

var payment = findRecord_(
"Payments",
"paymentId",
paymentId
);

if (!payment) {
throwPublic_(
"ไม่พบรายการชำระเงิน",
"PAYMENT_NOT_FOUND"
);
}

if (
["REVIEW_REQUIRED", "RETRY_REQUIRED"].indexOf(
String(payment.status)
) === -1
) {
throwPublic_(
"ไม่สามารถตรวจสอบรายการในสถานะปัจจุบันได้",
"PAYMENT_REVIEW_NOT_ALLOWED"
);
}

updateRecord_(
"Payments",
payment.rowNumber,
{
status: decision === "RETRY"
? "RETRY_REQUIRED"
: "REJECTED",
reviewedBy: auth.user.userId,
reviewNote: note,
verificationMessage: note || (
decision === "RETRY"
? "รอตรวจสอบใหม่"
: "ปฏิเสธรายการโดยผู้ดูแลระบบ"
),
updatedAt: nowIso_()
}
);

logEvent_(
auth.user.userId,
"PAYMENT_REVIEW",
"PAYMENT",
paymentId,
{
decision: decision,
note: note
}
);

var paymentLoan = findRecord_("Loans", "loanId", payment.loanId);
createLoanStatusNotification_(
paymentLoan,
decision === "RETRY" ? "เจ้าหน้าที่ขอให้ส่งหลักฐานชำระเงินใหม่" : "ผลการตรวจสอบหลักฐานชำระเงิน",
decision === "RETRY"
? "เจ้าหน้าที่ขอให้ส่งหลักฐานการชำระเงินของสินเชื่อ " + payment.loanId + " ใหม่ โปรดเข้าสู่ระบบเพื่อตรวจสอบรายละเอียด"
: "หลักฐานการชำระเงินของสินเชื่อ " + payment.loanId + " ถูกปฏิเสธ โปรดเข้าสู่ระบบเพื่อตรวจสอบหมายเหตุจากเจ้าหน้าที่"
);

return {
message: decision === "RETRY"
? "กำหนดรายการให้ตรวจสอบใหม่แล้ว"
: "ปฏิเสธรายการแล้ว"
};
}

/* ================================================================
AA. ANNOUNCEMENTS
• ================================================================
*/

/**
• The backend sanitizes HTML before storing it.
• Supported content is intentionally restricted to safe formatting.
• Supported tags:
• h1-h6, p, div, span, br, hr, ul, ol, li, strong, em, b, i, u,
• blockquote, a, img.
• JavaScript, event handlers, embedded frames and active SVG are removed.
*/
function sanitizeAnnouncementHtml_(input) {
var html = String(input || "");

if (html.length > 100000) {
throwPublic_(
"เนื้อหาประกาศมีขนาดใหญ่เกินไป",
"ANNOUNCEMENT_CONTENT_TOO_LARGE"
);
}

html = html.replace(
/<!--[\s\S]*?-->/g,
""
);

html = html.replace(
/<(script|style|iframe|object|embed|form|input|button|textarea|select|svg|math|video|audio|link|meta|base)\b[^>]*>[\s\S]*?<\/\1\s*>/gi,
""
);

html = html.replace(
/<(script|style|iframe|object|embed|form|input|button|textarea|select|svg|math|video|audio|link|meta|base)\b[^>]*\/?\s*>/gi,
""
);

var allowed = {
h1: true,
h2: true,
h3: true,
h4: true,
h5: true,
h6: true,
p: true,
div: true,
span: true,
br: true,
hr: true,
ul: true,
ol: true,
li: true,
strong: true,
em: true,
b: true,
i: true,
u: true,
blockquote: true,
a: true,
img: true
};

return html.replace(
/<\/?([a-z0-9-]+)\b[^>]*>/gi,
function (tagText, tagName) {
var name = String(tagName).toLowerCase();

if (!allowed[name]) {
return "";
}

var isClosing = /^<\s*\//.test(tagText);

if (isClosing) {
return name === "br" || name === "hr" || name === "img"
? ""
: "</" + name + ">";
}

if (name === "a") {
var hrefMatch = tagText.match(
/\bhref\s*=\s*(['"])(.*?)\1/i
);

var href = hrefMatch
? String(hrefMatch[2]).trim()
: "";

if (!/^https:\/\//i.test(href) &&
!/^mailto:/i.test(href)) {
return "<a>";
}

return (
'<a href="' +
escapeAttribute_(href) +
'" target="_blank" rel="noopener noreferrer">'
);
}

if (name === "img") {
var srcMatch = tagText.match(
/\bsrc\s*=\s*(['"])(.*?)\1/i
);

var altMatch = tagText.match(
/\balt\s*=\s*(['"])(.*?)\1/i
);

var src = srcMatch
? safeUrl_(srcMatch[2])
: "";

var alt = altMatch
? altMatch[2]
: "";

if (!src) {
return "";
}

return (
'<img src="' +
escapeAttribute_(src) +
'" alt="' +
escapeAttribute_(alt) +
'" loading="lazy">'
);
}

if (name === "br" || name === "hr") {
return "<" + name + ">";
}

return "<" + name + ">";
}
);
}

function announcementIsActive_(announcement) {
if (!parseBoolean_(announcement.isActive)) {
return false;
}

var now = Date.now();

if (
announcement.startAt &&
new Date(announcement.startAt).getTime() > now
) {
return false;
}

if (
announcement.endAt &&
new Date(announcement.endAt).getTime() < now
) {
return false;
}

return true;
}

function safeAnnouncement_(announcement) {
return {
announcementId: String(
announcement.announcementId || ""
),
title: String(announcement.title || ""),
placement: String(announcement.placement || ""),
contentHtml: sanitizeAnnouncementHtml_(
announcement.contentHtml || ""
),
imageUrl: safeUrl_(announcement.imageUrl || ""),
imageAlt: String(announcement.imageAlt || ""),
startAt: String(announcement.startAt || ""),
endAt: String(announcement.endAt || ""),
isActive: parseBoolean_(announcement.isActive),
createdAt: String(announcement.createdAt || ""),
updatedAt: String(announcement.updatedAt || "")
};
}

function announcementMatchesPlacement_(
announcementPlacement,
requestedPlacement
) {
var a = String(
announcementPlacement || ""
).toUpperCase();

var b = String(
requestedPlacement || ""
).toUpperCase();

if (a === "ALL") {
return true;
}

if (a === "LOGIN_SIGNUP") {
return b === "LOGIN" ||
b === "SIGNUP";
}

return a === b;
}

/* ================================================================
AD. TEMPORARY MAINTENANCE MODE
• Configuration is stored in the Maintenance sheet (settingId=GLOBAL).
• startAt/endAt are ISO timestamps supplied by the administrator.
• An enabled schedule is active only inside its time window.
=============================================================== */

function getMaintenanceRecord_() {
var records = getRecords_("Maintenance");
for (var i = 0; i < records.length; i++) {
if (String(records[i].settingId || "") === "GLOBAL") {
return records[i];
}
}
return {
settingId: "GLOBAL",
enabled: "FALSE",
startAt: "",
endAt: "",
title: "ระบบกำลังปรับปรุงชั่วคราว",
messageHtml: "<p>ขออภัยในความไม่สะดวก ระบบอยู่ระหว่างการปรับปรุง กรุณากลับมาใช้งานอีกครั้งภายหลัง</p>",
imageUrl: "",
imageAlt: "",
updatedBy: "",
updatedAt: ""
};
}

function maintenanceIsActive_(record) {
if (!parseBoolean_(record && record.enabled)) return false;
var now = Date.now();
var startAt = String(record.startAt || "").trim();
var endAt = String(record.endAt || "").trim();
if (startAt) {
var startMs = new Date(startAt).getTime();
if (!isFinite(startMs) || startMs > now) return false;
}
if (endAt) {
var endMs = new Date(endAt).getTime();
if (!isFinite(endMs) || endMs <= now) return false;
}
return true;
}

function safeMaintenance_(record) {
record = record || {};
return {
enabled: parseBoolean_(record.enabled),
maintenanceActive: maintenanceIsActive_(record),
startAt: String(record.startAt || ""),
endAt: String(record.endAt || ""),
title: String(record.title || "ระบบกำลังปรับปรุงชั่วคราว"),
messageHtml: sanitizeAnnouncementHtml_(record.messageHtml || ""),
imageUrl: safeUrl_(record.imageUrl || ""),
imageAlt: String(record.imageAlt || ""),
updatedAt: String(record.updatedAt || "")
};
}

function getMaintenanceStatus_() {
var maintenance = safeMaintenance_(getMaintenanceRecord_());
return {
maintenanceActive: maintenance.maintenanceActive,
enabled: maintenance.enabled,
startAt: maintenance.startAt,
endAt: maintenance.endAt,
title: maintenance.title,
messageHtml: maintenance.messageHtml,
imageUrl: maintenance.imageUrl,
imageAlt: maintenance.imageAlt,
serverTime: nowIso_()
};
}

function adminGetMaintenance_(p) {
requireAdmin_(p);
return { maintenance: safeMaintenance_(getMaintenanceRecord_()) };
}

function adminSaveMaintenance_(p) {
var auth = requireAdmin_(p);
var enabled = parseBoolean_(p.enabled);
var startAt = String(p.startAt || "").trim();
var endAt = String(p.endAt || "").trim();
var title = String(p.title || "ระบบกำลังปรับปรุงชั่วคราว").trim();
var messageHtml = sanitizeAnnouncementHtml_(String(p.messageHtml || ""));
var imageUrl = p.imageUrl ? safeUrl_(p.imageUrl) : "";

if (title.length < 2 || title.length > 200) {
throwPublic_("กรุณาระบุหัวข้อประกาศปิดปรับปรุงให้ถูกต้อง", "INVALID_MAINTENANCE_TITLE");
}
if (p.imageUrl && !imageUrl) {
throwPublic_("URL รูปภาพต้องเป็น HTTPS", "INVALID_MAINTENANCE_IMAGE_URL");
}
if (startAt && isNaN(new Date(startAt).getTime())) {
throwPublic_("เวลาเริ่มปิดระบบไม่ถูกต้อง", "INVALID_MAINTENANCE_START");
}
if (endAt && isNaN(new Date(endAt).getTime())) {
throwPublic_("เวลาเปิดระบบกลับไม่ถูกต้อง", "INVALID_MAINTENANCE_END");
}
if (startAt && endAt && new Date(startAt).getTime() >= new Date(endAt).getTime()) {
throwPublic_("เวลาเปิดระบบกลับต้องอยู่หลังเวลาเริ่มปิดระบบ", "INVALID_MAINTENANCE_WINDOW");
}

var now = nowIso_();
var existing = findRecord_("Maintenance", "settingId", "GLOBAL");
var record = {
settingId: "GLOBAL",
enabled: enabled ? "TRUE" : "FALSE",
startAt: startAt ? new Date(startAt).toISOString() : "",
endAt: endAt ? new Date(endAt).toISOString() : "",
title: title,
messageHtml: messageHtml,
imageUrl: imageUrl,
imageAlt: String(p.imageAlt || "").slice(0, 300),
updatedBy: String(auth.user.userId || ""),
updatedAt: now
};

if (existing) {
updateRecord_("Maintenance", existing.rowNumber, record);
} else {
appendRecord_("Maintenance", record);
}

logEvent_(auth.user.userId, "MAINTENANCE_SETTINGS_SAVED", "SYSTEM", "GLOBAL", {
enabled: enabled,
startAt: record.startAt,
endAt: record.endAt
});

return {
message: "บันทึกการตั้งค่าปิดปรับปรุงระบบแล้ว",
maintenance: safeMaintenance_(record)
};
}

function getAnnouncements_(p) {
var placement = String(
p.placement || "LOGIN"
).toUpperCase();

var allowed = [
"LOGIN",
"SIGNUP",
"BORROWER_DASHBOARD"
 ];

if (allowed.indexOf(placement) === -1) {
throwPublic_(
"ตำแหน่งประกาศไม่ถูกต้อง",
"INVALID_ANNOUNCEMENT_PLACEMENT"
);
}

if (placement === "BORROWER_DASHBOARD") {
authenticate_(p);
}

var announcements = getRecords_("Announcements")
.filter(function (announcement) {
return announcementIsActive_(announcement) &&
announcementMatchesPlacement_(
announcement.placement,
placement
);
})
.sort(function (a, b) {
return String(b.createdAt).localeCompare(
String(a.createdAt)
);
});

return {
announcements: announcements.map(safeAnnouncement_)
};
}

function adminListAnnouncements_(p) {
requireAdmin_(p);

return {
announcements: getRecords_("Announcements")
.sort(function (a, b) {
return String(b.createdAt).localeCompare(
String(a.createdAt)
);
})
.map(safeAnnouncement_)
};
}

function adminSaveAnnouncement_(p) {
var auth = requireAdmin_(p);

var announcementId = String(
p.announcementId || ""
).trim();

var title = String(p.title || "").trim();

var placement = String(
p.placement || ""
).toUpperCase();

var allowedPlacements = [
"LOGIN",
"SIGNUP",
"LOGIN_SIGNUP",
"BORROWER_DASHBOARD",
"ALL"
 ];

if (title.length < 2 || title.length > 200) {
throwPublic_(
"กรุณาระบุชื่อประกาศให้ถูกต้อง",
"INVALID_ANNOUNCEMENT_TITLE"
);
}

if (allowedPlacements.indexOf(placement) === -1) {
throwPublic_(
"กรุณาเลือกตำแหน่งแสดงประกาศให้ถูกต้อง",
"INVALID_ANNOUNCEMENT_PLACEMENT"
);
}

var contentHtml = sanitizeAnnouncementHtml_(
String(p.contentHtml || "")
);

var imageUrl = p.imageUrl
? safeUrl_(p.imageUrl)
: "";

if (p.imageUrl && !imageUrl) {
throwPublic_(
"URL รูปประกาศต้องเป็น HTTPS",
"INVALID_ANNOUNCEMENT_IMAGE_URL"
);
}

var startAt = String(p.startAt || "").trim();
var endAt = String(p.endAt || "").trim();

if (startAt && isNaN(new Date(startAt).getTime())) {
throwPublic_(
"วันเริ่มประกาศไม่ถูกต้อง",
"INVALID_START_DATE"
);
}

if (endAt && isNaN(new Date(endAt).getTime())) {
throwPublic_(
"วันสิ้นสุดประกาศไม่ถูกต้อง",
"INVALID_END_DATE"
);
}

if (
startAt &&
endAt &&
new Date(startAt).getTime() > new Date(endAt).getTime()
) {
throwPublic_(
"วันสิ้นสุดต้องไม่ก่อนวันเริ่มประกาศ",
"INVALID_ANNOUNCEMENT_PERIOD"
);
}

var now = nowIso_();

var existing = announcementId
? findRecord_(
"Announcements",
"announcementId",
announcementId
)
: null;

var record = {
announcementId: announcementId || uuid_(),
title: title,
placement: placement,
contentHtml: contentHtml,
imageUrl: imageUrl,
imageAlt: String(p.imageAlt || "").slice(0, 300),
startAt: startAt,
endAt: endAt,
isActive: parseBoolean_(p.isActive)
? "TRUE"
: "FALSE",
createdBy: existing
? existing.createdBy
: auth.user.userId,
createdAt: existing
? existing.createdAt
: now,
updatedAt: now
};

if (existing) {
updateRecord_(
"Announcements",
existing._rowNumber,
record
);

} else {
appendRecord_(
"Announcements",
record
);
}

logEvent_(
auth.user.userId,
"ANNOUNCEMENT_SAVED",
"ANNOUNCEMENT",
record.announcementId,
{
placement: placement,
isActive: record.isActive
}
);

return {
message: "บันทึกประกาศแล้ว",
announcement: safeAnnouncement_(record)
};
}

function adminDeleteAnnouncement_(p) {
var auth = requireAdmin_(p);

var id = String(
p.announcementId || ""
).trim();

var announcement = findRecord_(
"Announcements",
"announcementId",
id
);

if (!announcement) {
throwPublic_(
"ไม่พบประกาศ",
"ANNOUNCEMENT_NOT_FOUND"
);
}

updateRecord_(
"Announcements",
announcement.rowNumber,
{
isActive: "FALSE",
updatedAt: nowIso_()
}
);

logEvent_(
auth.user.userId,
"ANNOUNCEMENT_DISABLED",
"ANNOUNCEMENT",
id,
{}
);

return {
message: "ปิดประกาศแล้ว"
};
}

/* ================================================================
AB. IMGBB IMAGE UPLOAD
• ================================================================
*/

/**
• Called from the administrator frontend for public announcement
• images only.
• Do NOT use ImgBB for:
◦ bank slips
◦ ID cards
◦ citizen ID photos
◦ contracts
◦ documents containing sensitive customer information
*/
function uploadAnnouncementImage_(p) {
var auth = requireAdmin_(p);

var dataUrl = String(p.imageData || "").trim();

if (!dataUrl) {
throwPublic_(
"กรุณาเลือกรูปภาพก่อนอัปโหลด",
"IMAGE_REQUIRED"
);
}

var parsed = parseImageDataUrl_(dataUrl);

var maxSize = Number(
getProperty_("MAX_IMAGE_SIZE_BYTES", "4194304")
);

var estimatedBytes = Math.floor(
parsed.base64.length * 3 / 4
);

if (
!isFinite(maxSize) ||
maxSize <= 0 ||
estimatedBytes > maxSize
) {
throwPublic_(
"ขนาดรูปภาพเกินที่กำหนด",
"IMAGE_TOO_LARGE"
);
}

var apiKey = requireProperty_("IMGBB_API_KEY");

var response;

try {
response = UrlFetchApp.fetch(
"https://api.imgbb.com/1/upload?key=" +
encodeURIComponent(apiKey),
{
method: "post",
payload: {
image: parsed.base64
},
muteHttpExceptions: true
}
);

} catch (err) {
console.error("ImgBB upload failed: " + String(err));

throwPublic_(
"ไม่สามารถอัปโหลดรูปภาพได้",
"IMGBB_NETWORK_ERROR"
);
}

var code = response.getResponseCode();
var result;

try {
result = JSON.parse(response.getContentText());
} catch (err) {
result = null;
}

if (
code < 200 ||
code >= 300 ||
!result ||
result.success !== true ||
!result.data ||
!result.data.url
) {
console.error(
"ImgBB response: " +
response.getContentText().substring(0, 1000)
);

throwPublic_(
"ผู้ให้บริการรูปภาพไม่สามารถรับไฟล์ได้",
"IMGBB_UPLOAD_FAILED"
);
}

var imageUrl = safeUrl_(result.data.url);

if (!imageUrl) {
throwPublic_(
"URL รูปภาพที่ได้รับไม่ถูกต้อง",
"IMGBB_INVALID_RESPONSE"
);
}

logEvent_(
auth.user.userId,
"ANNOUNCEMENT_IMAGE_UPLOADED",
"IMAGE",
"",
{
mime: parsed.mime,
estimatedBytes: estimatedBytes
}
);

return {
message: "อัปโหลดรูปภาพสำเร็จ",
imageUrl: imageUrl,
mime: parsed.mime,
estimatedBytes: estimatedBytes
};
}

/* ================================================================
AC. CUSTOMER SUPPORT
• ================================================================
*/

function safeTicket_(ticket) {
return {
ticketId: String(ticket.ticketId || ""),
subject: String(ticket.subject || ""),
category: String(ticket.category || ""),
message: String(ticket.message || ""),
status: String(ticket.status || ""),
assignedTo: String(ticket.assignedTo || ""),
createdAt: String(ticket.createdAt || ""),
updatedAt: String(ticket.updatedAt || ""),
closedAt: String(ticket.closedAt || ""),
staffNote: String(ticket.staffNote || "")
};
}

function createSupportTicket_(p) {
var auth = authenticate_(p);

var subject = String(p.subject || "").trim();
var message = String(p.message || "").trim();
var category = String(p.category || "GENERAL").trim();

if (subject.length < 3 || subject.length > 200) {
throwPublic_(
"กรุณาระบุหัวข้อให้ถูกต้อง",
"INVALID_TICKET_SUBJECT"
);
}

if (message.length < 5 || message.length > 10000) {
throwPublic_(
"ข้อความต้องมีความยาวระหว่าง 5 ถึง 10,000 ตัวอักษร",
"INVALID_TICKET_MESSAGE"
);
}

var now = nowIso_();

var record = {
ticketId: uuid_(),
userId: auth.user.userId,
subject: subject,
category: category,
message: message,
status: "OPEN",
assignedTo: "",
createdAt: now,
updatedAt: now,
closedAt: "",
staffNote: ""
};

appendRecord_(
"SupportTickets",
record
);

logEvent_(
auth.user.userId,
"SUPPORT_TICKET_CREATED",
"TICKET",
record.ticketId,
{}
);

return {
message: "ส่งคำร้องถึงฝ่ายบริการลูกค้าแล้ว",
ticket: safeTicket_(record)
};
}

function myTickets_(p) {
var auth = authenticate_(p);

var tickets = getRecordsByField_(
"SupportTickets",
"userId",
auth.user.userId
);

return {
tickets: tickets
.sort(function (a, b) {
return String(b.createdAt).localeCompare(
String(a.createdAt)
);
})
.map(safeTicket_)
};
}

function adminListTickets_(p) {
requireAdmin_(p);

var filterStatus = String(
p.status || ""
).toUpperCase();

var tickets = getRecords_("SupportTickets");

if (filterStatus) {
tickets = tickets.filter(function (ticket) {
return String(ticket.status).toUpperCase() ===
filterStatus;
});
}

var users = getRecords_("Users");

var userMap = {};

users.forEach(function (user) {
userMap[String(user.userId)] = user;
});

return {
tickets: tickets.map(function (ticket) {
var safe = safeTicket_(ticket);

var user = userMap[String(ticket.userId)];

safe.customerName = user
? String(user.fullName || "")
: "";

safe.customerEmail = user
? String(user.email || "")
: "";

return safe;
})
};
}

function adminUpdateTicket_(p) {
var auth = requireAdmin_(p);

var ticketId = String(
p.ticketId || ""
).trim();

var status = String(
p.status || ""
).toUpperCase();

var allowedStatuses = [
"OPEN",
"IN_PROGRESS",
"WAITING_CUSTOMER",
"RESOLVED",
"CLOSED"
 ];

if (allowedStatuses.indexOf(status) === -1) {
throwPublic_(
"สถานะ Ticket ไม่ถูกต้อง",
"INVALID_TICKET_STATUS"
);
}

var ticket = findRecord_(
"SupportTickets",
"ticketId",
ticketId
);

if (!ticket) {
throwPublic_(
"ไม่พบ Ticket",
"TICKET_NOT_FOUND"
);
}

var now = nowIso_();

updateRecord_(
"SupportTickets",
ticket._rowNumber,
{
status: status,
assignedTo: String(
p.assignedTo || auth.user.userId
),
staffNote: String(
p.staffNote || ""
).slice(0, 10000),
updatedAt: now,
closedAt: status === "CLOSED" ||
status === "RESOLVED"
? now
: ""
}
);

logEvent_(
auth.user.userId,
"SUPPORT_TICKET_UPDATED",
"TICKET",
ticketId,
{
status: status
}
);

return {
message: "อัปเดต Ticket แล้ว"
};
}

/* ================================================================
AD. ADMIN USER MANAGEMENT
• ================================================================
*/

function adminListUsers_(p) {
requireAdmin_(p);

var users = getRecords_("Users");

var status = String(
p.status || ""
).toUpperCase();

if (status) {
users = users.filter(function (user) {
return String(user.status).toUpperCase() === status;
});
}

return {
users: users.map(safeUser_)
};
}

function adminUpdateUserStatus_(p) {
var auth = requireAdmin_(p);

var userId = String(p.userId || "").trim();

var status = String(
p.status || ""
).toUpperCase();

if (["ACTIVE", "SUSPENDED"].indexOf(status) === -1) {
throwPublic_(
"สถานะบัญชีไม่ถูกต้อง",
"INVALID_USER_STATUS"
);
}

var target = findRecord_(
"Users",
"userId",
userId
);

if (!target) {
throwPublic_(
"ไม่พบบัญชีผู้ใช้",
"USER_NOT_FOUND"
);
}

if (
isAdminUser_(target) &&
String(target.userId) !== String(auth.user.userId)
) {
throwPublic_(
"ไม่สามารถเปลี่ยนสถานะผู้ดูแลระบบรายนี้จากเมนูดังกล่าวได้",
"ADMIN_ACCOUNT_PROTECTED"
);
}

updateRecord_(
"Users",
target.rowNumber,
{
status: status,
updatedAt: nowIso_()
}
);

if (status !== "ACTIVE") {
revokeAllSessionsForUser_(target.userId);
}

logEvent_(
auth.user.userId,
"USER_STATUS_UPDATED",
"USER",
userId,
{
status: status
}
);

return {
message: "เปลี่ยนสถานะบัญชีแล้ว"
};
}

function adminRevokeUserSessions_(p) {
var auth = requireAdmin_(p);

var userId = String(
p.userId || ""
).trim();

var user = findRecord_(
"Users",
"userId",
userId
);

if (!user) {
throwPublic_(
"ไม่พบบัญชีผู้ใช้",
"USER_NOT_FOUND"
);
}

revokeAllSessionsForUser_(userId);

logEvent_(
auth.user.userId,
"USER_SESSIONS_REVOKED",
"USER",
userId,
{}
);

return {
message: "ยกเลิกเซสชันของผู้ใช้แล้ว"
};
}

/* ================================================================
AE. ADMIN DASHBOARD AND REPORTING
• ================================================================
*/

function adminDashboard_(p) {
var auth = requireAdmin_(p);

var users = getRecords_("Users");
var loans = getRecords_("Loans");
var payments = getRecords_("Payments");
var tickets = getRecords_("SupportTickets");

var pendingLoans = loans.filter(function (loan) {
return String(loan.status) === "PENDING_REVIEW";
});

var activeLoans = loans.filter(function (loan) {
return String(loan.status) === "DISBURSED";
});

var outstandingPrincipal = 0;
var outstandingTotal = 0;
var verifiedPayments = 0;
var pendingReviews = 0;

loans.forEach(function (loan) {
outstandingPrincipal = moneyPrecision_(
outstandingPrincipal +
Number(loan.outstandingPrincipal || 0)
);

outstandingTotal = moneyPrecision_(
outstandingTotal +
Number(loan.outstandingTotal || 0)
);
});

payments.forEach(function (payment) {
if (String(payment.status) === "PAID") {
verifiedPayments = moneyPrecision_(
verifiedPayments +
Number(payment.amount || 0)
);
}

if (
["VERIFYING", "REVIEW_REQUIRED"].indexOf(
String(payment.status)
) >= 0
) {
pendingReviews++;
}
});

return {
totals: {
users: users.length,
activeUsers: users.filter(function (user) {
return String(user.status) === "ACTIVE";
}).length,
loans: loans.length,
pendingLoans: pendingLoans.length,
activeLoans: activeLoans.length,
outstandingPrincipal: outstandingPrincipal,
outstandingTotal: outstandingTotal,
verifiedPayments: verifiedPayments,
pendingPaymentReviews: pendingReviews,
openTickets: tickets.filter(function (ticket) {
return ["OPEN", "IN_PROGRESS", "WAITING_CUSTOMER"]
.indexOf(String(ticket.status)) >= 0;
}).length
},
recentLoans: loans
.sort(function (a, b) {
return String(b.createdAt).localeCompare(
String(a.createdAt)
);
})
.slice(0, 10)
.map(safeLoan_),
recentPayments: payments
.sort(function (a, b) {
return String(b.createdAt).localeCompare(
String(a.createdAt)
);
})
.slice(0, 10)
.map(safePayment_),
generatedAt: nowIso_()
};
}

function adminSystemHealth_(p) {
requireAdmin_(p);

var properties = PropertiesService
.getScriptProperties()
.getProperties();

var required = [
"ADMIN_EMAILS",
"APP_URL",
"DATA_HASH_SECRET",
"MAX_IMAGE_SIZE_BYTES",
"LOAN_DOCUMENTS_FOLDER_ID",
"MIN_AGE",
"PRIVACY_VERSION",
"REMEMBER_SESSION_TTL_SECONDS",
"RESET_TOKEN_TTL_SECONDS",
"SESSION_TTL_SECONDS",
"SPREADSHEET_ID",
"TERMS_VERSION",
"VERIFY_TOKEN_TTL_SECONDS"
 ];

var optionalIntegrations = [
"IMGBB_API_KEY",
"THUNDER_API_TOKEN",
"THUNDER_QR_PROMPTPAY_MSISDN",
"THUNDER_QR_PROMPTPAY_NAT_ID",
"GOOGLE_CLIENT_ID"
 ];

var checks = {};

required.forEach(function (key) {
checks[key] = Boolean(
properties[key] &&
String(properties[key]).trim()
);
});

optionalIntegrations.forEach(function (key) {
checks[key] = Boolean(
properties[key] &&
String(properties[key]).trim()
);
});

var missingRequired = required.filter(
function (key) {
return !checks[key];
}
);

return {
healthy: missingRequired.length === 0,
requiredProperties: checks,
missingRequired: missingRequired,
scriptTimezone: Session.getScriptTimeZone(),
timestamp: nowIso_()
};
}

/* ================================================================
AF. ADMIN AUDIT LOG
• ================================================================
*/

function adminListLogs_(p) {
requireAdmin_(p);

var limit = Number(p.limit || 100);

if (!Number.isInteger(limit) || limit < 1) {
limit = 100;
}

limit = Math.min(limit, 500);

var logs = getRecords_("SystemLogs")
.sort(function (a, b) {
return String(b.createdAt).localeCompare(
String(a.createdAt)
);
})
.slice(0, limit)
.map(function (log) {
return {
logId: String(log.logId || ""),
actorUserId: String(log.actorUserId || ""),
action: String(log.action || ""),
entityType: String(log.entityType || ""),
entityId: String(log.entityId || ""),
detailsJson: String(log.detailsJson || "{}"),
createdAt: String(log.createdAt || "")
};
});

return {
logs: logs
};
}

/* ================================================================
AG. LOAN SUPPLEMENTAL DATA, DOCUMENTS, SIGNATURES AND AUDIT HISTORY
================================================================ */

function findLatestLoanSupplemental_(loanId) {
var records = getRecordsByField_("LoanSupplemental", "loanId", String(loanId || ""));
if (!records.length) return null;
records.sort(function (a, b) {
return Number(b.version || 0) - Number(a.version || 0) ||
String(b.updatedAt || "").localeCompare(String(a.updatedAt || ""));
});
return records[0];
}

function ensureLoanSupplementalRecord_(loan, actorUserId) {
var existing = findLatestLoanSupplemental_(loan.loanId);
if (existing) return existing;
var now = nowIso_();
var record = {
supplementalId: uuid_(),
loanId: String(loan.loanId),
userId: String(loan.userId),
status: "REQUIRED",
version: 0,
formDataJson: "{}",
submittedDataJson: "{}",
returnedReason: "",
adminNote: "",
submittedAt: "",
reviewedAt: "",
reviewedBy: "",
createdAt: now,
updatedAt: now
};
appendRecord_("LoanSupplemental", record);
appendLoanSupplementalHistory_(record, actorUserId || "SYSTEM", "SYSTEM", "CREATED", "", "", "", "สร้างรายการข้อมูลเพิ่มเติมหลังอนุมัติ");
return findLatestLoanSupplemental_(loan.loanId) || record;
}

function parseSupplementalJson_(value) {
if (value && typeof value === "object" && !Array.isArray(value)) return value;
try {
var parsed = JSON.parse(String(value || "{}"));
return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
} catch (err) {
return {};
}
}

function safeLoanSupplementalSummary_(record) {
return {
supplementalId: String(record.supplementalId || ""),
loanId: String(record.loanId || ""),
status: String(record.status || "REQUIRED"),
version: Number(record.version || 0),
returnedReason: String(record.returnedReason || ""),
adminNote: String(record.adminNote || ""),
submittedAt: String(record.submittedAt || ""),
reviewedAt: String(record.reviewedAt || ""),
updatedAt: String(record.updatedAt || "")
};
}

function requireBorrowerSupplementalLoan_(loanId, userId, allowReadOnly) {
var loan = findRecord_("Loans", "loanId", loanId);
if (!loan || String(loan.userId) !== String(userId)) {
throwPublic_("ไม่พบคำขอสินเชื่อของคุณ", "LOAN_NOT_FOUND");
}
var permittedStatuses = allowReadOnly
? ["APPROVED_PENDING_ACCEPTANCE", "ACCEPTED_PENDING_DISBURSEMENT", "DISBURSED", "PAID_OFF"]
: ["APPROVED_PENDING_ACCEPTANCE"];
if (permittedStatuses.indexOf(String(loan.status || "").toUpperCase()) === -1) {
throwPublic_("คำขอนี้ยังไม่เปิดให้กรอกข้อมูลเพิ่มเติมหรือไม่สามารถแก้ไขได้แล้ว", "SUPPLEMENTAL_NOT_EDITABLE");
}
return loan;
}

function requireEditableSupplementalRecord_(record) {
if (!record || ["REQUIRED", "DRAFT", "RETURNED"].indexOf(String(record.status || "").toUpperCase()) === -1) {
throwPublic_("ข้อมูลเพิ่มเติมถูกส่งแล้วหรือผ่านการตรวจสอบ จึงไม่สามารถแก้ไขได้", "SUPPLEMENTAL_NOT_EDITABLE");
}
}

function normalizedPersonName_(value) {
return String(value || "")
.replace(/\s+/g, "")
.replace(/[.·,-]/g, "")
.replace(/^(นาย|นางสาว|นาง|Mr.?|Mrs.?|Ms.?)/i, "")
.toLowerCase();
}

function normalizeLoanSupplementalFormData_(input, user) {
var data = input && typeof input === "object" && !Array.isArray(input) ? input : {};
var clean = {};
var textFields = [
"idType", "idNumber", "phone", "registeredAddress", "currentAddress",
"residenceDuration", "maritalStatus", "occupationType", "occupationOther",
"employerName", "jobTitle", "workDuration", "payDate", "otherDebtDetails",
"bankName", "bankOtherName", "bankAccountType", "bankAccountName", "bankAccountNumber"
 ];
textFields.forEach(function (key) {
clean[key] = String(data[key] === undefined || data[key] === null ? "" : data[key]).trim().slice(0, key === "registeredAddress" || key === "currentAddress" || key === "otherDebtDetails" ? 2000 : 300);
});
["monthlyIncome", "additionalIncome", "monthlyExpenses", "monthlyDebtPayment", "familySupport"].forEach(function (key) {
var raw = data[key];
if (raw === "" || raw === null || raw === undefined) {
clean[key] = "";
} else {
var n = Number(raw);
clean[key] = isFinite(n) && n >= 0 && n <= 1000000000 ? roundMoney_(n) : "INVALID";
}
});
clean.legalName = String((user.prefix || "") + (user.prefix ? " " : "") + (user.fullName || "")).trim();
clean.dob = String(user.dob || "");
clean.email = String(user.email || "");
clean.profilePhone = String(user.phone || "");
clean.privacyAcknowledged = parseBoolean_(data.privacyAcknowledged);
clean.dataProcessingConsent = parseBoolean_(data.dataProcessingConsent);
clean.creditCheckConsent = parseBoolean_(data.creditCheckConsent);
clean.electronicSignatureConsent = parseBoolean_(data.electronicSignatureConsent);
clean.accuracyConfirm = parseBoolean_(data.accuracyConfirm);
clean.calculatedDisposableIncome = "";
if (clean.monthlyIncome !== "INVALID" && clean.additionalIncome !== "INVALID" &&
clean.monthlyExpenses !== "INVALID" && clean.monthlyDebtPayment !== "INVALID" && clean.familySupport !== "INVALID" &&
clean.monthlyIncome !== "" && clean.additionalIncome !== "" && clean.monthlyExpenses !== "" && clean.monthlyDebtPayment !== "" && clean.familySupport !== "") {
clean.calculatedDisposableIncome = roundMoney_(Number(clean.monthlyIncome) + Number(clean.additionalIncome) - Number(clean.monthlyExpenses) - Number(clean.monthlyDebtPayment) - Number(clean.familySupport));
}
return clean;
}

function validateLoanSupplementalFormData_(data, user) {
var idType = String(data.idType || "").toUpperCase();
var idNumber = String(data.idNumber || "").trim();
if (["THAI_ID_CARD", "PASSPORT"].indexOf(idType) === -1) {
throwPublic_("กรุณาเลือกประเภทเอกสารประจำตัว", "SUPPLEMENTAL_ID_TYPE_REQUIRED");
}
if (idType === "THAI_ID_CARD" && !validateThaiNationalId_(idNumber)) {
throwPublic_("เลขบัตรประชาชนไม่ถูกต้อง กรุณาตรวจสอบตัวเลข 13 หลัก", "INVALID_SUPPLEMENTAL_NATIONAL_ID");
}
if (idType === "PASSPORT" && !/^[A-Za-z0-9][A-Za-z0-9-]{5,19}$/.test(idNumber)) { throwPublic_("เลขพาสปอร์ตไม่ถูกต้อง กรุณาตรวจสอบรูปแบบเลขที่เอกสาร", "INVALID_PASSPORT_NUMBER"); } if (!isValidPhone_(data.phone)) throwPublic_("กรุณากรอกเบอร์โทรศัพท์ 10 หลักให้ถูกต้อง", "INVALID_SUPPLEMENTAL_PHONE"); ["registeredAddress", "currentAddress", "residenceDuration", "maritalStatus"].forEach(function (key) { if (!String(data[key] || "").trim()) throwPublic_("กรุณากรอกข้อมูลส่วนบุคคลให้ครบถ้วน", "SUPPLEMENTAL_PERSONAL_FIELDS_REQUIRED"); }); if (["SINGLE", "MARRIED", "DIVORCED", "WIDOWED", "OTHER"].indexOf(String(data.maritalStatus).toUpperCase()) === -1) { throwPublic_("กรุณาเลือกสถานภาพสมรสให้ถูกต้อง", "INVALID_MARITAL_STATUS"); } var occupation = String(data.occupationType || "").toUpperCase(); if (["EMPLOYED", "BUSINESS", "FREELANCE", "OTHER"].indexOf(occupation) === -1) { throwPublic_("กรุณาเลือกประเภทอาชีพ", "SUPPLEMENTAL_OCCUPATION_REQUIRED"); } if (occupation === "OTHER" && !String(data.occupationOther || "").trim()) { throwPublic_("กรุณาระบุประเภทอาชีพอื่น ๆ", "SUPPLEMENTAL_OCCUPATION_OTHER_REQUIRED"); } if (!String(data.employerName || "").trim() || !String(data.jobTitle || "").trim() || !String(data.workDuration || "").trim()) { throwPublic_("กรุณากรอกสถานที่ทำงาน/ธุรกิจ ตำแหน่งหรือประเภทธุรกิจ และระยะเวลาประกอบอาชีพ", "SUPPLEMENTAL_EMPLOYMENT_FIELDS_REQUIRED"); } ["monthlyIncome", "additionalIncome", "monthlyExpenses", "monthlyDebtPayment", "familySupport"].forEach(function (key) { if (data[key] === "" || data[key] === "INVALID" || !isFinite(Number(data[key])) || Number(data[key]) < 0) { throwPublic_("กรุณากรอกรายได้และรายจ่ายเป็นตัวเลขศูนย์หรือมากกว่าให้ครบถ้วน", "SUPPLEMENTAL_FINANCIAL_FIELDS_REQUIRED"); } }); if (Number(data.monthlyIncome) <= 0) throwPublic_("รายได้ต่อเดือนต้องมากกว่า 0 บาท", "SUPPLEMENTAL_INCOME_REQUIRED"); var allowedBanks = [ "ธนาคารกรุงเทพ", "ธนาคารกสิกรไทย", "ธนาคารกรุงไทย", "ธนาคารไทยพาณิชย์", "ธนาคารกรุงศรีอยุธยา", "ธนาคารทหารไทยธนชาต", "ธนาคารออมสิน", "ธนาคารเพื่อการเกษตรและสหกรณ์การเกษตร", "ธนาคารอาคารสงเคราะห์", "ธนาคารซีไอเอ็มบี ไทย", "ธนาคารยูโอบี", "ธนาคารเกียรตินาคินภัทร", "ธนาคารทิสโก้", "ธนาคารแลนด์ แอนด์ เฮ้าส์", "ธนาคารอิสลามแห่งประเทศไทย", "อื่น ๆ" ]; if (allowedBanks.indexOf(String(data.bankName || "")) === -1) { throwPublic_("กรุณาเลือกธนาคารจากรายการที่ระบบรองรับ", "INVALID_SUPPLEMENTAL_BANK"); } if (String(data.bankName || "") === "อื่น ๆ" && !String(data.bankOtherName || "").trim()) { throwPublic_("กรุณาระบุชื่อธนาคารอื่น ๆ", "SUPPLEMENTAL_BANK_OTHER_REQUIRED"); } if (["SAVINGS", "CURRENT"].indexOf(String(data.bankAccountType || "").toUpperCase()) === -1 || !String(data.bankAccountName || "").trim()) { throwPublic_("กรุณากรอกประเภทบัญชีและชื่อเจ้าของบัญชีให้ครบถ้วน", "SUPPLEMENTAL_BANK_FIELDS_REQUIRED"); } var account = String(data.bankAccountNumber || "").replace(/[\s-]/g, ""); if (!/^[0-9]{8,20}$/.test(account)) throwPublic_("เลขที่บัญชีต้องเป็นตัวเลข 8–20 หลัก", "INVALID_BANK_ACCOUNT_NUMBER");
var enteredName = normalizedPersonName_(data.bankAccountName);
var fullName = normalizedPersonName_(user.fullName);
var fullWithPrefix = normalizedPersonName_(String(user.prefix || "") + String(user.fullName || ""));
if (enteredName !== fullName && enteredName !== fullWithPrefix) {
throwPublic_("ชื่อเจ้าของบัญชีต้องตรงกับชื่อบัญชี FINORA", "BANK_ACCOUNT_NAME_MISMATCH");
}
if (!data.privacyAcknowledged || !data.dataProcessingConsent || !data.creditCheckConsent || !data.electronicSignatureConsent) {
throwPublic_("กรุณารับทราบประกาศความเป็นส่วนตัวและยืนยันความยินยอมที่จำเป็นแยกแต่ละรายการ", "SUPPLEMENTAL_CONSENT_REQUIRED");
}
if (!data.accuracyConfirm) {
throwPublic_("กรุณายืนยันว่าข้อมูลทั้งหมดถูกต้องก่อนส่งคำขอ", "SUPPLEMENTAL_ACCURACY_CONFIRMATION_REQUIRED");
}
return true;
}

function maskSupplementalValue_(field, value) {
var text = String(value === undefined || value === null ? "" : value);
if (/idNumber|bankAccountNumber/i.test(field)) {
if (!text) return "";
return "•".repeat(Math.max(0, text.length - 4)) + text.slice(-4);
}
return text;
}

function flattenSupplementalData_(obj, prefix, out) {
out = out || {};
prefix = prefix || "";
Object.keys(obj || {}).forEach(function (key) {
var path = prefix ? prefix + "." + key : key;
var value = obj[key];
if (value && typeof value === "object" && !Array.isArray(value)) {
flattenSupplementalData_(value, path, out);
} else {
out[path] = value === undefined || value === null ? "" : String(value);
}
});
return out;
}

function appendLoanSupplementalHistory_(record, actorUserId, actorRole, action, fieldName, oldValue, newValue, reason, requestId) {
appendRecord_("LoanSupplementalHistory", {
historyId: uuid_(),
loanId: String(record.loanId || ""),
supplementalId: String(record.supplementalId || ""),
version: Number(record.version || 0),
actorUserId: String(actorUserId || "SYSTEM"),
actorRole: String(actorRole || "SYSTEM"),
action: String(action || ""),
fieldName: String(fieldName || ""),
oldValue: String(oldValue === undefined || oldValue === null ? "" : oldValue).slice(0, 4000),
newValue: String(newValue === undefined || newValue === null ? "" : newValue).slice(0, 4000),
reason: String(reason || "").slice(0, 2000),
timestamp: nowIso_(),
requestId: String(requestId || uuid_())
});
}

function requireApprovedSupplementalForLoan_(loanId) {
var supplemental = findLatestLoanSupplemental_(loanId);
if (!supplemental) {
var loan = findRecord_("Loans", "loanId", loanId);
if (loan && String(loan.status || "") === "APPROVED_PENDING_ACCEPTANCE") {
ensureLoanSupplementalRecord_(loan, "SYSTEM");
throwPublic_("ต้องส่งข้อมูลเพิ่มเติมและได้รับการตรวจสอบอนุมัติก่อนยอมรับข้อเสนอหรือจ่ายเงิน", "SUPPLEMENTAL_NOT_APPROVED");
}
/* Preserve loans already accepted or disbursed before this feature was deployed. */
if (loan && ["ACCEPTED_PENDING_DISBURSEMENT", "DISBURSED", "PAID_OFF"].indexOf(String(loan.status || "")) >= 0) return null;
}
if (!supplemental || String(supplemental.status || "").toUpperCase() !== "APPROVED") {
throwPublic_("ต้องส่งข้อมูลเพิ่มเติมและได้รับการตรวจสอบอนุมัติก่อนยอมรับข้อเสนอหรือจ่ายเงิน", "SUPPLEMENTAL_NOT_APPROVED");
}
return supplemental;
}

function borrowerGetLoanSupplemental_(p) {
var auth = authenticate_(p);
var loanId = String(p.loanId || "").trim();
var loan = requireBorrowerSupplementalLoan_(loanId, auth.user.userId, true);
var supplemental = findLatestLoanSupplemental_(loanId);
if (!supplemental && String(loan.status) === "APPROVED_PENDING_ACCEPTANCE") {
supplemental = ensureLoanSupplementalRecord_(loan, auth.user.userId);
}
if (!supplemental) throwPublic_("ยังไม่มีรายการข้อมูลเพิ่มเติมสำหรับสินเชื่อนี้", "SUPPLEMENTAL_NOT_FOUND");
var docs = getRecordsByField_("LoanSupplementalDocuments", "supplementalId", supplemental.supplementalId)
.filter(function (doc) { return String(doc.isDeleted || "FALSE").toUpperCase() !== "TRUE"; })
.map(function (doc) {
return { documentId: String(doc.documentId || ""), documentName: String(doc.documentName || ""), documentType: String(doc.documentType || ""), version: Number(doc.version || 0), uploadedAt: String(doc.uploadedAt || ""), reviewStatus: String(doc.reviewStatus || "PENDING"), reviewNote: String(doc.reviewNote || "") };
});
var signatures = getRecordsByField_("LoanSupplementalSignatures", "supplementalId", supplemental.supplementalId)
.map(function (sig) { return { signatureType: String(sig.signatureType || ""), version: Number(sig.version || 0), signedAt: String(sig.signedAt || "") }; });
var product = findRecord_("Products", "productId", loan.productId) || {};
return {
loan: safeLoan_(loan),
productTerms: { interestRateAnnual: Number(loan.interestRateAnnual || product.interestRateAnnual || 0), interestMethod: String(loan.interestMethod || product.interestMethod || ""), feeFixed: Number(product.feeFixed || 0), feePercent: Number(product.feePercent || 0) },
user: { userId: String(auth.user.userId), prefix: String(auth.user.prefix || ""), fullName: String(auth.user.fullName || ""), dob: String(auth.user.dob || ""), email: String(auth.user.email || ""), phone: String(auth.user.phone || "") },
supplemental: safeLoanSupplementalSummary_(supplemental),
formData: parseSupplementalJson_(supplemental.formDataJson),
documents: docs,
signatures: signatures
};
}

function borrowerSaveLoanSupplemental_(p) {
var auth = authenticate_(p);
var loanId = String(p.loanId || "").trim();
var loan = requireBorrowerSupplementalLoan_(loanId, auth.user.userId, false);
var supplemental = findLatestLoanSupplemental_(loanId) || ensureLoanSupplementalRecord_(loan, auth.user.userId);
requireEditableSupplementalRecord_(supplemental);
if (!p.formData || typeof p.formData !== "object" || Array.isArray(p.formData)) {
throwPublic_("ข้อมูลฟอร์มไม่ถูกต้อง", "INVALID_SUPPLEMENTAL_DATA");
}
var clean = normalizeLoanSupplementalFormData_(p.formData, auth.user);
var nextStatus = String(supplemental.status) === "REQUIRED" ? "DRAFT" : String(supplemental.status);
updateRecord_("LoanSupplemental", supplemental.rowNumber, {
formDataJson: JSON.stringify(clean), status: nextStatus, updatedAt: nowIso_()
});
appendLoanSupplementalHistory_(supplemental, auth.user.userId, "USER", "DRAFT_SAVED", "", "", "", "ผู้กู้บันทึกแบบร่าง");
logEvent_(auth.user.userId, "LOAN_SUPPLEMENTAL_DRAFT_SAVED", "LOAN_SUPPLEMENTAL", supplemental.supplementalId, { loanId: loanId });
return { message: "บันทึกแบบร่างแล้ว", supplemental: safeLoanSupplementalSummary_(findLatestLoanSupplemental_(loanId)) };
}

function parseSupplementalFileData_(dataUrl) {
var match = String(dataUrl || "").match(/^data:(image\/(?:jpeg|png|webp)|application\/pdf);base64,([A-Za-z0-9+/=\s]+)$/i);
if (!match) throwPublic_("รองรับเฉพาะไฟล์ JPG, PNG, WebP หรือ PDF", "INVALID_SUPPLEMENTAL_FILE_TYPE");
var mime = String(match[1]).toLowerCase();
var base64 = String(match[2]).replace(/\s/g, "");
var bytes;
try { bytes = Utilities.base64Decode(base64); } catch (err) { throwPublic_("ข้อมูลไฟล์ไม่ถูกต้อง", "INVALID_SUPPLEMENTAL_FILE_DATA"); }
var maxSize = Number(getProperty_("MAX_LOAN_DOCUMENT_SIZE_BYTES", "3145728"));
if (!bytes || !bytes.length || !isFinite(maxSize) || maxSize < 1 || bytes.length > maxSize) {
throwPublic_("ไฟล์ว่างหรือมีขนาดเกิน 3 MiB", "SUPPLEMENTAL_FILE_TOO_LARGE");
}
var starts = function (arr) { return arr.every(function (n, i) { return (bytes[i] & 255) === n; }); };
var valid = false;
if (mime === "image/jpeg") valid = starts([255, 216, 255]);
if (mime === "image/png") valid = starts([137, 80, 78, 71, 13, 10, 26, 10]);
if (mime === "image/webp") valid = starts([82, 73, 70, 70]) && String.fromCharCode.apply(null, bytes.slice(8, 12)) === "WEBP";
if (mime === "application/pdf") valid = String.fromCharCode.apply(null, bytes.slice(0, 4)) === "%PDF";
if (!valid) throwPublic_("ชนิดไฟล์ไม่ตรงกับข้อมูลไฟล์จริง", "SUPPLEMENTAL_FILE_SIGNATURE_MISMATCH");
return { mime: mime, bytes: bytes, size: bytes.length };
}

function borrowerUploadLoanSupplementalFile_(p) {
var auth = authenticate_(p);
var loanId = String(p.loanId || "").trim();
var loan = requireBorrowerSupplementalLoan_(loanId, auth.user.userId, false);
var supplemental = findLatestLoanSupplemental_(loanId) || ensureLoanSupplementalRecord_(loan, auth.user.userId);
requireEditableSupplementalRecord_(supplemental);
var docType = String(p.documentType || "SUPPORTING").toUpperCase();
var allowedTypes = ["IDENTITY_DOCUMENT", "INCOME_PROOF", "SUPPORTING", "SIGNATURE_PRIMARY", "SIGNATURE_CONFIRMATION"];
if (allowedTypes.indexOf(docType) === -1) throwPublic_("ประเภทเอกสารไม่ถูกต้อง", "INVALID_DOCUMENT_TYPE");
var parsed = parseSupplementalFileData_(p.fileData);
if (docType.indexOf("SIGNATURE_") === 0 && parsed.mime === "application/pdf") {
throwPublic_("ลายมือชื่อต้องเป็นไฟล์ภาพเท่านั้น", "SIGNATURE_IMAGE_REQUIRED");
}
var folderId = getProperty_("LOAN_DOCUMENTS_FOLDER_ID", "");
if (!folderId) throwPublic_("ระบบยังไม่ได้ตั้งค่า LOAN_DOCUMENTS_FOLDER_ID ใน Script Properties", "LOAN_DOCUMENTS_FOLDER_NOT_CONFIGURED");
var nextVersion = Number(supplemental.version || 0) + 1;
var fileName = String(p.fileName || docType.toLowerCase() + "-" + loanId).replace(/[\/:*?"<>|#%{}[]]/g, "").slice(0, 100);
var blob = Utilities.newBlob(parsed.bytes, parsed.mime, fileName);
var file;
try {
file = DriveApp.getFolderById(folderId).createFile(blob);
file.setDescription("FINORA private loan supplemental file. Loan=" + loanId + "; supplemental=" + supplemental.supplementalId + "; uploadedBy=" + auth.user.userId);
} catch (err) {
console.error("Supplemental Drive upload failed: " + String(err));
throwPublic_("ไม่สามารถบันทึกไฟล์ได้ กรุณาตรวจสอบโฟลเดอร์เอกสารและสิทธิ์ Apps Script", "SUPPLEMENTAL_DRIVE_UPLOAD_FAILED");
}
var now = nowIso_();
if (docType.indexOf("SIGNATURE_") === 0) {
var signatureType = docType === "SIGNATURE_PRIMARY" ? "PRIMARY" : "CONFIRMATION";
appendRecord_("LoanSupplementalSignatures", {
signatureId: uuid_(), loanId: loanId, supplementalId: supplemental.supplementalId,
version: nextVersion, signatureType: signatureType, driveFileId: file.getId(),
mimeType: parsed.mime, fileSize: parsed.size, signedAt: now, signerUserId: auth.user.userId,
consentTextVersion: getProperty_("SUPPLEMENTAL_SIGNATURE_VERSION", "1.0"), verificationStatus: "CAPTURED"
});
} else {
appendRecord_("LoanSupplementalDocuments", {
documentId: uuid_(), loanId: loanId, supplementalId: supplemental.supplementalId,
version: nextVersion, documentType: docType,
documentName: String(p.documentName || fileName).trim().slice(0, 300), driveFileId: file.getId(),
mimeType: parsed.mime, fileSize: parsed.size, uploadedAt: now, uploadedBy: auth.user.userId,
reviewStatus: "PENDING", reviewNote: "", reviewedAt: "", reviewedBy: "", isDeleted: "FALSE"
});
}
appendLoanSupplementalHistory_(supplemental, auth.user.userId, "USER", "FILE_UPLOADED", docType, "", fileName, "เพิ่มไฟล์ประกอบคำขอ");
logEvent_(auth.user.userId, "LOAN_SUPPLEMENTAL_FILE_UPLOADED", "LOAN_SUPPLEMENTAL", supplemental.supplementalId, { loanId: loanId, documentType: docType, mimeType: parsed.mime, fileSize: parsed.size });
return { message: docType.indexOf("SIGNATURE_") === 0 ? "บันทึกลายมือชื่อแล้ว" : "อัปโหลดเอกสารแล้ว", documentType: docType, version: nextVersion };
}

function borrowerSubmitLoanSupplemental_(p) {
var auth = authenticate_(p);
var loanId = String(p.loanId || "").trim();
var loan = requireBorrowerSupplementalLoan_(loanId, auth.user.userId, false);
var supplemental = findLatestLoanSupplemental_(loanId);
if (!supplemental) throwPublic_("ไม่พบรายการข้อมูลเพิ่มเติม", "SUPPLEMENTAL_NOT_FOUND");
requireEditableSupplementalRecord_(supplemental);
var data = normalizeLoanSupplementalFormData_(parseSupplementalJson_(supplemental.formDataJson), auth.user);
validateLoanSupplementalFormData_(data, auth.user);
var nextVersion = Number(supplemental.version || 0) + 1;
var oldData = parseSupplementalJson_(supplemental.submittedDataJson);
var identityDocs = getRecordsByField_("LoanSupplementalDocuments", "supplementalId", supplemental.supplementalId).filter(function (doc) {
return String(doc.isDeleted || "FALSE").toUpperCase() !== "TRUE" && String(doc.documentType) === "IDENTITY_DOCUMENT";
});
var identityChanged = !oldData.idType || String(oldData.idType || "") !== String(data.idType || "") || String(oldData.idNumber || "") !== String(data.idNumber || "");
var identityUploadedThisVersion = identityDocs.some(function (doc) { return Number(doc.version || 0) === nextVersion; });
if (!identityDocs.length || (identityChanged && !identityUploadedThisVersion)) {
throwPublic_("กรุณาอัปโหลดเอกสารประจำตัวในกรณีที่ยังไม่เคยอัปโหลดหรือมีการเปลี่ยนประเภท/เลขเอกสาร", "IDENTITY_DOCUMENT_REQUIRED");
}
var signatures = getRecordsByField_("LoanSupplementalSignatures", "supplementalId", supplemental.supplementalId).filter(function (sig) {
return Number(sig.version || 0) === nextVersion;
});
var hasPrimary = signatures.some(function (sig) { return String(sig.signatureType) === "PRIMARY"; });
var hasConfirmation = signatures.some(function (sig) { return String(sig.signatureType) === "CONFIRMATION"; });
if (!hasPrimary || !hasConfirmation) throwPublic_("กรุณาลงลายมือชื่อทั้งสองช่องในรอบส่งข้อมูลนี้", "BOTH_SIGNATURES_REQUIRED");
var oldFlat = flattenSupplementalData_(oldData);
var newFlat = flattenSupplementalData_(data);
var now = nowIso_();
var requestId = uuid_();
if (String(supplemental.submittedDataJson || "{}") !== "{}") {
var allKeys = {};
Object.keys(oldFlat).forEach(function (key) { allKeys[key] = true; });
Object.keys(newFlat).forEach(function (key) { allKeys[key] = true; });
Object.keys(allKeys).forEach(function (key) {
var oldValue = oldFlat[key] === undefined ? "" : oldFlat[key];
var newValue = newFlat[key] === undefined ? "" : newFlat[key];
if (String(oldValue) !== String(newValue)) {
appendLoanSupplementalHistory_(Object.assign({}, supplemental, { version: nextVersion }), auth.user.userId, "USER", "FIELD_CHANGED", key,
maskSupplementalValue_(key, oldValue), maskSupplementalValue_(key, newValue), "ผู้กู้แก้ไขข้อมูลแล้วส่งใหม่", requestId);
}
});
}
appendRecord_("LoanSupplementalVersions", {
snapshotId: uuid_(),
loanId: loanId,
supplementalId: supplemental.supplementalId,
userId: auth.user.userId,
version: nextVersion,
dataJson: JSON.stringify(data),
snapshotHash: hashSecret_(JSON.stringify(data)),
submittedBy: auth.user.userId,
submittedAt: now,
requestId: requestId
});

updateRecord_("LoanSupplemental", supplemental.rowNumber, {
status: "SUBMITTED", version: nextVersion, formDataJson: JSON.stringify(data),
submittedDataJson: JSON.stringify(data), submittedAt: now, reviewedAt: "", reviewedBy: "", updatedAt: now
});
var consentItems = [
["PRIVACY_ACKNOWLEDGEMENT", data.privacyAcknowledged],
["DATA_PROCESSING", data.dataProcessingConsent],
["CREDIT_CHECK", data.creditCheckConsent],
["ELECTRONIC_SIGNATURE", data.electronicSignatureConsent]
];
consentItems.forEach(function (item) {
appendRecord_("LoanSupplementalConsents", {
consentId: uuid_(), loanId: loanId, supplementalId: supplemental.supplementalId,
userId: auth.user.userId, version: nextVersion, consentType: item[0],
documentVersion: item[0] === "PRIVACY_ACKNOWLEDGEMENT" ? getProperty_("PRIVACY_VERSION", "1.0") : getProperty_("SUPPLEMENTAL_CONSENT_VERSION", "1.0"),
accepted: item[1] ? "TRUE" : "FALSE", acceptedAt: item[1] ? now : "", withdrawnAt: "", createdAt: now
});
});
appendLoanSupplementalHistory_(supplemental, auth.user.userId, "USER", "SUBMITTED", "", "", "", "ผู้กู้ส่งข้อมูลเพิ่มเติมเพื่อให้เจ้าหน้าที่ตรวจสอบ", requestId);
logEvent_(auth.user.userId, "LOAN_SUPPLEMENTAL_SUBMITTED", "LOAN_SUPPLEMENTAL", supplemental.supplementalId, { loanId: loanId, version: nextVersion, changedFieldsCompared: Object.keys(newFlat).length });
createLoanStatusNotification_(loan, "ส่งข้อมูลเพิ่มเติมเรียบร้อยแล้ว", "ระบบได้รับข้อมูลเพิ่มเติมของสินเชื่อ " + loanId + " แล้ว ขณะนี้อยู่ระหว่างรอเจ้าหน้าที่ตรวจสอบ");
return { message: "ส่งข้อมูลเพิ่มเติมเรียบร้อยแล้ว รอเจ้าหน้าที่ตรวจสอบ", status: "SUBMITTED", version: nextVersion };
}

function adminListLoanSupplementals_(p) {
requireAdmin_(p);
var status = String(p.status || "").toUpperCase();
var records = getRecords_("LoanSupplemental");
if (status) records = records.filter(function (record) { return String(record.status || "").toUpperCase() === status; });
var loans = getRecords_("Loans");
var loanMap = {};
loans.forEach(function (loan) { loanMap[String(loan.loanId)] = loan; });
var users = getRecords_("Users");
var userMap = {};
users.forEach(function (user) { userMap[String(user.userId)] = user; });
records.sort(function (a, b) { return String(b.updatedAt || "").localeCompare(String(a.updatedAt || "")); });
return { supplementals: records.map(function (record) {
var loan = loanMap[String(record.loanId)] || {};
var user = userMap[String(record.userId)] || {};
return Object.assign(safeLoanSupplementalSummary_(record), {
productName: String(loan.productName || ""), requestedAmount: Number(loan.requestedAmount || 0),
approvedAmount: Number(loan.approvedAmount || 0), loanStatus: String(loan.status || ""),
customerName: String(user.fullName || ""), customerEmail: String(user.email || ""), customerPhone: String(user.phone || "")
});
}) };
}

function adminGetLoanSupplemental_(p) {
var auth = requireAdmin_(p);
var supplementalId = String(p.supplementalId || "").trim();
var loanId = String(p.loanId || "").trim();
var supplemental = supplementalId ? findRecord_("LoanSupplemental", "supplementalId", supplementalId) : findLatestLoanSupplemental_(loanId);
if (!supplemental) throwPublic_("ไม่พบข้อมูลเพิ่มเติมของคำขอสินเชื่อ", "SUPPLEMENTAL_NOT_FOUND");
var loan = findRecord_("Loans", "loanId", supplemental.loanId);
var user = loan ? findRecord_("Users", "userId", loan.userId) : null;
var documents = getRecordsByField_("LoanSupplementalDocuments", "supplementalId", supplemental.supplementalId)
.filter(function (doc) { return String(doc.isDeleted || "FALSE").toUpperCase() !== "TRUE"; })
.map(function (doc) {
var url = "";
try { url = DriveApp.getFileById(String(doc.driveFileId)).getUrl(); } catch (err) { url = ""; }
return { documentId: String(doc.documentId || ""), documentName: String(doc.documentName || ""), documentType: String(doc.documentType || ""), version: Number(doc.version || 0), mimeType: String(doc.mimeType || ""), fileSize: Number(doc.fileSize || 0), uploadedAt: String(doc.uploadedAt || ""), reviewStatus: String(doc.reviewStatus || "PENDING"), reviewNote: String(doc.reviewNote || ""), fileUrl: url };
});
var signatures = getRecordsByField_("LoanSupplementalSignatures", "supplementalId", supplemental.supplementalId)
.map(function (sig) {
var url = "";
try { url = DriveApp.getFileById(String(sig.driveFileId)).getUrl(); } catch (err) { url = ""; }
return { signatureId: String(sig.signatureId || ""), signatureType: String(sig.signatureType || ""), version: Number(sig.version || 0), signedAt: String(sig.signedAt || ""), fileUrl: url };
});
var history = getRecordsByField_("LoanSupplementalHistory", "supplementalId", supplemental.supplementalId)
.sort(function (a, b) { return String(a.timestamp || "").localeCompare(String(b.timestamp || "")); })
.map(function (item) { return { version: Number(item.version || 0), actorUserId: String(item.actorUserId || ""), actorRole: String(item.actorRole || ""), action: String(item.action || ""), fieldName: String(item.fieldName || ""), oldValue: String(item.oldValue || ""), newValue: String(item.newValue || ""), reason: String(item.reason || ""), timestamp: String(item.timestamp || "") }; });
var versions = getRecordsByField_("LoanSupplementalVersions", "supplementalId", supplemental.supplementalId)
.sort(function (a, b) { return Number(a.version || 0) - Number(b.version || 0); })
.map(function (item) {
var snapshot = parseSupplementalJson_(item.dataJson);
snapshot.idNumber = maskSupplementalValue_("idNumber", snapshot.idNumber);
snapshot.bankAccountNumber = maskSupplementalValue_("bankAccountNumber", snapshot.bankAccountNumber);
return { version: Number(item.version || 0), submittedAt: String(item.submittedAt || ""), submittedBy: String(item.submittedBy || ""), snapshotHash: String(item.snapshotHash || ""), data: snapshot };
});
return {
supplemental: safeLoanSupplementalSummary_(supplemental),
loan: loan ? safeLoan_(loan) : null,
customer: user ? { userId: String(user.userId || ""), prefix: String(user.prefix || ""), fullName: String(user.fullName || ""), dob: String(user.dob || ""), email: String(user.email || ""), phone: String(user.phone || "") } : null,
formData: parseSupplementalJson_(supplemental.submittedDataJson || supplemental.formDataJson),
documents: documents, signatures: signatures, history: history, versions: versions
};
}

function adminReviewLoanSupplemental_(p) {
var auth = requireAdmin_(p);
var supplementalId = String(p.supplementalId || "").trim();
var decision = String(p.decision || "").toUpperCase();
var note = String(p.note || "").trim();
if (["APPROVE", "RETURN", "REJECT"].indexOf(decision) === -1) throwPublic_("คำสั่งตรวจข้อมูลไม่ถูกต้อง", "INVALID_SUPPLEMENTAL_DECISION");
if (decision !== "APPROVE" && note.length < 2) throwPublic_("กรุณาระบุเหตุผลเมื่อส่งกลับแก้ไขหรือไม่อนุมัติ", "SUPPLEMENTAL_REVIEW_NOTE_REQUIRED");
if (note.length > 2000) throwPublic_("หมายเหตุยาวเกินกำหนด", "SUPPLEMENTAL_REVIEW_NOTE_TOO_LONG");
var supplemental = findRecord_("LoanSupplemental", "supplementalId", supplementalId);
if (!supplemental) throwPublic_("ไม่พบข้อมูลเพิ่มเติม", "SUPPLEMENTAL_NOT_FOUND");
if (String(supplemental.status || "").toUpperCase() !== "SUBMITTED") throwPublic_("ตรวจได้เฉพาะข้อมูลที่ส่งมาและรอตรวจสอบ", "SUPPLEMENTAL_NOT_SUBMITTED");
var loan = findRecord_("Loans", "loanId", supplemental.loanId);
if (!loan || String(loan.status || "") !== "APPROVED_PENDING_ACCEPTANCE") throwPublic_("สถานะสินเชื่อไม่อนุญาตให้ตรวจข้อมูลเพิ่มเติม", "LOAN_NOT_AWAITING_SUPPLEMENTAL_REVIEW");
var now = nowIso_();
var nextStatus = decision === "APPROVE" ? "APPROVED" : decision === "RETURN" ? "RETURNED" : "REJECTED";
updateRecord_("LoanSupplemental", supplemental.rowNumber, {
status: nextStatus,
returnedReason: decision === "RETURN" ? note : "",
adminNote: note,
reviewedAt: now,
reviewedBy: auth.user.userId,
updatedAt: now
});
if (decision === "REJECT") {
updateRecord_("Loans", loan.rowNumber, {
status: "REJECTED", decisionNote: ("ไม่อนุมัติหลังตรวจข้อมูลเพิ่มเติม: " + note).slice(0, 1000),
reviewedBy: auth.user.userId, reviewedAt: now, updatedAt: now
});
}
appendLoanSupplementalHistory_(supplemental, auth.user.userId, "ADMIN", "REVIEW_" + decision, "status", "SUBMITTED", nextStatus, note);
logEvent_(auth.user.userId, "LOAN_SUPPLEMENTAL_REVIEW", "LOAN_SUPPLEMENTAL", supplemental.supplementalId, { loanId: supplemental.loanId, decision: decision, status: nextStatus, note: note });
createLoanStatusNotification_(
loan,
decision === "APPROVE" ? "ตรวจสอบเอกสารเพิ่มเติมผ่านแล้ว" : decision === "RETURN" ? "มีคำขอให้แก้ไขเอกสารสินเชื่อ" : "ผลการตรวจสอบเอกสารสินเชื่อ",
decision === "APPROVE"
? "เอกสารและข้อมูลเพิ่มเติมของสินเชื่อ " + loan.loanId + " ผ่านการตรวจสอบแล้ว กรุณาเข้าสู่ระบบเพื่อตรวจสอบสถานะและขั้นตอนถัดไป"
: decision === "RETURN"
? "เจ้าหน้าที่ส่งข้อมูลเพิ่มเติมของสินเชื่อ " + loan.loanId + " กลับให้แก้ไข กรุณาเข้าสู่ระบบเพื่ออ่านรายละเอียดและดำเนินการ"
: "ข้อมูลเพิ่มเติมของสินเชื่อ " + loan.loanId + " ไม่ผ่านการอนุมัติ กรุณาเข้าสู่ระบบเพื่อตรวจสอบเหตุผลจากเจ้าหน้าที่"
);
return { message: decision === "APPROVE" ? "อนุมัติข้อมูลเพิ่มเติมแล้ว" : decision === "RETURN" ? "ส่งข้อมูลกลับให้ผู้กู้แก้ไขแล้ว" : "ไม่อนุมัติคำขอหลังตรวจข้อมูลเพิ่มเติมแล้ว", status: nextStatus };
}

/* ================================================================
AD. BORROWER NOTIFICATIONS, MANUAL EMAILS AND SCHEDULED REMINDERS
• ================================================================
*/

function sanitizeNotificationHtml_(input) {
var html = String(input || "").slice(0, 30000);
html = html.replace(/<!--[\s\S]*?-->/g, "");
html = html.replace(/<(script|style|iframe|object|embed|form|input|button|textarea|select|svg|math|video|audio|link|meta|base)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, "");
html = html.replace(/<(script|style|iframe|object|embed|form|input|button|textarea|select|svg|math|video|audio|link|meta|base)\b[^>]*\/?>/gi, "");
var allowed = {p:1,div:1,span:1,br:1,strong:1,b:1,em:1,i:1,u:1,ul:1,ol:1,li:1,a:1};
return html.replace(/<\/?([a-z0-9-]+)\b[^>]*>/gi, function (tagText, tagName) {
var name = String(tagName).toLowerCase();
if (!allowed[name]) return "";
if (/^<\s*\//.test(tagText)) return name === "br" ? "" : "</" + name + ">";
if (name === "a") {
var hrefMatch = tagText.match(/\bhref\s*=\s*(['"])(.*?)\1/i);
var href = hrefMatch ? String(hrefMatch[2]).trim() : "";
if (!/^https:\/\/[^\s]+$/i.test(href)) return "<a>";
return '<a href="' + escapeAttribute_(href) + '" target="_blank" rel="noopener noreferrer">';
}
if (name === "span") {
var styleMatch = tagText.match(/\bstyle\s*=\s*(['"])(.*?)\1/i);
var style = styleMatch ? styleMatch[2] : "";
var sizeMatch = style.match(/font-size\s*:\s*(12|14|16|18|20)px/i);
return sizeMatch ? '<span style="font-size:' + sizeMatch[1] + 'px">' : "<span>";
}
return "<" + name + ">";
});
}

function sanitizeAdminEmailHtml_(input) {
var html = String(input || "").slice(0, 80000);
html = html.replace(/<!--[\s\S]*?-->/g, "");
html = html.replace(/<(script|style|iframe|object|embed|form|input|button|textarea|select|svg|math|video|audio|link|meta|base)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, "");
html = html.replace(/<(script|style|iframe|object|embed|form|input|button|textarea|select|svg|math|video|audio|link|meta|base)\b[^>]*\/?>/gi, "");
var allowed = {h1:1,h2:1,h3:1,p:1,div:1,span:1,br:1,hr:1,strong:1,b:1,em:1,i:1,u:1,ul:1,ol:1,li:1,blockquote:1,a:1,img:1,table:1,thead:1,tbody:1,tr:1,td:1,th:1};
return html.replace(/<\/?([a-z0-9-]+)\b[^>]*>/gi, function (tagText, tagName) {
var name = String(tagName).toLowerCase();
if (!allowed[name]) return "";
if (/^<\s*\//.test(tagText)) return ["br","hr","img"].indexOf(name) >= 0 ? "" : "</" + name + ">";
if (name === "a") {
var hrefMatch = tagText.match(/\bhref\s*=\s*(['"])(.*?)\1/i);
var href = hrefMatch ? String(hrefMatch[2]).trim() : "";
return /^https:\/\/[^\s]+$/i.test(href) ? '<a href="' + escapeAttribute_(href) + '" target="_blank" rel="noopener noreferrer">' : "<a>";
}
if (name === "img") {
var srcMatch = tagText.match(/\bsrc\s*=\s*(['"])(.*?)\1/i);
var altMatch = tagText.match(/\balt\s*=\s*(['"])(.*?)\1/i);
var src = srcMatch ? safeUrl_(srcMatch[2]) : "";
if (!src) return "";
return '<img src="' + escapeAttribute_(src) + '" alt="' + escapeAttribute_(altMatch ? altMatch[2] : "") + '" style="max-width:100%;height:auto">';
}
if (name === "span") {
var styleMatch = tagText.match(/\bstyle\s*=\s*(['"])(.*?)\1/i);
var sizeMatch = styleMatch ? styleMatch[2].match(/font-size\s*:\s*(12|14|16|18|20|22|24|28)px/i) : null;
return sizeMatch ? '<span style="font-size:' + sizeMatch[1] + 'px">' : "<span>";
}
return "<" + name + ">";
});
}

function safeNotification_(record) {
return {
notificationId: String(record.notificationId || ""),
title: String(record.title || "ประกาศจาก FINORA"),
contentHtml: sanitizeNotificationHtml_(record.contentHtml || ""),
loanId: String(record.loanId || ""),
createdAt: String(record.createdAt || ""),
readAt: String(record.readAt || ""),
dismissedAt: String(record.dismissedAt || ""),
isNew: String(record.dismissedAt || "") === ""
};
}

function createNotificationForUser_(userId, title, contentHtml, loanId, actorUserId) {
var user = findRecord_("Users", "userId", String(userId || ""));
if (!user || String(user.status || "").toUpperCase() !== "ACTIVE") return null;
var cleanTitle = String(title || "แจ้งเตือนจาก FINORA").trim().slice(0, 200);
var cleanHtml = sanitizeNotificationHtml_(contentHtml || "");
if (!cleanTitle || !String(cleanHtml).replace(/<[^>]*>/g, "").trim()) return null;
var record = {
notificationId: uuid_(),
userId: String(user.userId),
title: cleanTitle,
contentHtml: cleanHtml,
loanId: String(loanId || ""),
isActive: "TRUE",
createdBy: String(actorUserId || "SYSTEM"),
createdAt: nowIso_(),
readAt: "",
dismissedAt: ""
};
appendRecord_("Notifications", record);
return record;
}

function createLoanStatusNotification_(loan, title, message) {
try {
if (!loan || !loan.userId) return false;
var content = '<p>' + escapeHtml_(String(message || "มีการอัปเดตข้อมูลสินเชื่อของคุณ")) + '</p>';
createNotificationForUser_(loan.userId, title, content, loan.loanId, "SYSTEM");
return true;
} catch (err) {
console.error("FINORA loan notification failed: " + String(err));
return false;
}
}

function getMyNotifications_(p) {
var auth = authenticate_(p);
var rows = getRecordsByField_("Notifications", "userId", auth.user.userId)
.filter(function (item) { return parseBoolean_(item.isActive); })
.sort(function (a, b) { return String(b.createdAt || "").localeCompare(String(a.createdAt || "")); });
return { notifications: rows.map(safeNotification_) };
}

function dismissNotification_(p) {
var auth = authenticate_(p);
var notificationId = String(p.notificationId || "").trim();
var record = findRecord_("Notifications", "notificationId", notificationId);
if (!record || String(record.userId) !== String(auth.user.userId)) {
throwPublic_("ไม่พบการแจ้งเตือนนี้", "NOTIFICATION_NOT_FOUND");
}
var now = nowIso_();
updateRecord_("Notifications", record.rowNumber, {
readAt: String(record.readAt || now),
dismissedAt: String(record.dismissedAt || now)
});
return { message: "ปิดการแจ้งเตือนแล้ว" };
}

function adminListNotifications_(p) {
requireAdmin_(p);
var records = getRecords_("Notifications").sort(function (a, b) {
return String(b.createdAt || "").localeCompare(String(a.createdAt || ""));
}).slice(0, 300);
var users = getRecords_("Users");
var userMap = {};
users.forEach(function (user) { userMap[String(user.userId)] = user; });
return { notifications: records.map(function (record) {
var user = userMap[String(record.userId)] || {};
var item = safeNotification_(record);
item.customerName = String(user.fullName || "");
item.customerEmail = String(user.email || "");
item.customerStatus = String(user.status || "");
return item;
}) };
}

function adminCreateNotification_(p) {
var auth = requireAdmin_(p);
var title = String(p.title || "").trim().slice(0, 200);
var contentHtml = sanitizeNotificationHtml_(p.contentHtml || "");
var targetUserId = String(p.targetUserId || "").trim();
var loanId = String(p.loanId || "").trim();
if (title.length < 2) throwPublic_("กรุณากรอกหัวข้อแจ้งเตือน", "NOTIFICATION_TITLE_REQUIRED");
if (!String(contentHtml).replace(/<[^>]*>/g, "").trim()) throwPublic_("กรุณากรอกข้อความแจ้งเตือน", "NOTIFICATION_CONTENT_REQUIRED");
if (loanId && !findRecord_("Loans", "loanId", loanId)) throwPublic_("ไม่พบคำขอสินเชื่อที่เลือก", "LOAN_NOT_FOUND");
if (targetUserId === "ALL" && loanId) throwPublic_("การแจ้งเตือนสมาชิกทั้งหมดไม่สามารถผูกกับคำขอสินเชื่อรายบุคคลได้ กรุณาลบการเลือกสินเชื่อ", "BROADCAST_LOAN_LINK_NOT_ALLOWED");
var recipients = [];
if (targetUserId === "ALL") {
recipients = getRecords_("Users").filter(function (user) {
return String(user.status || "").toUpperCase() === "ACTIVE" && !isAdminUser_(user);
});
} else {
var target = findRecord_("Users", "userId", targetUserId);
if (!target || String(target.status || "").toUpperCase() !== "ACTIVE" || isAdminUser_(target)) {
throwPublic_("ไม่พบบัญชีสมาชิกที่เปิดใช้งาน", "NOTIFICATION_RECIPIENT_NOT_FOUND");
}
if (loanId && String(findRecord_("Loans", "loanId", loanId).userId) !== String(target.userId)) {
throwPublic_("คำขอสินเชื่อไม่ตรงกับสมาชิกที่เลือก", "NOTIFICATION_LOAN_USER_MISMATCH");
}
recipients = [target];
}
if (!recipients.length) throwPublic_("ไม่พบสมาชิกที่สามารถรับการแจ้งเตือนได้", "NOTIFICATION_RECIPIENTS_EMPTY");
var createdCount = 0;
recipients.forEach(function (user) {
var record = {
notificationId: uuid_(),
userId: String(user.userId),
title: title,
contentHtml: contentHtml,
loanId: loanId,
isActive: "TRUE",
createdBy: String(auth.user.userId),
createdAt: nowIso_(),
readAt: "",
dismissedAt: ""
};
appendRecord_("Notifications", record);
createdCount++;
});
logEvent_(auth.user.userId, "ADMIN_CREATE_NOTIFICATION", "NOTIFICATION", loanId || "BROADCAST", { title: title, target: targetUserId, recipientCount: createdCount });
return { message: "ส่งการแจ้งเตือนเรียบร้อยแล้ว", recipientCount: createdCount };
}

function adminSendLoanEmail_(p) {
var auth = requireAdmin_(p);
var loanId = String(p.loanId || "").trim();
var subject = String(p.subject || "").trim().slice(0, 200);
var html = sanitizeAdminEmailHtml_(p.contentHtml || "");
var loan = findRecord_("Loans", "loanId", loanId);
if (!loan) throwPublic_("ไม่พบคำขอสินเชื่อ", "LOAN_NOT_FOUND");
if (subject.length < 2) throwPublic_("กรุณากรอกหัวข้ออีเมล", "EMAIL_SUBJECT_REQUIRED");
if (!String(html).replace(/<[^>]*>/g, "").trim()) throwPublic_("กรุณากรอกเนื้อหาอีเมล", "EMAIL_CONTENT_REQUIRED");
var user = findRecord_("Users", "userId", loan.userId);
if (!user || !parseBoolean_(user.emailVerified) || !isValidEmail_(user.email)) {
throwPublic_("สมาชิกยังไม่มีอีเมลที่ยืนยันแล้ว จึงไม่สามารถส่งอีเมลได้", "VERIFIED_EMAIL_REQUIRED");
}
var body = '<p>เรียน ' + escapeHtml_(String(user.prefix || "") + " " + String(user.fullName || "")) + '</p>' +
'<p>ข้อมูลสินเชื่อ: <strong>' + escapeHtml_(String(loan.productName || "สินเชื่อ")) + '</strong><br>เลขที่สินเชื่อ: ' + escapeHtml_(loan.loanId) + '</p>' + html;
sendHtmlEmail_(user.email, subject, baseEmailTemplate_(subject, body, "", "อีเมลนี้ส่งโดยผู้ดูแลระบบ FINORA"), "อีเมลแจ้งข้อมูลสินเชื่อ FINORA: " + subject);
logEvent_(auth.user.userId, "ADMIN_SEND_LOAN_EMAIL", "LOAN", loanId, { recipientUserId: user.userId, subject: subject });
return { message: "ส่งอีเมลถึงผู้กู้เรียบร้อยแล้ว", recipientEmail: user.email };
}

function verifiedEmailUser_(userId) {
var user = findRecord_("Users", "userId", String(userId || ""));
if (!user || !parseBoolean_(user.emailVerified) || !isValidEmail_(user.email)) return null;
return user;
}

function sendLoanDisbursementEmail_(loan, slipUrl) {
try {
var user = verifiedEmailUser_(loan.userId);
if (!user) return false;
var supplemental = findLatestLoanSupplemental_(loan.loanId);
var formData = supplemental ? parseSupplementalJson_(supplemental.submittedDataJson || supplemental.formDataJson) : {};
var accountType = String(formData.bankAccountType || "").toUpperCase() === "CURRENT" ? "กระแสรายวัน" : "ออมทรัพย์";
var bankName = String(formData.bankName || "");
if (bankName === "อื่น ๆ") bankName = String(formData.bankOtherName || bankName);
var accountName = String(formData.bankAccountName || "");
var accountNumber = String(formData.bankAccountNumber || "");
var amount = Number(loan.approvedAmount || 0);
var html = '<p>เรียน ' + escapeHtml_(String(user.prefix || "") + " " + String(user.fullName || "")) + '</p>' +
'<p>FINORA ขอแจ้งยืนยันว่าได้บันทึกการโอนเงินสินเชื่อของท่านเรียบร้อยแล้ว</p>' +
'<table style="width:100%;border-collapse:collapse;font-size:14px">' +
'<tr><td style="padding:8px;border-bottom:1px solid #e5e9f1">ผลิตภัณฑ์สินเชื่อ</td><td style="padding:8px;border-bottom:1px solid #e5e9f1"><strong>' + escapeHtml_(loan.productName) + '</strong></td></tr>' +
'<tr><td style="padding:8px;border-bottom:1px solid #e5e9f1">เลขที่สินเชื่อ</td><td style="padding:8px;border-bottom:1px solid #e5e9f1">' + escapeHtml_(loan.loanId) + '</td></tr>' +
'<tr><td style="padding:8px;border-bottom:1px solid #e5e9f1">ยอดโอน</td><td style="padding:8px;border-bottom:1px solid #e5e9f1"><strong>฿' + formatMoneyEmail_(amount) + '</strong></td></tr>' +
'<tr><td style="padding:8px;border-bottom:1px solid #e5e9f1">วันที่บันทึกการโอน</td><td style="padding:8px;border-bottom:1px solid #e5e9f1">' + escapeHtml_(Utilities.formatDate(new Date(loan.disbursedAt || Date.now()), "Asia/Bangkok", "dd/MM/yyyy HH:mm")) + '</td></tr>' +
'<tr><td style="padding:8px;border-bottom:1px solid #e5e9f1">เลขอ้างอิง</td><td style="padding:8px;border-bottom:1px solid #e5e9f1">' + escapeHtml_(loan.disbursementRef || "—") + '</td></tr>' +
'<tr><td style="padding:8px;border-bottom:1px solid #e5e9f1">ธนาคารปลายทาง</td><td style="padding:8px;border-bottom:1px solid #e5e9f1">' + escapeHtml_(bankName || "—") + '</td></tr>' +
'<tr><td style="padding:8px;border-bottom:1px solid #e5e9f1">ประเภทบัญชี</td><td style="padding:8px;border-bottom:1px solid #e5e9f1">' + escapeHtml_(accountType) + '</td></tr>' +
'<tr><td style="padding:8px;border-bottom:1px solid #e5e9f1">ชื่อบัญชี</td><td style="padding:8px;border-bottom:1px solid #e5e9f1">' + escapeHtml_(accountName || "—") + '</td></tr>' +
'<tr><td style="padding:8px;border-bottom:1px solid #e5e9f1">เลขบัญชี</td><td style="padding:8px;border-bottom:1px solid #e5e9f1">' + escapeHtml_(accountNumber || "—") + '</td></tr>' +
'</table>' +
'<p>หลักฐานการโอนเงิน:</p><p><a href="' + escapeAttribute_(slipUrl) + '" target="_blank" rel="noopener noreferrer">เปิดดูสลิปการโอนเงิน</a></p>' +
'<p><img src="' + escapeAttribute_(slipUrl) + '" alt="สลิปการโอนเงินสินเชื่อ" style="display:block;max-width:100%;height:auto;border:1px solid #e5e9f1;border-radius:12px"></p>' +
'<p>โปรดตรวจสอบตารางชำระและวันครบกำหนดในระบบ FINORA</p>';
sendHtmlEmail_(user.email, "FINORA - ยืนยันการโอนเงินสินเชื่อ " + String(loan.loanId), baseEmailTemplate_("ยืนยันการโอนเงินสินเชื่อสำเร็จ", html, "", "อีเมลยืนยันการโอนเงินจาก FINORA"), "FINORA ยืนยันการโอนเงินสินเชื่อ " + String(loan.loanId));
return true;
} catch (err) {
console.error("Loan disbursement email failed: " + String(err));
return false;
}
}

function formatMoneyEmail_(value) {
return new Intl.NumberFormat("en-US", {minimumFractionDigits: 2, maximumFractionDigits: 2}).format(Number(value || 0));
}

function sendRepaymentReceiptEmail_(paymentId) {
try {
var payment = findRecord_("Payments", "paymentId", paymentId);
if (!payment) return false;
var user = verifiedEmailUser_(payment.userId);
if (!user) return false;
var loan = findRecord_("Loans", "loanId", payment.loanId) || {};
var selectedIds = parseJsonArray_(payment.installmentIdsJson).map(String);
var installments = getRecordsByField_("Installments", "loanId", payment.loanId).filter(function (item) {
return selectedIds.indexOf(String(item.installmentId)) >= 0;
});
if (installments.length && installments.every(function (item) { return String(item.receiptEmailSentAt || "") !== ""; })) return true;
var rows = installments.map(function (item) {
return '<tr><td style="padding:8px;border-bottom:1px solid #e5e9f1">งวดที่ ' + escapeHtml_(item.installmentNo) + '</td><td style="padding:8px;border-bottom:1px solid #e5e9f1">' + escapeHtml_(item.dueDate) + '</td><td style="padding:8px;border-bottom:1px solid #e5e9f1;text-align:right">฿' + formatMoneyEmail_(item.totalDue) + '</td></tr>';
}).join("");
var html = '<p>เรียน ' + escapeHtml_(String(user.prefix || "") + " " + String(user.fullName || "")) + '</p>' +
'<p>ระบบ FINORA ตรวจสอบและบันทึกการชำระเงินของท่านเรียบร้อยแล้ว</p>' +
'<p><strong>เลขที่สินเชื่อ:</strong> ' + escapeHtml_(payment.loanId) + '<br><strong>ผลิตภัณฑ์:</strong> ' + escapeHtml_(loan.productName || "สินเชื่อ") + '</p>' +
'<table style="width:100%;border-collapse:collapse;font-size:14px"><thead><tr><th style="text-align:left;padding:8px;border-bottom:1px solid #dce3ee">รายการ</th><th style="text-align:left;padding:8px;border-bottom:1px solid #dce3ee">วันครบกำหนด</th><th style="text-align:right;padding:8px;border-bottom:1px solid #dce3ee">ยอด</th></tr></thead><tbody>' + rows + '</tbody></table>' +
'<p><strong>ยอดชำระรวม: ฿' + formatMoneyEmail_(payment.amount) + '</strong></p>' +
'<p><strong>เลขอ้างอิงธุรกรรม:</strong> ' + escapeHtml_(payment.slipTransRef || "—") + '</p>' +
'<p><strong>เวลายืนยัน:</strong> ' + escapeHtml_(Utilities.formatDate(new Date(payment.slipVerifiedAt || Date.now()), "Asia/Bangkok", "dd/MM/yyyy HH:mm")) + '</p>' +
'<p>ขอบคุณที่ชำระเงินผ่าน FINORA</p>';
sendHtmlEmail_(user.email, "FINORA - ใบยืนยันการชำระงวดสินเชื่อ " + String(payment.loanId), baseEmailTemplate_("ใบยืนยันการชำระงวดสินเชื่อ", html, "", "อีเมลใบยืนยันการชำระเงินจาก FINORA"), "ยืนยันการชำระเงินสินเชื่อ " + String(payment.loanId));
var receiptSentAt = nowIso_();
installments.forEach(function (item) {
if (!String(item.receiptEmailSentAt || "")) {
updateRecord_("Installments", item.rowNumber, {receiptEmailSentAt: receiptSentAt, updatedAt: receiptSentAt});
}
});
return true;
} catch (err) {
console.error("Repayment receipt email failed: " + String(err));
return false;
}
}

function sendInstallmentReminderEmail_(installment, reminderType) {
var user = verifiedEmailUser_(installment.userId);
if (!user) return false;
var loan = findRecord_("Loans", "loanId", installment.loanId) || {};
var outstanding = Math.max(0, Number(installment.totalDue || 0) - Number(installment.paidAmount || 0));
var dueDate = String(installment.dueDate || "");
var title = reminderType === "OVERDUE"
? "แจ้งเตือนค้างชำระงวดสินเชื่อ 1 วัน"
: reminderType === "NOON"
? "แจ้งเตือนชำระงวดสินเชื่อครั้งที่ 2"
: reminderType === "EVENING"
? "แจ้งเตือนชำระงวดสินเชื่อครั้งที่ 3"
: "แจ้งเตือนกำหนดชำระงวดสินเชื่อ";
var greeting = 'เรียน ' + escapeHtml_(String(user.prefix || "") + " " + String(user.fullName || ""));
var mainText = reminderType === "OVERDUE"
? "ระบบตรวจพบว่ายอดชำระงวดสินเชื่อของท่านยังไม่ได้รับการชำระ และเลยกำหนดมาแล้ว 1 วัน โปรดดำเนินการชำระและตรวจสอบสถานะในระบบ"
: reminderType === "NOON"
? "ขณะนี้เป็นเวลา 12:00 น. ระบบยังไม่พบการยืนยันชำระงวดสินเชื่อของท่าน จึงขอแจ้งเตือนครั้งที่ 2 กรุณาดำเนินการชำระและส่งหลักฐานผ่านระบบ FINORA"
: reminderType === "EVENING"
? "ขณะนี้เป็นเวลา 20:00 น. ระบบยังไม่พบการยืนยันชำระงวดสินเชื่อของท่าน จึงขอแจ้งเตือนครั้งที่ 3 โปรดดำเนินการชำระและส่งหลักฐานผ่านระบบ FINORA"
: "วันนี้เป็นวันครบกำหนดชำระงวดสินเชื่อของท่าน กรุณาเข้าสู่ระบบ FINORA เพื่อสร้าง QR และดำเนินการชำระยอดตามกำหนด";
var html = '<p>' + greeting + '</p><p>' + mainText + '</p>' +
'<table style="width:100%;border-collapse:collapse;font-size:14px">' +
'<tr><td style="padding:8px;border-bottom:1px solid #e5e9f1">ผลิตภัณฑ์สินเชื่อ</td><td style="padding:8px;border-bottom:1px solid #e5e9f1"><strong>' + escapeHtml_(loan.productName || "สินเชื่อ") + '</strong></td></tr>' +
'<tr><td style="padding:8px;border-bottom:1px solid #e5e9f1">เลขที่สินเชื่อ</td><td style="padding:8px;border-bottom:1px solid #e5e9f1">' + escapeHtml_(installment.loanId) + '</td></tr>' +
'<tr><td style="padding:8px;border-bottom:1px solid #e5e9f1">งวดที่</td><td style="padding:8px;border-bottom:1px solid #e5e9f1">' + escapeHtml_(installment.installmentNo) + '</td></tr>' +
'<tr><td style="padding:8px;border-bottom:1px solid #e5e9f1">วันครบกำหนด</td><td style="padding:8px;border-bottom:1px solid #e5e9f1">' + escapeHtml_(dueDate) + '</td></tr>' +
'<tr><td style="padding:8px;border-bottom:1px solid #e5e9f1">ยอดคงเหลือที่ต้องชำระ</td><td style="padding:8px;border-bottom:1px solid #e5e9f1"><strong>฿' + formatMoneyEmail_(outstanding) + '</strong></td></tr>' +
'</table><p>หลังชำระเงินแล้ว โปรดส่งสลิปผ่านระบบเพื่อให้ตรวจสอบและปรับสถานะการชำระ</p>';
sendHtmlEmail_(user.email, "FINORA - " + title + " · งวดที่ " + String(installment.installmentNo), baseEmailTemplate_(title, html, "", "หากท่านชำระแล้วก่อนหน้าและระบบยังไม่อัปเดต โปรดส่งหลักฐานผ่านระบบหรือติดต่อเจ้าหน้าที่ FINORA"), title + " " + String(installment.loanId));
return true;
}

/**
 * Runs every minute in Apps Script. It sends the three due-day reminders
 * at 00:00, 12:00 and 20:00 Bangkok time, and marks unpaid installments
 * overdue after the calendar day has passed. Sent timestamps prevent duplicates.
 */
function finoraProcessScheduledNotifications() {
var lock = LockService.getScriptLock();
if (!lock.tryLock(20000)) return {skipped: true, reason: "LOCKED"};
var result = {dueDay: 0, noon: 0, evening: 0, overdue: 0, receipts: 0, payoutEmails: 0, failed: 0};
try {
var now = new Date();
var timezone = "Asia/Bangkok";
var localDate = Utilities.formatDate(now, timezone, "yyyy-MM-dd");
var localHour = Number(Utilities.formatDate(now, timezone, "H"));
var rows = getRecords_("Installments");

// Retry paid-payment receipts if an earlier send failed or the mail quota was unavailable.
getRecords_("Payments").filter(function (payment) {
return String(payment.status || "").toUpperCase() === "PAID";
}).forEach(function (payment) {
var selectedIds = parseJsonArray_(payment.installmentIdsJson).map(String);
var paymentInstallments = rows.filter(function (item) {
return String(item.loanId) === String(payment.loanId) && selectedIds.indexOf(String(item.installmentId)) >= 0;
});
var needsReceipt = paymentInstallments.some(function (item) { return !String(item.receiptEmailSentAt || ""); });
if (!needsReceipt) return;
try {
if (sendRepaymentReceiptEmail_(payment.paymentId)) result.receipts++;
} catch (receiptError) {
result.failed++;
console.error("FINORA receipt retry failed: " + String(receiptError));
}
});

// Retry the payout confirmation email if the loan was recorded as disbursed but email delivery failed.
getRecords_("Loans").filter(function (loan) {
return String(loan.status || "").toUpperCase() === "DISBURSED" &&
String(loan.disbursementSlipUrl || "") !== "" &&
String(loan.disbursementEmailSentAt || "") === "";
}).forEach(function (loan) {
try {
if (sendLoanDisbursementEmail_(loan, safeUrl_(loan.disbursementSlipUrl))) {
var sentAt = nowIso_();
updateRecord_("Loans", loan.rowNumber, {disbursementEmailSentAt: sentAt, updatedAt: sentAt});
result.payoutEmails++;
}
} catch (payoutEmailError) {
result.failed++;
console.error("FINORA payout email retry failed: " + String(payoutEmailError));
}
});

rows.forEach(function (installment) {
var dueDate = String(installment.dueDate || "").slice(0, 10);
var outstanding = Math.max(0, Number(installment.totalDue || 0) - Number(installment.paidAmount || 0));
if (!dueDate || outstanding <= 0 || String(installment.status || "").toUpperCase() === "PAID") return;
if (dueDate < localDate) {
if (String(installment.status || "").toUpperCase() !== "OVERDUE") {
updateRecord_("Installments", installment.rowNumber, {status: "OVERDUE", updatedAt: nowIso_()});
}
if (!String(installment.overdueOneDaySentAt || "")) {
try {
if (sendInstallmentReminderEmail_(installment, "OVERDUE")) {
updateRecord_("Installments", installment.rowNumber, {overdueOneDaySentAt: nowIso_(), status: "OVERDUE", updatedAt: nowIso_()});
result.overdue++;
}
} catch (emailError) {
result.failed++;
console.error("FINORA overdue email failed: " + String(emailError));
}
}
return;
}
if (dueDate !== localDate) return;
var reminderField = "";
var reminderType = "";
if (localHour >= 20 && !String(installment.reminderEveningSentAt || "")) {
reminderField = "reminderEveningSentAt"; reminderType = "EVENING";
} else if (localHour >= 12 && localHour < 20 && !String(installment.reminderNoonSentAt || "")) {
reminderField = "reminderNoonSentAt"; reminderType = "NOON";
} else if (localHour >= 0 && localHour < 12 && !String(installment.reminderDueDaySentAt || "")) {
reminderField = "reminderDueDaySentAt"; reminderType = "DUE_DAY";
}
if (!reminderField) return;
try {
if (sendInstallmentReminderEmail_(installment, reminderType)) {
var updates = {updatedAt: nowIso_()}; updates[reminderField] = nowIso_();
updateRecord_("Installments", installment.rowNumber, updates);
if (reminderType === "DUE_DAY") result.dueDay++;
if (reminderType === "NOON") result.noon++;
if (reminderType === "EVENING") result.evening++;
}
} catch (emailError) {
result.failed++;
console.error("FINORA due reminder email failed: " + String(emailError));
}
});
return result;
} finally {
lock.releaseLock();
}
}

function installFinoraNotificationTrigger_() {
var triggers = ScriptApp.getProjectTriggers();
var matching = triggers.filter(function (trigger) {
return trigger.getHandlerFunction() === "finoraProcessScheduledNotifications";
});
if (matching.length > 0) return true;
ScriptApp.newTrigger("finoraProcessScheduledNotifications").timeBased().everyMinutes(1).create();
return true;
}

/** Run once from Apps Script if the scheduled trigger was not installed by setupDatabase(). */
function setupFinoraAutomations() {
var installed = installFinoraNotificationTrigger_();
return {notificationTriggerInstalled: installed, timezoneUsed: "Asia/Bangkok", frequency: "every 1 minute"};
}

