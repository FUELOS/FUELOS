import React from "react";
import { useAuth } from "@/context/AuthContext";
import { useTheme } from "@/context/ThemeContext";
import { LogOut, UserCircle2, ShieldCheck, Building2, Sun, Moon } from "lucide-react";

export const Navbar: React.FC = () => {
  const { user, logout } = useAuth();
  const { theme, toggleTheme } = useTheme();

  const getRoleBadge = (role?: string) => {
    switch (role) {
      case "super_admin":
        return <span className="bg-red-500/20 text-red-400 border border-red-500/30 px-2 py-0.5 rounded text-xs font-semibold flex items-center gap-1"><ShieldCheck size={12} /> SuperAdmin</span>;
      case "station_manager":
        return <span className="bg-amber-500/20 text-amber-400 border border-amber-500/30 px-2 py-0.5 rounded text-xs font-semibold flex items-center gap-1"><Building2 size={12} /> İstasyon Müdürü</span>;
      case "cashier":
        return <span className="bg-blue-500/20 text-blue-400 border border-blue-500/30 px-2 py-0.5 rounded text-xs font-semibold flex items-center gap-1"><UserCircle2 size={12} /> Kasiyer</span>;
      default:
        return null;
    }
  };

  return (
    <header className="h-16 px-4 sm:px-6 md:px-8 flex items-center justify-between sticky top-0 z-30 bg-[#f0f2f5]/80 dark:bg-slate-950/80 backdrop-blur-md transition-colors duration-200">
      <div className="flex items-center gap-3">
        <div className="md:hidden flex items-center gap-2">
          <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-amber-500 to-orange-500 flex items-center justify-center text-slate-950 font-black shadow-md">
            <span>F</span>
          </div>
          <span className="font-extrabold text-base text-slate-800 dark:text-white">FuelOS</span>
        </div>
      </div>

      <div className="flex items-center gap-3 sm:gap-4">
        {/* Dark / Light Mode Toggle Button */}
        <button
          onClick={toggleTheme}
          className="p-2 sm:px-3 sm:py-2 rounded-2xl flex items-center gap-2 text-xs font-bold bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 text-slate-700 dark:text-amber-400 hover:shadow-md transition active:scale-95 shadow-sm"
          title={theme === "dark" ? "Açık Moda Geç" : "Koyu Moda Geç"}
        >
          {theme === "dark" ? (
            <>
              <Sun size={16} className="text-amber-400 fill-amber-400/20" />
              <span className="hidden sm:inline">Açık Mod</span>
            </>
          ) : (
            <>
              <Moon size={16} className="text-slate-600 fill-slate-200" />
              <span className="hidden sm:inline">Koyu Mod</span>
            </>
          )}
        </button>

        {user && (
          <div className="flex items-center gap-3">
            <div className="text-right hidden sm:block">
              <div className="text-xs font-bold text-slate-700 dark:text-slate-200">{user.full_name}</div>
              <div className="text-[11px] text-slate-500 dark:text-slate-400">{user.email}</div>
            </div>
            {getRoleBadge(user.role)}
            <button
              onClick={logout}
              className="p-2 rounded-xl text-slate-500 dark:text-slate-400 hover:text-rose-600 dark:hover:text-rose-400 hover:bg-white dark:hover:bg-slate-900 transition shadow-sm border border-slate-200/60 dark:border-slate-800"
              title="Çıkış Yap"
            >
              <LogOut size={16} />
            </button>
          </div>
        )}
      </div>
    </header>
  );
};
