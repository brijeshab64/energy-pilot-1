import { annualSyntheticTotals, demandObservations, observations, regions, states } from "./demoProvider";

const tolerance = 0.01;

export function runSyntheticModelChecks() {
  const issues: string[] = [];
  const demandByState = new Map<string, number>();
  const generationByState = new Map<string, number>();
  const demandByRegion = new Map<string, number>();
  const generationByRegion = new Map<string, number>();
  const demandByMonth = new Map<string, number>();
  const generationByMonth = new Map<string, number>();
  const demandKeys = new Set<string>();
  const generationKeys = new Set<string>();

  for (const row of demandObservations) {
    const monthKey = row.period;
    const stateKey = `${monthKey}|${row.state}`;
    const regionKey = `${monthKey}|${row.region}`;
    if (demandKeys.has(stateKey)) issues.push(`${stateKey}: duplicate demand record.`);
    demandKeys.add(stateKey);
    if (!states.includes(row.state as typeof states[number]) || !regions.includes(row.region as typeof regions[number])) {
      issues.push(`${stateKey}: unknown state or region.`);
    }
    if (![row.requirementMU, row.suppliedMU, row.peakMW, row.peakMetMW].every(value => value === undefined || Number.isFinite(value) && value >= 0)) {
      issues.push(`${stateKey}: invalid or negative demand metric.`);
    }
    if (row.suppliedMU > row.requirementMU + tolerance || (row.peakMW !== undefined && row.peakMetMW !== undefined && row.peakMetMW > row.peakMW + tolerance)) {
      issues.push(`${stateKey}: supplied energy or peak met exceeds its requirement.`);
    }
    demandByState.set(`${row.year}|${row.state}`, (demandByState.get(`${row.year}|${row.state}`) || 0) + row.requirementMU);
    demandByRegion.set(`${row.year}|${row.region}`, (demandByRegion.get(`${row.year}|${row.region}`) || 0) + row.requirementMU);
    demandByMonth.set(monthKey, (demandByMonth.get(monthKey) || 0) + row.requirementMU);
  }

  for (const row of observations) {
    const monthKey = row.period;
    const recordKey = `${monthKey}|${row.state}|${row.technology}`;
    if (generationKeys.has(recordKey)) issues.push(`${recordKey}: duplicate generation record.`);
    generationKeys.add(recordKey);
    if (!states.includes(row.state as typeof states[number]) || !regions.includes(row.region as typeof regions[number])) {
      issues.push(`${recordKey}: unknown state or region.`);
    }
    if (![row.generationGWh, row.capacityMW, row.plf, row.availability].every(Number.isFinite) || row.generationGWh < 0 || row.capacityMW < 0 || row.plf < 0 || row.plf > 1 || row.availability < 0 || row.availability > 1) {
      issues.push(`${recordKey}: invalid generation, capacity, PLF, or availability value.`);
    }
    generationByState.set(`${row.year}|${row.state}`, (generationByState.get(`${row.year}|${row.state}`) || 0) + row.generationGWh);
    generationByRegion.set(`${row.year}|${row.region}`, (generationByRegion.get(`${row.year}|${row.region}`) || 0) + row.generationGWh);
    generationByMonth.set(monthKey, (generationByMonth.get(monthKey) || 0) + row.generationGWh);
  }

  const annual = annualSyntheticTotals();
  for (const year of annual) {
    const ratio = year.generationGWh / year.requirementMU;
    if (ratio < 1.05 || ratio > 1.8) issues.push(`${year.year}: generation/requirement ratio ${ratio.toFixed(2)} is outside the modeled plausibility band.`);
    const stateDemand = states.reduce((sum, state) => sum + (demandByState.get(`${year.year}|${state}`) || 0), 0);
    const stateGeneration = states.reduce((sum, state) => sum + (generationByState.get(`${year.year}|${state}`) || 0), 0);
    const regionalDemand = regions.reduce((sum, region) => sum + (demandByRegion.get(`${year.year}|${region}`) || 0), 0);
    const regionalGeneration = regions.reduce((sum, region) => sum + (generationByRegion.get(`${year.year}|${region}`) || 0), 0);
    if (Math.abs(stateDemand - year.requirementMU) > tolerance) issues.push(`${year.year}: state demand does not reconcile to national demand.`);
    if (Math.abs(stateGeneration - year.generationGWh) > tolerance) issues.push(`${year.year}: state generation does not reconcile to national generation.`);
    if (Math.abs(regionalDemand - year.requirementMU) > tolerance) issues.push(`${year.year}: regional demand does not reconcile to national demand.`);
    if (Math.abs(regionalGeneration - year.generationGWh) > tolerance) issues.push(`${year.year}: regional generation does not reconcile to national generation.`);

    for (let month = 1; month <= 12; month++) {
      const key = `${year.year}-${String(month).padStart(2, "0")}`;
      const monthDemand = demandByMonth.get(key) || 0;
      const monthGeneration = generationByMonth.get(key) || 0;
      if (monthDemand <= 0 || monthGeneration <= 0) issues.push(`${key}: missing monthly demand or generation.`);
      const regionalMonthDemand = regions.reduce((sum, region) => demandObservations.filter(row => row.period === key && row.region === region).reduce((subtotal, row) => subtotal + row.requirementMU, sum), 0);
      const regionalMonthGeneration = regions.reduce((sum, region) => observations.filter(row => row.period === key && row.region === region).reduce((subtotal, row) => subtotal + row.generationGWh, sum), 0);
      if (Math.abs(regionalMonthDemand - monthDemand) > tolerance) issues.push(`${key}: regional demand does not reconcile to national monthly demand.`);
      if (Math.abs(regionalMonthGeneration - monthGeneration) > tolerance) issues.push(`${key}: regional generation does not reconcile to national monthly generation.`);
    }
  }
  return { ok: issues.length === 0, issues, years: annual.length, demandRows: demandObservations.length, supplyRows: observations.length };
}

if (import.meta.env.DEV) {
  const result = runSyntheticModelChecks();
  if (!result.ok) console.warn("EnergyPilot synthetic model consistency checks:", result.issues);
}
