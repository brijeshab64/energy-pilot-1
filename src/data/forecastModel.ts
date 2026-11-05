import type { DemandObservation, Observation } from "./demoProvider";

export type ForecastTarget = "Energy requirement" | "Energy supplied" | "Generation";
export type MonthlyValue = { period: string; year: number; month: number; value: number };
export type ForecastPoint = { period: string; year: number; month: number; value: number; kind: "history" | "forecast" };
export type BacktestResult = { points: { period: string; actual: number; predicted: number }[]; mae: number; mape: number; count: number } | null;

export function buildMonthlySeries(target: ForecastTarget, supply: Observation[], demand: DemandObservation[], region: string, state: string): MonthlyValue[] {
  const totals = new Map<string, number>();
  if (target === "Generation") {
    supply.filter(row => (region === "All India" || row.region === region) && (state === "All states" || row.state === state)).forEach(row => totals.set(row.period, (totals.get(row.period) || 0) + row.generationGWh));
  } else {
    demand.filter(row => (region === "All India" || row.region === region) && (state === "All states" || row.state === state)).forEach(row => {
      totals.set(row.period, (totals.get(row.period) || 0) + (target === "Energy requirement" ? row.requirementMU : row.suppliedMU));
    });
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
    const expectedMonth = previous.month === 12 ? 1 : previous.month + 1;
    const expectedYear = previous.month === 12 ? previous.year + 1 : previous.year;
    return row.month === expectedMonth && row.year === expectedYear;
  });
}

function fit(series: MonthlyValue[]) {
  if (series.length < 24 || !isContiguous(series)) return null;
  const recent = series.slice(-Math.min(60, series.length));
  const globalMean = recent.reduce((sum, row) => sum + row.value, 0) / recent.length;
  if (!(globalMean > 0)) return null;
  const seasonal = Array.from({ length: 12 }, (_, index) => {
    const values = recent.filter(row => row.month === index + 1).map(row => row.value);
    const mean = values.length ? values.reduce((a, b) => a + b, 0) / values.length : globalMean;
    return mean / globalMean;
  });
  const x = recent.map((_, index) => index);
  const y = recent.map((row, index) => row.value / Math.max(0.05, seasonal[row.month - 1]));
  const meanX = x.reduce((a, b) => a + b, 0) / x.length;
  const meanY = y.reduce((a, b) => a + b, 0) / y.length;
  const denominator = x.reduce((sum, value) => sum + (value - meanX) ** 2, 0);
  const slope = denominator ? x.reduce((sum, value, index) => sum + (value - meanX) * (y[index] - meanY), 0) / denominator : 0;
  const intercept = meanY - slope * meanX;
  return { seasonal, slope, intercept, origin: recent[0].period, recentLength: recent.length };
}

function addMonths(year: number, month: number, count: number) {
  const date = new Date(Date.UTC(year, month - 1 + count, 1));
  return { year: date.getUTCFullYear(), month: date.getUTCMonth() + 1 };
}

function forecastFrom(series: MonthlyValue[], count: number): ForecastPoint[] {
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

export function makeForecast(series: MonthlyValue[], count: number): ForecastPoint[] {
  if (series.length < 24) return [];
  const history = series.slice(-24).map(row => ({ ...row, kind: "history" as const }));
  return [...history, ...forecastFrom(series, count)];
}

export function runBacktest(series: MonthlyValue[]): BacktestResult {
  if (series.length < 36 || !isContiguous(series)) return null;
  const test = series.slice(-12);
  const training = series.slice(0, -12);
  const predictions = forecastFrom(training, 12);
  if (predictions.length !== test.length) return null;
  const points = test.map((actual, index) => ({ period: actual.period, actual: actual.value, predicted: predictions[index].value }));
  const mae = points.reduce((sum, point) => sum + Math.abs(point.actual - point.predicted), 0) / points.length;
  const positiveActuals = points.filter(point => point.actual > 0);
  const mape = positiveActuals.length ? positiveActuals.reduce((sum, point) => sum + Math.abs(point.actual - point.predicted) / point.actual * 100, 0) / positiveActuals.length : NaN;
  return { points, mae, mape, count: points.length };
}

export function forecastMethodDescription(series: MonthlyValue[]) {
  const months = Math.min(60, series.length);
  return `Uses the most recent ${months} available monthly observations. It estimates a separate average seasonal factor for each calendar month, divides those seasonal effects out, fits a straight-line least-squares trend to the adjusted values, then reapplies the month factors. Forecast values are floored at zero. This is a simple transparent benchmark, not a validated grid-planning model.`;
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
