export type ConsumerType = "Household" | "Small commercial business" | "Industrial facility";
export type EnergyProfile = { id: string; label: string; consumerType: ConsumerType; region: string; discom: string; contractDemandKW: number; powerFactor?: number; productionKwhPerUnit?: number };
export type BillRecord = { id: string; period: string; profileId: string; kwh: number; maxDemandKW?: number; powerFactor?: number; total: number; tariffId: string; source: "Synthetic demo" | "Manual entry" | "CSV import"; fixed: number; energy: number; demand: number; duty: number; surcharge: number; subsidy: number };
export type IntervalReading = { day: number; hour: number; kwh: number; demandKW: number; period: "Off-peak" | "Day" | "Peak" };
export type TariffPlan = { id: string; name: string; region: string; discom: string; category: ConsumerType; start: string; end: string; currency: "INR"; fixedMonthly: number; slabs: { upto: number; rate: number }[]; demandRate: number; dutyPercent: number; fuelRate: number; subsidy: number; peakRate?: number; offPeakCredit?: number; sourceNote: string };

export const profiles: EnergyProfile[] = [
  { id: "home", label: "Aarav's apartment", consumerType: "Household", region: "Maharashtra", discom: "DemoGrid West", contractDemandKW: 5 },
  { id: "shop", label: "Corner bakery", consumerType: "Small commercial business", region: "Karnataka", discom: "DemoGrid South", contractDemandKW: 18, powerFactor: .96 },
  { id: "factory", label: "Textile works", consumerType: "Industrial facility", region: "Gujarat", discom: "DemoGrid West", contractDemandKW: 500, powerFactor: .91, productionKwhPerUnit: 3.2 },
];
export const tariffs: TariffPlan[] = [
  { id: "home-standard", name: "Residential Standard", region: "Maharashtra", discom: "DemoGrid West", category: "Household", start: "2025-04-01", end: "2026-03-31", currency: "INR", fixedMonthly: 110, slabs: [{ upto: 100, rate: 4.1 }, { upto: 300, rate: 7.2 }, { upto: Infinity, rate: 9.4 }], demandRate: 0, dutyPercent: 8, fuelRate: .42, subsidy: 0, peakRate: 0, offPeakCredit: 0, sourceNote: "Synthetic tariff schedule" },
  { id: "home-tou", name: "Residential Time Choice", region: "Maharashtra", discom: "DemoGrid West", category: "Household", start: "2025-04-01", end: "2026-03-31", currency: "INR", fixedMonthly: 145, slabs: [{ upto: 100, rate: 4.3 }, { upto: 300, rate: 7.0 }, { upto: Infinity, rate: 8.9 }], demandRate: 0, dutyPercent: 8, fuelRate: .42, subsidy: 0, peakRate: 3.1, offPeakCredit: .8, sourceNote: "Synthetic time-of-day alternative; eligible only with interval readings" },
  { id: "business-standard", name: "Small Business General", region: "Karnataka", discom: "DemoGrid South", category: "Small commercial business", start: "2025-04-01", end: "2026-03-31", currency: "INR", fixedMonthly: 460, slabs: [{ upto: 500, rate: 7.4 }, { upto: Infinity, rate: 9.1 }], demandRate: 0, dutyPercent: 9, fuelRate: .55, subsidy: 0, peakRate: .9, offPeakCredit: .25, sourceNote: "Synthetic commercial schedule" },
  { id: "industrial-standard", name: "Industrial Time-of-Day", region: "Gujarat", discom: "DemoGrid West", category: "Industrial facility", start: "2025-04-01", end: "2026-03-31", currency: "INR", fixedMonthly: 1800, slabs: [{ upto: Infinity, rate: 6.2 }], demandRate: 380, dutyPercent: 5, fuelRate: .62, subsidy: 0, peakRate: 1.8, offPeakCredit: .45, sourceNote: "Synthetic industrial schedule; demand charge per contracted kW" },
];

export function demoMonthly(profile: EnergyProfile): BillRecord[] {
  const base = profile.id === "home" ? 290 : profile.id === "shop" ? 3900 : 98000;
  const tariff = tariffs.find(item => item.category === profile.consumerType)!;
  return Array.from({ length: 12 }, (_, index) => {
    const month = index + 1;
    const season = 1 + .16 * Math.sin((month - 2) / 12 * Math.PI * 2);
    const cycle = 1 + ((month * 7) % 9) / 100;
    const kwh = Math.round(base * season * cycle);
    const demand = profile.id === "home" ? undefined : Math.round((profile.id === "shop" ? 10 : 365) * season);
    const breakdown = calculateBill(tariff, kwh, demand, profile.powerFactor, profile.id === "home" ? 0 : kwh * .18, profile.id === "home" ? 0 : kwh * .12);
    return { id: `${profile.id}-2025-${month}`, period: `2025-${String(month).padStart(2, "0")}`, profileId: profile.id, kwh, maxDemandKW: demand, powerFactor: profile.powerFactor, total: breakdown.total, tariffId: tariff.id, source: "Synthetic demo", fixed: breakdown.fixed, energy: breakdown.energy, demand: breakdown.demand, duty: breakdown.duty, surcharge: breakdown.surcharge, subsidy: breakdown.subsidy };
  });
}
export function demoIntervals(profile: EnergyProfile): IntervalReading[] {
  const averageDay = (profile.id === "home" ? 9.3 : profile.id === "shop" ? 130 : 3267) / 24;
  return Array.from({ length: 7 * 24 }, (_, index) => {
    const day = Math.floor(index / 24) + 1, hour = index % 24;
    const morning = hour >= 6 && hour <= 9 ? 1.4 : 1;
    const evening = hour >= 17 && hour <= 21 ? profile.id === "home" ? 2.4 : 1.8 : 1;
    const weekend = day > 5 ? profile.id === "factory" ? .48 : .75 : 1;
    const kwh = averageDay * (.5 + ((hour * 13 + day * 7) % 11) / 18) * morning * evening * weekend;
    return { day, hour, kwh, demandKW: kwh * 1.25, period: hour >= 18 && hour < 22 ? "Peak" : hour >= 0 && hour < 6 ? "Off-peak" : "Day" };
  });
}
export function calculateBill(plan: TariffPlan, kwh: number, maxDemandKW = 0, powerFactor?: number, peakKwh = 0, offPeakKwh = 0) {
  let left = Math.max(0, kwh), previous = 0, energy = 0;
  for (const slab of plan.slabs) { const amount = Math.max(0, Math.min(left, slab.upto - previous)); energy += amount * slab.rate; left -= amount; previous = slab.upto; if (left <= 0) break; }
  const peak = peakKwh * (plan.peakRate || 0);
  const offPeak = -offPeakKwh * (plan.offPeakCredit || 0);
  const demand = maxDemandKW * plan.demandRate;
  const fixed = plan.fixedMonthly;
  const fuel = kwh * plan.fuelRate;
  const pfAdjustment = powerFactor !== undefined && powerFactor < .9 ? (energy + demand) * .05 : 0;
  const beforeTax = fixed + energy + peak + offPeak + demand + fuel + pfAdjustment - plan.subsidy;
  const duty = Math.max(0, beforeTax) * plan.dutyPercent / 100;
  return { fixed, energy, peak, offPeak, demand, fuel, pfAdjustment, subsidy: plan.subsidy, duty, total: Math.max(0, beforeTax + duty) };
}
export function tariffForProfile(profile: EnergyProfile, planId?: string) { return tariffs.find(plan => plan.id === planId) || tariffs.find(plan => plan.category === profile.consumerType && plan.region === profile.region) || tariffs.find(plan => plan.category === profile.consumerType)!; }
export function formatRupees(value: number) { return `₹${Math.round(value).toLocaleString("en-IN")}`; }
export function readManagerStorage<T>(key: string, fallback: T): T { try { const value = localStorage.getItem(`ep-manager:${key}`); return value ? JSON.parse(value, (_key, item) => item === "__energy_infinity__" ? Infinity : item) as T : fallback; } catch { return fallback; } }
export function writeManagerStorage<T>(key: string, value: T) { localStorage.setItem(`ep-manager:${key}`, JSON.stringify(value, (_key, item) => item === Infinity ? "__energy_infinity__" : item)); }
export function downloadManagerCsv(name: string, rows: (string | number)[][]) { const text = rows.map(row => row.map(value => `"${String(value).replaceAll('"', '""')}"`).join(",")).join("\n"); const link = document.createElement("a"); link.href = URL.createObjectURL(new Blob([text], { type: "text/csv" })); link.download = name; link.click(); URL.revokeObjectURL(link.href); }
export function carbonKg(kwh: number, factor = .72) { return kwh * factor; }
export const demoEmissionFactor = { value: .72, unit: "kg CO₂ / kWh", status: "Synthetic demo factor" };
export const EM_DISCLAIMER = "Demo data — synthetic, not an official bill, tariff, or energy forecast.";
