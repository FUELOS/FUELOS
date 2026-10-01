import React from "react";
import { useAuth } from "@/context/AuthContext";
import { useLanguage } from "@/context/LanguageContext";
import { useTheme } from "@/context/ThemeContext";
import { Settings, Globe, Moon, Sun, User } from "lucide-react";

export const SettingsPage: React.FC = () => {
  const { user } = useAuth();
  const { language, setLanguage, t } = useLanguage();
  const { theme, toggleTheme } = useTheme();

  return (
    <div className="space-y-6 max-w-4xl">
      <div className="bg-white dark:bg-[#0f172a] rounded-3xl p-6 shadow-sm border border-slate-100 dark:border-slate-800 flex items-center gap-3">
        <div className="w-10 h-10 rounded-2xl bg-blue-600 text-white flex items-center justify-center shadow-md shadow-blue-600/30">
          <Settings size={20} />
        </div>
        <div>
          <h1 className="text-2xl font-black text-slate-900 dark:text-white">{t("nav.settings")}</h1>
          <p className="text-xs text-slate-500 dark:text-slate-400">FuelOS sistem ve kullanıcı tercihleri</p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        {/* Kullanıcı Profili */}
        <div className="bg-white dark:bg-[#0f172a] rounded-3xl p-6 shadow-sm border border-slate-100 dark:border-slate-800 space-y-4">
          <div className="flex items-center gap-2 font-bold text-sm text-slate-900 dark:text-white border-b border-slate-100 dark:border-slate-800 pb-3">
            <User size={16} className="text-blue-600" />
            <span>Kullanıcı Bilgileri</span>
          </div>
          <div className="space-y-2 text-xs">
            <div className="flex justify-between py-1 border-b border-slate-100 dark:border-slate-800/60">
              <span className="text-slate-400">Ad Soyad</span>
              <span className="font-bold text-slate-800 dark:text-white">{user?.full_name}</span>
            </div>
            <div className="flex justify-between py-1 border-b border-slate-100 dark:border-slate-800/60">
              <span className="text-slate-400">E-posta</span>
              <span className="font-mono text-slate-700 dark:text-slate-300">{user?.email}</span>
            </div>
            <div className="flex justify-between py-1">
              <span className="text-slate-400">Yetki Rolü</span>
              <span className="font-bold text-blue-600 uppercase">{user?.role}</span>
            </div>
          </div>
        </div>

        {/* Dil ve Tema Seçenekleri */}
        <div className="bg-white dark:bg-[#0f172a] rounded-3xl p-6 shadow-sm border border-slate-100 dark:border-slate-800 space-y-4">
          <div className="flex items-center gap-2 font-bold text-sm text-slate-900 dark:text-white border-b border-slate-100 dark:border-slate-800 pb-3">
            <Globe size={16} className="text-blue-600" />
            <span>Görünüm ve Dil</span>
          </div>
          <div className="space-y-3 text-xs">
            <div className="flex items-center justify-between">
              <span className="text-slate-600 dark:text-slate-400">Sistem Dili (Language)</span>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setLanguage("tr")}
                  className={`px-3 py-1 rounded-xl font-bold transition ${
                    language === "tr" ? "bg-blue-600 text-white" : "bg-slate-100 dark:bg-slate-800 text-slate-600"
                  }`}
                >
                  Türkçe (TR)
                </button>
                <button
                  onClick={() => setLanguage("en")}
                  className={`px-3 py-1 rounded-xl font-bold transition ${
                    language === "en" ? "bg-blue-600 text-white" : "bg-slate-100 dark:bg-slate-800 text-slate-600"
                  }`}
                >
                  English (EN)
                </button>
              </div>
            </div>

            <div className="flex items-center justify-between pt-2">
              <span className="text-slate-600 dark:text-slate-400">Tema Modu</span>
              <button
                onClick={toggleTheme}
                className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-800 dark:text-white font-bold"
              >
                {theme === "dark" ? <Sun size={14} className="text-amber-400" /> : <Moon size={14} />}
                <span>{theme === "dark" ? "Koyu Mod Aktif" : "Açık Mod Aktif"}</span>
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
