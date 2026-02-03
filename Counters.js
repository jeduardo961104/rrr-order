function getNextOrderId(counterKey = CONFIG.DEFAULT_COUNTER_KEY) {
  const lock = LockService.getScriptLock();
  lock.waitLock(30000);

  try {
    const ss = SpreadsheetApp.openById(CONFIG.SHEET_ID);
    const sh = ss.getSheetByName(CONFIG.COUNTERS_SHEET);
    if (!sh) throw new Error(`Missing sheet: ${CONFIG.COUNTERS_SHEET}`);

    const values = sh.getDataRange().getValues();
    if (values.length < 2) throw new Error(`COUNTERS sheet has no data rows`);

    const headers = values[0].map(h =>
  String(h).trim().toLowerCase().replace(/\s+/g, "_")
);

    const col = (name) => {
      const idx = headers.indexOf(String(name).toLowerCase());
      if (idx === -1) throw new Error(`COUNTERS missing column: ${name}`);
      return idx;
    };

    const keyCol = col("key");
    const prefixCol = col("prefix");
    const paddingCol = col("padding");
    const lastCol = col("last_number");
    const updatedCol = col("updated_at");

    let rowIndex = -1;
    for (let r = 1; r < values.length; r++) {
      if (String(values[r][keyCol]).trim().toUpperCase() === String(counterKey).trim().toUpperCase()) {
        rowIndex = r;
        break;
      }
    }
    if (rowIndex === -1) throw new Error(`Counter key not found: ${counterKey}`);

    const prefix = String(values[rowIndex][prefixCol] ?? "RRR-");
    const padding = Number(values[rowIndex][paddingCol] ?? 6);
    const lastNumber = Number(values[rowIndex][lastCol] ?? 0);

    const nextNumber = lastNumber + 1;
    const padded = String(nextNumber).padStart(padding, "0");
    const nextId = `${prefix}${padded}`;

    const sheetRow = rowIndex + 1;
    sh.getRange(sheetRow, lastCol + 1).setValue(nextNumber);
    sh.getRange(sheetRow, updatedCol + 1).setValue(new Date());

    return nextId;
  } finally {
    lock.releaseLock();
  }
}
