/**
• FINORA BACKEND API
• Google Apps Script V8 + Google Sheets
• Public application:
• index.html
• Administrative dashboard:
• dashboard.html
• Database:
• Google Sheets
• Features:
◦ Automatic spreadsheet/schema creation
◦ User registration and login
◦ Email verification
◦ Password reset
◦ Session management
◦ Loan application management
◦ Loan product management
◦ Loan accounts and repayment schedules
◦ Thunder Solution QR and slip verification
◦ ImgBB image uploads
◦ Announcements with HTML sanitization
◦ Customer notifications and support tickets
◦ Admin authorization
◦ Audit logging
• IMPORTANT:
• Keep all secrets in Script Properties.
• Never send API secrets to browser JavaScript.
*/

const FINORA_VERSION = '1.0.0';

const FINORA_PASSWORD_ITERATIONS = 120000;

const FINORA_TABLES = {
users: [
'userId',
'username',
'prefix',
'fullName',
'birthDate',
'nationalIdHash',
'nationalIdLast4',
'phone',
'email',
'passwordSalt',
'passwordHash',
'passwordIterations',
'emailVerifiedAt',
'status',
'createdAt',
'updatedAt'
 ],

sessions: [
'sessionId',
'userId',
'tokenHash',
'createdAt',
'expiresAt',
'revokedAt',
'rememberMe',
'lastUsedAt'
 ],

email_verifications: [
'verificationId',
'email',
'tokenHash',
'purpose',
'createdAt',
'expiresAt',
'usedAt',
'verifiedAt'
 ],

verified_emails: [
'email',
'verifiedAt',
'expiresAt',
'consumedAt'
 ],

password_resets: [
'resetId',
'userId',
'tokenHash',
'createdAt',
'expiresAt',
'usedAt'
 ],

consents: [
'consentId',
'userId',
'consentType',
'version',
'acceptedAt',
'source'
 ],

loan_products: [
'productId',
'productName',
'description',
'minAmount',
'maxAmount',
'annualInterestRate',
'effectiveAnnualRate',
'interestMethod',
'feeFlat',
'minTermMonths',
'maxTermMonths',
'complianceReviewed',
'complianceReviewedBy',
'complianceReviewedAt',
'active',
'createdAt',
'updatedAt'
 ],

loan_applications: [
'applicationId',
'userId',
'productId',
'requestedAmount',
'requestedTermMonths',
'purpose',
'employmentType',
'monthlyIncome',
'monthlyExpenses',
'existingMonthlyDebt',
'status',
'decisionReason',
'approvedAmount',
'approvedTermMonths',
'offerAcceptedAt',
'createdAt',
'updatedAt',
'reviewedBy',
'reviewedAt',
'disbursedAt',
'disbursementRef'
 ],

loan_contracts: [
'contractId',
'applicationId',
'userId',
'status',
'contractVersion',
'signedDocumentUrl',
'signatureProviderRef',
'signedAt',
'verifiedBy',
'verifiedAt',
'createdAt'
 ],

loan_accounts: [
'loanAccountId',
'userId',
'applicationId',
'productId',
'contractId',
'principalAmount',
'outstandingPrincipal',
'totalAmountDue',
'totalAmountPaid',
'annualInterestRate',
'interestMethod',
'termMonths',
'startDate',
'status',
'createdAt',
'updatedAt'
 ],

repayment_schedules: [
'scheduleId',
'loanAccountId',
'userId',
'installmentNo',
'dueDate',
'principalAmount',
'interestAmount',
'feeAmount',
'amountDue',
'amountPaid',
'status',
'paidAt',
'createdAt'
 ],

payment_requests: [
'paymentRequestId',
'userId',
'loanAccountId',
'scheduleId',
'amount',
'status',
'qrPayload',
'providerRef',
'verifiedAmount',
'createdAt',
'expiresAt',
'paidAt',
'failureReason'
 ],

transactions: [
'transactionId',
'userId',
'loanAccountId',
'scheduleId',
'paymentRequestId',
'type',
'direction',
'amount',
'currency',
'provider',
'providerRef',
'status',
'createdAt',
'metadataJson'
 ],

ledger_entries: [
'ledgerEntryId',
'transactionId',
'accountCode',
'direction',
'amount',
'currency',
'createdAt'
 ],

announcements: [
'announcementId',
'title',
'placement',
'htmlContent',
'imageUrl',
'priority',
'active',
'startsAt',
'endsAt',
'createdBy',
'createdAt',
'updatedAt',
'deletedAt'
 ],

notifications: [
'notificationId',
'userId',
'title',
'message',
'type',
'readAt',
'createdAt'
 ],

support_tickets: [
'ticketId',
'userId',
'subject',
'category',
'message',
'status',
'assignedTo',
'staffReply',
'createdAt',
'updatedAt',
'closedAt'
 ],

audit_logs: [
'auditId',
'actorUserId',
'actorEmail',
'action',
'entityType',
'entityId',
'detailsJson',
'createdAt'
 ]
};

/* =========================================================
1. WEB APP ENTRY POINTS
========================================================= */

function doGet(e) {
try {
const params = (e && e.parameter) || {};
const action = String(params.action || 'ping');

if (action === 'ping') {
return jsonOutput_({
ok: true,
app: getProperty_('APP_NAME', 'FINORA'),
version: FINORA_VERSION,
timestamp: nowIso_()
});
}

/*
* GET endpoints are read-only.
*
* JSONP is available only for public information.
* Do not send session tokens or secrets using JSONP.
*/

if (
action === 'getPublicConfig' ||
action === 'getPublicAnnouncements'
) {
const callback = String(params.callback || '');

if (!/^[A-Za-z_]*$/.test(callback)) {
return jsonOutput_({
ok: false,
error: {
code: 'INVALID_CALLBACK',
message: 'รูปแบบ callback ไม่ถูกต้อง'
}
});
}

const request = {
action: action,
zone: String(params.zone || 'AUTH')
};

const result = executeApi_(request);

return ContentService
.createTextOutput(
callback + '(' + JSON.stringify(result) + ');'
)
.setMimeType(ContentService.MimeType.JAVASCRIPT);
}

return jsonOutput_({
ok: false,
error: {
code: 'METHOD_NOT_ALLOWED',
message: 'ไม่รองรับคำขอนี้ผ่าน GET'
}
});

} catch (error) {
logError_('doGet', error);

return jsonOutput_({
ok: false,
error: {
code: 'INTERNAL_ERROR',
message: 'ระบบเกิดข้อผิดพลาด'
}
});
}
}

function doPost(e) {
let request = {};
let transport = 'json';

try {
const eventParams = (e && e.parameter) || {};
transport = String(eventParams.transport || 'json');

request = parseRequest_(e);

if (request.transport) {
transport = String(request.transport);
}

const response = executeApi_(request);

if (transport === 'bridge') {
return createBridgeResponse_(response);
}

return jsonOutput_(response);

} catch (error) {
logError_('doPost', error);

const response = errorResponse_(error);

if (transport === 'bridge') {
try {
return createBridgeResponse_(response);
} catch (bridgeError) {
logError_('bridgeError', bridgeError);
}
}

return jsonOutput_(response);
}
}

/**
• Supports both:
A. application/json
C. Form POST containing a field named payload
*/
function parseRequest_(e) {
if (!e) {
fail_('INVALID_REQUEST', 'ไม่พบข้อมูลคำขอ');
}

const params = e.parameter || {};

if (params.payload) {
try {
const parsed = JSON.parse(String(params.payload));

if (!parsed || typeof parsed !== 'object') {
fail_('INVALID_REQUEST', 'รูปแบบข้อมูลไม่ถูกต้อง');
}

if (params.transport) {
parsed.transport = String(params.transport);
}

return parsed;

} catch (error) {
if (error && error.code) {
throw error;
}

fail_('INVALID_JSON', 'ไม่สามารถอ่านข้อมูล JSON ได้');
}
}

if (e.postData && e.postData.contents) {
const contentType = String(e.postData.type || '');

if (contentType.indexOf('application/json') >= 0) {
try {
const parsed = JSON.parse(e.postData.contents);

if (params.transport) {
parsed.transport = String(params.transport);
}

return parsed;

} catch (error) {
fail_('INVALID_JSON', 'ข้อมูล JSON ไม่ถูกต้อง');
}
}
}

const result = {};

Object.keys(params).forEach(function (key) {
if (key !== 'transport') {
result[key] = params[key];
}
});

result.transport = params.transport || 'json';

return result;
}

/**
• Iframe bridge:
• The frontend sends a POST form to Apps Script.
• Apps Script returns an HTML page that posts the result
• back to the approved frontend origin using postMessage.
• The frontend must verify:
• event.origin
• event.source
• event.data.type
• The browser still needs an HTTPS deployment.
*/
function createBridgeResponse_(response) {
const origin = getAppOrigin_();

const safeJson = JSON.stringify(response)
.replace(/</g, '\\u003c')
.replace(/\u2028/g, '\\u2028')
.replace(/\u2029/g, '\\u2029');

const safeOrigin = JSON.stringify(origin);

const html = [
'<!DOCTYPE html>',
'<html>',
'<head>',
'<meta charset="utf-8">',
'<meta name="viewport" content="width=device-width,initial-scale=1">',
'<title>FINORA API</title>',
'</head>',
'<body>',
'<script>',
'(function(){',
'var response = ' + safeJson + ';',
'var allowedOrigin = ' + safeOrigin + ';',
'try {',
'window.top.postMessage({',
'type:"FINORA_API_RESPONSE",',
'response:response',
'}, allowedOrigin);',
'} catch (e) {',
'document.body.textContent = "FINORA response error";',
'}',
'})();',
'</script>',
'</body>',
'</html>'
 ].join('');

return HtmlService
.createHtmlOutput(html)
.setTitle('FINORA API')
.setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

/* =========================================================
2. API DISPATCHER
========================================================= */

function executeApi_(request) {
const requestId = createId_('REQ');

try {
if (!request || typeof request !== 'object') {
fail_('INVALID_REQUEST', 'ข้อมูลคำขอไม่ถูกต้อง');
}

const action = String(request.action || '');

if (!action) {
fail_('ACTION_REQUIRED', 'กรุณาระบุ action');
}

if (action !== 'ping' && action !== 'getPublicConfig') {
ensureSchema_();
}

const result = dispatchAction_(action, request);

return {
ok: true,
requestId: requestId,
data: result === undefined ? null : result
};

} catch (error) {
logError_('executeApi_' + request.action, error);

const response = errorResponse_(error);

response.requestId = requestId;

return response;
}
}

function dispatchAction_(action, request) {
switch (action) {

/* Public */

case 'ping':
return {
app: getProperty_('APP_NAME', 'FINORA'),
version: FINORA_VERSION,
timestamp: nowIso_()
};

case 'getPublicConfig':
return getPublicConfig_();

case 'getPublicAnnouncements':
return getPublicAnnouncements_(request.zone || 'AUTH');

/* Authentication */

case 'startEmailVerification':
return startEmailVerification_(request);

case 'verifyEmail':
return verifyEmail_(request);

case 'signup':
return signup_(request);

case 'login':
return login_(request);

case 'logout':
return logout_(request);

case 'forgotPassword':
return forgotPassword_(request);

case 'resetPassword':
return resetPassword_(request);

case 'getMe':
return getMe_(request);

case 'changePassword':
return changePassword_(request);

case 'updateProfile':
return updateProfile_(request);

/* Customer loans */

case 'listProducts':
return listProducts_();

case 'createLoanApplication':
return createLoanApplication_(request);

case 'listMyLoanApplications':
return listMyLoanApplications_(request);

case 'customerAcceptLoanOffer':
return customerAcceptLoanOffer_(request);

case 'getMyLoanAccounts':
return getMyLoanAccounts_(request);

case 'getMyRepayments':
return getMyRepayments_(request);

case 'getMyTransactions':
return getMyTransactions_(request);

case 'createRepaymentQR':
return createRepaymentQR_(request);

case 'verifyRepaymentSlip':
return verifyRepaymentSlip_(request);

/* Notifications */

case 'getMyNotifications':
return getMyNotifications_(request);

case 'markNotificationRead':
return markNotificationRead_(request);

/* Customer support */

case 'createSupportTicket':
return createSupportTicket_(request);

/* Administration */

case 'adminGetDashboardStats':
return adminGetDashboardStats_(request);

case 'adminListUsers':
return adminListUsers_(request);

case 'adminGetUser':
return adminGetUser_(request);

case 'adminListApplications':
return adminListApplications_(request);

case 'adminUpdateApplicationStatus':
return adminUpdateApplicationStatus_(request);

case 'adminListProducts':
return adminListProducts_(request);

case 'adminSaveProduct':
return adminSaveProduct_(request);

case 'adminRecordContractSignature':
return adminRecordContractSignature_(request);

case 'adminActivateLoan':
return adminActivateLoan_(request);

case 'adminListRepayments':
return adminListRepayments_(request);

case 'adminListTransactions':
return adminListTransactions_(request);

case 'adminListAnnouncements':
return adminListAnnouncements_(request);

case 'adminSaveAnnouncement':
return adminSaveAnnouncement_(request);

case 'adminDeleteAnnouncement':
return adminDeleteAnnouncement_(request);

case 'adminUploadImage':
return adminUploadImage_(request);

case 'adminListSupportTickets':
return adminListSupportTickets_(request);

case 'adminUpdateSupportTicket':
return adminUpdateSupportTicket_(request);

default:
fail_('UNKNOWN_ACTION', 'ไม่พบฟังก์ชันที่ร้องขอ');
}
}

/* =========================================================
3. SCRIPT PROPERTIES
========================================================= */

function getProperty_(name, defaultValue) {
const value = PropertiesService
.getScriptProperties()
.getProperty(name);

if (value === null || value === undefined || value === '') {
return defaultValue;
}

return value;
}

function getBooleanProperty_(name, defaultValue) {
const value = getProperty_(name, null);

if (value === null) {
return Boolean(defaultValue);
}

return String(value).toLowerCase() === 'true';
}

function getNumberProperty_(name, defaultValue) {
const value = Number(getProperty_(name, defaultValue));

return Number.isFinite(value) ? value : defaultValue;
}

function getDataHashSecret_() {
const secret = String(getProperty_('DATA_HASH_SECRET', ''));

if (secret.length < 32) {
fail_(
'SERVER_CONFIGURATION_ERROR',
'กรุณาตั้งค่า DATA_HASH_SECRET ให้มีความยาวอย่างน้อย 32 ตัวอักษร'
);
}

return secret;
}

function getAppUrl_() {
const url = String(getProperty_('APP_URL', '')).trim();

if (!/^https:\/\/[^ ]+$/i.test(url)) {
fail_(
'SERVER_CONFIGURATION_ERROR',
'กรุณาตั้งค่า APP_URL เป็น URL HTTPS ของเว็บไซต์ FINORA'
);
}

return url.replace(/\/+$/, '');
}

function getAppOrigin_() {
const url = getAppUrl_();
const match = url.match(/^(https:\/\/[^/]+)/i);

if (!match) {
fail_('SERVER_CONFIGURATION_ERROR', 'ไม่สามารถอ่าน origin ของเว็บได้');
}

return match[1];
}

function getAdminEmails_() {
return String(getProperty_('ADMIN_EMAILS', ''))
.split(',')
.map(function (email) {
return normalizeEmail_(email);
})
.filter(function (email) {
return email.length > 0;
});
}

/* =========================================================
4. GOOGLE SHEETS — AUTOMATIC SCHEMA CREATION
========================================================= */

/**
• Run this function manually once after configuring
• SPREADSHEET_ID in Script Properties.
• This function:
◦ Creates missing sheets.
◦ Creates missing headers.
◦ Adds missing required columns.
◦ Preserves existing values and columns.
*/
function setupFinoraDatabase() {
const spreadsheet = getSpreadsheet_();

Object.keys(FINORA_TABLES).forEach(function (tableName) {
ensureTable_(spreadsheet, tableName);
});

return {
ok: true,
spreadsheetId: spreadsheet.getId(),
spreadsheetName: spreadsheet.getName(),
tables: Object.keys(FINORA_TABLES),
version: FINORA_VERSION
};
}

function getSpreadsheet_() {
const spreadsheetId = String(
getProperty_('SPREADSHEET_ID', '')
).trim();

if (spreadsheetId) {
return SpreadsheetApp.openById(spreadsheetId);
}

const activeSpreadsheet = SpreadsheetApp.getActiveSpreadsheet();

if (activeSpreadsheet) {
return activeSpreadsheet;
}

fail_(
'SERVER_CONFIGURATION_ERROR',
'ไม่พบ SPREADSHEET_ID ใน Script Properties'
);
}

function ensureSchema_() {
const cache = CacheService.getScriptCache();
const cacheKey = 'FINORA_SCHEMA_' + FINORA_VERSION;

if (cache.get(cacheKey) === 'READY') {
return;
}

const spreadsheet = getSpreadsheet_();

Object.keys(FINORA_TABLES).forEach(function (tableName) {
ensureTable_(spreadsheet, tableName);
});

cache.put(cacheKey, 'READY', 1800);
}

function ensureTable_(spreadsheet, tableName) {
const expectedHeaders = FINORA_TABLES[tableName];

if (!expectedHeaders) {
fail_('INVALID_TABLE', 'ไม่พบโครงสร้างตารางที่ต้องการ');
}

let sheet = spreadsheet.getSheetByName(tableName);

if (!sheet) {
sheet = spreadsheet.insertSheet(tableName);
}

const lastColumn = sheet.getLastColumn();

if (lastColumn === 0) {
sheet
.getRange(1, 1, 1, expectedHeaders.length)
.setValues([expectedHeaders]);

sheet.setFrozenRows(1);

return sheet;
}

const existingHeaders = sheet
.getRange(1, 1, 1, lastColumn)
.getValues()[0]
.map(function (value) {
return String(value || '').trim();
});

const isBlankHeader = existingHeaders.every(function (value) {
return value === '';
});

if (isBlankHeader) {
sheet
.getRange(1, 1, 1, expectedHeaders.length)
.setValues([expectedHeaders]);

sheet.setFrozenRows(1);

return sheet;
}

const missingHeaders = expectedHeaders.filter(function (header) {
return existingHeaders.indexOf(header) === -1;
});

if (missingHeaders.length > 0) {
const insertColumn = sheet.getLastColumn() + 1;

sheet
.getRange(1, insertColumn, 1, missingHeaders.length)
.setValues([missingHeaders]);
}

sheet.setFrozenRows(1);

return sheet;
}

function getSheet_(tableName) {
if (!FINORA_TABLES[tableName]) {
fail_('INVALID_TABLE', 'ไม่พบตารางที่ร้องขอ');
}

const spreadsheet = getSpreadsheet_();

let sheet = spreadsheet.getSheetByName(tableName);

if (!sheet) {
sheet = ensureTable_(spreadsheet, tableName);
}

return sheet;
}

function getHeaders_(sheet) {
const lastColumn = sheet.getLastColumn();

if (lastColumn < 1) {
return [];
}

return sheet
.getRange(1, 1, 1, lastColumn)
.getValues()[0]
.map(function (value) {
return String(value || '').trim();
});
}

function getRecords_(tableName) {
const sheet = getSheet_(tableName);

const lastRow = sheet.getLastRow();
const headers = getHeaders_(sheet);

if (lastRow < 2 || headers.length === 0) {
return [];
}

const rows = sheet
.getRange(2, 1, lastRow - 1, headers.length)
.getValues();

return rows.map(function (row, index) {
const record = {
__rowNum: index + 2
};

headers.forEach(function (header, columnIndex) {
if (header) {
record[header] = serializeValue_(row[columnIndex]);
}
});

return record;
}).filter(function (record) {
return Object.keys(record).some(function (key) {
return key !== '__rowNum' &&
record[key] !== '' &&
record[key] !== null &&
record[key] !== undefined;
});
});
}

function appendRecord_(tableName, record) {
appendRecords_(tableName, [record]);
}

function appendRecords_(tableName, records) {
if (!records || records.length === 0) {
return;
}

const sheet = getSheet_(tableName);
const headers = getHeaders_(sheet);

const values = records.map(function (record) {
return headers.map(function (header) {
if (Object.prototype.hasOwnProperty.call(record, header)) {
return safeCellValue_(record[header]);
}

return '';
});
});

sheet
.getRange(
sheet.getLastRow() + 1,
1,
values.length,
headers.length
)
.setValues(values);
}

function updateRecordById_(tableName, idColumn, idValue, patch) {
const sheet = getSheet_(tableName);
const headers = getHeaders_(sheet);
const records = getRecords_(tableName);

const record = records.find(function (item) {
return String(item[idColumn]) === String(idValue);
});

if (!record) {
return null;
}

const rowNumber = record.__rowNum;

Object.keys(patch).forEach(function (key) {
const columnIndex = headers.indexOf(key);

if (columnIndex < 0) {
return;
}

sheet
.getRange(rowNumber, columnIndex + 1)
.setValue(safeCellValue_(patch[key]));
});

return Object.assign({}, record, patch);
}

function deleteRecordsWhere_(tableName, predicate) {
const sheet = getSheet_(tableName);
const records = getRecords_(tableName);

const rowNumbers = records
.filter(predicate)
.map(function (record) {
return record.__rowNum;
})
.sort(function (a, b) {
return b - a;
});

rowNumbers.forEach(function (rowNumber) {
sheet.deleteRow(rowNumber);
});

return rowNumbers.length;
}

function safeCellValue_(value) {
if (value === null || value === undefined) {
return '';
}

if (typeof value === 'string') {
/*
* Prevent user-controlled strings from being interpreted
* as spreadsheet formulas.
*/
if (/^[\s][=+@]/.test(value)) {
return "'" + value;
}
}

return value;
}

function serializeValue_(value) {
if (value instanceof Date) {
return value.toISOString();
}

if (value === null || value === undefined) {
return '';
}

return value;
}

function withScriptLock_(callback) {
const lock = LockService.getScriptLock();

lock.waitLock(30000);

try {
return callback();

} finally {
lock.releaseLock();
}
}

/* =========================================================
5. GENERAL UTILITIES
========================================================= */

function createId_(prefix) {
return String(prefix || 'ID') +
'_' +
Utilities.getUuid().replace(/-/g, '').toUpperCase();
}

function createToken_() {
return [
Utilities.getUuid().replace(/-/g, ''),
Utilities.getUuid().replace(/-/g, ''),
Utilities.getUuid().replace(/-/g, '')
 ].join('');
}

function nowIso_() {
return new Date().toISOString();
}

function addSeconds_(dateValue, seconds) {
return new Date(
new Date(dateValue).getTime() +
Number(seconds) * 1000
).toISOString();
}

function normalizeEmail_(email) {
return String(email || '').trim().toLowerCase();
}

function normalizePhone_(phone) {
return String(phone || '').replace(/\D/g, '');
}

function isValidEmail_(email) {
const value = normalizeEmail_(email);

return value.length <= 254 &&
/^[A-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Z0-9](?:[A-Z0-9-]{0,61}[A-Z0-9])?(?:\.[A-Z0-9](?:[A-Z0-9-]{0,61}[A-Z0-9])?)+$/i
.test(value);
}

function isValidPhone_(phone) {
return /^0[0-9]{9}$/.test(normalizePhone_(phone));
}

function validThaiNationalId_(value) {
const id = String(value || '').replace(/\D/g, '');

if (!/^[0-9]{13}$/.test(id)) {
return false;
}

let sum = 0;

for (let i = 0; i < 12; i++) {
sum += Number(id.charAt(i)) * (13 - i);
}

const checkDigit = (11 - (sum % 11)) % 10;

return checkDigit === Number(id.charAt(12));
}

function getAge_(dateString) {
if (!/^\d{4}-\d{2}-\d{2}$/.test(String(dateString || ''))) {
return -1;
}

const birthDate = new Date(dateString + 'T00:00:00Z');

if (isNaN(birthDate.getTime())) {
return -1;
}

if (birthDate.toISOString().slice(0, 10) !== dateString) {
return -1;
}

const today = new Date();

let age = today.getUTCFullYear() - birthDate.getUTCFullYear();

const currentMonth = today.getUTCMonth();
const birthMonth = birthDate.getUTCMonth();

if (
currentMonth < birthMonth ||
(
currentMonth === birthMonth &&
today.getUTCDate() < birthDate.getUTCDate()
)
) {
age--;
}

return age;
}

function roundMoney_(value) {
return Math.round((Number(value) + Number.EPSILON) * 100) / 100;
}

function positiveNumber_(value, fieldName) {
const number = Number(value);

if (!Number.isFinite(number) || number <= 0) {
fail_(
'INVALID_' + String(fieldName || 'NUMBER').toUpperCase(),
'กรุณาระบุจำนวนเงินให้ถูกต้อง'
);
}

return roundMoney_(number);
}

function cleanString_(value, maxLength) {
return String(value === null || value === undefined ? '' : value)
.trim()
.slice(0, maxLength || 500);
}

function parseBoolean_(value) {
return value === true || String(value).toLowerCase() === 'true';
}

function htmlEscape_(value) {
  return String(value === null || value === undefined ? '' : value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function buildAppUrl_(params) {
const baseUrl = getAppUrl_();

const query = Object.keys(params)
.map(function (key) {
return encodeURIComponent(key) +
'=' +
encodeURIComponent(String(params[key]));
})
.join('&');

return baseUrl +
(baseUrl.indexOf('?') >= 0 ? '&' : '?') +
query;
}

function jsonOutput_(object) {
return ContentService
.createTextOutput(JSON.stringify(object))
.setMimeType(ContentService.MimeType.JSON);
}

function fail_(code, message) {
const error = new Error(String(message || 'เกิดข้อผิดพลาด'));

error.code = String(code || 'UNKNOWN_ERROR');

throw error;
}

function errorResponse_(error) {
const code = error && error.code
? String(error.code)
: 'INTERNAL_ERROR';

const message = error && error.code
? String(error.message || 'เกิดข้อผิดพลาด')
: 'ระบบเกิดข้อผิดพลาด กรุณาลองใหม่ภายหลัง';

return {
ok: false,
error: {
code: code,
message: message
}
};
}

function logError_(context, error) {
console.error(
'[FINORA][' + context + '] ' +
String(error && error.stack ? error.stack : error)
);
}

/* =========================================================
6. CRYPTOGRAPHIC HELPERS
========================================================= */

/**
• HMAC-SHA256 with a server-side secret.
• Never return DATA_HASH_SECRET to the frontend.
*/
function hmacHex_(value, optionalSecret) {
const secret = optionalSecret || getDataHashSecret_();

const signature = Utilities.computeHmacSha256Signature(
String(value),
secret,
Utilities.Charset.UTF_8
);

return bytesToHex_(signature);
}

function bytesToHex_(bytes) {
return bytes.map(function (byteValue) {
return ('0' + ((byteValue & 0xff).toString(16))).slice(-2);
}).join('');
}

function hexToSignedBytes_(hex) {
const result = [];

for (let i = 0; i < hex.length; i += 2) {
let value = parseInt(hex.substring(i, i + 2), 16);

if (value > 127) {
value -= 256;
}

result.push(value);
}

return result;
}

/**
• PBKDF2-HMAC-SHA256.
• Each account stores its salt and iteration count so that
• hashing parameters can be upgraded in the future.
*/
function passwordHash_(password, saltHex, iterations) {
const salt = hexToSignedBytes_(String(saltHex));

const count = Number(iterations || FINORA_PASSWORD_ITERATIONS);

if (
!Number.isInteger(count) ||
count < 10000 ||
count > 200000
) {
fail_(
'INVALID_PASSWORD_HASH_CONFIGURATION',
'พารามิเตอร์แฮชรหัสผ่านไม่ถูกต้อง'
);
}

/*
• PBKDF2 block index 1:
• INT_32_BE(1) = 00 00 00 01
*/
const block = salt.concat([0, 0, 0, 1]);

let u = Utilities.computeHmacSha256Signature(
block,
String(password),
Utilities.Charset.UTF_8
);

let result = u.slice();

for (let i = 1; i < count; i++) {
u = Utilities.computeHmacSha256Signature(
u,
String(password),
Utilities.Charset.UTF_8
);

for (let j = 0; j < result.length; j++) {
result[j] = result[j] ^ u[j];
}
}

return bytesToHex_(result);
}

function constantTimeEqual_(a, b) {
const first = String(a || '');
const second = String(b || '');

if (first.length !== second.length) {
return false;
}

let difference = 0;

for (let i = 0; i < first.length; i++) {
difference |= first.charCodeAt(i) ^ second.charCodeAt(i);
}

return difference === 0;
}

function validatePassword_(password) {
const value = String(password || '');

if (value.length < 10 || value.length > 128) {
fail_(
'WEAK_PASSWORD',
'รหัสผ่านต้องมีความยาว 10–128 ตัวอักษร'
);
}

if (!/[a-z]/.test(value)) {
fail_('WEAK_PASSWORD', 'รหัสผ่านต้องมีตัวอักษรภาษาอังกฤษพิมพ์เล็ก');
}

if (!/[A-Z]/.test(value)) {
fail_('WEAK_PASSWORD', 'รหัสผ่านต้องมีตัวอักษรภาษาอังกฤษพิมพ์ใหญ่');
}

if (!/[0-9]/.test(value)) {
fail_('WEAK_PASSWORD', 'รหัสผ่านต้องมีตัวเลขอย่างน้อยหนึ่งตัว');
}

if (!/[^A-Za-z0-9]/.test(value)) {
fail_('WEAK_PASSWORD', 'รหัสผ่านต้องมีอักขระพิเศษอย่างน้อยหนึ่งตัว');
}
}

/* =========================================================
7. PUBLIC CONFIGURATION
========================================================= */

function getPublicConfig_() {
return {
appName: getProperty_('APP_NAME', 'FINORA'),
minAge: getNumberProperty_('MIN_AGE', 20),
termsVersion: getProperty_('TERMS_VERSION', ''),
privacyVersion: getProperty_('PRIVACY_VERSION', ''),
version: FINORA_VERSION
};
}

/* =========================================================
8. EMAIL TEMPLATE
========================================================= */

function emailLayout_(title, messageHtml, buttonText, buttonUrl) {
const name = htmlEscape_(
getProperty_('APP_NAME', 'FINORA')
);

let button = '';

if (buttonText && buttonUrl) {
button = [
'<div style="text-align:center;margin:28px 0;">',
'<a href="' + htmlEscape_(buttonUrl) + '"',
' style="display:inline-block;padding:14px 25px;',
'background:#101B48;color:#ffffff;text-decoration:none;',
'border-radius:12px;font-weight:700;">',
htmlEscape_(buttonText),
'</a>',
'</div>'
 ].join('');
}

return [
'<!doctype html>',
'<html lang="th">',
'<head>',
'<meta charset="utf-8">',
'<meta name="viewport" content="width=device-width,initial-scale=1">',
'</head>',
'<body style="margin:0;padding:0;background:#f4f6fa;',
'font-family:Arial,Tahoma,sans-serif;color:#202944;">',

'<div style="max-width:600px;margin:30px auto;padding:20px;">',

'<div style="background:#ffffff;border:1px solid #e5e9f2;',
'border-radius:20px;overflow:hidden;">',

'<div style="background:#101B48;padding:28px 24px;text-align:center;">',

'<div style="font-size:29px;font-weight:800;',
'letter-spacing:1px;color:#ffffff;">',
name,
'</div>',

'<div style="font-size:13px;color:#cbd5f5;margin-top:7px;">',
'Digital Lending Platform',
'</div>',

'</div>',

'<div style="padding:30px 25px;">',

'<h2 style="font-size:22px;margin:0 0 18px;color:#101B48;">',
htmlEscape_(title),
'</h2>',

'<div style="font-size:15px;line-height:1.85;color:#3e465c;">',
messageHtml,
'</div>',

button,

'<div style="font-size:12px;line-height:1.7;',
'color:#737d92;overflow-wrap:anywhere;">',
'หากปุ่มไม่ทำงาน กรุณาคัดลอกลิงก์จากอีเมลนี้ไปเปิดในเบราว์เซอร์',
'<br>หากคุณไม่ได้เป็นผู้ดำเนินการ กรุณาเพิกเฉยต่ออีเมลนี้',
'</div>',

'</div>',

'</div>',

'<div style="text-align:center;color:#8b93a5;',
'font-size:12px;line-height:1.8;padding:18px;">',

'อีเมลนี้ส่งโดยระบบอัตโนมัติของ ' + name,

'<br>โปรดอย่าตอบกลับอีเมลนี้',

'</div>',

'</div>',

'</body>',
'</html>'
].join('');
}

function sendHtmlEmail_(to, subject, htmlBody, plainBody) {
const recipient = normalizeEmail_(to);

if (!isValidEmail_(recipient)) {
fail_('INVALID_EMAIL', 'ที่อยู่อีเมลไม่ถูกต้อง');
}

MailApp.sendEmail({
to: recipient,
subject: String(subject || ''),
body: String(plainBody || 'กรุณาเปิดอีเมลด้วยโปรแกรมที่รองรับ HTML'),
htmlBody: String(htmlBody || ''),
name: getProperty_('APP_NAME', 'FINORA')
});
}

/* =========================================================
9. EMAIL VERIFICATION
========================================================= */

function startEmailVerification_(request) {
const email = normalizeEmail_(request.email);

if (!isValidEmail_(email)) {
fail_('INVALID_EMAIL', 'กรุณากรอกอีเมลให้ถูกต้อง');
}

const cooldownKey = 'VERIFY_' + hmacHex_(email).substring(0, 40);
const cache = CacheService.getScriptCache();

if (cache.get(cooldownKey)) {
fail_(
'RATE_LIMITED',
'กรุณารอก่อนส่งลิงก์ยืนยันอีเมลอีกครั้ง'
);
}

if (findUserByEmail_(email)) {
fail_(
'EMAIL_ALREADY_REGISTERED',
'อีเมลนี้มีบัญชีอยู่แล้ว กรุณาเข้าสู่ระบบ'
);
}

const token = createToken_();

const ttl = getNumberProperty_('VERIFY_TOKEN_TTL_SECONDS', 1800);

const verificationId = createId_('VERIFY');

const expiresAt = addSeconds_(nowIso_(), ttl);

withScriptLock_(function () {
appendRecord_('email_verifications', {
verificationId: verificationId,
email: email,
tokenHash: hmacHex_(token),
purpose: 'SIGNUP',
createdAt: nowIso_(),
expiresAt: expiresAt,
usedAt: '',
verifiedAt: ''
});
});

cache.put(cooldownKey, '1', 60);

const verificationUrl = buildAppUrl_({
mode: 'verify-email',
token: token
});

const body = [
'<p>เรียน ผู้สมัครสมาชิก FINORA</p>',
'<p>กรุณายืนยันที่อยู่อีเมลของท่านเพื่อดำเนินการสมัครสมาชิก</p>',
'<p>ลิงก์นี้จะหมดอายุภายในเวลาที่กำหนด</p>',
'<p><strong>หากท่านไม่ได้เป็นผู้ร้องขอ กรุณาไม่กดลิงก์นี้</strong></p>'
 ].join('');

try {
sendHtmlEmail_(
email,
'FINORA — Confirm your email address',
emailLayout_(
'Confirm your email address',
body,
'Confirm email address',
verificationUrl
),
'กรุณาเปิดลิงก์นี้เพื่อยืนยันอีเมล: ' + verificationUrl
);

} catch (error) {
logError_('sendVerificationEmail', error);

fail_(
'EMAIL_SEND_FAILED',
'ไม่สามารถส่งอีเมลได้ กรุณาตรวจสอบการอนุญาตส่งอีเมลของ Apps Script'
);
}

return {
sent: true,
email: email,
expiresAt: expiresAt,
message: 'ส่งลิงก์ยืนยันอีเมลแล้ว'
};
}

function verifyEmail_(request) {
const token = String(request.token || '').trim();

if (!token || token.length < 40) {
fail_('INVALID_TOKEN', 'ลิงก์ยืนยันอีเมลไม่ถูกต้อง');
}

const tokenHash = hmacHex_(token);

return withScriptLock_(function () {
const verification = getRecords_('email_verifications').find(
function (record) {
return record.tokenHash === tokenHash &&
record.purpose === 'SIGNUP';
}
);

if (!verification) {
fail_(
'INVALID_TOKEN',
'ไม่พบลิงก์ยืนยันอีเมลนี้ หรือมีการใช้ลิงก์ไปแล้ว'
);
}

if (verification.usedAt) {
fail_('TOKEN_ALREADY_USED', 'ลิงก์นี้ถูกใช้งานแล้ว');
}

if (new Date(verification.expiresAt).getTime() < Date.now()) {
fail_('TOKEN_EXPIRED', 'ลิงก์ยืนยันอีเมลหมดอายุแล้ว');
}

const email = normalizeEmail_(verification.email);
const verifiedAt = nowIso_();

updateRecordById_(
'email_verifications',
'verificationId',
verification.verificationId,
{
usedAt: verifiedAt,
verifiedAt: verifiedAt
}
);

const existing = getRecords_('verified_emails').find(
function (record) {
return normalizeEmail_(record.email) === email;
}
);

const verifiedEmail = {
email: email,
verifiedAt: verifiedAt,
expiresAt: addSeconds_(verifiedAt, 86400),
consumedAt: ''
};

if (existing) {
updateRecordById_(
'verified_emails',
'email',
email,
verifiedEmail
);

} else {
appendRecord_('verified_emails', verifiedEmail);
}

return {
verified: true,
email: email,
verifiedAt: verifiedAt,
message: 'ยืนยันอีเมลสำเร็จ กรุณากลับไปหน้าลงทะเบียน'
};
});
}

/* =========================================================
10. USER LOOKUP
========================================================= */

function findUserByEmail_(email) {
const normalized = normalizeEmail_(email);

return getRecords_('users').find(function (user) {
return normalizeEmail_(user.email) === normalized;
}) || null;
}

function findUserById_(userId) {
return getRecords_('users').find(function (user) {
return String(user.userId) === String(userId);
}) || null;
}

function findUserByIdentifier_(identifier) {
const value = String(identifier || '').trim();

if (!value) {
return null;
}

const normalizedEmail = normalizeEmail_(value);
const normalizedPhone = normalizePhone_(value);
const normalizedUsername = value.toUpperCase();

return getRecords_('users').find(function (user) {
return normalizeEmail_(user.email) === normalizedEmail ||
normalizePhone_(user.phone) === normalizedPhone ||
String(user.username || '').toUpperCase() === normalizedUsername;
}) || null;
}

function safeUser_(user) {
if (!user) {
return null;
}

const adminEmails = getAdminEmails_();
const isAdmin = adminEmails.indexOf(
normalizeEmail_(user.email)
) !== -1;

return {
userId: user.userId,
username: user.username,
prefix: user.prefix,
fullName: user.fullName,
birthDate: user.birthDate,
phone: user.phone,
email: user.email,
emailVerifiedAt: user.emailVerifiedAt,
status: user.status,
role: isAdmin ? 'ADMIN' : 'CUSTOMER',
createdAt: user.createdAt,
updatedAt: user.updatedAt
};
}

function createUniqueUsername_() {
for (let i = 0; i < 10; i++) {
const suffix = Utilities.getUuid()
.replace(/-/g, '')
.substring(0, 8)
.toUpperCase();

const username = 'FIN' + suffix;

const exists = getRecords_('users').some(function (user) {
return String(user.username) === username;
});

if (!exists) {
return username;
}
}

fail_('USERNAME_GENERATION_FAILED', 'ไม่สามารถสร้างชื่อผู้ใช้ได้');
}

/* =========================================================
11. USER REGISTRATION
========================================================= */

function signup_(request) {
const email = normalizeEmail_(request.email);
const phone = normalizePhone_(request.phone);
const prefix = cleanString_(request.prefix, 30);
const fullName = cleanString_(request.fullName, 200);
const birthDate = String(request.birthDate || '');
const nationalId = String(request.nationalId || '').replace(/\D/g, '');
const password = String(request.password || '');

if (!isValidEmail_(email)) {
fail_('INVALID_EMAIL', 'กรุณากรอกอีเมลให้ถูกต้อง');
}

if (!isValidPhone_(phone)) {
fail_('INVALID_PHONE', 'หมายเลขโทรศัพท์ต้องมี 10 หลัก');
}

const allowedPrefixes = [
'เด็กหญิง',
'เด็กชาย',
'นาย',
'นาง',
'นางสาว'
 ];

if (allowedPrefixes.indexOf(prefix) === -1) {
fail_('INVALID_PREFIX', 'คำนำหน้าไม่ถูกต้อง');
}

if (fullName.length < 2) {
fail_('INVALID_NAME', 'กรุณากรอกชื่อและนามสกุล');
}

const age = getAge_(birthDate);
const minAge = getNumberProperty_('MIN_AGE', 20);

if (age < minAge) {
fail_(
'AGE_RESTRICTION',
'ผู้สมัครต้องมีอายุอย่างน้อย ' + minAge + ' ปี'
);
}

if (!validThaiNationalId_(nationalId)) {
fail_('INVALID_NATIONAL_ID', 'หมายเลขบัตรประชาชนไม่ถูกต้อง');
}

validatePassword_(password);

if (
request.acceptTerms !== true ||
request.acceptPrivacy !== true
) {
fail_(
'CONSENT_REQUIRED',
'กรุณายอมรับข้อกำหนดการใช้บริการและรับทราบประกาศความเป็นส่วนตัว'
);
}

const termsVersion = String(
getProperty_('TERMS_VERSION', '')
);

const privacyVersion = String(
getProperty_('PRIVACY_VERSION', '')
);

if (
String(request.termsVersion || '') !== termsVersion ||
String(request.privacyVersion || '') !== privacyVersion
) {
fail_(
'DOCUMENT_VERSION_MISMATCH',
'ข้อกำหนดหรือประกาศความเป็นส่วนตัวมีการเปลี่ยนแปลง กรุณาตรวจสอบอีกครั้ง'
);
}

const verified = getRecords_('verified_emails').find(
function (item) {
return normalizeEmail_(item.email) === email &&
!item.consumedAt &&
new Date(item.expiresAt).getTime() > Date.now();
}
);

if (!verified) {
fail_(
'EMAIL_NOT_VERIFIED',
'กรุณายืนยันอีเมลก่อนสมัครสมาชิก'
);
}

const nationalIdHash = hmacHex_('NID:' + nationalId);

/*
• Privacy by design:
• Store only a keyed hash and the final four digits here.
• Do not store the raw national ID in the customer sheet.
• A regulated KYC provider may be integrated separately
• if full identity verification is legally required.
*/

const passwordSalt = Utilities.getUuid()
.replace(/-/g, '')
.substring(0, 32);

const passwordIterations = FINORA_PASSWORD_ITERATIONS;

const hashedPassword = passwordHash_(
password,
passwordSalt,
passwordIterations
);

const currentTime = nowIso_();

const createdUser = withScriptLock_(function () {
if (findUserByEmail_(email)) {
fail_('EMAIL_ALREADY_REGISTERED', 'อีเมลนี้มีบัญชีอยู่แล้ว');
}

const phoneExists = getRecords_('users').some(function (user) {
return normalizePhone_(user.phone) === phone;
});

if (phoneExists) {
fail_(
'PHONE_ALREADY_REGISTERED',
'หมายเลขโทรศัพท์นี้มีบัญชีอยู่แล้ว'
);
}

const idExists = getRecords_('users').some(function (user) {
return String(user.nationalIdHash) === nationalIdHash;
});

if (idExists) {
fail_(
'NATIONAL_ID_ALREADY_REGISTERED',
'เลขบัตรประชาชนนี้มีบัญชีแล้ว'
);
}

const username = createUniqueUsername_();
const userId = createId_('USER');

const user = {
userId: userId,
username: username,
prefix: prefix,
fullName: fullName,
birthDate: birthDate,
nationalIdHash: nationalIdHash,
nationalIdLast4: nationalId.substring(9),
phone: phone,
email: email,
passwordSalt: passwordSalt,
passwordHash: hashedPassword,
passwordIterations: passwordIterations,
emailVerifiedAt: verified.verifiedAt,
status: 'ACTIVE',
createdAt: currentTime,
updatedAt: currentTime
};

appendRecord_('users', user);

updateRecordById_(
'verified_emails',
'email',
email,
{
consumedAt: currentTime
}
);

appendRecords_('consents', [
{
consentId: createId_('CONSENT'),
userId: userId,
consentType: 'TERMS',
version: termsVersion,
acceptedAt: currentTime,
source: 'WEB_SIGNUP'
},
{
consentId: createId_('CONSENT'),
userId: userId,
consentType: 'PRIVACY_NOTICE_ACKNOWLEDGEMENT',
version: privacyVersion,
acceptedAt: currentTime,
source: 'WEB_SIGNUP'
}
 ]);

writeAudit_(
userId,
email,
'USER_SIGNUP',
'USER',
userId,
{
username: username
}
);

return user;
});

const session = createSession_(
createdUser,
Boolean(request.rememberMe)
);

return {
user: safeUser_(createdUser),
sessionToken: session.token,
expiresAt: session.expiresAt,
message: 'สมัครสมาชิกสำเร็จ'
};
}

/* =========================================================
12. LOGIN AND SESSION MANAGEMENT
========================================================= */

function createSession_(user, rememberMe) {
const token = createToken_();

const defaultTtl = rememberMe
? getNumberProperty_('REMEMBER_SESSION_TTL_SECONDS', 2592000)
: getNumberProperty_('SESSION_TTL_SECONDS', 7200);

const currentTime = nowIso_();
const expiresAt = addSeconds_(currentTime, defaultTtl);

const session = {
sessionId: createId_('SESSION'),
userId: user.userId,
tokenHash: hmacHex_('SESSION:' + token),
createdAt: currentTime,
expiresAt: expiresAt,
revokedAt: '',
rememberMe: Boolean(rememberMe),
lastUsedAt: currentTime
};

appendRecord_('sessions', session);

return {
token: token,
expiresAt: expiresAt
};
}

function login_(request) {
const identifier = String(
request.identifier || request.usernameOrEmail || ''
).trim();

const password = String(request.password || '');

if (!identifier || !password) {
fail_(
'LOGIN_FIELDS_REQUIRED',
'กรุณากรอกชื่อผู้ใช้หรืออีเมล และรหัสผ่าน'
);
}

const cache = CacheService.getScriptCache();

const attemptKey = 'LOGIN_FAIL_' +
hmacHex_(normalizeEmail_(identifier)).substring(0, 40);

const blocked = Number(cache.get(attemptKey) || 0);

if (blocked >= 8) {
fail_(
'LOGIN_RATE_LIMITED',
'เข้าสู่ระบบไม่สำเร็จหลายครั้ง กรุณารอสักครู่'
);
}

const user = findUserByIdentifier_(identifier);

if (!user) {
cache.put(attemptKey, String(blocked + 1), 900);

fail_(
'INVALID_CREDENTIALS',
'ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง'
);
}

if (user.status !== 'ACTIVE') {
fail_(
'ACCOUNT_NOT_ACTIVE',
'บัญชีนี้ยังไม่พร้อมใช้งาน กรุณาติดต่อเจ้าหน้าที่'
);
}

if (!user.emailVerifiedAt) {
fail_(
'EMAIL_NOT_VERIFIED',
'กรุณายืนยันอีเมลก่อนเข้าสู่ระบบ'
);
}

const calculatedHash = passwordHash_(
password,
user.passwordSalt,
Number(user.passwordIterations || FINORA_PASSWORD_ITERATIONS)
);

if (!constantTimeEqual_(calculatedHash, user.passwordHash)) {
cache.put(attemptKey, String(blocked + 1), 900);

fail_(
'INVALID_CREDENTIALS',
'ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง'
);
}

cache.remove(attemptKey);

const session = createSession_(
user,
Boolean(request.rememberMe)
);

writeAudit_(
user.userId,
user.email,
'USER_LOGIN',
'USER',
user.userId,
{
rememberMe: Boolean(request.rememberMe)
}
);

return {
user: safeUser_(user),
sessionToken: session.token,
expiresAt: session.expiresAt,
rememberMe: Boolean(request.rememberMe)
};
}

function requireCurrentUser_(request) {
const token = String(request.sessionToken || '');

if (!token) {
fail_('AUTH_REQUIRED', 'กรุณาเข้าสู่ระบบก่อน');
}

const tokenHash = hmacHex_('SESSION:' + token);

const session = getRecords_('sessions').find(function (record) {
return record.tokenHash === tokenHash;
});

if (!session || session.revokedAt) {
fail_(
'SESSION_INVALID',
'เซสชันหมดอายุหรือไม่ถูกต้อง กรุณาเข้าสู่ระบบใหม่'
);
}

if (new Date(session.expiresAt).getTime() <= Date.now()) {
fail_(
'SESSION_EXPIRED',
'เซสชันหมดอายุ กรุณาเข้าสู่ระบบใหม่'
);
}

const user = findUserById_(session.userId);

if (!user || user.status !== 'ACTIVE') {
fail_('ACCOUNT_NOT_ACTIVE', 'บัญชีนี้ไม่พร้อมใช้งาน');
}

updateRecordById_(
'sessions',
'sessionId',
session.sessionId,
{
lastUsedAt: nowIso_()
}
);

return {
user: user,
session: session
};
}

function requireAdmin_(request) {
const current = requireCurrentUser_(request);

const adminEmails = getAdminEmails_();

if (
adminEmails.indexOf(
normalizeEmail_(current.user.email)
) === -1
) {
fail_(
'ADMIN_ACCESS_DENIED',
'คุณไม่มีสิทธิ์เข้าถึงระบบผู้ดูแล'
);
}

return current;
}

function logout_(request) {
const token = String(request.sessionToken || '');

if (!token) {
return {
loggedOut: true
};
}

const tokenHash = hmacHex_('SESSION:' + token);

const session = getRecords_('sessions').find(function (record) {
return record.tokenHash === tokenHash &&
!record.revokedAt;
});

if (session) {
updateRecordById_(
'sessions',
'sessionId',
session.sessionId,
{
revokedAt: nowIso_()
}
);

const user = findUserById_(session.userId);

writeAudit_(
session.userId,
user ? user.email : '',
'USER_LOGOUT',
'SESSION',
session.sessionId,
{}
);
}

return {
loggedOut: true
};
}

function getMe_(request) {
const current = requireCurrentUser_(request);

return {
user: safeUser_(current.user)
};
}

function changePassword_(request) {
const current = requireCurrentUser_(request);

const oldPassword = String(request.oldPassword || '');
const newPassword = String(request.newPassword || '');

validatePassword_(newPassword);

const oldHash = passwordHash_(
oldPassword,
current.user.passwordSalt,
Number(current.user.passwordIterations || FINORA_PASSWORD_ITERATIONS)
);

if (!constantTimeEqual_(oldHash, current.user.passwordHash)) {
fail_('CURRENT_PASSWORD_INCORRECT', 'รหัสผ่านเดิมไม่ถูกต้อง');
}

if (oldPassword === newPassword) {
fail_(
'PASSWORD_UNCHANGED',
'รหัสผ่านใหม่ต้องแตกต่างจากรหัสผ่านเดิม'
);
}

const salt = Utilities.getUuid().replace(/-/g, '').substring(0, 32);

const hash = passwordHash_(
newPassword,
salt,
FINORA_PASSWORD_ITERATIONS
);

withScriptLock_(function () {
updateRecordById_(
'users',
'userId',
current.user.userId,
{
passwordSalt: salt,
passwordHash: hash,
passwordIterations: FINORA_PASSWORD_ITERATIONS,
updatedAt: nowIso_()
}
);

getRecords_('sessions')
.filter(function (session) {
return session.userId === current.user.userId &&
!session.revokedAt;
})
.forEach(function (session) {
updateRecordById_(
'sessions',
'sessionId',
session.sessionId,
{
revokedAt: nowIso_()
}
);
});
});

writeAudit_(
current.user.userId,
current.user.email,
'PASSWORD_CHANGED',
'USER',
current.user.userId,
{}
);

return {
changed: true,
message: 'เปลี่ยนรหัสผ่านสำเร็จ กรุณาเข้าสู่ระบบอีกครั้ง'
};
}

function updateProfile_(request) {
const current = requireCurrentUser_(request);

const patch = {
updatedAt: nowIso_()
};

if (request.prefix !== undefined) {
const prefix = cleanString_(request.prefix, 30);

if (
['เด็กหญิง', 'เด็กชาย', 'นาย', 'นาง', 'นางสาว']
.indexOf(prefix) === -1
) {
fail_('INVALID_PREFIX', 'คำนำหน้าไม่ถูกต้อง');
}

patch.prefix = prefix;
}

if (request.fullName !== undefined) {
const fullName = cleanString_(request.fullName, 200);

if (fullName.length < 2) {
fail_('INVALID_NAME', 'กรุณากรอกชื่อและนามสกุล');
}

patch.fullName = fullName;
}

/*
• Email, phone and national ID changes must go through
• dedicated verification flows.
*/
updateRecordById_(
'users',
'userId',
current.user.userId,
patch
);

writeAudit_(
current.user.userId,
current.user.email,
'PROFILE_UPDATED',
'USER',
current.user.userId,
Object.keys(patch)
);

return {
user: safeUser_(
findUserById_(current.user.userId)
)
};
}

/* =========================================================
13. PASSWORD RESET
========================================================= */

function forgotPassword_(request) {
const email = normalizeEmail_(request.email);

if (!isValidEmail_(email)) {
fail_('INVALID_EMAIL', 'กรุณากรอกอีเมลให้ถูกต้อง');
}

const cache = CacheService.getScriptCache();
const cooldownKey = 'RESET_' + hmacHex_(email).substring(0, 40);

/*
• Always return a generic success response for unknown emails.
• Do not reveal whether an account exists.
*/
if (cache.get(cooldownKey)) {
return {
accepted: true,
message: 'หากอีเมลนี้มีบัญชี ระบบจะส่งลิงก์รีเซ็ตรหัสผ่านให้'
};
}

cache.put(cooldownKey, '1', 60);

const user = findUserByEmail_(email);

if (user && user.status === 'ACTIVE' && user.emailVerifiedAt) {
const token = createToken_();
const currentTime = nowIso_();

const ttl = getNumberProperty_(
'RESET_TOKEN_TTL_SECONDS',
1800
);

appendRecord_('password_resets', {
resetId: createId_('RESET'),
userId: user.userId,
tokenHash: hmacHex_('RESET:' + token),
createdAt: currentTime,
expiresAt: addSeconds_(currentTime, ttl),
usedAt: ''
});

const resetUrl = buildAppUrl_({
mode: 'reset-password',
token: token
});

const body = [
'<p>เราได้รับคำขอเปลี่ยนรหัสผ่านสำหรับบัญชี FINORA ของท่าน</p>',
'<p>กดปุ่มด้านล่างเพื่อกำหนดรหัสผ่านใหม่ ลิงก์นี้จะหมดอายุภายในเวลาที่กำหนด</p>',
'<p>หากท่านไม่ได้ร้องขอ กรุณาเพิกเฉยต่ออีเมลฉบับนี้</p>'
 ].join('');

try {
sendHtmlEmail_(
email,
'FINORA — Reset your password',
emailLayout_(
'Reset your password',
body,
'Reset password',
resetUrl
),
'ลิงก์รีเซ็ตรหัสผ่าน: ' + resetUrl
);

} catch (error) {
logError_('forgotPasswordEmail', error);
}
}

return {
accepted: true,
message: 'หากอีเมลนี้มีบัญชี ระบบจะส่งลิงก์รีเซ็ตรหัสผ่านให้'
};
}

function resetPassword_(request) {
const token = String(request.token || '');
const newPassword = String(request.newPassword || '');

if (!token) {
fail_('INVALID_TOKEN', 'ลิงก์รีเซ็ตรหัสผ่านไม่ถูกต้อง');
}

validatePassword_(newPassword);

const tokenHash = hmacHex_('RESET:' + token);

return withScriptLock_(function () {
const reset = getRecords_('password_resets').find(
function (record) {
return record.tokenHash === tokenHash;
}
);

if (!reset) {
fail_('INVALID_TOKEN', 'ไม่พบลิงก์รีเซ็ตรหัสผ่าน');
}

if (reset.usedAt) {
fail_('TOKEN_ALREADY_USED', 'ลิงก์นี้ถูกใช้ไปแล้ว');
}

if (new Date(reset.expiresAt).getTime() <= Date.now()) {
fail_('TOKEN_EXPIRED', 'ลิงก์รีเซ็ตรหัสผ่านหมดอายุแล้ว');
}

const user = findUserById_(reset.userId);

if (!user || user.status !== 'ACTIVE') {
fail_('ACCOUNT_NOT_ACTIVE', 'บัญชีนี้ไม่พร้อมใช้งาน');
}

const salt = Utilities.getUuid().replace(/-/g, '').substring(0, 32);

const hash = passwordHash_(
newPassword,
salt,
FINORA_PASSWORD_ITERATIONS
);

const currentTime = nowIso_();

updateRecordById_(
'users',
'userId',
user.userId,
{
passwordSalt: salt,
passwordHash: hash,
passwordIterations: FINORA_PASSWORD_ITERATIONS,
updatedAt: currentTime
}
);

updateRecordById_(
'password_resets',
'resetId',
reset.resetId,
{
usedAt: currentTime
}
);

getRecords_('sessions')
.filter(function (session) {
return session.userId === user.userId &&
!session.revokedAt;
})
.forEach(function (session) {
updateRecordById_(
'sessions',
'sessionId',
session.sessionId,
{
revokedAt: currentTime
}
);
});

writeAudit_(
user.userId,
user.email,
'PASSWORD_RESET',
'USER',
user.userId,
{}
);

return {
reset: true,
message: 'เปลี่ยนรหัสผ่านสำเร็จ กรุณาเข้าสู่ระบบ'
};
});
}

/* =========================================================
14. AUDIT LOG AND NOTIFICATIONS
========================================================= */

function writeAudit_(
actorUserId,
actorEmail,
action,
entityType,
entityId,
details
) {
try {
let detailsJson = JSON.stringify(details || {});

if (detailsJson.length > 4000) {
detailsJson = detailsJson.substring(0, 4000);
}

appendRecord_('audit_logs', {
auditId: createId_('AUDIT'),
actorUserId: actorUserId || '',
actorEmail: normalizeEmail_(actorEmail || ''),
action: String(action || ''),
entityType: String(entityType || ''),
entityId: String(entityId || ''),
detailsJson: detailsJson,
createdAt: nowIso_()
});

} catch (error) {
logError_('writeAudit', error);
}
}

function notifyUser_(userId, title, message, type) {
appendRecord_('notifications', {
notificationId: createId_('NOTIFY'),
userId: userId,
title: cleanString_(title, 200),
message: cleanString_(message, 2000),
type: cleanString_(type, 50) || 'INFO',
readAt: '',
createdAt: nowIso_()
});
}

function getMyNotifications_(request) {
const current = requireCurrentUser_(request);

return getRecords_('notifications')
.filter(function (record) {
return record.userId === current.user.userId;
})
.sort(function (a, b) {
return new Date(b.createdAt).getTime() -
new Date(a.createdAt).getTime();
})
.slice(0, 100)
.map(function (record) {
return {
notificationId: record.notificationId,
title: record.title,
message: record.message,
type: record.type,
readAt: record.readAt,
createdAt: record.createdAt
};
});
}

function markNotificationRead_(request) {
const current = requireCurrentUser_(request);
const notificationId = String(request.notificationId || '');

const notification = getRecords_('notifications').find(
function (record) {
return record.notificationId === notificationId &&
record.userId === current.user.userId;
}
);

if (!notification) {
fail_('NOTIFICATION_NOT_FOUND', 'ไม่พบการแจ้งเตือนนี้');
}

updateRecordById_(
'notifications',
'notificationId',
notificationId,
{
readAt: notification.readAt || nowIso_()
}
);

return {
markedRead: true
};
}

/* =========================================================
15. LOAN PRODUCTS
========================================================= */

function publicProduct_(product) {
return {
productId: product.productId,
productName: product.productName,
description: product.description,
minAmount: Number(product.minAmount || 0),
maxAmount: Number(product.maxAmount || 0),
annualInterestRate: Number(product.annualInterestRate || 0),
effectiveAnnualRate: Number(product.effectiveAnnualRate || 0),
interestMethod: product.interestMethod,
feeFlat: Number(product.feeFlat || 0),
minTermMonths: Number(product.minTermMonths || 1),
maxTermMonths: Number(product.maxTermMonths || 1),
active: parseBoolean_(product.active)
};
}

function listProducts_() {
return getRecords_('loan_products')
.filter(function (product) {
return parseBoolean_(product.active) &&
parseBoolean_(product.complianceReviewed);
})
.map(publicProduct_);
}

/* =========================================================
16. LOAN APPLICATIONS — CUSTOMER
========================================================= */

function createLoanApplication_(request) {
const current = requireCurrentUser_(request);
const user = current.user;

const productId = String(request.productId || '');

const requestedAmount = positiveNumber_(
request.requestedAmount,
'requestedAmount'
);

const requestedTermMonths = Number(request.requestedTermMonths);

const monthlyIncome = positiveNumber_(
request.monthlyIncome,
'monthlyIncome'
);

const monthlyExpenses = Math.max(
0,
roundMoney_(Number(request.monthlyExpenses || 0))
);

const existingMonthlyDebt = Math.max(
0,
roundMoney_(Number(request.existingMonthlyDebt || 0))
);

if (
!Number.isInteger(requestedTermMonths) ||
requestedTermMonths < 1
) {
fail_('INVALID_TERM', 'ระยะเวลาสินเชื่อไม่ถูกต้อง');
}

if (
!Number.isFinite(monthlyExpenses) ||
!Number.isFinite(existingMonthlyDebt)
) {
fail_('INVALID_FINANCIAL_DATA', 'ข้อมูลรายรับรายจ่ายไม่ถูกต้อง');
}

const product = getRecords_('loan_products').find(
function (item) {
return item.productId === productId &&
parseBoolean_(item.active) &&
parseBoolean_(item.complianceReviewed);
}
);

if (!product) {
fail_('PRODUCT_NOT_AVAILABLE', 'ไม่พบผลิตภัณฑ์สินเชื่อที่เปิดให้บริการ');
}

if (
requestedAmount < Number(product.minAmount) ||
requestedAmount > Number(product.maxAmount)
) {
fail_('AMOUNT_OUT_OF_RANGE', 'จำนวนเงินอยู่นอกช่วงของผลิตภัณฑ์');
}

if (
requestedTermMonths < Number(product.minTermMonths) ||
requestedTermMonths > Number(product.maxTermMonths)
) {
fail_('TERM_OUT_OF_RANGE', 'ระยะเวลาอยู่นอกเงื่อนไขของผลิตภัณฑ์');
}

const applicationId = createId_('APP');
const currentTime = nowIso_();

const application = {
applicationId: applicationId,
userId: user.userId,
productId: productId,
requestedAmount: requestedAmount,
requestedTermMonths: requestedTermMonths,
purpose: cleanString_(request.purpose, 500),
employmentType: cleanString_(request.employmentType, 100),
monthlyIncome: monthlyIncome,
monthlyExpenses: monthlyExpenses,
existingMonthlyDebt: existingMonthlyDebt,
status: 'SUBMITTED',
decisionReason: '',
approvedAmount: '',
approvedTermMonths: '',
offerAcceptedAt: '',
createdAt: currentTime,
updatedAt: currentTime,
reviewedBy: '',
reviewedAt: '',
disbursedAt: '',
disbursementRef: ''
};

appendRecord_('loan_applications', application);

notifyUser_(
user.userId,
'ได้รับคำขอสินเชื่อแล้ว',
'ระบบได้รับคำขอสินเชื่อเลขที่ ' + applicationId +
' และจะอัปเดตสถานะเมื่อมีความคืบหน้า',
'LOAN_APPLICATION'
);

writeAudit_(
user.userId,
user.email,
'LOAN_APPLICATION_CREATED',
'LOAN_APPLICATION',
applicationId,
{
productId: productId,
requestedAmount: requestedAmount,
requestedTermMonths: requestedTermMonths
}
);

return {
applicationId: applicationId,
status: application.status,
createdAt: currentTime
};
}

function listMyLoanApplications_(request) {
const current = requireCurrentUser_(request);

return getRecords_('loan_applications')
.filter(function (record) {
return record.userId === current.user.userId;
})
.sort(function (a, b) {
return new Date(b.createdAt).getTime() -
new Date(a.createdAt).getTime();
})
.map(function (record) {
return {
applicationId: record.applicationId,
productId: record.productId,
requestedAmount: Number(record.requestedAmount || 0),
requestedTermMonths: Number(record.requestedTermMonths || 0),
status: record.status,
decisionReason: record.decisionReason,
approvedAmount: record.approvedAmount,
approvedTermMonths: record.approvedTermMonths,
offerAcceptedAt: record.offerAcceptedAt,
createdAt: record.createdAt,
updatedAt: record.updatedAt
};
});
}

function customerAcceptLoanOffer_(request) {
const current = requireCurrentUser_(request);

const applicationId = String(request.applicationId || '');

if (request.accept !== true) {
fail_('OFFER_ACCEPTANCE_REQUIRED', 'ยังไม่ได้ยอมรับข้อเสนอสินเชื่อ');
}

return withScriptLock_(function () {
const application = getRecords_('loan_applications').find(
function (item) {
return item.applicationId === applicationId &&
item.userId === current.user.userId;
}
);

if (!application) {
fail_('APPLICATION_NOT_FOUND', 'ไม่พบคำขอสินเชื่อนี้');
}

if (application.status !== 'APPROVED') {
fail_(
'APPLICATION_NOT_APPROVED',
'คำขอสินเชื่อนี้ยังไม่พร้อมรับข้อเสนอ'
);
}

if (application.offerAcceptedAt) {
fail_('OFFER_ALREADY_ACCEPTED', 'ข้อเสนอนี้ได้รับการยอมรับแล้ว');
}

const acceptedAt = nowIso_();

updateRecordById_(
'loan_applications',
'applicationId',
applicationId,
{
offerAcceptedAt: acceptedAt,
updatedAt: acceptedAt
}
);

writeAudit_(
current.user.userId,
current.user.email,
'LOAN_OFFER_ACCEPTED',
'LOAN_APPLICATION',
applicationId,
{
acceptedAt: acceptedAt
}
);

return {
accepted: true,
acceptedAt: acceptedAt,
message: 'บันทึกการยอมรับข้อเสนอแล้ว กรุณารอขั้นตอนทำสัญญา'
};
});
}

/* =========================================================
17. ADMIN — APPLICATION QUEUE
========================================================= */

function adminListApplications_(request) {
const admin = requireAdmin_(request);

const wantedStatus = String(request.status || 'ALL');
const page = Math.max(1, Number(request.page || 1));
const pageSize = Math.min(100, Math.max(1, Number(request.pageSize || 30)));

let records = getRecords_('loan_applications');

if (wantedStatus !== 'ALL') {
records = records.filter(function (record) {
return record.status === wantedStatus;
});
}

records.sort(function (a, b) {
return new Date(b.createdAt).getTime() -
new Date(a.createdAt).getTime();
});

const total = records.length;
const start = (page - 1) * pageSize;

const data = records.slice(start, start + pageSize).map(
function (record) {
const user = findUserById_(record.userId);

return {
applicationId: record.applicationId,
user: user ? safeUser_(user) : null,
productId: record.productId,
requestedAmount: Number(record.requestedAmount || 0),
requestedTermMonths: Number(record.requestedTermMonths || 0),
monthlyIncome: Number(record.monthlyIncome || 0),
monthlyExpenses: Number(record.monthlyExpenses || 0),
existingMonthlyDebt: Number(record.existingMonthlyDebt || 0),
employmentType: record.employmentType,
purpose: record.purpose,
status: record.status,
decisionReason: record.decisionReason,
approvedAmount: record.approvedAmount,
approvedTermMonths: record.approvedTermMonths,
offerAcceptedAt: record.offerAcceptedAt,
createdAt: record.createdAt,
updatedAt: record.updatedAt
};
}
);

writeAudit_(
admin.user.userId,
admin.user.email,
'ADMIN_LIST_APPLICATIONS',
'LOAN_APPLICATION',
'',
{
status: wantedStatus,
page: page
}
);

return {
page: page,
pageSize: pageSize,
total: total,
records: data
};
}

function adminUpdateApplicationStatus_(request) {
const admin = requireAdmin_(request);

const applicationId = String(request.applicationId || '');

const status = String(request.status || '');

const allowedStatuses = [
'UNDER_REVIEW',
'NEED_MORE_INFO',
'APPROVED',
'REJECTED'
 ];

if (allowedStatuses.indexOf(status) === -1) {
fail_('INVALID_APPLICATION_STATUS', 'สถานะคำขอไม่ถูกต้อง');
}

const application = getRecords_('loan_applications').find(
function (record) {
return record.applicationId === applicationId;
}
);

if (!application) {
fail_('APPLICATION_NOT_FOUND', 'ไม่พบคำขอสินเชื่อนี้');
}

if (
application.status === 'DISBURSED' ||
application.status === 'CANCELLED'
) {
fail_(
'APPLICATION_LOCKED',
'คำขอสินเชื่อนี้ไม่สามารถแก้ไขสถานะได้'
);
}

const decisionReason = cleanString_(request.decisionReason, 2000);

if (
(status === 'REJECTED' || status === 'NEED_MORE_INFO') &&
!decisionReason
) {
fail_(
'DECISION_REASON_REQUIRED',
'กรุณาระบุเหตุผลประกอบการดำเนินการ'
);
}

const patch = {
status: status,
decisionReason: decisionReason,
reviewedBy: admin.user.userId,
reviewedAt: nowIso_(),
updatedAt: nowIso_()
};

if (status === 'APPROVED') {
const approvedAmount = positiveNumber_(
request.approvedAmount,
'approvedAmount'
);

const approvedTermMonths = Number(request.approvedTermMonths);

if (!Number.isInteger(approvedTermMonths)) {
fail_('INVALID_TERM', 'ระยะเวลาสินเชื่อที่อนุมัติไม่ถูกต้อง');
}

const product = getRecords_('loan_products').find(
function (record) {
return record.productId === application.productId &&
parseBoolean_(record.active) &&
parseBoolean_(record.complianceReviewed);
}
);

if (!product) {
fail_('PRODUCT_NOT_AVAILABLE', 'ผลิตภัณฑ์สินเชื่อไม่ได้เปิดให้บริการ');
}

if (
approvedAmount < Number(product.minAmount) ||
approvedAmount > Number(product.maxAmount) ||
approvedAmount > Number(application.requestedAmount)
) {
fail_(
'APPROVED_AMOUNT_OUT_OF_RANGE',
'วงเงินที่อนุมัติไม่เป็นไปตามเงื่อนไข'
);
}

if (
approvedTermMonths < Number(product.minTermMonths) ||
approvedTermMonths > Number(product.maxTermMonths) ||
approvedTermMonths > Number(application.requestedTermMonths)
) {
fail_(
'APPROVED_TERM_OUT_OF_RANGE',
'ระยะเวลาที่อนุมัติไม่เป็นไปตามเงื่อนไข'
);
}

patch.approvedAmount = approvedAmount;
patch.approvedTermMonths = approvedTermMonths;
}

withScriptLock_(function () {
updateRecordById_(
'loan_applications',
'applicationId',
applicationId,
patch
);
});

notifyUser_(
application.userId,
'อัปเดตสถานะสินเชื่อ',
'สถานะคำขอสินเชื่อของคุณเปลี่ยนเป็น ' + status,
'LOAN_STATUS'
);

writeAudit_(
admin.user.userId,
admin.user.email,
'ADMIN_UPDATE_APPLICATION',
'LOAN_APPLICATION',
applicationId,
patch
);

return {
applicationId: applicationId,
status: status,
updatedAt: patch.updatedAt
};
}

/* =========================================================
18. ADMIN — USERS AND PRODUCTS
========================================================= */

function adminListUsers_(request) {
const admin = requireAdmin_(request);

const page = Math.max(1, Number(request.page || 1));
const pageSize = Math.min(100, Math.max(1, Number(request.pageSize || 30)));

const search = cleanString_(request.search, 100).toLowerCase();

let users = getRecords_('users');

if (search) {
users = users.filter(function (user) {
return String(user.fullName || '').toLowerCase().indexOf(search) >= 0 ||
String(user.email || '').toLowerCase().indexOf(search) >= 0 ||
String(user.username || '').toLowerCase().indexOf(search) >= 0 ||
String(user.phone || '').indexOf(search) >= 0;
});
}

users.sort(function (a, b) {
return new Date(b.createdAt).getTime() -
new Date(a.createdAt).getTime();
});

const total = users.length;
const start = (page - 1) * pageSize;

writeAudit_(
admin.user.userId,
admin.user.email,
'ADMIN_LIST_USERS',
'USER',
'',
{
page: page,
searchUsed: Boolean(search)
}
);

return {
page: page,
pageSize: pageSize,
total: total,
records: users.slice(start, start + pageSize).map(safeUser_)
};
}

function adminGetUser_(request) {
requireAdmin_(request);

const userId = String(request.userId || '');
const user = findUserById_(userId);

if (!user) {
fail_('USER_NOT_FOUND', 'ไม่พบผู้ใช้');
}

return {
user: safeUser_(user),

applications: getRecords_('loan_applications')
.filter(function (record) {
return record.userId === userId;
})
.map(function (record) {
return {
applicationId: record.applicationId,
productId: record.productId,
requestedAmount: record.requestedAmount,
status: record.status,
createdAt: record.createdAt
};
}),

loanAccounts: getRecords_('loan_accounts')
.filter(function (record) {
return record.userId === userId;
})
.map(function (record) {
return {
loanAccountId: record.loanAccountId,
principalAmount: record.principalAmount,
outstandingPrincipal: record.outstandingPrincipal,
status: record.status
};
})
};
}

function adminListProducts_(request) {
requireAdmin_(request);

return getRecords_('loan_products').map(function (product) {
return {
productId: product.productId,
productName: product.productName,
description: product.description,
minAmount: Number(product.minAmount || 0),
maxAmount: Number(product.maxAmount || 0),
annualInterestRate: Number(product.annualInterestRate || 0),
effectiveAnnualRate: Number(product.effectiveAnnualRate || 0),
interestMethod: product.interestMethod,
feeFlat: Number(product.feeFlat || 0),
minTermMonths: Number(product.minTermMonths || 1),
maxTermMonths: Number(product.maxTermMonths || 1),
complianceReviewed: parseBoolean_(product.complianceReviewed),
active: parseBoolean_(product.active),
createdAt: product.createdAt,
updatedAt: product.updatedAt
};
});
}

function adminSaveProduct_(request) {
const admin = requireAdmin_(request);

const productId = String(request.productId || createId_('PRODUCT'));

const productName = cleanString_(request.productName, 200);
const description = cleanString_(request.description, 2000);

const minAmount = positiveNumber_(request.minAmount, 'minAmount');
const maxAmount = positiveNumber_(request.maxAmount, 'maxAmount');

const annualInterestRate = Number(request.annualInterestRate);
const effectiveAnnualRate = Number(request.effectiveAnnualRate);
const feeFlat = Math.max(0, Number(request.feeFlat || 0));

const minTermMonths = Number(request.minTermMonths);
const maxTermMonths = Number(request.maxTermMonths);

const interestMethod = String(request.interestMethod || '');

if (!productName) {
fail_('PRODUCT_NAME_REQUIRED', 'กรุณาระบุชื่อผลิตภัณฑ์');
}

if (maxAmount < minAmount) {
fail_('INVALID_AMOUNT_RANGE', 'วงเงินสูงสุดต้องไม่น้อยกว่าวงเงินขั้นต่ำ');
}

if (
!Number.isFinite(annualInterestRate) ||
annualInterestRate < 0 ||
annualInterestRate > 100
) {
fail_('INVALID_INTEREST_RATE', 'อัตราดอกเบี้ยไม่ถูกต้อง');
}

if (
!Number.isFinite(effectiveAnnualRate) ||
effectiveAnnualRate < 0 ||
effectiveAnnualRate > 100
) {
fail_('INVALID_EIR', 'อัตราดอกเบี้ยที่แท้จริงไม่ถูกต้อง');
}

if (!Number.isFinite(feeFlat) || feeFlat < 0) {
fail_('INVALID_FEE', 'ค่าธรรมเนียมไม่ถูกต้อง');
}

if (
!Number.isInteger(minTermMonths) ||
!Number.isInteger(maxTermMonths) ||
minTermMonths < 1 ||
maxTermMonths < minTermMonths ||
maxTermMonths > 600
) {
fail_('INVALID_TERM_RANGE', 'ระยะเวลาสินเชื่อไม่ถูกต้อง');
}

if (
['FLAT', 'REDUCING_BALANCE'].indexOf(interestMethod) === -1
) {
fail_('INVALID_INTEREST_METHOD', 'วิธีคำนวณดอกเบี้ยไม่ถูกต้อง');
}

const complianceReviewed = parseBoolean_(
request.complianceReviewed
);

const active = parseBoolean_(request.active);

/*
• This flag is an internal control, not a substitute for
• legal or compliance review outside the application.
*/
if (active && !complianceReviewed) {
fail_(
'COMPLIANCE_REVIEW_REQUIRED',
'ต้องตรวจสอบเงื่อนไขผลิตภัณฑ์ก่อนเปิดใช้งาน'
);
}

const existing = getRecords_('loan_products').find(
function (record) {
return record.productId === productId;
}
);

const currentTime = nowIso_();

const product = {
productId: productId,
productName: productName,
description: description,
minAmount: minAmount,
maxAmount: maxAmount,
annualInterestRate: annualInterestRate,
effectiveAnnualRate: effectiveAnnualRate,
interestMethod: interestMethod,
feeFlat: roundMoney_(feeFlat),
minTermMonths: minTermMonths,
maxTermMonths: maxTermMonths,
complianceReviewed: complianceReviewed,
complianceReviewedBy: complianceReviewed
? admin.user.userId
: '',
complianceReviewedAt: complianceReviewed
? currentTime
: '',
active: active,
createdAt: existing ? existing.createdAt : currentTime,
updatedAt: currentTime
};

withScriptLock_(function () {
if (existing) {
updateRecordById_(
'loan_products',
'productId',
productId,
product
);

} else {
appendRecord_('loan_products', product);
}
});

writeAudit_(
admin.user.userId,
admin.user.email,
'ADMIN_SAVE_PRODUCT',
'LOAN_PRODUCT',
productId,
{
active: active,
complianceReviewed: complianceReviewed
}
);

return publicProduct_(product);
}

/* =========================================================
19. CONTRACT SIGNATURE RECORDING
========================================================= */

/**
• This endpoint records verification of a separately completed
• electronic or paper signature.
• It does NOT itself create a legally valid electronic signature.
• confirmSignatureVerified must only be supplied after the
• actual signature evidence has been verified.
*/
function adminRecordContractSignature_(request) {
const admin = requireAdmin_(request);

const applicationId = String(request.applicationId || '');

const signatureProviderRef = cleanString_(
request.signatureProviderRef,
250
);

const signedDocumentUrl = String(
request.signedDocumentUrl || ''
).trim();

if (request.confirmSignatureVerified !== true) {
fail_(
'SIGNATURE_VERIFICATION_REQUIRED',
'กรุณายืนยันว่าได้ตรวจสอบหลักฐานการลงนามแล้ว'
);
}

if (!signatureProviderRef) {
fail_(
'SIGNATURE_REFERENCE_REQUIRED',
'กรุณาระบุรหัสอ้างอิงหลักฐานการลงนาม'
);
}

if (
signedDocumentUrl &&
!/^https:\/\//i.test(signedDocumentUrl)
) {
fail_(
'INVALID_DOCUMENT_URL',
'ที่อยู่เอกสารต้องเป็น HTTPS'
);
}

const application = getRecords_('loan_applications').find(
function (item) {
return item.applicationId === applicationId;
}
);

if (!application) {
fail_('APPLICATION_NOT_FOUND', 'ไม่พบคำขอสินเชื่อ');
}

if (
application.status !== 'APPROVED' ||
!application.offerAcceptedAt
) {
fail_(
'OFFER_NOT_ACCEPTED',
'ผู้กู้ยังไม่ได้รับและยอมรับข้อเสนอสินเชื่อ'
);
}

const alreadySigned = getRecords_('loan_contracts').some(
function (record) {
return record.applicationId === applicationId &&
record.status === 'SIGNED';
}
);

if (alreadySigned) {
fail_('CONTRACT_ALREADY_SIGNED', 'สัญญานี้มีสถานะลงนามแล้ว');
}

const contract = {
contractId: createId_('CONTRACT'),
applicationId: applicationId,
userId: application.userId,
status: 'SIGNED',
contractVersion: cleanString_(request.contractVersion, 100),
signedDocumentUrl: signedDocumentUrl,
signatureProviderRef: signatureProviderRef,
signedAt: String(request.signedAt || nowIso_()),
verifiedBy: admin.user.userId,
verifiedAt: nowIso_(),
createdAt: nowIso_()
};

appendRecord_('loan_contracts', contract);

writeAudit_(
admin.user.userId,
admin.user.email,
'ADMIN_VERIFY_CONTRACT_SIGNATURE',
'LOAN_CONTRACT',
contract.contractId,
{
applicationId: applicationId,
signatureProviderRef: signatureProviderRef
}
);

return {
contractId: contract.contractId,
status: contract.status,
verifiedAt: contract.verifiedAt
};
}

/* =========================================================
20. REPAYMENT SCHEDULE CALCULATOR
========================================================= */

function addMonthsClamped_(dateValue, months) {
const source = new Date(dateValue);

const year = source.getUTCFullYear();
const month = source.getUTCMonth();
const day = source.getUTCDate();

const targetFirstDay = new Date(
Date.UTC(year, month + months, 1)
);

const targetYear = targetFirstDay.getUTCFullYear();
const targetMonth = targetFirstDay.getUTCMonth();

const lastDay = new Date(
Date.UTC(targetYear, targetMonth + 1, 0)
).getUTCDate();

return new Date(
Date.UTC(
targetYear,
targetMonth,
Math.min(day, lastDay)
)
);
}

function generateSchedule_(
principal,
annualRate,
method,
termMonths,
feeFlat,
firstDueDate
) {
const p = roundMoney_(principal);
const annual = Number(annualRate);
const term = Number(termMonths);
const monthlyRate = annual / 1200;
const fee = roundMoney_(feeFlat);

if (
!Number.isFinite(p) ||
p <= 0 ||
!Number.isFinite(annual) ||
annual < 0 ||
!Number.isInteger(term) ||
term < 1 ||
!Number.isFinite(fee) ||
fee < 0
) {
fail_('INVALID_SCHEDULE_INPUT', 'ข้อมูลการสร้างตารางชำระไม่ถูกต้อง');
}

let fixedPayment = 0;

if (method === 'REDUCING_BALANCE') {
fixedPayment = monthlyRate === 0
? p / term
: p * monthlyRate /
(1 - Math.pow(1 + monthlyRate, -term));
}

let balance = p;

let totalFeeAllocated = 0;

const regularPrincipal = p / term;
const regularFee = fee / term;

const schedule = [];

for (let i = 1; i <= term; i++) {
const interest = method === 'FLAT'
? roundMoney_(p * annual / 1200)
: roundMoney_(balance * monthlyRate);

let principalPart = method === 'FLAT'
? roundMoney_(regularPrincipal)
: roundMoney_(fixedPayment - interest);

if (i === term) {
principalPart = roundMoney_(balance);
}

if (principalPart < 0) {
fail_(
'INVALID_SCHEDULE',
'คำนวณเงินต้นในตารางชำระไม่ได้'
);
}

let feePart = i === term
? roundMoney_(fee - totalFeeAllocated)
: roundMoney_(regularFee);

totalFeeAllocated = roundMoney_(totalFeeAllocated + feePart);

balance = roundMoney_(balance - principalPart);

const dueDate = addMonthsClamped_(firstDueDate, i - 1);

const amountDue = roundMoney_(
principalPart + interest + feePart
);

schedule.push({
installmentNo: i,
dueDate: dueDate.toISOString().slice(0, 10),
principalAmount: principalPart,
interestAmount: interest,
feeAmount: feePart,
amountDue: amountDue,
amountPaid: 0,
status: 'UNPAID'
});
}

return schedule;
}

/* =========================================================
21. ADMIN — ACTIVATE LOAN AFTER CONTRACT AND DISBURSEMENT
========================================================= */

function adminActivateLoan_(request) {
const admin = requireAdmin_(request);

const applicationId = String(request.applicationId || '');
const disbursementRef = cleanString_(
request.disbursementRef,
250
);

if (request.disbursementConfirmed !== true) {
fail_(
'DISBURSEMENT_CONFIRMATION_REQUIRED',
'ต้องยืนยันว่ามีการจ่ายเงินจริงก่อนเปิดบัญชีสินเชื่อ'
);
}

if (!disbursementRef) {
fail_(
'DISBURSEMENT_REFERENCE_REQUIRED',
'กรุณาระบุรหัสอ้างอิงการจ่ายเงิน'
);
}

const result = withScriptLock_(function () {
const application = getRecords_('loan_applications').find(
function (record) {
return record.applicationId === applicationId;
}
);

if (!application) {
fail_('APPLICATION_NOT_FOUND', 'ไม่พบคำขอสินเชื่อ');
}

if (
application.status !== 'APPROVED' ||
!application.offerAcceptedAt
) {
fail_(
'APPLICATION_NOT_READY',
'คำขอสินเชื่อยังไม่พร้อมเปิดบัญชี'
);
}

const existingAccount = getRecords_('loan_accounts').find(
function (record) {
return record.applicationId === applicationId;
}
);

if (existingAccount) {
fail_(
'LOAN_ACCOUNT_ALREADY_EXISTS',
'คำขอนี้มีบัญชีสินเชื่อแล้ว'
);
}

const contract = getRecords_('loan_contracts').find(
function (record) {
return record.applicationId === applicationId &&
record.status === 'SIGNED';
}
);

if (!contract) {
fail_(
'SIGNED_CONTRACT_REQUIRED',
'ยังไม่มีหลักฐานสัญญาที่ลงนามแล้ว'
);
}

const product = getRecords_('loan_products').find(
function (record) {
return record.productId === application.productId;
}
);

if (!product) {
fail_('PRODUCT_NOT_FOUND', 'ไม่พบผลิตภัณฑ์สินเชื่อ');
}

const principal = positiveNumber_(
application.approvedAmount,
'approvedAmount'
);

const termMonths = Number(application.approvedTermMonths);

const firstDueDate = request.firstDueDate
? String(request.firstDueDate)
: addMonthsClamped_(new Date(), 1)
.toISOString()
.slice(0, 10);

if (!/^\d{4}-\d{2}-\d{2}$/.test(firstDueDate)) {
fail_('INVALID_DUE_DATE', 'วันครบกำหนดงวดแรกไม่ถูกต้อง');
}

const schedules = generateSchedule_(
principal,
Number(product.annualInterestRate),
String(product.interestMethod),
termMonths,
Number(product.feeFlat || 0),
new Date(firstDueDate + 'T00:00:00Z')
);

const totalAmountDue = roundMoney_(
schedules.reduce(function (sum, item) {
return sum + item.amountDue;
}, 0)
);

const currentTime = nowIso_();

const loanAccount = {
loanAccountId: createId_('LOAN'),
userId: application.userId,
applicationId: applicationId,
productId: application.productId,
contractId: contract.contractId,
principalAmount: principal,
outstandingPrincipal: principal,
totalAmountDue: totalAmountDue,
totalAmountPaid: 0,
annualInterestRate: Number(product.annualInterestRate),
interestMethod: product.interestMethod,
termMonths: termMonths,
startDate: currentTime.slice(0, 10),
status: 'ACTIVE',
createdAt: currentTime,
updatedAt: currentTime
};

const scheduleRecords = schedules.map(function (item) {
return {
scheduleId: createId_('SCHEDULE'),
loanAccountId: loanAccount.loanAccountId,
userId: application.userId,
installmentNo: item.installmentNo,
dueDate: item.dueDate,
principalAmount: item.principalAmount,
interestAmount: item.interestAmount,
feeAmount: item.feeAmount,
amountDue: item.amountDue,
amountPaid: item.amountPaid,
status: item.status,
paidAt: '',
createdAt: currentTime
};
});

/*
* The account is only created after:
* - Approval
* - Customer offer acceptance
* - Verified signed contract record
* - Explicit disbursement confirmation
*
* The actual transfer must be confirmed by the
* real payment provider or the authorized finance team.
*/

appendRecord_('loan_accounts', loanAccount);

appendRecords_('repayment_schedules', scheduleRecords);

updateRecordById_(
'loan_applications',
'applicationId',
applicationId,
{
status: 'DISBURSED',
disbursedAt: currentTime,
disbursementRef: disbursementRef,
updatedAt: currentTime,
reviewedBy: admin.user.userId,
reviewedAt: currentTime
}
);

appendRecord_('transactions', {
transactionId: createId_('TXN'),
userId: application.userId,
loanAccountId: loanAccount.loanAccountId,
scheduleId: '',
paymentRequestId: '',
type: 'DISBURSEMENT',
direction: 'OUT',
amount: principal,
currency: 'THB',
provider: 'MANUAL_OR_EXTERNAL_PROVIDER',
providerRef: disbursementRef,
status: 'CONFIRMED',
createdAt: currentTime,
metadataJson: JSON.stringify({
applicationId: applicationId
})
});

writeAudit_(
admin.user.userId,
admin.user.email,
'ADMIN_ACTIVATE_LOAN',
'LOAN_ACCOUNT',
loanAccount.loanAccountId,
{
applicationId: applicationId,
principalAmount: principal,
termMonths: termMonths,
disbursementRef: disbursementRef
}
);

notifyUser_(
application.userId,
'สินเชื่อของคุณเริ่มต้นแล้ว',
'บัญชีสินเชื่อ ' + loanAccount.loanAccountId +
' พร้อมตารางชำระเงินแล้ว',
'LOAN_ACTIVE'
);

return {
loanAccountId: loanAccount.loanAccountId,
principalAmount: principal,
totalAmountDue: totalAmountDue,
termMonths: termMonths,
scheduleCount: scheduleRecords.length,
status: 'ACTIVE'
};
});

return result;
}

/* =========================================================
22. CUSTOMER — LOAN ACCOUNTS AND REPAYMENTS
========================================================= */

function getMyLoanAccounts_(request) {
const current = requireCurrentUser_(request);

return getRecords_('loan_accounts')
.filter(function (record) {
return record.userId === current.user.userId;
})
.sort(function (a, b) {
return new Date(b.createdAt).getTime() -
new Date(a.createdAt).getTime();
})
.map(function (record) {
return {
loanAccountId: record.loanAccountId,
applicationId: record.applicationId,
productId: record.productId,
principalAmount: Number(record.principalAmount || 0),
outstandingPrincipal: Number(record.outstandingPrincipal || 0),
totalAmountDue: Number(record.totalAmountDue || 0),
totalAmountPaid: Number(record.totalAmountPaid || 0),
annualInterestRate: Number(record.annualInterestRate || 0),
interestMethod: record.interestMethod,
termMonths: Number(record.termMonths || 0),
startDate: record.startDate,
status: record.status
};
});
}

function getMyRepayments_(request) {
const current = requireCurrentUser_(request);

return getRecords_('repayment_schedules')
.filter(function (record) {
return record.userId === current.user.userId;
})
.sort(function (a, b) {
return String(a.dueDate).localeCompare(String(b.dueDate));
})
.map(function (record) {
return {
scheduleId: record.scheduleId,
loanAccountId: record.loanAccountId,
installmentNo: Number(record.installmentNo || 0),
dueDate: record.dueDate,
principalAmount: Number(record.principalAmount || 0),
interestAmount: Number(record.interestAmount || 0),
feeAmount: Number(record.feeAmount || 0),
amountDue: Number(record.amountDue || 0),
amountPaid: Number(record.amountPaid || 0),
outstandingAmount: roundMoney_(
Number(record.amountDue || 0) -
Number(record.amountPaid || 0)
),
status: record.status,
paidAt: record.paidAt
};
});
}

function getMyTransactions_(request) {
const current = requireCurrentUser_(request);

return getRecords_('transactions')
.filter(function (record) {
return record.userId === current.user.userId;
})
.sort(function (a, b) {
return new Date(b.createdAt).getTime() -
new Date(a.createdAt).getTime();
})
.slice(0, 200)
.map(function (record) {
return {
transactionId: record.transactionId,
loanAccountId: record.loanAccountId,
type: record.type,
direction: record.direction,
amount: Number(record.amount || 0),
currency: record.currency,
providerRef: record.providerRef,
status: record.status,
createdAt: record.createdAt
};
});
}

/* =========================================================
23. THUNDER SOLUTION — PROMPTPAY QR
========================================================= */

/**
• QR generation currently uses Thunder Solution v1.
• Endpoint:
• POST https://api.thunder.in.th/v1/qr/generate
• Secret:
• THUNDER_API_TOKEN
• Recipient:
• THUNDER_QR_PROMPTPAY_MSISDN
• or THUNDER_QR_PROMPTPAY_NAT_ID
*/
function thunderGenerateQr_(amount) {
const token = String(
getProperty_('THUNDER_API_TOKEN', '')
).trim();

if (!token) {
fail_(
'THUNDER_CONFIGURATION_ERROR',
'ยังไม่ได้ตั้งค่า THUNDER_API_TOKEN'
);
}

const msisdn = normalizePhone_(
getProperty_('THUNDER_QR_PROMPTPAY_MSISDN', '')
);

const natId = String(
getProperty_('THUNDER_QR_PROMPTPAY_NAT_ID', '')
).replace(/\D/g, '');

const payload = {
type: 'PROMPTPAY',
amount: roundMoney_(amount)
};

if (/^0[0-9]{9}$/.test(msisdn)) {
payload.msisdn = msisdn;

} else if (/^[0-9]{13}$/.test(natId)) {
payload.natId = natId;

} else {
fail_(
'THUNDER_RECIPIENT_NOT_CONFIGURED',
'กรุณาตั้งค่าบัญชีพร้อมเพย์สำหรับรับชำระ'
);
}

const response = UrlFetchApp.fetch(
'https://api.thunder.in.th/v1/qr/generate',
{
method: 'post',
contentType: 'application/json',
headers: {
Authorization: 'Bearer ' + token
},
payload: JSON.stringify(payload),
muteHttpExceptions: true
}
);

const status = response.getResponseCode();

let data;

try {
data = JSON.parse(response.getContentText());

} catch (error) {
fail_(
'THUNDER_INVALID_RESPONSE',
'บริการสร้าง QR ตอบกลับข้อมูลที่ไม่ถูกต้อง'
);
}

if (status < 200 || status >= 300 || Number(data.status) !== 200) {
logError_('thunderGenerateQr', {
httpStatus: status,
providerStatus: data.status
});

fail_(
'THUNDER_QR_FAILED',
'ไม่สามารถสร้าง QR สำหรับชำระเงินได้'
);
}

const qr = data.data || {};

if (!qr.image || !qr.mime || !qr.payload) {
fail_(
'THUNDER_QR_INVALID_DATA',
'ข้อมูล QR จากผู้ให้บริการไม่ครบถ้วน'
);
}

return {
image: String(qr.image),
mime: String(qr.mime),
payload: String(qr.payload)
};
}

/**
• Create a QR only for an actual outstanding installment.
• The amount is calculated on the server.
*/
function createRepaymentQR_(request) {
const current = requireCurrentUser_(request);

const scheduleId = String(request.scheduleId || '');

let schedule = getRecords_('repayment_schedules').find(
function (record) {
return record.scheduleId === scheduleId &&
record.userId === current.user.userId;
}
);

if (!schedule) {
fail_('SCHEDULE_NOT_FOUND', 'ไม่พบงวดชำระนี้');
}

if (schedule.status === 'PAID') {
fail_('SCHEDULE_ALREADY_PAID', 'งวดนี้ชำระครบแล้ว');
}

const amount = roundMoney_(
Number(schedule.amountDue || 0) -
Number(schedule.amountPaid || 0)
);

if (amount <= 0) {
fail_('NO_OUTSTANDING_AMOUNT', 'ไม่มียอดค้างชำระ');
}

const existingPending = getRecords_('payment_requests').find(
function (record) {
return record.scheduleId === scheduleId &&
record.userId === current.user.userId &&
(
record.status === 'PENDING' ||
record.status === 'CREATING'
) &&
new Date(record.expiresAt).getTime() > Date.now();
}
);

let paymentRequest = existingPending;

if (paymentRequest && paymentRequest.status === 'CREATING') {
fail_(
'QR_GENERATING',
'ระบบกำลังสร้าง QR กรุณารอสักครู่'
);
}

if (!paymentRequest) {
paymentRequest = withScriptLock_(function () {
const recheck = getRecords_('payment_requests').find(
function (record) {
return record.scheduleId === scheduleId &&
record.userId === current.user.userId &&
(
record.status === 'PENDING' ||
record.status === 'CREATING'
) &&
new Date(record.expiresAt).getTime() > Date.now();
}
);

if (recheck) {
fail_(
'PAYMENT_REQUEST_EXISTS',
'มีรายการชำระเงินที่ยังไม่หมดอายุแล้ว'
);
}

const record = {
paymentRequestId: createId_('PAYMENT'),
userId: current.user.userId,
loanAccountId: schedule.loanAccountId,
scheduleId: scheduleId,
amount: amount,
status: 'CREATING',
qrPayload: '',
providerRef: '',
verifiedAmount: '',
createdAt: nowIso_(),
expiresAt: addSeconds_(nowIso_(), 1800),
paidAt: '',
failureReason: ''
};

appendRecord_('payment_requests', record);

return record;
});
}

try {
const qr = thunderGenerateQr_(amount);

updateRecordById_(
'payment_requests',
'paymentRequestId',
paymentRequest.paymentRequestId,
{
status: 'PENDING',
qrPayload: qr.payload
}
);

return {
paymentRequestId: paymentRequest.paymentRequestId,
scheduleId: scheduleId,
amount: amount,
currency: 'THB',
expiresAt: paymentRequest.expiresAt,
qrImageDataUrl: 'data:' + qr.mime + ';base64,' + qr.image,
message: 'สร้าง QR สำหรับชำระเงินแล้ว'
};

} catch (error) {
updateRecordById_(
'payment_requests',
'paymentRequestId',
paymentRequest.paymentRequestId,
{
status: 'FAILED',
failureReason: String(error.code || 'QR_FAILED')
}
);

throw error;
}
}

/* =========================================================
24. THUNDER SOLUTION — VERIFY SLIP
========================================================= */

/**
• Slip verification uses Thunder Solution v2:
• POST https://api.thunder.in.th/v2/verify/bank
• The slip is submitted as base64 directly to the provider.
• It is NOT sent to ImgBB, because bank slips can contain
• personal and financial information.
*/
function thunderVerifySlip_(base64Image, amount, reference) {
const token = String(
getProperty_('THUNDER_API_TOKEN', '')
).trim();

if (!token) {
fail_(
'THUNDER_CONFIGURATION_ERROR',
'ยังไม่ได้ตั้งค่า THUNDER_API_TOKEN'
);
}

const matchAccount = getBooleanProperty_(
'THUNDER_MATCH_ACCOUNT',
true
);

const body = {
base64: base64Image,
remark: String(reference).substring(0, 255),
matchAccount: matchAccount,
matchAmount: roundMoney_(amount),
checkDuplicate: true
};

const response = UrlFetchApp.fetch(
'https://api.thunder.in.th/v2/verify/bank',
{
method: 'post',
contentType: 'application/json',
headers: {
Authorization: 'Bearer ' + token
},
payload: JSON.stringify(body),
muteHttpExceptions: true
}
);

const status = response.getResponseCode();

let result;

try {
result = JSON.parse(response.getContentText());

} catch (error) {
fail_(
'THUNDER_INVALID_RESPONSE',
'ไม่สามารถอ่านผลตรวจสอบสลิปได้'
);
}

if (
status < 200 ||
status >= 300 ||
result.success !== true
) {
/*
* Provider error details are intentionally not sent
* directly to the public frontend.
*/
logError_('thunderVerifySlip', {
httpStatus: status,
providerSuccess: result.success === true
});

fail_(
'SLIP_VERIFICATION_FAILED',
'ตรวจสอบสลิปไม่สำเร็จ กรุณาตรวจสอบรูปภาพแล้วลองใหม่'
);
}

const data = result.data || {};

const rawAmount = data.amountInSlip !== undefined
? Number(data.amountInSlip)
: Number(data.amount && data.amount.amount || 0);

const verifiedAmount = roundMoney_(rawAmount);

const isDuplicate = data.isDuplicate === true;

const amountMatched = data.isAmountMatched !== undefined
? data.isAmountMatched === true
: verifiedAmount === roundMoney_(amount);

const recipientMatched = !matchAccount ||
Boolean(data.matchedAccount);

const rawSlip = data.rawSlip || {};

const transRef = String(
data.transRef ||
rawSlip.transRef ||
''
).trim();

return {
success: true,
isDuplicate: isDuplicate,
amountMatched: amountMatched,
recipientMatched: recipientMatched,
verifiedAmount: verifiedAmount,
transRef: transRef,
senderBank: String(
rawSlip.sender && rawSlip.sender.bank &&
rawSlip.sender.bank.short || ''
),
receiverBank: String(
rawSlip.receiver && rawSlip.receiver.bank &&
rawSlip.receiver.bank.short || ''
)
};
}

function verifyRepaymentSlip_(request) {
const current = requireCurrentUser_(request);

const paymentRequestId = String(
request.paymentRequestId || ''
);

let imageBase64 = String(request.imageBase64 || '');

if (!imageBase64) {
fail_('SLIP_IMAGE_REQUIRED', 'กรุณาอัปโหลดรูปสลิป');
}

imageBase64 = imageBase64.replace(
/^data:image\/[a-zA-Z0-9.+-]+;base64,/,
''
);

const estimatedBytes = Math.floor(
imageBase64.length * 3 / 4
);

if (estimatedBytes <= 0 || estimatedBytes > 4 * 1024 * 1024) {
fail_(
'SLIP_IMAGE_SIZE_INVALID',
'รูปสลิปต้องมีขนาดไม่เกิน 4 MB'
);
}

if (!/^[A-Za-z0-9+/]*={0,2}$/.test(imageBase64)) {
fail_('SLIP_IMAGE_INVALID', 'รูปแบบข้อมูลภาพไม่ถูกต้อง');
}

const paymentRequest = getRecords_('payment_requests').find(
function (record) {
return record.paymentRequestId === paymentRequestId &&
record.userId === current.user.userId;
}
);

if (!paymentRequest) {
fail_('PAYMENT_REQUEST_NOT_FOUND', 'ไม่พบรายการชำระเงิน');
}

if (paymentRequest.status !== 'PENDING') {
fail_(
'PAYMENT_REQUEST_NOT_PENDING',
'รายการนี้ไม่อยู่ในสถานะที่รับการตรวจสลิปได้'
);
}

if (new Date(paymentRequest.expiresAt).getTime() <= Date.now()) {
updateRecordById_(
'payment_requests',
'paymentRequestId',
paymentRequestId,
{
status: 'EXPIRED'
}
);

fail_('PAYMENT_REQUEST_EXPIRED', 'รายการชำระเงินหมดอายุแล้ว');
}

/*
• Send to Thunder for real verification.
*/
const result = thunderVerifySlip_(
imageBase64,
Number(paymentRequest.amount),
paymentRequestId
);

if (result.isDuplicate) {
updateRecordById_(
'payment_requests',
'paymentRequestId',
paymentRequestId,
{
status: 'REJECTED',
failureReason: 'DUPLICATE_SLIP'
}
);

fail_(
'DUPLICATE_SLIP',
'สลิปนี้เคยถูกใช้งานแล้ว'
);
}

if (!result.amountMatched) {
updateRecordById_(
'payment_requests',
'paymentRequestId',
paymentRequestId,
{
status: 'REVIEW_REQUIRED',
verifiedAmount: result.verifiedAmount,
failureReason: 'AMOUNT_MISMATCH'
}
);

fail_(
'AMOUNT_MISMATCH',
'ยอดเงินในสลิปไม่ตรงกับยอดที่ต้องชำระ'
);
}

if (!result.recipientMatched) {
updateRecordById_(
'payment_requests',
'paymentRequestId',
paymentRequestId,
{
status: 'REVIEW_REQUIRED',
failureReason: 'RECIPIENT_MISMATCH'
}
);

fail_(
'RECIPIENT_MISMATCH',
'บัญชีผู้รับในสลิปไม่ตรงกับบัญชีที่ลงทะเบียน'
);
}

if (!result.transRef) {
updateRecordById_(
'payment_requests',
'paymentRequestId',
paymentRequestId,
{
status: 'REVIEW_REQUIRED',
failureReason: 'MISSING_PROVIDER_REFERENCE'
}
);

fail_(
'MISSING_PROVIDER_REFERENCE',
'ไม่พบรหัสอ้างอิงธุรกรรมจากผู้ให้บริการ'
);
}

return withScriptLock_(function () {
const latestPayment = getRecords_('payment_requests').find(
function (record) {
return record.paymentRequestId === paymentRequestId &&
record.userId === current.user.userId;
}
);

if (!latestPayment || latestPayment.status !== 'PENDING') {
fail_(
'PAYMENT_REQUEST_CHANGED',
'สถานะรายการเปลี่ยนแปลง กรุณาตรวจสอบอีกครั้ง'
);
}

const alreadyUsed = getRecords_('transactions').some(
function (record) {
return record.providerRef === result.transRef &&
record.status === 'CONFIRMED';
}
);

if (alreadyUsed) {
updateRecordById_(
'payment_requests',
'paymentRequestId',
paymentRequestId,
{
status: 'REJECTED',
failureReason: 'TRANSACTION_REFERENCE_ALREADY_USED'
}
);

fail_(
'DUPLICATE_TRANSACTION',
'ธุรกรรมนี้มีอยู่ในระบบแล้ว'
);
}

const schedule = getRecords_('repayment_schedules').find(
function (record) {
return record.scheduleId === latestPayment.scheduleId &&
record.userId === current.user.userId;
}
);

if (!schedule || schedule.status === 'PAID') {
fail_(
'SCHEDULE_ALREADY_SETTLED',
'งวดนี้ได้รับการชำระแล้วหรือไม่พบงวดที่เกี่ยวข้อง'
);
}

const amountDue = roundMoney_(
Number(schedule.amountDue || 0) -
Number(schedule.amountPaid || 0)
);

if (amountDue !== roundMoney_(latestPayment.amount)) {
fail_(
'PAYMENT_AMOUNT_CHANGED',
'ยอดที่ต้องชำระเปลี่ยนแปลง กรุณาสร้าง QR ใหม่'
);
}

const currentTime = nowIso_();

/*
* Only verified transactions reach this point.
*/
updateRecordById_(
'payment_requests',
'paymentRequestId',
paymentRequestId,
{
status: 'PAID',
providerRef: result.transRef,
verifiedAmount: result.verifiedAmount,
paidAt: currentTime,
failureReason: ''
}
);

updateRecordById_(
'repayment_schedules',
'scheduleId',
schedule.scheduleId,
{
amountPaid: Number(schedule.amountDue),
status: 'PAID',
paidAt: currentTime
}
);

const loanAccount = getRecords_('loan_accounts').find(
function (record) {
return record.loanAccountId === schedule.loanAccountId &&
record.userId === current.user.userId;
}
);

if (!loanAccount) {
fail_('LOAN_ACCOUNT_NOT_FOUND', 'ไม่พบบัญชีสินเชื่อ');
}

const paidAmount = roundMoney_(result.verifiedAmount);

updateRecordById_(
'loan_accounts',
'loanAccountId',
loanAccount.loanAccountId,
{
outstandingPrincipal: Math.max(
0,
roundMoney_(
Number(loanAccount.outstandingPrincipal || 0) -
Number(schedule.principalAmount || 0)
)
),
totalAmountPaid: roundMoney_(
Number(loanAccount.totalAmountPaid || 0) + paidAmount
),
updatedAt: currentTime
}
);

const transactionId = createId_('TXN');

appendRecord_('transactions', {
transactionId: transactionId,
userId: current.user.userId,
loanAccountId: loanAccount.loanAccountId,
scheduleId: schedule.scheduleId,
paymentRequestId: paymentRequestId,
type: 'REPAYMENT',
direction: 'IN',
amount: paidAmount,
currency: 'THB',
provider: 'THUNDER',
providerRef: result.transRef,
status: 'CONFIRMED',
createdAt: currentTime,
metadataJson: JSON.stringify({
senderBank: result.senderBank,
receiverBank: result.receiverBank,
amountMatched: result.amountMatched,
recipientMatched: result.recipientMatched
})
});

/*
* Simplified ledger representation.
* Production accounting should be reconciled with
* the licensed lender's official chart of accounts.
*/
appendRecords_('ledger_entries', [
{
ledgerEntryId: createId_('LEDGER'),
transactionId: transactionId,
accountCode: 'CASH_RECEIVED',
direction: 'DEBIT',
amount: paidAmount,
currency: 'THB',
createdAt: currentTime
},
{
ledgerEntryId: createId_('LEDGER'),
transactionId: transactionId,
accountCode: 'LOAN_REPAYMENT_RECEIVED',
direction: 'CREDIT',
amount: paidAmount,
currency: 'THB',
createdAt: currentTime
}
 ]);

writeAudit_(
current.user.userId,
current.user.email,
'REPAYMENT_VERIFIED',
'PAYMENT_REQUEST',
paymentRequestId,
{
transactionId: transactionId,
providerRef: result.transRef,
amount: paidAmount
}
);

notifyUser_(
current.user.userId,
'รับชำระเงินสำเร็จ',
'ระบบยืนยันการชำระเงินจำนวน ' +
paidAmount.toFixed(2) +
' บาทแล้ว',
'PAYMENT_SUCCESS'
);

return {
paid: true,
transactionId: transactionId,
paymentRequestId: paymentRequestId,
amount: paidAmount,
paidAt: currentTime,
message: 'ตรวจสอบและยืนยันการชำระเงินสำเร็จ'
};
});
}

/* =========================================================
25. ADMIN — REPAYMENT AND TRANSACTION REPORTS
========================================================= */

function adminListRepayments_(request) {
requireAdmin_(request);

const wantedStatus = String(request.status || 'ALL');

let records = getRecords_('repayment_schedules');

if (wantedStatus !== 'ALL') {
records = records.filter(function (record) {
return record.status === wantedStatus;
});
}

records.sort(function (a, b) {
return String(a.dueDate).localeCompare(String(b.dueDate));
});

return records.slice(0, 500).map(function (record) {
const user = findUserById_(record.userId);

return {
scheduleId: record.scheduleId,
loanAccountId: record.loanAccountId,
user: user ? safeUser_(user) : null,
installmentNo: Number(record.installmentNo || 0),
dueDate: record.dueDate,
amountDue: Number(record.amountDue || 0),
amountPaid: Number(record.amountPaid || 0),
status: record.status,
paidAt: record.paidAt
};
});
}

function adminListTransactions_(request) {
requireAdmin_(request);

const wantedStatus = String(request.status || 'ALL');

let records = getRecords_('transactions');

if (wantedStatus !== 'ALL') {
records = records.filter(function (record) {
return record.status === wantedStatus;
});
}

records.sort(function (a, b) {
return new Date(b.createdAt).getTime() -
new Date(a.createdAt).getTime();
});

return records.slice(0, 500).map(function (record) {
const user = findUserById_(record.userId);

return {
transactionId: record.transactionId,
user: user ? safeUser_(user) : null,
loanAccountId: record.loanAccountId,
scheduleId: record.scheduleId,
paymentRequestId: record.paymentRequestId,
type: record.type,
direction: record.direction,
amount: Number(record.amount || 0),
currency: record.currency,
provider: record.provider,
providerRef: record.providerRef,
status: record.status,
createdAt: record.createdAt
};
});
}

/* =========================================================
26. ADMIN DASHBOARD STATISTICS
========================================================= */

function adminGetDashboardStats_(request) {
requireAdmin_(request);

const users = getRecords_('users');
const applications = getRecords_('loan_applications');
const accounts = getRecords_('loan_accounts');
const transactions = getRecords_('transactions');
const paymentRequests = getRecords_('payment_requests');

const confirmedTransactions = transactions.filter(
function (record) {
return record.status === 'CONFIRMED';
}
);

const repayments = confirmedTransactions.filter(
function (record) {
return record.type === 'REPAYMENT';
}
);

const disbursements = confirmedTransactions.filter(
function (record) {
return record.type === 'DISBURSEMENT';
}
);

return {
generatedAt: nowIso_(),

totalUsers: users.length,

totalApplications: applications.length,

applicationsPendingReview: applications.filter(
function (record) {
return [
'SUBMITTED',
'UNDER_REVIEW',
'NEED_MORE_INFO'
 ].indexOf(record.status) >= 0;
}
).length,

applicationsApproved: applications.filter(
function (record) {
return record.status === 'APPROVED';
}
).length,

applicationsRejected: applications.filter(
function (record) {
return record.status === 'REJECTED';
}
).length,

activeLoanAccounts: accounts.filter(
function (record) {
return record.status === 'ACTIVE';
}
).length,

totalOutstandingPrincipal: roundMoney_(
accounts.reduce(function (sum, record) {
return sum + Number(record.outstandingPrincipal || 0);
}, 0)
),

totalDisbursed: roundMoney_(
disbursements.reduce(function (sum, record) {
return sum + Number(record.amount || 0);
}, 0)
),

totalRepaid: roundMoney_(
repayments.reduce(function (sum, record) {
return sum + Number(record.amount || 0);
}, 0)
),

pendingPaymentRequests: paymentRequests.filter(
function (record) {
return record.status === 'PENDING';
}
).length
};
}

/* =========================================================
27. ANNOUNCEMENTS
========================================================= */

/**
• Basic allowlist-based sanitizer for announcement HTML.
• Allowed tags:
• p, br, hr, strong, b, em, i, u, ul, ol, li, h1-h4,
• blockquote, div, span, a, img.
• Scripts, event handlers, forms, embedded content,
• JavaScript URLs and inline styles are not allowed.
*/
function sanitizeAnnouncementHtml_(html) {
let input = String(html || '').substring(0, 20000);

input = input.replace(/<!--[\s\S]*?-->/g, '');

input = input.replace(
/<(script|style|iframe|object|embed|form|svg|math|template|noscript)\b[^>]*>[\s\S]*?<\/\1\s*>/gi,
''
);

input = input.replace(
/<(script|style|iframe|object|embed|form|svg|math|template|noscript)\b[^>]*\/?\>/gi,
''
);

const allowedTags = [
'p', 'br', 'hr', 'strong', 'b', 'em', 'i', 'u',
'ul', 'ol', 'li', 'h1', 'h2', 'h3', 'h4',
'blockquote', 'div', 'span', 'a', 'img'
 ];

input = input.replace(
/<\/?([a-zA-Z0-9]+)([^>]*)>/g,
function (wholeTag, rawName, attrs) {
const tag = String(rawName).toLowerCase();

if (allowedTags.indexOf(tag) === -1) {
return '';
}

const isClosing = /^<\//.test(wholeTag);

if (isClosing) {
if (tag === 'br' || tag === 'hr' || tag === 'img') {
return '';
}

return '</' + tag + '>';
}

if (tag === 'br' || tag === 'hr') {
return '<' + tag + '>';
}

if (tag === 'a') {
const hrefMatch = String(attrs).match(
/\bhref\s*=\s*(['"])(.*?)\1/i
);

let safeHref = '';

if (
hrefMatch &&
/^(https:\/\/|mailto:|#)/i.test(hrefMatch[2])
) {
safeHref = hrefMatch[2];
}

if (!safeHref) {
return '<a>';
}

return '<a href="' +
htmlEscape_(safeHref) +
'" target="_blank" rel="noopener noreferrer">';
}

if (tag === 'img') {
const srcMatch = String(attrs).match(
/\bsrc\s*=\s*(['"])(.*?)\1/i
);

const altMatch = String(attrs).match(
/\balt\s*=\s*(['"])(.*?)\1/i
);

if (
!srcMatch ||
!/^https:\/\//i.test(srcMatch[2])
) {
return '';
}

const alt = altMatch ? altMatch[2].substring(0, 250) : '';

return '<img src="' +
htmlEscape_(srcMatch[2]) +
'" alt="' +
htmlEscape_(alt) +
'" loading="lazy">';
}

return '<' + tag + '>';
}
);

return input;
}

function isAnnouncementActive_(record, currentTime) {
if (!parseBoolean_(record.active)) {
return false;
}

if (record.deletedAt) {
return false;
}

const now = new Date(currentTime).getTime();

if (record.startsAt) {
if (new Date(record.startsAt).getTime() > now) {
return false;
}
}

if (record.endsAt) {
if (new Date(record.endsAt).getTime() < now) {
return false;
}
}

return true;
}

function getPublicAnnouncements_(zone) {
const allowedZones = ['AUTH', 'BORROWER'];

const selectedZone = String(zone || 'AUTH').toUpperCase();

if (allowedZones.indexOf(selectedZone) === -1) {
fail_('INVALID_ANNOUNCEMENT_ZONE', 'ตำแหน่งประกาศไม่ถูกต้อง');
}

const now = nowIso_();

return getRecords_('announcements')
.filter(function (record) {
if (!isAnnouncementActive_(record, now)) {
return false;
}

return record.placement === selectedZone ||
record.placement === 'BOTH';
})
.sort(function (a, b) {
return Number(b.priority || 0) -
Number(a.priority || 0);
})
.map(function (record) {
return {
announcementId: record.announcementId,
title: record.title,
placement: record.placement,
htmlContent: sanitizeAnnouncementHtml_(record.htmlContent),
imageUrl: record.imageUrl,
priority: Number(record.priority || 0),
startsAt: record.startsAt,
endsAt: record.endsAt
};
});
}

function adminListAnnouncements_(request) {
requireAdmin_(request);

return getRecords_('announcements')
.filter(function (record) {
return !record.deletedAt;
})
.sort(function (a, b) {
return Number(b.priority || 0) -
Number(a.priority || 0);
})
.map(function (record) {
return {
announcementId: record.announcementId,
title: record.title,
placement: record.placement,
htmlContent: sanitizeAnnouncementHtml_(record.htmlContent),
imageUrl: record.imageUrl,
priority: Number(record.priority || 0),
active: parseBoolean_(record.active),
startsAt: record.startsAt,
endsAt: record.endsAt,
createdAt: record.createdAt,
updatedAt: record.updatedAt
};
});
}

function adminSaveAnnouncement_(request) {
const admin = requireAdmin_(request);

const announcementId = String(
request.announcementId || createId_('ANNOUNCEMENT')
);

const title = cleanString_(request.title, 200);
const placement = String(request.placement || '').toUpperCase();
const htmlContent = sanitizeAnnouncementHtml_(
request.htmlContent || ''
);

const allowedPlacements = ['AUTH', 'BORROWER', 'BOTH'];

if (!title) {
fail_('ANNOUNCEMENT_TITLE_REQUIRED', 'กรุณาระบุหัวข้อประกาศ');
}

if (allowedPlacements.indexOf(placement) === -1) {
fail_('INVALID_PLACEMENT', 'ตำแหน่งแสดงประกาศไม่ถูกต้อง');
}

if (!htmlContent) {
fail_('ANNOUNCEMENT_CONTENT_REQUIRED', 'กรุณาระบุเนื้อหาประกาศ');
}

const imageUrl = String(request.imageUrl || '').trim();

if (imageUrl && !/^https:\/\//i.test(imageUrl)) {
fail_(
'INVALID_ANNOUNCEMENT_IMAGE',
'รูปภาพประกาศต้องใช้ HTTPS'
);
}

const priority = Number(request.priority || 0);

if (!Number.isFinite(priority)) {
fail_('INVALID_PRIORITY', 'ลำดับประกาศไม่ถูกต้อง');
}

const active = parseBoolean_(request.active);
const currentTime = nowIso_();

const existing = getRecords_('announcements').find(
function (record) {
return record.announcementId === announcementId;
}
);

const announcement = {
announcementId: announcementId,
title: title,
placement: placement,
htmlContent: htmlContent,
imageUrl: imageUrl,
priority: priority,
active: active,
startsAt: String(request.startsAt || ''),
endsAt: String(request.endsAt || ''),
createdBy: existing
? existing.createdBy
: admin.user.userId,
createdAt: existing
? existing.createdAt
: currentTime,
updatedAt: currentTime,
deletedAt: ''
};

withScriptLock_(function () {
if (existing) {
updateRecordById_(
'announcements',
'announcementId',
announcementId,
announcement
);

} else {
appendRecord_('announcements', announcement);
}
});

writeAudit_(
admin.user.userId,
admin.user.email,
'ADMIN_SAVE_ANNOUNCEMENT',
'ANNOUNCEMENT',
announcementId,
{
placement: placement,
active: active
}
);

return {
announcementId: announcementId,
title: title,
placement: placement,
active: active,
updatedAt: currentTime
};
}

function adminDeleteAnnouncement_(request) {
const admin = requireAdmin_(request);

const announcementId = String(request.announcementId || '');

const announcement = getRecords_('announcements').find(
function (record) {
return record.announcementId === announcementId &&
!record.deletedAt;
}
);

if (!announcement) {
fail_('ANNOUNCEMENT_NOT_FOUND', 'ไม่พบประกาศ');
}

updateRecordById_(
'announcements',
'announcementId',
announcementId,
{
active: false,
deletedAt: nowIso_(),
updatedAt: nowIso_()
}
);

writeAudit_(
admin.user.userId,
admin.user.email,
'ADMIN_DELETE_ANNOUNCEMENT',
'ANNOUNCEMENT',
announcementId,
{}
);

return {
deleted: true
};
}

/* =========================================================
28. IMGBB — ADMIN IMAGE UPLOAD
========================================================= */

/**
• Upload an image to ImgBB.
• This endpoint is restricted to ADMIN users.
• Never call ImgBB directly from browser JavaScript with
• the private IMGBB_API_KEY.
*/
function adminUploadImage_(request) {
const admin = requireAdmin_(request);

const apiKey = String(
getProperty_('IMGBB_API_KEY', '')
).trim();

if (!apiKey) {
fail_(
'IMGBB_CONFIGURATION_ERROR',
'ยังไม่ได้ตั้งค่า IMGBB_API_KEY'
);
}

let base64 = String(request.imageBase64 || '');

base64 = base64.replace(
/^data:image\/[a-zA-Z0-9.+-]+;base64,/,
''
);

if (!base64) {
fail_('IMAGE_REQUIRED', 'กรุณาเลือกรูปภาพ');
}

const estimatedBytes = Math.floor(base64.length * 3 / 4);

const maxBytes = getNumberProperty_(
'MAX_IMAGE_SIZE_BYTES',
5242880
);

if (estimatedBytes <= 0 || estimatedBytes > maxBytes) {
fail_(
'IMAGE_SIZE_INVALID',
'ขนาดรูปภาพเกินกว่าที่ระบบกำหนด'
);
}

const mimeType = String(request.mimeType || '').toLowerCase();

const allowedMimeTypes = [
'image/jpeg',
'image/png',
'image/webp',
'image/gif'
 ];

if (allowedMimeTypes.indexOf(mimeType) === -1) {
fail_(
'IMAGE_TYPE_INVALID',
'รองรับไฟล์ JPG, PNG, WebP และ GIF'
);
}

const fileName = cleanString_(
request.fileName || 'finora-image',
100
);

const response = UrlFetchApp.fetch(
'https://api.imgbb.com/1/upload',
{
method: 'post',
payload: {
key: apiKey,
image: base64,
name: fileName
},
muteHttpExceptions: true
}
);

const status = response.getResponseCode();

let result;

try {
result = JSON.parse(response.getContentText());

} catch (error) {
fail_('IMGBB_INVALID_RESPONSE', 'บริการอัปโหลดรูปภาพตอบกลับไม่ถูกต้อง');
}

if (
status < 200 ||
status >= 300 ||
!result.success ||
!result.data ||
!result.data.url
) {
logError_('imgbbUpload', {
status: status,
success: Boolean(result.success)
});

fail_(
'IMGBB_UPLOAD_FAILED',
'ไม่สามารถอัปโหลดรูปภาพได้'
);
}

writeAudit_(
admin.user.userId,
admin.user.email,
'ADMIN_IMAGE_UPLOAD',
'IMAGE',
'',
{
mimeType: mimeType,
fileName: fileName
}
);

return {
uploaded: true,
url: String(result.data.url),
displayUrl: String(
result.data.display_url || result.data.url
),
deleteUrlAvailable: Boolean(result.data.delete_url)
};
}

/* =========================================================
29. CUSTOMER SUPPORT
========================================================= */

function createSupportTicket_(request) {
const current = requireCurrentUser_(request);

const subject = cleanString_(request.subject, 200);
const category = cleanString_(request.category, 100);
const message = cleanString_(request.message, 5000);

if (!subject || !category || !message) {
fail_(
'SUPPORT_FIELDS_REQUIRED',
'กรุณากรอกหัวข้อ หมวดหมู่ และรายละเอียด'
);
}

const ticket = {
ticketId: createId_('TICKET'),
userId: current.user.userId,
subject: subject,
category: category,
message: message,
status: 'OPEN',
assignedTo: '',
staffReply: '',
createdAt: nowIso_(),
updatedAt: nowIso_(),
closedAt: ''
};

appendRecord_('support_tickets', ticket);

writeAudit_(
current.user.userId,
current.user.email,
'SUPPORT_TICKET_CREATED',
'SUPPORT_TICKET',
ticket.ticketId,
{
category: category
}
);

return {
ticketId: ticket.ticketId,
status: ticket.status,
createdAt: ticket.createdAt
};
}

function adminListSupportTickets_(request) {
requireAdmin_(request);

const status = String(request.status || 'ALL');

let records = getRecords_('support_tickets');

if (status !== 'ALL') {
records = records.filter(function (record) {
return record.status === status;
});
}

records.sort(function (a, b) {
return new Date(b.createdAt).getTime() -
new Date(a.createdAt).getTime();
});

return records.slice(0, 300).map(function (record) {
const user = findUserById_(record.userId);

return {
ticketId: record.ticketId,
user: user ? safeUser_(user) : null,
subject: record.subject,
category: record.category,
message: record.message,
status: record.status,
assignedTo: record.assignedTo,
staffReply: record.staffReply,
createdAt: record.createdAt,
updatedAt: record.updatedAt,
closedAt: record.closedAt
};
});
}

function adminUpdateSupportTicket_(request) {
const admin = requireAdmin_(request);

const ticketId = String(request.ticketId || '');

const status = String(request.status || '');

const allowedStatuses = [
'OPEN',
'IN_PROGRESS',
'WAITING_CUSTOMER',
'RESOLVED',
'CLOSED'
 ];

if (allowedStatuses.indexOf(status) === -1) {
fail_('INVALID_TICKET_STATUS', 'สถานะคำร้องไม่ถูกต้อง');
}

const ticket = getRecords_('support_tickets').find(
function (record) {
return record.ticketId === ticketId;
}
);

if (!ticket) {
fail_('TICKET_NOT_FOUND', 'ไม่พบคำร้อง');
}

const currentTime = nowIso_();

const patch = {
status: status,
assignedTo: cleanString_(
request.assignedTo || admin.user.userId,
200
),
staffReply: cleanString_(request.staffReply || '', 5000),
updatedAt: currentTime,
closedAt: status === 'CLOSED' || status === 'RESOLVED'
? currentTime
: ''
};

updateRecordById_(
'support_tickets',
'ticketId',
ticketId,
patch
);

notifyUser_(
ticket.userId,
'อัปเดตคำร้องของคุณ',
'สถานะคำร้อง ' + ticketId + ' เปลี่ยนเป็น ' + status,
'SUPPORT'
);

writeAudit_(
admin.user.userId,
admin.user.email,
'ADMIN_UPDATE_SUPPORT_TICKET',
'SUPPORT_TICKET',
ticketId,
{
status: status
}
);

return {
ticketId: ticketId,
status: status,
updatedAt: currentTime
};
}

/* =========================================================
30. AUTOMATIC MAINTENANCE
========================================================= */

/**
• Run manually to install a daily maintenance trigger.
*/
function installFinoraMaintenanceTrigger() {
const triggers = ScriptApp.getProjectTriggers();

const exists = triggers.some(function (trigger) {
return trigger.getHandlerFunction() ===
'cleanupFinoraDatabase';
});

if (!exists) {
ScriptApp.newTrigger('cleanupFinoraDatabase')
.timeBased()
.everyDays(1)
.create();
}

return {
installed: true
};
}

/**
• Deletes old expired security tokens and sessions.
• Does not delete customer accounts or financial transactions.
*/
function cleanupFinoraDatabase() {
ensureSchema_();

const now = Date.now();
const retentionDays = 7;
const cutoff = now - retentionDays * 86400000;

const removed = {};

removed.expiredSessions = deleteRecordsWhere_(
'sessions',
function (record) {
const expires = new Date(record.expiresAt).getTime();

return Boolean(record.revokedAt) ||
(
Number.isFinite(expires) &&
expires < cutoff
);
}
);

removed.expiredVerificationTokens = deleteRecordsWhere_(
'email_verifications',
function (record) {
const expires = new Date(record.expiresAt).getTime();

return Boolean(record.usedAt) &&
Number.isFinite(expires) &&
expires < cutoff;
}
);

removed.expiredResetTokens = deleteRecordsWhere_(
'password_resets',
function (record) {
const expires = new Date(record.expiresAt).getTime();

return Boolean(record.usedAt) &&
Number.isFinite(expires) &&
expires < cutoff;
}
);

const nowIso = new Date(now).toISOString();

getRecords_('payment_requests')
.filter(function (record) {
return record.status === 'PENDING' &&
new Date(record.expiresAt).getTime() < now;
})
.forEach(function (record) {
updateRecordById_(
'payment_requests',
'paymentRequestId',
record.paymentRequestId,
{
status: 'EXPIRED'
}
);
});

return {
completedAt: nowIso,
removed: removed
};
}

/* =========================================================
31. ADMIN CONNECTIVITY / DIAGNOSTICS
========================================================= */

/**
• Run manually in the Apps Script editor.
• This tests:
◦ Script Properties availability
◦ Spreadsheet access
◦ Database schema
• It deliberately does not print secret values.
*/
function testFinoraConfiguration() {
const props = PropertiesService
.getScriptProperties()
.getProperties();

const report = {
appNameConfigured: Boolean(props.APP_NAME),
appUrlConfigured: Boolean(props.APP_URL),
apiUrlConfigured: Boolean(props.API_URL),
spreadsheetIdConfigured: Boolean(props.SPREADSHEET_ID),
dataHashSecretConfigured: Boolean(props.DATA_HASH_SECRET),
imageApiKeyConfigured: Boolean(props.IMGBB_API_KEY),
thunderTokenConfigured: Boolean(props.THUNDER_API_TOKEN),
adminEmailsConfigured: Boolean(props.ADMIN_EMAILS),
termsVersionConfigured: Boolean(props.TERMS_VERSION),
privacyVersionConfigured: Boolean(props.PRIVACY_VERSION)
};

const spreadsheet = getSpreadsheet_();

report.spreadsheetName = spreadsheet.getName();
report.spreadsheetId = spreadsheet.getId();

Object.keys(FINORA_TABLES).forEach(function (tableName) {
ensureTable_(spreadsheet, tableName);
});

report.tablesReady = Object.keys(FINORA_TABLES);

return report;
}