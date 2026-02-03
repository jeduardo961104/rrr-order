

/*********************************************************
 * ROUTING (SINGLE WEB APP, MULTIPLE VIEWS)
 *********************************************************/
function doGet(e) {
  const p = (e && e.parameter) ? e.parameter : {};

  // ✅ 1) Si el link trae draft, SIEMPRE abre Index (la vista del técnico)
  const hasDraft = !!p.draft && String(p.draft).trim() !== "";

  // ✅ 2) Si trae page, úsalo; si no, default Dashboard (pero draft manda)
  const pageRaw = hasDraft ? "Index" : String(p.page || "Dashboard").trim();

  // ✅ 3) Map case-insensitive -> nombre exacto de archivo HTML
  const map = {
    "dashboard": "Dashboard",
    "dispatcher": "Dispatcher",
    "history": "History",
    "database": "Database",
    "workstatus": "WorkStatus",
    "index": "Index"
  };

  const safePage = map[pageRaw.toLowerCase()] || "Dashboard";

  // ✅ Inyecta baseUrl a TODAS las páginas (para tu nav)
  const t = HtmlService.createTemplateFromFile(safePage);
  t.baseUrl = ScriptApp.getService().getUrl();

  // ✅ Si quieres, también puedes pasar draftId al Index desde template
  t.draft = hasDraft ? String(p.draft).trim() : "";

  return t.evaluate()
    .setTitle("RRR Repair Order - Shop")
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}



/*********************************************************
 * HTML INCLUDE HELPER (styles / nav)
 *********************************************************/
function include(file) {
  return HtmlService.createHtmlOutputFromFile(file).getContent();
}

/*********************************************************
 * SHEET HELPERS
 *********************************************************/
function getSS_() {
  return SpreadsheetApp.openById(CONFIG.SHEET_ID);
}

function ensureSheet_(name, headers) {
  const ss = getSS_();
  let sh = ss.getSheetByName(name);
  if (!sh) {
    sh = ss.insertSheet(name);
    if (headers && headers.length) sh.appendRow(headers);
  }
  return sh;
}

function ensureDraftsSheet_() {
  return ensureSheet_(CONFIG.DRAFTS_SHEET, [
    "DraftId",
    "CreatedAt",
    "TechName",
    "TechEmail",
    "DSP",
    "VehicleType",
    "VIN",
    "RepairDescription",
    "DraftStatus",
    "SubmittedAt",
    "RRR_ID"
  ]);
}

/*********************************************************
 * TECHS (FOR DISPATCHER DROPDOWN)
 * Sheet: TECHS | Col A = Name | Col B = Email
 *********************************************************/
/**
 * TECHS (FOR DISPATCHER DROPDOWN)
 * Sheet: TECHS | Col A = Name | Col B = Email
 */
function getTechs() {
  try {
    // Abrir el spreadsheet correcto usando CONFIG
    const ss = CONFIG.SHEET_ID
      ? SpreadsheetApp.openById(CONFIG.SHEET_ID)
      : SpreadsheetApp.getActiveSpreadsheet();

    const sh = ss.getSheetByName(CONFIG.TECHS_SHEET);
    if (!sh) {
      throw new Error(`Sheet not found: ${CONFIG.TECHS_SHEET}`);
    }

    const values = sh.getDataRange().getValues();
    const techs = [];

    for (let i = 1; i < values.length; i++) {
      const name = String(values[i][0] || "").trim();
      const email = String(values[i][1] || "").trim();

      if (name && email) {
        techs.push({ name, email });
      }
    }

    techs.sort((a, b) => a.name.localeCompare(b.name));

    return {
      ok: true,
      techs: techs
    };

  } catch (err) {
    console.error("getTechs failed:", err);
    throw err; // 👈 MUY IMPORTANTE para que el frontend no se quede en "Loading..."
  }
}



/*********************************************************
 * DISPATCHER → CREATE & SEND DRAFT
 *********************************************************/
function sendDraft(p) {
  const drafts = ensureDraftsSheet_();

  const tech = String(p.techName || "").trim();
  const email = String(p.techEmail || "").trim();
  const dsp = String(p.dspOrCustomer || "").trim();
  const vehicle = String(p.vehicleType || "").trim();
  const vin = String(p.vin || "").trim().toUpperCase();
  const desc = String(p.repairDescription || "").trim();

  if (!tech) throw new Error("Technician name required");
  if (!email) throw new Error("Technician email required");
  if (!/^[A-Z0-9]{8,17}$/.test(vin)) {
    throw new Error("VIN must be 8–17 alphanumeric characters");
  }

  const draftId =
    `RRR-${Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "yyyyMMdd-HHmmss")}-${Math.floor(Math.random() * 900 + 100)}`;

  drafts.appendRow([
    draftId,
    new Date(),
    tech,
    email,
    dsp,
    vehicle,
    vin,
    desc,
    "DRAFT",
    "",
    ""
  ]);

  const baseUrl = ScriptApp.getService().getUrl(); // /exec
  const link = `${baseUrl}?draft=${encodeURIComponent(draftId)}`;

  const subject = `RRR Draft • ${vin}${vehicle ? ` (${vehicle})` : ""}`;
  const body =
`RRR REPAIR ORDER (DRAFT)

Technician: ${tech}
VIN: ${vin}
Vehicle: ${vehicle || "N/A"}
DSP / Customer: ${dsp || "N/A"}

Repair Description:
${desc || "-"}

OPEN LINK (prefilled & locked):
${link}

If the link does not open, copy/paste into Chrome.`;

  MailApp.sendEmail(email, subject, body);

  return { ok: true, draftId, link };
}

/*********************************************************
 * LOAD DRAFT (TECHNICIAN SIDE)
 *********************************************************/
function getDraft(draftId) {
  const sh = ensureDraftsSheet_();
  const id = String(draftId || "").trim();
  if (!id) throw new Error("Missing draftId");

  const values = sh.getDataRange().getValues();
  for (let i = 1; i < values.length; i++) {
    if (String(values[i][0]).trim() === id) {
      return {
        ok: true,
        draftId: values[i][0],
        tech: values[i][2],
        email: values[i][3],
        dsp: values[i][4],
        vehicle: values[i][5],
        vin: values[i][6],
        desc: values[i][7],
        status: values[i][8]
      };
    }
  }
  throw new Error("Draft not found");
}

/*********************************************************
 * TECHNICIAN → SUBMIT FINAL RRR
 * Tech Sign = Column K | Supervisor Sign = Column L
 *********************************************************/
function submitForm(p) {
  const ss = getSS_();
  const answers = ss.getSheetByName(CONFIG.ANSWERS_SHEET);
  if (!answers) throw new Error("Missing answers sheet");

  const required = [
    p.mechanicName,
    p.vehicleType,
    p.vin,
    p.repairDescription,
    p.estimateTime,
    p.techConcerns,
    p.shopSupply,
    p.supervisorSign,
    p.technicianSign,
    p.date
  ];

  if (required.some(v => !v || String(v).trim() === "")) {
    throw new Error("Missing required fields");
  }

  const vinClean = String(p.vin).trim().toUpperCase();
  if (!/^[A-Z0-9]{8,17}$/.test(vinClean)) throw new Error("Invalid VIN");

  const rrrId =
    `RRR-${Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "yyyyMMdd-HHmmss")}-${Math.floor(Math.random() * 900 + 100)}`;

  // Save signatures
  const techSign = saveBase64Png_(p.technicianSign, `Technician_${rrrId}`);
  const supSign = saveBase64Png_(p.supervisorSign, `Supervisor_${rrrId}`);

  answers.appendRow([
    new Date(),                        // Timestamp
    rrrId,                             // RRR_ID
    String(p.mechanicName).trim(),     // MechanicName
    String(p.dspName || "").trim(),    // DSP/Customer
    String(p.vehicleType).trim(),      // VehicleType
    vinClean,                          // VIN
    String(p.repairDescription).trim(),// RepairDescription
    String(p.estimateTime).trim(),     // EstimateTime
    String(p.techConcerns).trim(),     // TechConcerns
    String(p.shopSupply).trim(),       // ShopSupply
    techSign.url,                      // TechnicianSignURL (K)
    supSign.url,                       // SupervisorSignURL (L)
    String(p.date).trim(),             // Date
    String(p.startTimeDate || "").trim(), // WorkUpdatedAt OR other (depends on your sheet)
    "NEW",                             // workStatus
    new Date()                         // Start Time Date (or WorkUpdatedAt) - keep as you had
  ]);

  if (p.draftId) markDraftSubmitted_(p.draftId, rrrId);

  return { ok: true, rrrId };
}

function markDraftSubmitted_(draftId, rrrId) {
  const sh = ensureDraftsSheet_();
  const values = sh.getDataRange().getValues();

  for (let i = 1; i < values.length; i++) {
    if (String(values[i][0]) === String(draftId)) {
      sh.getRange(i + 1, 9).setValue("SUBMITTED");
      sh.getRange(i + 1, 10).setValue(new Date());
      sh.getRange(i + 1, 11).setValue(rrrId);
      return;
    }
  }
}

/*********************************************************
 * DASHBOARD / HISTORY DATA (legacy)
 *********************************************************/
function getDashboardData() {
  const ss = SpreadsheetApp.openById(CONFIG.SHEET_ID);

  const ORDERS_TAB = "ORDERS";            // <- tu hoja real de órdenes
  const DRAFTS_TAB = CONFIG.DRAFTS_SHEET; // <- tu hoja real de drafts (ej "RRR_DRAFTS")

  const ordersSh = ss.getSheetByName(ORDERS_TAB);
  const draftsSh = ss.getSheetByName(DRAFTS_TAB);

  const debug = {
    file: ss.getName(),
    ordersTab: ORDERS_TAB,
    draftsTab: DRAFTS_TAB,
    ordersTabFound: !!ordersSh,
    draftsTabFound: !!draftsSh,
    ordersLastRow: ordersSh ? ordersSh.getLastRow() : 0,
    draftsLastRow: draftsSh ? draftsSh.getLastRow() : 0,
    tabs: ss.getSheets().map(s => s.getName())
  };

  // --- Helpers ---
  const normHeader = (h) => String(h || "").trim(); // exact header
  const toISO = (v) => {
    // Devuelve ISO si es Date; si es string no parseable, lo deja tal cual
    if (v instanceof Date && !isNaN(v.getTime())) return v.toISOString();
    // si viene como número serial o timestamp
    if (typeof v === "number") {
      const d = new Date(v);
      if (!isNaN(d.getTime())) return d.toISOString();
    }
    // Si viene como string, intenta parsearlo. Si falla, devuelve el string original.
    const s = String(v || "").trim();
    if (!s) return "";
    const d = new Date(s);
    if (!isNaN(d.getTime())) return d.toISOString();
    return s;
  };

  const readSheet = (sh) => {
    if (!sh || sh.getLastRow() < 2) return { rows: [], idx: {} };

    // Lee todo el rango
    const values = sh.getDataRange().getValues();
    const headers = values[0].map(normHeader);

    const idx = {};
    headers.forEach((h, i) => { if (h) idx[h] = i; });

    // rows sin header
    const rows = values.slice(1);
    return { rows, idx };
  };

  const pick = (row, idx, key) => {
    const i = idx[key];
    return (i === undefined) ? "" : row[i];
  };

  // --- ORDERS ---
  let orders = [];
  if (ordersSh) {
    const { rows, idx } = readSheet(ordersSh);

    orders = rows
      .map((row) => {
        const ts = pick(row, idx, "timestamp");
        return {
          rrrId: String(pick(row, idx, "rrrId") || ""),
          mechanic: String(pick(row, idx, "mechanic") || ""),
          vin: String(pick(row, idx, "VIN") || ""),           // tu header es "VIN"
          workStatus: String(pick(row, idx, "workStatus") || "NEW"),
          timestamp: toISO(ts)                                 // ISO para el front
        };
      })
      // filtra filas vacías (por si hay basura abajo)
      .filter(o => o.rrrId || o.vin || o.mechanic)
      // ordena por timestamp real si se puede
      .sort((a, b) => {
        const da = new Date(a.timestamp);
        const db = new Date(b.timestamp);
        const ta = isNaN(da.getTime()) ? 0 : da.getTime();
        const tb = isNaN(db.getTime()) ? 0 : db.getTime();
        return tb - ta;
      })
      .slice(0, 50);
  }

  // --- DRAFTS ---
  // NOTA: aquí necesitas que tu hoja tenga headers tipo:
  // createdAt, draftId, techName, vin (o VIN), draftStatus
  let drafts = [];
  if (draftsSh) {
    const { rows, idx } = readSheet(draftsSh);

    drafts = rows
      .map((row) => {
        const created = pick(row, idx, "createdAt");
        const vin = pick(row, idx, "vin") || pick(row, idx, "VIN");
        return {
          draftId: String(pick(row, idx, "draftId") || ""),
          techName: String(pick(row, idx, "techName") || ""),
          vin: String(vin || ""),
          draftStatus: String(pick(row, idx, "draftStatus") || ""),
          createdAt: toISO(created)
        };
      })
      .filter(d => d.draftId || d.vin || d.techName)
      .sort((a, b) => {
        const da = new Date(a.createdAt);
        const db = new Date(b.createdAt);
        const ta = isNaN(da.getTime()) ? 0 : da.getTime();
        const tb = isNaN(db.getTime()) ? 0 : db.getTime();
        return tb - ta;
      })
      .slice(0, 50);
  }

  return { orders, drafts, debug };
}


function getWorkStatusData(limit) {
  limit = Number(limit || 200);

  const ss = SpreadsheetApp.openById(CONFIG.SHEET_ID);
  const sh = ss.getSheetByName("ORDERS");
  if (!sh) throw new Error('Sheet "ORDERS" not found.');

  const lr = sh.getLastRow();
  if (lr < 2) return { orders: [] };

  const values = sh.getDataRange().getValues();
  const headers = values[0].map(h => String(h || "").trim());
  const idx = Object.fromEntries(headers.map((h, i) => [h, i]));

  // headers requeridos
  const required = ["rrrId", "mechanic", "VIN", "workStatus", "timestamp"];
  const missing = required.filter(k => idx[k] === undefined);
  if (missing.length) throw new Error("Missing headers in ORDERS: " + missing.join(", "));

  const pick = (row, key) => {
    const i = idx[key];
    return i === undefined ? "" : row[i];
  };

  // armar lista
  let orders = values.slice(1).map(row => ({
    rrrId: String(pick(row, "rrrId") || ""),
    mechanic: String(pick(row, "mechanic") || ""),
    vin: String(pick(row, "VIN") || ""),
    workStatus: String(pick(row, "workStatus") || "NEW").toUpperCase(),
    timestamp: pick(row, "timestamp") || "",
    workUpdatedAt: pick(row, "WorkUpdatedAt") || pick(row, "workUpdatedAt") || ""
  }))
  .filter(o => o.rrrId); // evita filas vacías

  // ordenar por created (si es Date real)
  orders.sort((a, b) => {
    const ta = (a.timestamp instanceof Date) ? a.timestamp.getTime() : new Date(a.timestamp).getTime();
    const tb = (b.timestamp instanceof Date) ? b.timestamp.getTime() : new Date(b.timestamp).getTime();
    return (isNaN(tb) ? 0 : tb) - (isNaN(ta) ? 0 : ta);
  });

  orders = orders.slice(0, Math.max(1, Math.min(limit, 500)));

  return { orders };
}
/*********************************************************
 * Update work status
 *********************************************************/

function updateOrderWorkStatus(rrrId, newStatus) {
  const allowed = ["NEW", "ONGOING", "COMPLETED"];
  newStatus = String(newStatus || "").toUpperCase().trim();
  rrrId = String(rrrId || "").trim();

  if (!rrrId) throw new Error("Missing rrrId.");
  if (!allowed.includes(newStatus)) throw new Error("Invalid status: " + newStatus);

  const ss = SpreadsheetApp.openById(CONFIG.SHEET_ID);
  const sh = ss.getSheetByName("ORDERS");
  if (!sh) throw new Error('Sheet "ORDERS" not found.');

  const values = sh.getDataRange().getValues();
  const headers = values[0].map(h => String(h || "").trim());
  const idx = Object.fromEntries(headers.map((h, i) => [h, i]));

  const colRrr = idx["rrrId"];
  const colStatus = idx["workStatus"];
  const colUpdated = idx["WorkUpdatedAt"] ?? idx["workUpdatedAt"]; // soporta ambos

  if (colRrr === undefined) throw new Error('Header "rrrId" not found.');
  if (colStatus === undefined) throw new Error('Header "workStatus" not found.');

  // buscar fila
  let rowIndex = -1; // index en values (0 = header)
  for (let r = 1; r < values.length; r++) {
    if (String(values[r][colRrr] || "").trim() === rrrId) {
      rowIndex = r;
      break;
    }
  }
  if (rowIndex === -1) throw new Error("Order not found: " + rrrId);

  // escribir status
  sh.getRange(rowIndex + 1, colStatus + 1).setValue(newStatus);

  // escribir WorkUpdatedAt si existe la columna
  if (colUpdated !== undefined) {
    sh.getRange(rowIndex + 1, colUpdated + 1).setValue(new Date());
  }

  return {
    ok: true,
    rrrId,
    workStatus: newStatus,
    updatedAt: new Date().toISOString()
  };
}

/*********************************************************
 * HISTORY V2 ENDPOINT (recommended)
 * Your History.html should call .getHistoryV2Data()
 *********************************************************/
function getHistoryV2Data() {
  const ss = SpreadsheetApp.openById(CONFIG.SHEET_ID);

  const ordersSh = ss.getSheetByName(CONFIG.ANSWERS_SHEET); // "ORDERS"
  const draftsSh = ss.getSheetByName(CONFIG.DRAFTS_SHEET);  // "DRAFTS"

  const debug = {
    APP_BUILD: "HistoryV2-2026-01-28",
    sheetId: CONFIG.SHEET_ID,
    file: ss.getName(),
    tabs: ss.getSheets().map(s => s.getName()),
    ordersTab: CONFIG.ANSWERS_SHEET,
    draftsTab: CONFIG.DRAFTS_SHEET,
    ordersFound: !!ordersSh,
    draftsFound: !!draftsSh,
    ordersLastRow: ordersSh ? ordersSh.getLastRow() : 0,
    draftsLastRow: draftsSh ? draftsSh.getLastRow() : 0,
  };

  if (!ordersSh || !draftsSh) {
    return { orders: [], drafts: [], debug };
  }

  const ordersRaw = sheetToObjectsByHeader_(ordersSh);
  const draftsRaw = sheetToObjectsByHeader_(draftsSh);

  const orders = ordersRaw.map(r => ({
    rrrId: pick_(r, ["RRR_ID", "RRR ID", "RRRID", "rrrId"]),
    mechanic: pick_(r, ["MechanicName", "Mechanic", "TechName", "Technician"]),
    vin: String(pick_(r, ["VIN", "Vin"]) || "").toUpperCase(),
    workStatus: pick_(r, ["workStatus", "WorkStatus", "Status"]) || "NEW",
    timestamp: pick_(r, ["Timestamp", "CreatedAt", "Created", "Date", "Start Time Date"]) || ""
  })).filter(x => x.rrrId || x.vin);

  const drafts = draftsRaw.map(r => ({
    draftId: pick_(r, ["DraftId", "Draft ID", "draftId"]),
    techName: pick_(r, ["TechName", "Tech", "MechanicName", "Name"]),
    vin: String(pick_(r, ["VIN", "Vin"]) || "").toUpperCase(),
    draftStatus: pick_(r, ["DraftStatus", "draftStatus", "Status"]) || "DRAFT",
    createdAt: pick_(r, ["CreatedAt", "Created", "Timestamp", "Date"]) || ""
  })).filter(x => x.draftId || x.vin);

  orders.sort((a, b) => dateValue_(b.timestamp) - dateValue_(a.timestamp));
  drafts.sort((a, b) => dateValue_(b.createdAt) - dateValue_(a.createdAt));

  debug.ordersCount = orders.length;
  debug.draftsCount = drafts.length;

  return {
    orders: orders.slice(0, 50),
    drafts: drafts.slice(0, 50),
    debug
  };
}

/*********************************************************
 * HELPERS for History V2
 *********************************************************/
function sheetToObjectsByHeader_(sheet) {
  const lastRow = sheet.getLastRow();
  const lastCol = sheet.getLastColumn();
  if (lastRow < 2 || lastCol < 1) return [];

  const values = sheet.getRange(1, 1, lastRow, lastCol).getValues();
  const headers = values[0].map(h => String(h || "").trim());

  const out = [];
  for (let i = 1; i < values.length; i++) {
    const row = values[i];
    if (row.every(v => v === "" || v === null)) continue;

    const obj = {};
    for (let c = 0; c < headers.length; c++) {
      const key = headers[c];
      if (!key) continue;
      obj[key] = row[c];
    }
    out.push(obj);
  }
  return out;
}

function pick_(obj, keys) {
  for (const k of keys) {
    if (Object.prototype.hasOwnProperty.call(obj, k)) {
      const v = obj[k];
      if (v !== "" && v !== null && v !== undefined) return v;
    }
  }
  return "";
}

function dateValue_(v) {
  const d = (v instanceof Date) ? v : new Date(v);
  const t = d.getTime();
  return isNaN(t) ? 0 : t;
}

/*********************************************************
 * DRIVE HELPER
 *********************************************************/
function saveBase64Png_(dataUrl, prefix) {
  const parts = String(dataUrl || "").split(",");
  if (parts.length < 2) throw new Error("Invalid base64 image");

  const bytes = Utilities.base64Decode(parts[1]);
  const blob = Utilities.newBlob(bytes, "image/png", `${prefix}.png`);

  const folder = DriveApp.getFolderById(CONFIG.DRIVE_FOLDER_ID);
  const file = folder.createFile(blob);
  file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
  return { id: file.getId(), url: file.getUrl() };
}

/*********************************************************
 * DEBUG / PING
 *********************************************************/
function debugDashboard() {
  const ss = SpreadsheetApp.openById(CONFIG.SHEET_ID);
  const ordersSh = ss.getSheetByName(CONFIG.ANSWERS_SHEET);
  const draftsSh = ss.getSheetByName(CONFIG.DRAFTS_SHEET);

  const ordersLastRow = ordersSh ? ordersSh.getLastRow() : 0;
  const draftsLastRow = draftsSh ? draftsSh.getLastRow() : 0;

  const sampleOrder = (ordersSh && ordersLastRow >= 2)
    ? ordersSh.getRange(2, 1, 1, Math.min(ordersSh.getLastColumn(), 10)).getValues()[0]
    : [];

  return {
    ok: true,
    file: ss.getName(),
    answersSheet: CONFIG.ANSWERS_SHEET,
    draftsSheet: CONFIG.DRAFTS_SHEET,
    ordersLastRow,
    draftsLastRow,
    sampleOrder
  };
}

function ping() {
  return {
    ok: true,
    message: "Backend reachable",
    time: new Date().toISOString()
  };
}

function ping2() {
  return "OK FROM SERVER";
}
function getHistoryV2Data() {
  try {
    const ss = SpreadsheetApp.openById(CONFIG.SHEET_ID);
    const ordersSh = ss.getSheetByName(CONFIG.ANSWERS_SHEET); // ORDERS
    const draftsSh = ss.getSheetByName(CONFIG.DRAFTS_SHEET);  // DRAFTS

    const debug = {
      APP_BUILD: "HistoryV2-FAST-2026-01-28",
      file: ss.getName(),
      sheetId: CONFIG.SHEET_ID,
      tabs: ss.getSheets().map(s => s.getName()),
      ordersTab: CONFIG.ANSWERS_SHEET,
      draftsTab: CONFIG.DRAFTS_SHEET,
      ordersFound: !!ordersSh,
      draftsFound: !!draftsSh,
      ordersLastRow: ordersSh ? ordersSh.getLastRow() : 0,
      draftsLastRow: draftsSh ? draftsSh.getLastRow() : 0,
    };

    if (!ordersSh || !draftsSh) return { orders: [], drafts: [], debug };

    // 👇 SOLO últimas filas (evita cuelgues por rangos enormes)
    const ordersRaw = readLastRowsAsObjects_(ordersSh, 200);
    const draftsRaw = readLastRowsAsObjects_(draftsSh, 300);

    const orders = ordersRaw.map(r => ({
      rrrId: pick_(r, ["RRR_ID"]),
      mechanic: pick_(r, ["MechanicName"]),
      vin: String(pick_(r, ["VIN"]) || "").toUpperCase(),
      workStatus: pick_(r, ["workStatus"]) || "NEW",
      timestamp: pick_(r, ["Timestamp"]) || ""
    })).filter(x => x.rrrId || x.vin);

    const drafts = draftsRaw.map(r => ({
      draftId: pick_(r, ["DraftId"]),
      techName: pick_(r, ["TechName"]),
      vin: String(pick_(r, ["VIN"]) || "").toUpperCase(),
      draftStatus: pick_(r, ["DraftStatus", "Status"]) || "DRAFT",
      createdAt: pick_(r, ["CreatedAt"]) || ""
    })).filter(x => x.draftId || x.vin);

    orders.sort((a,b)=> dateValue_(b.timestamp) - dateValue_(a.timestamp));
    drafts.sort((a,b)=> dateValue_(b.createdAt) - dateValue_(a.createdAt));

    debug.ordersCount = orders.length;
    debug.draftsCount = drafts.length;

    return { orders: orders.slice(0, 50), drafts: drafts.slice(0, 50), debug };

  } catch (err) {
    return {
      orders: [],
      drafts: [],
      debug: {
        APP_BUILD: "HistoryV2-FAST-ERROR-2026-01-28",
        error: String(err),
        stack: err && err.stack ? String(err.stack) : "NO_STACK"
      }
    };
  }
}
function ping() {
  return { ok: true, ts: new Date().toISOString(), where: "server" };
}




