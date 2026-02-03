function createOrder(payload) {
  const ss = SpreadsheetApp.openById(CONFIG.SHEET_ID);
  const sh = ss.getSheetByName(CONFIG.ANSWERS_SHEET); // "ORDERS"
  if (!sh) throw new Error(`Missing sheet: ${CONFIG.ANSWERS_SHEET}`);

  const orderId = getNextOrderId("ORDER");
  const now = new Date();

  const status = "NEW";

  const row = [
    orderId,                  // A Order ID (RRR ID)
    status,                   // B Work Status
    payload.van || "",         // C Van/Unit
    payload.associate || "",   // D Associated / Customer
    payload.issueType || "",   // E Issue Type
    payload.description || "", // F Description
    payload.priority || "MED", // G Priority
    payload.eta || "",         // H ETA
    payload.mechanic || "",    // I Mechanic
    now,                       // J CreatedAt (timestamp)
    "",                        // K StartedAt
    "",                        // L CompletedAt
    "",                        // M PauseReason
    0,                         // N PausedSeconds
    "",                        // O FinalNotes
    false                      // P QC Check
  ];

  sh.appendRow(row);

  return { ok: true, orderId, status, createdAt: now };
}
function debugOrdersSheet() {
  const ss = SpreadsheetApp.openById(CONFIG.SHEET_ID);

  const out = {
    sheetId: CONFIG.SHEET_ID,
    spreadsheetName: ss.getName(),
    spreadsheetUrl: ss.getUrl(),
    configAnswersSheet: CONFIG.ANSWERS_SHEET,
    allSheets: ss.getSheets().map(s => s.getName()),
  };

  // Intenta abrir primero por CONFIG, si no, cae a "ORDERS"
  let sh = ss.getSheetByName(CONFIG.ANSWERS_SHEET);
  if (!sh) sh = ss.getSheetByName("ORDERS");

  if (!sh) {
    out.error = `No encuentro la hoja '${CONFIG.ANSWERS_SHEET}' ni 'ORDERS'`;
    return out;
  }

  out.usingSheet = sh.getName();
  out.lastRow = sh.getLastRow();
  out.lastCol = sh.getLastColumn();

  // Headers
  if (out.lastRow >= 1 && out.lastCol >= 1) {
    out.headers = sh.getRange(1, 1, 1, out.lastCol).getDisplayValues()[0];
  } else {
    out.headers = [];
  }

  // Muestra últimas 5 filas (A:P)
  const COLS = 16; // A..P
  if (out.lastRow >= 2) {
    const startRow = Math.max(2, out.lastRow - 4);
    const numRows = out.lastRow - startRow + 1;
    const rows = sh.getRange(startRow, 1, numRows, COLS).getDisplayValues();

    out.last5 = rows.map(r => ({
      orderId: r[0],
      status: r[1],
      van: r[2],
      associate: r[3],
      issueType: r[4],
      createdAt: r[9],
    }));
  } else {
    out.last5 = [];
  }

  return out;
}
