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

  const subject = `New Quote Request #${quote.id} — ${quote.name}`;

  const text = [
    "NEW MOVING QUOTE REQUEST",
    "========================",
    "",
    `Reference: #${quote.id}`,
    `Submitted: ${new Date().toLocaleString("en-US", { timeZone: "America/Chicago", dateStyle: "medium", timeStyle: "short" })}`,
    "",
    "CUSTOMER INFORMATION",
    "--------------------",
    `Name:       ${quote.name}`,
    `Phone:      ${quote.phone}`,
    `Email:      ${quote.email || "Not provided"}`,
    "",
    "MOVE DETAILS",
    "------------",
    `Type:       ${quote.moveType}`,
    `From:       ${quote.movingFrom}`,
    `To:         ${quote.movingTo}`,
    `Date:       ${quote.movingDate || "Not specified"}`,
    `Size:       ${quote.moveSize || "Not specified"}`,
    "",
    "ADDITIONAL DETAILS",
    "------------------",
    quote.details,
    "",
    "---",
    "ACTION REQUIRED: Review this request and respond to the customer within 2 hours during business hours.",
    quote.email ? `Reply directly to this email to reach ${quote.name} at ${quote.email}.` : `Call ${quote.name} at ${quote.phone} to follow up.`,
    "",
    "— U&U Movers Notification System",
  ].join("\n");

  const html = `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8" /><meta name="viewport" content="width=device-width" /></head>
<body style="margin:0;padding:0;background:#f4f5f7;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f5f7;padding:32px 16px;">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:8px;overflow:hidden;box-shadow:0 1px 4px rgba(0,0,0,0.08);">
        <!-- Header -->
        <tr>
          <td style="background:#111317;padding:24px 32px;">
            <h1 style="margin:0;color:#ffffff;font-size:18px;font-weight:700;">U&U Movers</h1>
          </td>
        </tr>
        <!-- Title -->
        <tr>
          <td style="padding:32px 32px 16px;">
            <p style="margin:0 0 4px;font-size:12px;font-weight:600;text-transform:uppercase;letter-spacing:0.5px;color:#dc2626;">New Quote Request</p>
            <h2 style="margin:0;font-size:22px;color:#111317;">Quote #${quote.id} — ${quote.name}</h2>
            <p style="margin:8px 0 0;font-size:13px;color:#6b7280;">Received ${new Date().toLocaleString("en-US", { timeZone: "America/Chicago", dateStyle: "full", timeStyle: "short" })}</p>
          </td>
        </tr>
        <!-- Customer Info -->
        <tr>
          <td style="padding:16px 32px;">
            <table width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #e5e7eb;border-radius:6px;overflow:hidden;">
              <tr style="background:#f9fafb;">
                <td colspan="2" style="padding:12px 16px;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.5px;color:#374151;border-bottom:1px solid #e5e7eb;">Customer Information</td>
              </tr>
              <tr>
                <td style="padding:10px 16px;font-size:13px;color:#6b7280;width:100px;border-bottom:1px solid #f3f4f6;">Name</td>
                <td style="padding:10px 16px;font-size:14px;color:#111317;font-weight:600;border-bottom:1px solid #f3f4f6;">${quote.name}</td>
              </tr>
              <tr>
                <td style="padding:10px 16px;font-size:13px;color:#6b7280;border-bottom:1px solid #f3f4f6;">Phone</td>
                <td style="padding:10px 16px;font-size:14px;color:#111317;border-bottom:1px solid #f3f4f6;"><a href="tel:${quote.phone}" style="color:#111317;text-decoration:none;font-weight:600;">${quote.phone}</a></td>
              </tr>
              <tr>
                <td style="padding:10px 16px;font-size:13px;color:#6b7280;">Email</td>
                <td style="padding:10px 16px;font-size:14px;color:#111317;">${quote.email ? `<a href="mailto:${quote.email}" style="color:#2563eb;text-decoration:none;">${quote.email}</a>` : '<span style="color:#9ca3af;">Not provided</span>'}</td>
              </tr>
            </table>
          </td>
        </tr>
        <!-- Move Details -->
        <tr>
          <td style="padding:8px 32px 16px;">
            <table width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #e5e7eb;border-radius:6px;overflow:hidden;">
              <tr style="background:#f9fafb;">
                <td colspan="2" style="padding:12px 16px;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.5px;color:#374151;border-bottom:1px solid #e5e7eb;">Move Details</td>
              </tr>
              <tr>
                <td style="padding:10px 16px;font-size:13px;color:#6b7280;width:100px;border-bottom:1px solid #f3f4f6;">Type</td>
                <td style="padding:10px 16px;font-size:14px;color:#111317;font-weight:600;border-bottom:1px solid #f3f4f6;">${quote.moveType}</td>
              </tr>
              <tr>
                <td style="padding:10px 16px;font-size:13px;color:#6b7280;border-bottom:1px solid #f3f4f6;">From</td>
                <td style="padding:10px 16px;font-size:14px;color:#111317;border-bottom:1px solid #f3f4f6;">${quote.movingFrom}</td>
              </tr>
              <tr>
                <td style="padding:10px 16px;font-size:13px;color:#6b7280;border-bottom:1px solid #f3f4f6;">To</td>
                <td style="padding:10px 16px;font-size:14px;color:#111317;border-bottom:1px solid #f3f4f6;">${quote.movingTo}</td>
              </tr>
              <tr>
                <td style="padding:10px 16px;font-size:13px;color:#6b7280;border-bottom:1px solid #f3f4f6;">Date</td>
                <td style="padding:10px 16px;font-size:14px;color:#111317;border-bottom:1px solid #f3f4f6;">${quote.movingDate || '<span style="color:#9ca3af;">Not specified</span>'}</td>
              </tr>
              <tr>
                <td style="padding:10px 16px;font-size:13px;color:#6b7280;">Size</td>
                <td style="padding:10px 16px;font-size:14px;color:#111317;">${quote.moveSize || '<span style="color:#9ca3af;">Not specified</span>'}</td>
              </tr>
            </table>
          </td>
        </tr>
        <!-- Additional Details -->
        <tr>
          <td style="padding:8px 32px 24px;">
            <div style="border:1px solid #e5e7eb;border-radius:6px;overflow:hidden;">
              <div style="background:#f9fafb;padding:12px 16px;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.5px;color:#374151;border-bottom:1px solid #e5e7eb;">Additional Details</div>
              <div style="padding:14px 16px;font-size:14px;color:#374151;line-height:1.6;white-space:pre-wrap;">${quote.details}</div>
            </div>
          </td>
        </tr>
        <!-- Action -->
        <tr>
          <td style="padding:0 32px 32px;">
            <div style="background:#fef2f2;border:1px solid #fecaca;border-radius:6px;padding:16px;">
              <p style="margin:0;font-size:13px;color:#991b1b;font-weight:600;">Action Required</p>
              <p style="margin:6px 0 0;font-size:13px;color:#7f1d1d;">Please review and respond to this customer within 2 hours during business hours.</p>
            </div>
          </td>
        </tr>
        <!-- Footer -->
        <tr>
          <td style="background:#f9fafb;padding:20px 32px;border-top:1px solid #e5e7eb;">
            <p style="margin:0;font-size:12px;color:#9ca3af;">This is an automated notification from U&U Movers quote system. Do not forward this email — it contains customer information.</p>
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`.trim();

  await transporter.sendMail({
    to: process.env.QUOTE_NOTIFY_EMAIL,
    from: process.env.QUOTE_FROM_EMAIL || process.env.SMTP_USER,
    replyTo: quote.email || undefined,
    subject,
    text,
    html,
  });

  return true;
}
