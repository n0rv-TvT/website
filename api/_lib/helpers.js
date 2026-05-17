import { timingSafeEqual } from "node:crypto";

export function clean(value, maxLength) {
  if (typeof value !== "string") return "";

  return value
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maxLength);
}

export function normalizeQuote(body) {
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

export function validatePayloadTypes(body) {
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

export function validateQuote(quote) {
  if (!quote.name) return "Name is required.";
  if (!quote.phone) return "Phone is required.";
  if (!quote.moveType) return "Move type is required.";
  if (!quote.movingFrom) return "Moving from is required.";
  if (!quote.movingTo) return "Moving to is required.";
  if (!quote.details) return "Move details are required.";
  if (quote.email && !/^\S+@\S+\.\S+$/.test(quote.email)) return "Enter a valid email address.";
  return "";
}

export function getClientIp(req) {
  const forwarded = req.headers["x-forwarded-for"];
  if (typeof forwarded === "string" && forwarded) {
    return forwarded.split(",")[0].trim();
  }
  return req.socket?.remoteAddress || "unknown";
}

function safeEqual(a, b) {
  const aBuffer = Buffer.from(String(a));
  const bBuffer = Buffer.from(String(b));
  if (aBuffer.length !== bBuffer.length) return false;
  return timingSafeEqual(aBuffer, bBuffer);
}

export function isAdminAuthorized(req) {
  const authorization = req.headers.authorization || "";
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

export async function verifyTurnstile(token, ip) {
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
    return "Security check failed. Please try again.";
  } catch {
    return "Security check is unavailable. Please try again shortly.";
  }
}
