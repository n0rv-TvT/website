import { neon } from "@neondatabase/serverless";

function getSQL() {
  return neon(process.env.DATABASE_URL);
}

let initialized = false;

export async function ensureSchema() {
  if (initialized) return;
  const sql = getSQL();
  await sql`
    CREATE TABLE IF NOT EXISTS quote_requests (
      id SERIAL PRIMARY KEY,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
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
      notification_sent BOOLEAN NOT NULL DEFAULT FALSE,
      notification_error TEXT
    )
  `;
  initialized = true;
}

export async function insertQuote(quote, ip, userAgent) {
  const sql = getSQL();
  const rows = await sql`
    INSERT INTO quote_requests (name, phone, email, move_type, moving_from, moving_to, moving_date, move_size, details, ip, user_agent)
    VALUES (${quote.name}, ${quote.phone}, ${quote.email}, ${quote.moveType}, ${quote.movingFrom}, ${quote.movingTo}, ${quote.movingDate}, ${quote.moveSize}, ${quote.details}, ${ip}, ${userAgent})
    RETURNING id
  `;
  return rows[0].id;
}

export async function listQuotes() {
  const sql = getSQL();
  return await sql`
    SELECT id, created_at, name, phone, email, move_type, moving_from, moving_to, moving_date, move_size, details, notification_sent, notification_error
    FROM quote_requests
    ORDER BY id DESC
    LIMIT 100
  `;
}

export async function updateNotification(quoteId, sent, error) {
  const sql = getSQL();
  await sql`
    UPDATE quote_requests
    SET notification_sent = ${sent}, notification_error = ${error}
    WHERE id = ${quoteId}
  `;
}

export async function getRecentQuoteCount(ip) {
  const sql = getSQL();
  const rows = await sql`
    SELECT COUNT(*)::int AS count FROM quote_requests
    WHERE ip = ${ip} AND created_at > NOW() - INTERVAL '1 minute'
  `;
  return rows[0].count;
}
