// ==============================
// ETA helpers
// ==============================
function parseEtaToMinutes(code) {
  const c = String(code || "").trim().toLowerCase();
  if (!c) return 0;

  // formatos válidos: 1h, 10h, 2d
  const m = c.match(/^(\d+)\s*([hd])$/);
  if (!m) return 0;

  const n = Number(m[1]);
  const u = m[2];
  if (!n) return 0;

  return u === "h" ? n * 60 : n * 24 * 60;
}

function computeDueAt(baseDate, etaCode) {
  if (!(baseDate instanceof Date) || isNaN(baseDate.getTime())) return "";

  const mins = parseEtaToMinutes(etaCode);
  if (!mins) return "";

  return new Date(baseDate.getTime() + mins * 60 * 1000);
}

// ==============================
// WorkStatus data (ALINEADO con tu Sheet real)
// Headers visibles en tu imagen:
// A timestamp
// B rrrid
// C mechanic
// D DSP/Customer
// E VehicleType
// F VIN
// G RepairDescription
// H EstimateTime
// ...
// M Date
// N WorkUpdatedAt
// O workStatus
// P Start Time Date
// ==============================
function getWorkStatusData(limit) {
  limit = Number(limit || 200);

  const ss = SpreadsheetApp.openById(CONFIG.SHEET_ID);
  const sh = ss.getSheetByName(CONFIG.ANSWERS_SHEET); // "ORDERS"
  if (!sh) throw new Error(`Missing sheet: ${CONFIG.ANSWERS_SHEET}`);

  const lr = sh.getLastRow();
  const lc = sh.getLastColumn();
  if (lr < 2) return { ok: true, orders: [], meta: { sheet: sh.getName(), lastRow: lr } };

  const values = sh.getRange(1, 1, lr, lc).getValues();
  const headers = values[0].map(h => String(h || "").trim());
  const idx = Object.fromEntries(headers.map((h, i) => [h, i]));

  // Helpers
  const pick = (row, key) => {
    const i = idx[key];
    return i === undefined ? "" : row[i];
  };
  const toISO = (v) => {
    if (v instanceof Date && !isNaN(v.getTime())) return v.toISOString();
    const s = String(v || "").trim();
    if (!s) return "";
    const d = new Date(s);
    return isNaN(d.getTime()) ? s : d.toISOString();
  };

  // Construye órdenes desde tu estructura REAL (form headers)
  let orders = values.slice(1).map(row => ({
    // front puede esperar orderId => lo mapeamos al rrrId
    orderId: String(pick(row, "rrrId") || "").trim(),
    rrrId: String(pick(row, "rrrId") || "").trim(),

    workStatus: String(pick(row, "workStatus") || "NEW").trim().toUpperCase(),

    mechanic: String(pick(row, "mechanic") || "").trim(),
    dspOrCustomer: String(pick(row, "DSP/Customer") || "").trim(),
    vehicleType: String(pick(row, "VehicleType") || "").trim(),
    vin: String(pick(row, "VIN") || "").trim().toUpperCase(),

    description: String(pick(row, "RepairDescription") || "").trim(),
    estimateTime: String(pick(row, "EstimateTime") || "").trim(),

    createdAt: toISO(pick(row, "timestamp")),
    workUpdatedAt: toISO(pick(row, "WorkUpdatedAt")),
  }))
  .filter(o => o.rrrId); // evita filas vacías

  // Ordenar por timestamp desc
  orders.sort((a, b) => {
    const ta = new Date(a.createdAt).getTime();
    const tb = new Date(b.createdAt).getTime();
    return (isNaN(tb) ? 0 : tb) - (isNaN(ta) ? 0 : ta);
  });

  orders = orders.slice(0, Math.max(1, Math.min(limit, 500)));

  return {
    ok: true,
    orders,
    meta: { sheet: sh.getName(), lastRow: lr, lastCol: lc }
  };
}





