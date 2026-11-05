import type { DemandObservation, Observation } from "./demoProvider";

export type ForecastTarget = "Energy requirement" | "Energy supplied" | "Generation";
export type MonthlyValue = { period: string; year: number; month: number; value: number };
export type ForecastPoint = { period: string; year: number; month: number; value: number; kind: "history" | "forecast" };
export type BacktestResult = { points: { period: string; actual: number; predicted: number }[]; mae: number; mape: number; count: number } | null;
export type ForecastModelName = "Seasonal naive" | "Seasonal trend";
export type ModelComparison = { selected: ForecastModelName; models: { name: ForecastModelName; meanMape: number; foldMape: number[] }[]; folds: number } | null;

export function buildMonthlySeries(target: ForecastTarget, supply: Observation[], demand: DemandObservation[], region: string, state: string): MonthlyValue[] {
  const totals = new Map<string, number>();
  if (target === "Generation") {
    supply.filter(row => (region === "All India" || row.region === region) && (state === "All states" || row.state === state)).forEach(row => totals.set(row.period, (totals.get(row.period) || 0) + row.generationGWh));
  } else {
    demand.filter(row => (region === "All India" || row.region === region) && (state === "All states" || row.state === state)).forEach(row => totals.set(row.period, (totals.get(row.period) || 0) + (target === "Energy requirement" ? row.requirementMU : row.suppliedMU)));
  }
  return [...totals.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([period, value]) => {
    const [year, month] = period.split("-").map(Number);
    return { period, year, month, value };
  });
}

function isContiguous(series: MonthlyValue[]) {
  return series.every((row, index) => {
    if (index === 0) return true;
    const previous = series[index - 1];
    return row.month === (previous.month === 12 ? 1 : previous.month + 1) && row.year === (previous.month === 12 ? previous.year + 1 : previous.year);
  });
}

function fit(series: MonthlyValue[]) {
  if (series.length < 24 || !isContiguous(series)) return null;
  const recent = series.slice(-Math.min(60, series.length));
  const globalMean = recent.reduce((sum, row) => sum + row.value, 0) / recent.length;
  if (!(globalMean > 0)) return null;
  const seasonal = Array.from({ length: 12 }, (_, index) => {
    const values = recent.filter(row => row.month === index + 1).map(row => row.value);
    return (values.length ? values.reduce((a, b) => a + b, 0) / values.length : globalMean) / globalMean;
  });
  const x = recent.map((_, index) => index);
  const y = recent.map((row, index) => row.value / Math.max(0.05, seasonal[row.month - 1]));
  const meanX = x.reduce((a, b) => a + b, 0) / x.length;
  const meanY = y.reduce((a, b) => a + b, 0) / y.length;
  const denominator = x.reduce((sum, value) => sum + (value - meanX) ** 2, 0);
  const slope = denominator ? x.reduce((sum, value, index) => sum + (value - meanX) * (y[index] - meanY), 0) / denominator : 0;
  return { seasonal, slope, intercept: meanY - slope * meanX, recentLength: recent.length };
}

function addMonths(year: number, month: number, count: number) {
  const date = new Date(Date.UTC(year, month - 1 + count, 1));
  return { year: date.getUTCFullYear(), month: date.getUTCMonth() + 1 };
}

function forecastFrom(series: MonthlyValue[], count: number, modelName: ForecastModelName): ForecastPoint[] {
  if (modelName === "Seasonal naive") {
    if (series.length < 12) return [];
    const latest = series[series.length - 1];
    return Array.from({ length: count }, (_, index) => {
      const { year, month } = addMonths(latest.year, latest.month, index + 1);
      const reference = series[series.length - 12 + (index % 12)];
      return { period: `${year}-${String(month).padStart(2, "0")}`, year, month, value: Math.max(0, reference.value), kind: "forecast" as const };
    });
  }
  const model = fit(series);
  if (!model || !series.length) return [];
  const latest = series[series.length - 1];
  const anchor = model.recentLength - 1;
  return Array.from({ length: count }, (_, index) => {
    const { year, month } = addMonths(latest.year, latest.month, index + 1);
    const trendValue = model.intercept + model.slope * (anchor + index + 1);
    return { period: `${year}-${String(month).padStart(2, "0")}`, year, month, value: Math.max(0, trendValue * model.seasonal[month - 1]), kind: "forecast" as const };
  });
}

export function compareForecastModels(series: MonthlyValue[]): ModelComparison {
  if (series.length < 72 || !isContiguous(series)) return null;
  const latestOrigin = series.length - 12;
  const origins = [latestOrigin - 36, latestOrigin - 24, latestOrigin - 12];
  const candidates: ForecastModelName[] = ["Seasonal naive", "Seasonal trend"];
  const models = candidates.map(name => {
    const foldMape = origins.map(origin => {
      const training = series.slice(0, origin);
      const actual = series.slice(origin, origin + 12);
      const forecast = forecastFrom(training, 12, name);
      return actual.length === 12 && forecast.length === 12
        ? actual.reduce((sum, row, index) => sum + Math.abs(row.value - forecast[index].value) / Math.max(Math.abs(row.value), 1) * 100, 0) / 12
        : NaN;
    });
    return { name, foldMape, meanMape: foldMape.every(Number.isFinite) ? foldMape.reduce((sum, value) => sum + value, 0) / foldMape.length : NaN };
  }).filter(model => Number.isFinite(model.meanMape));
  if (!models.length) return null;
  models.sort((a, b) => a.meanMape - b.meanMape);
  return { selected: models[0].name, models, folds: origins.length };
}

export function makeForecast(series: MonthlyValue[], count: number): ForecastPoint[] {
  if (series.length < 24 || !isContiguous(series)) return [];
  const history = series.slice(-24).map(row => ({ ...row, kind: "history" as const }));
  const comparison = compareForecastModels(series);
  const selected = comparison?.selected || "Seasonal trend";
  return [...history, ...forecastFrom(series, count, selected)];
}

export function runBacktest(series: MonthlyValue[]): BacktestResult {
  if (series.length < 36 || !isContiguous(series)) return null;
  const test = series.slice(-12);
  const training = series.slice(0, -12);
  const selected = compareForecastModels(training)?.selected || "Seasonal trend";
  const predictions = forecastFrom(training, 12, selected);
  if (predictions.length !== test.length) return null;
  const points = test.map((actual, index) => ({ period: actual.period, actual: actual.value, predicted: predictions[index].value }));
  const mae = points.reduce((sum, point) => sum + Math.abs(point.actual - point.predicted), 0) / points.length;
  const positiveActuals = points.filter(point => point.actual > 0);
  const mape = positiveActuals.length ? positiveActuals.reduce((sum, point) => sum + Math.abs(point.actual - point.predicted) / point.actual * 100, 0) / positiveActuals.length : NaN;
  return { points, mae, mape, count: points.length };
}

export function forecastMethodDescription(series: MonthlyValue[]) {
  const comparison = compareForecastModels(series);
  if (!comparison) return "The model compares seasonal naive and seasonal trend benchmarks using three rolling 12-month holdouts when at least 72 contiguous months are available. With shorter history, it uses the seasonal trend benchmark without model-selection evidence.";
  return `Compares seasonal naive (repeat the prior year's same months) with seasonal trend (calendar-month averages plus a linear trend) across ${comparison.folds} rolling 12-month holdouts. ${comparison.selected} has the lowest average holdout MAPE and is used for projection. This is a transparent benchmark selection, not a validated grid-planning model.`;
}

export function targetUnit(target: ForecastTarget) {
  return target === "Generation" ? "GWh / month" : "MU / month";
}

export function forecastGrowthPercent(series: MonthlyValue[], forecast: ForecastPoint[]) {
  if (series.length < 12 || forecast.length < 12) return null;
  const lastYear = series.slice(-12).reduce((sum, row) => sum + row.value, 0);
  const nextYear = forecast.slice(0, 12).reduce((sum, row) => sum + row.value, 0);
  return lastYear > 0 ? (nextYear / lastYear - 1) * 100 : null;
}
