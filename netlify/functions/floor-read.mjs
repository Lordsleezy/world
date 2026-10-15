const EMAIL = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;
const PHONE = /\b(?:\+?1[-.\s]?)?(?:\(?\d{3}\)?[-.\s]?)\d{3}[-.\s]?\d{4}\b/g;

function clean(value) {
  return String(value ?? "")
    .replace(EMAIL, "[private]")
    .replace(PHONE, "[private]")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 180);
}

function dollars(cents) {
  const n = Number(cents);
  if (!Number.isFinite(n)) return null;
  return Math.round(n / 100);
}

export async function handler(event) {
  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 204, headers: { "access-control-allow-origin": "*" } };
  }
  const expected = process.env.FLOOR_READ_TOKEN;
  const auth = event.headers?.authorization || event.headers?.Authorization || "";
  if (!expected || auth !== `Bearer ${expected}`) {
    return { statusCode: 401, body: JSON.stringify({ error: "unauthorized" }) };
  }
  const url = process.env.SUPABASE_URL;
  const key = process.env.WORLD_READER_KEY;
  if (!url || !key) {
    return { statusCode: 200, body: JSON.stringify({ configured: false, jobs: [], sales: [] }) };
  }
  const headers = { apikey: key, Authorization: `Bearer ${key}` };
  const base = url.replace(/\/$/, "");
  try {
    const [logsRes, salesRes] = await Promise.all([
      fetch(
        `${base}/rest/v1/world_feed?select=created_at,source,level,event,message&order=created_at.desc&limit=40`,
        { headers },
      ),
      fetch(
        `${base}/rest/v1/world_sales?select=created_at,channel,item_cents&order=created_at.desc&limit=8`,
        { headers },
      ),
    ]);
    const logs = logsRes.ok ? await logsRes.json() : [];
    const salesRows = salesRes.ok ? await salesRes.json() : [];
    const latest = new Map();
    for (const row of Array.isArray(logs) ? logs : []) {
      if (!row?.source || latest.has(row.source)) continue;
      latest.set(row.source, {
        source: String(row.source).slice(0, 40),
        level: row.level === "error" ? "error" : "info",
        summary: clean(row.message || row.event || row.source),
      });
    }
    const sales = [];
    for (const row of Array.isArray(salesRows) ? salesRows : []) {
      const amount = dollars(row.item_cents);
      if (amount == null) continue;
      sales.push({ channel: clean(row.channel || "the market"), amount, item: "an item" });
    }
    return {
      statusCode: 200,
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ configured: true, jobs: [...latest.values()], sales }),
    };
  } catch (err) {
    return {
      statusCode: 200,
      body: JSON.stringify({ configured: true, jobs: [], sales: [], error: "read failed" }),
    };
  }
}
