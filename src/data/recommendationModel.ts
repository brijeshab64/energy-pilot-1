import type { DemandObservation, Observation } from "./demoProvider";
import { buildMonthlySeries, forecastGrowthPercent, makeForecast, type ForecastTarget } from "./forecastModel";

export type Recommendation = {
  id: string;
  title: string;
  priority: "Review soon" | "Monitor" | "Informational";
  geography: string;
  evidence: string[];
  action: string;
  reliability: string;
  reliabilityDetail: string;
};

function validationSummary(series: ReturnType<typeof buildMonthlySeries>) {
  if (series.length < 60) return { label: "Insufficient validation history", detail: "At least 60 contiguous months are needed for three rolling 12-month holdouts with 24 months of training." };
  const testStart = series.length - 12;
  const origins = [testStart - 36, testStart - 24, testStart - 12];
  const errors: number[] = [];
  for (const origin of origins) {
    const training = series.slice(0, origin);
    const actual = series.slice(origin, origin + 12);
    const projected = makeForecast(training, 12).filter(point => point.kind === "forecast");
    if (actual.length !== 12 || projected.length !== 12) continue;
    const mape = actual.reduce((sum, row, index) => sum + Math.abs(row.value - projected[index].value) / Math.max(row.value, 1) * 100, 0) / 12;
    errors.push(mape);
  }
  if (errors.length !== 3) return { label: "Validation unavailable", detail: "Three complete rolling holdouts could not be calculated." };
  const mean = errors.reduce((sum, error) => sum + error, 0) / errors.length;
  const spread = Math.max(...errors) - Math.min(...errors);
  const label = mean <= 5 && spread <= 5 ? "Stable on historical holdouts" : mean <= 12 ? "Mixed historical holdout results" : "Weak historical holdout results";
  return { label, detail: `Three rolling 12-month holdouts · mean MAPE ${mean.toFixed(1)}% · range ${Math.min(...errors).toFixed(1)}–${Math.max(...errors).toFixed(1)}%. Historical fit only; not a guarantee.` };
}

export function buildRecommendations(supply: Observation[], demand: DemandObservation[], region: string, state: string): Recommendation[] {
  const scope = (region === "All India" ? "All India" : region) + (state === "All states" ? "" : ` · ${state}`);
  const demandSeries = buildMonthlySeries("Energy requirement", supply, demand, region, state);
  const supplySeries = buildMonthlySeries("Energy supplied", supply, demand, region, state);
  const validation = validationSummary(demandSeries);
  const demandGrowth = forecastGrowthPercent(demandSeries, makeForecast(demandSeries, 12).filter(point => point.kind === "forecast"));
  const suppliedForecast = makeForecast(supplySeries, 12).filter(point => point.kind === "forecast");
  const demandForecast = makeForecast(demandSeries, 12).filter(point => point.kind === "forecast");
  const recs: Recommendation[] = [];

  if (demandGrowth !== null && demandForecast.length && suppliedForecast.length) {
    const nextDemand = demandForecast.reduce((sum, point) => sum + point.value, 0);
    const nextSupply = suppliedForecast.reduce((sum, point) => sum + point.value, 0);
    const projectedCoverage = nextDemand > 0 ? nextSupply / nextDemand * 100 : NaN;
    const current = demandSeries.slice(-12).reduce((sum, point) => sum + point.value, 0);
    const latestSupply = supplySeries.slice(-12).reduce((sum, point) => sum + point.value, 0);
    const currentCoverage = current > 0 ? latestSupply / current * 100 : NaN;
    recs.push({
      id: "demand-path", title: "Review the forward demand and supplied-energy path", priority: projectedCoverage < currentCoverage - 0.2 ? "Review soon" : Math.abs(demandGrowth) >= 6 ? "Monitor" : "Informational", geography: scope,
      evidence: [`Forecast demand change: ${demandGrowth >= 0 ? "+" : ""}${demandGrowth.toFixed(1)}% over the next 12 months versus the latest 12-month total.`, `Modeled supplied / requirement: ${currentCoverage.toFixed(1)}% recent history; ${projectedCoverage.toFixed(1)}% projected.`],
      action: "Review regional demand assumptions, planned procurement, and demand-side measures before operational use.", reliability: validation.label, reliabilityDetail: validation.detail,
    });
  }

  const byRegion = [...new Set(demand.map(row => row.region))].filter(name => region === "All India" || name === region);
  const regionalGrowth = byRegion.map(name => {
    const series = buildMonthlySeries("Energy requirement", supply, demand, name, "All states");
    return { name, growth: forecastGrowthPercent(series, makeForecast(series, 12).filter(point => point.kind === "forecast")), series };
  }).filter(item => item.growth !== null).sort((a, b) => (b.growth || 0) - (a.growth || 0));
  if (state === "All states" && regionalGrowth.length) {
    const top = regionalGrowth[0];
    const regionValidation = validationSummary(top.series);
    recs.push({ id: "regional-growth", title: "Prioritize a regional demand review", priority: (top.growth || 0) >= 6 ? "Monitor" : "Informational", geography: top.name,
      evidence: [`Highest modeled 12-month demand growth among available regions: ${(top.growth || 0) >= 0 ? "+" : ""}${(top.growth || 0).toFixed(1)}%.`, `Computed from the region's monthly requirement series; no causal drivers are modeled.`],
      action: `Compare state-level assumptions and local plans within ${top.name}; do not treat this ranking as a capacity requirement.`, reliability: regionValidation.label, reliabilityDetail: regionValidation.detail });
  }

  const technologyRows = supply.filter(row => (region === "All India" || row.region === region) && (state === "All states" || row.state === state));
  const latestPeriod = [...new Set(technologyRows.map(row => row.period))].sort().at(-1);
  if (latestPeriod) {
    const latest = technologyRows.filter(row => row.period === latestPeriod);
    const total = latest.reduce((sum, row) => sum + row.generationGWh, 0);
    const renewable = latest.filter(row => ["Solar", "Wind", "Hydro", "Small hydro", "Bio-power"].includes(row.technology)).reduce((sum, row) => sum + row.generationGWh, 0);
    const share = total > 0 ? renewable / total * 100 : NaN;
    if (Number.isFinite(share)) recs.push({ id: "mix-review", title: "Check generation-mix assumptions against operational constraints", priority: "Informational", geography: scope,
      evidence: [`Illustrative renewable-category share in ${latestPeriod}: ${share.toFixed(1)}% of modeled generation.`, "This is a generation-energy share, not installed capacity or firm/dispatchable supply."],
      action: "Validate resource, transmission, storage, and balancing assumptions against an authoritative regional dataset.", reliability: "Descriptive only", reliabilityDetail: "This share is a calculation from the active records, not a forecast or reliability estimate." });
  }
  return recs;
}

export function recommendationSourceLabel(isSynthetic: boolean) {
  return isSynthetic ? "Synthetic assumptions · not real-world recommendations" : "Imported data · source not independently verified";
}

export type RecommendationTarget = ForecastTarget;
