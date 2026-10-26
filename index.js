/*
 * ============================================================================
 * FINORA — Main JavaScript Client
 * ============================================================================
 *
 * File: index.js
 * Hosting: GitHub Pages
 * Backend: Supabase
 * SDK: @supabase/supabase-js 2.118.0
 *
 * Supported features:
 *   1. Supabase client initialization
 *   2. User registration and email confirmation
 *   3. Sign in, sign out, and session management
 *   4. Password recovery and password changes
 *   5. User profile management
 *   6. Published legal documents and consent records
 *   7. Active loan product listing
 *   8. Loan application submission
 *   9. Private application document uploads and downloads
 *  10. Borrower application history
 *  11. Borrower loan accounts and repayment schedules
 *  12. Public announcements
 *  13. Customer support tickets
 *  14. Staff dashboard data queries protected by database RLS
 *  15. Form binding for compatible HTML forms
 *  16. Centralized error handling and status messages
 *
 * IMPORTANT:
 * - This file must be loaded with <script type="module">.
 * - Only use a Supabase Publishable key or legacy anon key in this file.
 * - Never expose service_role keys or Supabase Secret keys in browser code.
 * - Database Row Level Security (RLS) is the security boundary.
 * - Frontend role checks are not a replacement for server-side authorization.
 * ============================================================================
 */

import { createClient } from
    "https://esm.sh/@supabase/supabase-js@2.118.0";


/* ============================================================================
   1. CONFIGURATION
   ============================================================================ */

const FINORA_CONFIG = Object.freeze({
    appName: "FINORA",

    appUrl: "https://handsomesingha-sys.github.io/finora/",

    supabaseUrl: "https://yahqufirtnfjoqpuxvay.supabase.co",

    /*
     * This is the public Publishable key for the FINORA Supabase project.
     * It is intended for browser clients. RLS must remain enabled.
     */
    supabaseKey: "sb_publishable_uWZgTPghOBs36zD0xT5dYw_3soslvDC",

    storageBucket: "finora-private-documents",

    maxUploadBytes: 10 * 1024 * 1024,

    allowedUploadTypes: Object.freeze([
        "image/jpeg",
        "image/png",
        "image/webp",
        "application/pdf"
    ]),

    sessionStorageKey: "finora-client-state",

    defaultPageSize: 20,

    maxPageSize: 100,

    passwordMinLength: 12,

    legalDocumentTypes: Object.freeze({
        terms: "terms",
        privacy: "privacy_notice"
    }),

    /*
     * Keep these names synchronized with the database schema.
     */
    tables: Object.freeze({
        profiles: "finora_profiles",
        userRoles: "finora_user_roles",
        documents: "finora_documents",
        consentRecords: "finora_consent_records",
        announcements: "finora_announcements",
        announcementPlacements: "finora_announcement_placements",
        loanProducts: "finora_loan_products",
        loanApplications: "finora_loan_applications",
        applicationDocuments: "finora_application_documents",
        applicationReviews: "finora_application_reviews",
        loanContracts: "finora_loan_contracts",
        loanAccounts: "finora_loan_accounts",
        repaymentSchedule: "finora_repayment_schedule",
        disbursements: "finora_disbursements",
        payments: "finora_payments",
        paymentAllocations: "finora_payment_allocations",
        supportTickets: "finora_support_tickets",
        auditLogs: "finora_audit_logs"
    })
});


/* ============================================================================
   2. INITIALIZE SUPABASE
   ============================================================================ */

if (
    !FINORA_CONFIG.supabaseUrl.startsWith("https://") ||
    !FINORA_CONFIG.supabaseKey ||
    FINORA_CONFIG.supabaseKey.includes("REPLACE_WITH")
) {
    throw new Error(
        "FINORA: กรุณาตรวจสอบ Supabase URL และ Publishable key"
    );
}

const supabase = createClient(
    FINORA_CONFIG.supabaseUrl,
    FINORA_CONFIG.supabaseKey,
    {
        auth: {
            autoRefreshToken: true,
            persistSession: true,
            detectSessionInUrl: true,
            flowType: "pkce"
        },

        global: {
            headers: {
                "X-Client-Info": "finora-web-client"
            }
        },

        db: {
            schema: "public"
        }
    }
);


/* ============================================================================
   3. APPLICATION STATE
   ============================================================================ */

const FINORA_STATE = {
    initialized: false,

    initializing: null,

    session: null,

    user: null,

    profile: null,

    authSubscription: null,

    authListeners: new Set(),

    lastError: null
};


/* ============================================================================
   4. ERROR HANDLING
   ============================================================================ */

/**
 * Convert technical errors into user-friendly Thai messages.
 *
 * The original error is retained for diagnostic purposes but must not be
 * shown directly to end users because it may contain implementation details.
 */
function getFriendlyErrorMessage(error) {
    const message = String(
        error?.message ||
        error?.error_description ||
        error?.details ||
        error ||
        ""
    );

    const normalized = message.toLowerCase();

    if (
        normalized.includes("invalid login credentials") ||
        normalized.includes("invalid credentials")
    ) {
        return "อีเมลหรือรหัสผ่านไม่ถูกต้อง";
    }

    if (
        normalized.includes("email not confirmed") ||
        normalized.includes("email_not_confirmed")
    ) {
        return "กรุณายืนยันอีเมลก่อนเข้าสู่ระบบ";
    }

    if (
        normalized.includes("user already registered") ||
        normalized.includes("already registered")
    ) {
        return "อีเมลนี้สมัครสมาชิกแล้ว กรุณาเข้าสู่ระบบ";
    }

    if (
        normalized.includes("password should be") ||
        normalized.includes("password must")
    ) {
        return "รหัสผ่านไม่ผ่านเงื่อนไขที่ระบบกำหนด";
    }

    if (
        normalized.includes("rate limit") ||
        normalized.includes("too many requests")
    ) {
        return "มีการร้องขอหลายครั้งเกินไป กรุณารอสักครู่แล้วลองใหม่";
    }

    if (
        normalized.includes("network") ||
        normalized.includes("failed to fetch") ||
        normalized.includes("fetch failed")
    ) {
        return "เชื่อมต่อระบบไม่สำเร็จ กรุณาตรวจสอบอินเทอร์เน็ต";
    }

    if (
        normalized.includes("permission denied") ||
        normalized.includes("row-level security") ||
        normalized.includes("rls") ||
        normalized.includes("not allowed")
    ) {
        return "คุณไม่มีสิทธิ์ดำเนินการนี้ หรือข้อมูลไม่ผ่านเงื่อนไขความปลอดภัย";
    }

    if (
        normalized.includes("jwt expired") ||
        normalized.includes("token is expired") ||
        normalized.includes("session_not_found")
    ) {
        return "เซสชันหมดอายุ กรุณาเข้าสู่ระบบใหม่";
    }

    if (
        normalized.includes("duplicate key") ||
        normalized.includes("unique constraint")
    ) {
        return "ข้อมูลนี้มีอยู่ในระบบแล้ว";
    }

    if (
        normalized.includes("foreign key") ||
        normalized.includes("violates foreign key")
    ) {
        return "ข้อมูลที่อ้างอิงไม่ถูกต้อง หรือไม่มีข้อมูลดังกล่าวในระบบ";
    }

    if (
        normalized.includes("invalid input syntax") ||
        normalized.includes("invalid input value")
    ) {
        return "รูปแบบข้อมูลไม่ถูกต้อง กรุณาตรวจสอบข้อมูลอีกครั้ง";
    }

    if (
        normalized.includes("bucket not found") ||
        normalized.includes("object not found")
    ) {
        return "ไม่พบไฟล์ที่ร้องขอ หรือไฟล์ไม่มีอยู่ในระบบ";
    }

    return "ระบบไม่สามารถดำเนินการได้ในขณะนี้ กรุณาลองใหม่อีกครั้ง";
}


/**
 * Central error handler.
 *
 * Logs technical details to the browser console while displaying a generic
 * message to the user.
 */
function handleError(error, options = {}) {
    const {
        showMessage = true,
        context = "FINORA"
    } = options;

    FINORA_STATE.lastError = error;

    console.error(`[${context}]`, error);

    const friendlyMessage = getFriendlyErrorMessage(error);

    if (showMessage) {
        setStatus(friendlyMessage, "error");
    }

    return {
        success: false,
        message: friendlyMessage,
        error
    };
}


/**
 * Create a predictable application error.
 */
function createFinoraError(message, code = "FINORA_ERROR") {
    const error = new Error(message);

    error.name = "FinoraError";
    error.code = code;

    return error;
}


/**
 * Run an asynchronous task with centralized error handling.
 */
async function safelyRun(task, options = {}) {
    try {
        return await task();
    } catch (error) {
        handleError(error, options);
        throw error;
    }
}


/* ============================================================================
   5. GENERAL UTILITIES
   ============================================================================ */

/**
 * Return the application's configured URL.
 */
function getAppUrl() {
    return FINORA_CONFIG.appUrl;
}


/**
 * Return the current page URL without query parameters or a hash fragment.
 *
 * This works with the repository path:
 * https://handsomesingha-sys.github.io/finora/
 */
function getCurrentPageUrl() {
    return `${window.location.origin}${window.location.pathname}`;
}


/**
 * Get an element by ID without throwing if it does not exist.
 */
function getElement(id) {
    if (!id) {
        return null;
    }

    return document.getElementById(id);
}


/**
 * Safely set text content.
 *
 * This intentionally uses textContent rather than innerHTML.
 */
function setText(elementOrId, value) {
    const element = typeof elementOrId === "string"
        ? getElement(elementOrId)
        : elementOrId;

    if (!element) {
        return false;
    }

    element.textContent = value == null ? "" : String(value);

    return true;
}


/**
 * Escape a value for HTML text contexts.
 *
 * Prefer textContent when writing directly to an element.
 */
function escapeHtml(value) {
    return String(value ?? "")
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#39;");
}


/**
 * Validate email addresses at a basic client-side level.
 *
 * Supabase Auth remains responsible for server-side verification.
 */
function isValidEmail(email) {
    if (typeof email !== "string") {
        return false;
    }

    const normalized = email.trim();

    return (
        normalized.length <= 254 &&
        /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized)
    );
}


/**
 * Normalize and validate a required string.
 */
function requireString(value, fieldName, options = {}) {
    const {
        minLength = 1,
        maxLength = 1000,
        trim = true
    } = options;

    let normalized = value;

    if (typeof normalized !== "string") {
        throw createFinoraError(
            `กรุณากรอก${fieldName}`,
            "VALIDATION_REQUIRED"
        );
    }

    if (trim) {
        normalized = normalized.trim();
    }

    if (normalized.length < minLength) {
        throw createFinoraError(
            `กรุณากรอก${fieldName}ให้ครบถ้วน`,
            "VALIDATION_REQUIRED"
        );
    }

    if (normalized.length > maxLength) {
        throw createFinoraError(
            `${fieldName}ยาวเกินกว่าที่ระบบกำหนด`,
            "VALIDATION_MAX_LENGTH"
        );
    }

    return normalized;
}


/**
 * Validate a positive or non-negative number.
 */
function requireNumber(value, fieldName, options = {}) {
    const {
        minimum = 0,
        maximum = Number.MAX_SAFE_INTEGER,
        allowZero = false,
        integer = false
    } = options;

    if (
        value === "" ||
        value === null ||
        value === undefined
    ) {
        throw createFinoraError(
            `กรุณากรอก${fieldName}`,
            "VALIDATION_REQUIRED"
        );
    }

    const number = Number(value);

    if (!Number.isFinite(number)) {
        throw createFinoraError(
            `${fieldName}ต้องเป็นตัวเลข`,
            "VALIDATION_NUMBER"
        );
    }

    if (integer && !Number.isInteger(number)) {
        throw createFinoraError(
            `${fieldName}ต้องเป็นจำนวนเต็ม`,
            "VALIDATION_INTEGER"
        );
    }

    if (allowZero ? number < minimum : number <= minimum - 1) {
        throw createFinoraError(
            `${fieldName}ต่ำกว่าค่าที่ระบบกำหนด`,
            "VALIDATION_MINIMUM"
        );
    }

    if (number < minimum || number > maximum) {
        throw createFinoraError(
            `${fieldName}อยู่นอกช่วงที่ระบบกำหนด`,
            "VALIDATION_RANGE"
        );
    }

    return number;
}


/**
 * Convert optional numbers into null when they are not provided.
 */
function optionalNumber(value, fieldName, options = {}) {
    if (value === "" || value === null || value === undefined) {
        return null;
    }

    return requireNumber(value, fieldName, {
        ...options,
        allowZero: true,
        minimum: 0
    });
}


/**
 * Generate a random identifier for client-side file names.
 *
 * This ID is not used as an authorization credential.
 */
function generateClientId() {
    if (
        typeof crypto !== "undefined" &&
        typeof crypto.randomUUID === "function"
    ) {
        return crypto.randomUUID();
    }

    return [
        Date.now().toString(36),
        Math.random().toString(36).slice(2),
        Math.random().toString(36).slice(2)
    ].join("-");
}


/**
 * Convert an error into a standardized result when a function is called
 * from an event handler or from another page script.
 */
function makeResult(data = null, error = null) {
    return {
        success: !error,
        data,
        error,
        message: error
            ? getFriendlyErrorMessage(error)
            : "ดำเนินการสำเร็จ"
    };
}


/**
 * Format numbers as Thai Baht.
 */
function formatCurrency(value) {
    const amount = Number(value);

    if (!Number.isFinite(amount)) {
        return "—";
    }

    return new Intl.NumberFormat("th-TH", {
        style: "currency",
        currency: "THB",
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
    }).format(amount);
}


/**
 * Format dates for Thai-language display.
 */
function formatDate(value, options = {}) {
    if (!value) {
        return "—";
    }

    const date = new Date(value);

    if (Number.isNaN(date.getTime())) {
        return "—";
    }

    return new Intl.DateTimeFormat("th-TH", {
        dateStyle: "medium",
        ...options
    }).format(date);
}


/**
 * Format timestamps.
 */
function formatDateTime(value) {
    if (!value) {
        return "—";
    }

    const date = new Date(value);

    if (Number.isNaN(date.getTime())) {
        return "—";
    }

    return new Intl.DateTimeFormat("th-TH", {
        dateStyle: "medium",
        timeStyle: "short"
    }).format(date);
}


/**
 * Return an input value without throwing when a field does not exist.
 */
function getFormValue(formData, name) {
    const value = formData.get(name);

    return typeof value === "string"
        ? value.trim()
        : value;
}


/**
 * Read a checkbox value from a FormData object.
 */
function isChecked(formData, name) {
    const value = formData.get(name);

    return (
        value === "on" ||
        value === "true" ||
        value === "1"
    );
}


/* ============================================================================
   6. STATUS MESSAGES AND PAGE EVENTS
   ============================================================================ */

/**
 * Display an application message.
 *
 * Compatible HTML example:
 * <p data-finora-status role="status"></p>
 */
function setStatus(message, type = "info") {
    const statusElements = document.querySelectorAll(
        "[data-finora-status]"
    );

    statusElements.forEach((element) => {
        element.textContent = String(message ?? "");

        element.dataset.statusType = type;

        element.setAttribute(
            "aria-live",
            type === "error" ? "assertive" : "polite"
        );
    });

    window.dispatchEvent(
        new CustomEvent("finora:status", {
            detail: {
                message: String(message ?? ""),
                type
            }
        })
    );
}


/**
 * Notify page scripts when a FINORA operation has completed.
 */
function dispatchFinoraEvent(name, detail = {}) {
    window.dispatchEvent(
        new CustomEvent(`finora:${name}`, {
            detail
        })
    );
}


/* ============================================================================
   7. AUTHENTICATION AND SESSION MANAGEMENT
   ============================================================================ */

/**
 * Return the current Supabase session.
 *
 * This reads the client session. For authoritative user verification,
 * use getCurrentUser(), which calls Supabase Auth.
 */
async function getSession() {
    const { data, error } = await supabase.auth.getSession();

    if (error) {
        throw error;
    }

    FINORA_STATE.session = data.session ?? null;

    return FINORA_STATE.session;
}


/**
 * Return the authenticated user verified by Supabase Auth.
 */
async function getCurrentUser() {
    const { data, error } = await supabase.auth.getUser();

    if (error) {
        throw error;
    }

    FINORA_STATE.user = data.user ?? null;

    return FINORA_STATE.user;
}


/**
 * Require an authenticated user before performing a protected operation.
 */
async function requireAuthenticatedUser() {
    const user = await getCurrentUser();

    if (!user) {
        throw createFinoraError(
            "กรุณาเข้าสู่ระบบก่อนดำเนินการ",
            "AUTH_REQUIRED"
        );
    }

    return user;
}


/**
 * Require a verified email before submitting financial applications.
 */
async function requireVerifiedEmail() {
    const user = await requireAuthenticatedUser();

    if (!user.email_confirmed_at) {
        throw createFinoraError(
            "กรุณายืนยันอีเมลก่อนยื่นคำขอสินเชื่อ",
            "EMAIL_NOT_VERIFIED"
        );
    }

    return user;
}


/**
 * Register a new account.
 *
 * Metadata is used only for profile information.
 * It must never be used to grant administrative roles.
 *
 * Compatible form names:
 * - email
 * - password
 * - username
 * - full_name
 * - phone
 */
async function signUp(formValues = {}) {
    const email = requireString(
        formValues.email,
        "อีเมล",
        { maxLength: 254 }
    ).toLowerCase();

    if (!isValidEmail(email)) {
        throw createFinoraError(
            "รูปแบบอีเมลไม่ถูกต้อง",
            "VALIDATION_EMAIL"
        );
    }

    const password = requireString(
        formValues.password,
        "รหัสผ่าน",
        {
            minLength: FINORA_CONFIG.passwordMinLength,
            maxLength: 128
        }
    );

    const metadata = {
        username: formValues.username
            ? String(formValues.username).trim().slice(0, 40)
            : null,

        full_name: formValues.full_name
            ? String(formValues.full_name).trim().slice(0, 150)
            : null,

        phone: formValues.phone
            ? String(formValues.phone).trim().slice(0, 30)
            : null
    };

    const { data, error } = await supabase.auth.signUp({
        email,
        password,

        options: {
            emailRedirectTo: getCurrentPageUrl(),

            data: metadata
        }
    });

    if (error) {
        throw error;
    }

    if (data.session) {
        FINORA_STATE.session = data.session;
        FINORA_STATE.user = data.user;

        await refreshProfile();
    }

    setStatus(
        data.session
            ? "สมัครสมาชิกสำเร็จ"
            : "สมัครสมาชิกแล้ว กรุณาตรวจสอบอีเมลเพื่อยืนยันบัญชี",
        "success"
    );

    dispatchFinoraEvent("signup", {
        userId: data.user?.id ?? null,
        email
    });

    return data;
}


/**
 * Sign in with email and password.
 */
async function signIn(emailValue, passwordValue) {
    const email = requireString(
        emailValue,
        "อีเมล",
        { maxLength: 254 }
    ).toLowerCase();

    const password = requireString(
        passwordValue,
        "รหัสผ่าน",
        { maxLength: 128 }
    );

    if (!isValidEmail(email)) {
        throw createFinoraError(
            "รูปแบบอีเมลไม่ถูกต้อง",
            "VALIDATION_EMAIL"
        );
    }

    const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password
    });

    if (error) {
        throw error;
    }

    FINORA_STATE.session = data.session;
    FINORA_STATE.user = data.user;

    const profile = await refreshProfile();

    if (
        profile &&
        profile.account_status &&
        profile.account_status !== "active"
    ) {
        await supabase.auth.signOut();

        FINORA_STATE.session = null;
        FINORA_STATE.user = null;
        FINORA_STATE.profile = null;

        throw createFinoraError(
            "บัญชีนี้ยังไม่สามารถใช้งานได้ กรุณาติดต่อเจ้าหน้าที่",
            "ACCOUNT_INACTIVE"
        );
    }

    setStatus("เข้าสู่ระบบสำเร็จ", "success");

    dispatchFinoraEvent("signin", {
        userId: data.user.id,
        email: data.user.email
    });

    return data;
}


/**
 * Sign out the current user.
 */
async function signOut() {
    const { error } = await supabase.auth.signOut();

    if (error) {
        throw error;
    }

    FINORA_STATE.session = null;
    FINORA_STATE.user = null;
    FINORA_STATE.profile = null;

    refreshAuthUI();

    setStatus("ออกจากระบบเรียบร้อยแล้ว", "success");

    dispatchFinoraEvent("signout");

    return true;
}


/**
 * Request a password recovery email.
 *
 * The redirect URL must be included in Supabase Authentication Redirect URLs.
 */
async function requestPasswordReset(emailValue) {
    const email = requireString(
        emailValue,
        "อีเมล",
        { maxLength: 254 }
    ).toLowerCase();

    if (!isValidEmail(email)) {
        throw createFinoraError(
            "รูปแบบอีเมลไม่ถูกต้อง",
            "VALIDATION_EMAIL"
        );
    }

    const { error } = await supabase.auth.resetPasswordForEmail(
        email,
        {
            redirectTo: getCurrentPageUrl()
        }
    );

    if (error) {
        throw error;
    }

    setStatus(
        "หากอีเมลนี้สามารถรับการกู้คืนได้ ระบบจะส่งคำแนะนำไปให้ทางอีเมล",
        "success"
    );

    return true;
}


/**
 * Change the password after the recovery flow establishes a valid session.
 */
async function updatePassword(passwordValue, confirmPasswordValue) {
    const password = requireString(
        passwordValue,
        "รหัสผ่านใหม่",
        {
            minLength: FINORA_CONFIG.passwordMinLength,
            maxLength: 128
        }
    );

    const confirmPassword = requireString(
        confirmPasswordValue,
        "ยืนยันรหัสผ่านใหม่",
        { maxLength: 128 }
    );

    if (password !== confirmPassword) {
        throw createFinoraError(
            "รหัสผ่านทั้งสองช่องไม่ตรงกัน",
            "PASSWORD_MISMATCH"
        );
    }

    const user = await requireAuthenticatedUser();

    const { data, error } = await supabase.auth.updateUser({
        password
    });

    if (error) {
        throw error;
    }

    setStatus("เปลี่ยนรหัสผ่านสำเร็จ", "success");

    dispatchFinoraEvent("password-updated", {
        userId: user.id
    });

    return data;
}


/**
 * Verify an OTP when using an email OTP template.
 *
 * Supported types depend on the requested authentication flow.
 * For signup confirmation, pass type="email".
 */
async function verifyEmailOtp(emailValue, tokenValue, type = "email") {
    const email = requireString(
        emailValue,
        "อีเมล",
        { maxLength: 254 }
    ).toLowerCase();

    const token = requireString(
        tokenValue,
        "รหัสยืนยัน",
        { maxLength: 20 }
    );

    if (!isValidEmail(email)) {
        throw createFinoraError(
            "รูปแบบอีเมลไม่ถูกต้อง",
            "VALIDATION_EMAIL"
        );
    }

    const { data, error } = await supabase.auth.verifyOtp({
        email,
        token,
        type
    });

    if (error) {
        throw error;
    }

    FINORA_STATE.session = data.session ?? null;
    FINORA_STATE.user = data.user ?? null;

    if (data.user) {
        await refreshProfile();
    }

    setStatus("ยืนยันรหัสเรียบร้อยแล้ว", "success");

    return data;
}


/**
 * Sign in through an enabled OAuth provider.
 *
 * The provider must first be enabled and configured in Supabase.
 */
async function signInWithOAuth(provider) {
    const permittedProviders = [
        "google",
        "github",
        "azure",
        "facebook",
        "discord",
        "apple"
    ];

    if (!permittedProviders.includes(provider)) {
        throw createFinoraError(
            "ผู้ให้บริการเข้าสู่ระบบนี้ยังไม่รองรับ",
            "OAUTH_PROVIDER_INVALID"
        );
    }

    const { data, error } = await supabase.auth.signInWithOAuth({
        provider,

        options: {
            redirectTo: getCurrentPageUrl()
        }
    });

    if (error) {
        throw error;
    }

    return data;
}


/**
 * Subscribe to application-level authentication events.
 */
function onAuthChange(callback) {
    if (typeof callback !== "function") {
        throw new TypeError("callback must be a function");
    }

    FINORA_STATE.authListeners.add(callback);

    return () => {
        FINORA_STATE.authListeners.delete(callback);
    };
}


/* ============================================================================
   8. USER PROFILE MANAGEMENT
   ============================================================================ */

/*
 * Do not include national_id in browser profile queries.
 * The database deliberately restricts access to that sensitive field.
 */
const PROFILE_SELECT_FIELDS = [
    "user_id",
    "username",
    "title",
    "full_name",
    "phone",
    "date_of_birth",
    "kyc_status",
    "account_status",
    "created_at",
    "updated_at",
    "email",
    "email_verified_at",
    "line_subject",
    "terms_version_accepted",
    "privacy_notice_version_acknowledged"
].join(",");


/**
 * Get the current user's profile.
 */
async function getMyProfile() {
    const user = await requireAuthenticatedUser();

    const { data, error } = await supabase
        .from(FINORA_CONFIG.tables.profiles)
        .select(PROFILE_SELECT_FIELDS)
        .eq("user_id", user.id)
        .maybeSingle();

    if (error) {
        throw error;
    }

    FINORA_STATE.profile = data ?? null;

    return FINORA_STATE.profile;
}


/**
 * Refresh the current user's profile.
 *
 * A missing row is returned as null; the function does not try to create
 * arbitrary profile rows. Profile creation is handled by the database trigger.
 */
async function refreshProfile() {
    try {
        const session = await getSession();

        if (!session?.user) {
            FINORA_STATE.profile = null;
            refreshAuthUI();

            return null;
        }

        const profile = await getMyProfile();

        refreshAuthUI();

        dispatchFinoraEvent("profile-loaded", {
            profile
        });

        return profile;
    } catch (error) {
        handleError(error, {
            context: "refreshProfile",
            showMessage: false
        });

        FINORA_STATE.profile = null;

        return null;
    }
}


/**
 * Update only profile fields that are allowed to be changed by the user.
 *
 * national_id, kyc_status, account_status, and user roles are deliberately
 * excluded. These must never be changed through this browser function.
 */
async function updateMyProfile(values = {}) {
    const user = await requireAuthenticatedUser();

    const allowedFields = [
        "username",
        "title",
        "full_name",
        "phone",
        "date_of_birth"
    ];

    const updatePayload = {};

    for (const field of allowedFields) {
        if (!Object.prototype.hasOwnProperty.call(values, field)) {
            continue;
        }

        const value = values[field];

        if (value === null || value === "") {
            updatePayload[field] = null;
            continue;
        }

        if (typeof value !== "string") {
            throw createFinoraError(
                `ข้อมูล ${field} ไม่ถูกต้อง`,
                "PROFILE_INVALID_FIELD"
            );
        }

        updatePayload[field] = value.trim();
    }

    if (Object.keys(updatePayload).length === 0) {
        throw createFinoraError(
            "ไม่มีข้อมูลที่ต้องการแก้ไข",
            "PROFILE_EMPTY_UPDATE"
        );
    }

    if (
        updatePayload.username &&
        updatePayload.username.length > 40
    ) {
        throw createFinoraError(
            "ชื่อผู้ใช้ต้องมีความยาวไม่เกิน 40 ตัวอักษร",
            "PROFILE_USERNAME_TOO_LONG"
        );
    }

    if (
        updatePayload.full_name &&
        updatePayload.full_name.length > 150
    ) {
        throw createFinoraError(
            "ชื่อ-นามสกุลยาวเกินกว่าที่ระบบกำหนด",
            "PROFILE_FULL_NAME_TOO_LONG"
        );
    }

    if (
        updatePayload.phone &&
        updatePayload.phone.length > 30
    ) {
        throw createFinoraError(
            "หมายเลขโทรศัพท์ยาวเกินกว่าที่ระบบกำหนด",
            "PROFILE_PHONE_TOO_LONG"
        );
    }

    if (updatePayload.date_of_birth) {
        const date = new Date(updatePayload.date_of_birth);

        if (Number.isNaN(date.getTime())) {
            throw createFinoraError(
                "วันเกิดไม่ถูกต้อง",
                "PROFILE_DATE_INVALID"
            );
        }

        if (date.getTime() > Date.now()) {
            throw createFinoraError(
                "วันเกิดต้องไม่เป็นวันที่ในอนาคต",
                "PROFILE_DATE_IN_FUTURE"
            );
        }
    }

    const { data, error } = await supabase
        .from(FINORA_CONFIG.tables.profiles)
        .update(updatePayload)
        .eq("user_id", user.id)
        .select(PROFILE_SELECT_FIELDS)
        .maybeSingle();

    if (error) {
        throw error;
    }

    if (!data) {
        throw createFinoraError(
            "ไม่สามารถบันทึกโปรไฟล์ได้ กรุณาตรวจสอบสิทธิ์และข้อมูลบัญชี",
            "PROFILE_UPDATE_NOT_APPLIED"
        );
    }

    FINORA_STATE.profile = data;

    setStatus("บันทึกข้อมูลโปรไฟล์สำเร็จ", "success");

    dispatchFinoraEvent("profile-updated", {
        profile: data
    });

    return data;
}


/* ============================================================================
   9. LEGAL DOCUMENTS AND CONSENT RECORDS
   ============================================================================ */

/**
 * Retrieve the latest published version of a legal document.
 *
 * Draft documents are never treated as published legal notices.
 */
async function getPublishedLegalDocument(documentType) {
    const allowedTypes = [
        FINORA_CONFIG.legalDocumentTypes.terms,
        FINORA_CONFIG.legalDocumentTypes.privacy
    ];

    if (!allowedTypes.includes(documentType)) {
        throw createFinoraError(
            "ประเภทเอกสารไม่ถูกต้อง",
            "LEGAL_DOCUMENT_TYPE_INVALID"
        );
    }

    const { data, error } = await supabase
        .from(FINORA_CONFIG.tables.documents)
        .select(
            "id,document_type,version,title,body,effective_at,published,created_at"
        )
        .eq("document_type", documentType)
        .eq("published", true)
        .order("effective_at", {
            ascending: false,
            nullsFirst: false
        })
        .order("created_at", {
            ascending: false
        })
        .limit(1)
        .maybeSingle();

    if (error) {
        throw error;
    }

    return data ?? null;
}


/**
 * Get the currently published terms and privacy notice.
 */
async function getPublishedLegalDocuments() {
    const [terms, privacy] = await Promise.all([
        getPublishedLegalDocument(
            FINORA_CONFIG.legalDocumentTypes.terms
        ),

        getPublishedLegalDocument(
            FINORA_CONFIG.legalDocumentTypes.privacy
        )
    ]);

    return {
        terms,
        privacy,
        ready: Boolean(terms && privacy)
    };
}


/**
 * Record a consent event for a published legal document.
 *
 * The consent version is read from the database, not supplied arbitrarily
 * by a browser field.
 */
async function recordConsent(documentType, action = "accepted") {
    const user = await requireAuthenticatedUser();

    const permittedActions = [
        "accepted",
        "withdrawn",
        "acknowledged"
    ];

    if (!permittedActions.includes(action)) {
        throw createFinoraError(
            "ประเภทการยินยอมไม่ถูกต้อง",
            "CONSENT_ACTION_INVALID"
        );
    }

    const document = await getPublishedLegalDocument(documentType);

    if (!document) {
        throw createFinoraError(
            "เอกสารฉบับนี้ยังไม่ได้เผยแพร่ จึงยังไม่สามารถบันทึกการยินยอมได้",
            "LEGAL_DOCUMENT_NOT_PUBLISHED"
        );
    }

    const payload = {
        user_id: user.id,
        document_id: document.id,
        action,
        document_version: document.version,
        source: "web"
    };

    const { data, error } = await supabase
        .from(FINORA_CONFIG.tables.consentRecords)
        .insert(payload)
        .select(
            "id,user_id,document_id,action,document_version,source,recorded_at"
        )
        .single();

    if (error) {
        throw error;
    }

    dispatchFinoraEvent("consent-recorded", {
        documentType,
        action,
        version: document.version
    });

    return data;
}


/**
 * Record both terms acceptance and privacy acknowledgement.
 *
 * Each consent is a separate database record.
 */
async function recordRequiredConsents(options = {}) {
    const {
        acceptTerms = false,
        acknowledgePrivacy = false
    } = options;

    if (acceptTerms !== true) {
        throw createFinoraError(
            "กรุณายอมรับข้อกำหนดการใช้งาน",
            "TERMS_NOT_ACCEPTED"
        );
    }

    if (acknowledgePrivacy !== true) {
        throw createFinoraError(
            "กรุณารับทราบประกาศความเป็นส่วนตัว",
            "PRIVACY_NOT_ACKNOWLEDGED"
        );
    }

    const legal = await getPublishedLegalDocuments();

    if (!legal.ready) {
        throw createFinoraError(
            "ระบบยังไม่มีข้อกำหนดการใช้งานหรือประกาศความเป็นส่วนตัวฉบับเผยแพร่",
            "LEGAL_DOCUMENTS_NOT_READY"
        );
    }

    const termsRecord = await recordConsent(
        FINORA_CONFIG.legalDocumentTypes.terms,
        "accepted"
    );

    const privacyRecord = await recordConsent(
        FINORA_CONFIG.legalDocumentTypes.privacy,
        "acknowledged"
    );

    return {
        termsRecord,
        privacyRecord
    };
}


/* ============================================================================
   10. LOAN PRODUCTS
   ============================================================================ */

/**
 * List active loan products.
 *
 * Only active records are returned. No sample products are fabricated.
 */
async function getActiveLoanProducts() {
    const { data, error } = await supabase
        .from(FINORA_CONFIG.tables.loanProducts)
        .select(
            [
                "id",
                "code",
                "name",
                "description",
                "min_amount",
                "max_amount",
                "min_term_months",
                "max_term_months",
                "interest_method",
                "nominal_annual_rate",
                "fees_disclosure",
                "eligibility",
                "status",
                "created_at",
                "updated_at"
            ].join(",")
        )
        .eq("status", "active")
        .order("created_at", {
            ascending: false
        });

    if (error) {
        throw error;
    }

    return data ?? [];
}


/**
 * Retrieve one active loan product.
 */
async function getActiveLoanProduct(productId) {
    const id = requireString(
        productId,
        "ผลิตภัณฑ์สินเชื่อ",
        { maxLength: 100 }
    );

    const { data, error } = await supabase
        .from(FINORA_CONFIG.tables.loanProducts)
        .select(
            [
                "id",
                "code",
                "name",
                "description",
                "min_amount",
                "max_amount",
                "min_term_months",
                "max_term_months",
                "interest_method",
                "nominal_annual_rate",
                "fees_disclosure",
                "eligibility",
                "status"
            ].join(",")
        )
        .eq("id", id)
        .eq("status", "active")
        .maybeSingle();

    if (error) {
        throw error;
    }

    if (!data) {
        throw createFinoraError(
            "ไม่พบผลิตภัณฑ์สินเชื่อที่เปิดให้สมัคร",
            "LOAN_PRODUCT_NOT_FOUND"
        );
    }

    return data;
}


/* ============================================================================
   11. LOAN APPLICATIONS
   ============================================================================ */

/**
 * List the current user's loan applications.
 *
 * RLS must restrict the returned records to the permitted user.
 */
async function getMyLoanApplications(options = {}) {
    const user = await requireAuthenticatedUser();

    const page = Math.max(
        1,
        Number.parseInt(options.page ?? "1", 10) || 1
    );

    const pageSize = Math.min(
        FINORA_CONFIG.maxPageSize,
        Math.max(
            1,
            Number.parseInt(
                options.pageSize ??
                FINORA_CONFIG.defaultPageSize,
                10
            ) || FINORA_CONFIG.defaultPageSize
        )
    );

    const from = (page - 1) * pageSize;
    const to = from + pageSize - 1;

    const { data, error, count } = await supabase
        .from(FINORA_CONFIG.tables.loanApplications)
        .select(
            [
                "id",
                "application_no",
                "borrower_id",
                "product_id",
                "requested_amount",
                "requested_term_months",
                "purpose",
                "employment_type",
                "monthly_income",
                "monthly_expenses",
                "other_debt_payments",
                "status",
                "submitted_at",
                "created_at",
                "updated_at"
            ].join(","),
            {
                count: "exact"
            }
        )
        .eq("borrower_id", user.id)
        .order("created_at", {
            ascending: false
        })
        .range(from, to);

    if (error) {
        throw error;
    }

    return {
        data: data ?? [],
        page,
        pageSize,
        count: count ?? 0,
        totalPages: Math.ceil((count ?? 0) / pageSize)
    };
}


/**
 * Retrieve one application owned by the current user.
 */
async function getMyLoanApplication(applicationId) {
    const user = await requireAuthenticatedUser();

    const id = requireString(
        applicationId,
        "เลขที่คำขอสินเชื่อ",
        { maxLength: 100 }
    );

    const { data, error } = await supabase
        .from(FINORA_CONFIG.tables.loanApplications)
        .select("*")
        .eq("id", id)
        .eq("borrower_id", user.id)
        .maybeSingle();

    if (error) {
        throw error;
    }

    if (!data) {
        throw createFinoraError(
            "ไม่พบคำขอสินเชื่อ หรือคุณไม่มีสิทธิ์เข้าถึง",
            "APPLICATION_NOT_FOUND"
        );
    }

    return data;
}


/**
 * Submit a loan application.
 *
 * Required form values:
 * - product_id
 * - requested_amount
 * - requested_term_months
 * - accept_terms
 * - acknowledge_privacy
 *
 * Optional form values:
 * - purpose
 * - employment_type
 * - monthly_income
 * - monthly_expenses
 * - other_debt_payments
 *
 * The database generates application_no.
 *
 * IMPORTANT:
 * - This function deliberately does not invent products or rates.
 * - Published legal documents are required before submission.
 * - The database must enforce the final authorization and business rules.
 */
async function submitLoanApplication(formValues = {}) {
    const user = await requireVerifiedEmail();

    const profile = await getMyProfile();

    if (!profile) {
        throw createFinoraError(
            "ไม่พบข้อมูลโปรไฟล์ กรุณาตรวจสอบบัญชีหรือติดต่อเจ้าหน้าที่",
            "PROFILE_NOT_FOUND"
        );
    }

    if (profile.account_status !== "active") {
        throw createFinoraError(
            "บัญชีของคุณยังไม่สามารถยื่นคำขอสินเชื่อได้",
            "ACCOUNT_NOT_ACTIVE"
        );
    }

    const productId = requireString(
        formValues.product_id,
        "ผลิตภัณฑ์สินเชื่อ",
        { maxLength: 100 }
    );

    const amount = requireNumber(
        formValues.requested_amount,
        "จำนวนเงินที่ต้องการกู้",
        {
            minimum: 0.01,
            maximum: 1000000000
        }
    );

    const termMonths = requireNumber(
        formValues.requested_term_months,
        "ระยะเวลาผ่อนชำระ",
        {
            minimum: 1,
            maximum: 600,
            integer: true
        }
    );

    const product = await getActiveLoanProduct(productId);

    if (
        amount < Number(product.min_amount) ||
        amount > Number(product.max_amount)
    ) {
        throw createFinoraError(
            "จำนวนเงินที่ขอกู้อยู่นอกช่วงของผลิตภัณฑ์สินเชื่อนี้",
            "LOAN_AMOUNT_OUT_OF_RANGE"
        );
    }

    if (
        termMonths < Number(product.min_term_months) ||
        termMonths > Number(product.max_term_months)
    ) {
        throw createFinoraError(
            "ระยะเวลาผ่อนชำระอยู่นอกเงื่อนไขของผลิตภัณฑ์สินเชื่อนี้",
            "LOAN_TERM_OUT_OF_RANGE"
        );
    }

    if (formValues.accept_terms !== true) {
        throw createFinoraError(
            "กรุณายอมรับข้อกำหนดการใช้งานก่อนยื่นคำขอ",
            "TERMS_NOT_ACCEPTED"
        );
    }

    if (formValues.acknowledge_privacy !== true) {
        throw createFinoraError(
            "กรุณารับทราบประกาศความเป็นส่วนตัวก่อนยื่นคำขอ",
            "PRIVACY_NOT_ACKNOWLEDGED"
        );
    }

    /*
     * Do not submit if current legal documents remain unpublished drafts.
     */
    await recordRequiredConsents({
        acceptTerms: true,
        acknowledgePrivacy: true
    });

    const purpose = formValues.purpose
        ? requireString(
            formValues.purpose,
            "วัตถุประสงค์การกู้",
            { maxLength: 2000 }
        )
        : null;

    const employmentType = formValues.employment_type
        ? requireString(
            formValues.employment_type,
            "ประเภทการทำงาน",
            { maxLength: 100 }
        )
        : null;

    const monthlyIncome = optionalNumber(
        formValues.monthly_income,
        "รายได้ต่อเดือน",
        { maximum: 1000000000 }
    );

    const monthlyExpenses = optionalNumber(
        formValues.monthly_expenses,
        "ค่าใช้จ่ายต่อเดือน",
        { maximum: 1000000000 }
    );

    const otherDebtPayments = optionalNumber(
        formValues.other_debt_payments,
        "ภาระหนี้สินต่อเดือน",
        { maximum: 1000000000 }
    );

    const payload = {
        borrower_id: user.id,
        product_id: product.id,
        requested_amount: amount,
        requested_term_months: termMonths,
        purpose,
        employment_type: employmentType,
        monthly_income: monthlyIncome,
        monthly_expenses: monthlyExpenses,
        other_debt_payments: otherDebtPayments,
        status: "submitted",
        submitted_at: new Date().toISOString()
    };

    const { data, error } = await supabase
        .from(FINORA_CONFIG.tables.loanApplications)
        .insert(payload)
        .select("*")
        .single();

    if (error) {
        throw error;
    }

    setStatus("ส่งคำขอสินเชื่อเรียบร้อยแล้ว", "success");

    dispatchFinoraEvent("loan-application-submitted", {
        applicationId: data.id,
        applicationNo: data.application_no
    });

    return data;
}


/* ============================================================================
   12. PRIVATE APPLICATION DOCUMENTS
   ============================================================================ */

/**
 * Validate a file before upload.
 */
function validateUploadFile(file) {
    if (!(file instanceof File)) {
        throw createFinoraError(
            "ไฟล์ที่เลือกไม่ถูกต้อง",
            "UPLOAD_INVALID_FILE"
        );
    }

    if (file.size <= 0) {
        throw createFinoraError(
            "ไฟล์ว่างเปล่า ไม่สามารถอัปโหลดได้",
            "UPLOAD_EMPTY_FILE"
        );
    }

    if (file.size > FINORA_CONFIG.maxUploadBytes) {
        throw createFinoraError(
            "ไฟล์มีขนาดเกิน 10 MB",
            "UPLOAD_FILE_TOO_LARGE"
        );
    }

    if (
        !FINORA_CONFIG.allowedUploadTypes.includes(file.type)
    ) {
        throw createFinoraError(
            "รองรับเฉพาะไฟล์ JPG, PNG, WEBP และ PDF",
            "UPLOAD_UNSUPPORTED_TYPE"
        );
    }

    return true;
}


/**
 * Create a safe file extension based on MIME type.
 */
function getFileExtension(file) {
    const extensions = {
        "image/jpeg": "jpg",
        "image/png": "png",
        "image/webp": "webp",
        "application/pdf": "pdf"
    };

    const extension = extensions[file.type];

    if (!extension) {
        throw createFinoraError(
            "ชนิดไฟล์ไม่รองรับ",
            "UPLOAD_EXTENSION_INVALID"
        );
    }

    return extension;
}


/**
 * Upload an application document to private storage.
 *
 * The storage path starts with the authenticated user's UUID to match
 * the storage ownership policy configured for FINORA.
 *
 * The function does not return a public URL.
 */
async function uploadApplicationDocument(options = {}) {
    const user = await requireAuthenticatedUser();

    const {
        applicationId,
        documentType,
        file
    } = options;

    if (!applicationId) {
        throw createFinoraError(
            "กรุณาระบุคำขอสินเชื่อ",
            "UPLOAD_APPLICATION_REQUIRED"
        );
    }

    const application = await getMyLoanApplication(applicationId);

    validateUploadFile(file);

    const normalizedDocumentType = requireString(
        documentType,
        "ประเภทเอกสาร",
        { maxLength: 100 }
    );

    const extension = getFileExtension(file);

    const generatedName = `${generateClientId()}.${extension}`;

    const objectPath = [
        user.id,
        application.id,
        generatedName
    ].join("/");

    const { data: uploadedFile, error: uploadError } =
        await supabase.storage
            .from(FINORA_CONFIG.storageBucket)
            .upload(objectPath, file, {
                cacheControl: "3600",
                contentType: file.type,
                upsert: false
            });

    if (uploadError) {
        throw uploadError;
    }

    try {
        const { data, error } = await supabase
            .from(FINORA_CONFIG.tables.applicationDocuments)
            .insert({
                application_id: application.id,
                borrower_id: user.id,
                document_type: normalizedDocumentType,
                storage_path: uploadedFile.path,
                review_status: "pending"
            })
            .select(
                [
                    "id",
                    "application_id",
                    "borrower_id",
                    "document_type",
                    "storage_path",
                    "review_status",
                    "created_at"
                ].join(",")
            )
            .single();

        if (error) {
            throw error;
        }

        setStatus("อัปโหลดเอกสารสำเร็จ", "success");

        dispatchFinoraEvent("application-document-uploaded", {
            documentId: data.id,
            applicationId: application.id
        });

        return data;
    } catch (databaseError) {
        /*
         * If the database record fails, remove the uploaded object so that
         * an inaccessible orphaned file is not left behind.
         */
        const { error: cleanupError } = await supabase.storage
            .from(FINORA_CONFIG.storageBucket)
            .remove([objectPath]);

        if (cleanupError) {
            console.error(
                "FINORA could not remove an orphaned upload",
                cleanupError
            );
        }

        throw databaseError;
    }
}


/**
 * List documents attached to the current user's loan application.
 *
 * No public storage URLs are returned.
 */
async function getMyApplicationDocuments(applicationId) {
    const application = await getMyLoanApplication(applicationId);

    const { data, error } = await supabase
        .from(FINORA_CONFIG.tables.applicationDocuments)
        .select(
            [
                "id",
                "application_id",
                "borrower_id",
                "document_type",
                "storage_path",
                "review_status",
                "review_note",
                "created_at"
            ].join(",")
        )
        .eq("application_id", application.id)
        .eq("borrower_id", application.borrower_id)
        .order("created_at", {
            ascending: false
        });

    if (error) {
        throw error;
    }

    return data ?? [];
}


/**
 * Download a private document.
 *
 * Returns a Blob. The caller controls how it is displayed or saved.
 */
async function downloadPrivateDocument(storagePath) {
    await requireAuthenticatedUser();

    const path = requireString(
        storagePath,
        "ตำแหน่งไฟล์",
        { maxLength: 1000 }
    );

    const { data, error } = await supabase.storage
        .from(FINORA_CONFIG.storageBucket)
        .download(path);

    if (error) {
        throw error;
    }

    return data;
}


/**
 * Generate a short-lived signed URL for a private document.
 *
 * Do not persist or publicly share signed URLs.
 */
async function getPrivateDocumentSignedUrl(
    storagePath,
    expiresInSeconds = 60
) {
    await requireAuthenticatedUser();

    const path = requireString(
        storagePath,
        "ตำแหน่งไฟล์",
        { maxLength: 1000 }
    );

    const duration = requireNumber(
        expiresInSeconds,
        "ระยะเวลาลิงก์",
        {
            minimum: 1,
            maximum: 300,
            integer: true
        }
    );

    const { data, error } = await supabase.storage
        .from(FINORA_CONFIG.storageBucket)
        .createSignedUrl(
            path,
            duration
        );

    if (error) {
        throw error;
    }

    return data.signedUrl;
}


/* ============================================================================
   13. BORROWER LOAN ACCOUNTS AND REPAYMENT SCHEDULES
   ============================================================================ */

/**
 * List loan accounts belonging to the authenticated borrower.
 */
async function getMyLoanAccounts() {
    const user = await requireAuthenticatedUser();

    const { data, error } = await supabase
        .from(FINORA_CONFIG.tables.loanAccounts)
        .select(
            [
                "id",
                "contract_id",
                "borrower_id",
                "principal_amount",
                "principal_outstanding",
                "status",
                "disbursed_at",
                "closed_at",
                "created_at"
            ].join(",")
        )
        .eq("borrower_id", user.id)
        .order("created_at", {
            ascending: false
        });

    if (error) {
        throw error;
    }

    return data ?? [];
}


/**
 * Get the repayment schedule for one of the current user's loan accounts.
 */
async function getMyRepaymentSchedule(loanAccountId) {
    const user = await requireAuthenticatedUser();

    const accountId = requireString(
        loanAccountId,
        "บัญชีสินเชื่อ",
        { maxLength: 100 }
    );

    const { data: account, error: accountError } = await supabase
        .from(FINORA_CONFIG.tables.loanAccounts)
        .select("id,borrower_id")
        .eq("id", accountId)
        .eq("borrower_id", user.id)
        .maybeSingle();

    if (accountError) {
        throw accountError;
    }

    if (!account) {
        throw createFinoraError(
            "ไม่พบบัญชีสินเชื่อ หรือคุณไม่มีสิทธิ์เข้าถึง",
            "LOAN_ACCOUNT_NOT_FOUND"
        );
    }

    const { data, error } = await supabase
        .from(FINORA_CONFIG.tables.repaymentSchedule)
        .select(
            [
                "id",
                "loan_account_id",
                "installment_no",
                "due_date",
                "principal_due",
                "interest_due",
                "fees_due",
                "amount_paid",
                "status",
                "created_at"
            ].join(",")
        )
        .eq("loan_account_id", account.id)
        .order("installment_no", {
            ascending: true
        });

    if (error) {
        throw error;
    }

    return data ?? [];
}


/**
 * List payments belonging to the current borrower.
 *
 * Payment creation and payment status changes must be performed through
 * authorized backend workflows, not by trusting browser-submitted amounts.
 */
async function getMyPayments() {
    const user = await requireAuthenticatedUser();

    const { data, error } = await supabase
        .from(FINORA_CONFIG.tables.payments)
        .select(
            [
                "id",
                "loan_account_id",
                "borrower_id",
                "amount",
                "provider",
                "provider_reference",
                "status",
                "paid_at",
                "created_at"
            ].join(",")
        )
        .eq("borrower_id", user.id)
        .order("created_at", {
            ascending: false
        });

    if (error) {
        throw error;
    }

    return data ?? [];
}


/* ============================================================================
   14. PUBLIC ANNOUNCEMENTS
   ============================================================================ */

/**
 * Fetch public announcements that are published and currently active.
 *
 * This function does not expose drafts through its normal query.
 */
async function getPublicAnnouncements(options = {}) {
    const limit = Math.min(
        50,
        Math.max(
            1,
            Number.parseInt(options.limit ?? "10", 10) || 10
        )
    );

    const now = new Date();

    const { data, error } = await supabase
        .from(FINORA_CONFIG.tables.announcements)
        .select(
            [
                "id",
                "title",
                "summary",
                "content_html",
                "image_path",
                "status",
                "starts_at",
                "ends_at",
                "priority",
                "created_at",
                "updated_at"
            ].join(",")
        )
        .eq("status", "published")
        .order("priority", {
            ascending: false
        })
        .order("created_at", {
            ascending: false
        })
        .limit(limit);

    if (error) {
        throw error;
    }

    return (data ?? []).filter((announcement) => {
        const start = announcement.starts_at
            ? new Date(announcement.starts_at)
            : null;

        const end = announcement.ends_at
            ? new Date(announcement.ends_at)
            : null;

        if (start && start > now) {
            return false;
        }

        if (end && end < now) {
            return false;
        }

        return true;
    });
}


/* ============================================================================
   15. CUSTOMER SUPPORT TICKETS
   ============================================================================ */

/**
 * Create a support ticket for the authenticated user.
 *
 * The database generates ticket_no.
 */
async function createSupportTicket(formValues = {}) {
    const user = await requireAuthenticatedUser();

    const category = requireString(
        formValues.category,
        "หมวดหมู่",
        { maxLength: 100 }
    );

    const subject = requireString(
        formValues.subject,
        "หัวข้อ",
        { maxLength: 200 }
    );

    const message = requireString(
        formValues.message,
        "รายละเอียด",
        { maxLength: 10000 }
    );

    const { data, error } = await supabase
        .from(FINORA_CONFIG.tables.supportTickets)
        .insert({
            user_id: user.id,
            category,
            subject,
            message,
            status: "open"
        })
        .select(
            [
                "id",
                "ticket_no",
                "user_id",
                "category",
                "subject",
                "message",
                "status",
                "assigned_to",
                "created_at",
                "updated_at"
            ].join(",")
        )
        .single();

    if (error) {
        throw error;
    }

    setStatus("ส่งข้อความถึงฝ่ายบริการเรียบร้อยแล้ว", "success");

    dispatchFinoraEvent("support-ticket-created", {
        ticketId: data.id,
        ticketNo: data.ticket_no
    });

    return data;
}


/**
 * List support tickets owned by the current user.
 */
async function getMySupportTickets() {
    const user = await requireAuthenticatedUser();

    const { data, error } = await supabase
        .from(FINORA_CONFIG.tables.supportTickets)
        .select(
            [
                "id",
                "ticket_no",
                "user_id",
                "category",
                "subject",
                "message",
                "status",
                "assigned_to",
                "created_at",
                "updated_at"
            ].join(",")
        )
        .eq("user_id", user.id)
        .order("created_at", {
            ascending: false
        });

    if (error) {
        throw error;
    }

    return data ?? [];
}


/* ============================================================================
   16. STAFF DASHBOARD DATA ACCESS
   ============================================================================ */

/**
 * List applications visible to an authorized staff member.
 *
 * Important security rules:
 * - This function does not grant staff privileges.
 * - RLS must determine which rows the current user can read.
 * - A borrower must not be allowed to read other borrowers' applications.
 * - The front end must not assign roles or approve itself as an administrator.
 */
async function getDashboardApplications(options = {}) {
    await requireAuthenticatedUser();

    const page = Math.max(
        1,
        Number.parseInt(options.page ?? "1", 10) || 1
    );

    const pageSize = Math.min(
        FINORA_CONFIG.maxPageSize,
        Math.max(
            1,
            Number.parseInt(
                options.pageSize ??
                FINORA_CONFIG.defaultPageSize,
                10
            ) || FINORA_CONFIG.defaultPageSize
        )
    );

    const from = (page - 1) * pageSize;
    const to = from + pageSize - 1;

    let query = supabase
        .from(FINORA_CONFIG.tables.loanApplications)
        .select("*", {
            count: "exact"
        })
        .order("created_at", {
            ascending: false
        })
        .range(from, to);

    if (options.status) {
        query = query.eq(
            "status",
            String(options.status).trim()
        );
    }

    const { data, error, count } = await query;

    if (error) {
        throw error;
    }

    /*
     * Returned rows are restricted by RLS.
     * UI code must not assume that being signed in means the user is staff.
     */
    return {
        data: data ?? [],
        page,
        pageSize,
        count: count ?? 0,
        totalPages: Math.ceil((count ?? 0) / pageSize)
    };
}


/**
 * Read the application review history for an application.
 *
 * The caller must already be allowed to view that application.
 * RLS still determines access to the review rows.
 */
async function getApplicationReviewHistory(applicationId) {
    const id = requireString(
        applicationId,
        "คำขอสินเชื่อ",
        { maxLength: 100 }
    );

    const { data, error } = await supabase
        .from(FINORA_CONFIG.tables.applicationReviews)
        .select(
            [
                "id",
                "application_id",
                "reviewer_id",
                "decision",
                "notes",
                "decided_amount",
                "decided_term_months",
                "decided_annual_rate",
                "created_at"
            ].join(",")
        )
        .eq("application_id", id)
        .order("created_at", {
            ascending: false
        });

    if (error) {
        throw error;
    }

    return data ?? [];
}


/* ============================================================================
   17. AUTHENTICATION UI STATE
   ============================================================================ */

/**
 * Update common HTML elements based on current authentication state.
 *
 * Supported data attributes:
 *
 * data-finora-show-when="signed-in"
 * data-finora-show-when="signed-out"
 * data-finora-user-email
 * data-finora-user-id
 * data-finora-profile-name
 * data-finora-account-status
 */
function refreshAuthUI() {
    const isSignedIn = Boolean(FINORA_STATE.session?.user);
    const user = FINORA_STATE.user ?? FINORA_STATE.session?.user ?? null;
    const profile = FINORA_STATE.profile;

    document.querySelectorAll("[data-finora-show-when]").forEach(
        (element) => {
            const requirement = element.dataset.finoraShowWhen;

            let visible = false;

            if (requirement === "signed-in") {
                visible = isSignedIn;
            } else if (requirement === "signed-out") {
                visible = !isSignedIn;
            }

            element.hidden = !visible;
        }
    );

    document.querySelectorAll("[data-finora-user-email]").forEach(
        (element) => {
            element.textContent = user?.email ?? "";
        }
    );

    document.querySelectorAll("[data-finora-user-id]").forEach(
        (element) => {
            element.textContent = user?.id ?? "";
        }
    );

    document.querySelectorAll("[data-finora-profile-name]").forEach(
        (element) => {
            element.textContent =
                profile?.full_name ||
                profile?.username ||
                user?.email ||
                "";
        }
    );

    document.querySelectorAll("[data-finora-account-status]").forEach(
        (element) => {
            element.textContent = profile?.account_status ?? "";
        }
    );

    document.querySelectorAll("[data-finora-logout]").forEach(
        (element) => {
            element.disabled = !isSignedIn;
        }
    );

    dispatchFinoraEvent("auth-ui-updated", {
        isSignedIn,
        user,
        profile
    });
}


/**
 * Wait for Supabase auth restoration and initialize common event handlers.
 */
async function initializeFinora() {
    if (FINORA_STATE.initialized) {
        return;
    }

    if (FINORA_STATE.initializing) {
        return FINORA_STATE.initializing;
    }

    FINORA_STATE.initializing = (async () => {
        try {
            const session = await getSession();

            FINORA_STATE.session = session;
            FINORA_STATE.user = session?.user ?? null;

            if (session?.user) {
                await refreshProfile();
            } else {
                FINORA_STATE.profile = null;
            }

            refreshAuthUI();

            bindFinoraForms();
            bindFinoraLogoutButtons();

            if (!FINORA_STATE.authSubscription) {
                const { data } = supabase.auth.onAuthStateChange(
                    (event, sessionValue) => {
                        /*
                         * Keep the callback synchronous.
                         * Do not await Supabase queries inside it.
                         */
                        FINORA_STATE.session = sessionValue ?? null;
                        FINORA_STATE.user =
                            sessionValue?.user ?? null;

                        if (!sessionValue) {
                            FINORA_STATE.profile = null;
                        }

                        refreshAuthUI();

                        dispatchFinoraEvent("auth-state-changed", {
                            event,
                            session: sessionValue ?? null
                        });

                        for (const listener of FINORA_STATE.authListeners) {
                            try {
                                listener(event, sessionValue ?? null);
                            } catch (listenerError) {
                                console.error(
                                    "FINORA auth listener error:",
                                    listenerError
                                );
                            }
                        }

                        /*
                         * Schedule profile loading outside the auth callback.
                         */
                        if (sessionValue?.user) {
                            window.setTimeout(() => {
                                refreshProfile();
                            }, 0);
                        }
                    }
                );

                FINORA_STATE.authSubscription =
                    data.subscription;
            }

            FINORA_STATE.initialized = true;

            dispatchFinoraEvent("ready", {
                appName: FINORA_CONFIG.appName,
                user: FINORA_STATE.user,
                profile: FINORA_STATE.profile
            });

            return true;
        } catch (error) {
            handleError(error, {
                context: "initializeFinora",
                showMessage: false
            });

            /*
             * Allow the page to continue rendering even if the session
             * cannot be loaded; protected API calls still require auth.
             */
            refreshAuthUI();

            return false;
        } finally {
            FINORA_STATE.initializing = null;
        }
    })();

    return FINORA_STATE.initializing;
}


/* ============================================================================
   18. FORM SUBMISSION HANDLERS
   ============================================================================ */

/**
 * Read values from HTML forms and call the related API function.
 *
 * Add the following attribute to a form:
 *
 * <form data-finora-form="signin">
 *
 * Supported form names:
 * - signup
 * - signin
 * - password-reset
 * - password-update
 * - profile-update
 * - loan-application
 * - support-ticket
 */
function bindFinoraForms() {
    const forms = document.querySelectorAll("[data-finora-form]");

    forms.forEach((form) => {
        if (form.dataset.finoraBound === "true") {
            return;
        }

        form.dataset.finoraBound = "true";

        form.addEventListener("submit", async (event) => {
            event.preventDefault();

            const action = form.dataset.finoraForm;

            const submitButton = form.querySelector(
                'button[type="submit"], input[type="submit"]'
            );

            const originalButtonText = submitButton
                ? submitButton.textContent
                : "";

            if (submitButton) {
                submitButton.disabled = true;
                submitButton.dataset.finoraOriginalText =
                    originalButtonText;
            }

            const formData = new FormData(form);

            try {
                setStatus("กำลังดำเนินการ...", "loading");

                if (action === "signup") {
                    await signUp({
                        email: getFormValue(formData, "email"),
                        password: getFormValue(formData, "password"),
                        username: getFormValue(formData, "username"),
                        full_name: getFormValue(formData, "full_name"),
                        phone: getFormValue(formData, "phone")
                    });

                    form.reset();
                } else if (action === "signin") {
                    await signIn(
                        getFormValue(formData, "email"),
                        getFormValue(formData, "password")
                    );

                    form.reset();
                } else if (action === "password-reset") {
                    await requestPasswordReset(
                        getFormValue(formData, "email")
                    );
                } else if (action === "password-update") {
                    await updatePassword(
                        getFormValue(formData, "password"),
                        getFormValue(formData, "confirm_password")
                    );

                    form.reset();
                } else if (action === "profile-update") {
                    await updateMyProfile({
                        username: getFormValue(formData, "username"),
                        title: getFormValue(formData, "title"),
                        full_name: getFormValue(formData, "full_name"),
                        phone: getFormValue(formData, "phone"),
                        date_of_birth: getFormValue(
                            formData,
                            "date_of_birth"
                        )
                    });
                } else if (action === "loan-application") {
                    await submitLoanApplication({
                        product_id: getFormValue(
                            formData,
                            "product_id"
                        ),

                        requested_amount: getFormValue(
                            formData,
                            "requested_amount"
                        ),

                        requested_term_months: getFormValue(
                            formData,
                            "requested_term_months"
                        ),

                        purpose: getFormValue(
                            formData,
                            "purpose"
                        ),

                        employment_type: getFormValue(
                            formData,
                            "employment_type"
                        ),

                        monthly_income: getFormValue(
                            formData,
                            "monthly_income"
                        ),

                        monthly_expenses: getFormValue(
                            formData,
                            "monthly_expenses"
                        ),

                        other_debt_payments: getFormValue(
                            formData,
                            "other_debt_payments"
                        ),

                        accept_terms: isChecked(
                            formData,
                            "accept_terms"
                        ),

                        acknowledge_privacy: isChecked(
                            formData,
                            "acknowledge_privacy"
                        )
                    });

                    form.reset();
                } else if (action === "support-ticket") {
                    await createSupportTicket({
                        category: getFormValue(
                            formData,
                            "category"
                        ),

                        subject: getFormValue(
                            formData,
                            "subject"
                        ),

                        message: getFormValue(
                            formData,
                            "message"
                        )
                    });

                    form.reset();
                } else {
                    throw createFinoraError(
                        `ไม่รู้จัก form action: ${action}`,
                        "FORM_ACTION_UNKNOWN"
                    );
                }
            } catch (error) {
                handleError(error, {
                    context: `form:${action}`,
                    showMessage: true
                });
            } finally {
                if (submitButton) {
                    submitButton.disabled = false;

                    if (
                        submitButton.dataset.finoraOriginalText &&
                        submitButton.tagName === "BUTTON"
                    ) {
                        submitButton.textContent =
                            submitButton.dataset.finoraOriginalText;
                    }
                }
            }
        });
    });
}


/**
 * Bind sign-out buttons.
 *
 * Compatible markup:
 * <button type="button" data-finora-logout>ออกจากระบบ</button>
 */
function bindFinoraLogoutButtons() {
    const buttons = document.querySelectorAll("[data-finora-logout]");

    buttons.forEach((button) => {
        if (button.dataset.finoraLogoutBound === "true") {
            return;
        }

        button.dataset.finoraLogoutBound = "true";

        button.addEventListener("click", async (event) => {
            event.preventDefault();

            button.disabled = true;

            try {
                await signOut();
            } catch (error) {
                handleError(error, {
                    context: "signOut",
                    showMessage: true
                });
            } finally {
                button.disabled = false;
            }
        });
    });
}


/* ============================================================================
   19. SAFE DOM HELPERS
   ============================================================================ */

/**
 * Remove all child nodes from an element.
 */
function clearElement(elementOrId) {
    const element = typeof elementOrId === "string"
        ? getElement(elementOrId)
        : elementOrId;

    if (!element) {
        return false;
    }

    element.replaceChildren();

    return true;
}


/**
 * Create a text-only DOM element.
 */
function createTextElement(tagName, text, className = "") {
    const allowedTags = [
        "div",
        "p",
        "span",
        "strong",
        "small",
        "h2",
        "h3",
        "h4",
        "li"
    ];

    if (!allowedTags.includes(tagName)) {
        throw createFinoraError(
            "ประเภทองค์ประกอบ HTML ไม่ถูกต้อง",
            "DOM_TAG_NOT_ALLOWED"
        );
    }

    const element = document.createElement(tagName);

    element.textContent = String(text ?? "");

    if (className) {
        element.className = className;
    }

    return element;
}


/**
 * Render a simple list using textContent rather than untrusted HTML.
 */
function renderTextList(containerOrId, records, getLabel) {
    const container = typeof containerOrId === "string"
        ? getElement(containerOrId)
        : containerOrId;

    if (!container) {
        return false;
    }

    clearElement(container);

    if (!Array.isArray(records) || records.length === 0) {
        container.appendChild(
            createTextElement(
                "p",
                "ยังไม่มีข้อมูล",
                "finora-empty-state"
            )
        );

        return true;
    }

    const list = document.createElement("ul");

    records.forEach((record) => {
        const label = getLabel(record);

        list.appendChild(
            createTextElement("li", label)
        );
    });

    container.appendChild(list);

    return true;
}


/**
 * Render active loan products into a select element.
 */
async function populateLoanProductSelect(selectOrId) {
    const select = typeof selectOrId === "string"
        ? getElement(selectOrId)
        : selectOrId;

    if (!select || select.tagName !== "SELECT") {
        throw createFinoraError(
            "ไม่พบช่องเลือกผลิตภัณฑ์สินเชื่อ",
            "PRODUCT_SELECT_NOT_FOUND"
        );
    }

    const products = await getActiveLoanProducts();

    select.replaceChildren();

    const defaultOption = document.createElement("option");

    defaultOption.value = "";
    defaultOption.textContent = products.length
        ? "เลือกผลิตภัณฑ์สินเชื่อ"
        : "ยังไม่มีผลิตภัณฑ์ที่เปิดรับสมัคร";

    select.appendChild(defaultOption);

    products.forEach((product) => {
        const option = document.createElement("option");

        option.value = product.id;

        option.textContent =
            `${product.name} — ` +
            `${formatCurrency(product.min_amount)} ถึง ` +
            `${formatCurrency(product.max_amount)}`;

        select.appendChild(option);
    });

    select.disabled = products.length === 0;

    return products;
}


/* ============================================================================
   20. PAGE INITIALIZATION
   ============================================================================ */

async function startFinora() {
    await initializeFinora();

    /*
     * Automatically initialize loan product dropdowns when present.
     *
     * Compatible markup:
     * <select data-finora-loan-products name="product_id"></select>
     */
    const productSelects = document.querySelectorAll(
        "[data-finora-loan-products]"
    );

    for (const select of productSelects) {
        try {
            await populateLoanProductSelect(select);
        } catch (error) {
            handleError(error, {
                context: "populateLoanProductSelect",
                showMessage: true
            });
        }
    }
}


/* ============================================================================
   21. EXPOSE THE PUBLIC FINORA API
   ============================================================================ */

/*
 * HTML files can access functions through window.FINORA.
 *
 * Example:
 *
 * await FINORA.signIn("user@example.com", "your-password");
 *
 * const profile = await FINORA.getMyProfile();
 *
 * const applications = await FINORA.getMyLoanApplications();
 *
 * The Supabase client is also exposed to simplify debugging and integration.
 */
const FINORA_API = Object.freeze({
    config: FINORA_CONFIG,

    state: FINORA_STATE,

    supabase,

    // Initialization
    initialize: initializeFinora,
    start: startFinora,

    // Authentication
    getSession,
    getCurrentUser,
    requireAuthenticatedUser,
    requireVerifiedEmail,
    signUp,
    signIn,
    signOut,
    requestPasswordReset,
    updatePassword,
    verifyEmailOtp,
    signInWithOAuth,
    onAuthChange,

    // Profile
    getMyProfile,
    refreshProfile,
    updateMyProfile,

    // Legal documents and consent
    getPublishedLegalDocument,
    getPublishedLegalDocuments,
    recordConsent,
    recordRequiredConsents,

    // Loan products
    getActiveLoanProducts,
    getActiveLoanProduct,

    // Loan applications
    getMyLoanApplications,
    getMyLoanApplication,
    submitLoanApplication,

    // Application files
    uploadApplicationDocument,
    getMyApplicationDocuments,
    downloadPrivateDocument,
    getPrivateDocumentSignedUrl,

    // Loans and payments
    getMyLoanAccounts,
    getMyRepaymentSchedule,
    getMyPayments,

    // Announcements
    getPublicAnnouncements,

    // Customer support
    createSupportTicket,
    getMySupportTickets,

    // Staff dashboard
    getDashboardApplications,
    getApplicationReviewHistory,

    // Forms and UI
    bindFinoraForms,
    bindFinoraLogoutButtons,
    refreshAuthUI,
    setStatus,
    setText,
    getElement,
    escapeHtml,
    formatCurrency,
    formatDate,
    formatDateTime,
    renderTextList,
    populateLoanProductSelect,

    // Helpers
    isValidEmail,
    getFriendlyErrorMessage,
    handleError,
    safelyRun,
    makeResult
});


/* ============================================================================
   22. GLOBAL EXPORTS AND AUTOMATIC STARTUP
   ============================================================================ */

window.FINORA = FINORA_API;

/*
 * This alias is provided for console debugging and integrations.
 * Do not expose or attach any service_role key to this object.
 */
window.supabaseClient = supabase;


/*
 * Start automatically whether the module is loaded before or after
 * the DOM has finished loading.
 */
if (document.readyState === "loading") {
    document.addEventListener(
        "DOMContentLoaded",
        () => {
            startFinora().catch((error) => {
                handleError(error, {
                    context: "startup",
                    showMessage: true
                });
            });
        },
        {
            once: true
        }
    );
} else {
    startFinora().catch((error) => {
        handleError(error, {
            context: "startup",
            showMessage: true
        });
    });
}


/* ============================================================================
   END OF FINORA index.js
   ============================================================================ */
