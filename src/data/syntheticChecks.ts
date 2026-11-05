import { annualSyntheticTotals, demandObservations, observations, regions, states } from "./demoProvider";

export function runSyntheticModelChecks() {
  const issues: string[] = [];
  const demandByState = new Map<string, number>();
  const generationByState = new Map<string, number>();
  const demandByRegion = new Map<string, number>();
  const generationByRegion = new Map<string, number>();
  for (const row of demandObservations) {
    const yearState = `${row.year}|${row.state}`;
    const yearRegion = `${row.year}|${row.region}`;
    demandByState.set(yearState, (demandByState.get(yearState) || 0) + row.requirementMU);
    demandByRegion.set(yearRegion, (demandByRegion.get(yearRegion) || 0) + row.requirementMU);
  }
  for (const row of observations) {
    const yearState = `${row.year}|${row.state}`;
    const yearRegion = `${row.year}|${row.region}`;
    generationByState.set(yearState, (generationByState.get(yearState) || 0) + row.generationGWh);
    generationByRegion.set(yearRegion, (generationByRegion.get(yearRegion) || 0) + row.generationGWh);
  }
  const annual = annualSyntheticTotals();
  for (const year of annual) {
    const ratio = year.generationGWh / year.requirementMU;
    if (ratio < 1.05 || ratio > 1.8) issues.push(`${year.year}: generation/requirement ratio ${ratio.toFixed(2)} is outside the modeled plausibility band.`);
    const stateDemand = states.reduce((sum, state) => sum + (demandByState.get(`${year.year}|${state}`) || 0), 0);
    const stateGeneration = states.reduce((sum, state) => sum + (generationByState.get(`${year.year}|${state}`) || 0), 0);
    const regionalDemand = regions.reduce((sum, region) => sum + (demandByRegion.get(`${year.year}|${region}`) || 0), 0);
    const regionalGeneration = regions.reduce((sum, region) => sum + (generationByRegion.get(`${year.year}|${region}`) || 0), 0);
    if (Math.abs(stateDemand - year.requirementMU) > 0.01) issues.push(`${year.year}: state demand does not reconcile to national demand.`);
    if (Math.abs(stateGeneration - year.generationGWh) > 0.01) issues.push(`${year.year}: state generation does not reconcile to national generation.`);
    if (Math.abs(regionalDemand - year.requirementMU) > 0.01) issues.push(`${year.year}: regional demand does not reconcile to national demand.`);
    if (Math.abs(regionalGeneration - year.generationGWh) > 0.01) issues.push(`${year.year}: regional generation does not reconcile to national generation.`);
  }
  return { ok: issues.length === 0, issues, years: annual.length, demandRows: demandObservations.length, supplyRows: observations.length };
}

if (import.meta.env.DEV) {
  const result = runSyntheticModelChecks();
  if (!result.ok) console.warn("EnergyPilot synthetic model consistency checks:", result.issues);
}
