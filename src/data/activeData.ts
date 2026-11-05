import { observations, demandObservations, fmt, regions, states, technologies, metricDictionary, type Observation, type DemandObservation } from "./demoProvider";
import { readImportedDataset, validateImportedPair, type ImportedDataset } from "./realData";

let imported: ImportedDataset | null = null;
let mode: "demo" | "imported" = "demo";
export let activeObservations: Observation[] = observations;
export let activeDemandObservations: DemandObservation[] = demandObservations;

function applyMode() {
  activeObservations = mode === "imported" && imported ? imported.supply : observations;
  activeDemandObservations = mode === "imported" && imported ? imported.demand : demandObservations;
}

export async function loadActiveDataset() {
  imported = await readImportedDataset();
  if (imported) {
    try { validateImportedPair(imported.supply, imported.demand); }
    catch { imported = null; }
  }
  mode = localStorage.getItem("ep-data-mode") === "imported" && imported ? "imported" : "demo";
  if (mode === "demo") localStorage.removeItem("ep-data-mode");
  applyMode();
  return getDataMode();
}

export function activateImportedDataset(dataset: ImportedDataset) {
  imported = dataset;
  mode = "imported";
  localStorage.setItem("ep-data-mode", "imported");
  applyMode();
}

export function deactivateImportedDataset() {
  mode = "demo";
  localStorage.removeItem("ep-data-mode");
  applyMode();
}

export function getDataMode() {
  return mode === "imported" && imported ? "IMPORTED MONTHLY DATA · SOURCE NOT INDEPENDENTLY VERIFIED" : "DEMO DATA — SYNTHETIC, NOT OFFICIAL";
}

export const activeProvider = {
  getObservations: (): Observation[] => activeObservations,
  getDemandObservations: (): DemandObservation[] => activeDemandObservations,
  getMetrics: () => metricDictionary,
  getRegions: () => mode === "imported" && imported ? [...new Set(imported.supply.map(row => row.region))] : [...regions],
  getStates: () => mode === "imported" && imported ? [...new Set(imported.supply.map(row => row.state))] : [...states],
  getTechnologies: () => mode === "imported" && imported ? [...new Set(imported.supply.map(row => row.technology))] : [...technologies],
  getMonthlyDemand: (year: number, region = "All India", state = "All states") => activeDemandObservations.filter(o => o.year === year && (region === "All India" || o.region === region) && (state === "All states" || o.state === state)),
  getCapacitySnapshot: (year: number, region = "All India", state = "All states") => activeObservations.filter(o => o.year === year && o.month === 1 && (region === "All India" || o.region === region) && (state === "All states" || o.state === state)).reduce((sum, row) => sum + row.capacityMW, 0),
  fmt,
};
