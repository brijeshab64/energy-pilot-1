import { useMemo } from "react";
import { Activity, AlertTriangle, Info } from "lucide-react";
import { CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { activeProvider, getDataMode } from "@/data/activeData";
import { fmt } from "@/data/demoProvider";
import { buildMonthlySeries, forecastGrowthPercent, forecastMethodDescription, makeForecast, runBacktest, targetUnit, type ForecastTarget } from "@/data/forecastModel";

export default function ForecastWorkspace({region,state,target,setTarget,horizon,setHorizon,dataVersion}:{region:string;state:string;target:ForecastTarget;setTarget:(value:ForecastTarget)=>void;horizon:number;setHorizon:(value:number)=>void;dataVersion:number}) {
  const mode = getDataMode();
  const series = useMemo(() => buildMonthlySeries(target, activeProvider.getObservations(), activeProvider.getDemandObservations(), region, state), [target,region,state,dataVersion,mode]);
  const forecast = useMemo(() => makeForecast(series,horizon), [series,horizon]);
  const backtest = useMemo(() => runBacktest(series), [series]);
  const chartRows = forecast.map(point => ({ period:point.period, history:point.kind==="history"?point.value:undefined, forecast:point.kind==="forecast"?point.value:undefined }));
  const backtestRows = backtest?.points.map(point => ({...point})) || [];
  const unit = targetUnit(target);
  const isDemo = mode.startsWith("DEMO");
  const lastObserved = series[series.length-1];
  const firstForecast = forecast.find(point => point.kind === "forecast");
  const finalForecast = forecast[forecast.length-1];
  const growth = forecastGrowthPercent(series, forecast.filter(point=>point.kind==="forecast"));
  const enough = forecast.length > 0;

  return <div className="space-y-4">
    <div className="notice amber"><Activity size={16}/><span><b>{isDemo?"Synthetic decade · not official observations.":"Imported monthly observations · source not independently verified."}</b> The projection is a data-derived model calculation, not a live-system conclusion.</span></div>
    <div className="grid gap-4 lg:grid-cols-[minmax(250px,.72fr)_minmax(0,1.6fr)]">
      <section className="panel controls-panel space-y-4">
        <h3>Forecast setup</h3>
        <label className="form-label">Target metric<select value={target} onChange={event=>setTarget(event.target.value as ForecastTarget)}><option>Energy requirement</option><option>Energy supplied</option><option>Generation</option></select></label>
        <label className="form-label">Forecast horizon · {horizon} months<input type="range" min="3" max="24" value={horizon} onChange={event=>setHorizon(Number(event.target.value))}/></label>
        <div className="model-meta"><b>Method</b><span>Monthly seasonality + linear trend · v1.0</span><b>Scope</b><span>{region} / {state}</span><b>Input coverage</b><span>{series.length} months · {series[0]?.period||"—"} to {lastObserved?.period||"—"}</span><b>Calculation status</b><span>{enough?"Calculated from available series":"Insufficient history"}</span><b>Source mode</b><span>{isDemo?"Synthetic demo dataset":"Imported monthly dataset"}</span></div>
      </section>
      <section className="panel">
        <div className="panel-head"><div><h3>{target} · monthly history and projection</h3><p>{region}{state!=="All states"?` / ${state}`:""} · {unit} · history through {lastObserved?.period||"—"}</p></div><span className="tiny-demo">{isDemo?"SYNTHETIC MODEL":"MODEL OUTPUT"}</span></div>
        {enough?<div className="chart-area forecast-chart"><ResponsiveContainer width="100%" height="100%"><LineChart data={chartRows}><CartesianGrid stroke="#e8edf0" vertical={false}/><XAxis dataKey="period" tick={{fontSize:9}} interval={Math.max(0,Math.floor(chartRows.length/8))}/><YAxis tickFormatter={(value:number)=>fmt(value/1000,0)+"k"}/><Tooltip formatter={(value:number)=>`${fmt(Number(value),1)} ${unit}`}/><Legend/><Line dataKey="history" name={`Observed series (${isDemo?"synthetic demo":"imported"})`} stroke="#5277a5" strokeWidth={2} dot={false} connectNulls={false}/><Line dataKey="forecast" name="Model forecast · no interval" stroke="#147d78" strokeWidth={2.5} strokeDasharray="6 3" dot={false} connectNulls={false}/></LineChart></ResponsiveContainer></div>:<div className="notice amber"><AlertTriangle size={16}/><span>At least 24 contiguous monthly observations are needed to estimate seasonal factors and a trend. No forecast is shown for this selection.</span></div>}
      </section>
    </div>
    {enough&&<div className="grid gap-3 sm:grid-cols-3"><div className="panel"><span className="text-xs text-slate-500">Latest observed · {lastObserved?.period}</span><b className="mt-2 block text-lg">{fmt(lastObserved?.value||0,1)} <small>{unit}</small></b></div><div className="panel"><span className="text-xs text-slate-500">Horizon endpoint · {finalForecast?.period}</span><b className="mt-2 block text-lg">{fmt(finalForecast?.value||0,1)} <small>{unit}</small></b></div><div className="panel"><span className="text-xs text-slate-500">Next 12-month total change vs last 12 months</span><b className="mt-2 block text-lg">{growth===null?"Not available":`${growth>=0?"+":""}${growth.toFixed(1)}%`}</b></div></div>}
    <section className="panel">
      <div className="panel-head"><div><h3>Retrospective holdout check · last 12 months</h3><p>Fit on earlier history, forecast the held-out months, compare with the same series.</p></div><span className="tiny-demo">BACKTEST</span></div>
      {backtest?<><div className="chart-area forecast-chart"><ResponsiveContainer width="100%" height="100%"><LineChart data={backtestRows}><CartesianGrid stroke="#e8edf0" vertical={false}/><XAxis dataKey="period" tick={{fontSize:9}}/><YAxis tickFormatter={(value:number)=>fmt(value/1000,0)+"k"}/><Tooltip formatter={(value:number)=>`${fmt(Number(value),1)} ${unit}`}/><Legend/><Line dataKey="actual" name="Held-out observed value" stroke="#5277a5" strokeWidth={2} dot={false}/><Line dataKey="predicted" name="Holdout forecast" stroke="#d97958" strokeWidth={2} strokeDasharray="5 3" dot={false}/></LineChart></ResponsiveContainer></div><div className="result-metrics"><div><span>Mean absolute error</span><b>{fmt(backtest.mae,1)} {unit}</b></div><div><span>Mean absolute percentage error</span><b>{Number.isFinite(backtest.mape)?`${backtest.mape.toFixed(1)}%`:"Not available"}</b></div><div><span>Held-out months</span><b>{backtest.count}</b></div></div><p className="muted">This is one retrospective holdout, not a guarantee of future accuracy. It has no uncertainty interval and is not a substitute for time-series cross-validation across multiple years.</p></>:<p className="muted">Backtest is not modeled: at least 36 monthly observations are required to keep 24 months for fitting and reserve the latest 12 months for testing.</p>}
    </section>
    <details className="scenario-method"><summary><b>How the forecast and backtest are calculated</b><span>Method, inputs and limitations</span></summary><div><p>{forecastMethodDescription(series)}</p><p><b>Backtest:</b> the latest 12 values are held out. The same seasonal-factor and linear-trend method is fitted using earlier values; mean absolute error and mean absolute percentage error are calculated against those held-out values. Requires at least 36 observations.</p><p><b>Inputs:</b> {target} in {unit}, aggregated from disjoint state-month demand records or source-month generation rows for {region}{state!=="All states"?` / ${state}`:""}. Demo history is entirely synthetic; imported records are not independently verified. No interval or probabilistic uncertainty is calculated.</p><p><Info size={13} className="inline"/> Forecasting is exploratory. Structural changes, weather, policy, demand response, dispatch, and data revisions are not explicitly modeled.</p><p>{firstForecast?`First projected month: ${firstForecast.period}.` : "No projected month available."}</p></div></details>
  </div>;
}
