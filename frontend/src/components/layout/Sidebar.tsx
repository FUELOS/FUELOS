import React from "react";
import { NavLink } from "react-router-dom";
import { Clock, Receipt, BarChart3, Building2, Settings, Fuel } from "lucide-react";
import { useLanguage } from "@/context/LanguageContext";

export const Sidebar: React.FC = () => {
  const { t } = useLanguage();

  const navItems = [
    { to: "/", label: t("nav.shift"), icon: Clock },
    { to: "/transactions", label: t("nav.transactions"), icon: Receipt },
    { to: "/reports", label: t("nav.reports"), icon: BarChart3 },
    { to: "/stations", label: t("nav.station"), icon: Building2 },
    { to: "/settings", label: t("nav.settings"), icon: Settings },
  ];

  return (
    <aside className="w-64 my-4 ml-4 rounded-3xl bg-[#0b1329] text-white p-4 flex flex-col justify-between shrink-0 hidden md:flex shadow-2xl shadow-slate-950/30 border border-slate-800/80">
      <div>
        {/* Brand Header matching Görsel 2 (FuelOS in blue/white) */}
        <div className="flex items-center gap-3 px-3 py-4 mb-4 border-b border-slate-800/80">
          <div className="w-10 h-10 rounded-2xl bg-gradient-to-tr from-blue-600 to-cyan-500 flex items-center justify-center text-white font-black shadow-lg shadow-blue-500/30">
            <Fuel size={22} className="stroke-[2.5]" />
          </div>
          <div>
            <div className="font-black text-xl tracking-tight text-white flex items-center">
              <span>Fuel</span>
              <span className="text-blue-500">OS</span>
            </div>
            <div className="text-[11px] text-slate-400 font-medium tracking-tight">Akıllı Mutabakat</div>
          </div>
        </div>

        {/* Navigation Items (Görsel 2: Active item is vibrant blue pill) */}
        <div className="space-y-1.5">
          {navItems.map((item) => {
            const Icon = item.icon;
            return (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.to === "/"}
                className={({ isActive }) =>
                  `flex items-center gap-3.5 px-4 py-3 rounded-2xl text-xs font-bold transition-all duration-200 ${
                    isActive
                      ? "bg-blue-600 text-white shadow-lg shadow-blue-600/35 font-extrabold translate-x-1"
                      : "text-slate-400 hover:text-white hover:bg-white/5"
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

      {/* Footer Branding Box */}
      <div className="p-4 bg-gradient-to-br from-white/10 to-white/5 rounded-2xl border border-white/10 shadow-lg space-y-2 backdrop-blur-md">
        <div className="flex items-center gap-2 text-white text-xs font-bold">
          <div className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-pulse shadow-sm shadow-emerald-400/50" />
          <span>FuelOS Core</span>
        </div>
        <div className="text-[11px] text-slate-400 leading-relaxed">
          {t("nav.tagline")}
        </div>
      </div>
    </aside>
  );
};
