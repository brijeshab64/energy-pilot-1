import * as pdfjs from "pdfjs-dist";
import pdfWorkerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";
import { createWorker } from "tesseract.js";
import * as XLSX from "xlsx";

pdfjs.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;

export type BillField = { key: string; label: string; value: string; unit: string; confidence: number; page: number; source: string; method: string; confirmed: boolean };
export type BillExtraction = { filename: string; pages: number; method: string; text: string; fields: BillField[]; rows: string[][] };

const rules: { key: string; label: string; unit: string; regex: RegExp; confidence: number }[] = [
  { key: "provider", label: "Electricity provider", unit: "", regex: /(?:distribution company|electricity provider|utility|\bdiscom\b)\s*[:\-]?\s*([A-Z][A-Z0-9 &()./-]{2,60})/i, confidence: .84 },
  { key: "account", label: "Consumer / account number", unit: "", regex: /(?:consumer no\.?|consumer number|account no\.?|account number|service connection no\.?)\s*[:\-]?\s*([A-Z0-9/-]{4,30})/i, confidence: .8 },
  { key: "category", label: "Consumer category", unit: "", regex: /(?:consumer category|tariff category|category)\s*[:\-]?\s*([A-Z0-9 -]{2,35})/i, confidence: .72 },
  { key: "tariff", label: "Tariff code / plan", unit: "", regex: /(?:tariff(?: code| category| plan)?|rate category)\s*[:\-]?\s*([A-Z0-9/-]{2,30})/i, confidence: .72 },
  { key: "region", label: "State / region", unit: "", regex: /(?:state|region)\s*[:\-]?\s*([A-Z][A-Z ]{2,30})/i, confidence: .7 },
  { key: "billingStart", label: "Billing start date", unit: "", regex: /(?:billing period from|period from|reading date from|from date|start date)\s*[:\-]?\s*(\d{1,2}[/-]\d{1,2}[/-]\d{2,4}|\d{4}-\d{2}-\d{2})/i, confidence: .82 },
  { key: "billingEnd", label: "Billing end date", unit: "", regex: /(?:billing period to|period to|reading date to|to date|end date)\s*[:\-]?\s*(\d{1,2}[/-]\d{1,2}[/-]\d{2,4}|\d{4}-\d{2}-\d{2})/i, confidence: .82 },
  { key: "issueDate", label: "Bill issue date", unit: "", regex: /(?:bill date|issue date|date of issue)\s*[:\-]?\s*(\d{1,2}[/-]\d{1,2}[/-]\d{2,4}|\d{4}-\d{2}-\d{2})/i, confidence: .78 },
  { key: "dueDate", label: "Due date", unit: "", regex: /(?:due date|pay by)\s*[:\-]?\s*(\d{1,2}[/-]\d{1,2}[/-]\d{2,4}|\d{4}-\d{2}-\d{2})/i, confidence: .78 },
  { key: "previousReading", label: "Previous meter reading", unit: "", regex: /(?:previous meter reading|previous reading|last reading)\s*[:\-]?\s*([\d,]+(?:\.\d+)?)/i, confidence: .76 },
  { key: "currentReading", label: "Current meter reading", unit: "", regex: /(?:current meter reading|present reading|current reading)\s*[:\-]?\s*([\d,]+(?:\.\d+)?)/i, confidence: .76 },
  { key: "multiplicationFactor", label: "Multiplication factor", unit: "", regex: /(?:multiplication factor|\bMF\b)\s*[:\-]?\s*([\d.]+)/i, confidence: .75 },
  { key: "days", label: "Billing days", unit: "days", regex: /(?:billing days|no\.? of days|days billed)\s*[:\-]?\s*(\d{1,3})/i, confidence: .84 },
  { key: "units", label: "Units consumed", unit: "kWh", regex: /(?:units consumed|consumption|energy consumed|total units|units)\s*[:\-]?\s*([\d,]+(?:\.\d+)?)\s*(kwh|units)?/i, confidence: .82 },
  { key: "maxDemand", label: "Maximum demand", unit: "kW/kVA", regex: /(?:maximum demand|max demand|recorded demand)\s*[:\-]?\s*([\d,.]+)\s*(kva|kw)?/i, confidence: .8 },
  { key: "powerFactor", label: "Power factor", unit: "", regex: /(?:power factor|\bpf\b)\s*[:\-]?\s*(0?\.\d{1,3}|1(?:\.0{1,3})?)/i, confidence: .8 },
  { key: "total", label: "Total amount payable", unit: "INR", regex: /(?:total amount payable|total bill|net amount payable|amount payable|current bill amount)\s*[:\-]?\s*(?:rs\.?|inr|₹)?\s*([\d,]+(?:\.\d{1,2})?)/i, confidence: .86 },
  { key: "fixed", label: "Fixed charge", unit: "INR", regex: /(?:fixed charge|customer charge)\s*[:\-]?\s*(?:rs\.?|₹)?\s*([\d,]+(?:\.\d{1,2})?)/i, confidence: .78 },
  { key: "energy", label: "Energy charge", unit: "INR", regex: /(?:energy charge|energy charges|units charges)\s*[:\-]?\s*(?:rs\.?|₹)?\s*([\d,]+(?:\.\d{1,2})?)/i, confidence: .8 },
  { key: "demandCharge", label: "Demand charge", unit: "INR", regex: /demand charge\s*[:\-]?\s*(?:rs\.?|₹)?\s*([\d,]+(?:\.\d{1,2})?)/i, confidence: .78 },
  { key: "fuel", label: "Fuel adjustment / surcharge", unit: "INR", regex: /(?:fuel adjustment|fuel surcharge|fpppa|fac charge)\s*[:\-]?\s*(?:rs\.?|₹)?\s*([\d,]+(?:\.\d{1,2})?)/i, confidence: .72 },
  { key: "duty", label: "Electricity duty / tax", unit: "INR", regex: /(?:electricity duty|energy duty|duty|tax)\s*[:\-]?\s*(?:rs\.?|₹)?\s*([\d,]+(?:\.\d{1,2})?)/i, confidence: .7 },
  { key: "meterRent", label: "Meter rent", unit: "INR", regex: /(?:meter rent|meter charge)\s*[:\-]?\s*(?:rs\.?|₹)?\s*([\d,]+(?:\.\d{1,2})?)/i, confidence: .72 },
  { key: "arrears", label: "Arrears", unit: "INR", regex: /(?:arrears|previous balance)\s*[:\-]?\s*(?:rs\.?|₹)?\s*([\d,]+(?:\.\d{1,2})?)/i, confidence: .7 },
  { key: "subsidy", label: "Subsidy / rebate", unit: "INR", regex: /(?:subsidy|rebate|credit)\s*[:\-]?\s*(?:rs\.?|₹)?\s*([\d,]+(?:\.\d{1,2})?)/i, confidence: .68 },
];

function parseFields(pages: string[], method: string): BillField[] {
  return rules.flatMap(rule => {
    const page = pages.findIndex(text => rule.regex.test(text));
    if (page < 0) return [];
    const match = pages[page].match(rule.regex)!;
    const raw = match[1].trim();
    const numeric = ["units", "maxDemand", "powerFactor", "total", "fixed", "energy", "demandCharge", "fuel", "duty", "meterRent", "arrears", "subsidy", "days", "previousReading", "currentReading", "multiplicationFactor"].includes(rule.key);
    return [{ key: rule.key, label: rule.label, value: numeric ? raw.replaceAll(",", "") : raw, unit: rule.unit, confidence: rule.confidence, page: page + 1, source: match[0], method, confirmed: false }];
  });
}

async function recognize(canvas: HTMLCanvasElement) {
  const worker = await createWorker("eng");
  try {
    const initial = await worker.recognize(canvas);
    if (initial.data.confidence >= 48) return initial.data.text;
    const rotated = document.createElement("canvas");
    rotated.width = canvas.height; rotated.height = canvas.width;
    const context = rotated.getContext("2d")!;
    context.translate(rotated.width / 2, rotated.height / 2); context.rotate(Math.PI / 2);
    context.drawImage(canvas, -canvas.width / 2, -canvas.height / 2);
    const retry = await worker.recognize(rotated);
    return retry.data.confidence > initial.data.confidence ? retry.data.text : initial.data.text;
  } finally { await worker.terminate(); }
}

export async function extractBill(file: File): Promise<BillExtraction> {
  if (file.size > 20 * 1024 * 1024) throw new Error("Choose a file smaller than 20 MB.");
  const name = file.name.toLowerCase();
  let pages: string[] = [];
  let method = "PDF text extraction · PDF.js";
  let rows: string[][] = [];
  if (/\.pdf$/i.test(name) || file.type === "application/pdf") {
    const pdf = await pdfjs.getDocument({ data: await file.arrayBuffer() }).promise;
    for (let number = 1; number <= pdf.numPages; number++) {
      const page = await pdf.getPage(number);
      const text = await page.getTextContent();
      pages.push(text.items.map(item => "str" in item ? item.str : "").join(" "));
    }
    if (pages.join(" ").trim().length < 80) {
      method = "OCR · Tesseract.js · English";
      const scanned: string[] = [];
      for (let number = 1; number <= pdf.numPages; number++) {
        const page = await pdf.getPage(number); const viewport = page.getViewport({ scale: 1.6 });
        const canvas = document.createElement("canvas"); canvas.width = viewport.width; canvas.height = viewport.height;
        await page.render({ canvas, canvasContext: canvas.getContext("2d")!, viewport }).promise;
        scanned.push(await recognize(canvas));
      }
      pages = scanned;
    }
  } else if (/\.(csv|xlsx?)$/i.test(name)) {
    method = "Spreadsheet parsing · SheetJS";
    const workbook = XLSX.read(await file.arrayBuffer(), { type: "array" });
    rows = workbook.SheetNames.flatMap(sheet => XLSX.utils.sheet_to_json<unknown[]>(workbook.Sheets[sheet], { header: 1, raw: false }).map(row => row.map(value => String(value ?? ""))));
    pages = [rows.map(row => row.join(" | ")).join("\n")];
  } else if (file.type.startsWith("image/") || /\.(png|jpe?g)$/i.test(name)) {
    method = "OCR · Tesseract.js · English";
    const image = await createImageBitmap(file); const canvas = document.createElement("canvas");
    canvas.width = image.width; canvas.height = image.height; canvas.getContext("2d")!.drawImage(image, 0, 0);
    pages = [await recognize(canvas)];
  } else throw new Error("Unsupported file type. Choose PDF, PNG/JPG, CSV, or XLSX.");
  const fields = parseFields(pages, method);
  if (!rows.length) rows = pages.flatMap((text, index) => text.split(/\r?\n/).filter(Boolean).map(line => [String(index + 1), line]));
  return { filename: file.name, pages: pages.length, method, text: pages.join("\n\n"), fields, rows };
}

export async function storeOriginalBill(id: string, file: File) {
  const db = await new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open("energy-manager-private-bills", 1);
    request.onupgradeneeded = () => request.result.createObjectStore("documents");
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  await new Promise<void>((resolve, reject) => {
    const transaction = db.transaction("documents", "readwrite");
    transaction.objectStore("documents").put({ blob: file, name: file.name, type: file.type }, id);
    transaction.oncomplete = () => resolve(); transaction.onerror = () => reject(transaction.error);
  });
  db.close();
}

export async function getOriginalBill(id: string) {
  const db = await new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open("energy-manager-private-bills", 1);
    request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error);
  });
  const result = await new Promise<{ blob: Blob; name: string } | undefined>((resolve, reject) => {
    const request = db.transaction("documents", "readonly").objectStore("documents").get(id);
    request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error);
  });
  db.close(); return result;
}

export async function deleteOriginalBill(id: string) {
  const db = await new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open("energy-manager-private-bills", 1);
    request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error);
  });
  await new Promise<void>((resolve, reject) => {
    const transaction = db.transaction("documents", "readwrite"); transaction.objectStore("documents").delete(id);
    transaction.oncomplete = () => resolve(); transaction.onerror = () => reject(transaction.error);
  });
  db.close();
}

export function reconciliation(fields: BillField[]) {
  const value = (key: string) => Number(fields.find(field => field.key === key)?.value || 0);
  const chargeKeys = ["fixed", "energy", "demandCharge", "fuel", "duty", "meterRent", "arrears"];
  const included = chargeKeys.filter(key => fields.some(field => field.key === key));
  const itemizedTotal = included.reduce((sum, key) => sum + value(key), 0) - value("subsidy");
  const total = value("total");
  const readingDelta = (value("currentReading") - value("previousReading")) * (value("multiplicationFactor") || 1);
  return { itemizedTotal, total, chargeMismatch: Boolean(total && included.length && Math.abs(itemizedTotal - total) > Math.max(5, total * .03)), meterMismatch: Boolean(readingDelta && value("units") && Math.abs(readingDelta - value("units")) > Math.max(2, value("units") * .03)) };
}

export function makeSyntheticBill(type: "home" | "shop" | "factory") {
  const copy = {
    home: ["Electricity Provider: DemoGrid West Electricity Distribution", "Consumer Name: Sample Household", "Consumer No: DEMO-H-20481", "Consumer Category: Domestic Residential", "Tariff Code: RES-S1", "Billing Period From: 01/11/2025 To: 30/11/2025", "Billing Days: 30", "Units Consumed: 286 kWh", "Fixed Charge: Rs. 110.00", "Energy Charge: Rs. 1845.40", "Fuel Adjustment: Rs. 120.12", "Electricity Duty: Rs. 166.04", "Total Amount Payable: Rs. 2241.56"],
    shop: ["Electricity Provider: DemoGrid South Electricity Distribution", "Consumer Name: Sample Corner Store", "Consumer No: DEMO-C-50724", "Consumer Category: Commercial", "Tariff Code: COM-G1", "Billing Period From: 01/11/2025 To: 30/11/2025", "Billing Days: 30", "Units Consumed: 2180 kWh", "Maximum Demand: 12.4 kW", "Fixed Charge: Rs. 460.00", "Energy Charge: Rs. 17658.00", "Fuel Surcharge: Rs. 1199.00", "Electricity Duty: Rs. 1738.53", "Total Amount Payable: Rs. 21055.53"],
    factory: ["Electricity Provider: DemoGrid West Electricity Distribution", "Consumer Name: Sample Textile Works", "Consumer No: DEMO-I-90113", "Consumer Category: Industrial", "Tariff Code: IND-TOD-2", "Billing Period From: 01/11/2025 To: 30/11/2025", "Billing Days: 30", "Units Consumed: 94350 kWh", "Maximum Demand: 352 kVA", "Power Factor: 0.94", "Fixed Charge: Rs. 1800.00", "Energy Charge: Rs. 584970.00", "Demand Charge: Rs. 133760.00", "Fuel Adjustment: Rs. 58497.00", "Electricity Duty: Rs. 38951.35", "Total Amount Payable: Rs. 817978.35"],
  }[type];
  const escape = (value: string) => value.replaceAll("\\", "\\\\").replaceAll("(", "\\(").replaceAll(")", "\\)");
  const commands = ["BT", "/F1 16 Tf", "50 790 Td", `(${escape("SYNTHETIC DEMO BILL - NOT OFFICIAL")}) Tj`, "/F1 11 Tf", ...copy.flatMap(line => ["0 -35 Td", `(${escape(line)}) Tj`]), "ET"].join("\n");
  const objects = ["<< /Type /Catalog /Pages 2 0 R >>", "<< /Type /Pages /Kids [3 0 R] /Count 1 >>", "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 842] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>", "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>", `<< /Length ${commands.length} >>\nstream\n${commands}\nendstream`];
  let pdf = "%PDF-1.4\n", offsets = [0];
  objects.forEach((object, index) => { offsets.push(pdf.length); pdf += `${index + 1} 0 obj\n${object}\nendobj\n`; });
  const xref = pdf.length; pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  offsets.slice(1).forEach(offset => { pdf += `${String(offset).padStart(10, "0")} 00000 n \n`; });
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return new Blob([pdf], { type: "application/pdf" });
}

export function billPeriod(value: string) {
  const match = value.match(/(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})/);
  if (!match) return "";
  const year = match[3].length === 2 ? `20${match[3]}` : match[3];
  return `${year}-${match[2].padStart(2, "0")}`;
}
export function consumerType(category: string): "Household" | "Small commercial business" | "Industrial facility" {
  if (/industrial|factory|manufactur|large power/i.test(category)) return "Industrial facility";
  if (/commercial|business|shop|non-domestic/i.test(category)) return "Small commercial business";
  return "Household";
}
export function editBillField(fields: BillField[], key: string, value: string) {
  return fields.map(field => field.key === key ? { ...field, value, confidence: 1, method: "User correction", source: "User correction", confirmed: true } : field);
}
export function maskReference(value: string) { return value.length > 4 ? `${"•".repeat(value.length - 4)}${value.slice(-4)}` : value; }
