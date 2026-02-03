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
  limit = Number(limit || 50);

  const ss = SpreadsheetApp.openById(CONFIG.SHEET_ID);
  const sh = ss.getSheetByName(CONFIG.ANSWERS_SHEET); // debe ser "ORDERS"
  if (!sh) throw new Error(`Missing sheet: ${CONFIG.ANSWERS_SHEET}`);

  const lastRow = sh.getLastRow();
  const lastCol = sh.getLastColumn();

  // Debug: confirma que estás en la hoja correcta y su estructura
  console.log("Sheet:", sh.getName(), "lastRow:", lastRow, "lastCol:", lastCol);

  if (lastRow < 2) return { ok: true, orders: [] }; // solo headers o vacío

  // A:P = 16 columnas (como createOrder)
  const COLS = 16;

  const startRow = Math.max(2, lastRow - limit + 1);
  const numRows = lastRow - startRow + 1;

  const values = sh.getRange(startRow, 1, numRows, COLS).getValues();

  const orders = values
    .filter(r => r[0]) // requiere OrderId en col A
    .map(r => ({
      orderId: r[0],         // A
      workStatus: r[1],      // B
      van: r[2],             // C
      associate: r[3],       // D
      issueType: r[4],       // E
      description: r[5],     // F
      priority: r[6],        // G
      eta: r[7],             // H
      mechanic: r[8],        // I
      createdAt: r[9],       // J
      startedAt: r[10],      // K
      completedAt: r[11],    // L
      pauseReason: r[12],    // M
      pausedSeconds: r[13],  // N
      finalNotes: r[14],     // O
      qcCheck: r[15]         // P
    }));

  // Devuelve en orden más reciente primero (opcional)
  orders.reverse();

  return { ok: true, orders, sheet: sh.getName(), rows: numRows };
}






