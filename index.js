/**
 * =====================================================================
 * FINORA - FRONTEND API CLIENT
 * File: index.js
 * Connects to: Google Apps Script Code.gs
 *
 * Responsibilities:
 * - API requests and error handling
 * - Authentication and session storage
 * - Email verification request and registration
 * - Password reset and password change
 * - LINE Login and account linking
 * - Borrower dashboard and loan operations
 * - Repayment schedule and transaction history
 * - Announcements, notifications and support tickets
 * - ImgBB upload through the protected backend API
 * - Admin API methods
 * - Shared loading spinner, modal, toast and consent-document modal
 * - Client-side form validation
 *
 * No mock data.
 * No fake API responses.
 * No passwords stored in browser storage.
 * No server-side API secrets in this file.
 * No SweetAlert2.
 *
 * IMPORTANT:
 * A valid API_URL must be configured before calling the API.
 * =====================================================================
 */

(function (window, document) {
  "use strict";

  /* ================================================================
   * 1. GLOBAL CONFIGURATION
   * ================================================================ */

  const DEFAULT_CONFIG = {
    API_URL: "",
    APP_NAME: "FINORA",
    API_TIMEOUT_MS: 60000,
    MAX_IMAGE_SIZE_BYTES: 5242880,
    SUPPORTED_IMAGE_TYPES: [
      "image/jpeg",
      "image/png",
      "image/webp",
      "image/gif"
    ],
    PASSWORD_MIN_LENGTH: 10,
    PASSWORD_MAX_LENGTH: 128,
    SESSION_STORAGE_KEY: "finora_session_token",
    SESSION_EXPIRY_KEY: "finora_session_expiry",
    REMEMBER_SESSION_KEY: "finora_remember_session",
    PENDING_LINE_SIGNUP_KEY: "finora_pending_line_signup",
    PENDING_LINE_SIGNUP_EXPIRY_KEY: "finora_pending_line_signup_expiry"
  };

  window.FINORA_CONFIG = window.FINORA_CONFIG || {};

  const CONFIG = Object.assign(
    {},
    DEFAULT_CONFIG,
    window.FINORA_CONFIG
  );

  const APP_STATE = {
    user: null,
    isAuthenticated: false,
    sessionExpiry: null,
    rememberMe: false,
    pendingResetToken: "",
    pendingLineSignupCode: "",
    publicConfig: null,
    loadingCount: 0,
    initialized: false
  };

  const AUTH_ERROR_CODES = [
    "AUTH_REQUIRED",
    "SESSION_INVALID",
    "SESSION_EXPIRED",
    "ACCOUNT_NOT_ACTIVE"
  ];

  const VALID_TITLES = [
    "เด็กหญิง",
    "เด็กชาย",
    "นาย",
    "นาง",
    "นางสาว"
  ];

  const ANNOUNCEMENT_PLACEMENTS = [
    "LOGIN",
    "SIGNUP",
    "BORROWER_DASHBOARD"
  ];

  let activeModalCleanup = null;

  /* ================================================================
   * 2. CUSTOM ERROR CLASS
   * ================================================================ */

  class FinoraError extends Error {
    constructor(code, message, details) {
      super(
        message ||
        "เกิดข้อผิดพลาด กรุณาลองใหม่อีกครั้ง"
      );

      this.name = "FinoraError";
      this.code = code || "UNKNOWN_ERROR";
      this.details = details || null;
    }
  }

  /* ================================================================
   * 3. GENERAL HELPERS
   * ================================================================ */

  function dispatchEvent(name, detail) {
    try {
      window.dispatchEvent(
        new CustomEvent(name, {
          detail: detail === undefined ? null : detail
        })
      );
    } catch (error) {
      console.error(
        "[FINORA] Event dispatch failed:",
        name,
        error
      );
    }
  }

  function normalizeString(value) {
    if (
      value === null ||
      value === undefined
    ) {
      return "";
    }

    return String(value).trim();
  }

  function safeJsonParse(value) {
    try {
      return JSON.parse(value);
    } catch (error) {
      return null;
    }
  }

  function isPlainObject(value) {
    return (
      value !== null &&
      typeof value === "object" &&
      !Array.isArray(value)
    );
  }

  function normalizeEmail(email) {
    return normalizeString(email).toLowerCase();
  }

  function escapeHtml(value) {
    return String(
      value === null || value === undefined
        ? ""
        : value
    )
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function getCurrentApiUrl() {
    const configured = normalizeString(
      CONFIG.API_URL
    );

    if (!configured) {
      throw new FinoraError(
        "API_NOT_CONFIGURED",
        "ยังไม่ได้ตั้งค่า URL ของ FINORA API กรุณากำหนด window.FINORA_CONFIG.API_URL ใน index.html"
      );
    }

    if (
      !/^https:\/\/script\.google\.com\/macros\/s\/[^/]+\/exec\/?$/i.test(
        configured
      )
    ) {
      throw new FinoraError(
        "INVALID_API_URL",
        "API_URL ต้องเป็น URL Google Apps Script Web App ที่ลงท้ายด้วย /exec"
      );
    }

    return configured.replace(/\/+$/, "");
  }

  function getStorage(storageName) {
    try {
      return window[storageName];
    } catch (error) {
      return null;
    }
  }

  function safeStorageGet(storageName, key) {
    const storage = getStorage(storageName);

    if (!storage) {
      return null;
    }

    try {
      return storage.getItem(key);
    } catch (error) {
      return null;
    }
  }

  function safeStorageSet(storageName, key, value) {
    const storage = getStorage(storageName);

    if (!storage) {
      throw new FinoraError(
        "STORAGE_UNAVAILABLE",
        "เบราว์เซอร์ไม่อนุญาตให้จัดเก็บสถานะการเข้าสู่ระบบ"
      );
    }

    try {
      storage.setItem(
        key,
        String(value)
      );

      return true;
    } catch (error) {
      throw new FinoraError(
        "STORAGE_WRITE_FAILED",
        "ไม่สามารถจัดเก็บสถานะการเข้าสู่ระบบได้"
      );
    }
  }

  function safeStorageRemove(storageName, key) {
    const storage = getStorage(storageName);

    if (!storage) {
      return;
    }

    try {
      storage.removeItem(key);
    } catch (error) {
      console.warn(
        "[FINORA] Could not clear browser storage."
      );
    }
  }

  function formatMoney(value, options) {
    const number = Number(value);

    if (!Number.isFinite(number)) {
      return "—";
    }

    const formatter = new Intl.NumberFormat(
      "th-TH",
      Object.assign(
        {
          style: "currency",
          currency: "THB",
          minimumFractionDigits: 2,
          maximumFractionDigits: 2
        },
        options || {}
      )
    );

    return formatter.format(number);
  }

  function formatNumber(value, maximumFractionDigits) {
    const number = Number(value);

    if (!Number.isFinite(number)) {
      return "—";
    }

    return new Intl.NumberFormat(
      "th-TH",
      {
        maximumFractionDigits:
          maximumFractionDigits === undefined
            ? 2
            : maximumFractionDigits
      }
    ).format(number);
  }

  function formatDate(value, options) {
    if (!value) {
      return "—";
    }

    const date = new Date(value);

    if (Number.isNaN(date.getTime())) {
      return "—";
    }

    return new Intl.DateTimeFormat(
      "th-TH",
      Object.assign(
        {
          day: "numeric",
          month: "short",
          year: "numeric"
        },
        options || {}
      )
    ).format(date);
  }

  function formatDateTime(value) {
    if (!value) {
      return "—";
    }

    const date = new Date(value);

    if (Number.isNaN(date.getTime())) {
      return "—";
    }

    return new Intl.DateTimeFormat(
      "th-TH",
      {
        day: "numeric",
        month: "short",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit"
      }
    ).format(date);
  }

  function isDateValid(dateString) {
    const value = normalizeString(dateString);

    if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
      return false;
    }

    const parts = value.split("-").map(Number);

    const date = new Date(
      Date.UTC(
        parts[0],
        parts[1] - 1,
        parts[2]
      )
    );

    return (
      date.getUTCFullYear() === parts[0] &&
      date.getUTCMonth() === parts[1] - 1 &&
      date.getUTCDate() === parts[2]
    );
  }

  function calculateAge(dateString) {
    if (!isDateValid(dateString)) {
      return null;
    }

    const parts = dateString.split("-").map(Number);

    const birthDate = new Date(
      Date.UTC(
        parts[0],
        parts[1] - 1,
        parts[2]
      )
    );

    const today = new Date();

    let age =
      today.getUTCFullYear() -
      birthDate.getUTCFullYear();

    const monthDifference =
      today.getUTCMonth() -
      birthDate.getUTCMonth();

    if (
      monthDifference < 0 ||
      (
        monthDifference === 0 &&
        today.getUTCDate() < birthDate.getUTCDate()
      )
    ) {
      age--;
    }

    return age;
  }

  function getMinimumAge() {
    const config = APP_STATE.publicConfig;

    const value = Number(
      config && config.minAge
    );

    return (
      Number.isFinite(value) && value > 0
    )
      ? value
      : 20;
  }

  function assertValidEmail(email) {
    const value = normalizeEmail(email);

    const pattern =
      /^[A-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Z0-9](?:[A-Z0-9-]*[A-Z0-9])?(?:\.[A-Z0-9](?:[A-Z0-9-]*[A-Z0-9])?)+$/i;

    if (
      value.length > 254 ||
      !pattern.test(value)
    ) {
      throw new FinoraError(
        "INVALID_EMAIL",
        "กรุณากรอกอีเมลให้ถูกต้อง"
      );
    }

    return value;
  }

  function assertValidPhone(phone) {
    const value = normalizeString(phone)
      .replace(/[\s-]/g, "");

    if (!/^0\d{9}$/.test(value)) {
      throw new FinoraError(
        "INVALID_PHONE",
        "กรุณากรอกหมายเลขโทรศัพท์มือถือ 10 หลัก"
      );
    }

    return value;
  }

  function assertValidCitizenId(citizenId) {
    const value = normalizeString(citizenId)
      .replace(/[\s-]/g, "");

    if (!/^\d{13}$/.test(value)) {
      throw new FinoraError(
        "INVALID_CITIZEN_ID",
        "หมายเลขบัตรประชาชนต้องเป็นตัวเลข 13 หลัก"
      );
    }

    let sum = 0;

    for (let index = 0; index < 12; index++) {
      sum +=
        Number(value.charAt(index)) *
        (13 - index);
    }

    const checkDigit =
      (11 - (sum % 11)) % 10;

    if (checkDigit !== Number(value.charAt(12))) {
      throw new FinoraError(
        "INVALID_CITIZEN_ID_CHECKSUM",
        "หมายเลขบัตรประชาชนไม่ผ่านการตรวจสอบ"
      );
    }

    return value;
  }

  function assertValidPassword(password) {
    const value = String(password || "");

    if (
      value.length < CONFIG.PASSWORD_MIN_LENGTH ||
      value.length > CONFIG.PASSWORD_MAX_LENGTH
    ) {
      throw new FinoraError(
        "WEAK_PASSWORD",
        "รหัสผ่านต้องมีความยาว 10–128 ตัวอักษร"
      );
    }

    if (
      !/[A-Za-z]/.test(value) ||
      !/\d/.test(value)
    ) {
      throw new FinoraError(
        "WEAK_PASSWORD",
        "รหัสผ่านต้องมีตัวอักษรภาษาอังกฤษและตัวเลข"
      );
    }

    return value;
  }

  function validateRegistration(data) {
    if (!isPlainObject(data)) {
      throw new FinoraError(
        "INVALID_REGISTRATION_DATA",
        "ไม่พบข้อมูลสมัครสมาชิก"
      );
    }

    const title = normalizeString(data.title);

    if (!VALID_TITLES.includes(title)) {
      throw new FinoraError(
        "INVALID_TITLE",
        "กรุณาเลือกคำนำหน้าที่ถูกต้อง"
      );
    }

    const fullName = normalizeString(data.fullName);

    if (
      fullName.length < 2 ||
      fullName.length > 150
    ) {
      throw new FinoraError(
        "INVALID_FULL_NAME",
        "กรุณากรอกชื่อ-นามสกุลให้ถูกต้อง"
      );
    }

    if (!isDateValid(data.dob)) {
      throw new FinoraError(
        "INVALID_DOB",
        "กรุณาเลือกวันเกิดให้ถูกต้อง"
      );
    }

    const age = calculateAge(data.dob);

    if (age === null || age < getMinimumAge()) {
      throw new FinoraError(
        "AGE_NOT_ELIGIBLE",
        "อายุยังไม่ถึงเกณฑ์ที่กำหนด"
      );
    }

    const citizenId = assertValidCitizenId(
      data.citizenId
    );

    const phone = assertValidPhone(data.phone);

    const email = assertValidEmail(data.email);

    const password = assertValidPassword(
      data.password
    );

    if (
      data.termsAccepted !== true &&
      data.termsAccepted !== "true"
    ) {
      throw new FinoraError(
        "TERMS_REQUIRED",
        "กรุณายอมรับข้อกำหนดและเงื่อนไขการใช้บริการ"
      );
    }

    if (
      data.privacyAcknowledged !== true &&
      data.privacyAcknowledged !== "true"
    ) {
      throw new FinoraError(
        "PRIVACY_REQUIRED",
        "กรุณารับทราบประกาศความเป็นส่วนตัว"
      );
    }

    return {
      title: title,
      fullName: fullName,
      dob: data.dob,
      citizenId: citizenId,
      phone: phone,
      email: email,
      password: password,
      username: normalizeString(data.username),
      termsAccepted: true,
      privacyAcknowledged: true
    };
  }

  function normalizeError(error) {
    if (error instanceof FinoraError) {
      return error;
    }

    if (error && error.name === "AbortError") {
      return new FinoraError(
        "API_TIMEOUT",
        "ระบบตอบกลับช้าเกินกำหนด กรุณาลองใหม่อีกครั้ง"
      );
    }

    return new FinoraError(
      "NETWORK_OR_CORS_ERROR",
      "ไม่สามารถเชื่อมต่อ FINORA API ได้ กรุณาตรวจสอบอินเทอร์เน็ต URL ของ Web App และการตั้งค่า CORS"
    );
  }

  /* ================================================================
   * 4. SHARED LOADING SPINNER AND MODAL STYLES
   *
   * One consistent four-dot spinner is used throughout the system.
   * The design follows the supplied reference:
   * blue, red, purple and green dots.
   * ================================================================ */

  function installUIStyles() {
    if (
      document.getElementById(
        "finora-shared-ui-styles"
      )
    ) {
      return;
    }

    const style = document.createElement("style");

    style.id = "finora-shared-ui-styles";

    style.textContent = `
      .finora-ui-host {
        font-family: Inter, "IBM Plex Sans Thai",
          "Noto Sans Thai", system-ui, sans-serif;
      }

      .finora-loading-overlay,
      .finora-modal-overlay {
        position: fixed;
        inset: 0;
        z-index: 99990;
        display: flex;
        align-items: center;
        justify-content: center;
        padding: 22px;
      }

      .finora-loading-overlay {
        background: rgba(245, 247, 250, 0.94);
        backdrop-filter: blur(5px);
        opacity: 0;
        visibility: hidden;
        transition:
          opacity .2s ease,
          visibility .2s ease;
      }

      .finora-loading-overlay.is-visible {
        opacity: 1;
        visibility: visible;
      }

      .finora-loading-card {
        width: min(100%, 360px);
        padding: 30px 24px;
        border: 1px solid #e7ebf0;
        border-radius: 22px;
        background: #ffffff;
        box-shadow: 0 20px 70px rgba(20, 36, 64, .12);
        text-align: center;
      }

      .finora-four-dot-spinner {
        position: relative;
        width: 116px;
        height: 112px;
        margin: 0 auto 20px;
      }

      .finora-four-dot-spinner .finora-dot {
        position: absolute;
        display: block;
        border-radius: 50%;
        transform-origin: center;
        animation: finora-dot-pulse 1.15s ease-in-out infinite;
      }

      .finora-four-dot-spinner .finora-dot-blue {
        width: 48px;
        height: 48px;
        left: 8px;
        top: 10px;
        background: #03a9f4;
        animation-delay: 0s;
      }

      .finora-four-dot-spinner .finora-dot-red {
        width: 36px;
        height: 36px;
        right: 9px;
        top: 15px;
        background: #ff5b63;
        animation-delay: .15s;
      }

      .finora-four-dot-spinner .finora-dot-purple {
        width: 28px;
        height: 28px;
        left: 19px;
        bottom: 12px;
        background: #cc63f3;
        animation-delay: .3s;
      }

      .finora-four-dot-spinner .finora-dot-green {
        width: 48px;
        height: 48px;
        right: 0;
        bottom: 0;
        background: #8bcf20;
        animation-delay: .45s;
      }

      @keyframes finora-dot-pulse {
        0%, 100% {
          transform: scale(.9);
          opacity: .8;
        }
        50% {
          transform: scale(1.06);
          opacity: 1;
        }
      }

      .finora-loading-title {
        color: #172033;
        font-size: 17px;
        line-height: 1.65;
        font-weight: 650;
        margin: 0;
      }

      .finora-loading-message {
        color: #66758a;
        font-size: 13px;
        line-height: 1.8;
        margin: 7px 0 0;
        word-break: break-word;
      }

      .finora-modal-overlay {
        z-index: 100000;
        padding: 18px;
        background: rgba(13, 24, 42, .52);
        backdrop-filter: blur(6px);
        opacity: 0;
        visibility: hidden;
        transition:
          opacity .22s ease,
          visibility .22s ease;
      }

      .finora-modal-overlay.is-visible {
        opacity: 1;
        visibility: visible;
      }

      .finora-modal-card {
        display: flex;
        flex-direction: column;
        width: min(100%, 480px);
        max-height: min(88vh, 800px);
        overflow: hidden;
        background: #ffffff;
        border: 1px solid rgba(226, 232, 240, .9);
        border-radius: 22px;
        box-shadow: 0 24px 90px rgba(8, 20, 40, .23);
        transform: translateY(12px) scale(.98);
        transition: transform .22s ease;
      }

      .finora-modal-overlay.is-visible .finora-modal-card {
        transform: translateY(0) scale(1);
      }

      .finora-modal-header {
        display: flex;
        align-items: flex-start;
        gap: 13px;
        padding: 23px 24px 14px;
      }

      .finora-modal-icon {
        flex: 0 0 40px;
        width: 40px;
        height: 40px;
        display: flex;
        align-items: center;
        justify-content: center;
        border-radius: 13px;
        background: #e9f7f5;
        color: #168a83;
        font-size: 19px;
      }

      .finora-modal-icon.is-error {
        background: #fff0f0;
        color: #d93045;
      }

      .finora-modal-icon.is-warning {
        background: #fff7e7;
        color: #b77910;
      }

      .finora-modal-title {
        flex: 1;
        min-width: 0;
        margin: 1px 0 0;
        color: #142440;
        font-size: 19px;
        line-height: 1.55;
        font-weight: 750;
        overflow-wrap: anywhere;
      }

      .finora-modal-close {
        flex: 0 0 34px;
        width: 34px;
        height: 34px;
        border: 0;
        border-radius: 10px;
        background: transparent;
        color: #7a8799;
        font-size: 22px;
        cursor: pointer;
      }

      .finora-modal-close:hover {
        background: #f1f5f9;
        color: #142440;
      }

      .finora-modal-body {
        overflow-y: auto;
        padding: 0 24px 20px;
        color: #5c6a7e;
        font-size: 14px;
        line-height: 1.9;
        overflow-wrap: anywhere;
      }

      .finora-modal-body p {
        margin: 0 0 12px;
      }

      .finora-modal-footer {
        display: flex;
        gap: 10px;
        justify-content: flex-end;
        padding: 16px 24px 22px;
        border-top: 1px solid #edf1f5;
      }

      .finora-modal-button {
        min-height: 43px;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        padding: 11px 17px;
        border: 1px solid #dce3ec;
        border-radius: 11px;
        background: #ffffff;
        color: #344259;
        font: inherit;
        font-size: 13px;
        font-weight: 700;
        cursor: pointer;
        transition:
          background .15s ease,
          opacity .15s ease,
          transform .15s ease;
      }

      .finora-modal-button:hover {
        background: #f6f8fb;
      }

      .finora-modal-button:active {
        transform: scale(.98);
      }

      .finora-modal-button.primary {
        background: #168a83;
        border-color: #168a83;
        color: #ffffff;
      }

      .finora-modal-button.primary:hover {
        background: #0f756f;
      }

      .finora-modal-button.danger {
        background: #d93045;
        border-color: #d93045;
        color: #ffffff;
      }

      .finora-modal-button:disabled {
        opacity: .45;
        cursor: not-allowed;
        transform: none;
      }

      .finora-toast-container {
        position: fixed;
        top: 18px;
        right: 18px;
        z-index: 100100;
        display: flex;
        flex-direction: column;
        align-items: flex-end;
        gap: 9px;
        width: min(390px, calc(100vw - 36px));
        pointer-events: none;
      }

      .finora-toast {
        display: flex;
        align-items: flex-start;
        gap: 11px;
        width: 100%;
        padding: 14px 16px;
        border: 1px solid #e1e8ef;
        border-radius: 14px;
        background: #ffffff;
        color: #26364b;
        box-shadow: 0 12px 40px rgba(13, 31, 54, .12);
        font-size: 13px;
        line-height: 1.75;
        animation: finora-toast-in .22s ease;
        pointer-events: auto;
      }

      .finora-toast i {
        flex: 0 0 18px;
        margin-top: 2px;
        font-size: 16px;
      }

      .finora-toast.success i {
        color: #168a83;
      }

      .finora-toast.error i {
        color: #d93045;
      }

      .finora-toast.warning i {
        color: #bf8518;
      }

      .finora-toast.info i {
        color: #3775bd;
      }

      @keyframes finora-toast-in {
        from {
          transform: translateY(-8px);
          opacity: 0;
        }
        to {
          transform: translateY(0);
          opacity: 1;
        }
      }

      .finora-document-scroll {
        max-height: 48vh;
        min-height: 180px;
        overflow-y: auto;
        padding: 16px;
        border: 1px solid #e2e8f0;
        border-radius: 13px;
        background: #f8fafc;
        color: #344259;
        line-height: 1.9;
        font-size: 13px;
        white-space: pre-wrap;
        overflow-wrap: anywhere;
      }

      .finora-document-warning {
        margin-top: 12px;
        color: #cf263b;
        font-size: 12px;
        font-weight: 650;
        line-height: 1.75;
      }

      @media (max-width: 520px) {
        .finora-modal-header {
          padding: 19px 18px 12px;
        }

        .finora-modal-body {
          padding: 0 18px 18px;
        }

        .finora-modal-footer {
          padding: 14px 18px 18px;
        }

        .finora-modal-title {
          font-size: 17px;
        }

        .finora-modal-button {
          flex: 1;
        }

        .finora-loading-card {
          padding: 27px 18px;
        }
      }

      @media (prefers-reduced-motion: reduce) {
        .finora-loading-overlay,
        .finora-modal-overlay,
        .finora-modal-card,
        .finora-toast {
          transition: none !important;
          animation: none !important;
        }

        .finora-four-dot-spinner .finora-dot {
          animation: none !important;
        }
      }
    `;

    (document.head || document.documentElement)
      .appendChild(style);
  }

  function ensureUIHost() {
    installUIStyles();

    let host = document.getElementById(
      "finora-ui-host"
    );

    if (host) {
      return host;
    }

    host = document.createElement("div");
    host.id = "finora-ui-host";
    host.className = "finora-ui-host";

    const loadingOverlay = document.createElement("div");
    loadingOverlay.id = "finora-global-loading";
    loadingOverlay.className =
      "finora-loading-overlay";

    loadingOverlay.setAttribute("role", "status");
    loadingOverlay.setAttribute("aria-live", "polite");
    loadingOverlay.setAttribute("aria-hidden", "true");

    loadingOverlay.innerHTML = `
      <div class="finora-loading-card">
        <div class="finora-four-dot-spinner"
             aria-hidden="true">
          <span class="finora-dot finora-dot-blue"></span>
          <span class="finora-dot finora-dot-red"></span>
          <span class="finora-dot finora-dot-purple"></span>
          <span class="finora-dot finora-dot-green"></span>
        </div>
        <p class="finora-loading-title"
           id="finora-loading-title">
          กำลังโหลดข้อมูลระบบ
        </p>
        <p class="finora-loading-message"
           id="finora-loading-message">
          กรุณารอสักครู่
        </p>
      </div>
    `;

    const modalOverlay = document.createElement("div");
    modalOverlay.id = "finora-modal-overlay";
    modalOverlay.className = "finora-modal-overlay";

    modalOverlay.setAttribute("aria-hidden", "true");

    const toastContainer = document.createElement("div");
    toastContainer.id = "finora-toast-container";
    toastContainer.className =
      "finora-toast-container";

    toastContainer.setAttribute(
      "aria-live",
      "polite"
    );

    host.appendChild(loadingOverlay);
    host.appendChild(modalOverlay);
    host.appendChild(toastContainer);

    (document.body || document.documentElement)
      .appendChild(host);

    return host;
  }

  const ui = {
    showLoading(message, detail) {
      ensureUIHost();

      APP_STATE.loadingCount++;

      const overlay = document.getElementById(
        "finora-global-loading"
      );

      const title = document.getElementById(
        "finora-loading-title"
      );

      const description = document.getElementById(
        "finora-loading-message"
      );

      if (title) {
        title.textContent =
          normalizeString(message) ||
          "กำลังโหลดข้อมูลระบบ";
      }

      if (description) {
        description.textContent =
          normalizeString(detail) ||
          "กรุณารอสักครู่";
      }

      if (overlay) {
        overlay.classList.add("is-visible");
        overlay.setAttribute("aria-hidden", "false");
      }

      dispatchEvent(
        "finora:loading",
        {
          active: true,
          message: normalizeString(message)
        }
      );
    },

    hideLoading() {
      if (APP_STATE.loadingCount > 0) {
        APP_STATE.loadingCount--;
      }

      if (APP_STATE.loadingCount > 0) {
        return;
      }

      const overlay = document.getElementById(
        "finora-global-loading"
      );

      if (overlay) {
        overlay.classList.remove("is-visible");
        overlay.setAttribute("aria-hidden", "true");
      }

      dispatchEvent(
        "finora:loading",
        {
          active: false
        }
      );
    },

    setLoadingMessage(message, detail) {
      ensureUIHost();

      const title = document.getElementById(
        "finora-loading-title"
      );

      const description = document.getElementById(
        "finora-loading-message"
      );

      if (title) {
        title.textContent =
          normalizeString(message) ||
          "กำลังโหลดข้อมูลระบบ";
      }

      if (description) {
        description.textContent =
          normalizeString(detail) ||
          "กรุณารอสักครู่";
      }
    },

    toast(message, type, duration) {
      ensureUIHost();

      const container = document.getElementById(
        "finora-toast-container"
      );

      if (!container) {
        return;
      }

      const allowedTypes = [
        "success",
        "error",
        "warning",
        "info"
      ];

      const toastType = allowedTypes.includes(type)
        ? type
        : "info";

      const iconMap = {
        success: "fa-circle-check",
        error: "fa-circle-exclamation",
        warning: "fa-triangle-exclamation",
        info: "fa-circle-info"
      };

      const toast = document.createElement("div");
      toast.className =
        "finora-toast " + toastType;

      const icon = document.createElement("i");
      icon.className =
        "fa-solid " + iconMap[toastType];
      icon.setAttribute("aria-hidden", "true");

      const text = document.createElement("div");
      text.textContent = normalizeString(message);

      toast.appendChild(icon);
      toast.appendChild(text);
      container.appendChild(toast);

      const timeout = Number(duration) > 0
        ? Number(duration)
        : 3500;

      window.setTimeout(
        function () {
          if (toast.parentNode) {
            toast.parentNode.removeChild(toast);
          }
        },
        timeout
      );
    },

    modal(options) {
      ensureUIHost();

      const settings = Object.assign(
        {
          title: "แจ้งให้ทราบ",
          message: "",
          type: "info",
          confirmText: "ตกลง",
          cancelText: "",
          closeOnBackdrop: false,
          closeOnEscape: true
        },
        options || {}
      );

      closeActiveModal();

      const overlay = document.getElementById(
        "finora-modal-overlay"
      );

      overlay.replaceChildren();

      const card = document.createElement("div");
      card.className = "finora-modal-card";
      card.setAttribute("role", "dialog");
      card.setAttribute("aria-modal", "true");

      const header = document.createElement("div");
      header.className = "finora-modal-header";

      const iconBox = document.createElement("div");
      iconBox.className = "finora-modal-icon";

      const icon = document.createElement("i");
      icon.className = settings.type === "error"
        ? "fa-solid fa-circle-exclamation"
        : settings.type === "warning"
          ? "fa-solid fa-triangle-exclamation"
          : settings.type === "success"
            ? "fa-solid fa-circle-check"
            : "fa-solid fa-circle-info";

      icon.setAttribute("aria-hidden", "true");

      if (settings.type === "error") {
        iconBox.classList.add("is-error");
      } else if (settings.type === "warning") {
        iconBox.classList.add("is-warning");
      }

      iconBox.appendChild(icon);

      const title = document.createElement("h2");
      title.className = "finora-modal-title";
      title.textContent = settings.title;

      header.appendChild(iconBox);
      header.appendChild(title);

      const closeButton = document.createElement("button");
      closeButton.type = "button";
      closeButton.className = "finora-modal-close";
      closeButton.setAttribute(
        "aria-label",
        "ปิดหน้าต่าง"
      );
      closeButton.textContent = "×";
      header.appendChild(closeButton);

      const body = document.createElement("div");
      body.className = "finora-modal-body";
      body.textContent = normalizeString(
        settings.message
      );

      const footer = document.createElement("div");
      footer.className = "finora-modal-footer";

      if (settings.cancelText) {
        const cancelButton =
          document.createElement("button");

        cancelButton.type = "button";
        cancelButton.className =
          "finora-modal-button";
        cancelButton.textContent =
          settings.cancelText;

        footer.appendChild(cancelButton);

        cancelButton.addEventListener(
          "click",
          function () {
            finish(false);
          }
        );
      }

      const confirmButton =
        document.createElement("button");

      confirmButton.type = "button";
      confirmButton.className =
        "finora-modal-button primary";

      confirmButton.textContent =
        settings.confirmText;

      footer.appendChild(confirmButton);

      card.appendChild(header);
      card.appendChild(body);
      card.appendChild(footer);

      overlay.appendChild(card);

      let finished = false;

      function finish(confirmed) {
        if (finished) {
          return;
        }

        finished = true;

        overlay.classList.remove("is-visible");
        overlay.setAttribute("aria-hidden", "true");

        document.removeEventListener(
          "keydown",
          handleKeyDown
        );

        activeModalCleanup = null;

        if (typeof settings.onClose === "function") {
          settings.onClose(confirmed);
        }

        if (
          confirmed &&
          typeof settings.onConfirm === "function"
        ) {
          settings.onConfirm();
        }

        if (
          !confirmed &&
          typeof settings.onCancel === "function"
        ) {
          settings.onCancel();
        }

        resolvePromise(confirmed);
      }

      function handleKeyDown(event) {
        if (
          event.key === "Escape" &&
          settings.closeOnEscape
        ) {
          finish(false);
        }

        if (event.key === "Enter") {
          if (
            document.activeElement === confirmButton
          ) {
            finish(true);
          }
        }
      }

      closeButton.addEventListener(
        "click",
        function () {
          finish(false);
        }
      );

      confirmButton.addEventListener(
        "click",
        function () {
          finish(true);
        }
      );

      overlay.onclick = function (event) {
        if (
          event.target === overlay &&
          settings.closeOnBackdrop
        ) {
          finish(false);
        }
      };

      document.addEventListener(
        "keydown",
        handleKeyDown
      );

      overlay.classList.add("is-visible");
      overlay.setAttribute("aria-hidden", "false");

      let resolvePromise;

      const promise = new Promise(
        function (resolve) {
          resolvePromise = resolve;
        }
      );

      activeModalCleanup = function () {
        finish(false);
      };

      window.requestAnimationFrame(
        function () {
          confirmButton.focus();
        }
      );

      return promise;
    },

    showDocumentModal(options) {
      ensureUIHost();

      const settings = Object.assign(
        {
          title: "เอกสาร",
          content: "",
          agreeText: "ยินยอม",
          cancelText: "ยกเลิก",
          warningText:
            "กรุณาเลื่อนลงด้านล่างสุดและกดยินยอม",
          requireScrollToBottom: true
        },
        options || {}
      );

      closeActiveModal();

      const overlay = document.getElementById(
        "finora-modal-overlay"
      );

      overlay.replaceChildren();

      const card = document.createElement("div");
      card.className = "finora-modal-card";
      card.setAttribute("role", "dialog");
      card.setAttribute("aria-modal", "true");

      const header = document.createElement("div");
      header.className = "finora-modal-header";

      const iconBox = document.createElement("div");
      iconBox.className = "finora-modal-icon";

      const icon = document.createElement("i");
      icon.className = "fa-solid fa-file-shield";
      icon.setAttribute("aria-hidden", "true");

      iconBox.appendChild(icon);

      const title = document.createElement("h2");
      title.className = "finora-modal-title";
      title.textContent = settings.title;

      header.appendChild(iconBox);
      header.appendChild(title);

      const closeButton = document.createElement("button");
      closeButton.type = "button";
      closeButton.className = "finora-modal-close";
      closeButton.setAttribute(
        "aria-label",
        "ปิดหน้าต่าง"
      );
      closeButton.textContent = "×";
      header.appendChild(closeButton);

      const body = document.createElement("div");
      body.className = "finora-modal-body";

      const scrollArea = document.createElement("div");
      scrollArea.className = "finora-document-scroll";
      scrollArea.tabIndex = 0;

      /*
       * Use textContent rather than innerHTML.
       * The terms/privacy copy remains plain text to avoid
       * injecting arbitrary HTML into the modal.
       */
      if (settings.content instanceof Node) {
        scrollArea.appendChild(
          settings.content.cloneNode(true)
        );
      } else {
        scrollArea.textContent = String(
          settings.content || ""
        );
      }

      const warning = document.createElement("div");
      warning.className = "finora-document-warning";
      warning.textContent = settings.warningText;

      body.appendChild(scrollArea);
      body.appendChild(warning);

      const footer = document.createElement("div");
      footer.className = "finora-modal-footer";

      const cancelButton = document.createElement("button");
      cancelButton.type = "button";
      cancelButton.className = "finora-modal-button";
      cancelButton.textContent = settings.cancelText;

      const agreeButton = document.createElement("button");
      agreeButton.type = "button";
      agreeButton.className =
        "finora-modal-button primary";
      agreeButton.textContent = settings.agreeText;

      footer.appendChild(cancelButton);
      footer.appendChild(agreeButton);

      card.appendChild(header);
      card.appendChild(body);
      card.appendChild(footer);

      overlay.appendChild(card);

      let finished = false;

      let hasReachedBottom =
        !settings.requireScrollToBottom;

      function updateScrollState() {
        const scrollable =
          scrollArea.scrollHeight >
          scrollArea.clientHeight + 2;

        if (
          !settings.requireScrollToBottom ||
          !scrollable
        ) {
          hasReachedBottom = true;
        } else {
          hasReachedBottom =
            scrollArea.scrollTop +
            scrollArea.clientHeight >=
            scrollArea.scrollHeight - 4;
        }

        agreeButton.disabled =
          !hasReachedBottom;

        warning.style.display =
          hasReachedBottom
            ? "none"
            : "block";
      }

      function finish(accepted) {
        if (finished) {
          return;
        }

        finished = true;

        overlay.classList.remove("is-visible");
        overlay.setAttribute("aria-hidden", "true");

        document.removeEventListener(
          "keydown",
          handleKeyDown
        );

        activeModalCleanup = null;

        if (
          accepted &&
          typeof settings.onAgree === "function"
        ) {
          settings.onAgree();
        }

        if (
          !accepted &&
          typeof settings.onCancel === "function"
        ) {
          settings.onCancel();
        }

        resolvePromise({
          accepted: accepted
        });
      }

      function handleKeyDown(event) {
        if (event.key === "Escape") {
          finish(false);
        }
      }

      scrollArea.addEventListener(
        "scroll",
        updateScrollState
      );

      cancelButton.addEventListener(
        "click",
        function () {
          finish(false);
        }
      );

      closeButton.addEventListener(
        "click",
        function () {
          finish(false);
        }
      );

      agreeButton.addEventListener(
        "click",
        function () {
          if (!hasReachedBottom) {
            return;
          }

          finish(true);
        }
      );

      overlay.onclick = function (event) {
        if (event.target === overlay) {
          finish(false);
        }
      };

      document.addEventListener(
        "keydown",
        handleKeyDown
      );

      overlay.classList.add("is-visible");
      overlay.setAttribute("aria-hidden", "false");

      let resolvePromise;

      const promise = new Promise(
        function (resolve) {
          resolvePromise = resolve;
        }
      );

      activeModalCleanup = function () {
        finish(false);
      };

      updateScrollState();

      window.requestAnimationFrame(
        function () {
          scrollArea.focus();
        }
      );

      return promise;
    }
  };

  function closeActiveModal() {
    if (typeof activeModalCleanup === "function") {
      activeModalCleanup();
    }
  }

  /* ================================================================
   * 5. SESSION STORAGE
   *
   * Remember me:
   * - true: localStorage
   * - false: sessionStorage
   *
   * The password, full citizen ID, and registration form are never
   * stored by this module.
   *
   * A token in browser storage remains accessible to page JavaScript.
   * For a high-security production deployment, prefer a server-side
   * session broker and HttpOnly Secure cookies.
   * ================================================================ */

  const session = {
    getToken() {
      let token = safeStorageGet(
        "localStorage",
        CONFIG.SESSION_STORAGE_KEY
      );

      let expiry = safeStorageGet(
        "localStorage",
        CONFIG.SESSION_EXPIRY_KEY
      );

      if (token) {
        if (
          expiry &&
          Date.parse(expiry) <= Date.now()
        ) {
          this.clear();
        } else {
          return token;
        }
      }

      token = safeStorageGet(
        "sessionStorage",
        CONFIG.SESSION_STORAGE_KEY
      );

      expiry = safeStorageGet(
        "sessionStorage",
        CONFIG.SESSION_EXPIRY_KEY
      );

      if (
        token &&
        expiry &&
        Date.parse(expiry) <= Date.now()
      ) {
        this.clear();
        return "";
      }

      return token || "";
    },

    set(token, rememberMe, expiresAt) {
      const value = normalizeString(token);

      if (!value) {
        throw new FinoraError(
          "SESSION_TOKEN_MISSING",
          "เซิร์ฟเวอร์ไม่ได้ส่ง Session Token กลับมา"
        );
      }

      this.clear();

      const storageName = rememberMe
        ? "localStorage"
        : "sessionStorage";

      safeStorageSet(
        storageName,
        CONFIG.SESSION_STORAGE_KEY,
        value
      );

      if (expiresAt) {
        safeStorageSet(
          storageName,
          CONFIG.SESSION_EXPIRY_KEY,
          expiresAt
        );
      }

      if (rememberMe) {
        safeStorageSet(
          "localStorage",
          CONFIG.REMEMBER_SESSION_KEY,
          "true"
        );
      } else {
        safeStorageSet(
          "sessionStorage",
          CONFIG.REMEMBER_SESSION_KEY,
          "false"
        );
      }

      APP_STATE.sessionExpiry =
        expiresAt || null;

      APP_STATE.rememberMe = !!rememberMe;
      APP_STATE.isAuthenticated = true;

      dispatchEvent(
        "finora:session-changed",
        {
          authenticated: true,
          expiresAt: expiresAt || null,
          rememberMe: !!rememberMe
        }
      );

      return true;
    },

    clear() {
      [
        CONFIG.SESSION_STORAGE_KEY,
        CONFIG.SESSION_EXPIRY_KEY,
        CONFIG.REMEMBER_SESSION_KEY
      ].forEach(
        function (key) {
          safeStorageRemove("localStorage", key);
          safeStorageRemove("sessionStorage", key);
        }
      );

      APP_STATE.user = null;
      APP_STATE.isAuthenticated = false;
      APP_STATE.sessionExpiry = null;
      APP_STATE.rememberMe = false;

      dispatchEvent(
        "finora:session-changed",
        {
          authenticated: false
        }
      );
    },

    hasSession() {
      return !!this.getToken();
    },

    isRemembered() {
      return (
        safeStorageGet(
          "localStorage",
          CONFIG.REMEMBER_SESSION_KEY
        ) === "true"
      );
    }
  };

  /* ================================================================
   * 6. HTTP API CLIENT
   * ================================================================ */

  async function callApi(action, payload, options) {
    const settings = Object.assign(
      {
        loading: true,
        loadingMessage: "กำลังโหลดข้อมูลระบบ",
        loadingDetail: "กรุณารอสักครู่",
        timeout: CONFIG.API_TIMEOUT_MS
      },
      options || {}
    );

    const requestPayload = Object.assign(
      {},
      isPlainObject(payload) ? payload : {},
      {
        action: action
      }
    );

    let controller = null;
    let timeoutId = null;
    let didShowLoading = false;

    if (settings.loading) {
      ui.showLoading(
        settings.loadingMessage,
        settings.loadingDetail
      );

      didShowLoading = true;
    }

    try {
      const apiUrl = getCurrentApiUrl();

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
          Number(settings.timeout) || CONFIG.API_TIMEOUT_MS
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
          body: JSON.stringify(requestPayload),
          signal: controller
            ? controller.signal
            : undefined
        }
      );

      const responseText = await response.text();

      const responseData = safeJsonParse(
        responseText
      );

      if (!responseData) {
        throw new FinoraError(
          "INVALID_API_RESPONSE",
          "API ส่งผลลัพธ์ที่ไม่ใช่ JSON กรุณาตรวจสอบ URL, สิทธิ์การ Deploy และการเชื่อมต่อ CORS"
        );
      }

      if (responseData.ok !== true) {
        const errorData = responseData.error || {};

        const apiError = new FinoraError(
          errorData.code || "API_ERROR",
          errorData.message ||
            "เซิร์ฟเวอร์ไม่สามารถดำเนินการได้",
          errorData
        );

        if (
          AUTH_ERROR_CODES.includes(apiError.code)
        ) {
          session.clear();
        }

        dispatchEvent(
          "finora:api-error",
          {
            action: action,
            code: apiError.code,
            message: apiError.message
          }
        );

        throw apiError;
      }

      if (!response.ok) {
        throw new FinoraError(
          "HTTP_ERROR",
          "เกิดข้อผิดพลาดในการติดต่อเซิร์ฟเวอร์"
        );
      }

      dispatchEvent(
        "finora:api-success",
        {
          action: action
        }
      );

      return responseData.data;

    } catch (error) {
      const normalized = normalizeError(error);

      dispatchEvent(
        "finora:api-error",
        {
          action: action,
          code: normalized.code,
          message: normalized.message
        }
      );

      throw normalized;

    } finally {
      if (timeoutId !== null) {
        window.clearTimeout(timeoutId);
      }

      if (didShowLoading) {
        ui.hideLoading();
      }
    }
  }

  function callAuthenticatedApi(
    action,
    payload,
    options
  ) {
    const token = session.getToken();

    if (!token) {
      return Promise.reject(
        new FinoraError(
          "AUTH_REQUIRED",
          "กรุณาเข้าสู่ระบบก่อนดำเนินการ"
        )
      );
    }

    const data = Object.assign(
      {},
      isPlainObject(payload) ? payload : {},
      {
        sessionToken: token
      }
    );

    return callApi(
      action,
      data,
      options
    );
  }

  /* ================================================================
   * 7. AUTHENTICATION API
   * ================================================================ */

  const auth = {
    async requestEmailVerification(email) {
      const normalizedEmail = assertValidEmail(email);

      const result = await callApi(
        "requestEmailVerification",
        {
          email: normalizedEmail
        },
        {
          loading: true,
          loadingMessage:
            "กำลังส่งลิงก์ยืนยันอีเมล",
          loadingDetail:
            normalizedEmail
        }
      );

      dispatchEvent(
        "finora:email-verification-requested",
        {
          email: normalizedEmail,
          expiresAt: result && result.expiresAt
        }
      );

      return result;
    },

    async register(data) {
      const registration = validateRegistration(data);

      let lineSignupCode =
        normalizeString(data.lineSignupCode);

      if (!lineSignupCode) {
        lineSignupCode =
          getPendingLineSignupCode();
      }

      const payload = Object.assign(
        {},
        registration
      );

      if (lineSignupCode) {
        payload.lineSignupCode = lineSignupCode;
      }

      const result = await callApi(
        "registerUser",
        payload,
        {
          loading: true,
          loadingMessage:
            "กำลังสร้างบัญชี FINORA",
          loadingDetail:
            "กำลังตรวจสอบข้อมูลสมัครสมาชิก"
        }
      );

      clearPendingLineSignupCode();

      dispatchEvent(
        "finora:registration-complete",
        result
      );

      return result;
    },

    async login(identifier, password, rememberMe) {
      const accountIdentifier =
        normalizeString(identifier);

      const accountPassword =
        String(password || "");

      if (!accountIdentifier) {
        throw new FinoraError(
          "LOGIN_IDENTIFIER_REQUIRED",
          "กรุณากรอกชื่อผู้ใช้หรืออีเมล"
        );
      }

      if (!accountPassword) {
        throw new FinoraError(
          "LOGIN_PASSWORD_REQUIRED",
          "กรุณากรอกรหัสผ่าน"
        );
      }

      const remember = rememberMe === true;

      const result = await callApi(
        "login",
        {
          identifier: accountIdentifier,
          password: accountPassword,
          rememberMe: remember
        },
        {
          loading: true,
          loadingMessage:
            "กำลังเข้าสู่ระบบ FINORA",
          loadingDetail:
            "กำลังตรวจสอบข้อมูลบัญชี"
        }
      );

      if (
        !result ||
        !result.sessionToken
      ) {
        throw new FinoraError(
          "SESSION_TOKEN_MISSING",
          "เข้าสู่ระบบไม่สำเร็จ เนื่องจากไม่ได้รับ Session Token"
        );
      }

      session.set(
        result.sessionToken,
        remember,
        result.expiresAt
      );

      APP_STATE.user = result.user || null;

      /*
       * Code.gs may return the base USER role in login response.
       * Ask the backend for the effective role after storing the
       * valid session. The backend remains the authority for access.
       */
      try {
        const currentUser = await callAuthenticatedApi(
          "getCurrentUser",
          {},
          {
            loading: false,
            timeout: 30000
          }
        );

        if (currentUser) {
          APP_STATE.user = currentUser;
        }
      } catch (error) {
        /*
         * Do not invent a user or role.
         * Retain only the actual user object returned by login.
         * Authorization is still checked by Code.gs on every action.
         */
        console.warn(
          "[FINORA] Could not refresh the current user after login:",
          error.code || error.message
        );
      }

      dispatchEvent(
        "finora:login-complete",
        {
          user: APP_STATE.user,
          rememberMe: remember
        }
      );

      return {
        user: APP_STATE.user,
        expiresAt: result.expiresAt,
        rememberMe: remember
      };
    },

    async logout() {
      let result = null;

      try {
        if (session.hasSession()) {
          result = await callAuthenticatedApi(
            "logout",
            {},
            {
              loading: true,
              loadingMessage:
                "กำลังออกจากระบบ"
            }
          );
        }
      } finally {
        session.clear();
      }

      dispatchEvent(
        "finora:logout-complete",
        result
      );

      return result;
    },

    async getCurrentUser(options) {
      const result = await callAuthenticatedApi(
        "getCurrentUser",
        {},
        Object.assign(
          {
            loading: false
          },
          options || {}
        )
      );

      APP_STATE.user = result || null;
      APP_STATE.isAuthenticated = !!result;

      dispatchEvent(
        "finora:user-loaded",
        result
      );

      return result;
    },

    async requestPasswordReset(email) {
      const normalizedEmail = assertValidEmail(email);

      return callApi(
        "requestPasswordReset",
        {
          email: normalizedEmail
        },
        {
          loading: true,
          loadingMessage:
            "กำลังส่งลิงก์รีเซ็ตรหัสผ่าน",
          loadingDetail:
            normalizedEmail
        }
      );
    },

    getPendingPasswordResetToken() {
      return APP_STATE.pendingResetToken || "";
    },

    async resetPassword(token, newPassword) {
      const resetToken = normalizeString(
        token ||
        APP_STATE.pendingResetToken
      );

      if (!resetToken) {
        throw new FinoraError(
          "RESET_TOKEN_REQUIRED",
          "ไม่พบลิงก์รีเซ็ตรหัสผ่าน กรุณาเปิดลิงก์จากอีเมลอีกครั้ง"
        );
      }

      const password = assertValidPassword(
        newPassword
      );

      const result = await callApi(
        "resetPassword",
        {
          token: resetToken,
          newPassword: password
        },
        {
          loading: true,
          loadingMessage:
            "กำลังเปลี่ยนรหัสผ่าน"
        }
      );

      APP_STATE.pendingResetToken = "";

      dispatchEvent(
        "finora:password-reset-complete",
        result
      );

      return result;
    },

    async changePassword(
      currentPassword,
      newPassword
    ) {
      const current = String(
        currentPassword || ""
      );

      if (!current) {
        throw new FinoraError(
          "CURRENT_PASSWORD_REQUIRED",
          "กรุณากรอกรหัสผ่านปัจจุบัน"
        );
      }

      const next = assertValidPassword(
        newPassword
      );

      return callAuthenticatedApi(
        "changePassword",
        {
          currentPassword: current,
          newPassword: next
        },
        {
          loading: true,
          loadingMessage:
            "กำลังเปลี่ยนรหัสผ่าน"
        }
      );
    },

    async updateProfile(data) {
      if (!isPlainObject(data)) {
        throw new FinoraError(
          "INVALID_PROFILE_DATA",
          "ข้อมูลโปรไฟล์ไม่ถูกต้อง"
        );
      }

      const payload = Object.assign(
        {},
        data
      );

      if (payload.phone !== undefined) {
        payload.phone = assertValidPhone(
          payload.phone
        );
      }

      if (payload.title !== undefined) {
        if (!VALID_TITLES.includes(payload.title)) {
          throw new FinoraError(
            "INVALID_TITLE",
            "กรุณาเลือกคำนำหน้าให้ถูกต้อง"
          );
        }
      }

      if (payload.fullName !== undefined) {
        payload.fullName = normalizeString(
          payload.fullName
        );

        if (
          payload.fullName.length < 2 ||
          payload.fullName.length > 150
        ) {
          throw new FinoraError(
            "INVALID_FULL_NAME",
            "ชื่อ-นามสกุลไม่ถูกต้อง"
          );
        }
      }

      const result = await callAuthenticatedApi(
        "updateProfile",
        payload,
        {
          loading: true,
          loadingMessage:
            "กำลังบันทึกข้อมูลโปรไฟล์"
        }
      );

      APP_STATE.user = result || APP_STATE.user;

      dispatchEvent(
        "finora:profile-updated",
        result
      );

      return result;
    },

    hasSession() {
      return session.hasSession();
    },

    getSessionToken() {
      return session.getToken();
    },

    getUser() {
      return APP_STATE.user;
    },

    getState() {
      return {
        isAuthenticated: APP_STATE.isAuthenticated,
        user: APP_STATE.user,
        sessionExpiry: APP_STATE.sessionExpiry,
        rememberMe: APP_STATE.rememberMe
      };
    }
  };

  /* ================================================================
   * 8. LINE LOGIN
   * ================================================================ */

  function getPendingLineSignupCode() {
    if (APP_STATE.pendingLineSignupCode) {
      return APP_STATE.pendingLineSignupCode;
    }

    const storedCode = safeStorageGet(
      "sessionStorage",
      CONFIG.PENDING_LINE_SIGNUP_KEY
    );

    const expiry = Number(
      safeStorageGet(
        "sessionStorage",
        CONFIG.PENDING_LINE_SIGNUP_EXPIRY_KEY
      ) || 0
    );

    if (
      !storedCode ||
      !expiry ||
      expiry <= Date.now()
    ) {
      clearPendingLineSignupCode();
      return "";
    }

    APP_STATE.pendingLineSignupCode = storedCode;

    return storedCode;
  }

  function setPendingLineSignupCode(code) {
    const value = normalizeString(code);

    if (!value) {
      clearPendingLineSignupCode();
      return;
    }

    APP_STATE.pendingLineSignupCode = value;

    safeStorageSet(
      "sessionStorage",
      CONFIG.PENDING_LINE_SIGNUP_KEY,
      value
    );

    safeStorageSet(
      "sessionStorage",
      CONFIG.PENDING_LINE_SIGNUP_EXPIRY_KEY,
      String(Date.now() + 120000)
    );
  }

  function clearPendingLineSignupCode() {
    APP_STATE.pendingLineSignupCode = "";

    safeStorageRemove(
      "sessionStorage",
      CONFIG.PENDING_LINE_SIGNUP_KEY
    );

    safeStorageRemove(
      "sessionStorage",
      CONFIG.PENDING_LINE_SIGNUP_EXPIRY_KEY
    );
  }

  const line = {
    async start(mode, options) {
      const settings = Object.assign(
        {
          redirect: true,
          rememberMe: false
        },
        options || {}
      );

      const lineMode = mode || "login";

      let result;

      if (lineMode === "link") {
        result = await callAuthenticatedApi(
          "startLineLogin",
          {
            mode: "link"
          },
          {
            loading: true,
            loadingMessage:
              "กำลังเตรียมเชื่อมต่อ LINE"
          }
        );
      } else {
        result = await callApi(
          "startLineLogin",
          {
            mode: "login"
          },
          {
            loading: true,
            loadingMessage:
              "กำลังเชื่อมต่อ LINE"
          }
        );
      }

      if (
        !result ||
        !result.authorizationUrl
      ) {
        throw new FinoraError(
          "LINE_AUTH_URL_MISSING",
          "ระบบไม่ได้รับ URL สำหรับเข้าสู่ระบบด้วย LINE"
        );
      }

      if (settings.redirect) {
        window.location.assign(
          result.authorizationUrl
        );
      }

      return result;
    },

    async exchangeCode(lineCode, rememberMe) {
      const code = normalizeString(lineCode);

      if (!code) {
        throw new FinoraError(
          "LINE_CODE_REQUIRED",
          "ไม่พบรหัสเข้าสู่ระบบจาก LINE"
        );
      }

      const result = await callApi(
        "exchangeLineCode",
        {
          lineCode: code,
          rememberMe: rememberMe === true
        },
        {
          loading: true,
          loadingMessage:
            "กำลังเข้าสู่ระบบด้วย LINE"
        }
      );

      if (!result || !result.sessionToken) {
        throw new FinoraError(
          "LINE_SESSION_MISSING",
          "ไม่ได้รับเซสชันจากการเข้าสู่ระบบด้วย LINE"
        );
      }

      session.set(
        result.sessionToken,
        rememberMe === true,
        result.expiresAt
      );

      APP_STATE.user = result.user || null;

      dispatchEvent(
        "finora:line-login-complete",
        {
          user: APP_STATE.user,
          expiresAt: result.expiresAt
        }
      );

      return result;
    },

    async unlink(password) {
      if (!normalizeString(password)) {
        throw new FinoraError(
          "PASSWORD_REQUIRED",
          "กรุณากรอกรหัสผ่านเพื่อยกเลิกการเชื่อมต่อ LINE"
        );
      }

      const result = await callAuthenticatedApi(
        "unlinkLineAccount",
        {
          password: String(password)
        },
        {
          loading: true,
          loadingMessage:
            "กำลังยกเลิกการเชื่อมต่อ LINE"
        }
      );

      dispatchEvent(
        "finora:line-unlinked",
        result
      );

      return result;
    },

    async handleRedirect(options) {
      const settings = Object.assign(
        {
          rememberMe: false
        },
        options || {}
      );

      const url = new URL(window.location.href);
      const params = url.searchParams;

      const lineCode = params.get("lineCode");
      const lineSignupCode = params.get(
        "lineSignupCode"
      );

      const linked = params.get("lineLinked");

      if (
        !lineCode &&
        !lineSignupCode &&
        linked !== "1"
      ) {
        return null;
      }

      /*
       * Remove temporary OAuth codes from the visible URL.
       * The short-lived sign-up code is held only in memory
       * and sessionStorage until registration is completed.
       */
      params.delete("lineCode");
      params.delete("lineSignupCode");
      params.delete("lineLinked");

      window.history.replaceState(
        {},
        document.title,
        url.pathname +
        (params.toString()
          ? "?" + params.toString()
          : "") +
        url.hash
      );

      if (lineCode) {
        return this.exchangeCode(
          lineCode,
          settings.rememberMe
        );
      }

      if (lineSignupCode) {
        setPendingLineSignupCode(
          lineSignupCode
        );

        const result = {
          mode: "signup",
          lineSignupCode: lineSignupCode
        };

        dispatchEvent(
          "finora:line-signup-code-received",
          result
        );

        return result;
      }

      if (linked === "1") {
        const result = {
          mode: "linked",
          success: true
        };

        dispatchEvent(
          "finora:line-account-linked",
          result
        );

        return result;
      }

      return null;
    },

    getPendingSignupCode() {
      return getPendingLineSignupCode();
    }
  };

  /* ================================================================
   * 9. PUBLIC CONFIGURATION AND PUBLIC ANNOUNCEMENTS
   * ================================================================ */

  const publicApi = {
    async ping() {
      return callApi(
        "ping",
        {},
        {
          loading: false
        }
      );
    },

    async getConfig() {
      const result = await callApi(
        "getPublicConfig",
        {},
        {
          loading: false
        }
      );

      APP_STATE.publicConfig = result || null;

      dispatchEvent(
        "finora:public-config-loaded",
        result
      );

      return result;
    },

    async getAnnouncements(placement) {
      const target = String(
        placement || "LOGIN"
      ).toUpperCase();

      if (
        !ANNOUNCEMENT_PLACEMENTS.includes(target)
      ) {
        throw new FinoraError(
          "INVALID_ANNOUNCEMENT_PLACEMENT",
          "ตำแหน่งแสดงประกาศไม่ถูกต้อง"
        );
      }

      return callApi(
        "getPublicAnnouncements",
        {
          placement: target
        },
        {
          loading: false
        }
      );
    },

    async getLoanProducts() {
      return callApi(
        "getPublicLoanProducts",
        {},
        {
          loading: false
        }
      );
    }
  };

  /* ================================================================
   * 10. BORROWER DASHBOARD
   * ================================================================ */

  const dashboard = {
    async getData() {
      const result = await callAuthenticatedApi(
        "getDashboardData",
        {},
        {
          loading: true,
          loadingMessage:
            "กำลังโหลดข้อมูลระบบ"
        }
      );

      dispatchEvent(
        "finora:dashboard-loaded",
        result
      );

      return result;
    }
  };

  /* ================================================================
   * 11. LOAN APPLICATIONS AND ACCOUNTS
   * ================================================================ */

  const loans = {
    async getMyApplications() {
      return callAuthenticatedApi(
        "getMyLoanApplications",
        {},
        {
          loading: true,
          loadingMessage:
            "กำลังโหลดคำขอสินเชื่อ"
        }
      );
    },

    async submitApplication(data) {
      if (!isPlainObject(data)) {
        throw new FinoraError(
          "INVALID_APPLICATION_DATA",
          "ข้อมูลคำขอสินเชื่อไม่ถูกต้อง"
        );
      }

      const payload = Object.assign(
        {},
        data
      );

      payload.productId = normalizeString(
        payload.productId
      );

      if (!payload.productId) {
        throw new FinoraError(
          "PRODUCT_REQUIRED",
          "กรุณาเลือกผลิตภัณฑ์สินเชื่อ"
        );
      }

      payload.amountRequested = Number(
        payload.amountRequested
      );

      payload.termMonths = Number(
        payload.termMonths
      );

      payload.monthlyIncome = Number(
        payload.monthlyIncome
      );

      payload.monthlyExpenses = Number(
        payload.monthlyExpenses
      );

      if (
        !Number.isFinite(payload.amountRequested) ||
        payload.amountRequested <= 0
      ) {
        throw new FinoraError(
          "INVALID_LOAN_AMOUNT",
          "จำนวนเงินที่ขอสินเชื่อไม่ถูกต้อง"
        );
      }

      if (
        !Number.isInteger(payload.termMonths) ||
        payload.termMonths <= 0
      ) {
        throw new FinoraError(
          "INVALID_LOAN_TERM",
          "ระยะเวลาชำระสินเชื่อไม่ถูกต้อง"
        );
      }

      if (
        !Number.isFinite(payload.monthlyIncome) ||
        payload.monthlyIncome < 0
      ) {
        throw new FinoraError(
          "INVALID_MONTHLY_INCOME",
          "รายได้ต่อเดือนไม่ถูกต้อง"
        );
      }

      if (
        !Number.isFinite(payload.monthlyExpenses) ||
        payload.monthlyExpenses < 0
      ) {
        throw new FinoraError(
          "INVALID_MONTHLY_EXPENSES",
          "รายจ่ายต่อเดือนไม่ถูกต้อง"
        );
      }

      if (
        !normalizeString(payload.purpose)
      ) {
        throw new FinoraError(
          "LOAN_PURPOSE_REQUIRED",
          "กรุณาระบุวัตถุประสงค์การกู้"
        );
      }

      const result = await callAuthenticatedApi(
        "submitLoanApplication",
        payload,
        {
          loading: true,
          loadingMessage:
            "กำลังส่งคำขอสินเชื่อ",
          loadingDetail:
            "กำลังบันทึกข้อมูลคำขอกับระบบ FINORA"
        }
      );

      dispatchEvent(
        "finora:loan-application-submitted",
        result
      );

      return result;
    },

    async getMyAccounts() {
      return callAuthenticatedApi(
        "getMyLoanAccounts",
        {},
        {
          loading: true,
          loadingMessage:
            "กำลังโหลดบัญชีสินเชื่อ"
        }
      );
    },

    async getRepaymentSchedule(loanAccountId) {
      return callAuthenticatedApi(
        "getMyRepaymentSchedule",
        {
          loanAccountId:
            normalizeString(loanAccountId)
        },
        {
          loading: true,
          loadingMessage:
            "กำลังโหลดตารางชำระเงิน"
        }
      );
    },

    async getTransactions(page, pageSize) {
      return callAuthenticatedApi(
        "getMyTransactions",
        {
          page: Number(page || 1),
          pageSize: Number(pageSize || 20)
        },
        {
          loading: true,
          loadingMessage:
            "กำลังโหลดประวัติธุรกรรม"
        }
      );
    }
  };

  /* ================================================================
   * 12. NOTIFICATIONS
   * ================================================================ */

  const notifications = {
    async list(page, pageSize) {
      return callAuthenticatedApi(
        "getMyNotifications",
        {
          page: Number(page || 1),
          pageSize: Number(pageSize || 20)
        },
        {
          loading: true,
          loadingMessage:
            "กำลังโหลดการแจ้งเตือน"
        }
      );
    },

    async markRead(notificationId) {
      const id = normalizeString(
        notificationId
      );

      if (!id) {
        throw new FinoraError(
          "NOTIFICATION_ID_REQUIRED",
          "ไม่พบรหัสการแจ้งเตือน"
        );
      }

      return callAuthenticatedApi(
        "markNotificationRead",
        {
          notificationId: id
        },
        {
          loading: false
        }
      );
    }
  };

  /* ================================================================
   * 13. PROFILE AND SESSIONS
   * ================================================================ */

  const profile = {
    async update(data) {
      return auth.updateProfile(data);
    },

    async listSessions() {
      return callAuthenticatedApi(
        "getMySessions",
        {},
        {
          loading: true,
          loadingMessage:
            "กำลังโหลดอุปกรณ์ที่เข้าสู่ระบบ"
        }
      );
    },

    async revokeSession(sessionId) {
      const id = normalizeString(sessionId);

      if (!id) {
        throw new FinoraError(
          "SESSION_ID_REQUIRED",
          "ไม่พบเซสชันที่ต้องการยกเลิก"
        );
      }

      return callAuthenticatedApi(
        "revokeMySession",
        {
          sessionId: id
        },
        {
          loading: true,
          loadingMessage:
            "กำลังยกเลิกเซสชัน"
        }
      );
    }
  };

  /* ================================================================
   * 14. SUPPORT TICKETS
   * ================================================================ */

  const support = {
    async createTicket(data) {
      if (!isPlainObject(data)) {
        throw new FinoraError(
          "INVALID_SUPPORT_TICKET",
          "ข้อมูลคำร้องไม่ถูกต้อง"
        );
      }

      const subject = normalizeString(
        data.subject
      );

      const message = normalizeString(
        data.message
      );

      if (
        subject.length < 3 ||
        subject.length > 200
      ) {
        throw new FinoraError(
          "INVALID_SUPPORT_SUBJECT",
          "หัวข้อคำร้องต้องมี 3–200 ตัวอักษร"
        );
      }

      if (
        message.length < 5 ||
        message.length > 10000
      ) {
        throw new FinoraError(
          "INVALID_SUPPORT_MESSAGE",
          "รายละเอียดคำร้องต้องมี 5–10,000 ตัวอักษร"
        );
      }

      return callAuthenticatedApi(
        "createSupportTicket",
        {
          subject: subject,
          category: normalizeString(
            data.category || "GENERAL"
          ),
          message: message
        },
        {
          loading: true,
          loadingMessage:
            "กำลังส่งคำร้องถึง FINORA"
        }
      );
    },

    async listMyTickets() {
      return callAuthenticatedApi(
        "getMySupportTickets",
        {},
        {
          loading: true,
          loadingMessage:
            "กำลังโหลดคำร้องของคุณ"
        }
      );
    }
  };

  /* ================================================================
   * 15. IMAGE UPLOAD THROUGH Code.gs / ImgBB
   * ================================================================ */

  function readFileAsDataUrl(file) {
    return new Promise(
      function (resolve, reject) {
        if (!(file instanceof Blob)) {
          reject(
            new FinoraError(
              "INVALID_FILE",
              "ไฟล์ที่เลือกไม่ถูกต้อง"
            )
          );

          return;
        }

        const reader = new FileReader();

        reader.onload = function () {
          resolve(String(reader.result || ""));
        };

        reader.onerror = function () {
          reject(
            new FinoraError(
              "FILE_READ_FAILED",
              "ไม่สามารถอ่านไฟล์ภาพได้"
            )
          );
        };

        reader.readAsDataURL(file);
      }
    );
  }

  const images = {
    async upload(file, purpose) {
      if (!(file instanceof Blob)) {
        throw new FinoraError(
          "IMAGE_REQUIRED",
          "กรุณาเลือกไฟล์ภาพก่อนอัปโหลด"
        );
      }

      if (!CONFIG.SUPPORTED_IMAGE_TYPES.includes(file.type)) {
        throw new FinoraError(
          "IMAGE_TYPE_NOT_ALLOWED",
          "รองรับเฉพาะไฟล์ JPG, PNG, WEBP และ GIF"
        );
      }

      if (
        file.size <= 0 ||
        file.size > CONFIG.MAX_IMAGE_SIZE_BYTES
      ) {
        throw new FinoraError(
          "IMAGE_TOO_LARGE",
          "ไฟล์ภาพว่างเปล่าหรือมีขนาดเกิน 5 MB"
        );
      }

      const dataUrl = await readFileAsDataUrl(file);

      const commaIndex = dataUrl.indexOf(",");

      if (commaIndex < 0) {
        throw new FinoraError(
          "INVALID_IMAGE_DATA",
          "ไม่สามารถแปลงไฟล์ภาพได้"
        );
      }

      const base64Data = dataUrl.substring(
        commaIndex + 1
      );

      return callAuthenticatedApi(
        "uploadImage",
        {
          purpose: String(
            purpose || "PROFILE"
          ).toUpperCase(),
          base64Data: base64Data,
          fileName: file.name || "finora-image.jpg"
        },
        {
          loading: true,
          loadingMessage:
            "กำลังอัปโหลดรูปภาพ",
          loadingDetail:
            "กำลังส่งภาพไปยังระบบจัดเก็บรูปภาพ"
        }
      );
    }
  };

  /* ================================================================
   * 16. ADMIN API
   *
   * All permissions are enforced by Code.gs.
   * Hiding menu items on the browser is not authorization.
   * ================================================================ */

  const admin = {
    async overview() {
      return callAuthenticatedApi(
        "adminOverview",
        {},
        {
          loading: true,
          loadingMessage:
            "กำลังโหลดภาพรวมระบบหลังบ้าน"
        }
      );
    },

    async listUsers(search, page, pageSize) {
      return callAuthenticatedApi(
        "adminListUsers",
        {
          search: normalizeString(search),
          page: Number(page || 1),
          pageSize: Number(pageSize || 20)
        },
        {
          loading: true,
          loadingMessage:
            "กำลังโหลดข้อมูลสมาชิก"
        }
      );
    },

    async updateUserStatus(userId, status) {
      return callAuthenticatedApi(
        "adminUpdateUserStatus",
        {
          userId: normalizeString(userId),
          status: normalizeString(status)
        },
        {
          loading: true,
          loadingMessage:
            "กำลังปรับปรุงสถานะสมาชิก"
        }
      );
    },

    async listLoanProducts() {
      return callAuthenticatedApi(
        "adminListLoanProducts",
        {},
        {
          loading: true,
          loadingMessage:
            "กำลังโหลดผลิตภัณฑ์สินเชื่อ"
        }
      );
    },

    async saveLoanProduct(data) {
      if (!isPlainObject(data)) {
        throw new FinoraError(
          "INVALID_LOAN_PRODUCT",
          "ข้อมูลผลิตภัณฑ์สินเชื่อไม่ถูกต้อง"
        );
      }

      return callAuthenticatedApi(
        "adminSaveLoanProduct",
        data,
        {
          loading: true,
          loadingMessage:
            "กำลังบันทึกผลิตภัณฑ์สินเชื่อ"
        }
      );
    },

    async deleteLoanProduct(productId) {
      return callAuthenticatedApi(
        "adminDeleteLoanProduct",
        {
          productId: normalizeString(productId)
        },
        {
          loading: true,
          loadingMessage:
            "กำลังปิดการใช้งานผลิตภัณฑ์"
        }
      );
    },

    async listLoanApplications(page, pageSize) {
      return callAuthenticatedApi(
        "adminListLoanApplications",
        {
          page: Number(page || 1),
          pageSize: Number(pageSize || 20)
        },
        {
          loading: true,
          loadingMessage:
            "กำลังโหลดคำขอสินเชื่อ"
        }
      );
    },

    async updateLoanApplication(data) {
      if (!isPlainObject(data)) {
        throw new FinoraError(
          "INVALID_APPLICATION_UPDATE",
          "ข้อมูลแก้ไขคำขอสินเชื่อไม่ถูกต้อง"
        );
      }

      return callAuthenticatedApi(
        "adminUpdateApplication",
        data,
        {
          loading: true,
          loadingMessage:
            "กำลังบันทึกผลการพิจารณา"
        }
      );
    },

    async createLoanAccount(applicationId) {
      return callAuthenticatedApi(
        "adminCreateLoanAccount",
        {
          applicationId: normalizeString(applicationId)
        },
        {
          loading: true,
          loadingMessage:
            "กำลังสร้างบัญชีสินเชื่อ"
        }
      );
    },

    async confirmDisbursement(
      loanAccountId,
      reference
    ) {
      return callAuthenticatedApi(
        "adminConfirmDisbursement",
        {
          loanAccountId: normalizeString(loanAccountId),
          reference: normalizeString(reference)
        },
        {
          loading: true,
          loadingMessage:
            "กำลังบันทึกการยืนยันจ่ายเงิน"
        }
      );
    },

    async listTransactions(type, page, pageSize) {
      return callAuthenticatedApi(
        "adminListTransactions",
        {
          type: normalizeString(type),
          page: Number(page || 1),
          pageSize: Number(pageSize || 20)
        },
        {
          loading: true,
          loadingMessage:
            "กำลังโหลดรายการธุรกรรม"
        }
      );
    },

    async recordRepayment(data) {
      if (!isPlainObject(data)) {
        throw new FinoraError(
          "INVALID_REPAYMENT",
          "ข้อมูลรับชำระไม่ถูกต้อง"
        );
      }

      return callAuthenticatedApi(
        "adminRecordRepayment",
        data,
        {
          loading: true,
          loadingMessage:
            "กำลังบันทึกการรับชำระ"
        }
      );
    },

    async listAnnouncements(page, pageSize) {
      return callAuthenticatedApi(
        "adminListAnnouncements",
        {
          page: Number(page || 1),
          pageSize: Number(pageSize || 20)
        },
        {
          loading: true,
          loadingMessage:
            "กำลังโหลดประกาศ"
        }
      );
    },

    async saveAnnouncement(data) {
      if (!isPlainObject(data)) {
        throw new FinoraError(
          "INVALID_ANNOUNCEMENT",
          "ข้อมูลประกาศไม่ถูกต้อง"
        );
      }

      const placements = Array.isArray(data.placements)
        ? data.placements
        : [];

      const invalidPlacement = placements.some(
        function (placement) {
          return !ANNOUNCEMENT_PLACEMENTS.includes(
            String(placement).toUpperCase()
          );
        }
      );

      if (invalidPlacement) {
        throw new FinoraError(
          "INVALID_ANNOUNCEMENT_PLACEMENT",
          "มีตำแหน่งแสดงประกาศที่ไม่ถูกต้อง"
        );
      }

      return callAuthenticatedApi(
        "adminSaveAnnouncement",
        Object.assign(
          {},
          data,
          {
            placements: placements
          }
        ),
        {
          loading: true,
          loadingMessage:
            "กำลังบันทึกประกาศ"
        }
      );
    },

    async deleteAnnouncement(announcementId) {
      return callAuthenticatedApi(
        "adminDeleteAnnouncement",
        {
          announcementId:
            normalizeString(announcementId)
        },
        {
          loading: true,
          loadingMessage:
            "กำลังปิดประกาศ"
        }
      );
    },

    async listSupportTickets(page, pageSize) {
      return callAuthenticatedApi(
        "adminListSupportTickets",
        {
          page: Number(page || 1),
          pageSize: Number(pageSize || 20)
        },
        {
          loading: true,
          loadingMessage:
            "กำลังโหลดคำร้องของสมาชิก"
        }
      );
    },

    async updateSupportTicket(data) {
      return callAuthenticatedApi(
        "adminUpdateSupportTicket",
        data,
        {
          loading: true,
          loadingMessage:
            "กำลังบันทึกการแก้ไขคำร้อง"
        }
      );
    },

    async listAuditLogs(page, pageSize) {
      return callAuthenticatedApi(
        "adminListAuditLogs",
        {
          page: Number(page || 1),
          pageSize: Number(pageSize || 20)
        },
        {
          loading: true,
          loadingMessage:
            "กำลังโหลดบันทึกตรวจสอบย้อนหลัง"
        }
      );
    },

    async listAdmins() {
      return callAuthenticatedApi(
        "adminListAdmins",
        {},
        {
          loading: true,
          loadingMessage:
            "กำลังโหลดผู้ดูแลระบบ"
        }
      );
    },

    async setAdminStatus(email, role, status) {
      return callAuthenticatedApi(
        "adminSetAdminStatus",
        {
          email: assertValidEmail(email),
          role: normalizeString(role),
          status: normalizeString(status)
        },
        {
          loading: true,
          loadingMessage:
            "กำลังปรับปรุงสิทธิ์ผู้ดูแล"
        }
      );
    },

    async getSettings() {
      return callAuthenticatedApi(
        "adminGetSettings",
        {},
        {
          loading: true,
          loadingMessage:
            "กำลังโหลดการตั้งค่าระบบ"
        }
      );
    },

    async updateSetting(settingKey, settingValue) {
      return callAuthenticatedApi(
        "adminUpdateSettings",
        {
          settingKey: normalizeString(settingKey),
          settingValue: String(
            settingValue === undefined
              ? ""
              : settingValue
          )
        },
        {
          loading: true,
          loadingMessage:
            "กำลังบันทึกการตั้งค่าระบบ"
        }
      );
    },

    async sendNotification(data) {
      if (!isPlainObject(data)) {
        throw new FinoraError(
          "INVALID_NOTIFICATION",
          "ข้อมูลแจ้งเตือนไม่ถูกต้อง"
        );
      }

      return callAuthenticatedApi(
        "adminSendNotification",
        data,
        {
          loading: true,
          loadingMessage:
            "กำลังส่งการแจ้งเตือน"
        }
      );
    }
  };

  /* ================================================================
   * 17. CONSENT DOCUMENT HELPERS
   *
   * The actual policy text must be provided by index.html.
   * This helper enforces a scroll-to-bottom step before agreeing.
   * ================================================================ */

  const consent = {
    async showTerms(content) {
      return ui.showDocumentModal({
        title:
          "ข้อกำหนดและเงื่อนไขการใช้บริการ FINORA",
        content: content,
        agreeText: "ยินยอม",
        cancelText: "ยกเลิก",
        warningText:
          "กรุณาเลื่อนลงด้านล่างสุดและกดยินยอม",
        requireScrollToBottom: true
      });
    },

    async showPrivacyNotice(content) {
      return ui.showDocumentModal({
        title:
          "ประกาศความเป็นส่วนตัว (Privacy Notice)",
        content: content,
        agreeText: "ยินยอม",
        cancelText: "ยกเลิก",
        warningText:
          "กรุณาเลื่อนลงด้านล่างสุดและกดยินยอม",
        requireScrollToBottom: true
      });
    }
  };

  /* ================================================================
   * 18. PASSWORD RESET AND LINE CALLBACK ROUTING
   * ================================================================ */

  function readPasswordResetTokenFromUrl() {
    const url = new URL(window.location.href);

    const view = url.searchParams.get("view");
    const token = url.searchParams.get("token");

    if (
      view !== "reset-password" ||
      !token
    ) {
      return "";
    }

    APP_STATE.pendingResetToken = token;

    /*
     * Remove the sensitive token from the visible URL and
     * browser history once captured in memory.
     */
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

    dispatchEvent(
      "finora:password-reset-link",
      {
        available: true
      }
    );

    return token;
  }

  async function handleOAuthReturnOnStartup() {
    const url = new URL(window.location.href);

    const hasLineQuery =
      url.searchParams.has("lineCode") ||
      url.searchParams.has("lineSignupCode") ||
      url.searchParams.get("lineLinked") === "1";

    if (!hasLineQuery) {
      return null;
    }

    try {
      const result = await line.handleRedirect();

      dispatchEvent(
        "finora:oauth-return",
        result
      );

      return result;

    } catch (error) {
      const normalized = normalizeError(error);

      ui.toast(
        normalized.message,
        "error"
      );

      dispatchEvent(
        "finora:oauth-return-error",
        {
          code: normalized.code,
          message: normalized.message
        }
      );

      throw normalized;
    }
  }

  /* ================================================================
   * 19. APPLICATION INITIALIZATION
   * ================================================================ */

  async function initialize() {
    if (APP_STATE.initialized) {
      return;
    }

    APP_STATE.initialized = true;

    ensureUIHost();

    readPasswordResetTokenFromUrl();

    APP_STATE.rememberMe =
      session.isRemembered();

    APP_STATE.isAuthenticated =
      session.hasSession();

    dispatchEvent(
      "finora:client-ready",
      {
        configured: !!normalizeString(CONFIG.API_URL),
        authenticated: APP_STATE.isAuthenticated,
        user: APP_STATE.user
      }
    );

    /*
     * The application shell in index.html should listen for:
     * - finora:client-ready
     * - finora:oauth-return
     * - finora:password-reset-link
     * - finora:login-complete
     * - finora:registration-complete
     * - finora:email-verification-requested
     */
    try {
      await handleOAuthReturnOnStartup();
    } catch (error) {
      /*
       * The OAuth handler already notified the interface.
       * Do not create a fake session.
       */
    }
  }

  /* ================================================================
   * 20. PUBLIC FINORA API OBJECT
   * ================================================================ */

  const FINORA = {
    version: "1.0.0",

    config: {
      get() {
        return {
          appName: CONFIG.APP_NAME,
          apiUrlConfigured:
            !!normalizeString(CONFIG.API_URL),
          maxImageSizeBytes:
            CONFIG.MAX_IMAGE_SIZE_BYTES,
          passwordMinLength:
            CONFIG.PASSWORD_MIN_LENGTH,
          passwordMaxLength:
            CONFIG.PASSWORD_MAX_LENGTH
        };
      }
    },

    state: APP_STATE,

    errors: {
      FinoraError: FinoraError,
      normalize: normalizeError
    },

    utils: {
      normalizeString: normalizeString,
      normalizeEmail: normalizeEmail,
      escapeHtml: escapeHtml,
      formatMoney: formatMoney,
      formatNumber: formatNumber,
      formatDate: formatDate,
      formatDateTime: formatDateTime,
      isDateValid: isDateValid,
      calculateAge: calculateAge,
      assertValidEmail: assertValidEmail,
      assertValidPhone: assertValidPhone,
      assertValidCitizenId: assertValidCitizenId,
      assertValidPassword: assertValidPassword,
      validateRegistration: validateRegistration
    },

    ui: ui,

    api: {
      call: callApi,

      async getPublicConfig() {
        return publicApi.getConfig();
      },

      async ping() {
        return publicApi.ping();
      }
    },

    session: session,

    auth: auth,

    line: line,

    public: publicApi,

    dashboard: dashboard,

    loans: loans,

    notifications: notifications,

    profile: profile,

    support: support,

    images: images,

    admin: admin,

    consent: consent,

    async initialize() {
      return initialize();
    },

    async checkSession() {
      if (!session.hasSession()) {
        APP_STATE.isAuthenticated = false;
        APP_STATE.user = null;

        return {
          authenticated: false,
          user: null
        };
      }

      try {
        const user = await auth.getCurrentUser({
          loading: false
        });

        APP_STATE.isAuthenticated = true;
        APP_STATE.user = user;

        return {
          authenticated: true,
          user: user
        };

      } catch (error) {
        const normalized = normalizeError(error);

        if (
          AUTH_ERROR_CODES.includes(
            normalized.code
          )
        ) {
          session.clear();
        }

        throw normalized;
      }
    }
  };

  /*
   * Expose only the FINORA namespace.
   * HTML pages can use window.FINORA after this script loads.
   */
  window.FINORA = FINORA;

  /*
   * Initialize when the document is ready.
   */
  if (document.readyState === "loading") {
    document.addEventListener(
      "DOMContentLoaded",
      initialize,
      {
        once: true
      }
    );
  } else {
    initialize();
  }

})(window, document);
