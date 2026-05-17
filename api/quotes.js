import { ensureSchema, insertQuote, listQuotes, updateNotification, getRecentQuoteCount } from "./_lib/db.js";
import { sendQuoteNotification } from "./_lib/email.js";
import { clean, normalizeQuote, validatePayloadTypes, validateQuote, getClientIp, isAdminAuthorized, verifyTurnstile } from "./_lib/helpers.js";

export default async function handler(req, res) {
  try {
    await ensureSchema();

    if (req.method === "POST") {
      return await handleCreate(req, res);
    }
    if (req.method === "GET") {
      return await handleList(req, res);
    }
    return res.status(405).json({ success: false, error: "Method not allowed." });
  } catch (error) {
    console.error("quotes handler error:", error);
    return res.status(500).json({ success: false, error: "Server error." });
  }
}

async function handleCreate(req, res) {
  const ip = getClientIp(req);

  const recentCount = await getRecentQuoteCount(ip);
  if (recentCount >= 5) {
    return res.status(429).json({ success: false, error: "Too many requests. Please try again shortly." });
  }

  const body = req.body || {};

  const payloadError = validatePayloadTypes(body);
  if (payloadError) {
    return res.status(400).json({ success: false, error: payloadError });
  }

  if (clean(body.companyWebsite, 120)) {
    return res.status(200).json({ success: true });
  }

  const turnstileError = await verifyTurnstile(clean(body.turnstileToken, 4096), ip);
  if (turnstileError) {
    return res.status(400).json({ success: false, error: turnstileError });
  }

  const quote = normalizeQuote(body);
  const validationError = validateQuote(quote);
  if (validationError) {
    return res.status(400).json({ success: false, error: validationError });
  }

  const quoteId = await insertQuote(quote, ip, req.headers["user-agent"] || "");

  let notificationSent = false;
  let notificationError = "";

  try {
    notificationSent = await sendQuoteNotification({ id: quoteId, ...quote });
  } catch (error) {
    notificationError = error.message || "Notification failed.";
    console.error("quote_notification_failed:", { quoteId, error: error.message });
  }

  try {
    await updateNotification(quoteId, notificationSent, notificationError);
  } catch (error) {
    console.error("quote_notification_update_failed:", { quoteId, error: error.message });
  }

  return res.status(201).json({ success: true, id: quoteId, notificationQueued: true });
}

async function handleList(req, res) {
  if (!isAdminAuthorized(req)) {
    return res.status(401).json({ success: false, error: "Unauthorized." });
  }

  const quotes = await listQuotes();
  return res.status(200).json({ success: true, quotes });
}
