/* =====================================================================
 * FINORA - Frontend API Client
 * File: index.js
 * Backend: Google Apps Script Web App + Google Sheets
 *
 * API Request:
 * POST /exec
 * Content-Type: text/plain;charset=UTF-8
 *
 * Body:
 * {
 *   "action": "publicConfig",
 *   "data": {}
 * }
 *
 * Success response:
 * {
 *   "ok": true,
 *   "data": {}
 * }
 *
 * Error response:
 * {
 *   "ok": false,
 *   "error": {
 *     "code": "ERROR_CODE",
 *     "message": "Error message"
 *   }
 * }
 *
 * IMPORTANT:
 * 1. Configure the deployed Google Apps Script Web App URL.
 * 2. Never put API keys or backend secrets in this file.
 * 3. Server-side authorization remains authoritative.
 * 4. This file never fabricates API responses or payment results.
 * ===================================================================== */

(function (global) {
  'use strict';

  /* ================================================================
   * 1. CONFIGURATION
   * ================================================================ */

  var initialConfig =
    global.FINORA_CONFIG &&
    typeof global.FINORA_CONFIG === 'object'
      ? global.FINORA_CONFIG
      : {};

  var config = {
    apiUrl: String(
      initialConfig.apiUrl ||
      initialConfig.API_URL ||
      ''
    ).trim(),

    requestTimeoutMs: Number(
      initialConfig.requestTimeoutMs || 30000
    ),

    sessionStorageKey: 'finora.session.v1',

    rememberedSessionStorageKey:
      'finora.remembered-session.v1',

    pendingRegistrationStorageKey:
      'finora.pending-registration.v1',

    maximumProfileImageBytes:
      5 * 1024 * 1024,

    maximumSlipImageBytes:
      4 * 1024 * 1024
  };


  /* ================================================================
   * 2. ACTIONS THAT REQUIRE AN AUTHENTICATED SESSION
   *
   * These actions are defined by dispatchAction_() in Code.gs.
   * The backend remains responsible for checking user permissions.
   * ================================================================ */

  var AUTH_REQUIRED_ACTIONS = [
    'me',
    'updateProfile',
    'requestAccountClosure',

    'getDashboard',
    'getLoanProducts',
    'submitLoanApplication',
    'getMyApplications',
    'getMyLoans',
    'getMyRepayments',

    'createRepaymentQR',
    'uploadImage',
    'verifyRepaymentSlip',

    'createSupportTicket',
    'getMySupportTickets',

    'linkGoogleAccount',

    'adminDashboard',
    'adminListUsers',
    'adminUpdateUserStatus',
    'adminListApplications',
    'adminReviewApplication',
    'adminUpsertLoanProduct',
    'adminRecordDisbursement',
    'adminListLoans',
    'adminListPaymentReviews',
    'adminResolvePaymentReview',
    'adminListSupportTickets',
    'adminUpdateSupportTicket',
    'adminUpsertAnnouncement',
    'adminListAnnouncements',
    'adminArchiveAnnouncement',
    'adminReports',
    'adminAuditLogs'
  ];


  var SESSION_ERROR_CODES = [
    'UNAUTHENTICATED',
    'SESSION_INVALID',
    'SESSION_EXPIRED',
    'ACCOUNT_UNAVAILABLE'
  ];


  /* ================================================================
   * 3. CUSTOM ERROR
   * ================================================================ */

  function FinoraError(message, code, details) {
    this.name = 'FinoraError';
    this.message = message || 'เกิดข้อผิดพลาด';
    this.code = code || 'CLIENT_ERROR';
    this.details = details || null;

    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, FinoraError);
    }
  }

  FinoraError.prototype = Object.create(Error.prototype);
  FinoraError.prototype.constructor = FinoraError;


  /* ================================================================
   * 4. CONFIGURATION HELPERS
   * ================================================================ */

  function configure(options) {
    options = options || {};

    if (
      options.apiUrl !== undefined ||
      options.API_URL !== undefined
    ) {
      config.apiUrl = String(
        options.apiUrl ||
        options.API_URL ||
        ''
      ).trim();
    }

    if (options.requestTimeoutMs !== undefined) {
      var timeout = Number(options.requestTimeoutMs);

      if (isFinite(timeout) && timeout >= 1000) {
        config.requestTimeoutMs = Math.floor(timeout);
      }
    }

    return getConfig();
  }


  function getConfig() {
    return {
      apiUrl: config.apiUrl,
      requestTimeoutMs: config.requestTimeoutMs
    };
  }


  function validateApiUrl() {
    if (!config.apiUrl) {
      throw new FinoraError(
        'ยังไม่ได้กำหนด URL ของ Google Apps Script Web App ใน FINORA_CONFIG.apiUrl',
        'API_URL_REQUIRED'
      );
    }

    var parsed;

    try {
      parsed = new URL(
        config.apiUrl,
        global.location && global.location.href
          ? global.location.href
          : undefined
      );
    } catch (error) {
      throw new FinoraError(
        'รูปแบบ API URL ไม่ถูกต้อง',
        'API_URL_INVALID',
        error
      );
    }

    if (parsed.protocol !== 'https:') {
      throw new FinoraError(
        'API URL ต้องใช้ HTTPS',
        'API_URL_INVALID'
      );
    }

    if (!/\/exec\/?$/.test(parsed.pathname)) {
      throw new FinoraError(
        'API URL ควรเป็น Web App URL ที่ลงท้ายด้วย /exec',
        'API_URL_INVALID'
      );
    }

    return parsed.href.replace(/\/$/, '');
  }


  /* ================================================================
   * 5. STORAGE HELPERS
   * ================================================================ */

  function getStorage(storageName) {
    try {
      return global[storageName] || null;
    } catch (error) {
      return null;
    }
  }


  function safeStorageGet(storage, key) {
    if (!storage) {
      return null;
    }

    try {
      return storage.getItem(key);
    } catch (error) {
      return null;
    }
  }


  function safeStorageSet(storage, key, value) {
    if (!storage) {
      return false;
    }

    try {
      storage.setItem(key, value);
      return true;
    } catch (error) {
      return false;
    }
  }


  function safeStorageRemove(storage, key) {
    if (!storage) {
      return;
    }

    try {
      storage.removeItem(key);
    } catch (error) {
      // Browser storage may be disabled.
    }
  }


  /* ================================================================
   * 6. SESSION MANAGEMENT
   *
   * Remember me = localStorage
   * Normal session = sessionStorage
   *
   * The backend session token is still validated by Code.gs.
   * ================================================================ */

  function readStoredSession() {
    var local = getStorage('localStorage');
    var session = getStorage('sessionStorage');

    var raw = safeStorageGet(
      local,
      config.rememberedSessionStorageKey
    );

    var remembered = Boolean(raw);

    if (!raw) {
      raw = safeStorageGet(
        session,
        config.sessionStorageKey
      );
    }

    if (!raw) {
      return null;
    }

    try {
      var saved = JSON.parse(raw);

      if (
        !saved ||
        typeof saved.sessionToken !== 'string' ||
        !saved.sessionToken
      ) {
        clearSession();
        return null;
      }

      if (
        saved.expiresAt &&
        new Date(saved.expiresAt).getTime() <= Date.now()
      ) {
        clearSession();
        return null;
      }

      saved.remember = Boolean(
        saved.remember || remembered
      );

      return saved;

    } catch (error) {
      clearSession();
      return null;
    }
  }


  function getSession() {
    var saved = readStoredSession();

    if (!saved) {
      return null;
    }

    return {
      sessionToken: saved.sessionToken,
      expiresAt: saved.expiresAt || null,
      remember: Boolean(saved.remember),
      user: saved.user || null
    };
  }


  function getSessionToken() {
    var current = getSession();

    return current
      ? current.sessionToken
      : '';
  }


  function saveSession(sessionResult, rememberOverride) {
    if (
      !sessionResult ||
      !sessionResult.sessionToken
    ) {
      return false;
    }

    var remember =
      rememberOverride === undefined
        ? Boolean(sessionResult.remember)
        : Boolean(rememberOverride);

    var saved = {
      sessionToken: String(
        sessionResult.sessionToken
      ),

      expiresAt:
        sessionResult.expiresAt || null,

      remember: remember,

      user: sessionResult.user || null,

      savedAt: new Date().toISOString()
    };

    var serialized = JSON.stringify(saved);

    var local = getStorage('localStorage');
    var session = getStorage('sessionStorage');

    safeStorageRemove(
      local,
      config.rememberedSessionStorageKey
    );

    safeStorageRemove(
      session,
      config.sessionStorageKey
    );

    var ok = remember
      ? safeStorageSet(
          local,
          config.rememberedSessionStorageKey,
          serialized
        )
      : safeStorageSet(
          session,
          config.sessionStorageKey,
          serialized
        );

    if (!ok) {
      throw new FinoraError(
        'เบราว์เซอร์ไม่อนุญาตให้บันทึกเซสชัน กรุณาตรวจสอบการตั้งค่าพื้นที่จัดเก็บข้อมูล',
        'SESSION_STORAGE_UNAVAILABLE'
      );
    }

    return true;
  }


  function updateSavedUser(user) {
    var saved = readStoredSession();

    if (!saved) {
      return false;
    }

    saved.user = user || null;
    saved.savedAt = new Date().toISOString();

    var storage = saved.remember
      ? getStorage('localStorage')
      : getStorage('sessionStorage');

    var key = saved.remember
      ? config.rememberedSessionStorageKey
      : config.sessionStorageKey;

    return safeStorageSet(
      storage,
      key,
      JSON.stringify(saved)
    );
  }


  function clearSession() {
    safeStorageRemove(
      getStorage('localStorage'),
      config.rememberedSessionStorageKey
    );

    safeStorageRemove(
      getStorage('sessionStorage'),
      config.sessionStorageKey
    );
  }


  /* ================================================================
   * 7. PENDING REGISTRATION STORAGE
   *
   * Stores pendingId and pollToken only in sessionStorage.
   * No password or national ID is stored here.
   * ================================================================ */

  function savePendingRegistration(value) {
    if (
      !value ||
      !value.pendingId ||
      !value.pollToken
    ) {
      throw new FinoraError(
        'ข้อมูลคำขอสมัครไม่ครบถ้วน ไม่สามารถบันทึกสถานะการยืนยันอีเมลได้',
        'PENDING_REGISTRATION_INVALID'
      );
    }

    var data = {
      pendingId: String(value.pendingId),
      pollToken: String(value.pollToken),
      email: String(value.email || ''),
      expiresAt: value.expiresAt || null
    };

    var storage = getStorage('sessionStorage');

    if (
      !safeStorageSet(
        storage,
        config.pendingRegistrationStorageKey,
        JSON.stringify(data)
      )
    ) {
      throw new FinoraError(
        'ไม่สามารถเก็บข้อมูลคำขอสมัครใน Session Storage ได้',
        'STORAGE_UNAVAILABLE'
      );
    }

    return data;
  }


  function getPendingRegistration() {
    var raw = safeStorageGet(
      getStorage('sessionStorage'),
      config.pendingRegistrationStorageKey
    );

    if (!raw) {
      return null;
    }

    try {
      var data = JSON.parse(raw);

      if (
        !data ||
        !data.pendingId ||
        !data.pollToken
      ) {
        return null;
      }

      if (
        data.expiresAt &&
        new Date(data.expiresAt).getTime() <= Date.now()
      ) {
        clearPendingRegistration();
        return null;
      }

      return data;

    } catch (error) {
      clearPendingRegistration();
      return null;
    }
  }


  function clearPendingRegistration() {
    safeStorageRemove(
      getStorage('sessionStorage'),
      config.pendingRegistrationStorageKey
    );
  }


  /* ================================================================
   * 8. REQUEST PREPARATION
   *
   * Session-required actions receive the current sessionToken.
   * The frontend never sends a role to grant itself privileges.
   * ================================================================ */

  function makeRequestData(action, data) {
    var payload =
      data &&
      typeof data === 'object' &&
      !Array.isArray(data)
        ? Object.assign({}, data)
        : {};

    if (
      AUTH_REQUIRED_ACTIONS.indexOf(action) !== -1
    ) {
      var token = getSessionToken();

      if (!token) {
        throw new FinoraError(
          'กรุณาเข้าสู่ระบบก่อนดำเนินการนี้',
          'UNAUTHENTICATED'
        );
      }

      payload.sessionToken = token;

    } else if (action === 'logout') {
      var currentToken = getSessionToken();

      if (currentToken) {
        payload.sessionToken = currentToken;
      }
    }

    return payload;
  }


  /* ================================================================
   * 9. RESPONSE PARSING
   * ================================================================ */

  function parseResponseBody(response) {
    return response.text().then(function (text) {
      if (!text) {
        throw new FinoraError(
          'เซิร์ฟเวอร์ไม่ส่งข้อมูลตอบกลับ กรุณาตรวจสอบ URL และสถานะ Deploy ของ Code.gs',
          'EMPTY_RESPONSE'
        );
      }

      try {
        return JSON.parse(text);

      } catch (error) {
        throw new FinoraError(
          'คำตอบจากเซิร์ฟเวอร์ไม่ใช่ JSON อาจใช้ URL ผิด หรือ Code.gs ยังทำงานไม่สำเร็จ',
          'INVALID_SERVER_RESPONSE',
          {
            status: response.status,
            responseText: text.slice(0, 300)
          }
        );
      }
    });
  }


  /* ================================================================
   * 10. MAIN API CALL
   *
   * Uses the same transport format required by Code.gs:
   * { action: actionName, data: requestData }
   * ================================================================ */

  function call(action, data, options) {
    options = options || {};

    action = String(action || '').trim();

    if (!action) {
      return Promise.reject(
        new FinoraError(
          'กรุณาระบุ API action',
          'ACTION_REQUIRED'
        )
      );
    }

    var url;
    var requestData;

    try {
      url = validateApiUrl();

      requestData = makeRequestData(
        action,
        data
      );

    } catch (error) {
      return Promise.reject(error);
    }

    var controller =
      typeof AbortController !== 'undefined'
        ? new AbortController()
        : null;

    var timeoutId = null;

    var timeoutMs = Number(
      options.timeoutMs ||
      config.requestTimeoutMs
    );

    var fetchOptions = {
      method: 'POST',
      mode: 'cors',
      credentials: 'omit',
      cache: 'no-store',
      redirect: 'follow',

      headers: {
        'Content-Type':
          'text/plain;charset=UTF-8',

        'Accept': 'application/json'
      },

      body: JSON.stringify({
        action: action,
        data: requestData
      })
    };

    if (controller) {
      fetchOptions.signal = controller.signal;

      timeoutId = global.setTimeout(
        function () {
          controller.abort();
        },
        timeoutMs
      );
    }

    return global.fetch(
      url,
      fetchOptions
    )
      .then(function (response) {
        return parseResponseBody(
          response
        ).then(function (body) {

          if (!response.ok) {
            throw new FinoraError(
              'เซิร์ฟเวอร์ตอบกลับด้วย HTTP ' +
                response.status,
              'HTTP_ERROR',
              {
                status: response.status,
                body: body
              }
            );
          }

          if (
            !body ||
            body.ok !== true
          ) {
            var errorObject =
              body && body.error
                ? body.error
                : {};

            var code = String(
              errorObject.code ||
              'API_ERROR'
            );

            var message = String(
              errorObject.message ||
              'คำขอไม่สำเร็จ'
            );

            if (
              SESSION_ERROR_CODES.indexOf(
                code
              ) !== -1
            ) {
              clearSession();
            }

            throw new FinoraError(
              message,
              code,
              body
            );
          }

          return body.data;
        });
      })
      .catch(function (error) {
        if (error instanceof FinoraError) {
          throw error;
        }

        if (
          error &&
          error.name === 'AbortError'
        ) {
          throw new FinoraError(
            'คำขอใช้เวลานานเกินกำหนด กรุณาตรวจสอบอินเทอร์เน็ตและลองใหม่',
            'REQUEST_TIMEOUT'
          );
        }

        throw new FinoraError(
          'เชื่อมต่อ FINORA API ไม่สำเร็จ กรุณาตรวจสอบอินเทอร์เน็ต, URL ของ Web App, การ Deploy และสิทธิ์การเข้าถึง',
          'NETWORK_ERROR',
          error
        );
      })
      .finally(function () {
        if (timeoutId !== null) {
          global.clearTimeout(timeoutId);
        }
      });
  }


  /* ================================================================
   * 11. SESSION RESPONSE HELPERS
   * ================================================================ */

  function saveSessionIfReturned(
    result,
    remember
  ) {
    if (
      result &&
      result.sessionToken
    ) {
      saveSession(
        result,
        remember
      );
    }

    if (
      result &&
      result.user
    ) {
      updateSavedUser(
        result.user
      );
    }

    return result;
  }


  function callAndStoreSession(
    action,
    data
  ) {
    var remember = Boolean(
      data && data.remember
    );

    return call(
      action,
      data
    ).then(function (result) {
      return saveSessionIfReturned(
        result,
        remember
      );
    });
  }


  /* ================================================================
   * 12. HEALTH CHECK
   *
   * Code.gs handles health through doGet(e), not dispatchAction_().
   * ================================================================ */

  function health() {
    var base;

    try {
      base = validateApiUrl();

    } catch (error) {
      return Promise.reject(error);
    }

    var url = base + '?action=health';

    var controller =
      typeof AbortController !== 'undefined'
        ? new AbortController()
        : null;

    var timeoutId = null;

    var options = {
      method: 'GET',
      mode: 'cors',
      credentials: 'omit',
      cache: 'no-store',
      redirect: 'follow',

      headers: {
        'Accept': 'application/json'
      }
    };

    if (controller) {
      options.signal = controller.signal;

      timeoutId = global.setTimeout(
        function () {
          controller.abort();
        },
        config.requestTimeoutMs
      );
    }

    return global.fetch(
      url,
      options
    )
      .then(function (response) {
        return parseResponseBody(
          response
        ).then(function (body) {
          if (
            !response.ok ||
            !body ||
            body.ok !== true
          ) {
            throw new FinoraError(
              'ไม่สามารถตรวจสอบสถานะ API ได้',
              'HEALTH_CHECK_FAILED',
              body
            );
          }

          return body.data;
        });
      })
      .catch(function (error) {
        if (error instanceof FinoraError) {
          throw error;
        }

        if (
          error &&
          error.name === 'AbortError'
        ) {
          throw new FinoraError(
            'ตรวจสอบสถานะ API หมดเวลา',
            'REQUEST_TIMEOUT'
          );
        }

        throw new FinoraError(
          'ไม่สามารถเชื่อมต่อ Health API ได้',
          'NETWORK_ERROR',
          error
        );
      })
      .finally(function () {
        if (timeoutId !== null) {
          global.clearTimeout(timeoutId);
        }
      });
  }


  /* ================================================================
   * 13. FILE READING AND UPLOAD VALIDATION
   * ================================================================ */

  function fileToDataUrl(file) {
    return new Promise(function (
      resolve,
      reject
    ) {
      if (!(file instanceof Blob)) {
        reject(
          new FinoraError(
            'ไฟล์ที่เลือกไม่ถูกต้อง',
            'INVALID_FILE'
          )
        );

        return;
      }

      var reader = new FileReader();

      reader.onload = function () {
        if (
          typeof reader.result !== 'string' ||
          reader.result.indexOf('data:') !== 0
        ) {
          reject(
            new FinoraError(
              'ไม่สามารถอ่านไฟล์รูปภาพได้',
              'FILE_READ_FAILED'
            )
          );

          return;
        }

        resolve(reader.result);
      };

      reader.onerror = function () {
        reject(
          new FinoraError(
            'เกิดข้อผิดพลาดขณะอ่านไฟล์รูปภาพ',
            'FILE_READ_FAILED'
          )
        );
      };

      reader.onabort = function () {
        reject(
          new FinoraError(
            'ยกเลิกการอ่านไฟล์รูปภาพ',
            'FILE_READ_ABORTED'
          )
        );
      };

      reader.readAsDataURL(file);
    });
  }


  function validateUploadFile(
    file,
    purpose
  ) {
    if (!(file instanceof Blob)) {
      throw new FinoraError(
        'กรุณาเลือกไฟล์รูปภาพ',
        'INVALID_FILE'
      );
    }

    var allowedTypes = [
      'image/png',
      'image/jpeg',
      'image/jpg',
      'image/webp',
      'image/gif'
    ];

    if (
      file.type &&
      allowedTypes.indexOf(
        file.type.toLowerCase()
      ) === -1
    ) {
      throw new FinoraError(
        'รองรับเฉพาะรูปภาพ PNG, JPEG, WEBP และ GIF',
        'UNSUPPORTED_IMAGE_TYPE'
      );
    }

    var maxBytes =
      String(purpose || '').toLowerCase() === 'slip'
        ? config.maximumSlipImageBytes
        : config.maximumProfileImageBytes;

    if (
      file.size <= 0 ||
      file.size > maxBytes
    ) {
      throw new FinoraError(
        'ไฟล์รูปภาพต้องมีขนาดไม่เกิน ' +
          Math.floor(
            maxBytes / 1024 / 1024
          ) +
          ' MB',
        'IMAGE_TOO_LARGE'
      );
    }
  }


  function uploadImageFile(
    file,
    purpose
  ) {
    purpose = String(
      purpose || ''
    ).toLowerCase();

    if (
      purpose !== 'slip' &&
      purpose !== 'announcement'
    ) {
      return Promise.reject(
        new FinoraError(
          'purpose ต้องเป็น slip หรือ announcement',
          'INVALID_UPLOAD_PURPOSE'
        )
      );
    }

    try {
      validateUploadFile(
        file,
        purpose
      );

    } catch (error) {
      return Promise.reject(error);
    }

    return fileToDataUrl(
      file
    ).then(function (imageBase64) {
      return call(
        'uploadImage',
        {
          purpose: purpose,
          imageBase64: imageBase64,
          fileName: String(
            file.name ||
            purpose + '-image'
          )
        }
      );
    });
  }


  /* ================================================================
   * 14. REPAYMENT SLIP SUBMISSION
   *
   * 1. Uploads the selected slip through the backend.
   * 2. Sends the backend-provided image URL for verification.
   *
   * This method never marks a payment as paid by itself.
   * It returns the actual verification response from Code.gs.
   * ================================================================ */

  function submitRepaymentSlip(
    intentId,
    file
  ) {
    if (!intentId) {
      return Promise.reject(
        new FinoraError(
          'ไม่พบรหัสคำขอชำระเงิน',
          'REPAYMENT_INTENT_REQUIRED'
        )
      );
    }

    return uploadImageFile(
      file,
      'slip'
    ).then(function (uploadResult) {
      if (
        !uploadResult ||
        !uploadResult.url
      ) {
        throw new FinoraError(
          'อัปโหลดสลิปแล้วแต่ไม่ได้รับ URL จากเซิร์ฟเวอร์',
          'UPLOAD_URL_MISSING',
          uploadResult
        );
      }

      return call(
        'verifyRepaymentSlip',
        {
          intentId: String(intentId),
          slipUrl: String(uploadResult.url)
        }
      ).then(function (verificationResult) {
        return {
          upload: uploadResult,
          verification: verificationResult
        };
      });
    });
  }


  /* ================================================================
   * 15. FORMATTING HELPERS
   * ================================================================ */

  function formatMoney(
    value,
    currency
  ) {
    var amount = Number(value);

    if (!isFinite(amount)) {
      amount = 0;
    }

    return new Intl.NumberFormat(
      'th-TH',
      {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
      }
    ).format(amount) +
      ' ' +
      (currency || 'บาท');
  }


  function formatDate(
    value,
    includeTime
  ) {
    if (!value) {
      return '-';
    }

    var date = new Date(value);

    if (isNaN(date.getTime())) {
      return String(value);
    }

    var options = includeTime
      ? {
          dateStyle: 'medium',
          timeStyle: 'short',
          timeZone: 'Asia/Bangkok'
        }
      : {
          dateStyle: 'medium',
          timeZone: 'Asia/Bangkok'
        };

    return new Intl.DateTimeFormat(
      'th-TH',
      options
    ).format(date);
  }


  function escapeHtml(value) {
    return String(
      value === null ||
      value === undefined
        ? ''
        : value
    )
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }


  function getQueryParam(name) {
    try {
      return new URL(
        global.location.href
      ).searchParams.get(name);

    } catch (error) {
      return null;
    }
  }


  /* ================================================================
   * 16. PUBLIC API METHODS
   *
   * The action names below correspond to the action router in Code.gs.
   * ================================================================ */

  var api = {

    /* ------------------------------------------------------------
     * Configuration and connection
     * ------------------------------------------------------------ */

    configure: configure,

    getConfig: getConfig,

    request: call,

    health: health,


    /* ------------------------------------------------------------
     * Session and registration storage
     * ------------------------------------------------------------ */

    getSession: getSession,

    getSessionToken: getSessionToken,

    saveSession: saveSession,

    clearSession: clearSession,

    savePendingRegistration:
      savePendingRegistration,

    getPendingRegistration:
      getPendingRegistration,

    clearPendingRegistration:
      clearPendingRegistration,


    /* ------------------------------------------------------------
     * Browser utilities
     * ------------------------------------------------------------ */

    fileToDataUrl: fileToDataUrl,

    uploadImageFile: uploadImageFile,

    submitRepaymentSlip: submitRepaymentSlip,

    formatMoney: formatMoney,

    formatDate: formatDate,

    escapeHtml: escapeHtml,

    getQueryParam: getQueryParam,


    /* ------------------------------------------------------------
     * Application configuration
     * Code.gs action: publicConfig
     * ------------------------------------------------------------ */

    publicConfig: function () {
      return call(
        'publicConfig',
        {}
      );
    },


    /* ------------------------------------------------------------
     * Public announcements
     * Code.gs action: getAnnouncements
     * ------------------------------------------------------------ */

    getAnnouncements: function (placement) {
      return call(
        'getAnnouncements',
        {
          placement: placement || 'LOGIN'
        }
      );
    },


    /* ------------------------------------------------------------
     * Email verification
     * Code.gs actions:
     * requestEmailVerification
     * resendEmailVerification
     * checkEmailVerification
     * ------------------------------------------------------------ */

    requestEmailVerification: function (data) {
      return call(
        'requestEmailVerification',
        data || {}
      ).then(function (result) {
        if (
          result &&
          result.pendingId &&
          result.pollToken
        ) {
          savePendingRegistration(result);
        }

        return result;
      });
    },


    resendEmailVerification: function (data) {
      data = Object.assign(
        {},
        data || {}
      );

      var pending = getPendingRegistration();

      if (
        !data.pendingId &&
        pending
      ) {
        data.pendingId = pending.pendingId;
      }

      if (
        !data.pollToken &&
        pending
      ) {
        data.pollToken = pending.pollToken;
      }

      return call(
        'resendEmailVerification',
        data
      );
    },


    checkEmailVerification: function (data) {
      data = Object.assign(
        {},
        data || {}
      );

      var pending = getPendingRegistration();

      if (
        !data.pendingId &&
        pending
      ) {
        data.pendingId = pending.pendingId;
      }

      if (
        !data.pollToken &&
        pending
      ) {
        data.pollToken = pending.pollToken;
      }

      return call(
        'checkEmailVerification',
        data
      );
    },


    /* ------------------------------------------------------------
     * Complete registration
     * Code.gs action: completeRegistration
     * ------------------------------------------------------------ */

    completeRegistration: function (data) {
      data = Object.assign(
        {},
        data || {}
      );

      var pending = getPendingRegistration();

      if (
        !data.pendingId &&
        pending
      ) {
        data.pendingId = pending.pendingId;
      }

      if (
        !data.pollToken &&
        pending
      ) {
        data.pollToken = pending.pollToken;
      }

      return callAndStoreSession(
        'completeRegistration',
        data
      ).then(function (result) {
        if (
          result &&
          result.sessionToken
        ) {
          clearPendingRegistration();
        }

        return result;
      });
    },


    /* ------------------------------------------------------------
     * Google registration
     * Code.gs action: completeGoogleRegistration
     * ------------------------------------------------------------ */

    completeGoogleRegistration: function (data) {
      return callAndStoreSession(
        'completeGoogleRegistration',
        data || {}
      );
    },


    /* ------------------------------------------------------------
     * Login
     * Code.gs action: login
     * ------------------------------------------------------------ */

    login: function (data) {
      return callAndStoreSession(
        'login',
        data || {}
      );
    },


    /* ------------------------------------------------------------
     * Google Sign-In
     * Code.gs action: googleAuth
     *
     * Accepts either:
     * FINORA.googleAuth(idToken, remember)
     *
     * Or:
     * FINORA.googleAuth({
     *   idToken: credential,
     *   remember: true
     * })
     * ------------------------------------------------------------ */

    googleAuth: function (
      idToken,
      remember
    ) {
      var data =
        typeof idToken === 'object' &&
        idToken !== null
          ? Object.assign({}, idToken)
          : {
              idToken: String(
                idToken || ''
              ),
              remember: Boolean(remember)
            };

      return callAndStoreSession(
        'googleAuth',
        data
      );
    },


    /* ------------------------------------------------------------
     * Link Google account to pending registration
     * Code.gs action: linkGoogleToPending
     * ------------------------------------------------------------ */

    linkGoogleToPending: function (data) {
      data = Object.assign(
        {},
        data || {}
      );

      var pending = getPendingRegistration();

      if (
        !data.pendingId &&
        pending
      ) {
        data.pendingId = pending.pendingId;
      }

      if (
        !data.pollToken &&
        pending
      ) {
        data.pollToken = pending.pollToken;
      }

      return call(
        'linkGoogleToPending',
        data
      );
    },


    /* ------------------------------------------------------------
     * Link Google account to the current user
     * Code.gs action: linkGoogleAccount
     * ------------------------------------------------------------ */

    linkGoogleAccount: function (idToken) {
      var data =
        typeof idToken === 'object' &&
        idToken !== null
          ? Object.assign({}, idToken)
          : {
              idToken: String(
                idToken || ''
              )
            };

      return call(
        'linkGoogleAccount',
        data
      );
    },


    /* ------------------------------------------------------------
     * Password reset
     * Code.gs actions:
     * requestPasswordReset
     * resetPassword
     * ------------------------------------------------------------ */

    requestPasswordReset: function (email) {
      var data =
        typeof email === 'object' &&
        email !== null
          ? email
          : {
              email: String(email || '')
            };

      return call(
        'requestPasswordReset',
        data
      );
    },


    resetPassword: function (data) {
      return call(
        'resetPassword',
        data || {}
      );
    },


    /* ------------------------------------------------------------
     * Logout
     * Code.gs action: logout
     * ------------------------------------------------------------ */

    logout: function () {
      return call(
        'logout',
        {}
      )
        .catch(function (error) {
          if (
            error &&
            error.code === 'UNAUTHENTICATED'
          ) {
            return {
              success: true
            };
          }

          throw error;
        })
        .finally(function () {
          clearSession();
        });
    },


    /* ------------------------------------------------------------
     * Current user
     * Code.gs action: me
     * ------------------------------------------------------------ */

    me: function () {
      return call(
        'me',
        {}
      ).then(function (result) {
        if (
          result &&
          result.user
        ) {
          updateSavedUser(
            result.user
          );
        }

        return result;
      });
    },


    /* ------------------------------------------------------------
     * Update current profile
     * Code.gs action: updateProfile
     * ------------------------------------------------------------ */

    updateProfile: function (data) {
      return call(
        'updateProfile',
        data || {}
      ).then(function (result) {
        if (
          result &&
          result.user
        ) {
          updateSavedUser(
            result.user
          );
        }

        return result;
      });
    },


    /* ------------------------------------------------------------
     * Request account closure
     * Code.gs action: requestAccountClosure
     * ------------------------------------------------------------ */

    requestAccountClosure: function () {
      return call(
        'requestAccountClosure',
        {}
      ).then(function (result) {
        clearSession();
        return result;
      });
    },


    /* ------------------------------------------------------------
     * Borrower dashboard
     * Code.gs action: getDashboard
     * ------------------------------------------------------------ */

    getDashboard: function () {
      return call(
        'getDashboard',
        {}
      );
    },


    /* ------------------------------------------------------------
     * Loan products
     * Code.gs action: getLoanProducts
     * ------------------------------------------------------------ */

    getLoanProducts: function () {
      return call(
        'getLoanProducts',
        {}
      );
    },


    /* ------------------------------------------------------------
     * Submit loan application
     * Code.gs action: submitLoanApplication
     *
     * data fields required by Code.gs include:
     * productId
     * requestedAmount
     * requestedMonths
     * monthlyIncome
     * monthlyExpenses
     * occupation
     * employer
     * purpose
     * ------------------------------------------------------------ */

    submitLoanApplication: function (data) {
      return call(
        'submitLoanApplication',
        data || {}
      );
    },


    /* ------------------------------------------------------------
     * My applications
     * Code.gs action: getMyApplications
     * ------------------------------------------------------------ */

    getMyApplications: function () {
      return call(
        'getMyApplications',
        {}
      );
    },


    /* ------------------------------------------------------------
     * My loans
     * Code.gs action: getMyLoans
     * ------------------------------------------------------------ */

    getMyLoans: function () {
      return call(
        'getMyLoans',
        {}
      );
    },


    /* ------------------------------------------------------------
     * My repayments
     * Code.gs action: getMyRepayments
     * ------------------------------------------------------------ */

    getMyRepayments: function () {
      return call(
        'getMyRepayments',
        {}
      );
    },


    /* ------------------------------------------------------------
     * Create repayment PromptPay QR
     * Code.gs action: createRepaymentQR
     *
     * Accepts:
     * FINORA.createRepaymentQR(loanId)
     *
     * Or:
     * FINORA.createRepaymentQR({ loanId: loanId })
     * ------------------------------------------------------------ */

    createRepaymentQR: function (loanId) {
      var data =
        typeof loanId === 'object' &&
        loanId !== null
          ? loanId
          : {
              loanId: String(
                loanId || ''
              )
            };

      return call(
        'createRepaymentQR',
        data
      );
    },


    /* ------------------------------------------------------------
     * Upload image
     * Code.gs action: uploadImage
     *
     * For ordinary user uploads, use:
     * FINORA.uploadImageFile(file, 'slip')
     *
     * For direct API calls, provide:
     * { purpose, imageBase64, fileName }
     * ------------------------------------------------------------ */

    uploadImage: function (data) {
      return call(
        'uploadImage',
        data || {}
      );
    },


    /* ------------------------------------------------------------
     * Verify repayment slip
     * Code.gs action: verifyRepaymentSlip
     *
     * Required data:
     * {
     *   intentId: "...",
     *   slipUrl: "https://..."
     * }
     * ------------------------------------------------------------ */

    verifyRepaymentSlip: function (data) {
      return call(
        'verifyRepaymentSlip',
        data || {}
      );
    },


    /* ------------------------------------------------------------
     * Create a support ticket
     * Code.gs action: createSupportTicket
     * ------------------------------------------------------------ */

    createSupportTicket: function (data) {
      return call(
        'createSupportTicket',
        data || {}
      );
    },


    /* ------------------------------------------------------------
     * Get current user's support tickets
     * Code.gs action: getMySupportTickets
     * ------------------------------------------------------------ */

    getMySupportTickets: function () {
      return call(
        'getMySupportTickets',
        {}
      );
    },


    /* ============================================================
     * ADMIN API METHODS
     *
     * These methods are included because the attached Code.gs
     * declares these actions. The backend must authorize every
     * admin call. Hiding a frontend button does not grant security.
     * ============================================================ */


    /* ------------------------------------------------------------
     * Admin dashboard
     * Code.gs action: adminDashboard
     * ------------------------------------------------------------ */

    adminDashboard: function () {
      return call(
        'adminDashboard',
        {}
      );
    },


    /* ------------------------------------------------------------
     * Admin: list users
     * Code.gs action: adminListUsers
     * ------------------------------------------------------------ */

    adminListUsers: function () {
      return call(
        'adminListUsers',
        {}
      );
    },


    /* ------------------------------------------------------------
     * Admin: update user status
     * Code.gs action: adminUpdateUserStatus
     * ------------------------------------------------------------ */

    adminUpdateUserStatus: function (data) {
      return call(
        'adminUpdateUserStatus',
        data || {}
      );
    },


    /* ------------------------------------------------------------
     * Admin: list applications
     * Code.gs action: adminListApplications
     * ------------------------------------------------------------ */

    adminListApplications: function () {
      return call(
        'adminListApplications',
        {}
      );
    },


    /* ------------------------------------------------------------
     * Admin: review application
     * Code.gs action: adminReviewApplication
     * ------------------------------------------------------------ */

    adminReviewApplication: function (data) {
      return call(
        'adminReviewApplication',
        data || {}
      );
    },


    /* ------------------------------------------------------------
     * Admin: create or update loan product
     * Code.gs action: adminUpsertLoanProduct
     * ------------------------------------------------------------ */

    adminUpsertLoanProduct: function (data) {
      return call(
        'adminUpsertLoanProduct',
        data || {}
      );
    },


    /* ------------------------------------------------------------
     * Admin: record loan disbursement
     * Code.gs action: adminRecordDisbursement
     * ------------------------------------------------------------ */

    adminRecordDisbursement: function (data) {
      return call(
        'adminRecordDisbursement',
        data || {}
      );
    },


    /* ------------------------------------------------------------
     * Admin: list loans
     * Code.gs action: adminListLoans
     * ------------------------------------------------------------ */

    adminListLoans: function () {
      return call(
        'adminListLoans',
        {}
      );
    },


    /* ------------------------------------------------------------
     * Admin: list payment reviews
     * Code.gs action: adminListPaymentReviews
     * ------------------------------------------------------------ */

    adminListPaymentReviews: function () {
      return call(
        'adminListPaymentReviews',
        {}
      );
    },


    /* ------------------------------------------------------------
     * Admin: resolve payment review
     * Code.gs action: adminResolvePaymentReview
     * ------------------------------------------------------------ */

    adminResolvePaymentReview: function (data) {
      return call(
        'adminResolvePaymentReview',
        data || {}
      );
    },


    /* ------------------------------------------------------------
     * Admin: list support tickets
     * Code.gs action: adminListSupportTickets
     * ------------------------------------------------------------ */

    adminListSupportTickets: function () {
      return call(
        'adminListSupportTickets',
        {}
      );
    },


    /* ------------------------------------------------------------
     * Admin: update support ticket
     * Code.gs action: adminUpdateSupportTicket
     * ------------------------------------------------------------ */

    adminUpdateSupportTicket: function (data) {
      return call(
        'adminUpdateSupportTicket',
        data || {}
      );
    },


    /* ------------------------------------------------------------
     * Admin: create or update announcement
     * Code.gs action: adminUpsertAnnouncement
     * ------------------------------------------------------------ */

    adminUpsertAnnouncement: function (data) {
      return call(
        'adminUpsertAnnouncement',
        data || {}
      );
    },


    /* ------------------------------------------------------------
     * Admin: list announcements
     * Code.gs action: adminListAnnouncements
     * ------------------------------------------------------------ */

    adminListAnnouncements: function () {
      return call(
        'adminListAnnouncements',
        {}
      );
    },


    /* ------------------------------------------------------------
     * Admin: archive announcement
     * Code.gs action: adminArchiveAnnouncement
     * ------------------------------------------------------------ */

    adminArchiveAnnouncement: function (announcementId) {
      var data =
        typeof announcementId === 'object' &&
        announcementId !== null
          ? announcementId
          : {
              announcementId: String(
                announcementId || ''
              )
            };

      return call(
        'adminArchiveAnnouncement',
        data
      );
    },


    /* ------------------------------------------------------------
     * Admin reports
     * Code.gs action: adminReports
     * ------------------------------------------------------------ */

    adminReports: function () {
      return call(
        'adminReports',
        {}
      );
    },


    /* ------------------------------------------------------------
     * Admin audit logs
     * Code.gs action: adminAuditLogs
     * ------------------------------------------------------------ */

    adminAuditLogs: function (limit) {
      var data =
        typeof limit === 'object' &&
        limit !== null
          ? limit
          : {
              limit: limit || 100
            };

      return call(
        'adminAuditLogs',
        data
      );
    }
  };


  /* ================================================================
   * 17. EXPORT GLOBAL API
   *
   * index.html can access this object as:
   * FINORA.login(...)
   * FINORA.getDashboard()
   * FINORA.createRepaymentQR(...)
   * ================================================================ */

  global.FINORA = api;

})(window);
