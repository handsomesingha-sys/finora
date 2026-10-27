/* ================================================================
   FINORA FRONTEND CONTROLLER
   File: index.js

   Frontend:
   - GitHub Pages
   - index.html
   - dashboard.html

   Backend:
   - Google Apps Script Code.gs
   - Google Sheets

   IMPORTANT:
   1. ห้ามใส่ API Secret, API Token หรือ Password ลงในไฟล์นี้
   2. API_URL เป็น URL สาธารณะของ Google Apps Script Web App
   3. ใช้ iframe POST bridge ให้ตรงกับ doPost() ใน Code.gs
   4. Session token ต้องได้รับการตรวจสอบจากเซิร์ฟเวอร์ทุกครั้ง
   ================================================================ */

(function FINORAFrontendController() {

    "use strict";

    /* ============================================================
       1. CONFIGURATION
       ============================================================ */

    const CONFIG = Object.freeze({

        apiUrl: readConfiguration(
            "apiUrl",
            "finora-api-url",
            ""
        ),

        googleClientId: readConfiguration(
            "googleClientId",
            "finora-google-client-id",
            ""
        ),

        termsVersion: readConfiguration(
            "termsVersion",
            "finora-terms-version",
            ""
        ),

        privacyVersion: readConfiguration(
            "privacyVersion",
            "finora-privacy-version",
            ""
        ),

        requestTimeoutMs: 90000,

        verificationPollIntervalMs: 10000,

        verificationMaxPolls: 60,

        maxPublicImageBytes: 4194304,

        maxSlipImageBytes: 4194304,

        sessionStorageKey: "finora.session",

        rememberStorageKey: "finora.remembered-session",

        verificationStorageKey: "finora.verification-session",

        googleSignupStorageKey: "finora.google-signup-session",

        resetTokenStorageKey: "finora.reset-token"

    });


    function readConfiguration(propertyName, metaName, fallback) {

        if (
            window.FINORA_CONFIG &&
            window.FINORA_CONFIG[propertyName] !== undefined &&
            window.FINORA_CONFIG[propertyName] !== null &&
            String(window.FINORA_CONFIG[propertyName]).trim() !== ""
        ) {

            return String(
                window.FINORA_CONFIG[propertyName]
            ).trim();

        }

        const meta = document.querySelector(
            'meta[name="' + metaName + '"]'
        );

        if (meta && meta.content) {
            return String(meta.content).trim();
        }

        return fallback;

    }


    /* ============================================================
       2. INTERNAL STATE
       ============================================================ */

    const STATE = {

        initialized: false,

        googleInitialized: false,

        googleScriptLoading: false,

        googleIntent: "login",

        googleButtonsRendered: new WeakSet(),

        pendingRequests: new Map(),

        verificationTimer: null,

        verificationPollCount: 0,

        loadingCount: 0,

        toastTimer: null,

        announcementCache: [],

        lastUser: null

    };


    const SESSION = {

        getToken: getSessionToken,

        save: saveSession,

        clear: clearSession,

        exists: function() {
            return Boolean(getSessionToken());
        }

    };


    /* ============================================================
       3. GENERAL UTILITIES
       ============================================================ */

    function emit(eventName, detail) {

        let event;

        try {

            event = new CustomEvent(eventName, {

                detail: detail || {},

                bubbles: false,

                cancelable: false

            });

        } catch (error) {

            event = document.createEvent("CustomEvent");

            event.initCustomEvent(
                eventName,
                false,
                false,
                detail || {}
            );

        }

        window.dispatchEvent(event);

    }


    function createRequestId() {

        if (
            window.crypto &&
            typeof window.crypto.randomUUID === "function"
        ) {

            return window.crypto.randomUUID();

        }

        return "finora-" +
            Date.now().toString(36) +
            "-" +
            Math.random().toString(36).slice(2) +
            Math.random().toString(36).slice(2);

    }


    function safeStorageGet(storage, key) {

        try {

            return storage.getItem(key);

        } catch (error) {

            return null;

        }

    }


    function safeStorageSet(storage, key, value) {

        try {

            storage.setItem(key, value);

            return true;

        } catch (error) {

            return false;

        }

    }


    function safeStorageRemove(storage, key) {

        try {

            storage.removeItem(key);

        } catch (error) {

            // Browser storage may be unavailable.
        }

    }


    function getSessionToken() {

        const temporary = safeStorageGet(
            window.sessionStorage,
            CONFIG.sessionStorageKey
        );

        if (temporary) {
            return temporary;
        }

        return safeStorageGet(
            window.localStorage,
            CONFIG.rememberStorageKey
        );

    }


    function saveSession(token, rememberMe) {

        if (!token || typeof token !== "string") {

            throw new Error(
                "ไม่พบ Session Token ที่ถูกต้อง"
            );

        }

        safeStorageRemove(
            window.sessionStorage,
            CONFIG.sessionStorageKey
        );

        safeStorageRemove(
            window.localStorage,
            CONFIG.rememberStorageKey
        );

        const destination = rememberMe
            ? window.localStorage
            : window.sessionStorage;

        const destinationKey = rememberMe
            ? CONFIG.rememberStorageKey
            : CONFIG.sessionStorageKey;

        const saved = safeStorageSet(
            destination,
            destinationKey,
            token
        );

        if (!saved) {

            throw new Error(
                "เบราว์เซอร์ไม่อนุญาตให้จัดเก็บ Session กรุณาตรวจสอบการตั้งค่าเบราว์เซอร์"
            );

        }

        emit("finora:session-saved", {

            rememberMe: Boolean(rememberMe)

        });

    }


    function clearSession() {

        safeStorageRemove(
            window.sessionStorage,
            CONFIG.sessionStorageKey
        );

        safeStorageRemove(
            window.localStorage,
            CONFIG.rememberStorageKey
        );

        STATE.lastUser = null;

        emit("finora:session-cleared", {});

        emit("finora:auth-changed", {

            authenticated: false,

            user: null

        });

    }


    function normalizeBoolean(value) {

        if (value === true) {
            return true;
        }

        if (value === false || value === null || value === undefined) {
            return false;
        }

        const normalized = String(value).trim().toLowerCase();

        return [
            "true",
            "1",
            "yes",
            "on"
        ].indexOf(normalized) >= 0;

    }


    function normalizeEmail(value) {

        return String(value || "")
            .trim()
            .toLowerCase();

    }


    function validateEmailClient(email) {

        const value = normalizeEmail(email);

        if (value.length > 254) {
            return false;
        }

        return /^[A-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Z0-9](?:[A-Z0-9-]{0,61}[A-Z0-9])?(?:\.[A-Z0-9](?:[A-Z0-9-]{0,61}[A-Z0-9])?)+$/i.test(value);

    }


    function validateNationalIdClient(value) {

        const nationalId = String(value || "")
            .replace(/[\s-]/g, "");

        if (!/^[0-9]{13}$/.test(nationalId)) {
            return false;
        }

        let sum = 0;

        for (let index = 0; index < 12; index++) {

            sum += Number(
                nationalId.charAt(index)
            ) * (13 - index);

        }

        const expected = (11 - (sum % 11)) % 10;

        return expected === Number(
            nationalId.charAt(12)
        );

    }


    function validatePasswordClient(password) {

        const value = String(password || "");

        return {

            length: value.length >= 12 && value.length <= 128,

            lowercase: /[a-z]/.test(value),

            uppercase: /[A-Z]/.test(value),

            number: /[0-9]/.test(value),

            special: /[^A-Za-z0-9]/.test(value)

        };

    }


    function getPasswordStrength(password) {

        const rules = validatePasswordClient(password);

        let score = 0;

        Object.keys(rules).forEach(function(key) {

            if (rules[key]) {
                score++;
            }

        });

        const value = String(password || "");

        if (value.length >= 16) {
            score = Math.min(5, score + 1);
        }

        if (value.length >= 20) {
            score = Math.min(5, score + 1);
        }

        if (/(.)\1{3,}/.test(value)) {
            score = Math.max(0, score - 1);
        }

        let label = "ยังไม่ปลอดภัย";

        if (score >= 5) {
            label = "แข็งแรง";
        } else if (score >= 4) {
            label = "ค่อนข้างแข็งแรง";
        } else if (score >= 3) {
            label = "ปานกลาง";
        } else if (score >= 2) {
            label = "อ่อน";
        }

        return {

            score: Math.min(5, score),

            label: label,

            rules: rules

        };

    }


    function findField(form, names) {

        for (let index = 0; index < names.length; index++) {

            const name = names[index];

            const byName = form.querySelector(
                '[name="' + name + '"]'
            );

            if (byName) {
                return byName;
            }

            const byId = document.getElementById(name);

            if (byId && form.contains(byId)) {
                return byId;
            }

        }

        return null;

    }


    function getFieldValue(form, names, fallback) {

        const field = findField(form, names);

        if (!field) {
            return fallback === undefined ? "" : fallback;
        }

        if (field.type === "checkbox") {
            return field.checked;
        }

        if (field.type === "radio") {

            const checked = form.querySelector(
                'input[name="' + field.name + '"]:checked'
            );

            return checked ? checked.value : "";

        }

        return field.value;

    }


    function collectFormData(form) {

        const result = {};

        Array.from(form.elements).forEach(function(element) {

            if (!element.name || element.disabled) {
                return;
            }

            if (element.type === "submit" || element.type === "button") {
                return;
            }

            if (element.type === "file") {
                return;
            }

            if (element.type === "radio") {

                if (element.checked) {
                    result[element.name] = element.value;
                }

                return;

            }

            if (element.type === "checkbox") {

                result[element.name] = element.checked;

                return;

            }

            result[element.name] = element.value;

        });

        return result;

    }


    function escapeHtml(value) {

        return String(
            value === undefined || value === null
                ? ""
                : value
        )
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#39;");

    }


    /* ============================================================
       4. FEEDBACK — TOAST AND LOADING OVERLAY
       ============================================================ */

    function injectFeedbackStyles() {

        if (document.getElementById("finora-feedback-styles")) {
            return;
        }

        const style = document.createElement("style");

        style.id = "finora-feedback-styles";

        style.textContent = `
            .finora-runtime-toast-container {
                position: fixed;
                right: 18px;
                top: 18px;
                z-index: 2147483000;
                display: flex;
                flex-direction: column;
                gap: 10px;
                width: min(420px, calc(100vw - 36px));
                pointer-events: none;
            }

            .finora-runtime-toast {
                display: flex;
                align-items: flex-start;
                gap: 11px;
                padding: 15px 17px;
                border: 1px solid #e5eaf2;
                border-radius: 14px;
                background: #ffffff;
                color: #182236;
                box-shadow: 0 12px 38px rgba(17, 28, 53, 0.14);
                font-family: Arial, Helvetica, sans-serif;
                font-size: 14px;
                line-height: 1.6;
                animation: finoraToastEnter .2s ease-out;
                overflow-wrap: anywhere;
            }

            .finora-runtime-toast::before {
                content: "";
                flex: 0 0 8px;
                width: 8px;
                height: 8px;
                margin-top: 6px;
                border-radius: 50%;
                background: #2747b5;
            }

            .finora-runtime-toast[data-type="success"]::before {
                background: #229b68;
            }

            .finora-runtime-toast[data-type="error"]::before {
                background: #d83a52;
            }

            .finora-runtime-toast[data-type="warning"]::before {
                background: #d18a16;
            }

            .finora-runtime-toast-message {
                flex: 1;
                min-width: 0;
                white-space: pre-wrap;
            }

            .finora-runtime-toast-close {
                border: 0;
                background: transparent;
                color: #687386;
                font-size: 19px;
                line-height: 1;
                padding: 0 0 0 6px;
                cursor: pointer;
                pointer-events: auto;
            }

            .finora-runtime-loading {
                position: fixed;
                inset: 0;
                z-index: 2147482000;
                display: flex;
                flex-direction: column;
                align-items: center;
                justify-content: center;
                gap: 23px;
                padding: 24px;
                background: rgba(246, 247, 249, .94);
                color: #182236;
                font-family: Arial, Helvetica, sans-serif;
                text-align: center;
            }

            .finora-runtime-loading[hidden] {
                display: none !important;
            }

            .finora-runtime-loading-message {
                margin: 0;
                max-width: 340px;
                font-size: 15px;
                line-height: 1.7;
            }

            .finora-dot-spinner {
                position: relative;
                width: 112px;
                height: 112px;
                animation: finoraSpinnerRotate 1.8s ease-in-out infinite;
            }

            .finora-dot-spinner span {
                position: absolute;
                display: block;
                border-radius: 50%;
                animation: finoraSpinnerPulse 1.2s ease-in-out infinite;
            }

            .finora-dot-spinner span:nth-child(1) {
                left: 10px;
                top: 8px;
                width: 38px;
                height: 38px;
                background: #08a8f5;
                animation-delay: 0s;
            }

            .finora-dot-spinner span:nth-child(2) {
                left: 72px;
                top: 13px;
                width: 29px;
                height: 29px;
                background: #ff5d63;
                animation-delay: .15s;
            }

            .finora-dot-spinner span:nth-child(3) {
                left: 21px;
                top: 74px;
                width: 27px;
                height: 27px;
                background: #d25bf4;
                animation-delay: .3s;
            }

            .finora-dot-spinner span:nth-child(4) {
                left: 61px;
                top: 59px;
                width: 48px;
                height: 48px;
                background: #91cf20;
                animation-delay: .45s;
            }

            .finora-runtime-spinner-fallback {
                width: 24px;
                height: 24px;
                border: 3px solid #dce4f7;
                border-top-color: #2747b5;
                border-radius: 50%;
                animation: finoraClassicSpinner .7s linear infinite;
            }

            @keyframes finoraSpinnerPulse {
                0%, 100% {
                    transform: scale(.88);
                    opacity: .8;
                }
                50% {
                    transform: scale(1.05);
                    opacity: 1;
                }
            }

            @keyframes finoraSpinnerRotate {
                0%, 100% {
                    transform: rotate(0deg);
                }
                50% {
                    transform: rotate(13deg);
                }
            }

            @keyframes finoraClassicSpinner {
                to {
                    transform: rotate(360deg);
                }
            }

            @keyframes finoraToastEnter {
                from {
                    opacity: 0;
                    transform: translateY(-6px);
                }
                to {
                    opacity: 1;
                    transform: translateY(0);
                }
            }

            @media (prefers-reduced-motion: reduce) {
                .finora-runtime-toast,
                .finora-dot-spinner,
                .finora-dot-spinner span,
                .finora-runtime-spinner-fallback {
                    animation: none !important;
                }
            }
        `;

        document.head.appendChild(style);

    }


    function getToastContainer() {

        let container = document.getElementById(
            "finora-runtime-toast-container"
        );

        if (!container) {

            container = document.createElement("div");

            container.id = "finora-runtime-toast-container";

            container.className = "finora-runtime-toast-container";

            container.setAttribute("aria-live", "polite");

            container.setAttribute("aria-atomic", "false");

            document.body.appendChild(container);

        }

        return container;

    }


    function showToast(message, type, duration) {

        injectFeedbackStyles();

        const safeMessage = String(message || "").trim();

        if (!safeMessage) {
            return;
        }

        const container = getToastContainer();

        const toast = document.createElement("div");

        toast.className = "finora-runtime-toast";

        toast.dataset.type = [
            "success",
            "error",
            "warning",
            "info"
        ].indexOf(type) >= 0 ? type : "info";

        const messageElement = document.createElement("div");

        messageElement.className = "finora-runtime-toast-message";

        messageElement.textContent = safeMessage;

        const closeButton = document.createElement("button");

        closeButton.type = "button";

        closeButton.className = "finora-runtime-toast-close";

        closeButton.setAttribute("aria-label", "ปิดข้อความ");

        closeButton.textContent = "×";

        closeButton.addEventListener("click", function() {

            toast.remove();

        });

        toast.appendChild(messageElement);

        toast.appendChild(closeButton);

        container.appendChild(toast);

        const timeout = Number(duration || 4500);

        window.setTimeout(function() {

            if (toast.isConnected) {
                toast.remove();
            }

        }, Math.max(1000, timeout));

        emit("finora:toast", {

            message: safeMessage,

            type: type || "info"

        });

    }


    function getLoadingOverlay() {

        let overlay = document.querySelector(
            "[data-finora-loading-overlay], #globalLoadingOverlay"
        );

        if (overlay) {
            return overlay;
        }

        overlay = document.createElement("div");

        overlay.id = "finora-runtime-loading-overlay";

        overlay.className = "finora-runtime-loading";

        overlay.hidden = true;

        overlay.setAttribute("aria-hidden", "true");

        overlay.setAttribute("role", "status");

        overlay.setAttribute("aria-live", "polite");

        const spinner = document.createElement("div");

        spinner.className = "finora-dot-spinner";

        spinner.setAttribute("aria-hidden", "true");

        for (let index = 0; index < 4; index++) {

            spinner.appendChild(
                document.createElement("span")
            );

        }

        const message = document.createElement("p");

        message.className = "finora-runtime-loading-message";

        message.dataset.finoraLoadingText = "";

        message.textContent = "กำลังโหลดข้อมูลระบบ";

        overlay.appendChild(spinner);

        overlay.appendChild(message);

        document.body.appendChild(overlay);

        return overlay;

    }


    function showLoading(message) {

        injectFeedbackStyles();

        STATE.loadingCount++;

        const overlay = getLoadingOverlay();

        const messageElement = overlay.querySelector(
            "[data-finora-loading-text], .finora-runtime-loading-message"
        );

        if (messageElement) {

            messageElement.textContent = String(
                message || "กำลังโหลดข้อมูลระบบ"
            );

        }

        overlay.hidden = false;

        overlay.setAttribute("aria-hidden", "false");

        overlay.classList.add("is-visible");

        emit("finora:loading", {

            visible: true,

            message: message || "กำลังโหลดข้อมูลระบบ"

        });

    }


    function hideLoading() {

        STATE.loadingCount = Math.max(
            0,
            STATE.loadingCount - 1
        );

        if (STATE.loadingCount > 0) {
            return;
        }

        const overlay = document.querySelector(
            "[data-finora-loading-overlay], #globalLoadingOverlay, #finora-runtime-loading-overlay"
        );

        if (overlay) {

            overlay.hidden = true;

            overlay.setAttribute("aria-hidden", "true");

            overlay.classList.remove("is-visible");

        }

        emit("finora:loading", {

            visible: false,

            message: ""

        });

    }


    async function withLoading(message, callback) {

        showLoading(message);

        try {

            return await callback();

        } finally {

            hideLoading();

        }

    }


    /* ============================================================
       5. GOOGLE APPS SCRIPT POST BRIDGE

       ตรงกับ Code.gs:
       - doPost(e)
       - e.parameter.payload
       - FINORA_API_RESPONSE
       - requestId
       ============================================================ */

    function ensureApiConfiguration() {

        if (!CONFIG.apiUrl) {

            throw new Error(
                "ไม่ได้กำหนด API_URL กรุณาตรวจสอบ meta finora-api-url หรือ FINORA_CONFIG.apiUrl"
            );

        }

        if (!/^https:\/\/script\.google\.com\/macros\/s\/[^/]+\/exec(?:[?#].*)?$/i.test(CONFIG.apiUrl)) {

            throw new Error(
                "API_URL ต้องเป็น URL Google Apps Script Web App ที่ลงท้ายด้วย /exec"
            );

        }

        return CONFIG.apiUrl;

    }


    function removeBridgeElements(requestId) {

        const pending = STATE.pendingRequests.get(
            requestId
        );

        if (!pending) {
            return;
        }

        window.clearTimeout(pending.timeoutHandle);

        STATE.pendingRequests.delete(requestId);

        if (pending.form && pending.form.isConnected) {
            pending.form.remove();
        }

        if (pending.frame && pending.frame.isConnected) {
            pending.frame.remove();
        }

    }


    function resolveBridgeRequest(requestId, response) {

        const pending = STATE.pendingRequests.get(
            requestId
        );

        if (!pending) {
            return;
        }

        removeBridgeElements(requestId);

        if (!response || response.type !== "FINORA_API_RESPONSE") {

            pending.reject(
                createClientError(
                    "INVALID_API_RESPONSE",
                    "รูปแบบการตอบกลับจากเซิร์ฟเวอร์ไม่ถูกต้อง"
                )
            );

            return;

        }

        if (response.ok !== true) {

            const error = createClientError(

                response.error && response.error.code
                    ? response.error.code
                    : "API_ERROR",

                response.error && response.error.message
                    ? response.error.message
                    : "ระบบไม่สามารถดำเนินการได้ กรุณาลองใหม่"

            );

            pending.reject(error);

            return;

        }

        pending.resolve(response.data);

    }


    function createClientError(code, message) {

        const error = new Error(
            String(message || "ระบบไม่สามารถดำเนินการได้")
        );

        error.code = String(code || "CLIENT_ERROR");

        return error;

    }


    window.addEventListener("message", function(event) {

        if (!event || !event.data) {
            return;
        }

        const response = event.data;

        if (
            typeof response !== "object" ||
            response.type !== "FINORA_API_RESPONSE" ||
            !response.requestId
        ) {
            return;
        }

        const requestId = String(response.requestId);

        const pending = STATE.pendingRequests.get(requestId);

        if (!pending) {
            return;
        }

        /*
         * ตรวจสอบให้ event มาจาก iframe ของคำขอที่เราสร้าง
         * ไม่รับข้อความ API จาก iframe อื่นหรือหน้าต่างอื่น
         */
        if (event.source !== pending.frame.contentWindow) {
            return;
        }

        resolveBridgeRequest(requestId, response);

    });


    function requestApi(action, data, options) {

        const settings = options || {};

        const payloadData = data && typeof data === "object"
            ? data
            : {};

        const requestAction = String(action || "").trim();

        if (!requestAction) {

            return Promise.reject(
                createClientError(
                    "ACTION_REQUIRED",
                    "ไม่พบคำสั่ง API ที่ต้องการดำเนินการ"
                )
            );

        }

        let apiUrl;

        try {

            apiUrl = ensureApiConfiguration();

        } catch (error) {

            return Promise.reject(error);

        }

        if (!document.body) {

            return Promise.reject(
                createClientError(
                    "DOCUMENT_NOT_READY",
                    "หน้าเว็บยังโหลดไม่เสร็จ กรุณาลองใหม่"
                )
            );

        }

        const requestId = createRequestId();

        const frameName = "finora_bridge_" +
            requestId.replace(/[^a-zA-Z0-9_-]/g, "");

        const request = {

            action: requestAction,

            data: payloadData,

            requestId: requestId

        };

        if (settings.auth !== false) {

            const token = getSessionToken();

            if (token) {
                request.sessionToken = token;
            }

        }

        if (
            requestAction === "signup" &&
            !request.data.googleSignupToken
        ) {

            const googleSignupToken = safeStorageGet(
                window.sessionStorage,
                CONFIG.googleSignupStorageKey
            );

            if (googleSignupToken) {

                request.data.googleSignupToken =
                    googleSignupToken;

            }

        }

        return new Promise(function(resolve, reject) {

            const frame = document.createElement("iframe");

            frame.name = frameName;

            frame.title = "FINORA API connection";

            frame.setAttribute("aria-hidden", "true");

            frame.tabIndex = -1;

            frame.style.position = "fixed";

            frame.style.width = "1px";

            frame.style.height = "1px";

            frame.style.left = "-10000px";

            frame.style.top = "0";

            frame.style.border = "0";

            frame.style.visibility = "hidden";

            const form = document.createElement("form");

            form.method = "POST";

            form.action = apiUrl;

            form.target = frameName;

            form.acceptCharset = "UTF-8";

            form.enctype = "application/x-www-form-urlencoded";

            form.style.display = "none";

            const payloadInput = document.createElement("input");

            payloadInput.type = "hidden";

            payloadInput.name = "payload";

            payloadInput.value = JSON.stringify(request);

            form.appendChild(payloadInput);

            document.body.appendChild(frame);

            document.body.appendChild(form);

            const timeoutHandle = window.setTimeout(function() {

                const pending = STATE.pendingRequests.get(requestId);

                if (!pending) {
                    return;
                }

                removeBridgeElements(requestId);

                reject(
                    createClientError(
                        "API_TIMEOUT",
                        "เซิร์ฟเวอร์ใช้เวลาตอบกลับนานเกินกำหนด กรุณาตรวจสอบการเชื่อมต่อแล้วลองใหม่"
                    )
                );

            }, Number(settings.timeoutMs || CONFIG.requestTimeoutMs));

            STATE.pendingRequests.set(requestId, {

                frame: frame,

                form: form,

                resolve: resolve,

                reject: reject,

                timeoutHandle: timeoutHandle

            });

            window.setTimeout(function() {

                if (!STATE.pendingRequests.has(requestId)) {
                    return;
                }

                try {

                    form.submit();

                } catch (error) {

                    removeBridgeElements(requestId);

                    reject(
                        createClientError(
                            "API_SUBMISSION_FAILED",
                            "ไม่สามารถส่งคำขอไปยัง FINORA API ได้"
                        )
                    );

                }

            }, 0);

        });

    }


    /* ============================================================
       6. API METHODS — MATCHING Code.gs ACTIONS
       ============================================================ */

    const API = Object.freeze({

        /* ----------------------------
           Authentication
           ---------------------------- */

        signup: function(data) {

            return requestApi(
                "signup",
                data,
                { auth: false }
            );

        },

        login: function(data) {

            return requestApi(
                "login",
                data,
                { auth: false }
            );

        },

        logout: function() {

            return requestApi(
                "logout",
                {},
                { auth: true }
            );

        },

        me: function() {

            return requestApi(
                "me",
                {},
                { auth: true }
            );

        },

        googleStart: function(idToken, rememberMe) {

            return requestApi(
                "googleStart",
                {

                    idToken: idToken,

                    rememberMe: Boolean(rememberMe)

                },
                { auth: false }
            );

        },

        linkGoogle: function(idToken) {

            return requestApi(
                "linkGoogle",
                {
                    idToken: idToken
                },
                { auth: true }
            );

        },

        /* ----------------------------
           Email verification
           ---------------------------- */

        checkEmailVerification: function(token) {

            return requestApi(
                "checkEmailVerification",
                {

                    verificationPollToken: token

                },
                { auth: false }
            );

        },

        resendVerification: function(email) {

            return requestApi(
                "resendVerification",
                {

                    email: normalizeEmail_(email)

                },
                { auth: false }
            );

        },

        /* ----------------------------
           Password reset
           ---------------------------- */

        forgotPassword: function(email) {

            return requestApi(
                "forgotPassword",
                {

                    email: normalizeEmail_(email)

                },
                { auth: false }
            );

        },

        resetPassword: function(data) {

            return requestApi(
                "resetPassword",
                data,
                { auth: false }
            );

        },

        /* ----------------------------
           Public content
           ---------------------------- */

        getPublicAnnouncements: function(placement) {

            return requestApi(
                "getPublicAnnouncements",
                {

                    placement: placement || "LOGIN_SIGNUP"

                },
                { auth: false }
            );

        },

        getPublicProducts: function() {

            return requestApi(
                "getPublicProducts",
                {},
                { auth: false }
            );

        },

        /* ----------------------------
           Member dashboard
           ---------------------------- */

        getDashboard: function() {

            return requestApi(
                "getDashboard",
                {},
                { auth: true }
            );

        },

        submitLoanApplication: function(data) {

            return requestApi(
                "submitLoanApplication",
                data,
                { auth: true }
            );

        },

        createRepaymentQR: function(loanId) {

            return requestApi(
                "createRepaymentQR",
                {

                    loanId: loanId

                },
                { auth: true }
            );

        },

        submitRepaymentSlip: function(data) {

            return requestApi(
                "submitRepaymentSlip",
                data,
                {
                    auth: true,
                    timeoutMs: 120000
                }
            );

        },

        openSupportTicket: function(data) {

            return requestApi(
                "openSupportTicket",
                data,
                { auth: true }
            );

        },

        getNotifications: function() {

            return requestApi(
                "getNotifications",
                {},
                { auth: true }
            );

        },

        markNotificationRead: function(notificationId) {

            return requestApi(
                "markNotificationRead",
                {

                    notificationId: notificationId

                },
                { auth: true }
            );

        },

        /* ----------------------------
           Admin dashboard
           ---------------------------- */

        adminSummary: function() {

            return requestApi(
                "adminSummary",
                {},
                { auth: true }
            );

        },

        adminListMembers: function(data) {

            return requestApi(
                "adminListMembers",
                data || {},
                { auth: true }
            );

        },

        adminListApplications: function(data) {

            return requestApi(
                "adminListApplications",
                data || {},
                { auth: true }
            );

        },

        adminReviewApplication: function(data) {

            return requestApi(
                "adminReviewApplication",
                data,
                { auth: true }
            );

        },

        adminSaveProduct: function(data) {

            return requestApi(
                "adminSaveProduct",
                data,
                { auth: true }
            );

        },

        adminListAnnouncements: function() {

            return requestApi(
                "adminListAnnouncements",
                {},
                { auth: true }
            );

        },

        adminSaveAnnouncement: function(data) {

            return requestApi(
                "adminSaveAnnouncement",
                data,
                { auth: true }
            );

        },

        adminDeleteAnnouncement: function(announcementId) {

            return requestApi(
                "adminDeleteAnnouncement",
                {

                    announcementId: announcementId

                },
                { auth: true }
            );

        },

        adminUploadImage: function(data) {

            return requestApi(
                "adminUploadImage",
                data,
                {
                    auth: true,
                    timeoutMs: 120000
                }
            );

        },

        adminActivateLoan: function(data) {

            return requestApi(
                "adminActivateLoan",
                data,
                { auth: true }
            );

        },

        adminListRepayments: function(data) {

            return requestApi(
                "adminListRepayments",
                data || {},
                { auth: true }
            );

        },

        adminListTickets: function(data) {

            return requestApi(
                "adminListTickets",
                data || {},
                { auth: true }
            );

        },

        adminUpdateTicket: function(data) {

            return requestApi(
                "adminUpdateTicket",
                data,
                { auth: true }
            );

        },

        adminSendNotification: function(data) {

            return requestApi(
                "adminSendNotification",
                data,
                { auth: true }
            );

        }

    });


    /* ============================================================
       7. MEMBER LOGIN
       ============================================================ */

    async function login(data) {

        const identifier = String(
            data.identifier ||
            data.usernameOrEmail ||
            data.username ||
            data.email ||
            ""
        ).trim();

        const password = String(
            data.password || ""
        );

        if (!identifier || !password) {

            throw createClientError(
                "MISSING_CREDENTIALS",
                "กรุณากรอกชื่อผู้ใช้หรืออีเมล และรหัสผ่าน"
            );

        }

        const result = await API.login({

            identifier: identifier,

            password: password,

            rememberMe: normalizeBoolean(
                data.rememberMe
            )

        });

        if (!result || !result.sessionToken) {

            throw createClientError(
                "LOGIN_RESPONSE_INVALID",
                "เซิร์ฟเวอร์ไม่ได้ส่ง Session ที่ถูกต้องกลับมา"
            );

        }

        saveSession(
            result.sessionToken,
            normalizeBoolean(data.rememberMe)
        );

        STATE.lastUser = result.user || null;

        emit("finora:login-success", result);

        emit("finora:auth-changed", {

            authenticated: true,

            user: result.user || null

        });

        return result;

    }


    async function logout() {

        try {

            if (getSessionToken()) {

                await API.logout();

            }

        } finally {

            clearSession();

        }

        showToast(
            "ออกจากระบบแล้ว",
            "success"
        );

        emit("finora:logout-success", {});

        return {

            success: true

        };

    }


    async function restoreSession() {

        if (!getSessionToken()) {

            emit("finora:session-restored", {

                authenticated: false,

                user: null

            });

            return null;

        }

        return withLoading(
            "กำลังโหลดข้อมูลระบบ",
            async function() {

                try {

                    const result = await API.me();

                    STATE.lastUser = result.user || null;

                    emit("finora:session-restored", {

                        authenticated: true,

                        user: result.user || null

                    });

                    emit("finora:auth-changed", {

                        authenticated: true,

                        user: result.user || null

                    });

                    return result;

                } catch (error) {

                    clearSession();

                    emit("finora:session-restored", {

                        authenticated: false,

                        user: null,

                        error: error.code || "SESSION_INVALID"

                    });

                    return null;

                }

            }
        );

    }


    /* ============================================================
       8. SIGNUP AND EMAIL VERIFICATION
       ============================================================ */

    async function signup(formData) {

        const data = Object.assign({}, formData || {});

        data.prefix = String(data.prefix || "").trim();

        data.fullName = String(data.fullName || "").trim();

        data.birthDate = String(data.birthDate || "").trim();

        data.nationalId = String(
            data.nationalId ||
            data.nationalID ||
            ""
        ).replace(/[\s-]/g, "");

        data.phone = String(data.phone || "")
            .replace(/[\s-]/g, "");

        data.email = normalizeEmail_(data.email);

        data.termsAccepted = normalizeBoolean(
            data.termsAccepted
        );

        data.privacyAccepted = normalizeBoolean(
            data.privacyAccepted
        );

        data.termsVersion = String(
            data.termsVersion ||
            CONFIG.termsVersion ||
            ""
        );

        data.privacyVersion = String(
            data.privacyVersion ||
            CONFIG.privacyVersion ||
            ""
        );

        data.rememberMe = normalizeBoolean(
            data.rememberMe
        );

        if (!validateEmailClient(data.email)) {

            throw createClientError(
                "INVALID_EMAIL",
                "กรุณากรอกอีเมลให้ถูกต้อง"
            );

        }

        if (!validateNationalIdClient(data.nationalId)) {

            throw createClientError(
                "INVALID_NATIONAL_ID",
                "หมายเลขบัตรประชาชนไม่ถูกต้อง กรุณาตรวจสอบอีกครั้ง"
            );

        }

        if (!/^0[0-9]{9}$/.test(data.phone)) {

            throw createClientError(
                "INVALID_PHONE",
                "หมายเลขโทรศัพท์ต้องมี 10 หลัก"
            );

        }

        const passwordRules = validatePasswordClient(
            data.password
        );

        const passwordIsValid = Object.keys(
            passwordRules
        ).every(function(key) {

            return passwordRules[key];

        });

        if (!passwordIsValid) {

            throw createClientError(
                "WEAK_PASSWORD",
                "รหัสผ่านต้องมีอย่างน้อย 12 ตัวอักษร และมีตัวพิมพ์ใหญ่ ตัวพิมพ์เล็ก ตัวเลข และอักขระพิเศษ"
            );

        }

        if (String(data.password) !== String(data.confirmPassword)) {

            throw createClientError(
                "PASSWORD_MISMATCH",
                "รหัสผ่านและการยืนยันรหัสผ่านไม่ตรงกัน"
            );

        }

        if (!data.termsAccepted) {

            throw createClientError(
                "TERMS_NOT_ACCEPTED",
                "กรุณาอ่านและยอมรับข้อกำหนดและเงื่อนไข"
            );

        }

        if (!data.privacyAccepted) {

            throw createClientError(
                "PRIVACY_NOT_ACCEPTED",
                "กรุณารับทราบประกาศความเป็นส่วนตัว"
            );

        }

        if (!data.termsVersion || !data.privacyVersion) {

            throw createClientError(
                "CONSENT_VERSION_MISSING",
                "ไม่พบเวอร์ชันข้อกำหนดหรือประกาศความเป็นส่วนตัว กรุณาตรวจสอบการตั้งค่าเว็บไซต์"
            );

        }

        const googleSignupToken = safeStorageGet(
            window.sessionStorage,
            CONFIG.googleSignupStorageKey
        );

        if (googleSignupToken) {

            data.googleSignupToken = googleSignupToken;

        }

        const result = await API.signup(data);

        if (result.sessionToken) {

            saveSession(
                result.sessionToken,
                data.rememberMe
            );

            safeStorageRemove(
                window.sessionStorage,
                CONFIG.googleSignupStorageKey
            );

            STATE.lastUser = result.user || null;

            emit("finora:signup-success", result);

            emit("finora:login-success", result);

            emit("finora:auth-changed", {

                authenticated: true,

                user: result.user || null

            });

            return result;

        }

        if (result.requiresEmailVerification) {

            if (!result.verificationPollToken) {

                throw createClientError(
                    "VERIFICATION_TOKEN_MISSING",
                    "ไม่พบข้อมูลสำหรับตรวจสอบสถานะยืนยันอีเมล"
                );

            }

            safeStorageSet(
                window.sessionStorage,
                CONFIG.verificationStorageKey,
                result.verificationPollToken
            );

            safeStorageRemove(
                window.sessionStorage,
                CONFIG.googleSignupStorageKey
            );

            emit("finora:verification-required", {

                email: result.email || data.email,

                memberId: result.memberId || "",

                verificationPollToken:
                    result.verificationPollToken

            });

            startEmailVerificationPolling(
                result.verificationPollToken,
                result.email || data.email
            );

            return result;

        }

        emit("finora:signup-success", result);

        return result;

    }


    async function resendVerification(email) {

        const normalized = normalizeEmail_(email);

        if (!validateEmailClient(normalized)) {

            throw createClientError(
                "INVALID_EMAIL",
                "กรุณากรอกอีเมลให้ถูกต้อง"
            );

        }

        return API.resendVerification(normalized);

    }


    function stopEmailVerificationPolling() {

        if (STATE.verificationTimer !== null) {

            window.clearTimeout(
                STATE.verificationTimer
            );

            STATE.verificationTimer = null;

        }

        STATE.verificationPollCount = 0;

    }


    async function startEmailVerificationPolling(
        verificationPollToken,
        email
    ) {

        if (!verificationPollToken) {

            throw createClientError(
                "VERIFICATION_TOKEN_REQUIRED",
                "ไม่พบโทเคนสำหรับติดตามสถานะยืนยันอีเมล"
            );

        }

        stopEmailVerificationPolling();

        const token = String(verificationPollToken);

        const normalizedEmail = normalizeEmail_(email);

        STATE.verificationPollCount = 0;

        emit("finora:verification-polling-started", {

            email: normalizedEmail

        });

        async function checkStatus() {

            STATE.verificationTimer = null;

            if (
                !safeStorageGet(
                    window.sessionStorage,
                    CONFIG.verificationStorageKey
                )
            ) {

                return;

            }

            STATE.verificationPollCount++;

            try {

                const result = await API.checkEmailVerification(
                    token
                );

                if (result.verified === true) {

                    stopEmailVerificationPolling();

                    safeStorageRemove(
                        window.sessionStorage,
                        CONFIG.verificationStorageKey
                    );

                    emit("finora:email-verified", {

                        email: result.email || normalizedEmail,

                        memberId: result.memberId || ""

                    });

                    showToast(
                        "ยืนยันอีเมลสำเร็จ กรุณากลับไปหน้าลงทะเบียน",
                        "success"
                    );

                    return;

                }

            } catch (error) {

                if (
                    error.code === "VERIFICATION_SESSION_EXPIRED"
                ) {

                    stopEmailVerificationPolling();

                    safeStorageRemove(
                        window.sessionStorage,
                        CONFIG.verificationStorageKey
                    );

                    emit("finora:verification-session-expired", {

                        email: normalizedEmail

                    });

                    return;

                }

                emit("finora:verification-poll-error", {

                    message: error.message,

                    code: error.code || "VERIFICATION_POLL_ERROR"

                });

            }

            if (
                STATE.verificationPollCount >=
                CONFIG.verificationMaxPolls
            ) {

                stopEmailVerificationPolling();

                emit("finora:verification-poll-limit", {

                    email: normalizedEmail

                });

                return;

            }

            STATE.verificationTimer = window.setTimeout(
                checkStatus,
                CONFIG.verificationPollIntervalMs
            );

        }

        await checkStatus();

    }


    async function checkEmailVerificationNow() {

        const token = safeStorageGet(
            window.sessionStorage,
            CONFIG.verificationStorageKey
        );

        if (!token) {

            throw createClientError(
                "VERIFICATION_SESSION_MISSING",
                "ไม่พบเซสชันยืนยันอีเมล กรุณาขอลิงก์ยืนยันใหม่"
            );

        }

        const result = await API.checkEmailVerification(token);

        if (result.verified === true) {

            stopEmailVerificationPolling();

            safeStorageRemove(
                window.sessionStorage,
                CONFIG.verificationStorageKey
            );

            emit("finora:email-verified", {

                email: result.email || "",

                memberId: result.memberId || ""

            });

        }

        return result;

    }


    /* ============================================================
       9. FORGOT PASSWORD AND RESET PASSWORD
       ============================================================ */

    async function forgotPassword(email) {

        const normalized = normalizeEmail_(email);

        if (!validateEmailClient(normalized)) {

            throw createClientError(
                "INVALID_EMAIL",
                "กรุณากรอกอีเมลให้ถูกต้อง"
            );

        }

        return API.forgotPassword(normalized);

    }


    function getResetToken() {

        const params = new URLSearchParams(
            window.location.search
        );

        const queryToken = params.get("token");

        if (queryToken) {

            safeStorageSet(
                window.sessionStorage,
                CONFIG.resetTokenStorageKey,
                queryToken
            );

            return queryToken;

        }

        return safeStorageGet(
            window.sessionStorage,
            CONFIG.resetTokenStorageKey
        );

    }


    async function resetPassword(data) {

        const token = String(
            data.token || getResetToken() || ""
        );

        const password = String(
            data.newPassword ||
            data.password ||
            ""
        );

        const confirmPassword = String(
            data.confirmPassword || ""
        );

        if (!token) {

            throw createClientError(
                "RESET_TOKEN_REQUIRED",
                "ไม่พบลิงก์รีเซ็ตรหัสผ่าน กรุณาขอลิงก์ใหม่"
            );

        }

        const rules = validatePasswordClient(password);

        if (!Object.keys(rules).every(function(key) {
            return rules[key];
        })) {

            throw createClientError(
                "WEAK_PASSWORD",
                "รหัสผ่านใหม่ต้องมีอย่างน้อย 12 ตัวอักษร และมีตัวพิมพ์ใหญ่ ตัวพิมพ์เล็ก ตัวเลข และอักขระพิเศษ"
            );

        }

        if (password !== confirmPassword) {

            throw createClientError(
                "PASSWORD_MISMATCH",
                "รหัสผ่านใหม่ทั้งสองช่องไม่ตรงกัน"
            );

        }

        const result = await API.resetPassword({

            token: token,

            newPassword: password,

            confirmPassword: confirmPassword

        });

        safeStorageRemove(
            window.sessionStorage,
            CONFIG.resetTokenStorageKey
        );

        emit("finora:password-reset-success", result);

        return result;

    }


    /* ============================================================
       10. GOOGLE SIGN-IN
       ============================================================ */

    function getRememberMeValue() {

        const field = document.querySelector(
            '[name="rememberMe"], #rememberMe'
        );

        return Boolean(
            field &&
            field.type === "checkbox" &&
            field.checked
        );

    }


    async function processGoogleCredential(
        credentialResponse,
        intent
    ) {

        const idToken = String(
            credentialResponse &&
            credentialResponse.credential
                ? credentialResponse.credential
                : ""
        );

        if (!idToken) {

            throw createClientError(
                "GOOGLE_CREDENTIAL_MISSING",
                "Google ไม่ได้ส่งข้อมูลยืนยันตัวตนกลับมา"
            );

        }

        const activeIntent = intent ||
            STATE.googleIntent ||
            "login";

        if (activeIntent === "link") {

            const linked = await API.linkGoogle(idToken);

            emit("finora:google-linked", linked);

            showToast(
                "ผูกบัญชี Google สำเร็จ",
                "success"
            );

            return linked;

        }

        const result = await API.googleStart(
            idToken,
            getRememberMeValue()
        );

        if (result.status === "LOGIN_SUCCESS") {

            if (!result.sessionToken) {

                throw createClientError(
                    "GOOGLE_SESSION_MISSING",
                    "ไม่พบเซสชันหลังยืนยันตัวตน Google"
                );

            }

            saveSession(
                result.sessionToken,
                getRememberMeValue()
            );

            STATE.lastUser = result.user || null;

            emit("finora:login-success", result);

            emit("finora:auth-changed", {

                authenticated: true,

                user: result.user || null

            });

            return result;

        }

        if (result.status === "SIGNUP_REQUIRED") {

            safeStorageSet(
                window.sessionStorage,
                CONFIG.googleSignupStorageKey,
                result.googleSignupToken
            );

            emit("finora:google-signup-required", {

                googleSignupToken: result.googleSignupToken,

                profile: result.profile || {}

            });

            return result;

        }

        if (result.status === "ACCOUNT_EXISTS") {

            emit("finora:google-account-exists", {

                email: result.email || "",

                message: result.message || ""

            });

            showToast(
                result.message ||
                "อีเมลนี้มีบัญชีอยู่แล้ว กรุณาเข้าสู่ระบบด้วยบัญชีเดิม",
                "warning",
                7000
            );

            return result;

        }

        throw createClientError(
            "GOOGLE_LOGIN_STATUS_UNKNOWN",
            "ระบบได้รับสถานะการเข้าสู่ระบบด้วย Google ที่ไม่รู้จัก"
        );

    }


    function initializeGoogleIdentity() {

        if (!CONFIG.googleClientId) {

            emit("finora:google-config-missing", {});

            return;

        }

        const containers = Array.from(
            document.querySelectorAll(
                "[data-finora-google-button], #googleSignInButton"
            )
        );

        if (!containers.length) {
            return;
        }

        if (
            !window.google ||
            !window.google.accounts ||
            !window.google.accounts.id
        ) {

            if (STATE.googleScriptLoading) {
                return;
            }

            STATE.googleScriptLoading = true;

            const existingScript = document.querySelector(
                'script[src^="https://accounts.google.com/gsi/client"]'
            );

            if (existingScript) {

                existingScript.addEventListener(
                    "load",
                    initializeGoogleIdentity,
                    { once: true }
                );

                existingScript.addEventListener(
                    "error",
                    function() {

                        STATE.googleScriptLoading = false;

                        emit("finora:google-load-error", {});

                    },
                    { once: true }
                );

                return;

            }

            const script = document.createElement("script");

            script.src = "https://accounts.google.com/gsi/client";

            script.async = true;

            script.defer = true;

            script.onload = function() {

                STATE.googleScriptLoading = false;

                initializeGoogleIdentity();

            };

            script.onerror = function() {

                STATE.googleScriptLoading = false;

                emit("finora:google-load-error", {});

                showToast(
                    "ไม่สามารถโหลดบริการเข้าสู่ระบบ Google ได้",
                    "error"
                );

            };

            document.head.appendChild(script);

            return;

        }

        if (!STATE.googleInitialized) {

            window.google.accounts.id.initialize({

                client_id: CONFIG.googleClientId,

                callback: function(response) {

                    processGoogleCredential(
                        response,
                        STATE.googleIntent
                    ).catch(function(error) {

                        showToast(
                            error.message,
                            "error"
                        );

                        emit("finora:google-login-error", {

                            code: error.code || "GOOGLE_ERROR",

                            message: error.message

                        });

                    });

                },

                auto_select: false,

                cancel_on_tap_outside: true

            });

            STATE.googleInitialized = true;

        }

        containers.forEach(function(container) {

            if (STATE.googleButtonsRendered.has(container)) {
                return;
            }

            if (container.dataset.googleRendered === "true") {
                STATE.googleButtonsRendered.add(container);
                return;
            }

            const width = Math.max(
                200,
                Math.min(
                    360,
                    Math.floor(
                        container.getBoundingClientRect().width || 280
                    )
                )
            );

            try {

                window.google.accounts.id.renderButton(
                    container,
                    {

                        type: "standard",

                        theme: "outline",

                        size: "large",

                        text: "continue_with",

                        shape: "rectangular",

                        width: width,

                        locale: "th"

                    }
                );

                container.dataset.googleRendered = "true";

                STATE.googleButtonsRendered.add(container);

            } catch (error) {

                emit("finora:google-button-render-error", {

                    message: error.message

                });

            }

        });

    }


    function requestGoogleLink() {

        if (!SESSION.exists()) {

            showToast(
                "กรุณาเข้าสู่ระบบก่อนผูกบัญชี Google",
                "warning"
            );

            return;

        }

        if (!window.google ||
            !window.google.accounts ||
            !window.google.accounts.id
        ) {

            showToast(
                "บริการ Google ยังไม่พร้อมใช้งาน",
                "warning"
            );

            return;

        }

        STATE.googleIntent = "link";

        /*
         * แสดงการยืนยันด้วย Google One Tap
         * หาก Google ไม่แสดงหน้าต่าง ให้ใช้ปุ่ม Google ที่แสดงในหน้าเว็บ
         */
        window.google.accounts.id.prompt(function(notification) {

            if (
                notification &&
                typeof notification.isNotDisplayed === "function" &&
                notification.isNotDisplayed()
            ) {

                emit("finora:google-link-prompt-unavailable", {});

            }

        });

    }


    /* ============================================================
       11. MEMBER AND ADMIN ACTION HELPERS
       ============================================================ */

    async function getDashboard() {

        const result = await API.getDashboard();

        emit("finora:dashboard-loaded", result);

        return result;

    }


    async function getPublicAnnouncements(placement) {

        const result = await API.getPublicAnnouncements(
            placement || "LOGIN_SIGNUP"
        );

        STATE.announcementCache = result.announcements || [];

        emit("finora:announcements-loaded", {

            placement: placement || "LOGIN_SIGNUP",

            announcements: STATE.announcementCache

        });

        return result;

    }


    async function getProducts() {

        const result = await API.getPublicProducts();

        emit("finora:products-loaded", result);

        return result;

    }


    async function createRepaymentQR(loanId) {

        if (!loanId) {

            throw createClientError(
                "LOAN_ID_REQUIRED",
                "ไม่พบเลขที่บัญชีสินเชื่อ"
            );

        }

        const result = await API.createRepaymentQR(
            loanId
        );

        emit("finora:repayment-qr-created", result);

        return result;

    }


    function readFileAsBase64(file) {

        return new Promise(function(resolve, reject) {

            if (!file) {

                reject(
                    createClientError(
                        "FILE_REQUIRED",
                        "กรุณาเลือกไฟล์"
                    )
                );

                return;

            }

            const reader = new FileReader();

            reader.onload = function() {

                const result = String(reader.result || "");

                const commaIndex = result.indexOf(",");

                if (commaIndex < 0) {

                    reject(
                        createClientError(
                            "FILE_ENCODING_FAILED",
                            "ไม่สามารถอ่านไฟล์ได้"
                        )
                    );

                    return;

                }

                resolve({

                    base64: result.slice(commaIndex + 1),

                    dataUrl: result,

                    mimeType: file.type,

                    fileName: file.name,

                    size: file.size

                });

            };

            reader.onerror = function() {

                reject(
                    createClientError(
                        "FILE_READ_FAILED",
                        "ไม่สามารถอ่านไฟล์ได้"
                    )
                );

            };

            reader.readAsDataURL(file);

        });

    }


    function validateImageFile(file, allowedTypes, maxBytes) {

        if (!file) {

            throw createClientError(
                "FILE_REQUIRED",
                "กรุณาเลือกไฟล์"
            );

        }

        if (allowedTypes.indexOf(file.type) === -1) {

            throw createClientError(
                "INVALID_FILE_TYPE",
                "ชนิดไฟล์ไม่รองรับ"
            );

        }

        if (file.size > maxBytes) {

            throw createClientError(
                "FILE_TOO_LARGE",
                "ไฟล์มีขนาดเกินกว่าที่ระบบอนุญาต"
            );

        }

        if (file.size <= 0) {

            throw createClientError(
                "EMPTY_FILE",
                "ไฟล์ว่างเปล่า"
            );

        }

        return true;

    }


    async function uploadAnnouncementImage(file) {

        validateImageFile(

            file,

            [
                "image/jpeg",
                "image/png",
                "image/webp",
                "image/gif"
            ],

            CONFIG.maxPublicImageBytes

        );

        const image = await readFileAsBase64(file);

        const result = await API.adminUploadImage({

            base64: image.base64,

            mimeType: image.mimeType,

            fileName: image.fileName

        });

        emit("finora:image-uploaded", result);

        return result;

    }


    async function submitSlipFile(repaymentId, file) {

        validateImageFile(

            file,

            [
                "image/jpeg",
                "image/png",
                "image/webp",
                "image/gif"
            ],

            CONFIG.maxSlipImageBytes

        );

        const image = await readFileAsBase64(file);

        const result = await API.submitRepaymentSlip({

            repaymentId: repaymentId,

            imageBase64: image.base64,

            mimeType: image.mimeType

        });

        emit("finora:repayment-slip-result", result);

        return result;

    }


    /* ============================================================
       12. SAFE ANNOUNCEMENT RENDERER
       ============================================================ */

    function sanitizeAnnouncementHtmlClient(input) {

        const source = String(input || "");

        const template = document.createElement("template");

        template.innerHTML = source;

        const allowedTags = new Set([

            "P",
            "BR",
            "STRONG",
            "B",
            "EM",
            "I",
            "U",
            "UL",
            "OL",
            "LI",
            "H1",
            "H2",
            "H3",
            "H4",
            "H5",
            "H6",
            "BLOCKQUOTE",
            "A",
            "SPAN",
            "DIV"

        ]);

        function cleanNode(node) {

            Array.from(node.childNodes).forEach(function(child) {

                if (child.nodeType === Node.COMMENT_NODE) {

                    child.remove();

                    return;

                }

                if (child.nodeType !== Node.ELEMENT_NODE) {

                    return;

                }

                if (!allowedTags.has(child.tagName)) {

                    const replacement = document.createTextNode(
                        child.textContent || ""
                    );

                    child.replaceWith(replacement);

                    return;

                }

                Array.from(child.attributes).forEach(function(attribute) {

                    child.removeAttribute(attribute.name);

                });

                if (child.tagName === "A") {

                    /*
                     * ลิงก์ต้องเป็น HTTPS เท่านั้น
                     * ป้องกัน javascript:, data: และ URL ที่เป็นอันตราย
                     */
                    const originalLink = child.getAttribute("href");

                    if (originalLink) {

                        try {

                            const url = new URL(
                                originalLink,
                                window.location.href
                            );

                            if (url.protocol === "https:") {

                                child.setAttribute(
                                    "href",
                                    url.href
                                );

                                child.setAttribute(
                                    "target",
                                    "_blank"
                                );

                                child.setAttribute(
                                    "rel",
                                    "noopener noreferrer"
                                );

                            }

                        } catch (error) {

                            child.removeAttribute("href");

                        }

                    }

                }

                cleanNode(child);

            });

        }

        cleanNode(template.content);

        return template.content;

    }


    function renderAnnouncements(container, announcements) {

        if (!container) {
            return;
        }

        const items = Array.isArray(announcements)
            ? announcements
            : [];

        const fragment = document.createDocumentFragment();

        items.forEach(function(item) {

            const card = document.createElement("article");

            card.className = "finora-announcement";

            card.dataset.announcementId =
                String(item.announcementId || "");

            if (item.title) {

                const title = document.createElement("h3");

                title.className = "finora-announcement-title";

                title.textContent = String(item.title);

                card.appendChild(title);

            }

            if (item.imageUrl) {

                try {

                    const imageUrl = new URL(
                        item.imageUrl,
                        window.location.href
                    );

                    if (imageUrl.protocol === "https:") {

                        const image = document.createElement("img");

                        image.className = "finora-announcement-image";

                        image.src = imageUrl.href;

                        image.alt = String(item.imageAlt || "");

                        image.loading = "lazy";

                        image.decoding = "async";

                        card.appendChild(image);

                    }

                } catch (error) {

                    // Ignore invalid announcement image URLs.
                }

            }

            if (item.contentHtml) {

                const content = document.createElement("div");

                content.className = "finora-announcement-content";

                content.appendChild(
                    sanitizeAnnouncementHtmlClient(
                        item.contentHtml
                    )
                );

                card.appendChild(content);

            }

            fragment.appendChild(card);

        });

        container.replaceChildren(fragment);

        emit("finora:announcements-rendered", {

            count: items.length

        });

    }


    /* ============================================================
       13. FORM SUBMISSION HELPERS
       ============================================================ */

    function disableFormSubmit(form, disabled) {

        const buttons = form.querySelectorAll(
            'button[type="submit"], input[type="submit"], [data-finora-submit]'
        );

        buttons.forEach(function(button) {

            button.disabled = Boolean(disabled);

            if (disabled) {

                button.setAttribute(
                    "aria-busy",
                    "true"
                );

            } else {

                button.removeAttribute("aria-busy");

            }

        });

    }


    async function executeForm(form, message, callback) {

        if (form.dataset.finoraSubmitting === "true") {
            return;
        }

        form.dataset.finoraSubmitting = "true";

        disableFormSubmit(form, true);

        try {

            const result = await withLoading(
                message,
                callback
            );

            return result;

        } catch (error) {

            const messageText = error && error.message
                ? error.message
                : "ระบบไม่สามารถดำเนินการได้ กรุณาลองใหม่";

            showToast(
                messageText,
                "error",
                6500
            );

            emit("finora:form-error", {

                form: form.dataset.finoraForm || form.id || "",

                code: error.code || "FORM_ERROR",

                message: messageText

            });

            throw error;

        } finally {

            form.dataset.finoraSubmitting = "false";

            disableFormSubmit(form, false);

        }

    }


    function getFormElements(selector) {

        return Array.from(
            document.querySelectorAll(selector)
        );

    }


    function bindLoginForms() {

        const forms = getFormElements(
            'form[data-finora-form="login"], #loginForm'
        );

        forms.forEach(function(form) {

            if (form.dataset.finoraBound === "true") {
                return;
            }

            form.dataset.finoraBound = "true";

            form.addEventListener("submit", async function(event) {

                event.preventDefault();

                const values = collectFormData(form);

                const identifier = String(
                    getFieldValue(
                        form,
                        [
                            "identifier",
                            "usernameOrEmail",
                            "username",
                            "email"
                        ],
                        ""
                    )
                ).trim();

                const password = String(
                    getFieldValue(
                        form,
                        ["password"],
                        ""
                    )
                );

                const rememberMe = normalizeBoolean(
                    getFieldValue(
                        form,
                        ["rememberMe"],
                        false
                    )
                );

                try {

                    await executeForm(
                        form,
                        "กำลังเข้าสู่ระบบ",
                        async function() {

                            const result = await login({

                                identifier: identifier,

                                password: password,

                                rememberMe: rememberMe

                            });

                            showToast(
                                "เข้าสู่ระบบสำเร็จ",
                                "success"
                            );

                            return result;

                        }
                    );

                } catch (error) {

                    // Error message is shown by executeForm.
                }

            });

        });

    }


    function bindSignupForms() {

        const forms = getFormElements(
            'form[data-finora-form="signup"], #signupForm'
        );

        forms.forEach(function(form) {

            if (form.dataset.finoraBound === "true") {
                return;
            }

            form.dataset.finoraBound = "true";

            form.addEventListener("submit", async function(event) {

                event.preventDefault();

                const values = collectFormData(form);

                values.prefix = getFieldValue(
                    form,
                    ["prefix"],
                    values.prefix
                );

                values.fullName = getFieldValue(
                    form,
                    ["fullName"],
                    values.fullName
                );

                values.birthDate = getFieldValue(
                    form,
                    ["birthDate"],
                    values.birthDate
                );

                values.nationalId = getFieldValue(
                    form,
                    ["nationalId", "nationalID"],
                    values.nationalId
                );

                values.phone = getFieldValue(
                    form,
                    ["phone"],
                    values.phone
                );

                values.email = getFieldValue(
                    form,
                    ["email"],
                    values.email
                );

                values.password = getFieldValue(
                    form,
                    ["password"],
                    values.password
                );

                values.confirmPassword = getFieldValue(
                    form,
                    ["confirmPassword"],
                    values.confirmPassword
                );

                values.termsAccepted = normalizeBoolean(
                    getFieldValue(
                        form,
                        ["termsAccepted"],
                        values.termsAccepted
                    )
                );

                values.privacyAccepted = normalizeBoolean(
                    getFieldValue(
                        form,
                        ["privacyAccepted"],
                        values.privacyAccepted
                    )
                );

                values.termsVersion =
                    CONFIG.termsVersion ||
                    values.termsVersion ||
                    "";

                values.privacyVersion =
                    CONFIG.privacyVersion ||
                    values.privacyVersion ||
                    "";

                values.rememberMe = normalizeBoolean(
                    getFieldValue(
                        form,
                        ["rememberMe"],
                        false
                    )
                );

                try {

                    const result = await executeForm(
                        form,
                        "กำลังสร้างบัญชี FINORA",
                        async function() {

                            return signup(values);

                        }
                    );

                    if (result.requiresEmailVerification) {

                        showToast(
                            "ส่งลิงก์ยืนยันอีเมลแล้ว กรุณาตรวจสอบกล่องจดหมาย",
                            "success",
                            6500
                        );

                    }

                } catch (error) {

                    // Error message is shown by executeForm.
                }

            });

        });

    }


    function bindForgotPasswordForms() {

        const forms = getFormElements(
            'form[data-finora-form="forgot-password"], #forgotPasswordForm'
        );

        forms.forEach(function(form) {

            if (form.dataset.finoraBound === "true") {
                return;
            }

            form.dataset.finoraBound = "true";

            form.addEventListener("submit", async function(event) {

                event.preventDefault();

                const email = String(
                    getFieldValue(
                        form,
                        ["email"],
                        ""
                    )
                ).trim();

                try {

                    await executeForm(
                        form,
                        "กำลังส่งคำขอรีเซ็ตรหัสผ่าน",
                        async function() {

                            const result = await forgotPassword(email);

                            emit("finora:password-reset-email-requested", {

                                email: normalizeEmail_(email),

                                result: result

                            });

                            showToast(
                                result.message ||
                                "หากอีเมลนี้มีบัญชี FINORA ระบบจะส่งลิงก์รีเซ็ตรหัสผ่านให้",
                                "success",
                                6500
                            );

                            return result;

                        }
                    );

                } catch (error) {

                    // Error message is shown by executeForm.
                }

            });

        });

    }


    function bindResetPasswordForms() {

        const forms = getFormElements(
            'form[data-finora-form="reset-password"], #resetPasswordForm'
        );

        forms.forEach(function(form) {

            if (form.dataset.finoraBound === "true") {
                return;
            }

            form.dataset.finoraBound = "true";

            form.addEventListener("submit", async function(event) {

                event.preventDefault();

                const newPassword = String(
                    getFieldValue(
                        form,
                        ["newPassword", "password"],
                        ""
                    )
                );

                const confirmPassword = String(
                    getFieldValue(
                        form,
                        ["confirmPassword"],
                        ""
                    )
                );

                try {

                    await executeForm(
                        form,
                        "กำลังเปลี่ยนรหัสผ่าน",
                        async function() {

                            const result = await resetPassword({

                                token: getResetToken(),

                                newPassword: newPassword,

                                confirmPassword: confirmPassword

                            });

                            showToast(
                                "เปลี่ยนรหัสผ่านสำเร็จ กรุณาเข้าสู่ระบบใหม่",
                                "success",
                                6500
                            );

                            emit(
                                "finora:reset-view-complete",
                                result
                            );

                            return result;

                        }
                    );

                } catch (error) {

                    // Error message is shown by executeForm.
                }

            });

        });

    }


    /* ============================================================
       14. PASSWORD EYE TOGGLE AND PASSWORD STRENGTH
       ============================================================ */

    function bindPasswordVisibility() {

        document.addEventListener("click", function(event) {

            const button = event.target.closest(
                "[data-finora-toggle-password]"
            );

            if (!button) {
                return;
            }

            event.preventDefault();

            const targetSelector = button.dataset.target;

            let input = null;

            if (targetSelector) {

                try {

                    input = document.querySelector(
                        targetSelector
                    );

                } catch (error) {

                    input = null;

                }

            }

            if (!input && button.dataset.inputId) {

                input = document.getElementById(
                    button.dataset.inputId
                );

            }

            if (
                !input &&
                button.parentElement
            ) {

                input = button.parentElement.querySelector(
                    'input[type="password"], input[type="text"]'
                );

            }

            if (!input) {
                return;
            }

            const showPassword = input.type === "password";

            input.type = showPassword
                ? "text"
                : "password";

            button.setAttribute(
                "aria-pressed",
                String(showPassword)
            );

            button.setAttribute(
                "aria-label",
                showPassword
                    ? "ซ่อนรหัสผ่าน"
                    : "แสดงรหัสผ่าน"
            );

            emit("finora:password-visibility-changed", {

                visible: showPassword

            });

        });

    }


    function renderPasswordStrength(form) {

        const passwordField = findField(
            form,
            ["password", "newPassword"]
        );

        if (!passwordField) {
            return;
        }

        const target = form.querySelector(
            "[data-finora-password-strength]"
        );

        const meter = form.querySelector(
            "[data-finora-password-meter]"
        );

        const fill = form.querySelector(
            "[data-finora-password-meter-fill]"
        );

        const value = passwordField.value || "";

        const strength = getPasswordStrength(value);

        if (target) {

            target.textContent = value
                ? strength.label
                : "กรอกรหัสผ่านเพื่อประเมินความปลอดภัย";

            target.dataset.strength = String(
                strength.score
            );

        }

        if (meter) {

            meter.setAttribute(
                "aria-valuenow",
                String(strength.score)
            );

            meter.setAttribute(
                "aria-valuemin",
                "0"
            );

            meter.setAttribute(
                "aria-valuemax",
                "5"
            );

        }

        if (fill) {

            fill.style.width =
                String(strength.score * 20) + "%";

            fill.dataset.strength = String(
                strength.score
            );

        }

        Object.keys(strength.rules).forEach(function(rule) {

            const targetRule = form.querySelector(
                '[data-finora-password-rule="' + rule + '"]'
            );

            if (!targetRule) {
                return;
            }

            targetRule.dataset.valid = String(
                strength.rules[rule]
            );

            targetRule.setAttribute(
                "aria-checked",
                String(strength.rules[rule])
            );

        });

    }


    function bindPasswordFeedback() {

        document.addEventListener("input", function(event) {

            const field = event.target;

            if (!field || !field.form) {
                return;
            }

            if (
                field.name === "password" ||
                field.name === "newPassword"
            ) {

                renderPasswordStrength(field.form);

            }

            if (
                field.name === "confirmPassword" ||
                field.name === "password"
            ) {

                updatePasswordConfirmation(field.form);

            }

        });

        getFormElements("form").forEach(function(form) {

            renderPasswordStrength(form);

            updatePasswordConfirmation(form);

        });

    }


    function updatePasswordConfirmation(form) {

        const passwordField = findField(
            form,
            ["password", "newPassword"]
        );

        const confirmField = findField(
            form,
            ["confirmPassword"]
        );

        const feedback = form.querySelector(
            "[data-finora-password-match]"
        );

        if (!confirmField) {
            return;
        }

        const hasConfirmValue = Boolean(
            confirmField.value
        );

        const matches = Boolean(
            passwordField &&
            hasConfirmValue &&
            passwordField.value === confirmField.value
        );

        confirmField.setAttribute(
            "aria-invalid",
            String(
                hasConfirmValue &&
                !matches
            )
        );

        if (feedback) {

            feedback.textContent = !hasConfirmValue
                ? ""
                : matches
                    ? "รหัสผ่านตรงกัน"
                    : "รหัสผ่านไม่ตรงกัน";

            feedback.dataset.match = String(matches);

        }

    }


    /* ============================================================
       15. DELEGATED BUTTON ACTIONS
       ============================================================ */

    function bindActionButtons() {

        document.addEventListener("click", async function(event) {

            const button = event.target.closest(
                "[data-finora-action]"
            );

            if (!button) {
                return;
            }

            const action = button.dataset.finoraAction;

            if (!action) {
                return;
            }

            if (action === "logout") {

                event.preventDefault();

                if (button.disabled) {
                    return;
                }

                button.disabled = true;

                try {

                    await withLoading(
                        "กำลังออกจากระบบ",
                        logout
                    );

                } catch (error) {

                    showToast(
                        error.message,
                        "error"
                    );

                } finally {

                    button.disabled = false;

                }

                return;

            }

            if (action === "reload-dashboard") {

                event.preventDefault();

                try {

                    await withLoading(
                        "กำลังโหลดข้อมูลระบบ",
                        getDashboard
                    );

                } catch (error) {

                    showToast(
                        error.message,
                        "error"
                    );

                }

                return;

            }

            if (action === "check-email-verification") {

                event.preventDefault();

                try {

                    const result = await withLoading(
                        "กำลังตรวจสอบสถานะอีเมล",
                        checkEmailVerificationNow
                    );

                    if (result.verified) {

                        showToast(
                            "ยืนยันอีเมลสำเร็จ กรุณากลับไปหน้าลงทะเบียน",
                            "success"
                        );

                    } else {

                        showToast(
                            "ยังไม่ได้ยืนยันอีเมล กรุณากดลิงก์ในอีเมลของคุณ",
                            "warning"
                        );

                    }

                } catch (error) {

                    showToast(
                        error.message,
                        "error"
                    );

                }

                return;

            }

            if (action === "resend-verification") {

                event.preventDefault();

                const emailField = document.querySelector(
                    '[name="email"], #email'
                );

                const email = emailField
                    ? emailField.value
                    : "";

                try {

                    const result = await withLoading(
                        "กำลังส่งลิงก์ยืนยันอีเมล",
                        function() {
                            return resendVerification(email);
                        }
                    );

                    showToast(
                        result.message ||
                        "ระบบได้รับคำขอแล้ว หากจำเป็นจะส่งอีเมลให้",
                        "success",
                        6500
                    );

                } catch (error) {

                    showToast(
                        error.message,
                        "error"
                    );

                }

                return;

            }

            if (action === "google-link") {

                event.preventDefault();

                requestGoogleLink();

                return;

            }

        });

    }


    /* ============================================================
       16. RESET AND VERIFICATION DEEP LINKS
       ============================================================ */

    function processPageQuery() {

        const params = new URLSearchParams(
            window.location.search
        );

        const emailVerified = params.get("emailVerified");

        if (emailVerified === "success") {

            showToast(
                "ยืนยันอีเมลสำเร็จ กรุณากลับไปหน้าลงทะเบียน",
                "success",
                7000
            );

            emit("finora:email-confirmed-return", {

                success: true

            });

        }

        const action = params.get("action");

        const resetToken = params.get("token");

        if (
            (action === "reset" || resetToken) &&
            resetToken
        ) {

            safeStorageSet(
                window.sessionStorage,
                CONFIG.resetTokenStorageKey,
                resetToken
            );

            emit("finora:reset-password-link", {

                token: resetToken

            });

        }

    }


    /* ============================================================
       17. RESUME EMAIL VERIFICATION
       ============================================================ */

    function resumeEmailVerification() {

        const token = safeStorageGet(
            window.sessionStorage,
            CONFIG.verificationStorageKey
        );

        if (!token) {
            return;
        }

        startEmailVerificationPolling(
            token,
            ""
        ).catch(function(error) {

            emit("finora:verification-poll-error", {

                code: error.code || "VERIFICATION_POLL_ERROR",

                message: error.message

            });

        });

    }


    /* ============================================================
       18. GOOGLE SIGNUP PROFILE PREFILL
       ============================================================ */

    function fillGoogleSignupProfile(profile) {

        const data = profile || {};

        const nameField = document.querySelector(
            '#signupForm [name="fullName"], ' +
            '[data-finora-form="signup"] [name="fullName"]'
        );

        const emailField = document.querySelector(
            '#signupForm [name="email"], ' +
            '[data-finora-form="signup"] [name="email"]'
        );

        const displayName = document.querySelector(
            "[data-finora-google-profile-name]"
        );

        const displayEmail = document.querySelector(
            "[data-finora-google-profile-email]"
        );

        if (nameField && !nameField.value) {

            nameField.value = String(data.name || "");

            nameField.dispatchEvent(
                new Event("input", { bubbles: true })
            );

        }

        if (emailField) {

            emailField.value = String(data.email || "");

            emailField.readOnly = true;

            emailField.setAttribute(
                "aria-readonly",
                "true"
            );

            emailField.dispatchEvent(
                new Event("input", { bubbles: true })
            );

        }

        if (displayName) {

            displayName.textContent = String(
                data.name || ""
            );

        }

        if (displayEmail) {

            displayEmail.textContent = String(
                data.email || ""
            );

        }

        emit("finora:google-profile-filled", {

            name: String(data.name || ""),

            email: String(data.email || "")

        });

    }


    /* ============================================================
       19. GLOBAL EVENT INTEGRATION
       ============================================================ */

    function bindGlobalEvents() {

        window.addEventListener(
            "finora:show-google-signup",
            function(event) {

                fillGoogleSignupProfile(
                    event.detail || {}
                );

            }
        );

        window.addEventListener(
            "finora:google-signup-required",
            function(event) {

                const detail = event.detail || {};

                fillGoogleSignupProfile(
                    detail.profile || {}
                );

            }
        );

        window.addEventListener(
            "finora:show-view",
            function() {

                initializeGoogleIdentity();

                bindAllForms();

            }
        );

    }


    /* ============================================================
       20. FORM BINDING REFRESH
       ============================================================ */

    function bindAllForms() {

        bindLoginForms();

        bindSignupForms();

        bindForgotPasswordForms();

        bindResetPasswordForms();

        bindPasswordFeedback();

    }


    /* ============================================================
       21. PUBLIC API EXPORTED TO index.html
       ============================================================ */

    const FINORA = {

        version: "1.0.0",

        config: {

            apiUrl: CONFIG.apiUrl,

            googleClientIdConfigured:
                Boolean(CONFIG.googleClientId),

            termsVersion: CONFIG.termsVersion,

            privacyVersion: CONFIG.privacyVersion

        },

        api: API,

        session: SESSION,

        request: requestApi,

        login: login,

        logout: logout,

        restoreSession: restoreSession,

        signup: signup,

        resendVerification: resendVerification,

        checkEmailVerification: checkEmailVerificationNow,

        startEmailVerificationPolling:
            startEmailVerificationPolling,

        stopEmailVerificationPolling:
            stopEmailVerificationPolling,

        forgotPassword: forgotPassword,

        resetPassword: resetPassword,

        processGoogleCredential:
            processGoogleCredential,

        initializeGoogleIdentity:
            initializeGoogleIdentity,

        requestGoogleLink:
            requestGoogleLink,

        getDashboard: getDashboard,

        getPublicAnnouncements: getPublicAnnouncements,

        getProducts: getProducts,

        createRepaymentQR: createRepaymentQR,

        uploadAnnouncementImage: uploadAnnouncementImage,

        submitSlipFile: submitSlipFile,

        renderAnnouncements: renderAnnouncements,

        showToast: showToast,

        showLoading: showLoading,

        hideLoading: hideLoading,

        withLoading: withLoading,

        emit: emit,

        validateEmail: validateEmailClient,

        validateNationalId: validateNationalIdClient,

        validatePassword: validatePasswordClient,

        getPasswordStrength: getPasswordStrength,

        getResetToken: getResetToken,

        fillGoogleSignupProfile: fillGoogleSignupProfile

    };


    window.FINORA = FINORA;


    /* ============================================================
       22. INITIALIZATION
       ============================================================ */

    function initialize() {

        if (STATE.initialized) {
            return;
        }

        STATE.initialized = true;

        injectFeedbackStyles();

        bindAllForms();

        bindPasswordVisibility();

        bindActionButtons();

        bindGlobalEvents();

        processPageQuery();

        resumeEmailVerification();

        initializeGoogleIdentity();

        /*
         * เมื่อเปิดเว็บใหม่และมี Session ที่บันทึกไว้
         * จะตรวจสอบ Session ผ่าน API จริง ไม่เชื่อ token จากเบราว์เซอร์เอง
         */
        restoreSession().catch(function(error) {

            emit("finora:session-restore-error", {

                code: error.code || "SESSION_RESTORE_ERROR",

                message: error.message

            });

        });

        emit("finora:ready", {

            version: FINORA.version,

            apiConfigured: Boolean(CONFIG.apiUrl),

            googleConfigured: Boolean(CONFIG.googleClientId)

        });

    }


    if (document.readyState === "loading") {

        document.addEventListener(
            "DOMContentLoaded",
            initialize,
            { once: true }
        );

    } else {

        initialize();

    }


})();
