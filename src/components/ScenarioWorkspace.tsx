import { useMemo, useState } from "react";
import { Download, Printer, Save, Trash2, Copy, RotateCcw } from "lucide-react";
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { fmt } from "@/data/demoProvider";
import { activeProvider as provider, getDataMode } from "@/data/activeData";
import { createDefaultScenario, defaultInputs, modelVersion, runBaseline, runScenario, sourceGroups, validateInputs, type ScenarioConfig, type ScenarioInputs, type ScenarioYear } from "@/data/scenarioModel";
import "../styles/scenario.css";
import "../styles/policy-play.css";

const horizons = [1, 3, 5, 10, 15] as const;
const disclaimer = "Illustrative simulation using synthetic assumptions — not an official forecast, system dispatch result, or policy recommendation.";
type NumericInputKey = Exclude<keyof ScenarioInputs, "additions" | "retirements">;
type Template = { id: string; label: string; supported: boolean; apply?: (inputs: ScenarioInputs) => ScenarioInputs; note: string };
const templateList: Template[] = [
  { id: "business", label: "Business as usual", supported: true, apply: () => structuredClone(defaultInputs), note: "Uses the demo model's default demand and capacity assumptions." },
  { id: "high-demand", label: "High electricity-demand growth", supported: true, apply: inputs => ({ ...inputs, demandGrowth: 6.5, peakGrowth: 6.5 }), note: "Raises annual energy and peak growth assumptions." },
  { id: "renewables", label: "Renewable acceleration", supported: true, apply: inputs => ({ ...inputs, additions: { ...inputs.additions, Solar: 10000, Wind: 5000 } }), note: "Adds solar and wind capacity over the horizon." },
  { id: "storage", label: "Storage acceleration", supported: false, note: "Storage dispatch, duration and round-trip losses are not represented. Requires hourly demand and dispatch data." },
  { id: "coal", label: "Coal retirement and replacement", supported: true, apply: inputs => ({ ...inputs, retirements: { ...inputs.retirements, Coal: 5000 }, additions: { ...inputs.additions, Solar: 7000, Wind: 3000 } }), note: "Retires 5 GW coal and adds 10 GW renewable nameplate capacity." },
  { id: "gas", label: "Gas supply disruption", supported: true, apply: inputs => ({ ...inputs, gasAvailability: 40 }), note: "Reduces the modeled gas availability assumption." },
  { id: "fuel-price", label: "High fuel-price stress", supported: false, note: "Fuel costs are not calculated. Requires validated fuel prices and plant-level fuel use." },
  { id: "heat", label: "Heat-wave / peak-demand stress", supported: true, apply: inputs => ({ ...inputs, heatEffect: 5, peakGrowth: 6 }), note: "Applies a simplified annual demand uplift and higher peak growth; no hourly weather profile." },
  { id: "drought", label: "Drought / low-hydro availability", supported: true, apply: inputs => ({ ...inputs, hydroAvailability: 45 }), note: "Reduces annual hydro utilization; water constraints and seasonal inflows are not modeled." },
  { id: "transmission", label: "Transmission expansion", supported: false, note: "Network flows and transfer limits are not calculated. Requires grid topology and line capacity data." },
  { id: "efficiency", label: "Energy-efficiency programme", supported: true, apply: inputs => ({ ...inputs, efficiency: 1.5 }), note: "Increases annual efficiency improvement in the demand equation." },
  { id: "industry", label: "Industrial electrification", supported: true, apply: inputs => ({ ...inputs, electrification: 2 }), note: "Adds an annual demand-growth uplift; industry is not separately modeled." },
  { id: "transport", label: "Transport electrification", supported: true, apply: inputs => ({ ...inputs, electrification: 1 }), note: "Adds an annual demand-growth uplift; transport charging patterns are not modeled." },
  { id: "state", label: "State-level adequacy plan", supported: true, apply: inputs => ({ ...inputs, additions: { ...inputs.additions, Solar: 1500, Wind: 500 } }), note: "Illustrative additions for the selected state/region; not an engineered adequacy plan." },
  { id: "net-zero", label: "Net-zero transition pathway", supported: false, note: "Emissions and carbon budgets are not calculated. Requires technology emissions factors and a configured pathway." },
  { id: "custom", label: "Custom scenario", supported: true, apply: inputs => structuredClone(inputs), note: "Start from current assumptions and edit the supported inputs below." },
];
const fields: { key: NumericInputKey; label: string; unit: string; min: number; max: number; step: number; description: string }[] = [
  { key: "demandGrowth", label: "Annual energy-demand growth", unit: "% / year", min: -5, max: 15, step: .1, description: "Compounded change to annual energy requirement." },
  { key: "perCapitaGrowth", label: "Population / economic growth proxy", unit: "% / year", min: -5, max: 10, step: .1, description: "Additional demand growth assumption; population and economic activity are not modeled separately." },
  { key: "peakGrowth", label: "Annual peak-demand growth", unit: "% / year", min: -5, max: 20, step: .1, description: "Compounded change to the estimated peak-demand proxy." },

  { key: "electrification", label: "Electrification demand uplift", unit: "% / year", min: 0, max: 8, step: .1, description: "Additional annual demand growth; sectors are not separated." },
  { key: "efficiency", label: "Efficiency improvement", unit: "% / year", min: 0, max: 10, step: .1, description: "Compounded annual reduction in modeled energy need." },
  { key: "heatEffect", label: "Weather demand uplift", unit: "%", min: 0, max: 20, step: .5, description: "Simplified uplift applied each projected year; not an hourly weather model." },
  { key: "demandResponse", label: "Peak demand shifted", unit: "%", min: 0, max: 30, step: .5, description: "Reduces estimated peak only; annual energy is unchanged." },
  { key: "availability", label: "Plant availability", unit: "%", min: 0, max: 100, step: 1, description: "Scales modeled available capacity and generation." },
  { key: "thermalPlf", label: "Thermal utilization", unit: "%", min: 0, max: 100, step: 1, description: "Scales existing thermal generation and added thermal output." },
  { key: "renewableFactor", label: "Renewable utilization", unit: "%", min: 0, max: 100, step: 1, description: "Annual utilization assumption for added solar, wind and other renewables." },
  { key: "hydroAvailability", label: "Hydro utilization", unit: "%", min: 0, max: 100, step: 1, description: "Annual hydro utilization; no seasonal reservoir profile." },
  { key: "coalAvailability", label: "Coal fuel availability", unit: "%", min: 0, max: 100, step: 1, description: "Scales coal and lignite availability." },
  { key: "gasAvailability", label: "Gas fuel availability", unit: "%", min: 0, max: 100, step: 1, description: "Scales gas availability." },
  { key: "forcedOutages", label: "Forced outage rate", unit: "%", min: 0, max: 50, step: 1, description: "Reduces modeled available capacity and generation." },
  { key: "plannedOutages", label: "Planned outage rate", unit: "%", min: 0, max: 50, step: 1, description: "Reduces modeled available capacity and generation." },
  { key: "reserveTarget", label: "Reserve-margin reference", unit: "%", min: 0, max: 60, step: 1, description: "Reference only; compared with a simplified reserve-margin estimate." },
];
type View = "adequacy" | "mix" | "cost" | "emissions";
function measure(row: ScenarioYear, key: string): number { return key === "demand" ? row.demandMU : key === "generation" ? row.generationGWh : key === "gap" ? row.gapMU : key === "peak" ? row.peakMW : key === "reserve" ? row.reserveMargin : key === "renewables" ? row.renewableShare : 0; }

export default function ScenarioWorkspace({ saved, onSave }: { saved: ScenarioConfig[]; onSave: (items: ScenarioConfig[]) => void }) {
  const [config, setConfig] = useState<ScenarioConfig>(() => createDefaultScenario());
  const [templateId, setTemplateId] = useState("business");
  const [view, setView] = useState<View>("adequacy");
  const [sensitivityKey, setSensitivityKey] = useState("reserve");
  const [comparisonNames, setComparisonNames] = useState<string[]>([]);
  const [loadedName, setLoadedName] = useState<string | null>(null);
  const [savedNote, setSavedNote] = useState("");
  const dataMode = getDataMode();
  const availableYears = [...new Set(provider.getObservations().map(row => row.year))].sort((a, b) => b - a);
  const baseline = useMemo(() => runBaseline(config), [config.startYear, config.region, config.state, config.horizon, dataMode]);
  const results = useMemo(() => runScenario(config), [config, dataMode]);
  const final = results.at(-1)!;
  const baseFinal = baseline.at(-1)!;
  const issues = validateInputs(config.inputs, config);
  const selectedTemplate = templateList.find(item => item.id === templateId)!;
  const changed = fields.filter(field => config.inputs[field.key] !== defaultInputs[field.key]);
  const capacityChanges = sourceGroups.flatMap(source => [
    config.inputs.additions[source] ? `${source} addition ${fmt(config.inputs.additions[source], 0)} MW` : "",
    config.inputs.retirements[source] ? `${source} retirement ${fmt(config.inputs.retirements[source], 0)} MW` : "",
  ].filter(Boolean));
  const selectedSaved = saved.filter(item => comparisonNames.includes(item.name)).slice(0, 3);
  const yearly = results.map((row, index) => ({ year: row.year, baseline: baseline[index], scenario: row }));
  const savedTrend = selectedSaved.map(item => ({ item, results: runScenario(item) }));
  const gapTrend = results.map((row, index) => ({ period: `Year ${index + 1}`, baseline: baseline[index]?.gapMU, current: row.gapMU, ...Object.fromEntries(savedTrend.map(({ item, results: savedResults }, savedIndex) => [`saved${savedIndex}`, savedResults[index]?.gapMU])) }));

  const updateInput = (key: NumericInputKey, value: number) => setConfig(current => ({ ...current, inputs: { ...current.inputs, [key]: value } }));
  const updateCapacity = (field: "additions" | "retirements", source: string, value: number) => setConfig(current => ({ ...current, inputs: { ...current.inputs, [field]: { ...current.inputs[field], [source]: value } } }));
  const chooseTemplate = (id: string) => {
    const template = templateList.find(item => item.id === id)!;
    if (!template.supported || !template.apply) return;
    setTemplateId(id);
    setConfig(current => ({ ...current, type: template.label, inputs: id === "custom" ? structuredClone(current.inputs) : template.apply!(structuredClone(defaultInputs)) }));
  };
  const save = () => {
    const item = { ...structuredClone(config), name: config.name.trim() || "Policy scenario", note: savedNote, type: selectedTemplate.label };
    onSave([...saved.filter(entry => entry.name !== item.name && entry.name !== loadedName), item]);
    setLoadedName(item.name);
  };
  const duplicate = (item: ScenarioConfig) => onSave([...saved, { ...structuredClone(item), name: `${item.name} copy` }]);
  const load = (item: ScenarioConfig) => {
    setConfig(structuredClone(item));
    setTemplateId(templateList.find(template => template.label === item.type)?.id || "custom");
    setLoadedName(item.name);
    setSavedNote(item.note || "");
  };
  const removeSaved = (name: string) => {
    if (window.confirm(`Delete saved scenario “${name}”? This cannot be undone.`)) {
      onSave(saved.filter(item => item.name !== name));
      setComparisonNames(current => current.filter(item => item !== name));
    }
  };
  const sensitivity = useMemo(() => {
    const tests = [
      { key: "demandGrowth" as const, label: "Demand growth", low: Math.max(-5, config.inputs.demandGrowth - 1), high: Math.min(15, config.inputs.demandGrowth + 1), unit: "% / year" },
      { key: "efficiency" as const, label: "Efficiency", low: Math.max(0, config.inputs.efficiency - .5), high: Math.min(10, config.inputs.efficiency + .5), unit: "% / year" },
      { key: "availability" as const, label: "Plant availability", low: Math.max(0, config.inputs.availability - 5), high: Math.min(100, config.inputs.availability + 5), unit: "%" },
      { key: "renewableFactor" as const, label: "Renewable utilization", low: Math.max(0, config.inputs.renewableFactor - 5), high: Math.min(100, config.inputs.renewableFactor + 5), unit: "%" },
      { key: "hydroAvailability" as const, label: "Hydro availability", low: Math.max(0, config.inputs.hydroAvailability - 10), high: Math.min(100, config.inputs.hydroAvailability + 10), unit: "%" },
    ];
    return tests.map(test => {
      const low = runScenario({ ...config, inputs: { ...config.inputs, [test.key]: test.low } }).at(-1)!;
      const high = runScenario({ ...config, inputs: { ...config.inputs, [test.key]: test.high } }).at(-1)!;
      return { ...test, lowValue: measure(low, sensitivityKey), highValue: measure(high, sensitivityKey), impact: Math.abs(measure(high, sensitivityKey) - measure(low, sensitivityKey)) };
    }).sort((a, b) => b.impact - a.impact);
  }, [config, sensitivityKey]);

  const unitFor = (key: string) => key === "demand" || key === "gap" ? "MU/year" : key === "generation" ? "GWh/year" : key === "peak" ? "MW" : "%";
  const changedSummary = [...changed.slice(0, 3).map(field => `${field.label.toLowerCase()} ${config.inputs[field.key]}${field.unit}`), ...capacityChanges.slice(0, 3)].join(", ");
  const brief = `In ${config.region}${config.state !== "All states" ? ` / ${config.state}` : ""}, this ${config.horizon}-year ${selectedTemplate.label.toLowerCase()} reaches ${final.year}. Modeled annual energy need is ${fmt(final.demandMU, 0)} MU and generation is ${fmt(final.generationGWh, 0)} GWh; the gap indicator is ${fmt(final.gapMU, 0)} MU, and the reserve-margin proxy is ${final.reserveMargin.toFixed(1)}% (reference ${config.inputs.reserveTarget}%). Renewable share is ${final.renewableShare.toFixed(1)}%. ${changedSummary ? `Changed assumptions include ${changedSummary}.` : "No supported assumptions differ from defaults."} ${final.reserveMargin < config.inputs.reserveTarget ? "The modeled reserve-margin proxy is below its reference; assess firm supply and peak conditions." : "The modeled reserve-margin proxy is at or above its reference, but this is not a reliability finding."} Costs, emissions, hourly dispatch, network constraints, project delays, environment and quantified uncertainty are not modeled; validate allocation, fuel, transmission, land, water, permitting and financing before decisions.`;

  const metricRow = (label: string, key: string, digits = 0) => {
    const baselineValue = measure(baseFinal, key), scenarioValue = measure(final, key), delta = scenarioValue - baselineValue, pct = baselineValue ? delta / Math.abs(baselineValue) * 100 : 0;
    return <tr key={key}><th>{label}</th><td>{fmt(baselineValue, digits)} {unitFor(key)}</td><td>{fmt(scenarioValue, digits)} {unitFor(key)}</td><td>{delta > 0 ? "+" : ""}{fmt(delta, digits)} ({pct > 0 ? "+" : ""}{pct.toFixed(1)}%)</td><td>{key === "gap" ? delta < 0 ? "Gap indicator falls; annual adequacy proxy improves." : "Gap indicator remains or rises; further assessment needed." : key === "reserve" ? scenarioValue < config.inputs.reserveTarget ? "Below chosen reference; investigate peak adequacy." : "At/above reference; not a reliability guarantee." : "Annual model output; not an observed or dispatch result."}</td></tr>;
  };

  return <div className="scenario-workspace simple-scenario policy-play decision-simulator">
    <div className="notice amber scenario-warning"><span><b>{disclaimer}</b> Instant scenario recalculation based on selected assumptions and available data. Data status: synthetic demo data · model {modelVersion}.</span></div>
    <section className="panel simple-scope"><div><h2>1 · Planning scope</h2><p>Select geography, baseline and outlook.</p></div>
      <label>Region<select value={config.region} onChange={event => setConfig(current => ({ ...current, region: event.target.value, state: "All states" }))}><option>All India</option>{provider.getRegions().map(region => <option key={region}>{region}</option>)}</select></label>
      <label>State / UT<select value={config.state} onChange={event => setConfig(current => ({ ...current, state: event.target.value }))}><option>All states</option>{provider.getStates().map(state => <option key={state}>{state}</option>)}</select></label>
      <label>Baseline period<select value={config.startYear} onChange={event => setConfig(current => ({ ...current, startYear: Number(event.target.value) }))}>{availableYears.map(year => <option key={year}>{year}</option>)}</select></label>
      <label>Horizon<select value={config.horizon} onChange={event => setConfig(current => ({ ...current, horizon: Number(event.target.value) as ScenarioConfig["horizon"] }))}>{horizons.map(year => <option key={year} value={year}>{year} {year === 1 ? "year" : "years"}</option>)}</select></label>
    </section>
    <section className="panel template-select"><label><span>2 · Scenario template</span><select value={templateId} onChange={event => chooseTemplate(event.target.value)}>{templateList.map(template => <option key={template.id} value={template.id} disabled={!template.supported}>{template.label}{!template.supported ? " — Not modeled" : ""}</option>)}</select></label><p>{selectedTemplate.note}</p><details className="template-assumptions"><summary>Assumptions currently changed</summary><ul>{[...changed.map(field => `${field.label}: ${config.inputs[field.key]} ${field.unit}`), ...capacityChanges].length ? [...changed.map(field => `${field.label}: ${config.inputs[field.key]} ${field.unit}`), ...capacityChanges].map(item => <li key={item}>{item}</li>) : <li>None — using demo defaults</li>}</ul></details></section>
    <section className="panel scenario-edit-head"><label>Scenario name<input value={config.name} onChange={event => setConfig(current => ({ ...current, name: event.target.value }))}/></label><label>Policy question / notes<input value={savedNote} onChange={event => setSavedNote(event.target.value)} placeholder="What decision should this comparison inform?"/></label><button className="secondary-btn" onClick={() => { setConfig(current => ({ ...current, inputs: structuredClone(defaultInputs), type: "Business as usual" })); setTemplateId("business"); }}><RotateCcw size={14}/> Reset inputs</button></section>

    <div className="simple-section-heading"><div><h2>3 · Edit supported assumptions</h2><p>Inputs are grouped and only affect the calculations described here.</p></div></div>
    <details className="panel assumption-group" open><summary>Demand and end-use <small>Annual requirement and peak proxy</small></summary><div className="assumption-grid">{fields.slice(0, 7).map(field => <label className="assumption-control" key={field.key}><span><b>{field.label}</b><small>{field.description}</small></span><input type="number" min={field.min} max={field.max} step={field.step} value={Number(config.inputs[field.key])} onChange={event => updateInput(field.key, Number(event.target.value))}/><em>{field.unit}</em></label>)}</div><p className="not-modeled-note">Not modeled: sector-specific demand, EV charging profiles, pump electrification, cooling load profiles and seasonal profiles. These require disaggregated demand and time-series data.</p></details>
    <details className="panel assumption-group"><summary>Capacity and generation mix <small>Capacity added or retired over the selected horizon</small></summary><div className="capacity-grid"><b>Technology</b><b>Add capacity (MW)</b><b>Retire capacity (MW)</b>{sourceGroups.filter(source => source !== "Pumped storage").map(source => <div className="capacity-row" key={source}><span>{source}</span><input aria-label={`${source} capacity addition MW`} type="number" min="0" max="100000" step="100" value={config.inputs.additions[source] || 0} onChange={event => updateCapacity("additions", source, Number(event.target.value))}/><input aria-label={`${source} capacity retirement MW`} type="number" min="0" max="100000" step="100" value={config.inputs.retirements[source] || 0} onChange={event => updateCapacity("retirements", source, Number(event.target.value))}/></div>)}</div><div className="assumption-grid">{fields.slice(7, 11).map(field => <label className="assumption-control" key={field.key}><span><b>{field.label}</b><small>{field.description}</small></span><input type="number" min={field.min} max={field.max} step={field.step} value={Number(config.inputs[field.key])} onChange={event => updateInput(field.key, Number(event.target.value))}/><em>{field.unit}</em></label>)}</div><p className="not-modeled-note">Additions are commissioned evenly across the horizon. Storage dispatch, imports and transmission capacity have no supported calculation. Pumped-storage capacity is not offered as an editable input because dispatch is not modeled.</p></details>
    <details className="panel assumption-group"><summary>Operations and reliability <small>Annual availability and reserve-margin proxy</small></summary><div className="assumption-grid">{fields.slice(11).map(field => <label className="assumption-control" key={field.key}><span><b>{field.label}</b><small>{field.description}</small></span><input type="number" min={field.min} max={field.max} step={field.step} value={Number(config.inputs[field.key])} onChange={event => updateInput(field.key, Number(event.target.value))}/><em>{field.unit}</em></label>)}</div><p className="not-modeled-note">Not modeled: hourly dispatch, storage duration/efficiency, maintenance scheduling, transmission transfers, imports, contingency reserve and reliability risk.</p></details>
    <details className="panel assumption-group"><summary>Fuel, cost and climate <small>Unsupported effects are not estimated</small></summary><div className="unsupported-grid">{["Fuel prices and fuel logistics — requires plant-level fuel use and validated fuel price series.","Capital, operating, storage and transmission costs — requires technology cost and financing assumptions.","Emissions and carbon budgets — requires emissions factors and a defined target/formula.","Water, land, air quality and environmental approval — requires location and impact data."].map(text => <p key={text}><b>Not modeled</b><br/>{text}</p>)}</div></details>

    <div className="simple-section-heading"><div><h2>4 · Results</h2><p>{disclaimer}</p></div><span className="tiny-demo">SCENARIO PROJECTION</span></div>
    <div className="scenario-tabs" role="tablist">{([["adequacy", "Supply adequacy"], ["mix", "System mix"], ["cost", "Cost & affordability"], ["emissions", "Emissions & transition"]] as [View, string][]).map(([key, label]) => <button key={key} role="tab" aria-selected={view === key} className={view === key ? "selected" : ""} onClick={() => setView(key)}>{label}</button>)}</div>
    {view === "adequacy" && <section className="panel result-panel"><div className="policy-compare-wrap"><table className="policy-compare"><thead><tr><th>Measure</th><th>Baseline projection</th><th>Scenario projection</th><th>Change</th><th>Interpretation</th></tr></thead><tbody>{metricRow("Energy requirement", "demand")}{metricRow("Energy generated (annual proxy)", "generation")}{metricRow("Energy gap indicator", "gap")}{metricRow("Peak demand proxy", "peak")}{metricRow("Reserve margin proxy", "reserve", 1)}</tbody></table></div><p className="not-modeled-note">Estimated unserved energy, hourly reliability, network constraints and local supply adequacy: <b>Not modeled</b>. The gap and reserve measures are annual proxies, not dispatch outcomes.</p></section>}
    {view === "mix" && <section className="panel result-panel"><div className="policy-compare-wrap"><table className="policy-compare"><thead><tr><th>Technology</th><th>Baseline capacity MW</th><th>Scenario capacity MW</th><th>Scenario generation GWh/year</th></tr></thead><tbody>{sourceGroups.map(source => <tr key={source}><th>{source}</th><td>{fmt(baseFinal.capacityBySource[source], 0)}</td><td>{fmt(final.capacityBySource[source], 0)}</td><td>{fmt(final.generationBySource[source], 0)}</td></tr>)}<tr><th>Renewable generation share</th><td>{baseFinal.renewableShare.toFixed(1)}%</td><td>{final.renewableShare.toFixed(1)}%</td><td>{(final.renewableShare - baseFinal.renewableShare > 0 ? "+" : "")}{(final.renewableShare - baseFinal.renewableShare).toFixed(1)} pp change</td></tr></tbody></table></div></section>}
    {(view === "cost" || view === "emissions") && <section className="panel unsupported-panel"><b>Not modeled</b><p>{view === "cost" ? "System cost, capital investment, fuel cost, financing and affordability are not calculated. Required: technology-specific investment/O&M, fuel prices and use, discount rate, and a defined cost boundary." : "Total emissions, emissions intensity, avoided emissions and target progress are not calculated. Required: technology emissions factors, generation boundary and a configured target."}</p></section>}
    <section className="panel timeline-panel"><div className="simple-section-heading"><div><h3>Year-by-year adequacy outlook</h3><p>Energy generation (GWh) and energy requirement (MU) remain distinct measures. One GWh equals one MU as an energy quantity.</p></div></div><div className="policy-compare-wrap"><table className="policy-compare"><thead><tr><th>Year</th><th>Requirement MU</th><th>Generation GWh</th><th>Gap indicator MU</th><th>Reserve margin %</th></tr></thead><tbody>{yearly.map(row => <tr key={row.year}><th>{row.year}</th><td>{fmt(row.scenario.demandMU, 0)} <small>baseline {fmt(row.baseline.demandMU, 0)}</small></td><td>{fmt(row.scenario.generationGWh, 0)} <small>baseline {fmt(row.baseline.generationGWh, 0)}</small></td><td>{fmt(row.scenario.gapMU, 0)}</td><td>{row.scenario.reserveMargin.toFixed(1)}%</td></tr>)}</tbody></table></div></section>

    <section className="panel timeline-panel"><h3>Compare annual gap indicators</h3><p className="not-modeled-note">Baseline, current scenario, and saved comparisons · MU/year · annual proxy, not dispatch or reliability.</p><div className="chart-area" style={{ height: 230 }}><ResponsiveContainer width="100%" height="100%"><LineChart data={gapTrend}><CartesianGrid stroke="#e8edf0" vertical={false}/><XAxis dataKey="period"/><YAxis tickFormatter={(value:number) => fmt(value / 1000, 0) + "k"}/><Tooltip formatter={(value:number) => `${fmt(Number(value), 1)} MU/year`}/><Line dataKey="baseline" name="Baseline projection" stroke="#89979d" strokeDasharray="5 4" dot={false}/><Line dataKey="current" name={config.name || "Current scenario"} stroke="#147d78" strokeWidth={2.5} dot={false}/>{savedTrend.map((item, index) => <Line key={item.item.name} dataKey={`saved${index}`} name={item.item.name} stroke={["#5277a5", "#d97958", "#9a7bbd"][index]} dot={false}/>)}</LineChart></ResponsiveContainer></div></section>

    <section className="panel decision-brief"><div className="brief-heading"><span>DECISION BRIEF</span><small>{disclaimer}</small></div><p>{brief}</p><div className="brief-actions"><button onClick={() => window.print()} className="secondary-btn"><Printer size={14}/> Print brief</button></div></section>
    <section className="panel tradeoff-panel"><h3>Trade-off view</h3><div className="policy-compare-wrap"><table className="policy-compare"><thead><tr><th>Dimension</th><th>Baseline</th><th>Scenario</th><th>Change</th><th>Interpretation</th></tr></thead><tbody><tr><th>Reliability</th><td>{baseFinal.reserveMargin.toFixed(1)}% reserve proxy</td><td>{final.reserveMargin.toFixed(1)}% reserve proxy</td><td>{(final.reserveMargin - baseFinal.reserveMargin).toFixed(1)} pp</td><td>Proxy only; no reliability result.</td></tr><tr><th>Cost</th><td>Not modeled</td><td>Not modeled</td><td>Not modeled</td><td>Requires cost and fuel data.</td></tr><tr><th>Emissions</th><td>Not modeled</td><td>Not modeled</td><td>Not modeled</td><td>Requires emissions factors.</td></tr><tr><th>Renewable share</th><td>{baseFinal.renewableShare.toFixed(1)}%</td><td>{final.renewableShare.toFixed(1)}%</td><td>{(final.renewableShare - baseFinal.renewableShare).toFixed(1)} pp</td><td>Calculated from annual generation proxy.</td></tr><tr><th>Fuel security</th><td>Not modeled</td><td>Not modeled</td><td>Not modeled</td><td>Fuel availability multiplier only; no logistics.</td></tr><tr><th>Regional equity</th><td>Not modeled</td><td>Not modeled</td><td>Not modeled</td><td>No allocation or distributional model.</td></tr></tbody></table></div></section>

    <details className="panel sensitivity-panel"><summary>Sensitivity analysis <small>Explore which supported assumptions move the selected outcome</small></summary><label className="sensitivity-select">Outcome<select value={sensitivityKey} onChange={event => setSensitivityKey(event.target.value)}><option value="reserve">Reserve margin (%)</option><option value="gap">Energy gap indicator (MU)</option><option value="renewables">Renewable share (%)</option><option value="generation">Generation (GWh)</option></select></label><p className="not-modeled-note">Low/base/high test: each input is varied around its current value while other assumptions stay fixed. Simplified one-at-a-time test; not a probability interval. Uncertainty is not quantified in this simulation.</p><div className="sensitivity-bars">{sensitivity.map(test => <div className="sensitivity-row" key={test.key}><span>{test.label}<small>{test.low}–{test.high} {test.unit}</small></span><i><b style={{ width: `${Math.max(3, test.impact / Math.max(1, ...sensitivity.map(item => item.impact)) * 100)}%` }}/></i><strong>Result {fmt(test.lowValue, 1)}–{fmt(test.highValue, 1)} {unitFor(sensitivityKey)}</strong></div>)}</div></details>

    <section className="panel compare-saved-panel"><div className="simple-section-heading"><div><h3>Compare saved scenarios</h3><p>Select up to three saved scenarios beside the current one.</p></div></div>{saved.length === 0 ? <p>No saved scenarios yet.</p> : <div className="compare-checkboxes">{saved.map(item => <label key={item.name}><input type="checkbox" checked={comparisonNames.includes(item.name)} disabled={!comparisonNames.includes(item.name) && comparisonNames.length >= 3} onChange={event => setComparisonNames(current => event.target.checked ? [...current, item.name] : current.filter(name => name !== item.name))}/>{item.name}</label>)}</div>}{selectedSaved.length > 0 && <div className="policy-compare-wrap"><table className="policy-compare"><thead><tr><th>Scenario</th><th>Final-year gap MU</th><th>Reserve proxy %</th><th>Renewable share %</th></tr></thead><tbody><tr><th>{config.name} (current)</th><td>{fmt(final.gapMU, 0)}</td><td>{final.reserveMargin.toFixed(1)}</td><td>{final.renewableShare.toFixed(1)}</td></tr>{selectedSaved.map(item => { const last = runScenario(item).at(-1)!; return <tr key={item.name}><th>{item.name}</th><td>{fmt(last.gapMU, 0)}</td><td>{last.reserveMargin.toFixed(1)}</td><td>{last.renewableShare.toFixed(1)}</td></tr>; })}</tbody></table></div>}</section>

    <details className="panel transparency-panel"><summary>How this is calculated and what is missing</summary><div className="simple-more-content"><p><b>Model:</b> {modelVersion}. Demand = start-year requirement × (1 + demand growth + electrification + per-capita growth − efficiency)<sup>years</sup> × (1 + weather uplift). Added capacity is commissioned evenly. New generation uses technology utilization × 8,760 hours × availability. Available MW scales installed capacity by availability and fuel/outage factors. Gap = max(0, demand MU − modeled generation GWh), using 1 GWh = 1 MU. Reserve proxy = (available MW − peak MW) / peak MW.</p><p><b>Input status:</b> {getDataMode()} · selected baseline year {config.startYear} · geography {config.region}/{config.state}. Results are synthetic demo data, not live conditions. Package capacities are illustrative. <b>Uncertainty is not quantified in this simulation.</b></p><p><b>Known limits:</b> No hourly dispatch, network flow, storage operation, fuel logistics, cost, emissions, project delays, environment, approvals, consumer behavior or quantified uncertainty. Not an official forecast, recommendation, or investment analysis.</p></div></details>
    <section className="panel simple-save-panel"><div><h3>Save or export this scenario</h3><p>Saved locally in this browser. Scenario notes are included.</p></div><div><button className="secondary-btn" onClick={() => exportScenario(config, results, baseline, savedNote)}><Download size={14}/> Export CSV</button><button className="primary-btn" onClick={save} disabled={issues.length > 0}><Save size={14}/> Save</button></div></section>
    {saved.length > 0 && <section className="panel simple-saved"><div className="simple-section-heading"><div><h2>Saved scenarios</h2><p>Load, duplicate, or delete. Deletion requires confirmation.</p></div></div>{saved.map(item => <div className="simple-saved-row" key={item.name}><span><b>{item.name}</b><small>{item.type} · {item.region} · {item.horizon}-year horizon</small></span><button onClick={() => load(item)}>Load</button><button aria-label={`Duplicate ${item.name}`} onClick={() => duplicate(item)}><Copy size={14}/></button><button aria-label={`Delete ${item.name}`} onClick={() => removeSaved(item.name)}><Trash2 size={14}/></button></div>)}</section>}
  </div>;
}

function exportScenario(config: ScenarioConfig, results: ScenarioYear[], baseline: ScenarioYear[], note: string) {
  const rows = [[disclaimer], [`Scenario: ${config.name}`, `Template: ${config.type}`, `Geography: ${config.region}/${config.state}`, `Baseline: ${config.startYear}`, `Horizon: ${config.horizon} years`, `Data status: ${getDataMode()}`, `Model: ${modelVersion}`, `Note: ${note}`, "Uncertainty is not quantified in this simulation."], ["Year", "Baseline requirement (MU)", "Scenario requirement (MU)", "Baseline generation (GWh)", "Scenario generation (GWh)", "Scenario gap indicator (MU)", "Peak proxy (MW)", "Available capacity (MW)", "Reserve proxy (%)", "Renewable share (%)"]];
  results.forEach((row, index) => rows.push([String(row.year), String(baseline[index]?.demandMU ?? ""), String(row.demandMU), String(baseline[index]?.generationGWh ?? ""), String(row.generationGWh), String(row.gapMU), String(row.peakMW), String(row.availableMW), String(row.reserveMargin), String(row.renewableShare)]));
  const csv = rows.map(row => row.map(value => `"${value.replaceAll('"', '""')}"`).join(",")).join("\n");
  const link = document.createElement("a"); link.href = URL.createObjectURL(new Blob([csv], { type: "text/csv" })); link.download = `energypilot-scenario-${config.startYear}-${config.horizon}y.csv`; link.click(); URL.revokeObjectURL(link.href);
}
