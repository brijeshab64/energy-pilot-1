import { useState, type ReactNode } from "react";
import { ArrowLeft, ArrowRight, Check, Download, FileText, Factory, Home, Building2, LoaderCircle, ShieldCheck, Upload, X } from "lucide-react";
import { profiles, tariffs as demoTariffs, type BillRecord, type ConsumerType, type EnergyProfile, type TariffPlan } from "@/data/energyManager";
import { billPeriod, consumerType, editBillField, extractBill, makeSyntheticBill, maskReference, storeOriginalBill, type BillExtraction, type BillField } from "@/lib/billExtractor";

type Props = { onComplete: (profile: EnergyProfile, bill: BillRecord, tariff: TariffPlan | null, demo: boolean) => void; initialProfile?: EnergyProfile };
const demoTypes: { id: "home" | "shop" | "factory"; title: string; Icon: typeof Home }[] = [
  { id: "home", title: "Household bill", Icon: Home },
  { id: "shop", title: "Commercial bill", Icon: Building2 },
  { id: "factory", title: "Industrial bill", Icon: Factory },
];
const requiredFields = [
  { key: "billingStart", label: "Billing start date", unit: "" },
  { key: "billingEnd", label: "Billing end date", unit: "" },
  { key: "units", label: "Units consumed", unit: "kWh" },
  { key: "total", label: "Total bill amount", unit: "INR" },
];

export default function EnergyOnboarding({ onComplete, initialProfile }: Props) {
  const [file, setFile] = useState<File | null>(null);
  const [result, setResult] = useState<BillExtraction | null>(null);
  const [fields, setFields] = useState<BillField[]>([]);
  const [categoryChoice, setCategoryChoice] = useState<ConsumerType>("Household");
  const [categoryConfirmed, setCategoryConfirmed] = useState(false);
  const [phase, setPhase] = useState<"upload" | "extracting" | "review">("upload");
  const [error, setError] = useState("");
  const [demo, setDemo] = useState(false);
  const [previewUrl, setPreviewUrl] = useState("");

  const setValue = (key: string, value: string, label: string, unit = "") => {
    const present = fields.some(field => field.key === key);
    setFields(current => present ? editBillField(current, key, value) : [...current, { key, label, value, unit, confidence: .4, page: 1, source: "Not found in document", method: "User correction", confirmed: true }]);
  };
  const processFile = async (nextFile: File, isDemo = false) => {
    setFile(nextFile); setDemo(isDemo); setError(""); setPhase("extracting");
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    const url = URL.createObjectURL(nextFile); setPreviewUrl(url);
    try {
      const extracted = await extractBill(nextFile);
      setResult(extracted); setFields(extracted.fields);
      const category = extracted.fields.find(field => field.key === "category")?.value || "";
      setCategoryChoice(consumerType(category)); setCategoryConfirmed(Boolean(category));
      setPhase("review");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not read this file. Try another document."); setPhase("upload");
    }
  };
  const chooseFile = (next?: File) => { if (next) void processFile(next); };
  const tryDemo = async (type: "home" | "shop" | "factory") => {
    const blob = makeSyntheticBill(type);
    const item = profiles.find(profile => profile.id === type)!;
    const sample = new File([blob], `synthetic-${item.consumerType.toLowerCase().replaceAll(" ", "-")}-bill.pdf`, { type: "application/pdf" });
    await processFile(sample, true);
  };
  const get = (key: string) => fields.find(field => field.key === key)?.value || "";
  const month = billPeriod(get("billingEnd")) || billPeriod(get("billingStart"));
  const checks = (() => {
    const amount = (key: string) => Number(get(key).replaceAll(",", "")) || 0;
    const chargeKeys = ["fixed", "energy", "demandCharge", "fuel", "duty", "meterRent", "arrears"];
    const found = chargeKeys.filter(key => fields.some(field => field.key === key));
    const sum = found.reduce((total, key) => total + amount(key), 0) - amount("subsidy");
    const total = amount("total");
    const previous = amount("previousReading"), current = amount("currentReading"), factor = amount("multiplicationFactor") || 1;
    const expectedUnits = (current - previous) * factor;
    return { sum, total, chargeMismatch: Boolean(found.length && total && Math.abs(sum - total) > Math.max(5, total * .03)), readingMismatch: Boolean(previous && current && amount("units") && Math.abs(expectedUnits - amount("units")) > Math.max(2, amount("units") * .03)) };
  })();
  const save = async () => {
    const period = month || get("period");
    if (!period.match(/^\d{4}-\d{2}$/)) { setError("Please confirm the billing month so this record can be placed in your history."); return; }
    if (Number(get("units").replaceAll(",", "")) <= 0 || Number(get("total").replaceAll(",", "")) <= 0) { setError("Confirm units consumed and the bill total to create an analysis."); return; }
    const category = get("category") ? consumerType(get("category")) : categoryChoice;
    const type = category;
    const demoProfile = demo ? profiles.find(item => item.consumerType === type) : undefined;
    const profile: EnergyProfile = initialProfile || demoProfile || { id: `consumer-${crypto.randomUUID()}`, label: type === "Household" ? "My household" : type === "Industrial facility" ? "My facility" : "My business", consumerType: type, region: get("region") || "Region not identified", discom: get("provider") || "Provider not identified", contractDemandKW: Number(get("contractDemand") || get("sanctionedLoad") || 0), powerFactor: Number(get("powerFactor")) || undefined };
    const demoTariff = demo ? demoTariffs.find(item => item.category === profile.consumerType) : undefined;
    const val = (key: string) => Number(get(key).replaceAll(",", "")) || 0;
    const id = `${profile.id}-${period}-${Date.now()}`;
    const record: BillRecord = { id, period, profileId: profile.id, kwh: val("units"), maxDemandKW: val("maxDemand") || undefined, powerFactor: val("powerFactor") || undefined, total: val("total"), tariffId: demoTariff?.id || "", source: demo ? "Synthetic demo" : "Uploaded bill", fixed: val("fixed"), energy: val("energy"), demand: val("demandCharge"), duty: val("duty"), surcharge: val("fuel"), subsidy: val("subsidy") };
    const auditedFields = fields.filter(field => field.key !== "consumerName").map(field => ({ ...field, value: field.key === "account" || field.key === "meter" ? maskReference(field.value) : field.value }));
    try {
      await storeOriginalBill(id, file!);
      const index = JSON.parse(localStorage.getItem("ep-manager:bill-documents") || "[]");
      localStorage.setItem("ep-manager:bill-documents", JSON.stringify([...index, { id, filename: file!.name, method: result?.method, fields: auditedFields, checks, uploadedAt: new Date().toISOString(), demo }]));
    } catch { setError("Could not preserve the original in local browser storage. Free device storage and try again."); return; }
    onComplete(profile, record, demoTariff || null, demo);
  };
  const flagged = fields.filter(field => field.confidence < .75 || !field.value || ["units", "total", "billingStart", "billingEnd"].includes(field.key));
  const confirmed = fields.filter(field => field.value && field.confidence >= .75 && !["units", "total", "billingStart", "billingEnd"].includes(field.key));
  const missing = requiredFields.filter(field => !fields.some(item => item.key === field.key && item.value));

  return <main className="min-h-screen bg-[#f3f7f4] px-4 py-8 text-[#183d34] sm:px-8"><div className="mx-auto max-w-6xl">
    <header className="mb-8 flex flex-wrap items-center justify-between gap-4"><div><p className="text-xs font-bold uppercase tracking-[.2em] text-[#39816d]">EnergyPilot · Energy Manager</p><h1 className="mt-2 text-3xl font-bold tracking-tight">Start with your electricity bill</h1><p className="mt-2 text-[#60766d]">Upload first. We’ll extract what we can and ask only about uncertain or missing details.</p></div><span className="rounded-full bg-white px-4 py-2 text-xs font-semibold text-[#547266]"><ShieldCheck className="mr-1 inline" size={15}/> Private to this browser</span></header>
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_300px]"><section className="rounded-[28px] border border-[#e0eae4] bg-white p-5 shadow-[0_14px_50px_rgba(30,77,60,.07)] sm:p-8">
      {phase === "upload" && <><p className="text-xs font-bold uppercase tracking-widest text-[#39816d]">01 · Upload</p><h2 className="mt-2 text-2xl font-bold">One bill is enough to begin</h2><p className="mt-2 max-w-2xl text-sm leading-6 text-[#60766d]">PDFs are read as text first, with OCR fallback for scanned pages. Images use OCR. CSV/XLSX files are parsed as tables. Extraction runs in this browser; provider formats vary and some bills will be only partially recognized.</p><label className="mt-6 flex min-h-48 cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed border-[#b7d2c3] bg-[#f6fbf8] p-6 text-center hover:bg-[#eff8f3]"><Upload size={27} className="text-[#39816d]"/><b className="mt-3">Choose an electricity bill</b><span className="mt-1 text-sm text-[#71847c]">PDF, image, CSV or XLSX · up to 20 MB</span><input className="sr-only" type="file" accept=".pdf,.png,.jpg,.jpeg,.csv,.xlsx,.xls" onChange={e=>chooseFile(e.target.files?.[0])}/></label><p className="mt-3 text-xs text-[#71847c]">The original is kept in this browser’s local document store, not sent to a server. Local storage is not encrypted; avoid shared devices.</p><div className="mt-7 border-t border-[#e7eee9] pt-5"><h3 className="font-semibold">Explore without personal data</h3><p className="mt-1 text-sm text-[#71847c]">Synthetic samples pass through the same extraction and review flow.</p><div className="mt-3 flex flex-wrap gap-2">{demoTypes.map(({id,title,Icon})=><button key={id} onClick={()=>void tryDemo(id)} className="inline-flex items-center gap-2 rounded-xl bg-[#edf6f0] px-3 py-2 text-sm font-semibold text-[#326f5b] hover:bg-[#dff0e5]"><Icon size={15}/>{title}</button>)}</div></div></>}
      {phase === "extracting" && <div className="flex min-h-72 flex-col items-center justify-center text-center"><LoaderCircle size={34} className="animate-spin text-[#39816d]"/><h2 className="mt-4 text-xl font-bold">Reading your document</h2><p className="mt-2 max-w-md text-sm text-[#71847c]">Text extraction and local OCR can take a few moments, especially for multi-page scans. Nothing is uploaded.</p></div>}
      {phase === "review" && result && <><button onClick={()=>setPhase("upload")} className="mb-5 flex items-center gap-2 text-sm font-medium text-[#557167]"><ArrowLeft size={15}/> Upload another</button><p className="text-xs font-bold uppercase tracking-widest text-[#39816d]">02 · Review your bill</p><h2 className="mt-2 text-2xl font-bold">{file?.name}</h2><p className="mt-1 text-sm text-[#71847c]">{result.pages} page{result.pages===1?"":"s"} · {demo?"Synthetic demo extraction · sample document only":result.method}</p>{demo&&<div className="mt-3 rounded-xl bg-[#fff4dc] p-3 text-sm font-semibold text-[#795819]">Synthetic demo bill and extracted values — not an official bill.</div>}
        {file&&previewUrl&&<div className="mt-4 flex items-center gap-3 rounded-xl border border-[#e3ebe5] p-3"><FileText size={18} className="text-[#39816d]"/><span className="min-w-0 flex-1 truncate text-sm">Original: {file.name}</span><a href={previewUrl} target="_blank" rel="noreferrer" className="text-sm font-semibold text-[#277d68]">View original</a></div>}
        <p className="mt-4 text-sm text-[#60766d]">Extraction method: <b>{result.method}</b>. Confidence values are heuristic, not a guarantee. Page and source text are retained for each extracted field.</p>
        <div className="mt-5 rounded-2xl bg-[#eff8f2] p-4"><h3 className="font-bold">Confirmed automatically</h3>{confirmed.length===0?<p className="mt-2 text-sm text-[#71847c]">No high-confidence optional fields found.</p>:<div className="mt-3 grid gap-2 sm:grid-cols-2">{confirmed.map(field=><div key={field.key} className="rounded-xl bg-white p-3"><div className="flex justify-between gap-3"><span className="text-xs text-[#71847c]">{field.label}</span><span className="text-xs font-semibold text-[#34755f]">{Math.round(field.confidence*100)}% · p.{field.page}</span></div><b className="mt-1 block break-words text-sm">{field.key==="account"?maskReference(field.value):field.value} {field.unit}</b><small className="mt-1 block truncate text-[#71847c]">Source: {field.source}</small></div>)}</div>}</div>
        <div className="mt-4 rounded-2xl border border-amber-200 bg-amber-50/70 p-4"><h3 className="font-bold text-amber-950">Please check · only uncertain or key values</h3><p className="mt-1 text-xs text-amber-900">Confirm dates, consumption and bill total before analysis. You can continue without optional tariff details.</p><div className="mt-3 grid gap-3 sm:grid-cols-2">{[...requiredFields.filter(field=>flagged.some(item=>item.key===field.key)), ...flagged.filter(field=>!requiredFields.some(item=>item.key===field.key)&&["category","tariff","provider","region","maxDemand"].includes(field.key)).map(field=>({key:field.key,label:field.label,unit:field.unit}))].map(field=><label key={field.key} className="block text-sm font-medium text-[#5d4a24]">{field.label}{fields.find(item=>item.key===field.key)?.confidence! < .75&&fields.find(item=>item.key===field.key)?.value&&<small className="ml-2 font-normal">low confidence</small>}<div className="mt-1 flex rounded-xl border border-amber-200 bg-white"><input className="min-w-0 flex-1 rounded-xl px-3 py-2.5 text-sm text-[#183d34] outline-none" value={get(field.key)} onChange={e=>setValue(field.key,e.target.value,field.label,field.unit)} placeholder="Not found — enter only if known"/><span className="self-center pr-3 text-xs text-[#71847c]">{field.unit}</span></div>{fields.find(item=>item.key===field.key)?.source&&<small className="mt-1 block text-xs text-[#71847c]">Source: {fields.find(item=>item.key===field.key)?.source}</small>}</label>)}</div>{missing.length>0&&<p className="mt-3 text-xs text-amber-950">Still missing: {missing.map(field=>field.label).join(", ")}. Supply only these to complete the period analysis.</p>}</div>
        {!get("category")&&<div className="mt-4 rounded-xl border border-[#e2eae5] p-4"><label className="block text-sm font-semibold">Consumer category wasn’t identified <span className="font-normal text-[#71847c]">(optional for bill-only analysis)</span><select className="mt-2 w-full rounded-xl border border-[#dce7e0] bg-white px-3 py-2.5" value={categoryChoice} onChange={e=>{setCategoryChoice(e.target.value as ConsumerType);setCategoryConfirmed(true);}}><option>Household</option><option>Small commercial business</option><option>Industrial facility</option></select></label></div>}
        <details className="mt-4 rounded-xl border border-[#e4ebe6] p-4"><summary className="cursor-pointer text-sm font-semibold">Could not be identified · optional fields</summary><p className="mt-2 text-sm text-[#71847c]">Tariff rates and effective dates are not confidently matched in this demo. An itemized breakdown from the bill is shown where extracted; tariff simulation remains unavailable. The bill itself can still support usage, amount and initial CO₂ analysis.</p><div className="mt-3 max-h-52 overflow-auto whitespace-pre-wrap rounded-lg bg-[#f7faf8] p-3 text-xs text-[#64766e]">{result.text.slice(0,6000)||"No readable text found. Try a clearer scan."}</div></details>
        {checks.chargeMismatch&&<div className="mt-4 rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-900"><b>Calculation mismatch</b><p className="mt-1">Extracted charge lines sum to ₹{checks.sum.toFixed(2)}; total payable is ₹{checks.total.toFixed(2)}. Arrears, credits, one-time charges, or missed lines may explain the difference. The total is not adjusted.</p></div>}{checks.readingMismatch&&<p className="mt-3 rounded-xl bg-amber-50 p-3 text-sm text-amber-900">Meter-reading difference does not reconcile with units consumed after the stated multiplier. Please check the values.</p>}
        <div className="mt-5 flex flex-wrap items-center justify-between gap-3"><span className="text-xs text-[#71847c]">{fields.length} field{fields.length===1?"":"s"} found · {missing.length?"Incomplete bill data":"Extracted, needs confirmation"}</span><button onClick={()=>void save()} className="rounded-xl bg-[#277d68] px-5 py-3 font-semibold text-white">Confirm bill and see analysis <ArrowRight className="ml-2 inline" size={16}/></button></div>
      </>}
      {error&&<p role="alert" className="mt-4 rounded-xl bg-rose-50 p-3 text-sm text-rose-800">{error}</p>}
    </section><aside className="h-fit rounded-[24px] bg-[#194c3e] p-6 text-[#eff8f2]"><span className="text-xs font-bold uppercase tracking-[.18em] text-[#9ed6bd]">What happens next</span><ol className="mt-5 space-y-4 text-sm">{["Read bill text / OCR scans", "Review only flagged values", "Check charge reconciliation", "See your personal analysis"].map((item,index)=><li key={item} className="flex gap-3"><span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-white/15 text-xs">{index+1}</span>{item}</li>)}</ol><div className="mt-8 rounded-xl bg-white/10 p-4 text-sm leading-6"><b>Privacy note</b><p className="mt-1 text-[#d5e9de]">Original files and corrections stay in this browser’s IndexedDB/local storage, are not encrypted, and are not accessible from the Government Dashboard.</p><p className="mt-2 text-[#d5e9de]">English baseline extraction only; all provider formats are not supported. Check important values.</p></div></aside></div>
    </div></main>;
}
function Field({label,children}:{label:string;children:ReactNode}){return <label className="block text-sm font-medium text-[#456158]">{label}<div className="mt-1.5">{children}</div></label>;}
