import React from "react";
import { NavLink } from "react-router-dom";
import { LayoutDashboard, Clock, Receipt, Building2, Users } from "lucide-react";

export const Sidebar: React.FC = () => {
  const navItems = [
    { to: "/", label: "Dashboard", icon: LayoutDashboard },
    { to: "/shifts", label: "Vardiyalar", icon: Clock },
    { to: "/transactions", label: "Satış & İşlemler", icon: Receipt },
    { to: "/stations", label: "İstasyonlar", icon: Building2 },
    { to: "/users", label: "Personel Yönetimi", icon: Users },
  ];

  return (
    <aside className="w-64 my-4 ml-4 rounded-3xl bg-gradient-to-br from-[#1e293b] via-[#0f172a] to-[#020617] text-white p-4 flex flex-col justify-between shrink-0 hidden md:flex shadow-2xl shadow-slate-950/20 border border-slate-800/80">
      <div>
        {/* Brand Header inside Sidebar */}
        <div className="flex items-center gap-3 px-3 py-4 mb-4 border-b border-slate-800/80">
          <div className="w-10 h-10 rounded-2xl bg-gradient-to-tr from-amber-500 to-orange-500 flex items-center justify-center text-slate-950 font-black shadow-lg shadow-amber-500/30">
            <span className="text-lg tracking-tight">F</span>
          </div>
          <div>
            <div className="font-extrabold text-base tracking-tight text-white flex items-center gap-1.5">
              <span>FUELOS</span>
              <span className="text-[10px] bg-amber-500/20 text-amber-400 font-bold px-1.5 py-0.5 rounded-md border border-amber-500/30">V1</span>
            </div>
            <div className="text-[11px] text-slate-400 font-medium">Akaryakıt Otomasyonu</div>
          </div>
        </div>

        <div className="space-y-1.5">
          <div className="text-[11px] font-bold text-slate-400 uppercase tracking-widest px-3 mb-2">
            OPERASYON
          </div>
          {navItems.map((item) => {
            const Icon = item.icon;
            return (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.to === "/"}
                className={({ isActive }) =>
                  `flex items-center gap-3.5 px-3.5 py-3 rounded-2xl text-xs font-bold transition-all duration-200 ${
                    isActive
                      ? "bg-gradient-to-r from-amber-500 to-orange-500 text-slate-950 shadow-lg shadow-amber-500/30 translate-x-1"
                      : "text-slate-300 hover:text-white hover:bg-white/10"
                  }`
                }
              >
                <Icon size={18} className="shrink-0" />
                <span>{item.label}</span>
              </NavLink>
            );
          })}
        </div>
      </div>

      {/* Material Pro Banner Footer */}
      <div className="p-4 bg-gradient-to-br from-white/10 to-white/5 rounded-2xl border border-white/10 shadow-lg space-y-2.5 backdrop-blur-md">
        <div className="text-white font-bold text-xs flex items-center gap-2">
          <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-pulse shadow-sm shadow-emerald-400/50"></span>
          FuelOS V1.0 Motoru
        </div>
        <div className="text-[11px] text-slate-300 leading-relaxed font-normal">
          PostgreSQL 16 & FastAPI asenkron veri omurgası aktif.
        </div>
      </div>
    </aside>
  );
};
