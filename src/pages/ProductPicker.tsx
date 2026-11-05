import { Activity, ArrowUpRight, Landmark } from "lucide-react";
import { Link } from "react-router-dom";
import "../styles/energy-manager.css";

export default function ProductPicker() {
  return <main className="product-home">
    <header className="product-header"><Link to="/" className="product-brand"><span><Landmark size={18}/></span> EnergyPilot</Link><span className="product-status"><i/> Government workspace</span></header>
    <section className="product-intro"><span className="product-eyebrow">PUBLIC SYSTEM PLANNING</span><h1>Government Electricity Intelligence</h1><p>Understand the electricity system across India, regions, and states. Explore supply, demand, forecasts, and policy scenarios.</p></section>
    <section className="product-cards">
      <Link to="/government" className="product-card government-card"><div className="product-card-icon"><Landmark size={23}/></div><span className="product-card-kicker">PUBLIC SYSTEM PLANNING</span><h2>Government Electricity Intelligence</h2><p>Explore national, regional, and state views of electricity supply, demand, planning, and policy scenarios.</p><ul><li><Activity size={15}/> National, regional &amp; state views</li><li><Activity size={15}/> Supply, demand &amp; planning tools</li></ul><span className="product-open">Open Government Dashboard <ArrowUpRight size={16}/></span><small>Policy-makers · system planners · synthetic demo data</small></Link>
    </section>
    <footer className="product-footer">The Energy Manager workspace is temporarily hidden. Its files and data remain preserved for a future restore.</footer>
  </main>;
}
/**
 * Restore reference: Energy Manager remains in src/pages/EnergyManager.tsx and
 * src/components/EnergyOnboarding.tsx; route /energy-manager remains in src/App.tsx.
 * Restore its workspace card here when requested.
 */
export const energyManagerRestoreReference = "Preserved at /energy-manager; hidden from the workspace picker.";
