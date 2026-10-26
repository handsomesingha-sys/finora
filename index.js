/*
 * ============================================================================
 * FINORA — Main JavaScript Client
 * ============================================================================
 *
 * File: index.js
 * Hosting: GitHub Pages
 * Backend: Supabase
 * Supabase SDK: @supabase/supabase-js 2.118.0
 *
 * Main features:
 *   1. Safe Supabase SDK loading with CDN fallback
 *   2. Bounded network requests and initialization timeouts
 *   3. Authentication and session management
 *   4. Registration, email verification, and password recovery
 *   5. Profile viewing and editing
 *   6. Published legal documents and consent records
 *   7. Active loan products
 *   8. Loan applications and pagination
 *   9. Private document uploads and downloads
 *  10. Loan accounts, repayments, and payments
 *  11. Public announcements
 *  12. Customer support tickets
 *  13. Staff dashboard queries governed by database RLS
 *  14. HTML integration helpers
 *
 * SECURITY:
 *   - Uses only the public Supabase Publishable key.
 *   - Never contains service_role or secret keys.
 *   - Does not grant roles or bypass database RLS.
 *   - Does not create fake users, loan products, announcements, or payments.
 *   - Sensitive authorization decisions must be enforced by the backend.
 *
 * IMPORTANT FOR index.html:
 *   - Load this file as a script.
 *   - Wait for FINORA.ready or FINORA.initialize() before running code that
 *     directly accesses FINORA.supabase.
 *   - The FINORA.supabase facade supports queued onAuthStateChange listeners
 *     while the Supabase client is still loading.
 * ============================================================================
 */

(() => {
    "use strict";

    /* ========================================================================
       1. CONFIGURATION
       ======================================================================== */

    const FINORA_CONFIG = Object.freeze({
        appName: "FINORA",

        appUrl: "https://handsomesingha-sys.github.io/finora/",

        supabaseUrl: "https://yahqufirtnfjoqpuxvay.supabase.co",

        /*
         * This is a public Publishable key intended for browser use.
         * Database Row Level Security must remain enabled.
         */
        supabaseKey: "sb_publishable_uWZgTPghOBs36zD0xT5dYw_3soslvDC",

        sdkVersion: "2.118.0",

        storageBucket: "finora-private-documents",

        maxUploadBytes: 10 * 1024 * 1024,

        allowedUploadTypes: Object.freeze([
            "image/jpeg",
            "image/png",
            "image/webp",
            "application/pdf"
        ]),

        defaultPageSize: 20,

        maxPageSize: 100,

        passwordMinLength: 12,

        /*
         * Timeouts are in milliseconds.
         * They prevent the application from waiting indefinitely for a request.
         */
        timeout: Object.freeze({
            sdkLoad: 6500,
            initialization: 11500,
            authRequest: 10000,
            databaseRequest: 15000,
            storageRequest: 20000,
            profileLoad: 8000
        }),

        legalDocumentTypes: Object.freeze({
            terms: "terms",
            privacy: "privacy_notice"
        }),

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


    /* ========================================================================
       2. APPLICATION STATE
       ======================================================================== */

    const FINORA_STATE = {
        initialized: false,

        initializing: null,

        initializationError: null,

        session: null,

        user: null,

        profile: null,

        authSubscription: null,

        authListeners: new Set(),

        pendingSupabaseAuthListeners: new Set(),

        lastError: null,

        sdkLoaded: false
    };


    let supabaseClient = null;

    let supabaseClientPromise = null;

    let internalAuthSubscriptionRegistered = false;


    /* ========================================================================
       3. ERROR AND TIMEOUT HELPERS
       ======================================================================== */

    /**
     * Create a predictable application error.
     */
    function createFinoraError(message, code = "FINORA_ERROR") {
        const error = new Error(String(message));

        error.name = "FinoraError";
        error.code = code;

        return error;
    }


    /**
     * Run a promise or promise-like query with a time limit.
     *
     * Note:
     * Promise.race limits how long this caller waits. It does not, by itself,
     * cancel the underlying operation. HTTP calls are also bounded by the
     * custom fetch function configured when the client is created.
     */
    function withTimeout(promise, timeoutMs, message) {
        let timerId = null;

        const timeoutPromise = new Promise((resolve, reject) => {
            timerId = window.setTimeout(() => {
                const error = createFinoraError(
                    message || "การเชื่อมต่อใช้เวลานานเกินไป",
                    "FINORA_TIMEOUT"
                );

                reject(error);
            }, Math.max(1, Number(timeoutMs) || 1));
        });

        return Promise.race([
            Promise.resolve(promise),
            timeoutPromise
        ]).finally(() => {
            if (timerId !== null) {
                window.clearTimeout(timerId);
            }
        });
    }


    /**
     * Translate technical errors into Thai messages suitable for users.
     */
    function getFriendlyErrorMessage(error) {
        const originalMessage = String(
            error?.message ||
            error?.error_description ||
            error?.details ||
            error ||
            ""
        );

        const message = originalMessage.toLowerCase();

        if (
            message.includes("finora_timeout") ||
            message.includes("ใช้เวลานานเกินไป") ||
            message.includes("timed out") ||
            message.includes("timeout") ||
            message.includes("aborted")
        ) {
            return "ระบบตอบกลับช้ากว่าปกติ กรุณาตรวจสอบอินเทอร์เน็ตแล้วลองใหม่";
        }

        if (
            message.includes("invalid login credentials") ||
            message.includes("invalid credentials")
        ) {
            return "อีเมลหรือรหัสผ่านไม่ถูกต้อง";
        }

        if (
            message.includes("email not confirmed") ||
            message.includes("email_not_confirmed")
        ) {
            return "กรุณายืนยันอีเมลก่อนเข้าสู่ระบบ";
        }

        if (
            message.includes("user already registered") ||
            message.includes("already registered")
        ) {
            return "อีเมลนี้สมัครสมาชิกแล้ว กรุณาเข้าสู่ระบบ";
        }

        if (
            message.includes("password should be") ||
            message.includes("password must")
        ) {
            return "รหัสผ่านไม่ผ่านเงื่อนไขที่ระบบกำหนด";
        }

        if (
            message.includes("rate limit") ||
            message.includes("too many requests")
        ) {
            return "มีการร้องขอหลายครั้งเกินไป กรุณารอสักครู่แล้วลองใหม่";
        }

        if (
            message.includes("network") ||
            message.includes("failed to fetch") ||
            message.includes("fetch failed") ||
            message.includes("load failed")
        ) {
            return "เชื่อมต่อระบบไม่สำเร็จ กรุณาตรวจสอบอินเทอร์เน็ต";
        }

        if (
            message.includes("permission denied") ||
            message.includes("row-level security") ||
            message.includes("rls") ||
            message.includes("not allowed")
        ) {
            return "คุณไม่มีสิทธิ์ดำเนินการนี้ หรือข้อมูลไม่ผ่านเงื่อนไขความปลอดภัย";
        }

        if (
            message.includes("jwt expired") ||
            message.includes("token is expired") ||
            message.includes("session_not_found")
        ) {
            return "เซสชันหมดอายุ กรุณาเข้าสู่ระบบใหม่";
        }

        if (
            message.includes("duplicate key") ||
            message.includes("unique constraint")
        ) {
            return "ข้อมูลนี้มีอยู่ในระบบแล้ว";
        }

        if (
            message.includes("foreign key") ||
            message.includes("violates foreign key")
        ) {
            return "ข้อมูลที่อ้างอิงไม่ถูกต้อง หรือไม่มีข้อมูลดังกล่าวในระบบ";
        }

        if (
            message.includes("invalid input syntax") ||
            message.includes("invalid input value")
        ) {
            return "รูปแบบข้อมูลไม่ถูกต้อง กรุณาตรวจสอบข้อมูลอีกครั้ง";
        }

        if (
            message.includes("bucket not found") ||
            message.includes("object not found")
        ) {
            return "ไม่พบไฟล์ที่ร้องขอ หรือไฟล์ไม่มีอยู่ในระบบ";
        }

        if (
            message.includes("โหลดไลบรารี supabase") ||
            message.includes("supabase sdk")
        ) {
            return "ไม่สามารถโหลดส่วนเชื่อมต่อฐานข้อมูลได้ กรุณาตรวจสอบอินเทอร์เน็ตแล้วลองใหม่";
        }

        return "ระบบไม่สามารถดำเนินการได้ในขณะนี้ กรุณาลองใหม่อีกครั้ง";
    }


    /**
     * Centralized error handler.
     */
    function handleError(error, options = {}) {
        const {
            showMessage = true,
            context = "FINORA"
        } = options;

        FINORA_STATE.lastError = error;

        console.error(`[${context}]`, error);

        const message = getFriendlyErrorMessage(error);

        if (showMessage) {
            setStatus(message, "error");
        }

        return {
            success: false,
            message,
            error
        };
    }


    /**
     * Run an asynchronous task with standardized error handling.
     */
    async function safelyRun(task, options = {}) {
        try {
            return await task();
        } catch (error) {
            handleError(error, options);
            throw error;
        }
    }


    /* ========================================================================
       4. NETWORK LAYER
       ======================================================================== */

    /**
     * Fetch wrapper with a request timeout.
     *
     * The caller's AbortSignal is respected. A separate internal controller
     * ensures that a stalled HTTP request does not wait forever.
     */
    async function fetchWithTimeout(input, init = {}) {
        const controller = new AbortController();

        const originalSignal = init.signal;

        let timeoutId = null;

        const abortFromOriginalSignal = () => {
            if (!controller.signal.aborted) {
                controller.abort(
                    originalSignal?.reason ||
                    new Error("Request aborted")
                );
            }
        };

        if (originalSignal?.aborted) {
            abortFromOriginalSignal();
        } else if (originalSignal) {
            originalSignal.addEventListener(
                "abort",
                abortFromOriginalSignal,
                { once: true }
            );
        }

        timeoutId = window.setTimeout(() => {
            if (!controller.signal.aborted) {
                controller.abort(
                    new Error("FINORA network request timed out")
                );
            }
        }, FINORA_CONFIG.timeout.storageRequest);

        try {
            return await window.fetch(input, {
                ...init,
                signal: controller.signal
            });
        } finally {
            if (timeoutId !== null) {
                window.clearTimeout(timeoutId);
            }

            if (originalSignal) {
                originalSignal.removeEventListener(
                    "abort",
                    abortFromOriginalSignal
                );
            }
        }
    }


    /**
     * Wait for a Supabase query, storage operation, or other promise-like task.
     */
    function awaitRequest(promise, message, timeoutMs = FINORA_CONFIG.timeout.databaseRequest) {
        return withTimeout(
            promise,
            timeoutMs,
            message || "ติดต่อฐานข้อมูลใช้เวลานานเกินไป"
        );
    }


    /* ========================================================================
       5. SUPABASE SDK LOADING
       ======================================================================== */

    /**
     * Load the pinned SDK version from the primary CDN, then try a fallback CDN.
     *
     * Dynamic import is deliberate: this file can define the FINORA API
     * immediately. The page controller does not have to wait for the import
     * statement at the top of a module before it can run its own timeout guard.
     */
    async function importSupabaseSdk() {
        const sources = [
            {
                name: "esm.sh",
                load: () => import(
                    "https://esm.sh/@supabase/supabase-js@2.118.0?target=es2022"
                )
            },
            {
                name: "jsDelivr",
                load: () => import(
                    "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.118.0/+esm"
                )
            }
        ];

        const failures = [];

        for (const source of sources) {
            try {
                const module = await withTimeout(
                    source.load(),
                    FINORA_CONFIG.timeout.sdkLoad,
                    `โหลดไลบรารี Supabase จาก ${source.name} ใช้เวลานานเกินไป`
                );

                if (typeof module?.createClient !== "function") {
                    throw createFinoraError(
                        "ไลบรารี Supabase ที่โหลดมาไม่ถูกต้อง",
                        "SUPABASE_SDK_INVALID"
                    );
                }

                return module;
            } catch (error) {
                failures.push({
                    source: source.name,
                    message: error?.message || String(error)
                });

                console.warn(
                    `FINORA: โหลด Supabase SDK จาก ${source.name} ไม่สำเร็จ`,
                    error
                );
            }
        }

        const finalError = createFinoraError(
            "โหลดไลบรารี Supabase ไม่สำเร็จ กรุณาตรวจสอบอินเทอร์เน็ตหรือการเข้าถึง CDN",
            "SUPABASE_SDK_LOAD_FAILED"
        );

        finalError.details = failures;

        throw finalError;
    }


    /**
     * Initialize exactly one Supabase client.
     */
    async function createSupabaseClient() {
        if (supabaseClient) {
            return supabaseClient;
        }

        if (supabaseClientPromise) {
            return supabaseClientPromise;
        }

        supabaseClientPromise = (async () => {
            if (
                !FINORA_CONFIG.supabaseUrl.startsWith("https://") ||
                !FINORA_CONFIG.supabaseKey ||
                FINORA_CONFIG.supabaseKey.includes("REPLACE_WITH")
            ) {
                throw createFinoraError(
                    "กรุณาตรวจสอบ Supabase URL และ Publishable key",
                    "SUPABASE_CONFIGURATION_INVALID"
                );
            }

            const sdk = await importSupabaseSdk();

            const client = sdk.createClient(
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
                        },

                        fetch: fetchWithTimeout
                    },

                    db: {
                        schema: "public"
                    }
                }
            );

            supabaseClient = client;

            FINORA_STATE.sdkLoaded = true;

            /*
             * Preserve the existing debugging alias.
             * It is always the browser client, never a service_role client.
             */
            window.supabaseClient = client;

            attachInternalAuthListener(client);

            flushPendingSupabaseAuthListeners(client);

            dispatchFinoraEvent("sdk-loaded", {
                appName: FINORA_CONFIG.appName,
                sdkVersion: FINORA_CONFIG.sdkVersion
            });

            return client;
        })();

        /*
         * Attach a rejection handler immediately so a failed CDN load does not
         * create an unhandled rejection before the page calls FINORA.initialize.
         * The original promise remains rejected for callers that await it.
         */
        supabaseClientPromise.catch(() => {});

        return supabaseClientPromise;
    }


    /**
     * Return the client, imposing a maximum time for callers.
     */
    async function getSupabaseClient() {
        if (supabaseClient) {
            return supabaseClient;
        }

        return withTimeout(
            createSupabaseClient(),
            FINORA_CONFIG.timeout.initialization,
            "เชื่อมต่อบริการฐานข้อมูลไม่สำเร็จภายในเวลาที่กำหนด"
        );
    }


    /**
     * Subscribe to Supabase Auth events immediately after client creation.
     *
     * This callback must stay synchronous. Any profile reload is scheduled
     * outside the callback so database queries do not block Auth event delivery.
     */
    function attachInternalAuthListener(client) {
        if (internalAuthSubscriptionRegistered) {
            return;
        }

        const { data, error } = client.auth.onAuthStateChange(
            (event, session) => {
                FINORA_STATE.session = session ?? null;
                FINORA_STATE.user = session?.user ?? null;

                if (!session?.user) {
                    FINORA_STATE.profile = null;
                }

                refreshAuthUI();

                dispatchFinoraEvent("auth-state-changed", {
                    event,
                    session: session ?? null
                });

                /*
                 * Do not await profile or database requests in this callback.
                 */
                window.setTimeout(() => {
                    for (const listener of FINORA_STATE.authListeners) {
                        try {
                            Promise.resolve(
                                listener(event, session ?? null)
                            ).catch((listenerError) => {
                                console.error(
                                    "FINORA application auth listener error:",
                                    listenerError
                                );
                            });
                        } catch (listenerError) {
                            console.error(
                                "FINORA application auth listener error:",
                                listenerError
                            );
                        }
                    }

                    if (session?.user) {
                        refreshProfile().catch((profileError) => {
                            console.warn(
                                "FINORA profile refresh failed:",
                                profileError
                            );
                        });
                    }
                }, 0);
            }
        );

        if (error) {
            console.error(
                "FINORA could not attach its Auth listener",
                error
            );
            return;
        }

        FINORA_STATE.authSubscription = data.subscription;
        internalAuthSubscriptionRegistered = true;
    }


    /* ========================================================================
       6. SUPABASE COMPATIBILITY FACADE
       ======================================================================== */

    /*
     * Some existing page code attaches onAuthStateChange before the network
     * client has finished loading. Queue those subscriptions, then attach them
     * when the real client becomes available.
     */

    function attachQueuedAuthListener(record, client) {
        if (!record.active || record.subscription) {
            return;
        }

        try {
            const { data, error } = client.auth.onAuthStateChange(
                record.callback
            );

            if (error) {
                console.error(
                    "FINORA queued Auth subscription failed",
                    error
                );
                return;
            }

            record.subscription = data.subscription;

            if (!record.active) {
                record.subscription?.unsubscribe();
            }
        } catch (error) {
            console.error(
                "FINORA queued Auth subscription failed",
                error
            );
        }
    }


    function flushPendingSupabaseAuthListeners(client) {
        for (const record of FINORA_STATE.pendingSupabaseAuthListeners) {
            attachQueuedAuthListener(record, client);
        }
    }


    function subscribeSupabaseAuth(callback) {
        if (typeof callback !== "function") {
            throw new TypeError(
                "onAuthStateChange ต้องได้รับ callback function"
            );
        }

        const record = {
            callback,
            active: true,
            subscription: null
        };

        FINORA_STATE.pendingSupabaseAuthListeners.add(record);

        if (supabaseClient) {
            attachQueuedAuthListener(record, supabaseClient);
        }

        const subscription = {
            unsubscribe() {
                record.active = false;

                if (record.subscription) {
                    record.subscription.unsubscribe();
                }

                FINORA_STATE.pendingSupabaseAuthListeners.delete(record);
            }
        };

        return {
            data: {
                subscription
            }
        };
    }


    const supabaseAuthFacade = new Proxy(
        {},
        {
            get(target, property) {
                if (property === "onAuthStateChange") {
                    return subscribeSupabaseAuth;
                }

                if (property === "then") {
                    return undefined;
                }

                if (supabaseClient) {
                    const value = supabaseClient.auth[property];

                    return typeof value === "function"
                        ? value.bind(supabaseClient.auth)
                        : value;
                }

                return (...args) => {
                    return getSupabaseClient().then((client) => {
                        const method = client.auth[property];

                        if (typeof method !== "function") {
                            throw createFinoraError(
                                `ไม่พบ Auth method: ${String(property)}`,
                                "AUTH_METHOD_NOT_FOUND"
                            );
                        }

                        return method.apply(client.auth, args);
                    });
                };
            }
        }
    );


    const supabaseFunctionsFacade = new Proxy(
        {},
        {
            get(target, property) {
                if (property === "invoke") {
                    return async (...args) => {
                        const client = await getSupabaseClient();

                        return await awaitRequest(
                            client.functions.invoke(...args),
                            "เรียกบริการหลังบ้านใช้เวลานานเกินไป",
                            FINORA_CONFIG.timeout.databaseRequest
                        );
                    };
                }

                if (property === "then") {
                    return undefined;
                }

                if (supabaseClient) {
                    const value = supabaseClient.functions[property];

                    return typeof value === "function"
                        ? value.bind(supabaseClient.functions)
                        : value;
                }

                return undefined;
            }
        }
    );


    const supabaseFacade = new Proxy(
        {},
        {
            get(target, property) {
                if (property === "then") {
                    return undefined;
                }

                if (property === "auth") {
                    return supabaseAuthFacade;
                }

                if (property === "functions") {
                    return supabaseFunctionsFacade;
                }

                if (property === "from") {
                    return (...args) => {
                        if (!supabaseClient) {
                            throw createFinoraError(
                                "ฐานข้อมูลยังเริ่มต้นไม่เสร็จ กรุณารอ FINORA.ready ก่อน",
                                "SUPABASE_NOT_READY"
                            );
                        }

                        return supabaseClient.from(...args);
                    };
                }

                if (property === "storage") {
                    if (!supabaseClient) {
                        return undefined;
                    }

                    return supabaseClient.storage;
                }

                if (supabaseClient) {
                    const value = supabaseClient[property];

                    return typeof value === "function"
                        ? value.bind(supabaseClient)
                        : value;
                }

                return undefined;
            }
        }
    );


    /* ========================================================================
       7. GENERAL UTILITIES
       ======================================================================== */

    function getAppUrl() {
        return FINORA_CONFIG.appUrl;
    }


    function getCurrentPageUrl() {
        return `${window.location.origin}${window.location.pathname}`;
    }


    function getElement(id) {
        if (!id) {
            return null;
        }

        return document.getElementById(id);
    }


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


    function escapeHtml(value) {
        return String(value ?? "")
            .replaceAll("&", "&amp;")
            .replaceAll("<", "&lt;")
            .replaceAll(">", "&gt;")
            .replaceAll('"', "&quot;")
            .replaceAll("'", "&#39;");
    }


    function isValidEmail(email) {
        if (typeof email !== "string") {
            return false;
        }

        const value = email.trim();

        return (
            value.length <= 254 &&
            /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)
        );
    }


    function requireString(value, fieldName, options = {}) {
        const {
            minLength = 1,
            maxLength = 1000,
            trim = true
        } = options;

        if (typeof value !== "string") {
            throw createFinoraError(
                `กรุณากรอก${fieldName}`,
                "VALIDATION_REQUIRED"
            );
        }

        const normalized = trim ? value.trim() : value;

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
     * Validate a numeric value.
     *
     * minimum is always applied. allowZero allows an exact zero when the
     * configured minimum is zero, but does not weaken other minimum limits.
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

        const zeroIsAllowed = allowZero && number === 0;

        if (!zeroIsAllowed && number < minimum) {
            throw createFinoraError(
                `${fieldName}ต้องไม่น้อยกว่า ${minimum}`,
                "VALIDATION_MINIMUM"
            );
        }

        if (number > maximum) {
            throw createFinoraError(
                `${fieldName}ต้องไม่มากกว่า ${maximum}`,
                "VALIDATION_MAXIMUM"
            );
        }

        return number;
    }


    function optionalNumber(value, fieldName, options = {}) {
        if (
            value === "" ||
            value === null ||
            value === undefined
        ) {
            return null;
        }

        return requireNumber(value, fieldName, {
            minimum: options.minimum ?? 0,
            maximum: options.maximum ?? Number.MAX_SAFE_INTEGER,
            allowZero: options.allowZero ?? true,
            integer: options.integer ?? false
        });
    }


    function generateClientId() {
        if (window.crypto?.randomUUID) {
            return window.crypto.randomUUID();
        }

        const bytes = new Uint8Array(16);

        if (window.crypto?.getRandomValues) {
            window.crypto.getRandomValues(bytes);
        } else {
            for (let index = 0; index < bytes.length; index += 1) {
                bytes[index] = Math.floor(Math.random() * 256);
            }
        }

        return Array.from(bytes)
            .map((byte) => byte.toString(16).padStart(2, "0"))
            .join("");
    }


    function makeResult(data = null, error = null) {
        return {
            success: !error,
            data,
            error,
            message: error
                ? getFriendlyErrorMessage(error)
                : ""
        };
    }


    function formatCurrency(value) {
        const number = Number(value);

        if (!Number.isFinite(number)) {
            return "—";
        }

        return new Intl.NumberFormat("th-TH", {
            style: "currency",
            currency: "THB",
            minimumFractionDigits: 2,
            maximumFractionDigits: 2
        }).format(number);
    }


    function formatDate(value, options = {}) {
        if (!value) {
            return "—";
        }

        const date = new Date(value);

        if (Number.isNaN(date.getTime())) {
            return "—";
        }

        return new Intl.DateTimeFormat("th-TH", {
            year: "numeric",
            month: "short",
            day: "numeric",
            ...options
        }).format(date);
    }


    function formatDateTime(value) {
        if (!value) {
            return "—";
        }

        const date = new Date(value);

        if (Number.isNaN(date.getTime())) {
            return "—";
        }

        return new Intl.DateTimeFormat("th-TH", {
            year: "numeric",
            month: "short",
            day: "numeric",
            hour: "2-digit",
            minute: "2-digit"
        }).format(date);
    }


    function getFormValue(formData, name) {
        const value = formData.get(name);

        return typeof value === "string"
            ? value.trim()
            : "";
    }


    function isChecked(formData, name) {
        return formData.get(name) === "on" ||
            formData.get(name) === "true" ||
            formData.get(name) === true;
    }


    function setStatus(message, type = "info") {
        const elements = document.querySelectorAll(
            "[data-finora-status], #finora-status, #global-status"
        );

        if (!elements.length) {
            return false;
        }

        elements.forEach((element) => {
            element.textContent = String(message ?? "");
            element.dataset.statusType = type;
            element.setAttribute("role", type === "error" ? "alert" : "status");
            element.hidden = !message;
        });

        return true;
    }


    function dispatchFinoraEvent(name, detail = {}) {
        window.dispatchEvent(
            new CustomEvent(`finora:${name}`, {
                detail
            })
        );
    }


    function normalizePage(options = {}) {
        const page = Math.max(
            1,
            Number.parseInt(options.page ?? "1", 10) || 1
        );

        const pageSize = Math.min(
            FINORA_CONFIG.maxPageSize,
            Math.max(
                1,
                Number.parseInt(
                    options.pageSize ?? FINORA_CONFIG.defaultPageSize,
                    10
                ) || FINORA_CONFIG.defaultPageSize
            )
        );

        return {
            page,
            pageSize,
            from: (page - 1) * pageSize,
            to: (page * pageSize) - 1
        };
    }


    /* ========================================================================
       8. AUTHENTICATION AND SESSION MANAGEMENT
       ======================================================================== */

    async function getSession() {
        const client = await getSupabaseClient();

        const result = await awaitRequest(
            client.auth.getSession(),
            "ตรวจสอบสถานะเซสชันใช้เวลานานเกินไป",
            FINORA_CONFIG.timeout.authRequest
        );

        if (result.error) {
            throw result.error;
        }

        FINORA_STATE.session = result.data.session ?? null;
        FINORA_STATE.user = result.data.session?.user ?? null;

        return FINORA_STATE.session;
    }


    async function getCurrentUser() {
        const client = await getSupabaseClient();

        const session = await getSession();

        if (!session?.user) {
            FINORA_STATE.user = null;
            return null;
        }

        const result = await awaitRequest(
            client.auth.getUser(),
            "ตรวจสอบบัญชีผู้ใช้ใช้เวลานานเกินไป",
            FINORA_CONFIG.timeout.authRequest
        );

        if (result.error) {
            throw result.error;
        }

        FINORA_STATE.user = result.data.user ?? null;

        return FINORA_STATE.user;
    }


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
     * Create a user through Supabase Auth.
     *
     * User metadata is profile information only. It is never used to assign
     * privileged roles. Profile creation is handled by the database trigger.
     */
    async function signUp(formValues = {}) {
        const client = await getSupabaseClient();

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

            title: formValues.title
                ? String(formValues.title).trim().slice(0, 40)
                : null,

            full_name: formValues.full_name
                ? String(formValues.full_name).trim().slice(0, 150)
                : null,

            phone: formValues.phone
                ? String(formValues.phone).trim().slice(0, 30)
                : null
        };

        const result = await awaitRequest(
            client.auth.signUp({
                email,
                password,
                options: {
                    emailRedirectTo: getCurrentPageUrl(),
                    data: metadata
                }
            }),
            "สมัครสมาชิกใช้เวลานานเกินไป",
            FINORA_CONFIG.timeout.authRequest
        );

        if (result.error) {
            throw result.error;
        }

        FINORA_STATE.session = result.data.session ?? null;
        FINORA_STATE.user = result.data.user ?? null;

        if (result.data.session) {
            await withTimeout(
                refreshProfile(),
                FINORA_CONFIG.timeout.profileLoad,
                "โหลดข้อมูลโปรไฟล์หลังสมัครใช้เวลานานเกินไป"
            ).catch((error) => {
                console.warn("FINORA signup profile load:", error);
            });
        }

        setStatus(
            result.data.session
                ? "สมัครสมาชิกสำเร็จ"
                : "สมัครสมาชิกแล้ว กรุณาตรวจสอบอีเมลเพื่อยืนยันบัญชี",
            "success"
        );

        dispatchFinoraEvent("signup", {
            userId: result.data.user?.id ?? null,
            email
        });

        return result.data;
    }


    async function signIn(emailValue, passwordValue) {
        const client = await getSupabaseClient();

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

        const result = await awaitRequest(
            client.auth.signInWithPassword({
                email,
                password
            }),
            "เข้าสู่ระบบใช้เวลานานเกินไป",
            FINORA_CONFIG.timeout.authRequest
        );

        if (result.error) {
            throw result.error;
        }

        FINORA_STATE.session = result.data.session;
        FINORA_STATE.user = result.data.user;

        const profile = await withTimeout(
            refreshProfile(),
            FINORA_CONFIG.timeout.profileLoad,
            "โหลดข้อมูลโปรไฟล์ใช้เวลานานเกินไป"
        ).catch((error) => {
            console.warn("FINORA sign-in profile load:", error);
            return null;
        });

        if (
            profile?.account_status &&
            profile.account_status !== "active"
        ) {
            await client.auth.signOut();

            FINORA_STATE.session = null;
            FINORA_STATE.user = null;
            FINORA_STATE.profile = null;

            throw createFinoraError(
                "บัญชีนี้ยังไม่สามารถใช้งานได้ กรุณาติดต่อเจ้าหน้าที่",
                "ACCOUNT_INACTIVE"
            );
        }

        refreshAuthUI();

        setStatus("เข้าสู่ระบบสำเร็จ", "success");

        dispatchFinoraEvent("signin", {
            userId: result.data.user?.id ?? null,
            email: result.data.user?.email ?? email
        });

        return result.data;
    }


    async function signOut() {
        const client = await getSupabaseClient();

        const result = await awaitRequest(
            client.auth.signOut(),
            "ออกจากระบบใช้เวลานานเกินไป",
            FINORA_CONFIG.timeout.authRequest
        );

        if (result.error) {
            throw result.error;
        }

        FINORA_STATE.session = null;
        FINORA_STATE.user = null;
        FINORA_STATE.profile = null;

        refreshAuthUI();

        setStatus("ออกจากระบบเรียบร้อยแล้ว", "success");

        dispatchFinoraEvent("signout");

        return true;
    }


    async function requestPasswordReset(emailValue) {
        const client = await getSupabaseClient();

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

        const result = await awaitRequest(
            client.auth.resetPasswordForEmail(email, {
                redirectTo: getCurrentPageUrl()
            }),
            "ส่งคำขอกู้คืนรหัสผ่านใช้เวลานานเกินไป",
            FINORA_CONFIG.timeout.authRequest
        );

        if (result.error) {
            throw result.error;
        }

        setStatus(
            "หากอีเมลนี้สามารถรับการกู้คืนได้ ระบบจะส่งคำแนะนำไปให้ทางอีเมล",
            "success"
        );

        return true;
    }


    async function updatePassword(passwordValue, confirmPasswordValue) {
        const client = await getSupabaseClient();

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

        const result = await awaitRequest(
            client.auth.updateUser({ password }),
            "เปลี่ยนรหัสผ่านใช้เวลานานเกินไป",
            FINORA_CONFIG.timeout.authRequest
        );

        if (result.error) {
            throw result.error;
        }

        setStatus("เปลี่ยนรหัสผ่านสำเร็จ", "success");

        dispatchFinoraEvent("password-updated", {
            userId: user.id
        });

        return result.data;
    }


    async function verifyEmailOtp(emailValue, tokenValue, type = "email") {
        const client = await getSupabaseClient();

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

        const allowedTypes = [
            "email",
            "signup",
            "recovery",
            "email_change",
            "magiclink"
        ];

        if (!allowedTypes.includes(type)) {
            throw createFinoraError(
                "ประเภทการยืนยันไม่ถูกต้อง",
                "OTP_TYPE_INVALID"
            );
        }

        const result = await awaitRequest(
            client.auth.verifyOtp({
                email,
                token,
                type
            }),
            "ยืนยันรหัสใช้เวลานานเกินไป",
            FINORA_CONFIG.timeout.authRequest
        );

        if (result.error) {
            throw result.error;
        }

        FINORA_STATE.session = result.data.session ?? null;
        FINORA_STATE.user = result.data.user ?? null;

        if (result.data.user) {
            await withTimeout(
                refreshProfile(),
                FINORA_CONFIG.timeout.profileLoad,
                "โหลดโปรไฟล์หลังยืนยันอีเมลใช้เวลานานเกินไป"
            ).catch(() => null);
        }

        setStatus("ยืนยันรหัสเรียบร้อยแล้ว", "success");

        return result.data;
    }


    async function signInWithOAuth(provider) {
        const client = await getSupabaseClient();

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

        const result = await awaitRequest(
            client.auth.signInWithOAuth({
                provider,
                options: {
                    redirectTo: getCurrentPageUrl()
                }
            }),
            "เริ่มเข้าสู่ระบบด้วยผู้ให้บริการภายนอกใช้เวลานานเกินไป",
            FINORA_CONFIG.timeout.authRequest
        );

        if (result.error) {
            throw result.error;
        }

        return result.data;
    }


    function onAuthChange(callback) {
        if (typeof callback !== "function") {
            throw new TypeError(
                "onAuthChange ต้องได้รับ callback function"
            );
        }

        FINORA_STATE.authListeners.add(callback);

        return () => {
            FINORA_STATE.authListeners.delete(callback);
        };
    }


    /* ========================================================================
       9. USER PROFILES
       ======================================================================== */

    /*
     * national_id and other restricted fields are intentionally excluded.
     * The database must independently enforce profile column privileges.
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


    async function getMyProfile() {
        const client = await getSupabaseClient();
        const user = await requireAuthenticatedUser();

        const result = await awaitRequest(
            client
                .from(FINORA_CONFIG.tables.profiles)
                .select(PROFILE_SELECT_FIELDS)
                .eq("user_id", user.id)
                .maybeSingle(),
            "โหลดโปรไฟล์ใช้เวลานานเกินไป"
        );

        if (result.error) {
            throw result.error;
        }

        FINORA_STATE.profile = result.data ?? null;

        return FINORA_STATE.profile;
    }


    async function refreshProfile() {
        try {
            const session = await getSession();

            if (!session?.user) {
                FINORA_STATE.profile = null;
                refreshAuthUI();

                return null;
            }

            const profile = await withTimeout(
                getMyProfile(),
                FINORA_CONFIG.timeout.profileLoad,
                "โหลดข้อมูลโปรไฟล์ใช้เวลานานเกินไป"
            );

            FINORA_STATE.profile = profile;

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


    async function updateMyProfile(values = {}) {
        const client = await getSupabaseClient();
        const user = await requireAuthenticatedUser();

        const allowedFields = [
            "username",
            "title",
            "full_name",
            "phone",
            "date_of_birth"
        ];

        const payload = {};

        for (const field of allowedFields) {
            if (!Object.prototype.hasOwnProperty.call(values, field)) {
                continue;
            }

            const value = values[field];

            if (value === null || value === "") {
                payload[field] = null;
                continue;
            }

            if (typeof value !== "string") {
                throw createFinoraError(
                    `ข้อมูล ${field} ไม่ถูกต้อง`,
                    "PROFILE_INVALID_FIELD"
                );
            }

            payload[field] = value.trim();
        }

        if (!Object.keys(payload).length) {
            throw createFinoraError(
                "ไม่มีข้อมูลที่ต้องการแก้ไข",
                "PROFILE_EMPTY_UPDATE"
            );
        }

        if (payload.username && payload.username.length > 40) {
            throw createFinoraError(
                "ชื่อผู้ใช้ต้องมีความยาวไม่เกิน 40 ตัวอักษร",
                "PROFILE_USERNAME_TOO_LONG"
            );
        }

        if (payload.title && payload.title.length > 40) {
            throw createFinoraError(
                "คำนำหน้าชื่อยาวเกินกว่าที่ระบบกำหนด",
                "PROFILE_TITLE_TOO_LONG"
            );
        }

        if (payload.full_name && payload.full_name.length > 150) {
            throw createFinoraError(
                "ชื่อ-นามสกุลยาวเกินกว่าที่ระบบกำหนด",
                "PROFILE_FULL_NAME_TOO_LONG"
            );
        }

        if (payload.phone && payload.phone.length > 30) {
            throw createFinoraError(
                "หมายเลขโทรศัพท์ยาวเกินกว่าที่ระบบกำหนด",
                "PROFILE_PHONE_TOO_LONG"
            );
        }

        if (payload.date_of_birth) {
            const date = new Date(payload.date_of_birth);

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

        const result = await awaitRequest(
            client
                .from(FINORA_CONFIG.tables.profiles)
                .update(payload)
                .eq("user_id", user.id)
                .select(PROFILE_SELECT_FIELDS)
                .maybeSingle(),
            "บันทึกโปรไฟล์ใช้เวลานานเกินไป"
        );

        if (result.error) {
            throw result.error;
        }

        if (!result.data) {
            throw createFinoraError(
                "ไม่สามารถบันทึกโปรไฟล์ได้ กรุณาตรวจสอบสิทธิ์และข้อมูลบัญชี",
                "PROFILE_UPDATE_NOT_APPLIED"
            );
        }

        FINORA_STATE.profile = result.data;

        refreshAuthUI();

        setStatus("บันทึกข้อมูลโปรไฟล์สำเร็จ", "success");

        dispatchFinoraEvent("profile-updated", {
            profile: result.data
        });

        return result.data;
    }


    /* ========================================================================
       10. LEGAL DOCUMENTS AND CONSENT
       ======================================================================== */

    async function getPublishedLegalDocument(documentType) {
        const client = await getSupabaseClient();

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

        const result = await awaitRequest(
            client
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
                .maybeSingle(),
            "โหลดเอกสารทางกฎหมายใช้เวลานานเกินไป"
        );

        if (result.error) {
            throw result.error;
        }

        return result.data ?? null;
    }


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


    async function recordConsent(documentType, action = "accepted") {
        const client = await getSupabaseClient();
        const user = await requireAuthenticatedUser();

        const allowedActions = [
            "accepted",
            "withdrawn",
            "acknowledged"
        ];

        if (!allowedActions.includes(action)) {
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

        const result = await awaitRequest(
            client
                .from(FINORA_CONFIG.tables.consentRecords)
                .insert(payload)
                .select(
                    "id,user_id,document_id,action,document_version,source,recorded_at"
                )
                .single(),
            "บันทึกการยินยอมใช้เวลานานเกินไป"
        );

        if (result.error) {
            throw result.error;
        }

        dispatchFinoraEvent("consent-recorded", {
            documentType,
            action,
            version: document.version
        });

        return result.data;
    }


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


    /* ========================================================================
       11. LOAN PRODUCTS
       ======================================================================== */

    async function getActiveLoanProducts() {
        const client = await getSupabaseClient();

        const result = await awaitRequest(
            client
                .from(FINORA_CONFIG.tables.loanProducts)
                .select([
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
                ].join(","))
                .eq("status", "active")
                .order("created_at", {
                    ascending: false
                }),
            "โหลดผลิตภัณฑ์สินเชื่อใช้เวลานานเกินไป"
        );

        if (result.error) {
            throw result.error;
        }

        return result.data ?? [];
    }


    async function getActiveLoanProduct(productId) {
        const client = await getSupabaseClient();

        const id = requireString(
            productId,
            "ผลิตภัณฑ์สินเชื่อ",
            { maxLength: 100 }
        );

        const result = await awaitRequest(
            client
                .from(FINORA_CONFIG.tables.loanProducts)
                .select([
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
                ].join(","))
                .eq("id", id)
                .eq("status", "active")
                .maybeSingle(),
            "โหลดผลิตภัณฑ์สินเชื่อใช้เวลานานเกินไป"
        );

        if (result.error) {
            throw result.error;
        }

        if (!result.data) {
            throw createFinoraError(
                "ไม่พบผลิตภัณฑ์สินเชื่อที่เปิดให้สมัคร",
                "LOAN_PRODUCT_NOT_FOUND"
            );
        }

        return result.data;
    }


    /* ========================================================================
       12. LOAN APPLICATIONS
       ======================================================================== */

    async function getMyLoanApplications(options = {}) {
        const client = await getSupabaseClient();
        const user = await requireAuthenticatedUser();
        const page = normalizePage(options);

        const result = await awaitRequest(
            client
                .from(FINORA_CONFIG.tables.loanApplications)
                .select([
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
                ].join(","), {
                    count: "exact"
                })
                .eq("borrower_id", user.id)
                .order("created_at", {
                    ascending: false
                })
                .range(page.from, page.to),
            "โหลดรายการคำขอสินเชื่อใช้เวลานานเกินไป"
        );

        if (result.error) {
            throw result.error;
        }

        const count = result.count ?? 0;

        return {
            data: result.data ?? [],
            page: page.page,
            pageSize: page.pageSize,
            count,
            totalPages: Math.ceil(count / page.pageSize)
        };
    }


    async function getMyLoanApplication(applicationId) {
        const client = await getSupabaseClient();
        const user = await requireAuthenticatedUser();

        const id = requireString(
            applicationId,
            "เลขที่คำขอสินเชื่อ",
            { maxLength: 100 }
        );

        const result = await awaitRequest(
            client
                .from(FINORA_CONFIG.tables.loanApplications)
                .select("*")
                .eq("id", id)
                .eq("borrower_id", user.id)
                .maybeSingle(),
            "โหลดคำขอสินเชื่อใช้เวลานานเกินไป"
        );

        if (result.error) {
            throw result.error;
        }

        if (!result.data) {
            throw createFinoraError(
                "ไม่พบคำขอสินเชื่อ หรือคุณไม่มีสิทธิ์เข้าถึง",
                "APPLICATION_NOT_FOUND"
            );
        }

        return result.data;
    }


    async function submitLoanApplication(formValues = {}) {
        const client = await getSupabaseClient();
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
         * Draft legal documents must never be treated as published terms.
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
            { maximum: 1000000000, allowZero: true }
        );

        const monthlyExpenses = optionalNumber(
            formValues.monthly_expenses,
            "ค่าใช้จ่ายต่อเดือน",
            { maximum: 1000000000, allowZero: true }
        );

        const otherDebtPayments = optionalNumber(
            formValues.other_debt_payments,
            "ภาระหนี้สินต่อเดือน",
            { maximum: 1000000000, allowZero: true }
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

        const result = await awaitRequest(
            client
                .from(FINORA_CONFIG.tables.loanApplications)
                .insert(payload)
                .select("*")
                .single(),
            "ส่งคำขอสินเชื่อใช้เวลานานเกินไป"
        );

        if (result.error) {
            throw result.error;
        }

        setStatus("ส่งคำขอสินเชื่อเรียบร้อยแล้ว", "success");

        dispatchFinoraEvent("loan-application-submitted", {
            applicationId: result.data.id,
            applicationNo: result.data.application_no
        });

        return result.data;
    }


    /* ========================================================================
       13. PRIVATE APPLICATION DOCUMENTS
       ======================================================================== */

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

        if (!FINORA_CONFIG.allowedUploadTypes.includes(file.type)) {
            throw createFinoraError(
                "รองรับเฉพาะไฟล์ JPG, PNG, WEBP และ PDF",
                "UPLOAD_UNSUPPORTED_TYPE"
            );
        }

        return true;
    }


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


    async function uploadApplicationDocument(options = {}) {
        const client = await getSupabaseClient();
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

        const uploadResult = await awaitRequest(
            client.storage
                .from(FINORA_CONFIG.storageBucket)
                .upload(objectPath, file, {
                    cacheControl: "3600",
                    contentType: file.type,
                    upsert: false
                }),
            "อัปโหลดไฟล์ใช้เวลานานเกินไป",
            FINORA_CONFIG.timeout.storageRequest
        );

        if (uploadResult.error) {
            throw uploadResult.error;
        }

        try {
            const insertResult = await awaitRequest(
                client
                    .from(FINORA_CONFIG.tables.applicationDocuments)
                    .insert({
                        application_id: application.id,
                        borrower_id: user.id,
                        document_type: normalizedDocumentType,
                        storage_path: uploadResult.data.path,
                        review_status: "pending"
                    })
                    .select([
                        "id",
                        "application_id",
                        "borrower_id",
                        "document_type",
                        "storage_path",
                        "review_status",
                        "created_at"
                    ].join(","))
                    .single(),
                "บันทึกรายการเอกสารใช้เวลานานเกินไป"
            );

            if (insertResult.error) {
                throw insertResult.error;
            }

            setStatus("อัปโหลดเอกสารสำเร็จ", "success");

            dispatchFinoraEvent("application-document-uploaded", {
                documentId: insertResult.data.id,
                applicationId: application.id
            });

            return insertResult.data;
        } catch (databaseError) {
            /*
             * Clean up an uploaded object if inserting the document record
             * fails. This avoids leaving an unreferenced object in storage.
             */
            try {
                const cleanup = await awaitRequest(
                    client.storage
                        .from(FINORA_CONFIG.storageBucket)
                        .remove([objectPath]),
                    "ลบไฟล์ที่อัปโหลดไม่สำเร็จ",
                    FINORA_CONFIG.timeout.storageRequest
                );

                if (cleanup.error) {
                    console.error(
                        "FINORA could not clean up an orphaned upload",
                        cleanup.error
                    );
                }
            } catch (cleanupError) {
                console.error(
                    "FINORA could not clean up an orphaned upload",
                    cleanupError
                );
            }

            throw databaseError;
        }
    }


    async function getMyApplicationDocuments(applicationId) {
        const client = await getSupabaseClient();
        const application = await getMyLoanApplication(applicationId);

        const result = await awaitRequest(
            client
                .from(FINORA_CONFIG.tables.applicationDocuments)
                .select([
                    "id",
                    "application_id",
                    "borrower_id",
                    "document_type",
                    "storage_path",
                    "review_status",
                    "review_note",
                    "created_at"
                ].join(","))
                .eq("application_id", application.id)
                .eq("borrower_id", application.borrower_id)
                .order("created_at", {
                    ascending: false
                }),
            "โหลดรายการเอกสารใช้เวลานานเกินไป"
        );

        if (result.error) {
            throw result.error;
        }

        return result.data ?? [];
    }


    async function downloadPrivateDocument(storagePath) {
        const client = await getSupabaseClient();

        await requireAuthenticatedUser();

        const path = requireString(
            storagePath,
            "ตำแหน่งไฟล์",
            { maxLength: 1000 }
        );

        const result = await awaitRequest(
            client.storage
                .from(FINORA_CONFIG.storageBucket)
                .download(path),
            "ดาวน์โหลดเอกสารใช้เวลานานเกินไป",
            FINORA_CONFIG.timeout.storageRequest
        );

        if (result.error) {
            throw result.error;
        }

        return result.data;
    }


    async function getPrivateDocumentSignedUrl(
        storagePath,
        expiresInSeconds = 60
    ) {
        const client = await getSupabaseClient();

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

        const result = await awaitRequest(
            client.storage
                .from(FINORA_CONFIG.storageBucket)
                .createSignedUrl(path, duration),
            "สร้างลิงก์ดาวน์โหลดใช้เวลานานเกินไป",
            FINORA_CONFIG.timeout.storageRequest
        );

        if (result.error) {
            throw result.error;
        }

        return result.data.signedUrl;
    }


    /* ========================================================================
       14. LOAN ACCOUNTS, REPAYMENT SCHEDULES, AND PAYMENTS
       ======================================================================== */

    async function getMyLoanAccounts() {
        const client = await getSupabaseClient();
        const user = await requireAuthenticatedUser();

        const result = await awaitRequest(
            client
                .from(FINORA_CONFIG.tables.loanAccounts)
                .select([
                    "id",
                    "contract_id",
                    "borrower_id",
                    "principal_amount",
                    "principal_outstanding",
                    "status",
                    "disbursed_at",
                    "closed_at",
                    "created_at"
                ].join(","))
                .eq("borrower_id", user.id)
                .order("created_at", {
                    ascending: false
                }),
            "โหลดบัญชีสินเชื่อใช้เวลานานเกินไป"
        );

        if (result.error) {
            throw result.error;
        }

        return result.data ?? [];
    }


    async function getMyRepaymentSchedule(loanAccountId) {
        const client = await getSupabaseClient();
        const user = await requireAuthenticatedUser();

        const accountId = requireString(
            loanAccountId,
            "บัญชีสินเชื่อ",
            { maxLength: 100 }
        );

        const accountResult = await awaitRequest(
            client
                .from(FINORA_CONFIG.tables.loanAccounts)
                .select("id,borrower_id")
                .eq("id", accountId)
                .eq("borrower_id", user.id)
                .maybeSingle(),
            "ตรวจสอบบัญชีสินเชื่อใช้เวลานานเกินไป"
        );

        if (accountResult.error) {
            throw accountResult.error;
        }

        if (!accountResult.data) {
            throw createFinoraError(
                "ไม่พบบัญชีสินเชื่อ หรือคุณไม่มีสิทธิ์เข้าถึง",
                "LOAN_ACCOUNT_NOT_FOUND"
            );
        }

        const result = await awaitRequest(
            client
                .from(FINORA_CONFIG.tables.repaymentSchedule)
                .select([
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
                ].join(","))
                .eq("loan_account_id", accountResult.data.id)
                .order("installment_no", {
                    ascending: true
                }),
            "โหลดตารางผ่อนชำระใช้เวลานานเกินไป"
        );

        if (result.error) {
            throw result.error;
        }

        return result.data ?? [];
    }


    async function getMyPayments() {
        const client = await getSupabaseClient();
        const user = await requireAuthenticatedUser();

        const result = await awaitRequest(
            client
                .from(FINORA_CONFIG.tables.payments)
                .select([
                    "id",
                    "loan_account_id",
                    "borrower_id",
                    "amount",
                    "provider",
                    "provider_reference",
                    "status",
                    "paid_at",
                    "created_at"
                ].join(","))
                .eq("borrower_id", user.id)
                .order("created_at", {
                    ascending: false
                }),
            "โหลดประวัติการชำระเงินใช้เวลานานเกินไป"
        );

        if (result.error) {
            throw result.error;
        }

        return result.data ?? [];
    }


    /* ========================================================================
       15. PUBLIC ANNOUNCEMENTS
       ======================================================================== */

    async function getPublicAnnouncements(options = {}) {
        const client = await getSupabaseClient();

        const limit = Math.min(
            50,
            Math.max(
                1,
                Number.parseInt(options.limit ?? "10", 10) || 10
            )
        );

        const result = await awaitRequest(
            client
                .from(FINORA_CONFIG.tables.announcements)
                .select([
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
                ].join(","))
                .eq("status", "published")
                .order("priority", {
                    ascending: false
                })
                .order("created_at", {
                    ascending: false
                })
                .limit(limit),
            "โหลดประกาศใช้เวลานานเกินไป"
        );

        if (result.error) {
            throw result.error;
        }

        const now = Date.now();

        return (result.data ?? []).filter((announcement) => {
            const startsAt = announcement.starts_at
                ? new Date(announcement.starts_at).getTime()
                : null;

            const endsAt = announcement.ends_at
                ? new Date(announcement.ends_at).getTime()
                : null;

            if (startsAt !== null && startsAt > now) {
                return false;
            }

            if (endsAt !== null && endsAt < now) {
                return false;
            }

            return true;
        });
    }


    /* ========================================================================
       16. CUSTOMER SUPPORT
       ======================================================================== */

    async function createSupportTicket(formValues = {}) {
        const client = await getSupabaseClient();
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

        const result = await awaitRequest(
            client
                .from(FINORA_CONFIG.tables.supportTickets)
                .insert({
                    user_id: user.id,
                    category,
                    subject,
                    message,
                    status: "open"
                })
                .select([
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
                ].join(","))
                .single(),
            "ส่งข้อความถึงฝ่ายบริการใช้เวลานานเกินไป"
        );

        if (result.error) {
            throw result.error;
        }

        setStatus(
            "ส่งข้อความถึงฝ่ายบริการเรียบร้อยแล้ว",
            "success"
        );

        dispatchFinoraEvent("support-ticket-created", {
            ticketId: result.data.id,
            ticketNo: result.data.ticket_no
        });

        return result.data;
    }


    async function getMySupportTickets() {
        const client = await getSupabaseClient();
        const user = await requireAuthenticatedUser();

        const result = await awaitRequest(
            client
                .from(FINORA_CONFIG.tables.supportTickets)
                .select([
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
                ].join(","))
                .eq("user_id", user.id)
                .order("created_at", {
                    ascending: false
                }),
            "โหลดประวัติการติดต่อใช้เวลานานเกินไป"
        );

        if (result.error) {
            throw result.error;
        }

        return result.data ?? [];
    }


    /* ========================================================================
       17. STAFF DASHBOARD DATA ACCESS
       ======================================================================== */

    /**
     * This function does not grant staff permissions.
     *
     * RLS and server-side authorization must restrict which applications
     * a signed-in user may read. Do not use this client-side function as the
     * sole mechanism for authorizing staff or administrative operations.
     */
    async function getDashboardApplications(options = {}) {
        const client = await getSupabaseClient();

        await requireAuthenticatedUser();

        const page = normalizePage(options);

        let query = client
            .from(FINORA_CONFIG.tables.loanApplications)
            .select("*", {
                count: "exact"
            })
            .order("created_at", {
                ascending: false
            })
            .range(page.from, page.to);

        if (options.status) {
            query = query.eq(
                "status",
                String(options.status).trim()
            );
        }

        const result = await awaitRequest(
            query,
            "โหลดรายการคำขอสำหรับเจ้าหน้าที่ใช้เวลานานเกินไป"
        );

        if (result.error) {
            throw result.error;
        }

        const count = result.count ?? 0;

        return {
            data: result.data ?? [],
            page: page.page,
            pageSize: page.pageSize,
            count,
            totalPages: Math.ceil(count / page.pageSize)
        };
    }


    async function getApplicationReviewHistory(applicationId) {
        const client = await getSupabaseClient();

        const id = requireString(
            applicationId,
            "คำขอสินเชื่อ",
            { maxLength: 100 }
        );

        const result = await awaitRequest(
            client
                .from(FINORA_CONFIG.tables.applicationReviews)
                .select([
                    "id",
                    "application_id",
                    "reviewer_id",
                    "decision",
                    "notes",
                    "decided_amount",
                    "decided_term_months",
                    "decided_annual_rate",
                    "created_at"
                ].join(","))
                .eq("application_id", id)
                .order("created_at", {
                    ascending: false
                }),
            "โหลดประวัติการพิจารณาใช้เวลานานเกินไป"
        );

        if (result.error) {
            throw result.error;
        }

        return result.data ?? [];
    }


    /* ========================================================================
       18. AUTHENTICATION UI HELPERS
       ======================================================================== */

    function refreshAuthUI() {
        const isSignedIn = Boolean(
            FINORA_STATE.session?.user
        );

        const user = FINORA_STATE.user ??
            FINORA_STATE.session?.user ??
            null;

        const profile = FINORA_STATE.profile;

        document.querySelectorAll("[data-finora-show-when]").forEach(
            (element) => {
                const requirement = element.dataset.finoraShowWhen;

                if (requirement === "signed-in") {
                    element.hidden = !isSignedIn;
                } else if (requirement === "signed-out") {
                    element.hidden = isSignedIn;
                }
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

        dispatchFinoraEvent("auth-ui-updated", {
            isSignedIn,
            user,
            profile
        });
    }


    /* ========================================================================
       19. INITIALIZATION
       ======================================================================== */

    async function initializeFinora() {
        if (FINORA_STATE.initialized) {
            return true;
        }

        if (FINORA_STATE.initializing) {
            return FINORA_STATE.initializing;
        }

        FINORA_STATE.initializing = (async () => {
            try {
                const client = await withTimeout(
                    getSupabaseClient(),
                    FINORA_CONFIG.timeout.initialization,
                    "เริ่มต้นระบบฐานข้อมูลใช้เวลานานเกินไป"
                );

                /*
                 * The internal Auth listener is attached as soon as the client
                 * is created. This code does not call Supabase initialize()
                 * manually: the SDK initializes its Auth client on construction.
                 */
                attachInternalAuthListener(client);

                const session = await withTimeout(
                    getSession(),
                    FINORA_CONFIG.timeout.authRequest + 1000,
                    "ตรวจสอบสถานะบัญชีใช้เวลานานเกินไป"
                );

                FINORA_STATE.session = session;
                FINORA_STATE.user = session?.user ?? null;

                if (session?.user) {
                    await withTimeout(
                        refreshProfile(),
                        FINORA_CONFIG.timeout.profileLoad,
                        "โหลดข้อมูลโปรไฟล์ใช้เวลานานเกินไป"
                    ).catch((error) => {
                        console.warn(
                            "FINORA could not load the profile during startup",
                            error
                        );

                        FINORA_STATE.profile = null;
                    });
                } else {
                    FINORA_STATE.profile = null;
                }

                refreshAuthUI();

                bindFinoraForms();
                bindFinoraLogoutButtons();

                FINORA_STATE.initialized = true;
                FINORA_STATE.initializationError = null;

                dispatchFinoraEvent("ready", {
                    appName: FINORA_CONFIG.appName,
                    user: FINORA_STATE.user,
                    profile: FINORA_STATE.profile
                });

                return true;
            } catch (error) {
                FINORA_STATE.initializationError = error;

                handleError(error, {
                    context: "initializeFinora",
                    showMessage: false
                });

                refreshAuthUI();

                /*
                 * Do not mark an unsuccessful initialization as successful.
                 * A later call may retry after the connection is restored.
                 */
                throw error;
            } finally {
                FINORA_STATE.initializing = null;
            }
        })();

        return FINORA_STATE.initializing;
    }


    async function startFinora() {
        await initializeFinora();

        const selects = document.querySelectorAll(
            "[data-finora-loan-products]"
        );

        for (const select of selects) {
            try {
                await populateLoanProductSelect(select);
            } catch (error) {
                handleError(error, {
                    context: "populateLoanProductSelect",
                    showMessage: false
                });
            }
        }

        return true;
    }


    /* ========================================================================
       20. FORM BINDING
       ======================================================================== */

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
                            title: getFormValue(formData, "title"),
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
                            purpose: getFormValue(formData, "purpose"),
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
                            category: getFormValue(formData, "category"),
                            subject: getFormValue(formData, "subject"),
                            message: getFormValue(formData, "message")
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


    /* ========================================================================
       21. SAFE DOM HELPERS
       ======================================================================== */

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
            const label = typeof getLabel === "function"
                ? getLabel(record)
                : String(record ?? "");

            list.appendChild(
                createTextElement("li", label)
            );
        });

        container.appendChild(list);

        return true;
    }


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


    /* ========================================================================
       22. PUBLIC FINORA API
       ======================================================================== */

    const FINORA_API = {
        config: FINORA_CONFIG,

        state: FINORA_STATE,

        /*
         * ready resolves when the Supabase SDK and client have loaded.
         * The application should await this before using client methods.
         */
        ready: null,

        // Initialization.
        initialize: initializeFinora,
        start: startFinora,

        // Authentication.
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

        // User profile.
        getMyProfile,
        refreshProfile,
        updateMyProfile,

        // Legal documents and consent.
        getPublishedLegalDocument,
        getPublishedLegalDocuments,
        recordConsent,
        recordRequiredConsents,

        // Loan products.
        getActiveLoanProducts,
        getActiveLoanProduct,

        // Loan applications.
        getMyLoanApplications,
        getMyLoanApplication,
        submitLoanApplication,

        // Private documents.
        uploadApplicationDocument,
        getMyApplicationDocuments,
        downloadPrivateDocument,
        getPrivateDocumentSignedUrl,

        // Loans and payments.
        getMyLoanAccounts,
        getMyRepaymentSchedule,
        getMyPayments,

        // Announcements.
        getPublicAnnouncements,

        // Customer support.
        createSupportTicket,
        getMySupportTickets,

        // Staff queries; RLS must enforce the actual permissions.
        getDashboardApplications,
        getApplicationReviewHistory,

        // Forms and UI.
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

        // Helpers.
        isValidEmail,
        getFriendlyErrorMessage,
        handleError,
        safelyRun,
        makeResult,
        withTimeout
    };


    /*
     * Expose a stable Supabase facade immediately.
     *
     * Its Auth listener can be registered while the actual client is loading.
     * Other methods should be called after FINORA.ready or FINORA.initialize().
     */
    FINORA_API.supabase = supabaseFacade;

    Object.defineProperty(FINORA_API, "client", {
        enumerable: true,
        get() {
            return supabaseClient;
        }
    });


    /*
     * Begin loading the SDK without awaiting it at the top level.
     * This lets the page's independent startup controller run its own timer
     * rather than being blocked by a static module import.
     */
    const readyPromise = createSupabaseClient();

    readyPromise.catch((error) => {
        FINORA_STATE.initializationError = error;

        console.error(
            "FINORA could not load the Supabase SDK",
            error
        );

        dispatchFinoraEvent("sdk-load-error", {
            message: getFriendlyErrorMessage(error)
        });
    });

    FINORA_API.ready = readyPromise;


    /*
     * Publish the API before the asynchronous SDK load finishes.
     */
    window.FINORA = FINORA_API;

})();
