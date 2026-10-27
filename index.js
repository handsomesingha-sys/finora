/* =====================================================================
 * FINORA - Frontend application client
 * File: index.js
 *
 * Frontend responsibilities:
 * - Communicate with the FINORA Google Apps Script Web App
 * - Email/password and Google Sign-In authentication
 * - User session handling, registration and password recovery
 * - Profile, dashboard, loan, repayment and transaction operations
 * - PromptPay QR and slip verification requests through the backend
 * - Notifications, support requests, image upload and admin operations
 * - Shared loading UI, toasts, form validation and consent dialogs
 *
 * SECURITY:
 * - Never place Thunder API tokens, ImgBB keys or other server secrets here.
 * - Google OAuth Client ID is public and may be configured in index.html.
 * - Never store a user's password in browser storage.
 * - Access control and payment verification must be enforced by Code.gs.
 * ===================================================================== */
(function (window, document) {
  "use strict";

  const DEFAULT_CONFIG = {
    API_URL: "https://script.google.com/macros/s/AKfycbwWEJQPg0aOWSUMSiMVi2d-LQ9Z7wGh12lnA3G61W-Q-kmJPUb5E-MxPmuLH05V4MGL5g/exec",
    APP_NAME: "FINORA",
    GOOGLE_CLIENT_ID: "1022921992521-s6gibobvv8ua1ql8891vb5qmbvbohi3o.apps.googleusercontent.com",
    API_TIMEOUT_MS: 60000,
    SESSION_TTL_SECONDS: 7200,
    REMEMBER_SESSION_TTL_SECONDS: 2592000,
    MIN_AGE: 20,
    PASSWORD_MIN_LENGTH: 10,
    PASSWORD_MAX_LENGTH: 128,
    MAX_IMAGE_SIZE_BYTES: 5242880,
    SUPPORTED_IMAGE_TYPES: ["image/jpeg", "image/png", "image/webp"],
    TERMS_VERSION: "2026-10-01",
    PRIVACY_VERSION: "2026-10-01",
    SESSION_TOKEN_KEY: "finora_session_token",
    SESSION_EXPIRY_KEY: "finora_session_expiry",
    REMEMBER_SESSION_KEY: "finora_remember_session",
    PENDING_EMAIL_KEY: "finora_pending_email",
    GOOGLE_SCRIPT_ID: "finora-google-identity-script",
    ACTIONS: {
      health: "ping",
      publicConfig: "getPublicConfig",
      register: "registerUser",
      requestEmailVerification: "requestEmailVerification",
      verifyEmail: "verifyEmail",
      login: "login",
      googleLogin: "googleLogin",
      currentUser: "getCurrentUser",
      logout: "logout",
      requestPasswordReset: "requestPasswordReset",
      resetPassword: "resetPassword",
      changePassword: "changePassword",
      updateProfile: "updateProfile",
      publicAnnouncements: "getPublicAnnouncements",
      publicLoanProducts: "getPublicLoanProducts",
      dashboard: "getDashboardData",
      loanApplications: "getMyLoanApplications",
      submitLoanApplication: "submitLoanApplication",
      loanAccounts: "getMyLoanAccounts",
      repaymentSchedule: "getMyRepaymentSchedule",
      transactions: "getMyTransactions",
      notifications: "getMyNotifications",
      markNotificationRead: "markNotificationRead",
      sessions: "getMySessions",
      revokeSession: "revokeMySession",
      createSupportTicket: "createSupportTicket",
      supportTickets: "getMySupportTickets",
      uploadImage: "uploadImage",
      createPromptPayQR: "generatePromptPayQR",
      verifyPaymentSlip: "verifyPaymentSlip",
      paymentStatus: "getPaymentStatus",
      adminOverview: "adminOverview",
      adminUsers: "adminListUsers",
      adminUpdateUserStatus: "adminUpdateUserStatus",
      adminLoanProducts: "adminListLoanProducts",
      adminSaveLoanProduct: "adminSaveLoanProduct",
      adminDeleteLoanProduct: "adminDeleteLoanProduct",
      adminLoanApplications: "adminListLoanApplications",
      adminUpdateApplication: "adminUpdateApplication",
      adminCreateLoanAccount: "adminCreateLoanAccount",
      adminConfirmDisbursement: "adminConfirmDisbursement",
      adminTransactions: "adminListTransactions",
      adminRecordRepayment: "adminRecordRepayment",
      adminAnnouncements: "adminListAnnouncements",
      adminSaveAnnouncement: "adminSaveAnnouncement",
      adminDeleteAnnouncement: "adminDeleteAnnouncement",
      adminSupportTickets: "adminListSupportTickets",
      adminUpdateSupportTicket: "adminUpdateSupportTicket",
      adminAuditLogs: "adminListAuditLogs",
      adminListAdmins: "adminListAdmins",
      adminSetAdminStatus: "adminSetAdminStatus",
      adminGetSettings: "adminGetSettings",
      adminUpdateSettings: "adminUpdateSettings",
      adminSendNotification: "adminSendNotification"
    }
  };

  window.FINORA_CONFIG = window.FINORA_CONFIG || {};
  const CONFIG = Object.assign({}, DEFAULT_CONFIG, window.FINORA_CONFIG);
  CONFIG.ACTIONS = Object.assign(
    {},
    DEFAULT_CONFIG.ACTIONS,
    window.FINORA_CONFIG.ACTIONS || {}
  );

  const STATE = {
    initialized: false,
    isAuthenticated: false,
    user: null,
    sessionExpiry: null,
    rememberMe: false,
    loadingCount: 0,
    googleReady: false,
    pendingGooglePromise: null
  };

  class FinoraError extends Error {
    constructor(code, message, details) {
      super(message || "เกิดข้อผิดพลาด กรุณาลองใหม่อีกครั้ง");
      this.name = "FinoraError";
      this.code = code || "UNKNOWN_ERROR";
      this.details = details || null;
    }
  }

  const AUTH_ERROR_CODES = new Set([
    "AUTH_REQUIRED",
    "SESSION_INVALID",
    "SESSION_EXPIRED",
    "ACCOUNT_NOT_ACTIVE",
    "INVALID_SESSION",
    "TOKEN_EXPIRED",
    "UNAUTHORIZED"
  ]);

  function emit(name, detail) {
    try {
      window.dispatchEvent(
        new CustomEvent(name, { detail: detail || {} })
      );
    } catch (error) {
      // Events are helpful for the UI but must not break core operations.
    }
  }

  function isObject(value) {
    return !!value &&
      typeof value === "object" &&
      !Array.isArray(value);
  }

  function text(value) {
    return value === null || value === undefined
      ? ""
      : String(value).trim();
  }

  function normalizedEmail(value) {
    return text(value).toLowerCase();
  }

  function escapeHtml(value) {
    return String(value === null || value === undefined ? "" : value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function safeJsonParse(value) {
    try {
      return JSON.parse(value);
    } catch (error) {
      return null;
    }
  }

  function money(value, currency) {
    const number = Number(value);

    if (!Number.isFinite(number)) {
      return "—";
    }

    return new Intl.NumberFormat("th-TH", {
      style: "currency",
      currency: currency || "THB",
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    }).format(number);
  }

  function numberFormat(value, digits) {
    const number = Number(value);

    if (!Number.isFinite(number)) {
      return "—";
    }

    return new Intl.NumberFormat("th-TH", {
      maximumFractionDigits: Number.isInteger(digits) ? digits : 2
    }).format(number);
  }

  function dateFormat(value, includeTime) {
    if (!value) {
      return "—";
    }

    const date = value instanceof Date ? value : new Date(value);

    if (Number.isNaN(date.getTime())) {
      return "—";
    }

    return new Intl.DateTimeFormat(
      "th-TH",
      includeTime
        ? { dateStyle: "medium", timeStyle: "short" }
        : { dateStyle: "medium" }
    ).format(date);
  }

  function validEmail(email) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(
      normalizedEmail(email)
    );
  }

  function validateEmail(email) {
    const value = normalizedEmail(email);

    if (!value || !validEmail(value)) {
      throw new FinoraError(
        "INVALID_EMAIL",
        "กรุณากรอกอีเมลให้ถูกต้อง"
      );
    }

    return value;
  }

  function validatePhone(phone) {
    const value = text(phone).replace(/[\s()-]/g, "");

    if (!/^\+?[0-9]{9,15}$/.test(value)) {
      throw new FinoraError(
        "INVALID_PHONE",
        "กรุณากรอกหมายเลขโทรศัพท์ให้ถูกต้อง"
      );
    }

    return value;
  }

  function validateThaiCitizenId(value) {
    const digits = text(value).replace(/\D/g, "");

    if (!/^\d{13}$/.test(digits)) {
      return false;
    }

    let total = 0;

    for (let i = 0; i < 12; i += 1) {
      total += Number(digits[i]) * (13 - i);
    }

    return ((11 - (total % 11)) % 10) === Number(digits[12]);
  }

  function validatePassword(password) {
    const value = String(password || "");
    const min = Number(CONFIG.PASSWORD_MIN_LENGTH) || 10;
    const max = Number(CONFIG.PASSWORD_MAX_LENGTH) || 128;

    if (value.length < min || value.length > max) {
      throw new FinoraError(
        "INVALID_PASSWORD_LENGTH",
        "รหัสผ่านต้องมีความยาว " + min + "–" + max + " ตัวอักษร"
      );
    }

    if (
      !/[a-z]/.test(value) ||
      !/[A-Z]/.test(value) ||
      !/[0-9]/.test(value)
    ) {
      throw new FinoraError(
        "WEAK_PASSWORD",
        "รหัสผ่านต้องมีตัวพิมพ์เล็ก ตัวพิมพ์ใหญ่ และตัวเลข"
      );
    }

    return value;
  }

  function calculateAge(dateOfBirth) {
    const birth = new Date(dateOfBirth);

    if (!dateOfBirth || Number.isNaN(birth.getTime())) {
      return -1;
    }

    const now = new Date();
    let age = now.getFullYear() - birth.getFullYear();
    const monthDiff = now.getMonth() - birth.getMonth();

    if (
      monthDiff < 0 ||
      (monthDiff === 0 && now.getDate() < birth.getDate())
    ) {
      age -= 1;
    }

    return age;
  }

  function validateRegistration(data) {
    if (!isObject(data)) {
      throw new FinoraError(
        "INVALID_REGISTRATION",
        "ข้อมูลสมัครสมาชิกไม่ถูกต้อง"
      );
    }

    const fullName = text(data.fullName || data.name);
    const email = validateEmail(data.email);
    const phone = validatePhone(data.phone);
    const password = validatePassword(data.password);

    if (fullName.length < 2 || fullName.length > 120) {
      throw new FinoraError(
        "INVALID_NAME",
        "กรุณากรอกชื่อและนามสกุลให้ถูกต้อง"
      );
    }

    if (
      data.dateOfBirth &&
      calculateAge(data.dateOfBirth) < (Number(CONFIG.MIN_AGE) || 20)
    ) {
      throw new FinoraError(
        "AGE_REQUIREMENT_NOT_MET",
        "ผู้สมัครต้องมีอายุอย่างน้อย " +
          (Number(CONFIG.MIN_AGE) || 20) +
          " ปี"
      );
    }

    if (data.citizenId && !validateThaiCitizenId(data.citizenId)) {
      throw new FinoraError(
        "INVALID_CITIZEN_ID",
        "เลขประจำตัวประชาชนไม่ถูกต้อง"
      );
    }

    if (data.acceptTerms !== true && data.termsAccepted !== true) {
      throw new FinoraError(
        "TERMS_REQUIRED",
        "กรุณายอมรับข้อกำหนดและเงื่อนไขการใช้บริการ"
      );
    }

    if (data.acceptPrivacy !== true && data.privacyAccepted !== true) {
      throw new FinoraError(
        "PRIVACY_REQUIRED",
        "กรุณารับทราบประกาศความเป็นส่วนตัว"
      );
    }

    return Object.assign({}, data, {
      fullName: fullName,
      email: email,
      phone: phone,
      password: password,
      termsVersion: text(data.termsVersion || CONFIG.TERMS_VERSION),
      privacyVersion: text(data.privacyVersion || CONFIG.PRIVACY_VERSION)
    });
  }

  function storage(name) {
    try {
      return window[name];
    } catch (error) {
      return null;
    }
  }

  function storageGet(name, key) {
    const target = storage(name);

    if (!target) {
      return null;
    }

    try {
      return target.getItem(key);
    } catch (error) {
      return null;
    }
  }

  function storageSet(name, key, value) {
    const target = storage(name);

    if (!target) {
      throw new FinoraError(
        "STORAGE_UNAVAILABLE",
        "เบราว์เซอร์ไม่อนุญาตให้จัดเก็บสถานะการเข้าสู่ระบบ"
      );
    }

    try {
      target.setItem(key, String(value));
    } catch (error) {
      throw new FinoraError(
        "STORAGE_WRITE_FAILED",
        "ไม่สามารถบันทึกสถานะการเข้าสู่ระบบได้"
      );
    }
  }

  function storageRemove(name, key) {
    const target = storage(name);

    if (!target) {
      return;
    }

    try {
      target.removeItem(key);
    } catch (error) {
      // no-op
    }
  }

  function clearTokenKeys() {
    ["localStorage", "sessionStorage"].forEach(function (name) {
      storageRemove(name, CONFIG.SESSION_TOKEN_KEY);
      storageRemove(name, CONFIG.SESSION_EXPIRY_KEY);
      storageRemove(name, CONFIG.REMEMBER_SESSION_KEY);
    });
  }

  function tokenExpiryValue(value) {
    if (value === null || value === undefined || value === "") {
      return null;
    }

    if (
      typeof value === "number" ||
      /^\d+$/.test(String(value))
    ) {
      const n = Number(value);
      return n < 1000000000000 ? n * 1000 : n;
    }

    const parsed = new Date(value).getTime();

    return Number.isFinite(parsed) ? parsed : null;
  }

  const session = {
    getToken() {
      const token =
        storageGet("localStorage", CONFIG.SESSION_TOKEN_KEY) ||
        storageGet("sessionStorage", CONFIG.SESSION_TOKEN_KEY);

      if (!token) {
        return "";
      }

      const expiryRaw =
        storageGet("localStorage", CONFIG.SESSION_EXPIRY_KEY) ||
        storageGet("sessionStorage", CONFIG.SESSION_EXPIRY_KEY);

      const expiry = tokenExpiryValue(expiryRaw);

      if (expiry && Date.now() >= expiry) {
        this.clear();
        emit("finora:session-expired", {});
        return "";
      }

      return token;
    },

    set(token, options) {
      const opts = options || {};
      const sessionToken = text(token);

      if (!sessionToken) {
        throw new FinoraError(
          "SESSION_TOKEN_MISSING",
          "ระบบไม่ได้รับ session token จากเซิร์ฟเวอร์"
        );
      }

      const remember = opts.rememberMe === true;
      const defaultTtl = remember
        ? Number(CONFIG.REMEMBER_SESSION_TTL_SECONDS)
        : Number(CONFIG.SESSION_TTL_SECONDS);

      const expiry =
        tokenExpiryValue(opts.expiresAt) ||
        Date.now() + (defaultTtl || 7200) * 1000;

      clearTokenKeys();

      const target = remember ? "localStorage" : "sessionStorage";

      storageSet(target, CONFIG.SESSION_TOKEN_KEY, sessionToken);
      storageSet(target, CONFIG.SESSION_EXPIRY_KEY, expiry);
      storageSet(
        target,
        CONFIG.REMEMBER_SESSION_KEY,
        remember ? "true" : "false"
      );

      STATE.sessionExpiry = expiry;
      STATE.rememberMe = remember;

      return true;
    },

    clear() {
      clearTokenKeys();

      STATE.user = null;
      STATE.isAuthenticated = false;
      STATE.sessionExpiry = null;
      STATE.rememberMe = false;

      emit("finora:session-changed", {
        authenticated: false,
        user: null
      });
    },

    hasSession() {
      return !!this.getToken();
    },

    isRemembered() {
      return storageGet(
        "localStorage",
        CONFIG.REMEMBER_SESSION_KEY
      ) === "true";
    }
  };

  function getApiUrl() {
    const value = text(CONFIG.API_URL).replace(/\/+$/, "");

    if (!value) {
      throw new FinoraError(
        "API_NOT_CONFIGURED",
        "ยังไม่ได้ตั้งค่า URL ของ FINORA API ใน index.html"
      );
    }

    if (
      !/^https:\/\/script\.google\.com\/macros\/s\/[^/]+\/exec$/i.test(
        value
      )
    ) {
      throw new FinoraError(
        "INVALID_API_URL",
        "API_URL ต้องเป็น URL Google Apps Script Web App ที่ลงท้ายด้วย /exec"
      );
    }

    return value;
  }

  function normalizeError(error) {
    if (error instanceof FinoraError) {
      return error;
    }

    if (error && error.name === "AbortError") {
      return new FinoraError(
        "API_TIMEOUT",
        "การเชื่อมต่อใช้เวลานานเกินไป กรุณาลองใหม่"
      );
    }

    const message =
      error && error.message
        ? error.message
        : "เกิดข้อผิดพลาดในการเชื่อมต่อ FINORA";

    return new FinoraError("NETWORK_ERROR", message, error || null);
  }

  function parseApiResponse(body, action) {
    const parsed = typeof body === "string"
      ? safeJsonParse(body)
      : body;

    if (!parsed || typeof parsed !== "object") {
      throw new FinoraError(
        "INVALID_API_RESPONSE",
        "API ส่งข้อมูลที่ไม่ใช่ JSON กรุณาตรวจสอบ URL และสิทธิ์ Deploy",
        { action: action }
      );
    }

    const failed =
      parsed.ok === false ||
      parsed.success === false ||
      parsed.status === "error";

    if (failed) {
      const nested = isObject(parsed.error) ? parsed.error : {};
      const code = text(
        nested.code ||
        parsed.code ||
        parsed.errorCode ||
        "API_ERROR"
      );

      const message = text(
        nested.message ||
        parsed.message ||
        parsed.errorMessage ||
        (typeof parsed.error === "string" ? parsed.error : "")
      ) || "เซิร์ฟเวอร์ไม่สามารถดำเนินการได้";

      const error = new FinoraError(code, message, parsed);

      if (AUTH_ERROR_CODES.has(code)) {
        session.clear();
      }

      emit("finora:api-error", {
        action: action,
        code: error.code,
        message: error.message
      });

      throw error;
    }

    if (parsed.ok === true || parsed.success === true) {
      return parsed.data !== undefined ? parsed.data : parsed;
    }

    // Supports APIs that return the result object directly.
    return parsed;
  }

  async function call(action, payload, options) {
    const actionName = text(action);

    if (!actionName) {
      throw new FinoraError(
        "ACTION_REQUIRED",
        "ไม่ได้ระบุ action สำหรับ API"
      );
    }

    const opts = Object.assign(
      {
        loading: false,
        loadingMessage: "กำลังติดต่อระบบ",
        timeout: CONFIG.API_TIMEOUT_MS
      },
      options || {}
    );

    const data = Object.assign(
      {},
      isObject(payload) ? payload : {},
      { action: actionName }
    );

    const apiUrl = getApiUrl();
    let controller = null;
    let timeoutId = null;
    let loadingVisible = false;

    if (opts.loading) {
      ui.showLoading(
        opts.loadingMessage,
        opts.loadingDetail || "กรุณารอสักครู่"
      );

      loadingVisible = true;
    }

    try {
      if (typeof window.fetch !== "function") {
        throw new FinoraError(
          "FETCH_UNAVAILABLE",
          "เบราว์เซอร์นี้ไม่รองรับการเชื่อมต่อ API"
        );
      }

      if (typeof window.AbortController === "function") {
        controller = new AbortController();

        timeoutId = window.setTimeout(
          function () {
            controller.abort();
          },
          Number(opts.timeout) ||
            Number(CONFIG.API_TIMEOUT_MS) ||
            60000
        );
      }

      const response = await window.fetch(
        apiUrl,
        {
          method: "POST",
          mode: "cors",
          credentials: "omit",
          cache: "no-store",
          redirect: "follow",
          headers: {
            "Content-Type": "text/plain;charset=utf-8"
          },
          body: JSON.stringify(data),
          signal: controller ? controller.signal : undefined
        }
      );

      const responseText = await response.text();
      const result = parseApiResponse(responseText, actionName);

      if (!response.ok) {
        throw new FinoraError(
          "HTTP_ERROR",
          "เกิดข้อผิดพลาดในการติดต่อเซิร์ฟเวอร์",
          { status: response.status }
        );
      }

      emit("finora:api-success", {
        action: actionName,
        data: result
      });

      return result;

    } catch (error) {
      const normalized = normalizeError(error);

      emit("finora:api-error", {
        action: actionName,
        code: normalized.code,
        message: normalized.message
      });

      throw normalized;

    } finally {
      if (timeoutId !== null) {
        window.clearTimeout(timeoutId);
      }

      if (loadingVisible) {
        ui.hideLoading();
      }
    }
  }

  function actionCall(actionKey, payload, options) {
    const actionName = CONFIG.ACTIONS[actionKey] || actionKey;
    return call(actionName, payload, options);
  }

  function authCall(actionKey, payload, options) {
    const token = session.getToken();

    if (!token) {
      return Promise.reject(
        new FinoraError(
          "AUTH_REQUIRED",
          "กรุณาเข้าสู่ระบบก่อนดำเนินการ"
        )
      );
    }

    return actionCall(
      actionKey,
      Object.assign(
        {},
        isObject(payload) ? payload : {},
        { sessionToken: token }
      ),
      options
    );
  }

  function setAuthenticatedResult(result, rememberMe) {
    const data =
      isObject(result) && isObject(result.data)
        ? result.data
        : result;

    const token = text(
      data && (
        data.sessionToken ||
        data.token ||
        data.accessToken
      )
    );

    if (!token) {
      throw new FinoraError(
        "SESSION_TOKEN_MISSING",
        "เข้าสู่ระบบสำเร็จแต่เซิร์ฟเวอร์ไม่ได้ส่ง session token กลับมา",
        result
      );
    }

    session.set(token, {
      rememberMe: rememberMe === true,
      expiresAt: data.expiresAt || data.sessionExpiresAt || null
    });

    STATE.user = data.user || data.profile || null;
    STATE.isAuthenticated = true;

    emit("finora:session-changed", {
      authenticated: true,
      user: STATE.user
    });

    return data;
  }

  const ui = {
    host: null,
    loadingElement: null,
    toastHost: null,

    ensure() {
      if (this.host) {
        return;
      }

      let host = document.getElementById("finora-ui-host");

      if (!host) {
        host = document.createElement("div");
        host.id = "finora-ui-host";
        document.body.appendChild(host);
      }

      this.host = host;

      if (!document.getElementById("finora-ui-styles")) {
        const style = document.createElement("style");
        style.id = "finora-ui-styles";

        style.textContent = [
          "#finora-ui-host{font-family:inherit}",
          ".finora-loading-overlay{position:fixed;inset:0;z-index:99999;background:rgba(8,15,30,.52);display:flex;align-items:center;justify-content:center;padding:20px;backdrop-filter:blur(4px)}",
          ".finora-loading-card{min-width:220px;max-width:90vw;background:#fff;color:#172033;border-radius:18px;padding:24px;text-align:center;box-shadow:0 20px 80px rgba(0,0,0,.24)}",
          ".finora-spinner{width:32px;height:32px;border:3px solid #e5e7eb;border-top-color:#1d4ed8;border-radius:50%;animation:finora-spin .8s linear infinite;margin:0 auto 14px}",
          "@keyframes finora-spin{to{transform:rotate(360deg)}}",
          ".finora-toast-host{position:fixed;z-index:100000;right:16px;top:16px;display:flex;flex-direction:column;gap:8px;max-width:min(380px,calc(100vw - 32px))}",
          ".finora-toast{padding:13px 16px;border-radius:12px;background:#172033;color:#fff;box-shadow:0 10px 30px rgba(0,0,0,.18);font-size:14px;line-height:1.5}",
          ".finora-toast.success{background:#166534}.finora-toast.error{background:#991b1b}.finora-toast.warning{background:#92400e}",
          ".finora-dialog-backdrop{position:fixed;inset:0;z-index:100001;background:rgba(8,15,30,.55);display:flex;align-items:center;justify-content:center;padding:18px}",
          ".finora-dialog{width:min(560px,100%);max-height:90vh;overflow:auto;background:#fff;color:#172033;border-radius:18px;padding:22px;box-shadow:0 20px 80px rgba(0,0,0,.25)}",
          ".finora-dialog h2{font-size:20px;margin:0 0 12px}.finora-dialog-content{line-height:1.7;white-space:pre-wrap;overflow-wrap:anywhere}",
          ".finora-dialog-actions{display:flex;gap:10px;justify-content:flex-end;margin-top:20px}.finora-dialog button{border:0;border-radius:10px;padding:10px 16px;cursor:pointer;font:inherit}.finora-dialog .primary{background:#1d4ed8;color:#fff}.finora-dialog .secondary{background:#e5e7eb;color:#172033}"
        ].join("\n");

        document.head.appendChild(style);
      }

      let toastHost = document.getElementById("finora-toast-host");

      if (!toastHost) {
        toastHost = document.createElement("div");
        toastHost.id = "finora-toast-host";
        toastHost.className = "finora-toast-host";
        host.appendChild(toastHost);
      }

      this.toastHost = toastHost;
    },

    showLoading(title, detail) {
      this.ensure();
      STATE.loadingCount += 1;

      if (this.loadingElement) {
        const t = this.loadingElement.querySelector(
          "[data-finora-loading-title]"
        );
        const d = this.loadingElement.querySelector(
          "[data-finora-loading-detail]"
        );

        if (t) t.textContent = title || "กำลังโหลดข้อมูล";
        if (d) d.textContent = detail || "กรุณารอสักครู่";

        return;
      }

      const overlay = document.createElement("div");
      overlay.className = "finora-loading-overlay";
      overlay.setAttribute("role", "status");
      overlay.setAttribute("aria-live", "polite");

      overlay.innerHTML =
        '<div class="finora-loading-card">' +
          '<div class="finora-spinner" aria-hidden="true"></div>' +
          '<div data-finora-loading-title></div>' +
          '<div data-finora-loading-detail style="font-size:13px;color:#64748b;margin-top:6px"></div>' +
        "</div>";

      overlay.querySelector(
        "[data-finora-loading-title]"
      ).textContent = title || "กำลังโหลดข้อมูล";

      overlay.querySelector(
        "[data-finora-loading-detail]"
      ).textContent = detail || "กรุณารอสักครู่";

      this.host.appendChild(overlay);
      this.loadingElement = overlay;
    },

    hideLoading() {
      STATE.loadingCount = Math.max(0, STATE.loadingCount - 1);

      if (STATE.loadingCount > 0) {
        return;
      }

      if (
        this.loadingElement &&
        this.loadingElement.parentNode
      ) {
        this.loadingElement.parentNode.removeChild(
          this.loadingElement
        );
      }

      this.loadingElement = null;
    },

    toast(message, type, duration) {
      this.ensure();

      const item = document.createElement("div");

      item.className =
        "finora-toast " +
        (["success", "error", "warning"].includes(type) ? type : "");

      item.setAttribute(
        "role",
        type === "error" ? "alert" : "status"
      );

      item.textContent = text(message) || "ดำเนินการเรียบร้อย";
      this.toastHost.appendChild(item);

      window.setTimeout(function () {
        if (item.parentNode) {
          item.parentNode.removeChild(item);
        }
      }, Number(duration) || 4000);

      return item;
    },

    dialog(options) {
      this.ensure();
      const opts = options || {};

      return new Promise(function (resolve) {
        const backdrop = document.createElement("div");
        backdrop.className = "finora-dialog-backdrop";

        const dialog = document.createElement("section");
        dialog.className = "finora-dialog";
        dialog.setAttribute("role", "dialog");
        dialog.setAttribute("aria-modal", "true");

        const titleEl = document.createElement("h2");
        titleEl.textContent = text(opts.title) || "แจ้งเตือน";

        const content = document.createElement("div");
        content.className = "finora-dialog-content";
        content.textContent = text(opts.message || opts.content);

        const actions = document.createElement("div");
        actions.className = "finora-dialog-actions";

        const cancel = document.createElement("button");
        cancel.className = "secondary";
        cancel.type = "button";
        cancel.textContent = text(opts.cancelText) || "ยกเลิก";

        const confirm = document.createElement("button");
        confirm.className = "primary";
        confirm.type = "button";
        confirm.textContent = text(opts.confirmText) || "ตกลง";

        function close(value) {
          if (backdrop.parentNode) {
            backdrop.parentNode.removeChild(backdrop);
          }

          document.removeEventListener("keydown", onKey);
          resolve(value);
        }

        function onKey(event) {
          if (
            event.key === "Escape" &&
            opts.dismissible !== false
          ) {
            close(false);
          }
        }

        cancel.addEventListener("click", function () {
          close(false);
        });

        confirm.addEventListener("click", function () {
          close(true);
        });

        backdrop.addEventListener("click", function (event) {
          if (
            event.target === backdrop &&
            opts.dismissible !== false
          ) {
            close(false);
          }
        });

        actions.appendChild(cancel);
        actions.appendChild(confirm);
        dialog.appendChild(titleEl);
        dialog.appendChild(content);
        dialog.appendChild(actions);
        backdrop.appendChild(dialog);
        this.host.appendChild(backdrop);

        document.addEventListener("keydown", onKey);
        confirm.focus();
      }.bind(this));
    },

    confirm(message, title) {
      return this.dialog({
        title: title || "ยืนยันรายการ",
        message: message,
        confirmText: "ยืนยัน",
        cancelText: "ยกเลิก"
      });
    },

    async showDocumentModal(options) {
      this.ensure();
      const opts = options || {};

      return new Promise(function (resolve) {
        const backdrop = document.createElement("div");
        backdrop.className = "finora-dialog-backdrop";

        const dialog = document.createElement("section");
        dialog.className = "finora-dialog";
        dialog.style.display = "flex";
        dialog.style.flexDirection = "column";
        dialog.style.maxHeight = "90vh";

        const heading = document.createElement("h2");
        heading.textContent = text(opts.title) || "เอกสาร";

        const warning = document.createElement("p");
        warning.textContent = text(opts.warningText);
        warning.style.color = "#92400e";

        const content = document.createElement("div");
        content.className = "finora-dialog-content";
        content.style.overflow = "auto";
        content.style.border = "1px solid #e5e7eb";
        content.style.borderRadius = "10px";
        content.style.padding = "12px";
        content.style.minHeight = "160px";
        content.style.whiteSpace = "pre-wrap";
        content.textContent = String(opts.content || "");

        const actions = document.createElement("div");
        actions.className = "finora-dialog-actions";

        const cancel = document.createElement("button");
        cancel.className = "secondary";
        cancel.textContent = text(opts.cancelText) || "ยกเลิก";
        cancel.type = "button";

        const agree = document.createElement("button");
        agree.className = "primary";
        agree.textContent = text(opts.agreeText) || "ยินยอม";
        agree.type = "button";
        agree.disabled = opts.requireScrollToBottom === true;
        agree.style.opacity = agree.disabled ? "0.5" : "1";

        let reachedBottom = opts.requireScrollToBottom !== true;

        function close(value) {
          if (backdrop.parentNode) {
            backdrop.parentNode.removeChild(backdrop);
          }

          document.removeEventListener("keydown", onKey);
          resolve(value);
        }

        function onKey(event) {
          if (event.key === "Escape") {
            close(false);
          }
        }

        content.addEventListener("scroll", function () {
          if (
            content.scrollTop + content.clientHeight >=
            content.scrollHeight - 8
          ) {
            reachedBottom = true;
            agree.disabled = false;
            agree.style.opacity = "1";
            warning.textContent =
              "อ่านเอกสารครบแล้ว คุณสามารถกดยินยอมได้";
          }
        });

        cancel.addEventListener("click", function () {
          close(false);
        });

        agree.addEventListener("click", function () {
          if (reachedBottom) {
            close(true);
          }
        });

        actions.appendChild(cancel);
        actions.appendChild(agree);
        dialog.appendChild(heading);

        if (warning.textContent) {
          dialog.appendChild(warning);
        }

        dialog.appendChild(content);
        dialog.appendChild(actions);
        backdrop.appendChild(dialog);
        this.host.appendChild(backdrop);

        document.addEventListener("keydown", onKey);
      }.bind(this));
    }
  };

  const auth = {
    async register(data) {
      const registration = validateRegistration(data);

      const result = await actionCall(
        "register",
        registration,
        {
          loading: true,
          loadingMessage: "กำลังสร้างบัญชี FINORA"
        }
      );

      if (registration.email) {
        storageSet(
          "sessionStorage",
          CONFIG.PENDING_EMAIL_KEY,
          registration.email
        );
      }

      emit("finora:registration-complete", result);
      return result;
    },

    async requestEmailVerification(email) {
      const normalized = validateEmail(email);

      const result = await actionCall(
        "requestEmailVerification",
        { email: normalized },
        {
          loading: true,
          loadingMessage: "กำลังส่งลิงก์ยืนยันอีเมล"
        }
      );

      emit("finora:email-verification-requested", {
        email: normalized,
        result: result
      });

      return result;
    },

    async verifyEmail(token, email) {
      const verificationToken = text(token);

      if (!verificationToken) {
        throw new FinoraError(
          "VERIFICATION_TOKEN_REQUIRED",
          "ไม่พบรหัสยืนยันอีเมล"
        );
      }

      return actionCall(
        "verifyEmail",
        {
          token: verificationToken,
          email:
            text(email) ||
            storageGet("sessionStorage", CONFIG.PENDING_EMAIL_KEY) ||
            ""
        },
        {
          loading: true,
          loadingMessage: "กำลังยืนยันอีเมล"
        }
      );
    },

    async login(identifier, password, rememberMe) {
      if (!text(identifier)) {
        throw new FinoraError(
          "LOGIN_IDENTIFIER_REQUIRED",
          "กรุณากรอกอีเมลหรือชื่อผู้ใช้"
        );
      }

      if (!String(password || "")) {
        throw new FinoraError(
          "LOGIN_PASSWORD_REQUIRED",
          "กรุณากรอกรหัสผ่าน"
        );
      }

      const result = await actionCall(
        "login",
        {
          identifier: text(identifier),
          email: normalizedEmail(identifier),
          password: String(password),
          rememberMe: rememberMe === true
        },
        {
          loading: true,
          loadingMessage: "กำลังเข้าสู่ระบบ FINORA"
        }
      );

      const data = setAuthenticatedResult(
        result,
        rememberMe === true
      );

      if (data.user) {
        STATE.user = data.user;
      }

      emit("finora:login-complete", {
        user: STATE.user,
        result: data
      });

      return data;
    },

    async googleLogin(idToken, rememberMe) {
      const token = text(idToken);

      if (!token) {
        throw new FinoraError(
          "GOOGLE_ID_TOKEN_REQUIRED",
          "ไม่พบข้อมูลยืนยันตัวตนจาก Google"
        );
      }

      const result = await actionCall(
        "googleLogin",
        {
          idToken: token,
          credential: token,
          rememberMe: rememberMe === true
        },
        {
          loading: true,
          loadingMessage: "กำลังเข้าสู่ระบบด้วย Google"
        }
      );

      const data = setAuthenticatedResult(
        result,
        rememberMe === true
      );

      if (data.user) {
        STATE.user = data.user;
      }

      emit("finora:login-complete", {
        provider: "google",
        user: STATE.user,
        result: data
      });

      return data;
    },

    async requestPasswordReset(email) {
      const normalized = validateEmail(email);

      return actionCall(
        "requestPasswordReset",
        { email: normalized },
        {
          loading: true,
          loadingMessage: "กำลังส่งคำขอรีเซ็ตรหัสผ่าน"
        }
      );
    },

    async resetPassword(token, newPassword) {
      const resetToken = text(token);

      if (!resetToken) {
        throw new FinoraError(
          "RESET_TOKEN_REQUIRED",
          "ไม่พบรหัสรีเซ็ตรหัสผ่าน"
        );
      }

      const password = validatePassword(newPassword);

      return actionCall(
        "resetPassword",
        {
          token: resetToken,
          resetToken: resetToken,
          newPassword: password,
          password: password
        },
        {
          loading: true,
          loadingMessage: "กำลังเปลี่ยนรหัสผ่าน"
        }
      );
    },

    async changePassword(currentPassword, newPassword) {
      if (!String(currentPassword || "")) {
        throw new FinoraError(
          "CURRENT_PASSWORD_REQUIRED",
          "กรุณากรอกรหัสผ่านปัจจุบัน"
        );
      }

      const password = validatePassword(newPassword);

      return authCall(
        "changePassword",
        {
          currentPassword: String(currentPassword),
          newPassword: password
        },
        {
          loading: true,
          loadingMessage: "กำลังเปลี่ยนรหัสผ่าน"
        }
      );
    },

    async getCurrentUser(options) {
      const data = await authCall(
        "currentUser",
        {},
        Object.assign({ loading: false }, options || {})
      );

      const user = data && (data.user || data.profile || data);

      STATE.user = user || null;
      STATE.isAuthenticated = true;

      emit("finora:user-loaded", { user: STATE.user });

      return STATE.user;
    },

    async logout() {
      let result = null;

      try {
        if (session.getToken()) {
          result = await authCall(
            "logout",
            {},
            {
              loading: true,
              loadingMessage: "กำลังออกจากระบบ"
            }
          );
        }
      } finally {
        session.clear();
      }

      emit("finora:logout-complete", {});
      return result;
    },

    async checkSession() {
      if (!session.hasSession()) {
        STATE.user = null;
        STATE.isAuthenticated = false;

        return {
          authenticated: false,
          user: null
        };
      }

      const user = await this.getCurrentUser({ loading: false });

      return {
        authenticated: true,
        user: user
      };
    }
  };

  const publicApi = {
    ping() {
      return actionCall(
        "health",
        {},
        {
          loading: false,
          timeout: 15000
        }
      );
    },

    getConfig() {
      return actionCall(
        "publicConfig",
        {},
        { loading: false }
      );
    },

    getAnnouncements(placement) {
      return actionCall(
        "publicAnnouncements",
        { placement: text(placement || "LOGIN") },
        { loading: false }
      );
    },

    getLoanProducts() {
      return actionCall(
        "publicLoanProducts",
        {},
        { loading: false }
      );
    }
  };

  const profile = {
    getCurrent() {
      return auth.getCurrentUser();
    },

    update(data) {
      if (!isObject(data)) {
        throw new FinoraError(
          "INVALID_PROFILE",
          "ข้อมูลโปรไฟล์ไม่ถูกต้อง"
        );
      }

      return authCall(
        "updateProfile",
        data,
        {
          loading: true,
          loadingMessage: "กำลังบันทึกโปรไฟล์"
        }
      );
    },

    changePassword(currentPassword, newPassword) {
      return auth.changePassword(currentPassword, newPassword);
    },

    async listSessions() {
      return authCall(
        "sessions",
        {},
        {
          loading: true,
          loadingMessage: "กำลังโหลดอุปกรณ์ที่เข้าสู่ระบบ"
        }
      );
    },

    async revokeSession(sessionId) {
      if (!text(sessionId)) {
        throw new FinoraError(
          "SESSION_ID_REQUIRED",
          "ไม่พบรหัสเซสชัน"
        );
      }

      return authCall(
        "revokeSession",
        { sessionId: text(sessionId) },
        {
          loading: true,
          loadingMessage: "กำลังออกจากระบบของอุปกรณ์ที่เลือก"
        }
      );
    }
  };

  const dashboard = {
    get() {
      return authCall(
        "dashboard",
        {},
        {
          loading: true,
          loadingMessage: "กำลังโหลดข้อมูลบัญชี"
        }
      );
    }
  };

  const loans = {
    getPublicProducts() {
      return publicApi.getLoanProducts();
    },

    listApplications(page, pageSize) {
      return authCall(
        "loanApplications",
        {
          page: Number(page || 1),
          pageSize: Number(pageSize || 20)
        },
        {
          loading: true,
          loadingMessage: "กำลังโหลดคำขอสินเชื่อ"
        }
      );
    },

    submitApplication(data) {
      if (!isObject(data)) {
        throw new FinoraError(
          "INVALID_LOAN_APPLICATION",
          "ข้อมูลคำขอสินเชื่อไม่ถูกต้อง"
        );
      }

      return authCall(
        "submitLoanApplication",
        data,
        {
          loading: true,
          loadingMessage: "กำลังส่งคำขอสินเชื่อ"
        }
      );
    },

    listAccounts(page, pageSize) {
      return authCall(
        "loanAccounts",
        {
          page: Number(page || 1),
          pageSize: Number(pageSize || 20)
        },
        {
          loading: true,
          loadingMessage: "กำลังโหลดบัญชีสินเชื่อ"
        }
      );
    },

    getRepaymentSchedule(loanAccountId) {
      return authCall(
        "repaymentSchedule",
        { loanAccountId: text(loanAccountId) },
        {
          loading: true,
          loadingMessage: "กำลังโหลดตารางชำระเงิน"
        }
      );
    },

    getTransactions(type, page, pageSize) {
      return authCall(
        "transactions",
        {
          type: text(type),
          page: Number(page || 1),
          pageSize: Number(pageSize || 20)
        },
        {
          loading: true,
          loadingMessage: "กำลังโหลดประวัติธุรกรรม"
        }
      );
    }
  };

  const payments = {
    createPromptPayQR(amount, options) {
      const numericAmount = Number(amount);

      if (!Number.isFinite(numericAmount) || numericAmount <= 0) {
        throw new FinoraError(
          "INVALID_PAYMENT_AMOUNT",
          "จำนวนเงินต้องมากกว่า 0 บาท"
        );
      }

      const opts = isObject(options) ? options : {};

      return authCall(
        "createPromptPayQR",
        Object.assign({}, opts, { amount: numericAmount }),
        {
          loading: true,
          loadingMessage: "กำลังสร้าง QR พร้อมเพย์"
        }
      );
    },

    verifySlip(fileOrData, options) {
      const opts = isObject(options) ? options : {};
      const payload = Object.assign({}, opts);

      if (
        typeof File !== "undefined" &&
        fileOrData instanceof File
      ) {
        return readFileAsDataUrl(fileOrData).then(function (dataUrl) {
          const parsed = splitDataUrl(dataUrl);

          payload.base64 = parsed.base64;
          payload.dataUrl = dataUrl;
          payload.mimeType = parsed.mimeType;
          payload.fileName = fileOrData.name;

          return authCall(
            "verifyPaymentSlip",
            payload,
            {
              loading: true,
              loadingMessage: "กำลังตรวจสอบสลิป"
            }
          );
        });
      }

      if (typeof fileOrData === "string") {
        const parsed = splitDataUrl(fileOrData);

        payload.dataUrl = fileOrData;
        payload.base64 = parsed.base64 || fileOrData;
        payload.mimeType = parsed.mimeType || text(opts.mimeType);

      } else if (isObject(fileOrData)) {
        Object.assign(payload, fileOrData);
      }

      if (
        !payload.base64 &&
        !payload.dataUrl &&
        !payload.url &&
        !payload.payload
      ) {
        throw new FinoraError(
          "SLIP_REQUIRED",
          "กรุณาเลือกไฟล์สลิปหรือระบุข้อมูลสลิป"
        );
      }

      return authCall(
        "verifyPaymentSlip",
        payload,
        {
          loading: true,
          loadingMessage: "กำลังตรวจสอบสลิป"
        }
      );
    },

    getStatus(paymentId) {
      if (!text(paymentId)) {
        throw new FinoraError(
          "PAYMENT_ID_REQUIRED",
          "ไม่พบรหัสรายการชำระเงิน"
        );
      }

      return authCall(
        "paymentStatus",
        { paymentId: text(paymentId) },
        {
          loading: true,
          loadingMessage: "กำลังตรวจสอบสถานะการชำระเงิน"
        }
      );
    },

    getHistory(page, pageSize) {
      return authCall(
        "transactions",
        {
          type: "PAYMENT",
          page: Number(page || 1),
          pageSize: Number(pageSize || 20)
        },
        {
          loading: true,
          loadingMessage: "กำลังโหลดประวัติการชำระเงิน"
        }
      );
    }
  };

  const notifications = {
    list(page, pageSize) {
      return authCall(
        "notifications",
        {
          page: Number(page || 1),
          pageSize: Number(pageSize || 20)
        },
        { loading: false }
      );
    },

    markRead(notificationId) {
      if (!text(notificationId)) {
        throw new FinoraError(
          "NOTIFICATION_ID_REQUIRED",
          "ไม่พบรหัสการแจ้งเตือน"
        );
      }

      return authCall(
        "markNotificationRead",
        { notificationId: text(notificationId) },
        { loading: false }
      );
    }
  };

  const support = {
    createTicket(data) {
      if (!isObject(data)) {
        throw new FinoraError(
          "INVALID_SUPPORT_TICKET",
          "ข้อมูลคำร้องไม่ถูกต้อง"
        );
      }

      if (!text(data.subject) || !text(data.message)) {
        throw new FinoraError(
          "SUPPORT_FIELDS_REQUIRED",
          "กรุณากรอกหัวข้อและรายละเอียดคำร้อง"
        );
      }

      return authCall(
        "createSupportTicket",
        data,
        {
          loading: true,
          loadingMessage: "กำลังส่งคำร้องถึงฝ่ายบริการ"
        }
      );
    },

    listTickets(page, pageSize) {
      return authCall(
        "supportTickets",
        {
          page: Number(page || 1),
          pageSize: Number(pageSize || 20)
        },
        {
          loading: true,
          loadingMessage: "กำลังโหลดคำร้องของคุณ"
        }
      );
    }
  };

  function splitDataUrl(dataUrl) {
    const match = /^data:([^;,]+);base64,([\s\S]+)$/.exec(
      String(dataUrl || "")
    );

    return match
      ? { mimeType: match[1], base64: match[2] }
      : { mimeType: "", base64: "" };
  }

  function readFileAsDataUrl(file) {
    return new Promise(function (resolve, reject) {
      if (!file) {
        return reject(
          new FinoraError("FILE_REQUIRED", "กรุณาเลือกไฟล์")
        );
      }

      if (
        file.size >
        Number(CONFIG.MAX_IMAGE_SIZE_BYTES || 5242880)
      ) {
        return reject(
          new FinoraError(
            "FILE_TOO_LARGE",
            "ไฟล์ต้องมีขนาดไม่เกิน " +
              Math.floor(
                Number(CONFIG.MAX_IMAGE_SIZE_BYTES || 5242880) /
                  1048576
              ) +
              " MB"
          )
        );
      }

      if (CONFIG.SUPPORTED_IMAGE_TYPES.indexOf(file.type) === -1) {
        return reject(
          new FinoraError(
            "UNSUPPORTED_FILE_TYPE",
            "รองรับเฉพาะไฟล์ JPG, PNG และ WEBP"
          )
        );
      }

      const reader = new FileReader();

      reader.onload = function () {
        resolve(String(reader.result || ""));
      };

      reader.onerror = function () {
        reject(
          new FinoraError(
            "FILE_READ_ERROR",
            "ไม่สามารถอ่านไฟล์ได้"
          )
        );
      };

      reader.readAsDataURL(file);
    });
  }

  const images = {
    readAsDataUrl(file) {
      return readFileAsDataUrl(file);
    },

    async upload(file, category) {
      const dataUrl = await readFileAsDataUrl(file);
      const parsed = splitDataUrl(dataUrl);

      return authCall(
        "uploadImage",
        {
          base64: parsed.base64,
          dataUrl: dataUrl,
          mimeType: parsed.mimeType,
          fileName: text(file.name),
          category: text(category)
        },
        {
          loading: true,
          loadingMessage: "กำลังอัปโหลดรูปภาพ"
        }
      );
    }
  };

  const admin = {
    overview() {
      return authCall(
        "adminOverview",
        {},
        {
          loading: true,
          loadingMessage: "กำลังโหลดภาพรวมผู้ดูแลระบบ"
        }
      );
    },

    listUsers(page, pageSize, filters) {
      return authCall(
        "adminUsers",
        Object.assign(
          {
            page: Number(page || 1),
            pageSize: Number(pageSize || 20)
          },
          isObject(filters) ? filters : {}
        ),
        {
          loading: true,
          loadingMessage: "กำลังโหลดรายชื่อผู้ใช้"
        }
      );
    },

    updateUserStatus(userId, status, reason) {
      return authCall(
        "adminUpdateUserStatus",
        {
          userId: text(userId),
          status: text(status),
          reason: text(reason)
        },
        {
          loading: true,
          loadingMessage: "กำลังอัปเดตสถานะผู้ใช้"
        }
      );
    },

    listLoanProducts(page, pageSize) {
      return authCall(
        "adminLoanProducts",
        {
          page: Number(page || 1),
          pageSize: Number(pageSize || 50)
        },
        {
          loading: true,
          loadingMessage: "กำลังโหลดผลิตภัณฑ์สินเชื่อ"
        }
      );
    },

    saveLoanProduct(data) {
      if (!isObject(data)) {
        throw new FinoraError(
          "INVALID_LOAN_PRODUCT",
          "ข้อมูลผลิตภัณฑ์สินเชื่อไม่ถูกต้อง"
        );
      }

      return authCall(
        "adminSaveLoanProduct",
        data,
        {
          loading: true,
          loadingMessage: "กำลังบันทึกผลิตภัณฑ์สินเชื่อ"
        }
      );
    },

    deleteLoanProduct(productId) {
      return authCall(
        "adminDeleteLoanProduct",
        { productId: text(productId) },
        {
          loading: true,
          loadingMessage: "กำลังลบผลิตภัณฑ์สินเชื่อ"
        }
      );
    },

    listLoanApplications(page, pageSize, status) {
      return authCall(
        "adminLoanApplications",
        {
          page: Number(page || 1),
          pageSize: Number(pageSize || 20),
          status: text(status)
        },
        {
          loading: true,
          loadingMessage: "กำลังโหลดคำขอสินเชื่อ"
        }
      );
    },

    updateLoanApplication(data) {
      if (!isObject(data)) {
        throw new FinoraError(
          "INVALID_APPLICATION_UPDATE",
          "ข้อมูลแก้ไขคำขอสินเชื่อไม่ถูกต้อง"
        );
      }

      return authCall(
        "adminUpdateApplication",
        data,
        {
          loading: true,
          loadingMessage: "กำลังบันทึกผลการพิจารณา"
        }
      );
    },

    createLoanAccount(applicationId) {
      return authCall(
        "adminCreateLoanAccount",
        { applicationId: text(applicationId) },
        {
          loading: true,
          loadingMessage: "กำลังสร้างบัญชีสินเชื่อ"
        }
      );
    },

    confirmDisbursement(loanAccountId, reference) {
      return authCall(
        "adminConfirmDisbursement",
        {
          loanAccountId: text(loanAccountId),
          reference: text(reference)
        },
        {
          loading: true,
          loadingMessage: "กำลังยืนยันการจ่ายเงิน"
        }
      );
    },

    listTransactions(type, page, pageSize) {
      return authCall(
        "adminTransactions",
        {
          type: text(type),
          page: Number(page || 1),
          pageSize: Number(pageSize || 20)
        },
        {
          loading: true,
          loadingMessage: "กำลังโหลดรายการธุรกรรม"
        }
      );
    },

    recordRepayment(data) {
      if (!isObject(data)) {
        throw new FinoraError(
          "INVALID_REPAYMENT",
          "ข้อมูลรับชำระไม่ถูกต้อง"
        );
      }

      return authCall(
        "adminRecordRepayment",
        data,
        {
          loading: true,
          loadingMessage: "กำลังบันทึกการรับชำระ"
        }
      );
    },

    listAnnouncements(page, pageSize) {
      return authCall(
        "adminAnnouncements",
        {
          page: Number(page || 1),
          pageSize: Number(pageSize || 20)
        },
        {
          loading: true,
          loadingMessage: "กำลังโหลดประกาศ"
        }
      );
    },

    saveAnnouncement(data) {
      if (!isObject(data)) {
        throw new FinoraError(
          "INVALID_ANNOUNCEMENT",
          "ข้อมูลประกาศไม่ถูกต้อง"
        );
      }

      return authCall(
        "adminSaveAnnouncement",
        data,
        {
          loading: true,
          loadingMessage: "กำลังบันทึกประกาศ"
        }
      );
    },

    deleteAnnouncement(announcementId) {
      return authCall(
        "adminDeleteAnnouncement",
        { announcementId: text(announcementId) },
        {
          loading: true,
          loadingMessage: "กำลังลบประกาศ"
        }
      );
    },

    listSupportTickets(page, pageSize, status) {
      return authCall(
        "adminSupportTickets",
        {
          page: Number(page || 1),
          pageSize: Number(pageSize || 20),
          status: text(status)
        },
        {
          loading: true,
          loadingMessage: "กำลังโหลดคำร้อง"
        }
      );
    },

    updateSupportTicket(data) {
      if (!isObject(data)) {
        throw new FinoraError(
          "INVALID_SUPPORT_TICKET_UPDATE",
          "ข้อมูลแก้ไขคำร้องไม่ถูกต้อง"
        );
      }

      return authCall(
        "adminUpdateSupportTicket",
        data,
        {
          loading: true,
          loadingMessage: "กำลังบันทึกการแก้ไขคำร้อง"
        }
      );
    },

    listAuditLogs(page, pageSize) {
      return authCall(
        "adminAuditLogs",
        {
          page: Number(page || 1),
          pageSize: Number(pageSize || 50)
        },
        {
          loading: true,
          loadingMessage: "กำลังโหลดบันทึกตรวจสอบ"
        }
      );
    },

    listAdmins() {
      return authCall(
        "adminListAdmins",
        {},
        {
          loading: true,
          loadingMessage: "กำลังโหลดผู้ดูแลระบบ"
        }
      );
    },

    setAdminStatus(email, role, status) {
      return authCall(
        "adminSetAdminStatus",
        {
          email: validateEmail(email),
          role: text(role),
          status: text(status)
        },
        {
          loading: true,
          loadingMessage: "กำลังปรับปรุงสิทธิ์ผู้ดูแล"
        }
      );
    },

    getSettings() {
      return authCall(
        "adminGetSettings",
        {},
        {
          loading: true,
          loadingMessage: "กำลังโหลดการตั้งค่าระบบ"
        }
      );
    },

    updateSetting(settingKey, settingValue) {
      return authCall(
        "adminUpdateSettings",
        {
          settingKey: text(settingKey),
          settingValue: String(
            settingValue === undefined ? "" : settingValue
          )
        },
        {
          loading: true,
          loadingMessage: "กำลังบันทึกการตั้งค่า"
        }
      );
    },

    sendNotification(data) {
      if (!isObject(data)) {
        throw new FinoraError(
          "INVALID_NOTIFICATION",
          "ข้อมูลแจ้งเตือนไม่ถูกต้อง"
        );
      }

      return authCall(
        "adminSendNotification",
        data,
        {
          loading: true,
          loadingMessage: "กำลังส่งการแจ้งเตือน"
        }
      );
    }
  };

  const consent = {
    showTerms(content) {
      return ui.showDocumentModal({
        title: "ข้อกำหนดและเงื่อนไขการใช้บริการ FINORA",
        content: content,
        agreeText: "ยินยอม",
        cancelText: "ยกเลิก",
        warningText: "กรุณาเลื่อนอ่านเนื้อหาจนถึงด้านล่างก่อนยินยอม",
        requireScrollToBottom: true
      });
    },

    showPrivacyNotice(content) {
      return ui.showDocumentModal({
        title: "ประกาศความเป็นส่วนตัว",
        content: content,
        agreeText: "รับทราบ",
        cancelText: "ยกเลิก",
        warningText: "กรุณาเลื่อนอ่านเนื้อหาจนถึงด้านล่างก่อนดำเนินการ",
        requireScrollToBottom: true
      });
    }
  };

  function initializeGoogleIdentity() {
    if (!text(CONFIG.GOOGLE_CLIENT_ID)) {
      emit("finora:google-not-configured", {});
      return false;
    }

    if (
      !window.google ||
      !window.google.accounts ||
      !window.google.accounts.id
    ) {
      return false;
    }

    try {
      window.google.accounts.id.initialize({
        client_id: text(CONFIG.GOOGLE_CLIENT_ID),

        callback: function (response) {
          const credential = response && response.credential;

          auth.googleLogin(credential, false).catch(function (error) {
            ui.toast(normalizeError(error).message, "error");
          });
        },

        auto_select: false,
        cancel_on_tap_outside: true
      });

      STATE.googleReady = true;
      emit("finora:google-ready", {});

      return true;

    } catch (error) {
      emit("finora:google-error", {
        message: normalizeError(error).message
      });

      return false;
    }
  }

  function renderGoogleButton(elementOrId, options) {
    if (
      !initializeGoogleIdentity() &&
      !(
        window.google &&
        window.google.accounts &&
        window.google.accounts.id
      )
    ) {
      throw new FinoraError(
        "GOOGLE_IDENTITY_NOT_READY",
        "Google Sign-In ยังไม่พร้อม กรุณาตรวจสอบว่าโหลดสคริปต์ Google Identity Services แล้ว"
      );
    }

    const element = typeof elementOrId === "string"
      ? document.getElementById(elementOrId)
      : elementOrId;

    if (!element) {
      throw new FinoraError(
        "GOOGLE_BUTTON_CONTAINER_MISSING",
        "ไม่พบตำแหน่งแสดงปุ่ม Google Sign-In"
      );
    }

    window.google.accounts.id.renderButton(
      element,
      Object.assign(
        {
          theme: "outline",
          size: "large",
          text: "continue_with",
          shape: "rectangular",
          width: 280
        },
        options || {}
      )
    );
  }

  async function initialize() {
    if (STATE.initialized) {
      return;
    }

    STATE.initialized = true;
    ui.ensure();

    STATE.rememberMe = session.isRemembered();
    STATE.isAuthenticated = session.hasSession();

    const url = new URL(window.location.href);
    const resetToken = url.searchParams.get("token");
    const view = url.searchParams.get("view");

    if (view === "reset-password" && resetToken) {
      emit("finora:password-reset-link", {
        available: true,
        token: resetToken
      });

      url.searchParams.delete("token");

      window.history.replaceState(
        {},
        document.title,
        url.pathname +
          (url.searchParams.toString()
            ? "?" + url.searchParams.toString()
            : "") +
          url.hash
      );
    }

    emit("finora:client-ready", {
      configured: !!text(CONFIG.API_URL),
      authenticated: STATE.isAuthenticated,
      user: STATE.user
    });

    if (
      window.google &&
      window.google.accounts &&
      window.google.accounts.id
    ) {
      initializeGoogleIdentity();

    } else {
      // The Google Identity script may finish loading after this file.
      const googleScript = document.querySelector(
        'script[src*="accounts.google.com/gsi/client"]'
      );

      if (googleScript) {
        googleScript.addEventListener(
          "load",
          initializeGoogleIdentity,
          { once: true }
        );
      }
    }
  }

  const FINORA = {
    version: "2.0.0",

    config: {
      get() {
        return {
          appName: CONFIG.APP_NAME,
          apiUrlConfigured: !!text(CONFIG.API_URL),
          googleClientIdConfigured: !!text(CONFIG.GOOGLE_CLIENT_ID),
          maxImageSizeBytes: Number(CONFIG.MAX_IMAGE_SIZE_BYTES),
          minAge: Number(CONFIG.MIN_AGE),
          passwordMinLength: Number(CONFIG.PASSWORD_MIN_LENGTH),
          passwordMaxLength: Number(CONFIG.PASSWORD_MAX_LENGTH),
          termsVersion: CONFIG.TERMS_VERSION,
          privacyVersion: CONFIG.PRIVACY_VERSION
        };
      },

      set(name, value) {
        if (name === "API_URL") {
          CONFIG.API_URL = text(value);
        } else if (name === "GOOGLE_CLIENT_ID") {
          CONFIG.GOOGLE_CLIENT_ID = text(value);
        } else {
          throw new FinoraError(
            "CONFIG_KEY_NOT_ALLOWED",
            "ไม่อนุญาตให้เปลี่ยนค่าการตั้งค่านี้ระหว่างทำงาน"
          );
        }
      }
    },

    state: STATE,

    errors: {
      FinoraError: FinoraError,
      normalize: normalizeError
    },

    utils: {
      text: text,
      escapeHtml: escapeHtml,
      normalizeEmail: normalizedEmail,
      money: money,
      numberFormat: numberFormat,
      dateFormat: dateFormat,
      validEmail: validEmail,
      validateEmail: validateEmail,
      validatePhone: validatePhone,
      validateThaiCitizenId: validateThaiCitizenId,
      validatePassword: validatePassword,
      validateRegistration: validateRegistration,
      calculateAge: calculateAge,
      readFileAsDataUrl: readFileAsDataUrl
    },

    ui: ui,

    api: {
      call: call,
      callAction: actionCall,
      callAuthenticated: authCall,
      ping: publicApi.ping,
      getPublicConfig: publicApi.getConfig
    },

    session: session,
    auth: auth,
    public: publicApi,
    profile: profile,
    dashboard: dashboard,
    loans: loans,
    payments: payments,
    notifications: notifications,
    support: support,
    images: images,
    admin: admin,
    consent: consent,

    google: {
      initialize: initializeGoogleIdentity,
      renderButton: renderGoogleButton,

      async signInCredential(idToken, rememberMe) {
        return auth.googleLogin(idToken, rememberMe);
      }
    },

    async initialize() {
      return initialize();
    },

    async checkSession() {
      return auth.checkSession();
    },

    async healthCheck() {
      return publicApi.ping();
    }
  };

  window.FINORA = FINORA;

  if (document.readyState === "loading") {
    document.addEventListener(
      "DOMContentLoaded",
      initialize,
      { once: true }
    );
  } else {
    initialize();
  }
})(window, document);
