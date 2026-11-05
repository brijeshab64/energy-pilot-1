import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, CheckCircle2, FileUp, ShieldAlert } from "lucide-react";
import { clearImportedDataset, parseDemandCsv, parseSupplyCsv, readImportedDataset, saveImportedDataset, validateImportedPair, type ImportedDataset, supplyTemplate, demandTemplate } from "@/data/realData";
import { Button } from "@/components/ui/button";

function templateUrl(value: string) { return `data:text/csv;charset=utf-8,${encodeURIComponent(value)}`; }

export default function MonthlyImport() {
  const [supplyText, setSupplyText] = useState("");
  const [demandText, setDemandText] = useState("");
  const [supplyName, setSupplyName] = useState("");
  const [demandName, setDemandName] = useState("");
  const [preview, setPreview] = useState<ImportedDataset | null>(null);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  useEffect(() => { readImportedDataset().then(dataset => { if (dataset) { setPreview(dataset); setSupplyName(dataset.supplySource); setDemandName(dataset.demandSource); setMessage("A previously staged dataset is saved in this browser; it has not been activated."); } }).catch(() => setError("Could not read staged data from this browser.")); }, []);

  async function readFile(file: File, setText: (text: string) => void, setName: (name: string) => void) {
    setText(await file.text());
    setName(file.name);
    setPreview(null);
    setError("");
    setMessage("");
  }

  function validate() {
    setError(""); setMessage(""); setPreview(null);
    try {
      const supply = parseSupplyCsv(supplyText);
      const demand = parseDemandCsv(demandText);
      validateImportedPair(supply, demand);
      const result = { supply, demand, importedAt: new Date().toISOString(), supplySource: supplyName, demandSource: demandName };
      setPreview(result);
      setMessage("Both files passed the schema and matching-coverage checks. Source authenticity is not verified by this tool.");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "The selected files could not be validated.");
    }
  }

  async function stage() {
    if (!preview) return;
    try {
      await saveImportedDataset(preview);
      setMessage("Validated files saved as a staged dataset in this browser. The live dashboard still uses demo data.");
    } catch {
      setError("Could not save the staged dataset in this browser. Try a smaller reporting period or clear browser storage.");
    }
  }

  async function clearStaged() {
    await clearImportedDataset();
    setPreview(null);
    setMessage("Staged files cleared. The dashboard remains in demo mode.");
    setError("");
  }

  return <main className="min-h-screen bg-[#f4f7f6] px-4 py-8 text-[#334b55] sm:px-8">
    <div className="mx-auto max-w-4xl space-y-6">
      <Link to="/" className="inline-flex items-center gap-2 text-sm font-semibold text-[#27766e] hover:underline"><ArrowLeft size={16}/> Back to EnergyPilot</Link>
      <header className="rounded-xl border border-[#dfe8e5] bg-white p-6 shadow-sm">
        <p className="text-xs font-bold tracking-[.16em] text-[#28766e]">MONTHLY DATA · STAGING ONLY</p>
        <h1 className="mt-2 text-2xl font-bold">Prepare official-source data</h1>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-[#687980]">This first step accepts normalized monthly state-level CSVs for supply and demand. It checks units, duplicate keys, and matching coverage, then saves a staged copy in this browser. It does not activate the data or claim that a source is official; dashboard calculations remain on synthetic demo data.</p>
      </header>
      <section className="grid gap-4 md:grid-cols-2">
        <FileCard title="Supply and capacity" hint="One row per state, month, and technology. Do not include region or national subtotal rows." filename={supplyName} onFile={file => readFile(file, setSupplyText, setSupplyName)} />
        <FileCard title="Demand and peak" hint="One row per state and month. Keep requirement, supplied energy, and peak power separate." filename={demandName} onFile={file => readFile(file, setDemandText, setDemandName)} />
      </section>
      <section className="rounded-xl border border-[#dfe8e5] bg-white p-5 shadow-sm">
        <h2 className="font-bold">Required canonical columns</h2>
        <div className="mt-3 grid gap-4 text-sm md:grid-cols-2">
          <div><p className="font-semibold">Supply CSV · energy in GWh, capacity in MW</p><code className="mt-2 block break-words rounded bg-[#f3f6f5] p-3 text-xs">period, region, state, technology, generation_gwh, capacity_mw, source, report</code><a className="mt-2 inline-block text-[#27766e] underline" href={templateUrl(supplyTemplate)} download="energypilot-supply-template.csv">Download supply template</a></div>
          <div><p className="font-semibold">Demand CSV · energy in MU, peak in MW</p><code className="mt-2 block break-words rounded bg-[#f3f6f5] p-3 text-xs">period, region, state, requirement_mu, supplied_mu, peak_mw, source, report</code><a className="mt-2 inline-block text-[#27766e] underline" href={templateUrl(demandTemplate)} download="energypilot-demand-template.csv">Download demand template</a></div>
        </div>
        <p className="mt-4 text-xs leading-5 text-[#718087]">Use YYYY-MM periods. The <code>report</code> field should identify the publication or include its public URL. Generation and capacity must be disaggregated by technology; demand must occur only once per state-month. This schema is an interim interchange format, not a claim that an agency publishes these exact CSV columns.</p>
      </section>
      <div className="flex flex-wrap gap-3">
        <Button onClick={validate} className="rounded-lg bg-[#147d78] hover:bg-[#116c67]">Validate both files</Button>
        <Button onClick={stage} disabled={!preview} variant="outline" className="rounded-lg">Save staged copy</Button>
        <Button onClick={clearStaged} variant="ghost" className="rounded-lg text-[#8d4b3e]">Clear staged copy</Button>
      </div>
      {message && <div className="flex gap-3 rounded-lg border border-[#cfe5dc] bg-[#edf7f2] p-4 text-sm"><CheckCircle2 className="mt-0.5 shrink-0 text-[#28766e]" size={18}/><span>{message}{preview && <span className="mt-2 block text-xs text-[#60746d]">{preview.demand.length.toLocaleString()} demand rows · {preview.supply.length.toLocaleString()} supply rows · {new Set(preview.demand.map(row => row.period)).size} months</span>}</span></div>}
      {error && <div className="flex gap-3 rounded-lg border border-[#ecd4cb] bg-[#fff3ef] p-4 text-sm text-[#874a3b]"><ShieldAlert className="mt-0.5 shrink-0" size={18}/>{error}</div>}
      <div className="rounded-lg border border-[#eadfc8] bg-[#fffaf0] p-4 text-sm leading-6 text-[#75664c]"><b>Important:</b> These files are stored only in this browser and are not sent to a server. Imported source authenticity and report correctness must be checked separately. No fallback or merge with synthetic records occurs, and this staging step does not change the dashboard or scenario baseline.</div>
    </div>
  </main>;
}

function FileCard({title,hint,filename,onFile}:{title:string;hint:string;filename:string;onFile:(file:File)=>void}) {
  return <label className="cursor-pointer rounded-xl border border-dashed border-[#b7cbc5] bg-white p-5 transition hover:border-[#438c81] hover:bg-[#fbfdfc]">
    <span className="flex items-center gap-2 font-bold"><FileUp size={18} className="text-[#28766e]"/>{title}</span>
    <span className="mt-2 block text-xs leading-5 text-[#718087]">{hint}</span>
    <span className="mt-3 block rounded-md bg-[#f3f6f5] px-3 py-2 text-sm">{filename || "Choose CSV file"}</span>
    <input className="sr-only" type="file" accept=".csv,text/csv" onChange={event => { const file = event.target.files?.[0]; if (file) onFile(file); }}/>
  </label>;
}
