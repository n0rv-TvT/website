import { createTransport } from "nodemailer";

export async function sendQuoteNotification(quote) {
  const required = ["SMTP_HOST", "SMTP_PORT", "SMTP_USER", "SMTP_PASS", "QUOTE_NOTIFY_EMAIL"];
  const configured = required.every((key) => process.env[key]);

  if (!configured) return false;

  const timeoutMs = Math.max(1000, Number.parseInt(process.env.SMTP_TIMEOUT_MS || "15000", 10) || 15000);

  const transporter = createTransport({
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
