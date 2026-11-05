import { useMemo, useState } from "react";
import { Download, Save, Trash2 } from "lucide-react";
import { CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { fmt } from "@/data/demoProvider";
import { activeProvider as provider, getDataMode } from "@/data/activeData";
import { createDefaultScenario, defaultInputs, exportScenario, modelVersion, runBaseline, runScenario, validateInputs, type ScenarioConfig, type ScenarioInputs } from "@/data/scenarioModel";
import "../styles/scenario.css";

const horizons = [1, 3, 5, 10] as const;
const presets: { id: string; name: string; subtitle: string; description: string; inputs: Partial<ScenarioInputs> }[] = [
  { id: "efficiency", name: "Energy efficiency", subtitle: "Reduce annual energy growth", description: "Tests whether efficiency improvements can reduce modeled energy requirement.", inputs: { efficiency: 1.5 } },
  { id: "renewables", name: "Renewable expansion", subtitle: "Add solar and wind capacity", description: "Tests additional solar and wind nameplate capacity and its modeled annual generation.", inputs: { additions: { ...defaultInputs.additions, Solar: 10000, Wind: 3000 } } },
  { id: "flexibility", name: "Peak flexibility", subtitle: "Shift peak demand", description: "Tests demand response against the peak-demand proxy; annual energy is unchanged by this lever.", inputs: { demandResponse: 10 } },
  { id: "balanced", name: "Balanced portfolio", subtitle: "Combine efficiency, flexibility and renewables", description: "Combines several levers to compare their modeled effects together.", inputs: { efficiency: 1, demandResponse: 5, additions: { ...defaultInputs.additions, Solar: 5000, Wind: 2000 } } },
];

export default function ScenarioWorkspace({ saved, onSave }: { saved: ScenarioConfig[]; onSave: (items: ScenarioConfig[]) => void }) {
  const [config, setConfig] = useState<ScenarioConfig>(() => {
    const initial = createDefaultScenario();
    return { ...initial, name: "Balanced portfolio", type: "Balanced portfolio", inputs: { ...structuredClone(defaultInputs), ...presets[3].inputs } };
  });
  const [activePreset, setActivePreset] = useState("balanced");
  const [loadedName, setLoadedName] = useState<string | null>(null);
  const dataMode = getDataMode();
  const availableYears = [...new Set(provider.getObservations().map(row => row.year))].sort((a, b) => b - a);
  const validSaved = saved.filter(item => item.inputs && item.startYear && item.horizon);
  const results = useMemo(() => runScenario(config), [config, dataMode]);
  const baseline = useMemo(() => runBaseline(config), [config.startYear, config.region, config.state, dataMode]);
  const final = results[results.length - 1];
  const baselineFinal = baseline[baseline.length - 1];
  const issues = validateInputs(config.inputs, config);
  const chartRows = results.map((row, index) => ({ year: row.year, scenario: row.demandMU, baseline: baseline[index]?.demandMU }));
  const effects = final && baselineFinal ? [
    { label: "Energy requirement", value: final.demandMU - baselineFinal.demandMU, unit: "MU/year", digits: 0 },
    { label: "Annual energy gap proxy", value: final.gapMU - baselineFinal.gapMU, unit: "MU/year", digits: 0 },
    { label: "Peak demand proxy", value: final.peakMW - baselineFinal.peakMW, unit: "MW", digits: 0 },
    { label: "Renewable generation share", value: final.renewableShare - baselineFinal.renewableShare, unit: "percentage points", digits: 1 },
  ] : [];

  const applyPreset = (preset: typeof presets[number]) => {
    setActivePreset(preset.id);
    setLoadedName(null);
    setConfig(current => ({ ...current, name: preset.name, type: preset.name, inputs: { ...structuredClone(defaultInputs), ...preset.inputs } }));
  };
  const updateInput = (key: "efficiency" | "demandResponse" | "additions", value: number, source?: string) => setConfig(current => ({
    ...current,
    inputs: key === "additions" ? { ...current.inputs, additions: { ...current.inputs.additions, [source || "Solar"]: value } } : { ...current.inputs, [key]: value },
  }));
  const save = () => {
    const item = structuredClone(config);
    onSave([...saved.filter(entry => entry.name !== item.name && entry.name !== loadedName), item]);
    setLoadedName(item.name);
  };
  const load = (item: ScenarioConfig) => {
    setConfig(structuredClone(item));
    setActivePreset(presets.find(preset => preset.name === item.type)?.id || "");
    setLoadedName(item.name);
  };

  return <div className="scenario-workspace simple-scenario">
    <div className="notice amber scenario-warning"><span><b>Policy scenario simulator · illustrative only.</b> Compare how selected assumptions change a synthetic annual energy-balance model. These are not official forecasts or policy recommendations.</span></div>

    <section className="panel simple-scope">
      <div><h2>Set the scope</h2><p>Choose a geography and comparison period.</p></div>
      <label>Region<select value={config.region} onChange={event => setConfig(current => ({ ...current, region: event.target.value, state: "All states" }))}><option>All India</option>{provider.getRegions().map(region => <option key={region}>{region}</option>)}</select></label>
      <label>State / UT<select value={config.state} onChange={event => setConfig(current => ({ ...current, state: event.target.value }))}><option>All states</option>{provider.getStates().map(state => <option key={state}>{state}</option>)}</select></label>
      <label>Starting year<select value={config.startYear} onChange={event => setConfig(current => ({ ...current, startYear: Number(event.target.value) }))}>{availableYears.map(year => <option key={year}>{year}</option>)}</select></label>
      <label>Horizon<select value={config.horizon} onChange={event => setConfig(current => ({ ...current, horizon: Number(event.target.value) as ScenarioConfig["horizon"] }))}>{horizons.map(years => <option key={years} value={years}>{years} {years === 1 ? "year" : "years"}</option>)}</select></label>
    </section>

    <div className="simple-section-heading"><div><h2>Choose a policy scenario</h2><p>Start with one of four editable examples.</p></div><span>4 SCENARIOS</span></div>
    <section className="simple-presets">{presets.map(preset => <button key={preset.id} className={`simple-preset ${activePreset === preset.id ? "selected" : ""}`} onClick={() => applyPreset(preset)}><span className="preset-check">{activePreset === preset.id ? "✓" : ""}</span><b>{preset.name}</b><small>{preset.subtitle}</small></button>)}</section>
    <div className="simple-selected"><div><span>Selected scenario</span><h3>{config.name}</h3><p>{presets.find(preset => preset.id === activePreset)?.description || "Saved scenario assumptions loaded for comparison."}</p></div><label>Scenario name<input value={config.name} onChange={event => setConfig(current => ({ ...current, name: event.target.value }))}/></label></div>

    <details className="panel simple-tune" open>
      <summary><span><b>Adjust the key assumptions</b><small>Only the levers used by these scenario examples are shown.</small></span><span>⌄</span></summary>
      <div className="simple-levers">
        <label><span><b>Efficiency improvement</b><small>Annual reduction in modeled energy requirement</small></span><input type="range" min="0" max="5" step="0.1" value={config.inputs.efficiency} onChange={event => updateInput("efficiency", Number(event.target.value))}/><strong>{config.inputs.efficiency.toFixed(1)}% / yr</strong></label>
        <label><span><b>Demand response</b><small>Reduction applied to peak-demand proxy only</small></span><input type="range" min="0" max="20" step="1" value={config.inputs.demandResponse} onChange={event => updateInput("demandResponse", Number(event.target.value))}/><strong>{config.inputs.demandResponse}%</strong></label>
        <label><span><b>Solar capacity addition</b><small>Nameplate capacity added across the scenario horizon</small></span><input type="range" min="0" max="20000" step="500" value={config.inputs.additions.Solar} onChange={event => updateInput("additions", Number(event.target.value), "Solar")}/><strong>{fmt(config.inputs.additions.Solar)} MW</strong></label>
        <label><span><b>Wind capacity addition</b><small>Nameplate capacity added across the scenario horizon</small></span><input type="range" min="0" max="15000" step="500" value={config.inputs.additions.Wind} onChange={event => updateInput("additions", Number(event.target.value), "Wind")}/><strong>{fmt(config.inputs.additions.Wind)} MW</strong></label>
      </div>
    </details>

    <section className="simple-results">
      <div className="simple-section-heading"><div><h2>What changes in the model?</h2><p>Scenario compared with the current synthetic baseline · final year {final.year}</p></div><span className="tiny-demo">MODEL OUTPUT</span></div>
      <div className="simple-effect-grid">{effects.map(effect => <article className="panel simple-effect" key={effect.label}><span>{effect.label}</span><b className={Math.abs(effect.value) < 0.05 ? "neutral" : effect.value < 0 ? "favorable" : "change"}>{effect.value > 0 ? "+" : ""}{fmt(effect.value, effect.digits)}</b><small>{effect.unit} · scenario minus baseline</small></article>)}</div>
      <section className="panel simple-chart-panel"><div><h3>Annual energy requirement</h3><p>MU/year · baseline and selected scenario</p></div><div className="chart-area"><ResponsiveContainer width="100%" height="100%"><LineChart data={chartRows}><CartesianGrid stroke="#e8edf0" vertical={false}/><XAxis dataKey="year"/><YAxis tickFormatter={(value:number) => fmt(value / 1000, 0) + "k"}/><Tooltip formatter={(value:number) => `${fmt(Number(value), 1)} MU/year`}/><Legend/><Line dataKey="baseline" name="Synthetic baseline" stroke="#89979d" strokeDasharray="5 4" dot={false}/><Line dataKey="scenario" name="Selected scenario" stroke="#147d78" strokeWidth={2.5} dot={false}/></LineChart></ResponsiveContainer></div></section>
      <details className="panel simple-more"><summary>More results and model notes</summary><div className="simple-more-content"><div className="simple-result-list"><p><b>Annual generation:</b> {fmt(final.generationGWh, 0)} GWh/year</p><p><b>Modeled annual gap proxy:</b> {fmt(final.gapMU, 0)} MU/year</p><p><b>Peak-demand proxy:</b> {fmt(final.peakMW, 0)} MW</p><p><b>Reserve-margin proxy:</b> {final.reserveMargin.toFixed(1)}%</p><p><b>Renewable generation share:</b> {final.renewableShare.toFixed(1)}%</p></div><p>Model: {modelVersion}. Annual energy balance only; not dispatch or a reliability model. Costs, emissions, transmission, jobs, land/water effects, and uncertainty are not modeled. A favorable change in one indicator can involve trade-offs elsewhere.</p></div></details>
      {issues.length > 0 && <p className="scenario-impact-invalid">Please reset or choose different assumptions before interpreting the results.</p>}
    </section>

    <section className="panel simple-save-panel"><div><h3>Save or share this scenario</h3><p>Saved scenarios stay in this browser.</p></div><div><button className="primary-btn" onClick={save} disabled={issues.length > 0}><Save size={14}/> Save scenario</button><button className="secondary-btn" onClick={() => exportScenario(config, results, baseline)} disabled={issues.length > 0}><Download size={14}/> Export CSV</button></div></section>
    {validSaved.length > 0 && <section className="panel simple-saved"><div className="simple-section-heading"><div><h2>Saved scenarios</h2><p>Load or remove a saved setup.</p></div></div>{validSaved.map(item => <div className="simple-saved-row" key={item.name}><span><b>{item.name}</b><small>{item.type} · {item.region} · {item.horizon}-year horizon</small></span><button onClick={() => load(item)}>Load</button><button aria-label={`Delete ${item.name}`} onClick={() => onSave(saved.filter(entry => entry.name !== item.name))}><Trash2 size={14}/></button></div>)}</section>}
  </div>;
}
