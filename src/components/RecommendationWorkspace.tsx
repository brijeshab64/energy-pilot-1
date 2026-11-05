import { useMemo } from "react";
import { Activity, ArrowRight, Info } from "lucide-react";
import { activeProvider, getDataMode } from "@/data/activeData";
import { buildRecommendations, recommendationSourceLabel } from "@/data/recommendationModel";

export default function RecommendationWorkspace({ region, state, dataVersion, onNavigate, onRegion }: { region: string; state: string; dataVersion: number; onNavigate: (area: string) => void; onRegion: (region: string) => void }) {
  const mode = getDataMode();
  const recommendations = useMemo(() => buildRecommendations(activeProvider.getObservations(), activeProvider.getDemandObservations(), region, state), [region, state, dataVersion, mode]);
  const isSynthetic = mode.startsWith("DEMO");

  return <div className="space-y-4">
    <div className="notice amber"><Activity size={16}/><span><b>{recommendationSourceLabel(isSynthetic)}.</b> Recommendations are transparent review prompts driven by the selected dataset and forecast. They are not operational instructions, and no accuracy guarantee is implied.</span></div>
    <section className="grid gap-3 sm:grid-cols-3">
      {[ ["Recommendation method", "Rule-based, evidence-linked"], ["Forecast validation", "Three rolling 12-month holdouts"], ["Priority meaning", "Review ordering only"] ].map(([label, value]) => <div className="panel" key={label}><span className="text-xs text-slate-500">{label}</span><b className="mt-2 block text-sm">{value}</b></div>)}
    </section>
    <div className="flex items-start gap-2 rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-600"><Info size={16} className="mt-0.5 shrink-0 text-teal-700"/><span>Validation error summarizes historical holdouts only. Because the demo history is synthetic, a good score does not demonstrate real-world predictive accuracy. Regional categories follow the model's illustrative mappings.</span></div>
    <section className="recommendation-list">
      {recommendations.map(item => <article className="panel recommendation-card" key={item.id}>
        <div><span className="tiny-demo">{item.priority.toUpperCase()}</span><h3>{item.title}</h3><p>{item.geography}</p>
          <div className="mt-3"><b className="text-xs uppercase tracking-wide text-slate-500">Evidence</b><ul className="mt-2 space-y-1 text-sm text-slate-700">{item.evidence.map(evidence => <li key={evidence}>• {evidence}</li>)}</ul></div>
          <div className="mt-3"><b className="text-xs uppercase tracking-wide text-slate-500">Suggested review</b><p className="mt-1">{item.action}</p></div>
        </div>
        <dl><dt>Model reliability</dt><dd>{item.reliability}</dd><dt>Validation detail</dt><dd>{item.reliabilityDetail}</dd><dt>Selected scope</dt><dd>{region}{state !== "All states" ? ` / ${state}` : ""}</dd>
          <button className="mt-3 inline-flex items-center gap-2 text-sm font-semibold text-teal-800" onClick={() => { if (item.geography !== "All India" && item.geography !== region && !item.geography.includes(" · ")) onRegion(item.geography); onNavigate(item.id === "mix-review" ? "Supply" : "Demand"); }}>Open related analysis <ArrowRight size={14}/></button>
        </dl>
      </article>)}
      {!recommendations.length && <div className="panel"><h3>No recommendations available</h3><p className="muted">The selected geography does not have enough contiguous monthly data to calculate forecast-backed review prompts.</p></div>}
    </section>
  </div>;
}
