import React, { useState } from "react";
import { NavLink } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";
import { useTheme } from "@/context/ThemeContext";
import { useLanguage } from "@/context/LanguageContext";
import {
  LogOut, UserCircle2, ShieldCheck, Building2, Sun, Moon,
  Menu, X, Clock, Receipt, BarChart3, Settings, Fuel,
  LayoutDashboard, Users,
} from "lucide-react";

export const Navbar: React.FC = () => {
  const { user, logout } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const { language, setLanguage, t } = useLanguage();
  const [mobileOpen, setMobileOpen] = useState(false);

  const isAdmin = user?.role === "super_admin";

  // Same nav items as Sidebar
  const adminNavItems = [
    { to: "/", label: t("nav.system_panel"), icon: LayoutDashboard },
    { to: "/shifts", label: t("nav.shift"), icon: Clock },
    { to: "/stations", label: t("nav.station"), icon: Building2 },
    { to: "/users", label: t("nav.users"), icon: Users },
    { to: "/settings", label: t("nav.settings"), icon: Settings },
  ];
  const managerNavItems = [
    { to: "/", label: t("nav.shift"), icon: Clock },
    { to: "/shifts", label: t("shifts.title"), icon: Clock },
    { to: "/stations", label: t("nav.station"), icon: Building2 },
    { to: "/transactions", label: t("nav.transactions"), icon: Receipt },
    { to: "/reports", label: t("nav.reports"), icon: BarChart3 },
    { to: "/settings", label: t("nav.settings"), icon: Settings },
  ];
  const navItems = isAdmin ? adminNavItems : managerNavItems;

  const getRoleBadge = (role?: string) => {
    switch (role) {
      case "super_admin":
        return <span className="bg-red-500/20 text-red-600 dark:text-red-400 border border-red-500/30 px-2 py-0.5 rounded text-xs font-semibold flex items-center gap-1"><ShieldCheck size={12} /> {t("role.super_admin")}</span>;
      case "station_manager":
        return <span className="bg-blue-500/20 text-blue-600 dark:text-blue-400 border border-blue-500/30 px-2 py-0.5 rounded text-xs font-semibold flex items-center gap-1"><Building2 size={12} /> {t("role.station_manager")}</span>;
      case "cashier":
        return <span className="bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30 px-2 py-0.5 rounded text-xs font-semibold flex items-center gap-1"><UserCircle2 size={12} /> {t("role.cashier")}</span>;
      default:
        return null;
    }
  };

  return (
    <>
      <header className="h-16 px-4 sm:px-6 md:px-8 flex items-center justify-between sticky top-0 z-30 bg-[#f4f7fe]/80 dark:bg-[#090a0f]/80 backdrop-blur-md border-b border-transparent dark:border-zinc-800/60 transition-colors duration-200">
        <div className="flex items-center gap-3">
          {/* Hamburger button — only visible on mobile */}
          <button
            className="md:hidden p-2 rounded-xl text-slate-600 dark:text-zinc-400 hover:bg-white/10 dark:hover:bg-white/5 transition"
            onClick={() => setMobileOpen(true)}
            aria-label="Menüyü Aç"
          >
            <Menu size={22} />
          </button>

          <div className="md:hidden flex items-center gap-2">
            <div className="w-8 h-8 rounded-xl bg-blue-600 flex items-center justify-center text-white font-black shadow-md">
              <Fuel size={16} className="stroke-[2.5]" />
            </div>
            <span className="font-extrabold text-base text-slate-800 dark:text-white">FuelOS</span>
          </div>
        </div>

        <div className="flex items-center gap-2.5 sm:gap-3.5">
          {/* Language Switcher */}
          <div className="flex items-center bg-white dark:bg-[#121217] border border-slate-200/80 dark:border-zinc-800 rounded-2xl p-1 shadow-sm">
            <button
              onClick={() => setLanguage("tr")}
              className={`px-2.5 py-1 rounded-xl text-xs font-black transition-all ${
                language === "tr"
                  ? "bg-blue-600 text-white shadow-sm"
                  : "text-slate-500 hover:text-slate-900 dark:hover:text-white"
              }`}
              title="Türkçe"
            >
              TR
            </button>
            <button
              onClick={() => setLanguage("en")}
              className={`px-2.5 py-1 rounded-xl text-xs font-black transition-all ${
                language === "en"
                  ? "bg-blue-600 text-white shadow-sm"
                  : "text-slate-500 hover:text-slate-900 dark:hover:text-white"
              }`}
              title="English"
            >
              EN
            </button>
          </div>

          {/* Dark / Light Mode Toggle */}
          <button
            onClick={toggleTheme}
            className="p-2 sm:px-3 sm:py-2 rounded-2xl flex items-center gap-2 text-xs font-bold bg-white dark:bg-[#121217] border border-slate-200/80 dark:border-zinc-800 text-slate-700 dark:text-amber-400 hover:shadow-md transition active:scale-95 shadow-sm"
            title={theme === "dark" ? "Açık Moda Geç" : "Koyu Moda Geç"}
          >
            {theme === "dark" ? (
              <>
                <Sun size={16} className="text-amber-400 fill-amber-400/20" />
                <span className="hidden sm:inline">Light</span>
              </>
            ) : (
              <>
                <Moon size={16} className="text-slate-600 fill-slate-200" />
                <span className="hidden sm:inline">Dark</span>
              </>
            )}
          </button>

          {user && (
            <div className="flex items-center gap-3">
              <div className="text-right hidden sm:block">
                <div className="text-xs font-bold text-slate-700 dark:text-zinc-200">{user.full_name}</div>
                <div className="text-[11px] text-slate-500 dark:text-zinc-400">{user.email}</div>
              </div>
              {getRoleBadge(user.role)}
              <button
                onClick={logout}
                className="p-2 rounded-xl text-slate-500 dark:text-zinc-400 hover:text-rose-600 dark:hover:text-rose-400 hover:bg-white dark:hover:bg-[#181820] transition shadow-sm border border-slate-200/60 dark:border-zinc-800"
                title={t("common.logout")}
              >
                <LogOut size={16} />
              </button>
            </div>
          )}
        </div>
      </header>

      {/* ── Mobile Drawer Overlay ── */}
      {mobileOpen && (
        <div className="fixed inset-0 z-50 md:hidden" role="dialog" aria-modal="true">
          {/* Backdrop */}
          <div
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            onClick={() => setMobileOpen(false)}
          />

          {/* Drawer Panel */}
          <aside className="absolute left-0 top-0 bottom-0 w-72 bg-[#0d0e12] text-white p-5 flex flex-col justify-between shadow-2xl border-r border-zinc-800/80">
            {/* Header */}
            <div>
              <div className="flex items-center justify-between mb-6">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-2xl bg-gradient-to-tr from-blue-600 to-cyan-500 flex items-center justify-center text-white font-black shadow-lg shadow-blue-500/30">
                    <Fuel size={20} className="stroke-[2.5]" />
                  </div>
                  <div className="font-black text-xl tracking-tight text-white">
                    Fuel<span className="text-blue-400">OS</span>
                  </div>
                </div>
                <button
                  onClick={() => setMobileOpen(false)}
                  className="p-2 rounded-xl text-zinc-400 hover:text-white hover:bg-white/10 transition"
                >
                  <X size={20} />
                </button>
              </div>

              {/* User Info */}
              {user && (
                <div className="mb-4 px-3 py-3 rounded-2xl bg-white/5 border border-white/8">
                  <div className="text-sm font-bold text-white">{user.full_name}</div>
                  <div className="text-xs text-zinc-400 mt-0.5">{user.email}</div>
                  <div className="mt-2">{getRoleBadge(user.role)}</div>
                </div>
              )}

              {/* Nav Links */}
              <div className="space-y-1.5">
                {navItems.map((item) => {
                  const Icon = item.icon;
                  return (
                    <NavLink
                      key={item.to + item.label}
                      to={item.to}
                      end={item.to === "/"}
                      onClick={() => setMobileOpen(false)}
                      className={({ isActive }) =>
                        `flex items-center gap-3.5 px-4 py-3 rounded-2xl text-xs font-bold transition-all duration-200 ${
                          isActive
                            ? "bg-blue-600 text-white shadow-lg shadow-blue-600/35 font-extrabold"
                            : "text-zinc-400 hover:text-white hover:bg-white/5"
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

            {/* Footer */}
            <div className="p-4 bg-gradient-to-br from-zinc-900/80 to-zinc-950/80 rounded-2xl border border-zinc-800/80">
              <div className="flex items-center gap-2 text-white text-xs font-bold mb-1">
                <div className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-pulse shadow-sm shadow-emerald-400/50" />
                <span>FuelOS Core</span>
              </div>
              <button
                onClick={() => { logout(); setMobileOpen(false); }}
                className="mt-2 w-full flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-bold text-rose-400 hover:bg-rose-500/10 transition"
              >
                <LogOut size={14} />
                <span>{t("common.logout")}</span>
              </button>
            </div>
          </aside>
        </div>
      )}
    </>
  );
};
