import { useMemo, useState } from "react";
import { Download, Save, Trash2 } from "lucide-react";
import { fmt } from "@/data/demoProvider";
import { activeProvider as provider, getDataMode } from "@/data/activeData";
import { createDefaultScenario, defaultInputs, runBaseline, runScenario, validateInputs, type ScenarioConfig, type ScenarioInputs } from "@/data/scenarioModel";
import "../styles/scenario.css";
import "../styles/policy-play.css";

const horizons = [3, 5, 10] as const;
type Package = { id: string; title: string; summary: string; effects: string; watch: string; inputs: Partial<ScenarioInputs> };
const packages: Package[] = [
  { id: "solar", title: "Grow solar generation", summary: "Add 10 GW of solar capacity", effects: "More daytime electricity and a larger clean-energy share.", watch: "Output varies with sunlight; storage, flexible demand and grid connections may be needed.", inputs: { additions: { ...defaultInputs.additions, Solar: 10000 } } },
  { id: "wind", title: "Grow wind generation", summary: "Add 5 GW of wind capacity", effects: "Adds another renewable source whose output can complement solar.", watch: "Wind output varies by place and time; transmission and balancing need attention.", inputs: { additions: { ...defaultInputs.additions, Wind: 5000 } } },
  { id: "firm", title: "Add dependable supply", summary: "Add 5 GW of dispatchable capacity", effects: "Adds capacity that can support supply when demand is high.", watch: "Fuel, operating cost, emissions and actual plant availability are not modeled.", inputs: { additions: { ...defaultInputs.additions, Coal: 5000 } } },
  { id: "balanced", title: "Combine clean supply & efficiency", summary: "Add solar and wind, while easing demand growth", effects: "Pairs additional renewable generation with lower energy demand.", watch: "Still needs planning for variable output, storage, transmission and costs.", inputs: { efficiency: 1, additions: { ...defaultInputs.additions, Solar: 7000, Wind: 3000 } } },
];

export default function ScenarioWorkspace({ saved, onSave }: { saved: ScenarioConfig[]; onSave: (items: ScenarioConfig[]) => void }) {
  const [config, setConfig] = useState<ScenarioConfig>(() => ({ ...createDefaultScenario(), name: "Policy comparison", type: "Policy comparison" }));
  const [selected, setSelected] = useState<string[]>(["solar", "balanced"]);
  const [loadedName, setLoadedName] = useState<string | null>(null);
  const dataMode = getDataMode();
  const years = [...new Set(provider.getObservations().map(row => row.year))].sort((a, b) => b - a);
  const validSaved = saved.filter(item => item.inputs && item.startYear && item.horizon);
  const baseline = useMemo(() => runBaseline(config), [config.startYear, config.region, config.state, dataMode]);
  const baselineFinal = baseline.at(-1)!;
  const comparisons = useMemo(() => packages.filter(item => selected.includes(item.id)).map(item => {
    const scenario: ScenarioConfig = { ...config, name: item.title, type: item.title, inputs: { ...structuredClone(defaultInputs), ...item.inputs, additions: { ...defaultInputs.additions, ...item.inputs.additions } } };
    const results = runScenario(scenario);
    return { policy: item, result: results.at(-1)!, scenario, results };
  }), [config, selected, dataMode]);
  const issues = comparisons.some(item => validateInputs(item.scenario.inputs, item.scenario).length > 0);

  const togglePackage = (id: string) => setSelected(current => current.includes(id) ? current.filter(item => item !== id) : [...current, id]);
  const save = () => {
    const packageNames = selected.map(id => packages.find(policy => policy.id === id)?.title).filter(Boolean).join(" + ") || "No package selected";
    const item = { ...structuredClone(config), name: `Comparison: ${packageNames}`, type: packageNames };
    onSave([...saved.filter(entry => entry.name !== item.name && entry.name !== loadedName), item]);
    setLoadedName(item.name);
  };
  const load = (item: ScenarioConfig) => {
    setConfig(structuredClone(item));
    const matches = packages.filter(policy => item.type.includes(policy.title)).map(policy => policy.id);
    if (matches.length) setSelected(matches);
    setLoadedName(item.name);
  };

  return <div className="scenario-workspace simple-scenario policy-play">
    <div className="notice amber scenario-warning"><span><b>Compare electricity policy choices.</b> Select options and see how each could affect the annual supply picture as demand grows. These illustrative results support discussion; they do not rank policies or replace detailed planning.</span></div>

    <section className="panel simple-scope">
      <div><h2>Set the planning outlook</h2><p>Choose the place and years to compare.</p></div>
      <label>Region<select value={config.region} onChange={event => setConfig(current => ({ ...current, region: event.target.value, state: "All states" }))}><option>All India</option>{provider.getRegions().map(region => <option key={region}>{region}</option>)}</select></label>
      <label>State / UT<select value={config.state} onChange={event => setConfig(current => ({ ...current, state: event.target.value }))}><option>All states</option>{provider.getStates().map(state => <option key={state}>{state}</option>)}</select></label>
      <label>Starting year<select value={config.startYear} onChange={event => setConfig(current => ({ ...current, startYear: Number(event.target.value) }))}>{years.map(year => <option key={year}>{year}</option>)}</select></label>
      <label>Look ahead<select value={config.horizon} onChange={event => setConfig(current => ({ ...current, horizon: Number(event.target.value) as ScenarioConfig["horizon"] }))}>{horizons.map(years => <option key={years} value={years}>{years} years</option>)}</select></label>
    </section>

    <div className="simple-section-heading"><div><h2>Which approaches should we compare?</h2><p>Choose one or more policy packages. The starting outlook is included as a reference.</p></div><span>{selected.length} SELECTED</span></div>
    <section className="policy-package-grid">{packages.map(item => <button key={item.id} className={`panel policy-package ${selected.includes(item.id) ? "chosen" : ""}`} onClick={() => togglePackage(item.id)} aria-pressed={selected.includes(item.id)}><span className="package-check">{selected.includes(item.id) ? "✓" : "+"}</span><b>{item.title}</b><small>{item.summary}</small><span className="package-effects">{item.effects}</span></button>)}</section>

    <section className="simple-results">
      <div className="simple-section-heading"><div><h2>Compare the outlook in {baselineFinal.year}</h2><p>Modeled annual results, alongside the unchanged starting outlook.</p></div><span className="tiny-demo">OBSERVE · NOT A RANKING</span></div>
      <div className="policy-compare-wrap"><table className="policy-compare"><thead><tr><th>Outlook</th><th>Generation</th><th>Energy need</th><th>Gap indicator</th><th>Renewable share</th></tr></thead><tbody><tr className="reference-row"><th>Starting outlook</th><td>{fmt(baselineFinal.generationGWh, 0)} GWh</td><td>{fmt(baselineFinal.demandMU, 0)} MU</td><td>{fmt(baselineFinal.gapMU, 0)} MU</td><td>{baselineFinal.renewableShare.toFixed(1)}%</td></tr>{comparisons.map(({ policy, result }) => <tr key={policy.id}><th>{policy.title}</th><td>{fmt(result.generationGWh, 0)} GWh <small>{result.generationGWh >= baselineFinal.generationGWh ? "+" : ""}{fmt(result.generationGWh - baselineFinal.generationGWh, 0)}</small></td><td>{fmt(result.demandMU, 0)} MU <small>{result.demandMU <= baselineFinal.demandMU ? "lower" : "higher"}</small></td><td>{fmt(result.gapMU, 0)} MU <small>{result.gapMU <= baselineFinal.gapMU ? "smaller" : "larger"}</small></td><td>{result.renewableShare.toFixed(1)}% <small>{result.renewableShare - baselineFinal.renewableShare >= 0 ? "+" : ""}{(result.renewableShare - baselineFinal.renewableShare).toFixed(1)} pp</small></td></tr>)}</tbody></table></div>

      <section className="policy-reading-grid">{comparisons.map(({ policy, result }) => <article className="panel policy-reading" key={policy.id}><span className="reading-kicker">{policy.title}</span><h3>{result.gapMU < baselineFinal.gapMU ? "Modeled gap is smaller" : result.gapMU > baselineFinal.gapMU ? "Modeled gap remains / grows" : "Modeled gap is unchanged"}</h3><p>{policy.effects} <b>Consider:</b> {policy.watch}</p></article>)}</section>
      <div className="policy-next-step"><b>Questions for a fuller government decision</b><p>Check whether supply can reach demand when needed, and compare costs, emissions, land, storage, transmission, fuel needs and regional effects. Those factors are not calculated here. The annual comparison is a starting point for investigation—not enough on its own to choose a policy.</p></div>
      <details className="panel simple-more"><summary>How to read these results</summary><div className="simple-more-content"><p>Generation and demand are annual totals. The gap indicator is a simplified annual comparison and says nothing about hourly shortages or local reliability. Package sizes are illustrative examples, not proposed government targets. The underlying dataset is synthetic and should not be used as an official estimate.</p></div></details>
      {selected.length === 0 && <p className="scenario-impact-invalid">Choose at least one policy package to compare with the starting outlook.</p>}
      {issues && <p className="scenario-impact-invalid">One or more selected options fall outside the model's valid inputs.</p>}
    </section>

    <section className="panel simple-save-panel"><div><h3>Save this comparison</h3><p>Saved scenarios stay in this browser.</p></div><div><button className="secondary-btn" onClick={() => downloadComparison(config, comparisons, baseline)} disabled={!selected.length}><Download size={14}/> Export table</button><button className="primary-btn" onClick={save} disabled={!selected.length || issues}><Save size={14}/> Save comparison</button></div></section>
    {validSaved.length > 0 && <section className="panel simple-saved"><div className="simple-section-heading"><div><h2>Saved comparisons</h2><p>Load or remove a saved setup.</p></div></div>{validSaved.map(item => <div className="simple-saved-row" key={item.name}><span><b>{item.name}</b><small>{item.type} · {item.region} · {item.horizon}-year outlook</small></span><button onClick={() => load(item)}>Load</button><button aria-label={`Delete ${item.name}`} onClick={() => onSave(saved.filter(entry => entry.name !== item.name))}><Trash2 size={14}/></button></div>)}</section>}
  </div>;
}

function downloadComparison(config: ScenarioConfig, comparisons: { policy: Package; result: ReturnType<typeof runScenario>[number]; results: ReturnType<typeof runScenario> }[], baseline: ReturnType<typeof runBaseline>) {
  const rows = [["year", "outlook", "generation_GWh", "energy_need_MU", "gap_indicator_MU", "renewable_share_pct"]];
  baseline.forEach(row => rows.push([String(row.year), "Starting outlook", String(row.generationGWh), String(row.demandMU), String(row.gapMU), String(row.renewableShare)]));
  comparisons.forEach(({ policy, results }) => results.forEach(row => rows.push([String(row.year), policy.title, String(row.generationGWh), String(row.demandMU), String(row.gapMU), String(row.renewableShare)])));
  const csv = rows.map(row => row.map(value => `"${value.replaceAll('"', '""')}"`).join(",")).join("\n");
  const link = document.createElement("a"); link.href = URL.createObjectURL(new Blob([csv], { type: "text/csv" })); link.download = `policy-comparison-${config.startYear}-${config.horizon}y.csv`; link.click(); URL.revokeObjectURL(link.href);
}
