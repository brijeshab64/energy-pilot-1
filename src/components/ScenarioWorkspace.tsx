import { useMemo, useState } from "react";
import { Download, Save, Trash2 } from "lucide-react";
import { CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { fmt } from "@/data/demoProvider";
import { activeProvider as provider, getDataMode } from "@/data/activeData";
import { createDefaultScenario, defaultInputs, exportScenario, runBaseline, runScenario, validateInputs, type ScenarioConfig } from "@/data/scenarioModel";
import "../styles/scenario.css";
import "../styles/policy-play.css";

const horizons = [3, 5, 10] as const;
const solarYieldPerMw = 0.23 * 8760 / 1000 * (1 - 0.08) / (1 - 0.05);

export default function ScenarioWorkspace({ saved, onSave }: { saved: ScenarioConfig[]; onSave: (items: ScenarioConfig[]) => void }) {
  const [config, setConfig] = useState<ScenarioConfig>(() => {
    const initial = createDefaultScenario();
    return { ...initial, name: "Solar growth +5%", type: "Solar growth", inputs: { ...structuredClone(defaultInputs), additions: { ...defaultInputs.additions, Solar: 0 } } };
  });
  const [solarGrowth, setSolarGrowth] = useState(5);
  const [loadedName, setLoadedName] = useState<string | null>(null);
  const dataMode = getDataMode();
  const availableYears = [...new Set(provider.getObservations().map(row => row.year))].sort((a, b) => b - a);
  const validSaved = saved.filter(item => item.inputs && item.startYear && item.horizon);
  const baseline = useMemo(() => runBaseline(config), [config.startYear, config.region, config.state, dataMode]);
  const baselineSolar = baseline[0]?.generationBySource.Solar || 0;
  const solarAddition = baselineSolar * solarGrowth / 100 / solarYieldPerMw;
  const scenarioConfig = useMemo(() => ({ ...config, name: `Solar growth +${solarGrowth}%`, inputs: { ...config.inputs, additions: { ...config.inputs.additions, Solar: solarAddition } } }), [config, solarAddition, solarGrowth]);
  const results = useMemo(() => runScenario(scenarioConfig), [scenarioConfig, dataMode]);
  const final = results.at(-1)!;
  const baselineFinal = baseline.at(-1)!;
  const demandGapChange = final.gapMU - baselineFinal.gapMU;
  const supplyChange = final.generationGWh - baselineFinal.generationGWh;
  const solarChange = final.generationBySource.Solar - baselineFinal.generationBySource.Solar;
  const chartRows = results.map((row, index) => ({ year: row.year, requirement: row.demandMU, generation: row.generationGWh }));
  const issues = validateInputs(scenarioConfig.inputs, scenarioConfig);

  const save = () => {
    const item = structuredClone(scenarioConfig);
    onSave([...saved.filter(entry => entry.name !== item.name && entry.name !== loadedName), item]);
    setLoadedName(item.name);
  };
  const load = (item: ScenarioConfig) => {
    setConfig(structuredClone(item));
    setSolarGrowth(item.name.match(/\+(\d+(?:\.\d+)?)%/) ? Number(item.name.match(/\+(\d+(?:\.\d+)?)%/)![1]) : 5);
    setLoadedName(item.name);
  };

  return <div className="scenario-workspace simple-scenario policy-play">
    <div className="notice amber scenario-warning"><span><b>Explore a policy question.</b> If solar generation grew by 5%, how might it help meet rising electricity demand? Change the goal and observe the modeled effects. Illustrative synthetic data—not a forecast or policy recommendation.</span></div>

    <section className="panel simple-scope">
      <div><h2>Choose the outlook</h2><p>Set the place and period for your comparison.</p></div>
      <label>Region<select value={config.region} onChange={event => setConfig(current => ({ ...current, region: event.target.value, state: "All states" }))}><option>All India</option>{provider.getRegions().map(region => <option key={region}>{region}</option>)}</select></label>
      <label>State / UT<select value={config.state} onChange={event => setConfig(current => ({ ...current, state: event.target.value }))}><option>All states</option>{provider.getStates().map(state => <option key={state}>{state}</option>)}</select></label>
      <label>Starting year<select value={config.startYear} onChange={event => setConfig(current => ({ ...current, startYear: Number(event.target.value) }))}>{availableYears.map(year => <option key={year}>{year}</option>)}</select></label>
      <label>Look ahead<select value={config.horizon} onChange={event => setConfig(current => ({ ...current, horizon: Number(event.target.value) as ScenarioConfig["horizon"] }))}>{horizons.map(years => <option key={years} value={years}>{years} years</option>)}</select></label>
    </section>

    <section className="panel policy-question">
      <div className="policy-question-copy"><span>YOUR POLICY IDEA</span><h2>Grow solar electricity production</h2><p>Set a goal for solar generation compared with the starting year.</p></div>
      <label className="policy-goal"><span>Solar generation growth</span><strong>+{solarGrowth}%</strong><input aria-label="Solar generation growth target" type="range" min="0" max="50" step="1" value={solarGrowth} onChange={event => setSolarGrowth(Number(event.target.value))}/><small>Goal by {final.year} · currently set to {solarGrowth}%</small></label>
    </section>

    <section className="simple-results">
      <div className="simple-section-heading"><div><h2>What might change by {final.year}?</h2><p>Compared with the same outlook without this solar growth goal.</p></div><span className="tiny-demo">OBSERVE</span></div>
      <div className="policy-outcome-grid">
        <article className="panel policy-outcome solar-outcome"><span>Extra solar generation</span><b>+{fmt(solarChange, 0)} GWh</b><small>Modeled annual output compared with baseline</small></article>
        <article className="panel policy-outcome"><span>Total electricity generation</span><b>{supplyChange >= 0 ? "+" : ""}{fmt(supplyChange, 0)} GWh</b><small>All sources combined · annual change</small></article>
        <article className="panel policy-outcome"><span>Unmet energy gap indicator</span><b className={demandGapChange <= 0 ? "favorable" : "change"}>{demandGapChange > 0 ? "+" : ""}{fmt(demandGapChange, 0)} MU</b><small>{demandGapChange < 0 ? "Smaller modeled gap" : demandGapChange > 0 ? "Larger modeled gap" : "No modeled change"} · annual change</small></article>
      </div>
      <section className="panel simple-chart-panel"><div><h3>Will supply keep up with demand?</h3><p>Annual energy comparison · MU and GWh are numerically comparable at this scale</p></div><div className="chart-area"><ResponsiveContainer width="100%" height="100%"><LineChart data={chartRows}><CartesianGrid stroke="#e8edf0" vertical={false}/><XAxis dataKey="year"/><YAxis tickFormatter={(value:number) => fmt(value / 1000, 0) + "k"}/><Tooltip formatter={(value:number, name:string) => `${fmt(Number(value), 1)} ${name === "Generation with solar policy" ? "GWh" : "MU"} / year`}/><Legend/><Line dataKey="requirement" name="Energy requirement" stroke="#89979d" strokeDasharray="5 4" dot={false}/><Line dataKey="generation" name="Generation with solar policy" stroke="#147d78" strokeWidth={2.5} dot={false}/></LineChart></ResponsiveContainer></div></section>

      <section className="policy-reading-grid">
        <article className="panel policy-reading"><span className="reading-kicker">POSSIBLE BENEFIT</span><h3>More electricity from the sun</h3><p>The model adds solar generation, which can contribute to meeting annual energy needs and increase the renewable share.</p></article>
        <article className="panel policy-reading"><span className="reading-kicker tradeoff">WHAT TO WATCH</span><h3>Solar alone may not close the gap</h3><p>Demand keeps growing in this outlook. Solar output also varies with sunlight, so storage, flexible demand, grid connections and other dependable supply may matter.</p></article>
      </section>
      <div className="policy-next-step"><b>What could be considered next?</b><p>Compare this solar goal with actions that manage demand and support supply when sunlight is low. Costs, land, storage, transmission and hourly reliability are not represented here, so the results cannot tell us which mix is best.</p></div>
      <details className="panel simple-more"><summary>About this comparison</summary><div className="simple-more-content"><p>Solar growth is modeled as added capacity that reaches the selected generation goal by the end of the outlook. The annual energy-gap indicator is simplified and does not model hourly dispatch, weather variability, transmission, costs or reliability risk. Treat these results as a prompt for discussion, not a real-world estimate.</p><p><b>Modeled final-year solar output:</b> {fmt(final.generationBySource.Solar, 0)} GWh/year · <b>Renewable share:</b> {final.renewableShare.toFixed(1)}%</p></div></details>
      {issues.length > 0 && <p className="scenario-impact-invalid">Please reset or choose different assumptions before interpreting the results.</p>}
    </section>

    <section className="panel simple-save-panel"><div><h3>Keep this policy idea</h3><p>Saved scenarios stay in this browser.</p></div><div><button className="primary-btn" onClick={save} disabled={issues.length > 0}><Save size={14}/> Save scenario</button><button className="secondary-btn" onClick={() => exportScenario(scenarioConfig, results, baseline)} disabled={issues.length > 0}><Download size={14}/> Export results</button></div></section>
    {validSaved.length > 0 && <section className="panel simple-saved"><div className="simple-section-heading"><div><h2>Saved policy ideas</h2><p>Load or remove a saved comparison.</p></div></div>{validSaved.map(item => <div className="simple-saved-row" key={item.name}><span><b>{item.name}</b><small>{item.region} · {item.horizon}-year outlook</small></span><button onClick={() => load(item)}>Load</button><button aria-label={`Delete ${item.name}`} onClick={() => onSave(saved.filter(entry => entry.name !== item.name))}><Trash2 size={14}/></button></div>)}</section>}
  </div>;
}
