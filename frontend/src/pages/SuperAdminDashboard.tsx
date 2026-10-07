/**
 * FuelOS — SuperAdmin Genel Dashboard
 * Tüm istasyonların kuş bakışı görünümü: aktif vardiyalar, günlük ciro, istasyon sağlık durumu ve SaaS lisanslama.
 */

import React, { useState, useEffect, useCallback } from "react";
import { apiClient } from "@/lib/api";
import { formatCurrency } from "@/lib/utils";
import { useLanguage } from "@/context/LanguageContext";
import {
  Building2,
  TrendingUp,
  Activity,
  Users,
  RefreshCw,
  MapPin,
  CheckCircle2,
  AlertCircle,
  Loader2,
  Zap,
  CreditCard,
  CalendarClock,
  ShieldAlert,
  ShieldCheck,
  X,
  SlidersHorizontal,
  Plus,
} from "lucide-react";

interface StationSummary {
  station_id: string;
  station_name: string;
  station_code: string;
  city: string;
  is_active: boolean;
  active_shift_count: number;
  today_revenue: number;
  today_transaction_count: number;
  worker_count: number;
  subscription_status?: string;
  subscription_plan?: string;
  subscription_expires_at?: string | null;
  monthly_fee?: number;
}

interface AdminDashboardData {
  total_stations: number;
  active_stations: number;
  total_active_shifts: number;
  total_today_revenue: number;
  total_today_transactions: number;
  total_monthly_subscription?: number;
  stations: StationSummary[];
}

export const SuperAdminDashboard: React.FC = () => {
  const { language } = useLanguage();
  const [data, setData] = useState<AdminDashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // SaaS Lisans Yönetim Modal State
  const [selectedStation, setSelectedStation] = useState<StationSummary | null>(null);
  const [subStatus, setSubStatus] = useState<string>("active");
  const [subPlan, setSubPlan] = useState<string>("Pro SaaS");
  const [extendDays, setExtendDays] = useState<number>(30);
  const [modalLoading, setModalLoading] = useState(false);
  const [modalSuccess, setModalSuccess] = useState<string | null>(null);

  const tr = language === "tr";

  const fetch = useCallback(async () => {
    try {
      setRefreshing(true);
      setError(null);
      const res = await apiClient.get<AdminDashboardData>("/admin/dashboard");
      setData(res.data);
    } catch (err: any) {
      setError(err.response?.data?.detail || (tr ? "Veriler alınamadı" : "Failed to load data"));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [tr]);

  useEffect(() => {
    fetch();
  }, [fetch]);

  const handleOpenSubModal = (st: StationSummary) => {
    setSelectedStation(st);
    setSubStatus(st.subscription_status || "active");
    setSubPlan(st.subscription_plan || "Pro SaaS");
    setExtendDays(30);
    setModalSuccess(null);
  };

  const handleSaveSubscription = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedStation) return;
    try {
      setModalLoading(true);
      await apiClient.patch(`/stations/${selectedStation.station_id}/subscription`, {
        subscription_status: subStatus,
        subscription_plan: subPlan,
        extend_days: extendDays > 0 ? extendDays : undefined,
      });
      setModalSuccess(tr ? "Abonelik başarıyla güncellendi!" : "Subscription updated successfully!");
      setTimeout(() => {
        setSelectedStation(null);
        fetch();
      }, 700);
    } catch (err: any) {
      alert(err.response?.data?.detail || "Güncelleme başarısız");
    } finally {
      setModalLoading(false);
    }
  };

  // Yeni İstasyon Ekleme State & Handler
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [newName, setNewName] = useState("");
  const [newCode, setNewCode] = useState("");
  const [newCity, setNewCity] = useState("");
  const [newDistrict, setNewDistrict] = useState("");
  const [newAddress, setNewAddress] = useState("");
  const [newPlan, setNewPlan] = useState("Pro SaaS");
  const [newFee, setNewFee] = useState<number>(4990);
  const [createLoading, setCreateLoading] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  const handleCreateStation = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newName.trim() || !newCode.trim() || !newCity.trim()) {
      setCreateError(tr ? "Lütfen zorunlu alanları (Ad, Kod, Şehir) doldurun." : "Please fill required fields (Name, Code, City).");
      return;
    }
    try {
      setCreateLoading(true);
      setCreateError(null);
      await apiClient.post("/stations", {
        name: newName.trim(),
        code: newCode.trim().toUpperCase(),
        city: newCity.trim(),
        district: newDistrict.trim() || undefined,
        address: newAddress.trim() || undefined,
        subscription_plan: newPlan,
        monthly_fee: Number(newFee),
      });
      setIsCreateModalOpen(false);
      setNewName("");
      setNewCode("");
      setNewCity("");
      setNewDistrict("");
      setNewAddress("");
      fetch();
    } catch (err: any) {
      setCreateError(err.response?.data?.detail || (tr ? "İstasyon eklenemedi" : "Failed to create station"));
    } finally {
      setCreateLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-3 text-slate-500">
        <Loader2 size={36} className="animate-spin text-blue-600" />
        <span className="text-sm font-semibold">{tr ? "Sistem verileri yükleniyor..." : "Loading system data..."}</span>
      </div>
    );
  }

  const metricCards = [
    {
      label: tr ? "Toplam İstasyon" : "Total Stations",
      value: data?.total_stations ?? 0,
      sub: tr ? `${data?.active_stations ?? 0} aktif şube` : `${data?.active_stations ?? 0} active locations`,
      icon: Building2,
      bg: "bg-blue-50/80 dark:bg-[#111218]",
      border: "border-blue-100 dark:border-zinc-800",
      iconBg: "bg-blue-100 dark:bg-blue-900/40",
      iconColor: "text-blue-600 dark:text-blue-400",
      valueColor: "text-blue-700 dark:text-blue-300",
    },
    {
      label: tr ? "Açık Vardiya" : "Active Shifts",
      value: data?.total_active_shifts ?? 0,
      sub: tr ? "Canlı sahada çalışan" : "Currently on forecourt",
      icon: Activity,
      bg: "bg-emerald-50/80 dark:bg-[#111218]",
      border: "border-emerald-100 dark:border-zinc-800",
      iconBg: "bg-emerald-100 dark:bg-emerald-900/40",
      iconColor: "text-emerald-600 dark:text-emerald-400",
      valueColor: "text-emerald-700 dark:text-emerald-300",
    },
    {
      label: tr ? "Günlük Ciro" : "Today's Revenue",
      value: formatCurrency(data?.total_today_revenue),
      sub: tr ? "Tüm şubeler toplamı" : "Across all stations",
      icon: TrendingUp,
      bg: "bg-purple-50/80 dark:bg-[#111218]",
      border: "border-purple-100 dark:border-zinc-800",
      iconBg: "bg-purple-100 dark:bg-purple-900/40",
      iconColor: "text-purple-600 dark:text-purple-400",
      valueColor: "text-purple-700 dark:text-purple-300",
      isText: true,
    },
    {
      label: tr ? "Aylık Lisans Geliri (MRR)" : "Monthly Recurring (MRR)",
      value: formatCurrency(data?.total_monthly_subscription || 14970),
      sub: tr ? "SaaS abonelik havuzu" : "Active SaaS licenses",
      icon: CreditCard,
      bg: "bg-amber-50/80 dark:bg-[#111218]",
      border: "border-amber-100 dark:border-zinc-800",
      iconBg: "bg-amber-100 dark:bg-amber-900/40",
      iconColor: "text-amber-600 dark:text-amber-400",
      valueColor: "text-amber-700 dark:text-amber-300",
      isText: true,
    },
    {
      label: tr ? "Günlük İşlem" : "Today's Txns",
      value: data?.total_today_transactions ?? 0,
      sub: tr ? "Akaryakıt & Market" : "Fuel & Forecourt",
      icon: Zap,
      bg: "bg-slate-50 dark:bg-[#111218]",
      border: "border-slate-200 dark:border-zinc-800",
      iconBg: "bg-slate-200 dark:bg-zinc-800",
      iconColor: "text-slate-700 dark:text-zinc-300",
      valueColor: "text-slate-800 dark:text-zinc-200",
    },
  ];

  return (
    <div className="space-y-6">
      {/* ── ÜST BAŞLIK ── */}
      <div className="bg-white dark:bg-[#111218] rounded-3xl p-5 sm:p-6 shadow-sm border border-slate-100 dark:border-zinc-800/80 flex items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">
            <span>{tr ? "Süper Yönetici" : "SuperAdmin"}</span>
            <span>·</span>
            <span className="text-blue-600 dark:text-blue-400 font-extrabold">{tr ? "Multi-Station SaaS Katmanı" : "Multi-Station SaaS Platform"}</span>
          </div>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-gradient-to-tr from-blue-600 to-indigo-600 text-white flex items-center justify-center shadow-lg shadow-blue-500/30">
              <Zap size={18} className="text-white fill-white" />
            </div>
            <div>
              <h1 className="text-2xl font-black tracking-tight text-slate-900 dark:text-zinc-100 flex items-center gap-2">
                <span>Fuel</span>
                <span className="text-blue-600">OS</span>
                <span className="font-bold text-slate-700 dark:text-zinc-300 ml-1">
                  {tr ? "Sistem & Lisans Yönetimi" : "System & License Management"}
                </span>
              </h1>
              <p className="text-xs text-slate-500 dark:text-zinc-400 mt-0.5">
                {tr
                  ? "Tüm istasyonların anlık durumu, SaaS abonelik süreleri ve ciro performansı"
                  : "Live overview of all station nodes, SaaS license terms, and operational revenues"}
              </p>
            </div>
          </div>
        </div>

        <button
          onClick={fetch}
          disabled={refreshing}
          className="p-2.5 rounded-2xl bg-slate-50 dark:bg-[#161720] border border-slate-200 dark:border-zinc-800 text-slate-600 dark:text-zinc-300 hover:bg-slate-100 dark:hover:bg-zinc-800 transition shadow-sm"
          title={tr ? "Yenile" : "Refresh"}
        >
          <RefreshCw size={16} className={refreshing ? "animate-spin text-blue-600" : ""} />
        </button>
      </div>

      {error && (
        <div className="p-4 bg-red-50 dark:bg-rose-950/20 border border-red-200 dark:border-rose-900/40 rounded-2xl text-red-600 dark:text-rose-400 text-xs font-semibold flex items-center gap-2.5">
          <AlertCircle size={16} />
          <span>{error}</span>
        </div>
      )}

      {/* ── 5 METRİK KART (MRR DAHİL) ── */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3.5">
        {metricCards.map(({ label, value, sub, icon: Icon, bg, border, iconBg, iconColor, valueColor, isText }) => (
          <div key={label} className={`${bg} ${border} border rounded-3xl p-4 sm:p-5 space-y-2.5 shadow-sm`}>
            <div className={`w-9 h-9 rounded-2xl ${iconBg} flex items-center justify-center`}>
              <Icon size={18} className={iconColor} />
            </div>
            <div>
              <div className={`text-lg sm:text-xl font-black ${valueColor} truncate`}>
                {isText ? value : (value as number).toLocaleString("tr-TR")}
              </div>
              <div className="text-xs font-bold text-slate-700 dark:text-zinc-200 mt-0.5">{label}</div>
              <div className="text-[11px] text-slate-400 dark:text-zinc-400 mt-0.5">{sub}</div>
            </div>
          </div>
        ))}
      </div>

      {/* ── İSTASYON LİSANS VE PERFORMANS TABLOSU ── */}
      <div className="bg-white dark:bg-[#111218] rounded-3xl shadow-sm border border-slate-100 dark:border-zinc-800/80 overflow-hidden">
        <div className="p-5 border-b border-slate-100 dark:border-zinc-800/80 flex items-center justify-between">
          <div>
            <div className="text-base font-black text-slate-900 dark:text-zinc-100 flex items-center gap-2">
              <span>{tr ? "İstasyon Listesi & SaaS Lisans Durumu" : "Station Network & SaaS Licensing"}</span>
            </div>
            <div className="text-xs text-slate-400 dark:text-zinc-400 mt-0.5">
              {tr ? "Hangi istasyonlarda sistem aktif, abonelik vadeleri ve manuel müdahale" : "Active locations, license expiry dates, and administrative controls"}
            </div>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={() => {
                setCreateError(null);
                setIsCreateModalOpen(true);
              }}
              className="px-4 py-2.5 rounded-2xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-black flex items-center gap-2 shadow-md shadow-blue-600/30 transition active:scale-95"
            >
              <Plus size={16} />
              <span>{tr ? "Yeni İstasyon Ekle" : "Add Station"}</span>
            </button>
            <div className="hidden sm:flex items-center gap-2 pl-3 border-l border-slate-100 dark:border-zinc-800">
              <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
              <span className="text-xs font-semibold text-emerald-600 dark:text-emerald-400">
                {tr ? "Canlı Ağ" : "Live Network"}
              </span>
            </div>
          </div>
        </div>

        {!data?.stations?.length ? (
          <div className="p-10 text-center text-slate-400 text-sm">
            {tr ? "Kayıtlı istasyon bulunmuyor." : "No stations registered."}
          </div>
        ) : (
          <div className="divide-y divide-slate-100 dark:divide-zinc-800/60">
            {data.stations.map((st) => {
              const status = st.subscription_status || "active";
              const plan = st.subscription_plan || "Pro SaaS";
              const isSuspended = status === "suspended";
              const isPastDue = status === "past_due";

              return (
                <div
                  key={st.station_id}
                  className="p-4 sm:p-5 flex flex-col lg:flex-row lg:items-center justify-between gap-4 hover:bg-slate-50/80 dark:hover:bg-[#161722]/50 transition"
                >
                  {/* Sol: İstasyon ve Şehir Bilgisi */}
                  <div className="flex items-center gap-3.5 min-w-[220px]">
                    <div
                      className={`w-11 h-11 rounded-2xl flex items-center justify-center shrink-0 ${
                        isSuspended
                          ? "bg-rose-100 dark:bg-rose-950/40 text-rose-600 dark:text-rose-400"
                          : isPastDue
                          ? "bg-amber-100 dark:bg-amber-950/40 text-amber-600 dark:text-amber-400"
                          : "bg-emerald-100 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400"
                      }`}
                    >
                      <Building2 size={20} />
                    </div>
                    <div>
                      <div className="font-black text-slate-900 dark:text-zinc-100 text-sm">
                        {st.station_name}
                      </div>
                      <div className="flex items-center gap-2 mt-0.5">
                        <span className="text-[10px] font-mono font-bold text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/30 px-1.5 py-0.5 rounded-lg border border-blue-200 dark:border-blue-800/40">
                          {st.station_code}
                        </span>
                        <span className="flex items-center gap-1 text-[11px] text-slate-400 dark:text-zinc-400">
                          <MapPin size={10} />
                          {st.city}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Orta: Vardiya ve Ciro Metrikleri */}
                  <div className="grid grid-cols-4 gap-4 text-xs shrink-0 sm:max-w-md">
                    <div className="text-center">
                      <div className={`text-sm font-black ${st.active_shift_count > 0 ? "text-emerald-600 dark:text-emerald-400" : "text-slate-400"}`}>
                        {st.active_shift_count}
                      </div>
                      <div className="text-slate-400 text-[10px] font-semibold">{tr ? "Vardiya" : "Shift"}</div>
                    </div>
                    <div className="text-center">
                      <div className="text-sm font-black text-slate-700 dark:text-zinc-200 flex items-center justify-center gap-1">
                        <Users size={12} className="text-blue-500" />
                        {st.worker_count}
                      </div>
                      <div className="text-slate-400 text-[10px] font-semibold">{tr ? "Personel" : "Staff"}</div>
                    </div>
                    <div className="text-center">
                      <div className="text-sm font-black text-slate-700 dark:text-zinc-200">
                        {st.today_transaction_count}
                      </div>
                      <div className="text-slate-400 text-[10px] font-semibold">{tr ? "İşlem" : "Txns"}</div>
                    </div>
                    <div className="text-right">
                      <div className="text-sm font-black text-purple-600 dark:text-purple-400">
                        {formatCurrency(st.today_revenue)}
                      </div>
                      <div className="text-slate-400 text-[10px] font-semibold">{tr ? "Bugün" : "Today"}</div>
                    </div>
                  </div>

                  {/* Sağ: SaaS Abonelik Rozeti ve Yönet Butonu */}
                  <div className="flex items-center justify-between sm:justify-end gap-3 shrink-0">
                    <div className="text-right">
                      {isSuspended ? (
                        <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-xl bg-rose-50 dark:bg-rose-950/40 text-rose-700 dark:text-rose-400 border border-rose-200 dark:border-rose-900/40 text-xs font-black">
                          <ShieldAlert size={12} />
                          {tr ? "Askıya Alındı" : "Suspended"}
                        </span>
                      ) : isPastDue ? (
                        <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-xl bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-400 border border-amber-200 dark:border-amber-900/40 text-xs font-black">
                          <AlertCircle size={12} />
                          {tr ? "Ödeme Bekliyor" : "Past Due"}
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-900/40 text-xs font-black">
                          <ShieldCheck size={12} />
                          {tr ? `Aktif (${plan})` : `Active (${plan})`}
                        </span>
                      )}
                      <div className="text-[10px] text-slate-400 dark:text-zinc-400 mt-0.5 flex items-center justify-end gap-1">
                        <CalendarClock size={10} />
                        <span>
                          {st.subscription_expires_at
                            ? new Date(st.subscription_expires_at).toLocaleDateString("tr-TR")
                            : tr
                            ? "Süresiz / Oto"
                            : "Unlimited"}
                        </span>
                      </div>
                    </div>

                    <button
                      onClick={() => handleOpenSubModal(st)}
                      className="px-3.5 py-2 rounded-2xl bg-slate-100 hover:bg-slate-200 dark:bg-[#181824] dark:hover:bg-zinc-800 text-slate-700 dark:text-zinc-200 text-xs font-bold border border-slate-200 dark:border-zinc-800 transition flex items-center gap-1.5 shadow-sm active:scale-95"
                    >
                      <SlidersHorizontal size={13} className="text-blue-500" />
                      <span>{tr ? "Abonelik" : "License"}</span>
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* ── SUPERADMIN ABONELİK DÜZENLEME MODAL ── */}
      {selectedStation && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className="bg-white dark:bg-[#111218] rounded-3xl shadow-2xl border border-slate-200 dark:border-zinc-800 w-full max-w-md overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            {/* Header */}
            <div className="bg-gradient-to-r from-blue-600 to-indigo-600 p-5 flex items-center justify-between text-white">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-white/20 flex items-center justify-center">
                  <CreditCard size={18} />
                </div>
                <div>
                  <h3 className="font-black text-sm">
                    {tr ? "İstasyon SaaS Lisans Yönetimi" : "Station SaaS License Setup"}
                  </h3>
                  <p className="text-[11px] text-blue-200">
                    {selectedStation.station_name} [{selectedStation.station_code}]
                  </p>
                </div>
              </div>
              <button
                onClick={() => setSelectedStation(null)}
                className="w-8 h-8 rounded-xl bg-white/20 hover:bg-white/30 flex items-center justify-center transition"
              >
                <X size={16} />
              </button>
            </div>

            <form onSubmit={handleSaveSubscription} className="p-6 space-y-4">
              {modalSuccess && (
                <div className="p-3 bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-400 text-xs font-bold rounded-2xl border border-emerald-200 dark:border-emerald-800/50 flex items-center gap-2">
                  <CheckCircle2 size={16} />
                  <span>{modalSuccess}</span>
                </div>
              )}

              {/* Lisans Durumu */}
              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-zinc-200 mb-1.5">
                  {tr ? "Abonelik Durumu" : "Subscription Status"}
                </label>
                <div className="grid grid-cols-3 gap-2">
                  {[
                    { id: "active", label: tr ? "Aktif" : "Active", color: "border-emerald-500 text-emerald-600 dark:text-emerald-400" },
                    { id: "past_due", label: tr ? "Bekliyor" : "Past Due", color: "border-amber-500 text-amber-600 dark:text-amber-400" },
                    { id: "suspended", label: tr ? "Askıya Al" : "Suspend", color: "border-rose-500 text-rose-600 dark:text-rose-400" },
                  ].map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => setSubStatus(item.id)}
                      className={`py-2.5 rounded-2xl text-xs font-black border transition ${
                        subStatus === item.id
                          ? `${item.color} bg-slate-50 dark:bg-[#1a1b26] ring-2 ring-blue-500/20`
                          : "border-slate-200 dark:border-zinc-800 text-slate-500 dark:text-zinc-400"
                      }`}
                    >
                      {item.label}
                    </button>
                  ))}
                </div>
                <p className="text-[11px] text-slate-400 dark:text-zinc-400 mt-1.5">
                  {subStatus === "suspended"
                    ? tr
                      ? "⚠️ İstasyon kilitlenir; yeni vardiya açılmasına veya satış yapılmasına izin verilmez."
                      : "⚠️ Station gets locked; no shifts or transactions will be allowed."
                    : tr
                    ? "İstasyon aktif olarak sisteme erişir ve vardiyalar çalışır."
                    : "Station has active access to the system."}
                </p>
              </div>

              {/* Paket Seçimi */}
              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-zinc-200 mb-1.5">
                  {tr ? "Lisans Paketi" : "License Tier"}
                </label>
                <select
                  value={subPlan}
                  onChange={(e) => setSubPlan(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-2xl bg-slate-50 dark:bg-[#161720] border border-slate-200 dark:border-zinc-800 text-xs font-bold text-slate-800 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-blue-500 transition"
                >
                  <option value="Standart">Standart (₺2.990 / ay)</option>
                  <option value="Pro SaaS">Pro SaaS (₺4.990 / ay)</option>
                  <option value="Kurumsal">Kurumsal (₺8.990 / ay)</option>
                </select>
              </div>

              {/* Süre Uzatma */}
              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-zinc-200 mb-1.5">
                  {tr ? "Süre Ekle / Uzat (Gün)" : "Add Validity Duration (Days)"}
                </label>
                <div className="flex gap-2">
                  {[0, 30, 90, 365].map((d) => (
                    <button
                      key={d}
                      type="button"
                      onClick={() => setExtendDays(d)}
                      className={`flex-1 py-2 rounded-xl text-xs font-black border transition ${
                        extendDays === d
                          ? "bg-blue-600 text-white border-blue-600 shadow-sm"
                          : "border-slate-200 dark:border-zinc-800 text-slate-600 dark:text-zinc-300 hover:bg-slate-50 dark:hover:bg-zinc-800"
                      }`}
                    >
                      {d === 0 ? (tr ? "Değişme" : "None") : `+${d} ${tr ? "Gün" : "d"}`}
                    </button>
                  ))}
                </div>
              </div>

              <div className="pt-3 flex items-center justify-end gap-2.5">
                <button
                  type="button"
                  onClick={() => setSelectedStation(null)}
                  className="px-4 py-2.5 rounded-2xl text-xs font-bold text-slate-500 hover:text-slate-800 dark:text-zinc-400 dark:hover:text-white transition"
                >
                  {tr ? "Vazgeç" : "Cancel"}
                </button>
                <button
                  type="submit"
                  disabled={modalLoading}
                  className="px-5 py-2.5 rounded-2xl bg-blue-600 hover:bg-blue-700 text-white font-black text-xs shadow-md shadow-blue-600/30 transition flex items-center gap-1.5 active:scale-95 disabled:opacity-50"
                >
                  {modalLoading && <Loader2 size={14} className="animate-spin" />}
                  <span>{tr ? "Güncellemeyi Kaydet" : "Save Changes"}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── YENİ İSTASYON EKLEME MODAL (SuperAdmin) ── */}
      {isCreateModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-white dark:bg-[#111218] border border-slate-200 dark:border-zinc-800 rounded-3xl w-full max-w-lg shadow-2xl overflow-hidden">
            {/* Modal Header */}
            <div className="p-5 border-b border-slate-100 dark:border-zinc-800 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-blue-600/10 text-blue-600 flex items-center justify-center">
                  <Building2 size={20} />
                </div>
                <div>
                  <h3 className="font-black text-sm text-slate-900 dark:text-zinc-100">
                    {tr ? "Yeni İstasyon & Şube Kaydı" : "Register New Station"}
                  </h3>
                  <p className="text-[11px] text-slate-400 dark:text-zinc-400">
                    {tr ? "SaaS sistemine yeni bir akaryakıt istasyonu dahil edin" : "Onboard a new fuel station to the SaaS platform"}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsCreateModalOpen(false)}
                className="w-8 h-8 rounded-xl bg-slate-100 dark:bg-zinc-800 hover:bg-slate-200 text-slate-500 dark:text-zinc-400 flex items-center justify-center transition"
              >
                <X size={16} />
              </button>
            </div>

            {/* Modal Form */}
            <form onSubmit={handleCreateStation} className="p-5 space-y-4">
              {createError && (
                <div className="p-3 rounded-2xl bg-rose-500/10 border border-rose-500/20 text-rose-600 text-xs font-bold flex items-center gap-2">
                  <AlertCircle size={16} className="shrink-0" />
                  <span>{createError}</span>
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-zinc-300 mb-1">
                    {tr ? "İstasyon Adı *" : "Station Name *"}
                  </label>
                  <input
                    type="text"
                    required
                    placeholder={tr ? "örn: Shell Kadıköy" : "e.g. Shell Kadıköy"}
                    value={newName}
                    onChange={(e) => setNewName(e.target.value)}
                    className="w-full px-3.5 py-2.5 rounded-2xl bg-slate-50 dark:bg-[#161720] border border-slate-200 dark:border-zinc-800 text-xs font-bold text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 transition"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-zinc-300 mb-1">
                    {tr ? "İstasyon Kodu *" : "Station Code *"}
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="örn: SHL-34"
                    value={newCode}
                    onChange={(e) => setNewCode(e.target.value)}
                    className="w-full px-3.5 py-2.5 rounded-2xl bg-slate-50 dark:bg-[#161720] border border-slate-200 dark:border-zinc-800 text-xs font-mono font-bold text-slate-900 dark:text-white uppercase focus:outline-none focus:ring-2 focus:ring-blue-500 transition"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-zinc-300 mb-1">
                    {tr ? "Şehir *" : "City *"}
                  </label>
                  <input
                    type="text"
                    required
                    placeholder={tr ? "örn: İstanbul" : "e.g. Istanbul"}
                    value={newCity}
                    onChange={(e) => setNewCity(e.target.value)}
                    className="w-full px-3.5 py-2.5 rounded-2xl bg-slate-50 dark:bg-[#161720] border border-slate-200 dark:border-zinc-800 text-xs font-bold text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 transition"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-zinc-300 mb-1">
                    {tr ? "İlçe" : "District"}
                  </label>
                  <input
                    type="text"
                    placeholder={tr ? "örn: Kadıköy" : "e.g. Kadıköy"}
                    value={newDistrict}
                    onChange={(e) => setNewDistrict(e.target.value)}
                    className="w-full px-3.5 py-2.5 rounded-2xl bg-slate-50 dark:bg-[#161720] border border-slate-200 dark:border-zinc-800 text-xs font-bold text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 transition"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-zinc-300 mb-1">
                  {tr ? "Adres" : "Address"}
                </label>
                <input
                  type="text"
                  placeholder={tr ? "Bağdat Cad. No: 120" : "Main Street No: 120"}
                  value={newAddress}
                  onChange={(e) => setNewAddress(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-2xl bg-slate-50 dark:bg-[#161720] border border-slate-200 dark:border-zinc-800 text-xs font-medium text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 transition"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-zinc-300 mb-1">
                    {tr ? "Başlangıç SaaS Paketi" : "Initial SaaS Plan"}
                  </label>
                  <select
                    value={newPlan}
                    onChange={(e) => {
                      const p = e.target.value;
                      setNewPlan(p);
                      if (p === "Standart") setNewFee(2990);
                      else if (p === "Pro SaaS") setNewFee(4990);
                      else if (p === "Kurumsal") setNewFee(8990);
                    }}
                    className="w-full px-3.5 py-2.5 rounded-2xl bg-slate-50 dark:bg-[#161720] border border-slate-200 dark:border-zinc-800 text-xs font-bold text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 transition"
                  >
                    <option value="Standart">Standart</option>
                    <option value="Pro SaaS">Pro SaaS</option>
                    <option value="Kurumsal">Kurumsal</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-zinc-300 mb-1">
                    {tr ? "Aylık Lisans Ücreti (₺)" : "Monthly Fee (₺)"}
                  </label>
                  <input
                    type="number"
                    value={newFee}
                    onChange={(e) => setNewFee(Number(e.target.value))}
                    className="w-full px-3.5 py-2.5 rounded-2xl bg-slate-50 dark:bg-[#161720] border border-slate-200 dark:border-zinc-800 text-xs font-bold text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 transition"
                  />
                </div>
              </div>

              <div className="pt-3 flex items-center justify-end gap-2.5 border-t border-slate-100 dark:border-zinc-800">
                <button
                  type="button"
                  onClick={() => setIsCreateModalOpen(false)}
                  className="px-4 py-2.5 rounded-2xl text-xs font-bold text-slate-500 hover:text-slate-800 dark:text-zinc-400 dark:hover:text-white transition"
                >
                  {tr ? "Vazgeç" : "Cancel"}
                </button>
                <button
                  type="submit"
                  disabled={createLoading}
                  className="px-5 py-2.5 rounded-2xl bg-blue-600 hover:bg-blue-700 text-white font-black text-xs shadow-md shadow-blue-600/30 transition flex items-center gap-1.5 active:scale-95 disabled:opacity-50"
                >
                  {createLoading && <Loader2 size={14} className="animate-spin" />}
                  <span>{tr ? "İstasyonu Kaydet" : "Register Station"}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── ALT BİLGİ ── */}
      <div className="bg-gradient-to-r from-blue-600 via-indigo-600 to-blue-700 rounded-3xl p-5 flex flex-col sm:flex-row items-center justify-between gap-3 shadow-lg shadow-blue-600/20">
        <div className="text-white">
          <div className="font-black text-sm">
            {tr ? "Multi-Tenant SaaS Sistemi Aktif" : "Multi-Tenant SaaS Engine Active"}
          </div>
          <div className="text-blue-200 text-xs mt-0.5">
            {tr
              ? "Tüm istasyonların abonelik durumu ve otomatik kilit mekanizması devrede"
              : "All station subscriptions and automatic lockout guards are armed"}
          </div>
        </div>
        <div className="flex items-center gap-2 text-xs text-blue-200 font-semibold shrink-0">
          <div className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
          FuelOS SaaS v1.0 · {tr ? "Canlı" : "Live"}
        </div>
      </div>
    </div>
  );
};
