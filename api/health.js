export default function handler(req, res) {
  if (req.method !== "GET") {
    return res.status(405).json({ success: false, error: "Method not allowed." });
  }
  return res.status(200).json({ ok: true });
}
