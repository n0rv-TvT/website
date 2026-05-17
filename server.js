import { createServer } from "node:http";
import { readFile, mkdir } from "node:fs/promises";
import { existsSync, readFileSync } from "node:fs";
import { randomUUID, timingSafeEqual } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { DatabaseSync } from "node:sqlite";
import nodemailer from "nodemailer";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const publicDir = path.join(__dirname, "public");
loadEnv(path.join(__dirname, ".env"));
const dataDir = process.env.DATA_DIR ? path.resolve(process.env.DATA_DIR) : path.join(__dirname, "data");
const dbPath = path.join(dataDir, "quotes.sqlite");
const rateLimitWindowMs = 60_000;
const rateLimitMax = 5;
const adminAuthMax = 20;
const requestCounts = new Map();
const adminAuthAttempts = new Map();

const port = Number(process.env.PORT || 3000);
const trustedProxyIps = new Set(
  (process.env.TRUSTED_PROXY_IPS || "")
    .split(",")
    .map((ip) => normalizeIp(ip.trim()))
    .filter(Boolean)
);
await mkdir(dataDir, { recursive: true });

const db = new DatabaseSync(dbPath);
db.exec(`
  PRAGMA journal_mode = WAL;
  PRAGMA busy_timeout = 5000;
  PRAGMA foreign_keys = ON;
`);
db.exec(`
  CREATE TABLE IF NOT EXISTS quote_requests (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    name TEXT NOT NULL,
    phone TEXT NOT NULL,
    email TEXT,
    move_type TEXT NOT NULL,
    moving_from TEXT NOT NULL,
    moving_to TEXT NOT NULL,
    moving_date TEXT,
    move_size TEXT,
    details TEXT NOT NULL,
    ip TEXT,
    user_agent TEXT,
    notification_sent INTEGER NOT NULL DEFAULT 0,
    notification_error TEXT
  )
`);

const insertQuote = db.prepare(`
  INSERT INTO quote_requests (
    name,
    phone,
    email,
    move_type,
    moving_from,
    moving_to,
    moving_date,
    move_size,
    details,
    ip,
    user_agent
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`);

const updateNotification = db.prepare(`
  UPDATE quote_requests
  SET notification_sent = ?, notification_error = ?
  WHERE id = ?
`);

const listQuotes = db.prepare(`
  SELECT
    id,
    created_at,
    name,
    phone,
    email,
    move_type,
    moving_from,
    moving_to,
    moving_date,
    move_size,
    details,
    notification_sent,
    notification_error
  FROM quote_requests
  ORDER BY id DESC
  LIMIT 100
`);

const mimeTypes = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".ico": "image/x-icon",
};

const publicRootFiles = new Set([
  "/index.html",
  "/services.html",
  "/faq.html",
  "/admin.html",
  "/privacy.html",
  "/terms.html",
  "/styles.css",
  "/app.js",
]);
const publicAssetExtensions = new Set([".svg", ".png", ".jpg", ".jpeg", ".webp", ".ico"]);

const securityHeaders = {
  "Content-Security-Policy": [
    "default-src 'self'",
    "script-src 'self' https://challenges.cloudflare.com",
    "style-src 'self' https://fonts.googleapis.com",
    "font-src 'self' https://fonts.gstatic.com",
    "img-src 'self' data:",
    "connect-src 'self' https://challenges.cloudflare.com",
    "frame-src https://challenges.cloudflare.com",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    "object-src 'none'",
  ].join("; "),
  "Cross-Origin-Opener-Policy": "same-origin",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY",
  "Permissions-Policy": "camera=(), microphone=(), geolocation=(), payment=()",
};

const server = createServer(async (request, response) => {
  const startedAt = process.hrtime.bigint();
  const requestId = randomUUID();
  const ip = getClientIp(request);

  applySecurityHeaders(response);
  response.setHeader("X-Request-Id", requestId);

  response.on("finish", () => {
    const durationMs = Number(process.hrtime.bigint() - startedAt) / 1_000_000;
    log("info", "request", {
      requestId,
      method: request.method,
      path: request.url,
      statusCode: response.statusCode,
      durationMs: Math.round(durationMs),
      ip,
    });
  });

  try {
    const url = new URL(request.url || "/", `http://${request.headers.host || "localhost"}`);

    if (url.pathname === "/api/health" && request.method === "GET") {
      return sendJson(response, 200, { ok: true });
    }

    if (url.pathname === "/api/config" && request.method === "GET") {
      return sendJson(response, 200, { turnstileSiteKey: process.env.PUBLIC_TURNSTILE_SITE_KEY || "" });
    }

    if (url.pathname === "/api/quotes" && request.method === "POST") {
      return handleQuoteCreate(request, response);
    }

    if (url.pathname === "/api/quotes" && request.method === "GET") {
      return handleQuoteList(request, response);
    }

    if (request.method !== "GET" && request.method !== "HEAD") {
      return sendJson(response, 405, { success: false, error: "Method not allowed." });
    }

    return serveStatic(url.pathname, response, request.method === "HEAD");
  } catch (error) {
    log("error", "unhandled_request_error", { requestId, error: serializeError(error) });
    return sendJson(response, 500, { success: false, error: "Server error." });
  }
});

const rateLimitCleanup = setInterval(cleanupRateLimits, rateLimitWindowMs);
rateLimitCleanup.unref();

server.listen(port, "0.0.0.0", () => {
  log("info", "server_started", { port, host: "0.0.0.0", dbPath });
});

process.on("unhandledRejection", (error) => {
  log("error", "unhandled_rejection", { error: serializeError(error) });
});

process.on("uncaughtException", (error) => {
  log("fatal", "uncaught_exception", { error: serializeError(error) });
  process.exit(1);
});

async function handleQuoteCreate(request, response) {
  const ip = getClientIp(request);

  if (!isRateAllowed(ip)) {
    return sendJson(response, 429, { success: false, error: "Too many requests. Please try again shortly." });
  }

  const body = await readJsonBody(request);

  const payloadError = validatePayloadTypes(body);
  if (payloadError) {
    return sendJson(response, 400, { success: false, error: payloadError });
  }

  if (clean(body.companyWebsite, 120)) {
    return sendJson(response, 200, { success: true });
  }

  const turnstileError = await verifyTurnstile(clean(body.turnstileToken, 4096), ip);
  if (turnstileError) {
    return sendJson(response, 400, { success: false, error: turnstileError });
  }

  const quote = normalizeQuote(body);
  const validationError = validateQuote(quote);

  if (validationError) {
    return sendJson(response, 400, { success: false, error: validationError });
  }

  const result = insertQuote.run(
    quote.name,
    quote.phone,
    quote.email,
    quote.moveType,
    quote.movingFrom,
    quote.movingTo,
    quote.movingDate,
    quote.moveSize,
    quote.details,
    ip,
    request.headers["user-agent"] || ""
  );

  const quoteId = Number(result.lastInsertRowid);
  void queueQuoteNotification(quoteId, quote);

  return sendJson(response, 201, { success: true, id: quoteId, notificationQueued: true });
}

function handleQuoteList(request, response) {
  if (!isAdminAuthorized(request)) {
    if (!isAdminAuthAllowed(getClientIp(request))) {
      return sendJson(response, 429, { success: false, error: "Too many admin login attempts. Please try again shortly." });
    }

    return sendJson(response, 401, { success: false, error: "Unauthorized." });
  }

  return sendJson(response, 200, { success: true, quotes: listQuotes.all() });
}

function isAdminAuthorized(request) {
  const authorization = request.headers.authorization || "";
  const token = process.env.ADMIN_TOKEN || "";

  if (token && authorization.startsWith("Bearer ") && safeEqual(authorization.slice("Bearer ".length), token)) return true;

  if (!authorization.startsWith("Basic ")) return false;

  const expectedPassword = process.env.ADMIN_PASSWORD || token;
  if (!expectedPassword) return false;

  const expectedUsername = process.env.ADMIN_USERNAME || "admin";
  const decoded = decodeBasicAuth(authorization);

  if (!decoded) return false;

  return safeEqual(decoded.username, expectedUsername) && safeEqual(decoded.password, expectedPassword);
}

function decodeBasicAuth(authorization) {
  try {
    const decoded = Buffer.from(authorization.slice("Basic ".length), "base64").toString("utf8");
    const separatorIndex = decoded.indexOf(":");
    if (separatorIndex === -1) return null;
    return {
      username: decoded.slice(0, separatorIndex),
      password: decoded.slice(separatorIndex + 1),
    };
  } catch {
    return null;
  }
}

function safeEqual(a, b) {
  const aBuffer = Buffer.from(String(a));
  const bBuffer = Buffer.from(String(b));
  if (aBuffer.length !== bBuffer.length) return false;
  return timingSafeEqual(aBuffer, bBuffer);
}

async function serveStatic(pathname, response, headOnly = false) {
  const finalPath = resolvePublicFilePath(pathname);

  if (!finalPath || !existsSync(finalPath)) {
    return sendText(response, 404, "Not found");
  }

  const extension = path.extname(finalPath).toLowerCase();
  const contentType = mimeTypes[extension] || "application/octet-stream";

  try {
    const content = await readFile(finalPath);
    response.writeHead(200, {
      "Content-Type": contentType,
      "Cache-Control": extension === ".html" ? "no-cache" : "public, max-age=86400, must-revalidate",
    });
    if (!headOnly) response.end(content);
    else response.end();
  } catch {
    sendText(response, 404, "Not found");
  }
}

function resolvePublicFilePath(pathname) {
  let safePathname;

  try {
    safePathname = decodeURIComponent(pathname).split("?")[0];
  } catch {
    return null;
  }

  if (!safePathname.startsWith("/") || safePathname.includes("\0") || safePathname.includes("\\")) {
    return null;
  }

  if (safePathname.split("/").some((part) => part.startsWith("."))) {
    return null;
  }

  const requestedPath = safePathname === "/" ? "/index.html" : safePathname;
  const extension = path.extname(requestedPath).toLowerCase();

  if (publicRootFiles.has(requestedPath)) {
    return path.join(publicDir, requestedPath);
  }

  if (!requestedPath.startsWith("/assets/") || !publicAssetExtensions.has(extension)) {
    return null;
  }

  const filePath = path.normalize(path.join(publicDir, requestedPath));
  const assetsRoot = path.join(publicDir, "assets") + path.sep;

  if (!filePath.startsWith(assetsRoot)) {
    return null;
  }

  return filePath;
}

async function readJsonBody(request) {
  let body = "";

  for await (const chunk of request) {
    body += chunk;
    if (body.length > 65_536) {
      throw new Error("Request body too large.");
    }
  }

  try {
    return body ? JSON.parse(body) : {};
  } catch {
    return {};
  }
}

function normalizeQuote(body) {
  return {
    name: clean(body.name, 120),
    phone: clean(body.phone, 80),
    email: clean(body.email, 160),
    moveType: clean(body.moveType, 120),
    movingFrom: clean(body.movingFrom, 240),
    movingTo: clean(body.movingTo, 240),
    movingDate: clean(body.movingDate, 40),
    moveSize: clean(body.moveSize, 120),
    details: clean(body.details, 2000),
  };
}

function validatePayloadTypes(body) {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return "Invalid JSON body.";
  }

  const stringFields = [
    "name",
    "phone",
    "email",
    "moveType",
    "movingFrom",
    "movingTo",
    "movingDate",
    "moveSize",
    "details",
    "companyWebsite",
    "turnstileToken",
  ];

  for (const field of stringFields) {
    const value = body[field];
    if (value === undefined || value === null) continue;
    if (typeof value !== "string") return `${field} must be text.`;
  }

  return "";
}

function validateQuote(quote) {
  if (!quote.name) return "Name is required.";
  if (!quote.phone) return "Phone is required.";
  if (!quote.moveType) return "Move type is required.";
  if (!quote.movingFrom) return "Moving from is required.";
  if (!quote.movingTo) return "Moving to is required.";
  if (!quote.details) return "Move details are required.";
  if (quote.email && !/^\S+@\S+\.\S+$/.test(quote.email)) return "Enter a valid email address.";
  return "";
}

function clean(value, maxLength) {
  if (typeof value !== "string") return "";

  return value
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maxLength);
}

async function sendQuoteNotification(quote) {
  const required = ["SMTP_HOST", "SMTP_PORT", "SMTP_USER", "SMTP_PASS", "QUOTE_NOTIFY_EMAIL"];
  const configured = required.every((key) => process.env[key]);

  if (!configured) {
    log("info", "quote_saved_without_smtp", { quoteId: quote.id });
    return false;
  }

  const timeoutMs = Math.max(1000, Number.parseInt(process.env.SMTP_TIMEOUT_MS || "15000", 10) || 15000);

  const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT || 587),
    secure: process.env.SMTP_SECURE === "true",
    connectionTimeout: timeoutMs,
    greetingTimeout: timeoutMs,
    socketTimeout: timeoutMs,
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
  });

  const subject = `New moving quote request from ${quote.name}`;
  const text = [
    `Quote ID: ${quote.id}`,
    `Name: ${quote.name}`,
    `Phone: ${quote.phone}`,
    `Email: ${quote.email || "Not provided"}`,
    `Move type: ${quote.moveType}`,
    `Moving from: ${quote.movingFrom}`,
    `Moving to: ${quote.movingTo}`,
    `Moving date: ${quote.movingDate || "Not provided"}`,
    `Rooms or size: ${quote.moveSize || "Not provided"}`,
    "",
    "Details:",
    quote.details,
  ].join("\n");

  await transporter.sendMail({
    to: process.env.QUOTE_NOTIFY_EMAIL,
    from: process.env.QUOTE_FROM_EMAIL || process.env.SMTP_USER,
    replyTo: quote.email || undefined,
    subject,
    text,
  });

  return true;
}

async function queueQuoteNotification(quoteId, quote) {
  let notificationSent = false;
  let notificationError = "";

  try {
    notificationSent = await sendQuoteNotification({ id: quoteId, ...quote });
    if (notificationSent) log("info", "quote_notification_sent", { quoteId });
  } catch (error) {
    notificationError = error.message || "Notification failed.";
    log("error", "quote_notification_failed", { quoteId, error: serializeError(error) });
  }

  try {
    updateNotification.run(notificationSent ? 1 : 0, notificationError, quoteId);
  } catch (error) {
    log("error", "quote_notification_update_failed", { quoteId, error: serializeError(error) });
  }
}

async function verifyTurnstile(token, ip) {
  if (!process.env.TURNSTILE_SECRET_KEY) return "";
  if (!token) return "Please complete the security check.";

  const body = new URLSearchParams({
    secret: process.env.TURNSTILE_SECRET_KEY,
    response: token,
    remoteip: ip,
  });

  try {
    const response = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body,
      signal: AbortSignal.timeout(10000),
    });
    const result = await response.json();

    if (result.success) return "";

    log("info", "turnstile_failed", { errorCodes: result["error-codes"] || [] });
    return "Security check failed. Please try again.";
  } catch (error) {
    log("error", "turnstile_verify_error", { error: serializeError(error) });
    return "Security check is unavailable. Please try again shortly.";
  }
}

function isRateAllowed(ip) {
  const now = Date.now();
  const record = requestCounts.get(ip) || { count: 0, expiresAt: now + rateLimitWindowMs };

  if (record.expiresAt < now) {
    record.count = 0;
    record.expiresAt = now + rateLimitWindowMs;
  }

  record.count += 1;
  requestCounts.set(ip, record);
  return record.count <= rateLimitMax;
}

function cleanupRateLimits() {
  const now = Date.now();

  for (const [ip, record] of requestCounts.entries()) {
    if (record.expiresAt < now) requestCounts.delete(ip);
  }

  for (const [ip, record] of adminAuthAttempts.entries()) {
    if (record.expiresAt < now) adminAuthAttempts.delete(ip);
  }
}

function isAdminAuthAllowed(ip) {
  const now = Date.now();
  const record = adminAuthAttempts.get(ip) || { count: 0, expiresAt: now + rateLimitWindowMs };

  if (record.expiresAt < now) {
    record.count = 0;
    record.expiresAt = now + rateLimitWindowMs;
  }

  record.count += 1;
  adminAuthAttempts.set(ip, record);
  return record.count <= adminAuthMax;
}

function getClientIp(request) {
  const remoteAddress = normalizeIp(request.socket.remoteAddress || "unknown");
  const forwarded = request.headers["x-forwarded-for"];

  if (trustedProxyIps.has(remoteAddress) && typeof forwarded === "string" && forwarded) {
    return normalizeIp(forwarded.split(",")[0].trim());
  }

  return remoteAddress;
}

function normalizeIp(ip) {
  if (!ip) return "";
  return ip.startsWith("::ffff:") ? ip.slice(7) : ip;
}

function sendJson(response, statusCode, data) {
  response.writeHead(statusCode, { "Content-Type": "application/json; charset=utf-8" });
  response.end(JSON.stringify(data));
}

function sendText(response, statusCode, text) {
  response.writeHead(statusCode, { "Content-Type": "text/plain; charset=utf-8" });
  response.end(text);
}

function applySecurityHeaders(response) {
  for (const [header, value] of Object.entries(securityHeaders)) {
    response.setHeader(header, value);
  }
}

function log(level, message, fields = {}) {
  const entry = {
    time: new Date().toISOString(),
    level,
    message,
    ...fields,
  };

  const line = JSON.stringify(entry);
  if (level === "error" || level === "fatal") console.error(line);
  else console.log(line);
}

function serializeError(error) {
  if (!error || typeof error !== "object") return { message: String(error) };
  return {
    name: error.name,
    message: error.message,
    stack: process.env.NODE_ENV === "production" ? undefined : error.stack,
  };
}

function loadEnv(envPath) {
  if (!existsSync(envPath)) return;

  const lines = readFileSync(envPath, "utf8").split(/\r?\n/);

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const equalsIndex = trimmed.indexOf("=");
    if (equalsIndex === -1) continue;
    const key = trimmed.slice(0, equalsIndex).trim();
    const value = trimmed.slice(equalsIndex + 1).trim().replace(/^['"]|['"]$/g, "");
    if (!process.env[key]) process.env[key] = value;
  }
}
