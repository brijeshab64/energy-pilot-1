import type { DemandObservation, Observation } from "./demoProvider";

export type ImportedDataset = { supply: Observation[]; demand: DemandObservation[]; importedAt: string; supplySource: string; demandSource: string };
const DB_NAME = "energypilot-data";
const STORE_NAME = "monthly-dataset";

function openDb() {
  return new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(STORE_NAME);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function readImportedDataset(): Promise<ImportedDataset | null> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const request = db.transaction(STORE_NAME).objectStore(STORE_NAME).get("active");
    request.onsuccess = () => resolve(request.result || null);
    request.onerror = () => reject(request.error);
  });
}

export async function saveImportedDataset(dataset: ImportedDataset) {
  const db = await openDb();
  return new Promise<void>((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, "readwrite");
    transaction.objectStore(STORE_NAME).put(dataset, "active");
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
  });
}

export async function clearImportedDataset() {
  const db = await openDb();
  return new Promise<void>((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, "readwrite");
    transaction.objectStore(STORE_NAME).delete("active");
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
  });
}

function parseCsv(text: string) {
  const rows: string[][] = [];
  let row: string[] = [], cell = "", quoted = false;
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (char === '"' && quoted && text[i + 1] === '"') { cell += '"'; i++; }
    else if (char === '"') quoted = !quoted;
    else if (char === "," && !quoted) { row.push(cell.trim()); cell = ""; }
    else if ((char === "\n" || char === "\r") && !quoted) {
      if (char === "\r" && text[i + 1] === "\n") i++;
      row.push(cell.trim());
      if (row.some(Boolean)) rows.push(row);
      row = []; cell = "";
    } else cell += char;
  }
  if (quoted) throw new Error("CSV has an unclosed quoted field.");
  if (cell || row.length) { row.push(cell.trim()); if (row.some(Boolean)) rows.push(row); }
  if (!rows.length) throw new Error("The selected CSV is empty.");
  const headers = rows.shift()!.map((value) => value.replace(/^\uFEFF/, "").toLowerCase());
  if (new Set(headers).size !== headers.length) throw new Error("CSV column names must be unique.");
  return rows.map((values, index) => Object.fromEntries(headers.map((header, i) => [header, values[i] ?? ""])) as Record<string, string>).filter(row => Object.values(row).some(Boolean));
}

function required(row: Record<string, string>, key: string, line: number) {
  const value = row[key]?.trim();
  if (!value) throw new Error(`Row ${line}: missing ${key}.`);
  return value;
}
function numberValue(row: Record<string, string>, key: string, line: number, min = 0) {
  const value = Number(required(row, key, line));
  if (!Number.isFinite(value) || value < min) throw new Error(`Row ${line}: ${key} must be a valid number greater than or equal to ${min}.`);
  return value;
}
function checkPeriod(period: string, line: number) {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(period)) throw new Error(`Row ${line}: period must use YYYY-MM.`);
}
function checkSource(row: Record<string, string>, line: number) {
  const source = required(row, "source", line);
  const report = required(row, "report", line);
  return { source, report };
}

export function parseSupplyCsv(text: string): Observation[] {
  const rows = parseCsv(text);
  const seen = new Set<string>();
  return rows.map((row, i) => {
    const line = i + 2;
    const period = required(row, "period", line); checkPeriod(period, line);
    const state = required(row, "state", line);
    const region = required(row, "region", line);
    const technology = required(row, "technology", line);
    const { source, report } = checkSource(row, line);
    const generationGWh = numberValue(row, "generation_gwh", line);
    const capacityMW = numberValue(row, "capacity_mw", line);
    const key = `${period}|${state}|${technology}`;
    if (seen.has(key)) throw new Error(`Row ${line}: duplicate supply record for ${state}, ${technology}, ${period}.`);
    seen.add(key);
    const [year, month] = period.split("-").map(Number);
    return { period, year, month, region, state, technology, sector: "Reported", station: `${state} ${technology}`, unit: "Imported", requirement: 0, supplied: 0, peak: 0, peakMet: 0, generationGWh, targetGWh: 0, capacityMW, plf: 0, availability: 0, emissionsMt: 0, status: "Imported · source not independently verified", source, report, quality: "Schema checked; source not verified", provenance: `User-imported monthly report · ${source} · ${report}` };
  });
}

export function parseDemandCsv(text: string): DemandObservation[] {
  const rows = parseCsv(text);
  const seen = new Set<string>();
  return rows.map((row, i) => {
    const line = i + 2;
    const period = required(row, "period", line); checkPeriod(period, line);
    const state = required(row, "state", line);
    const region = required(row, "region", line);
    const { source, report } = checkSource(row, line);
    const requirementMU = numberValue(row, "requirement_mu", line);
    const suppliedMU = numberValue(row, "supplied_mu", line);
    const peakMW = numberValue(row, "peak_mw", line);
    if (suppliedMU > requirementMU) throw new Error(`Row ${line}: supplied_mu cannot exceed requirement_mu in this import schema.`);
    const key = `${period}|${state}`;
    if (seen.has(key)) throw new Error(`Row ${line}: duplicate demand record for ${state}, ${period}.`);
    seen.add(key);
    const [year, month] = period.split("-").map(Number);
    return { period, year, month, region, state, requirementMU, suppliedMU, peakMW, status: "Imported · source not independently verified", source, report, quality: "Schema checked; source not verified", provenance: `User-imported monthly report · ${source} · ${report}` };
  });
}

export function validateImportedPair(supply: Observation[], demand: DemandObservation[]) {
  if (!supply.length || !demand.length) throw new Error("Both supply and demand CSVs are required for a staged monthly dataset.");
  const subtotalLabels = new Set(["all india", "india", "national", "all states", "total", "subtotal"]);
  const regionByState = new Map<string, string>();
  for (const row of [...supply, ...demand]) {
    if (!row.region || !row.state || subtotalLabels.has(row.state.toLowerCase())) throw new Error("Every row must represent a state or UT with its region. Regional and national subtotal rows are not allowed with state records.");
    const knownRegion = regionByState.get(row.state);
    if (knownRegion && knownRegion !== row.region) throw new Error(`Region mismatch for ${row.state}: found both ${knownRegion} and ${row.region}.`);
    regionByState.set(row.state, row.region);
  }
  const demandKeys = new Set(demand.map(row => `${row.period}|${row.state}`));
  const supplyKeys = new Set(supply.map(row => `${row.period}|${row.state}`));
  const missingDemand = [...supplyKeys].filter(key => !demandKeys.has(key));
  const missingSupply = [...demandKeys].filter(key => !supplyKeys.has(key));
  if (missingDemand.length || missingSupply.length) throw new Error(`Supply and demand coverage must match by state and month. ${missingDemand.length} supply state-months lack demand; ${missingSupply.length} demand state-months lack supply.`);
}

export const supplyTemplate = "period,region,state,technology,generation_gwh,capacity_mw,source,report\n2024-01,Western,Gujarat,Solar,0,0,CEA report title,report URL or identifier";
export const demandTemplate = "period,region,state,requirement_mu,supplied_mu,peak_mw,source,report\n2024-01,Western,Gujarat,0,0,0,Grid-India report title,report URL or identifier";
