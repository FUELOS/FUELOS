/**
 * FuelOS — Sistem ve Kullanıcı Ayarları Sayfası
 * - Kullanıcı Profil Bilgileri
 * - Görünüm ve Sistem Dili (TR/EN, Dark/Light)
 * - Kasa Mutabakat Tolerans Ayarları (Uğur Erdoğan Özelliği - DEC-001 / K-001)
 */

import React, { useState, useEffect } from "react";
import { useAuth } from "@/context/AuthContext";
import { useLanguage } from "@/context/LanguageContext";
import { useTheme } from "@/context/ThemeContext";
import { apiClient } from "@/lib/api";
import {
  Settings,
  Globe,
  Moon,
  Sun,
  User,
  Scale,
  CheckCircle2,
  AlertCircle,
  Loader2,
  Save,
  HelpCircle,
} from "lucide-react";

export const SettingsPage: React.FC = () => {
  const { user } = useAuth();
  const { language, setLanguage, t } = useLanguage();
  const { theme, toggleTheme } = useTheme();

  // Tolerans ayarı state'leri
  const [tolerance, setTolerance] = useState<string>("1.00");
  const [loadingTolerance, setLoadingTolerance] = useState<boolean>(true);
  const [savingTolerance, setSavingTolerance] = useState<boolean>(false);
  const [toleranceSuccess, setToleranceSuccess] = useState<boolean>(false);
  const [toleranceError, setToleranceError] = useState<string | null>(null);

  // Tolerans bilgisini getir
  useEffect(() => {
    const fetchTolerance = async () => {
      try {
        setLoadingTolerance(true);
        const res = await apiClient.get<{ tolerance: number; company_name: string }>("/settings/tolerance");
        setTolerance(parseFloat(String(res.data.tolerance)).toFixed(2));
      } catch (err: any) {
        console.error("Tolerans ayarı alınamadı", err);
      } finally {
        setLoadingTolerance(false);
      }
    };

    fetchTolerance();
  }, []);

  // Toleransı kaydet
  const handleSaveTolerance = async (valueToSave?: string) => {
    const targetVal = valueToSave !== undefined ? valueToSave : tolerance;
    const parsed = parseFloat(targetVal);
    if (isNaN(parsed) || parsed < 0) {
      setToleranceError("Lütfen geçerli ve 0 veya daha büyük bir tolerans tutarı girin.");
      return;
    }

    try {
      setSavingTolerance(true);
      setToleranceError(null);
      setToleranceSuccess(false);

      const res = await apiClient.put<{ tolerance: number }>("/settings/tolerance", {
        tolerance: parsed,
      });

      setTolerance(parseFloat(String(res.data.tolerance)).toFixed(2));
      setToleranceSuccess(true);
      setTimeout(() => setToleranceSuccess(false), 3000);
    } catch (err: any) {
      setToleranceError(err.response?.data?.detail || "Tolerans güncellenirken bir hata oluştu.");
    } finally {
      setSavingTolerance(false);
    }
  };

  const isManagerOrAdmin = user?.role === "super_admin" || user?.role === "station_manager";

  return (
    <div className="space-y-6 max-w-5xl">
      {/* ── BAŞLIK ── */}
      <div className="bg-white dark:bg-[#0f172a] rounded-3xl p-6 shadow-sm border border-slate-100 dark:border-slate-800 flex items-center justify-between gap-4">
        <div className="flex items-center gap-3.5">
          <div className="w-12 h-12 rounded-2xl bg-blue-600 text-white flex items-center justify-center shadow-lg shadow-blue-600/30 shrink-0">
            <Settings size={22} />
          </div>
          <div>
            <h1 className="text-xl sm:text-2xl font-black text-slate-900 dark:text-white">{t("nav.settings")}</h1>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              FuelOS operasyonel parametreler, kasa toleransı ve kullanıcı tercihleri
            </p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* ── 1. KULLANICI PROFİLİ ── */}
        <div className="bg-white dark:bg-[#0f172a] rounded-3xl p-6 shadow-sm border border-slate-100 dark:border-slate-800 space-y-4">
          <div className="flex items-center gap-2.5 font-black text-sm text-slate-900 dark:text-white border-b border-slate-100 dark:border-slate-800 pb-3">
            <User size={17} className="text-blue-600" />
            <span>Kullanıcı ve Oturum Bilgileri</span>
          </div>
          <div className="space-y-2.5 text-xs">
            <div className="flex justify-between py-1.5 border-b border-slate-100 dark:border-slate-800/60">
              <span className="text-slate-400 font-medium">Ad Soyad</span>
              <span className="font-bold text-slate-800 dark:text-white">{user?.full_name}</span>
            </div>
            <div className="flex justify-between py-1.5 border-b border-slate-100 dark:border-slate-800/60">
              <span className="text-slate-400 font-medium">E-posta</span>
              <span className="font-mono font-bold text-slate-700 dark:text-slate-300">{user?.email}</span>
            </div>
            <div className="flex justify-between py-1.5 border-b border-slate-100 dark:border-slate-800/60">
              <span className="text-slate-400 font-medium">Yetki Rolü</span>
              <span className="font-extrabold text-blue-600 bg-blue-50 dark:bg-blue-900/30 px-2 py-0.5 rounded-lg border border-blue-200 dark:border-blue-800/40 uppercase">
                {user?.role === "super_admin" ? "Süper Yönetici" : user?.role === "station_manager" ? "İstasyon Müdürü" : "Kasiyer"}
              </span>
            </div>
          </div>
        </div>

        {/* ── 2. DİL VE GÖRÜNÜM SEÇENEKLERİ ── */}
        <div className="bg-white dark:bg-[#0f172a] rounded-3xl p-6 shadow-sm border border-slate-100 dark:border-slate-800 space-y-4">
          <div className="flex items-center gap-2.5 font-black text-sm text-slate-900 dark:text-white border-b border-slate-100 dark:border-slate-800 pb-3">
            <Globe size={17} className="text-blue-600" />
            <span>Görünüm ve Sistem Dili</span>
          </div>
          <div className="space-y-3.5 text-xs">
            <div className="flex items-center justify-between">
              <div>
                <div className="font-bold text-slate-800 dark:text-white">Arayüz Dili</div>
                <div className="text-[11px] text-slate-400">Türkçe veya İngilizce dil seçimi</div>
              </div>
              <div className="flex items-center gap-1.5 bg-slate-100 dark:bg-slate-800 p-1 rounded-2xl">
                <button
                  onClick={() => setLanguage("tr")}
                  className={`px-3 py-1.5 rounded-xl font-black text-xs transition ${
                    language === "tr"
                      ? "bg-blue-600 text-white shadow-md shadow-blue-600/30"
                      : "text-slate-600 dark:text-slate-400 hover:text-slate-900"
                  }`}
                >
                  TR 🇹🇷
                </button>
                <button
                  onClick={() => setLanguage("en")}
                  className={`px-3 py-1.5 rounded-xl font-black text-xs transition ${
                    language === "en"
                      ? "bg-blue-600 text-white shadow-md shadow-blue-600/30"
                      : "text-slate-600 dark:text-slate-400 hover:text-slate-900"
                  }`}
                >
                  EN 🇬🇧
                </button>
              </div>
            </div>

            <div className="flex items-center justify-between pt-2 border-t border-slate-100 dark:border-slate-800">
              <div>
                <div className="font-bold text-slate-800 dark:text-white">Tema Modu</div>
                <div className="text-[11px] text-slate-400">Koyu veya aydınlık görünüm</div>
              </div>
              <button
                onClick={toggleTheme}
                className="flex items-center gap-2 px-3.5 py-1.5 rounded-2xl bg-slate-100 dark:bg-slate-800 text-slate-800 dark:text-white font-bold transition hover:bg-slate-200 dark:hover:bg-slate-700"
              >
                {theme === "dark" ? <Sun size={14} className="text-amber-400" /> : <Moon size={14} className="text-blue-600" />}
                <span>{theme === "dark" ? "Koyu Mod" : "Açık Mod"}</span>
              </button>
            </div>
          </div>
        </div>

        {/* ── 3. KASA MUTABAKAT TOLERANSI (UĞUR ERDOĞAN ÖZELLİĞİ) ── */}
        <div className="md:col-span-2 bg-white dark:bg-[#0f172a] rounded-3xl p-6 shadow-sm border border-slate-100 dark:border-slate-800 space-y-4">
          <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 flex items-center justify-center">
                <Scale size={18} />
              </div>
              <div>
                <h3 className="font-black text-sm sm:text-base text-slate-900 dark:text-white">
                  Kasa Mutabakat Tolerans Limiti (DEC-001 / K-001)
                </h3>
                <p className="text-[11px] text-slate-400">
                  Vardiya kapanışında kabul edilebilir kuruş / bozuk para yuvarlama payı
                </p>
              </div>
            </div>

            {toleranceSuccess && (
              <span className="flex items-center gap-1.5 text-xs font-bold text-emerald-600 bg-emerald-50 dark:bg-emerald-950/30 px-3 py-1 rounded-xl border border-emerald-200 dark:border-emerald-800/40 animate-in fade-in">
                <CheckCircle2 size={14} />
                <span>Kaydedildi</span>
              </span>
            )}
          </div>

          {toleranceError && (
            <div className="p-3.5 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800/40 rounded-2xl text-red-600 dark:text-red-400 text-xs flex items-center gap-2">
              <AlertCircle size={15} />
              <span>{toleranceError}</span>
            </div>
          )}

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
            {/* Sol: Ayar Kontrolleri */}
            <div className="lg:col-span-7 space-y-3">
              <div>
                <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-2">
                  Hızlı Tolerans Seçimi
                </label>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  {[
                    { val: "0.00", label: "0 ₺", sub: "Sıfır Tolerans" },
                    { val: "1.00", label: "1.00 ₺", sub: "Varsayılan" },
                    { val: "5.00", label: "5.00 ₺", sub: "Orta Esneklik" },
                    { val: "10.00", label: "10.00 ₺", sub: "Genişletilmiş" },
                  ].map(({ val, label, sub }) => (
                    <button
                      key={val}
                      type="button"
                      disabled={!isManagerOrAdmin || savingTolerance || loadingTolerance}
                      onClick={() => {
                        setTolerance(val);
                        handleSaveTolerance(val);
                      }}
                      className={`p-3 rounded-2xl border text-center transition ${
                        tolerance === val
                          ? "border-emerald-500 bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 font-black shadow-sm"
                          : "border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50 text-slate-600 dark:text-slate-400 hover:border-slate-300"
                      } disabled:opacity-50`}
                    >
                      <div className="text-sm font-black">{label}</div>
                      <div className="text-[10px] text-slate-400 mt-0.5">{sub}</div>
                    </button>
                  ))}
                </div>
              </div>

              {/* Özel Tutar Girişi */}
              <div className="pt-1">
                <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1.5">
                  Özel Tolerans Tutarı (₺)
                </label>
                <div className="flex gap-2">
                  <div className="relative flex-1">
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      max="1000"
                      disabled={!isManagerOrAdmin || savingTolerance || loadingTolerance}
                      value={tolerance}
                      onChange={(e) => setTolerance(e.target.value)}
                      placeholder="1.00"
                      className="w-full bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 rounded-2xl px-4 py-2.5 text-sm text-slate-800 dark:text-slate-200 font-mono font-bold focus:outline-none focus:ring-2 focus:ring-emerald-500 transition pr-8 disabled:opacity-50"
                    />
                    <span className="absolute right-3.5 top-1/2 -translate-y-1/2 font-bold text-slate-400 text-xs">₺</span>
                  </div>

                  {isManagerOrAdmin && (
                    <button
                      type="button"
                      disabled={savingTolerance || loadingTolerance}
                      onClick={() => handleSaveTolerance()}
                      className="px-5 py-2.5 rounded-2xl bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white font-black text-xs flex items-center gap-1.5 shadow-md shadow-emerald-600/30 transition active:scale-95"
                    >
                      {savingTolerance ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
                      <span>Kaydet</span>
                    </button>
                  )}
                </div>
                {!isManagerOrAdmin && (
                  <p className="text-[11px] text-amber-500 mt-1">
                    * Tolerans limiti sadece Şirket Yöneticisi ve İstasyon Müdürü tarafından güncellenebilir.
                  </p>
                )}
              </div>
            </div>

            {/* Sağ: Bilgilendirici İzah Kutusu */}
            <div className="lg:col-span-5 p-4 rounded-2xl bg-slate-50/80 dark:bg-slate-800/40 border border-slate-200/80 dark:border-slate-700/60 space-y-2 text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
              <div className="flex items-center gap-1.5 font-bold text-slate-800 dark:text-slate-200">
                <HelpCircle size={14} className="text-blue-500 shrink-0" />
                <span>Nasıl Çalışır?</span>
              </div>
              <p>
                Akaryakıt istasyonlarında bozuk para (kuruş) bulunamaması nedeniyle gerçekleşen küçük yuvarlama farkları kasayı yapay olarak <strong>"Açık"</strong> veya <strong>"Fazla"</strong> göstermemelidir.
              </p>
              <div className="p-2.5 rounded-xl bg-white dark:bg-[#0b1329] border border-slate-200/60 dark:border-slate-700/40 font-mono text-[11px] text-slate-700 dark:text-slate-300">
                | Kasa Farkı | ≤ {parseFloat(tolerance || "0").toFixed(2)} ₺ &nbsp;➔&nbsp; <span className="text-emerald-600 font-bold">Eşleşti (Matched)</span>
              </div>
              <p className="text-[11px]">
                Fark bu limiti aştığında vardiya otomatikman <strong>Kasa Açığı (Shortage)</strong> veya <strong>Kasa Fazlası (Surplus)</strong> statüsüne geçer.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
