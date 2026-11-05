import { Activity, ArrowUpRight, Building2, Factory, Landmark, Zap } from "lucide-react";
import { Link } from "react-router-dom";
import "../styles/energy-manager.css";

export default function ProductPicker() {
  return <main className="product-home">
    <header className="product-header"><Link to="/" className="product-brand"><span><Zap size={18}/></span> EnergyPilot</Link><span className="product-status"><i/> Two independent workspaces</span></header>
    <section className="product-intro"><span className="product-eyebrow">ENERGY INTELLIGENCE, FOR DIFFERENT NEEDS</span><h1>Choose your EnergyPilot workspace</h1><p>One platform, two separate applications. Choose the tools and data that fit your work.</p></section>
    <section className="product-cards">
      <Link to="/government" className="product-card government-card"><div className="product-card-icon"><Landmark size={23}/></div><span className="product-card-kicker">PUBLIC SYSTEM PLANNING</span><h2>Government Electricity Intelligence</h2><p>Understand the electricity system across India, regions, and states. Explore supply, demand, forecasts, and policy scenarios.</p><ul><li><Activity size={15}/> National, regional &amp; state views</li><li><Activity size={15}/> Supply, demand &amp; planning tools</li></ul><span className="product-open">Open Government Dashboard <ArrowUpRight size={16}/></span><small>Policy-makers · system planners · synthetic demo data</small></Link>
      <Link to="/energy-manager" className="product-card manager-card"><div className="product-card-icon"><Building2 size={23}/></div><span className="product-card-kicker">YOUR ENERGY, MADE CLEAR</span><h2>Energy Manager</h2><p>Explore household, business, and industrial electricity use, bills, tariffs, peaks, and potential savings.</p><ul><li><Factory size={15}/> Household &amp; facility profiles</li><li><Zap size={15}/> Consumption, bills &amp; tariff tools</li></ul><span className="product-open">Open Energy Manager <ArrowUpRight size={16}/></span><small>Consumers · businesses · synthetic demo data</small></Link>
    </section>
    <footer className="product-footer">Workspaces are separate. Consumer profile data is stored independently from the government dashboard.</footer>
  </main>;
}
