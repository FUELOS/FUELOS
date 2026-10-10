/**
 * FuelOS — İstasyon & Altyapı Yönetimi Sayfası
 * ZK Mahremiyet İlkesine Uygun:
 * - Şube ciro hesapları veya işçi satış fişleri burada yer ALMAZ (mahremiyet garantisi).
 * - Fiziksel pompalar, yakıt türleri, lisans/altyapı bilgileri ve şube personelleri yönetilir.
 */

import React, { useState, useEffect, useCallback, useRef } from "react";
import { Link } from "react-router-dom";
import { apiClient } from "@/lib/api";
import { Station, User } from "@/types";
import { useAuth } from "@/context/AuthContext";
import { useLanguage } from "@/context/LanguageContext";
import { formatCurrency, formatNumber } from "@/lib/utils";
import {
  Building2,
  Plus,
  Loader2,
  RefreshCw,
  MapPin,
  Users,
  Cpu,
  ChevronRight,
  AlertCircle,
  X,
  Fuel,
  ShieldCheck,
  Trash2,
  UserCheck,
  CalendarDays,
} from "lucide-react";

interface Pump {
  id: string;
  pump_number: number;
  label: string;
  fuel_types: string;
  is_active: boolean;
}

// Adım 4 endpoint'inin yanıt modeli: GET /api/pump-analytics/daily-summary
interface PumpFuelSummary {
  fuel_type: string;
  liters: string;
  amount: string;
  transaction_count: number;
}
interface PumpDailySummary {
  pump_id: string;
  pump_label: string;
  is_active: boolean;
  fuel_breakdown: PumpFuelSummary[];
  total_liters: string;
  total_amount: string;
  transaction_count: number;
}
interface StationPumpDailySummary {
  station_id: string;
  station_name: string;
  station_code: string;
  date: string;
  pumps: PumpDailySummary[];
}

// Türkiye saatine göre bugünün YYYY-MM-DD değeri (gün kaymasın diye)
const todayTR = (): string =>
  new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Istanbul" }).format(new Date());

const fuelBadgeColor = (ft: string) => {
  const low = ft.toLowerCase();
  if (low.includes("benzin") || low.includes("95")) return "bg-emerald-500/10 text-emerald-600 border-emerald-200 dark:border-emerald-800/40";
  if (low.includes("motorin") || low.includes("dizel")) return "bg-amber-500/10 text-amber-600 border-amber-200 dark:border-amber-800/40";
  if (low.includes("lpg") || low.includes("otogaz")) return "bg-rose-500/10 text-rose-600 border-rose-200 dark:border-rose-800/40";
  return "bg-blue-500/10 text-blue-600 border-blue-200 dark:border-blue-800/40";
};

export const StationsPage: React.FC = () => {
  const { user } = useAuth();
  const { language, t } = useLanguage();
  const tr = language === "tr";
  const isAdmin = user?.role === "super_admin";

  const [stations, setStations] = useState<Station[]>([]);
  const [selectedStation, setSelectedStation] = useState<Station | null>(null);
  const [pumps, setPumps] = useState<Pump[]>([]);
  const [stationUsers, setStationUsers] = useState<User[]>([]);

  const [loadingList, setLoadingList] = useState(true);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // ── Pompa günlük satış özeti (Adım 4 endpoint'i) ──────────────────
  const [salesDate, setSalesDate] = useState<string>(todayTR());
  const [pumpSummary, setPumpSummary] = useState<StationPumpDailySummary | null>(null);
  const [summaryLoading, setSummaryLoading] = useState(false);
  const [summaryError, setSummaryError] = useState<string | null>(null);
  // Aynı istasyon+tarih için gereksiz tekrar istek atılmasın (cache).
  const summaryCache = useRef<Map<string, StationPumpDailySummary>>(new Map());
  const summaryAbort = useRef<AbortController | null>(null);

  // Yeni istasyon modal
  const [isStationModalOpen, setIsStationModalOpen] = useState(false);
  const [stName, setStName] = useState("");
  const [stCode, setStCode] = useState("");
  const [stCity, setStCity] = useState("");
  const [stDistrict, setStDistrict] = useState("");
  const [stAddress, setStAddress] = useState("");
  const [stPlan, setStPlan] = useState("Pro SaaS");
  const [stFee, setStFee] = useState(4990);
  const [stModalLoading, setStModalLoading] = useState(false);
  const [stModalError, setStModalError] = useState<string | null>(null);

  // Yeni pompa modal
  const [isPumpModalOpen, setIsPumpModalOpen] = useState(false);
  const [pumpLabel, setPumpLabel] = useState("");
  const [pumpNumber, setPumpNumber] = useState(1);
  const [pumpFuelTypes, setPumpFuelTypes] = useState("Motorin,Benzin,LPG");
  const [pumpModalLoading, setPumpModalLoading] = useState(false);
  const [pumpModalError, setPumpModalError] = useState<string | null>(null);

  // ── Fetch istasyonlar ─────────────────────────────────────────────
  const fetchStations = useCallback(async () => {
    try {
      setRefreshing(true);
      const res = await apiClient.get<Station[]>("/stations");
      setStations(res.data);
      if (res.data.length > 0) {
        if (!isAdmin && user?.station_id) {
          const mine = res.data.find((s) => s.id === user.station_id);
          setSelectedStation(mine || res.data[0]);
        } else if (!selectedStation) {
          setSelectedStation(res.data[0]);
        }
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoadingList(false);
      setRefreshing(false);
    }
  }, [isAdmin, user, selectedStation]);

  useEffect(() => {
    fetchStations();
  }, [fetchStations]);

  // ── Fetch detay (Pompalar ve İstasyona Bağlı Personeller) ─────────
  const fetchDetail = useCallback(async (stationId: string) => {
    try {
      setLoadingDetail(true);
      setError(null);
      const [pumpsRes, usersRes] = await Promise.all([
        apiClient.get<Pump[]>(`/pumps/station/${stationId}`),
        apiClient.get<User[]>("/users").catch(() => ({ data: [] })),
      ]);
      setPumps(pumpsRes.data);
      const assigned = usersRes.data.filter((u) => u.station_id === stationId);
      setStationUsers(assigned);
    } catch (err: any) {
      setError(err.response?.data?.detail || (tr ? "İstasyon bilgileri alınamadı" : "Failed to load station info"));
    } finally {
      setLoadingDetail(false);
    }
  }, [tr]);

  useEffect(() => {
    if (selectedStation) fetchDetail(selectedStation.id);
  }, [selectedStation, fetchDetail]);

  // ── Fetch pompa günlük satış özeti (Adım 4 endpoint'i) ────────────
  const fetchPumpSummary = useCallback(async (stationId: string, date: string, force = false) => {
    const cacheKey = `${stationId}|${date}`;
    if (!force) {
      const cached = summaryCache.current.get(cacheKey);
      if (cached) {
        setPumpSummary(cached);
        setSummaryError(null);
        return;
      }
    }
    // Bekleyen önceki isteği iptal et
    summaryAbort.current?.abort();
    const controller = new AbortController();
    summaryAbort.current = controller;
    setSummaryLoading(true);
    setSummaryError(null);
    try {
      const res = await apiClient.get<StationPumpDailySummary>("/pump-analytics/daily-summary", {
        params: { station_id: stationId, date },
        signal: controller.signal,
      });
      summaryCache.current.set(cacheKey, res.data);
      setPumpSummary(res.data);
    } catch (err: any) {
      // İptal edilen istek hata sayılmaz
      if (err?.code === "ERR_CANCELED" || err?.name === "CanceledError" || err?.name === "AbortError") return;
      setSummaryError(err?.response?.data?.detail || t("st.load_failed"));
    } finally {
      if (summaryAbort.current === controller) setSummaryLoading(false);
    }
  }, [t]);

  useEffect(() => {
    if (selectedStation) fetchPumpSummary(selectedStation.id, salesDate);
    return () => {
      // Bileşen kapandığında / bağımlılık değiştiğinde bekleyen isteği iptal et
      summaryAbort.current?.abort();
    };
  }, [selectedStation, salesDate, fetchPumpSummary]);

  // Özet verisi pompa ID'sine göre eşlenmiş harita + günlük toplamlar
  const summaryByPump = new Map<string, PumpDailySummary>(
    (pumpSummary?.pumps || []).map((p) => [p.pump_id, p])
  );
  const dayTotalLiters = (pumpSummary?.pumps || []).reduce((acc, p) => acc + Number(p.total_liters), 0);
  const dayTotalAmount = (pumpSummary?.pumps || []).reduce((acc, p) => acc + Number(p.total_amount), 0);
  const dayTotalCount = (pumpSummary?.pumps || []).reduce((acc, p) => acc + p.transaction_count, 0);
  const hasNoSales = !summaryLoading && !summaryError && pumpSummary !== null && dayTotalCount === 0;

  // ── Yeni istasyon oluştur ────────────────────────────────────────
  const handleCreateStation = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!stName.trim() || !stCode.trim() || !stCity.trim()) {
      setStModalError(tr ? "Ad, Kod ve Şehir zorunludur" : "Name, Code and City are required");
      return;
    }
    try {
      setStModalLoading(true);
      setStModalError(null);
      const res = await apiClient.post<Station>("/stations", {
        name: stName.trim(),
        code: stCode.trim().toUpperCase(),
        city: stCity.trim(),
        district: stDistrict.trim() || undefined,
        address: stAddress.trim() || undefined,
        subscription_plan: stPlan,
        monthly_fee: Number(stFee),
      });
      setStations((prev) => [...prev, res.data]);
      setSelectedStation(res.data);
      setIsStationModalOpen(false);
      setStName("");
      setStCode("");
      setStCity("");
      setStDistrict("");
      setStAddress("");
    } catch (err: any) {
      setStModalError(err.response?.data?.detail || (tr ? "İstasyon oluşturulamadı" : "Failed to create station"));
    } finally {
      setStModalLoading(false);
    }
  };

  // ── Yeni pompa ekle ──────────────────────────────────────────────
  const handleCreatePump = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedStation) return;
    try {
      setPumpModalLoading(true);
      setPumpModalError(null);
      await apiClient.post("/pumps", {
        station_id: selectedStation.id,
        pump_number: pumpNumber,
        label: pumpLabel.trim() || `Pompa ${pumpNumber}`,
        fuel_types: pumpFuelTypes.trim(),
      });
      setIsPumpModalOpen(false);
      setPumpLabel("");
      fetchDetail(selectedStation.id);
    } catch (err: any) {
      setPumpModalError(err.response?.data?.detail || (tr ? "Pompa eklenemedi" : "Failed to add pump"));
    } finally {
      setPumpModalLoading(false);
    }
  };

  // ── Pompa sil ────────────────────────────────────────────────────
  const handleDeletePump = async (pumpId: string) => {
    if (!confirm(tr ? "Bu pompayı deaktif etmek istediğinize emin misiniz?" : "Are you sure you want to deactivate this pump?")) return;
    try {
      await apiClient.delete(`/pumps/${pumpId}`);
      if (selectedStation) fetchDetail(selectedStation.id);
    } catch (err: any) {
      alert(err.response?.data?.detail || (tr ? "Pompa silinemedi" : "Failed to delete pump"));
    }
  };

  if (loadingList) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-3 text-slate-500">
        <Loader2 size={36} className="animate-spin text-blue-600" />
        <span className="text-sm font-semibold">{tr ? "İstasyonlar yükleniyor..." : "Loading stations..."}</span>
      </div>
    );
  }

  return (
    <div className="space-y-6 w-full">
      {/* ── ÜST BAŞLIK VE AKSİYON BAR ── */}
      <div className="bg-white dark:bg-[#111218] rounded-3xl p-5 sm:p-6 shadow-sm border border-slate-100 dark:border-zinc-800 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-3.5">
          <div className="w-12 h-12 rounded-2xl bg-amber-500 text-white flex items-center justify-center shadow-lg shadow-amber-500/25 shrink-0">
            <Building2 size={24} />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl sm:text-2xl font-black text-slate-900 dark:text-white tracking-tight">
                {selectedStation ? selectedStation.name : (tr ? "İstasyon Yönetimi" : "Station Management")}
              </h1>
              {selectedStation && (
                <span className="text-xs font-mono font-bold text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-500/10 px-2.5 py-0.5 rounded-lg border border-amber-200 dark:border-amber-500/20">
                  {selectedStation.code}
                </span>
              )}
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 flex items-center gap-1.5">
              {selectedStation ? (
                <>
                  <MapPin size={12} className="text-amber-500" />
                  <span>
                    {selectedStation.city} {selectedStation.district ? `· ${selectedStation.district}` : ""}
                  </span>
                </>
              ) : (
                tr ? "İstasyon altyapısı, pompalar ve personel kadrosu" : "Station infrastructure, pumps and staff"
              )}
            </p>
          </div>
        </div>

        {/* Aksiyon Butonları */}
        <div className="flex items-center gap-2.5 self-end md:self-auto">
          {selectedStation && (
            <button
              onClick={() => fetchDetail(selectedStation.id)}
              disabled={refreshing || loadingDetail}
              className="p-2.5 rounded-2xl bg-slate-50 dark:bg-[#181920] border border-slate-200 dark:border-zinc-700 text-slate-600 dark:text-slate-300 hover:text-blue-600 hover:bg-slate-100 transition shadow-sm"
              title={tr ? "Yenile" : "Refresh"}
            >
              <RefreshCw size={16} className={loadingDetail ? "animate-spin text-blue-600" : ""} />
            </button>
          )}

          {selectedStation && (
            <button
              onClick={() => {
                setPumpNumber(pumps.length + 1);
                setPumpLabel(tr ? `Pompa ${pumps.length + 1}` : `Pump ${pumps.length + 1}`);
                setIsPumpModalOpen(true);
              }}
              className="px-4 py-2.5 rounded-2xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-black flex items-center gap-2 shadow-md shadow-blue-600/30 transition active:scale-95"
            >
              <Cpu size={15} />
              <span>{tr ? "Pompa Ekle" : "Add Pump"}</span>
            </button>
          )}

          {isAdmin && (
            <button
              onClick={() => setIsStationModalOpen(true)}
              className="px-4 py-2.5 rounded-2xl bg-amber-500 hover:bg-amber-600 text-slate-950 text-xs font-black flex items-center gap-2 shadow-md shadow-amber-500/30 transition active:scale-95"
            >
              <Plus size={15} />
              <span>{tr ? "Yeni İstasyon" : "New Station"}</span>
            </button>
          )}
        </div>
      </div>

      {/* ── İSTASYON DETAY VE ANA İÇERİK ── */}
      <div className={`grid gap-6 ${isAdmin ? "grid-cols-1 lg:grid-cols-12" : "grid-cols-1"}`}>
        {/* Admin için Sol Panel Şube Listesi */}
        {isAdmin && (
          <div className="lg:col-span-3 space-y-2">
            <div className="text-[11px] font-black text-slate-400 uppercase tracking-wider px-1">
              {tr ? "İstasyonlar" : "Stations"} ({stations.length})
            </div>
            <div className="space-y-2">
              {stations.map((st) => {
                const isSel = selectedStation?.id === st.id;
                return (
                  <button
                    key={st.id}
                    onClick={() => setSelectedStation(st)}
                    className={`w-full text-left p-3.5 rounded-2xl transition border flex items-center justify-between ${
                      isSel
                        ? "bg-blue-50/80 dark:bg-blue-900/20 border-blue-400 dark:border-blue-700 shadow-sm"
                        : "bg-white dark:bg-[#111218] border-slate-100 dark:border-zinc-800 hover:border-slate-300 dark:hover:border-zinc-700"
                    }`}
                  >
                    <div className="min-w-0 pr-2">
                      <div className="text-xs font-black text-slate-900 dark:text-white truncate">
                        {st.name}
                      </div>
                      <div className="flex items-center gap-1.5 mt-0.5">
                        <span className="text-[10px] font-mono font-bold text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-500/10 px-1.5 py-0.2 rounded">
                          {st.code}
                        </span>
                        <span className="text-[10px] text-slate-400 truncate">{st.city}</span>
                      </div>
                    </div>
                    <ChevronRight
                      size={15}
                      className={isSel ? "text-blue-600" : "text-slate-300 dark:text-slate-600"}
                    />
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* Sağ Alan: Seçili İstasyon Altyapı Paneli */}
        <div className={`${isAdmin ? "lg:col-span-9" : "w-full"} space-y-6`}>
          {error && (
            <div className="p-4 rounded-2xl bg-rose-50 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-800 text-rose-600 text-xs flex items-center gap-2">
              <AlertCircle size={16} />
              <span>{error}</span>
            </div>
          )}

          {/* ── 1. KURUMSAL ENENVANTER & LİSANS ROZETLERİ (CİRO DEĞİL!) ── */}
          {selectedStation && (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              {/* Şube Kodu ve Konum */}
              <div className="bg-white dark:bg-[#111218] border border-slate-100 dark:border-zinc-800 rounded-3xl p-4 sm:p-5 shadow-sm space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">
                    {tr ? "Şube Kodu & Konum" : "Station Code & City"}
                  </span>
                  <div className="w-8 h-8 rounded-xl bg-blue-50 dark:bg-blue-900/30 flex items-center justify-center text-blue-600">
                    <MapPin size={16} />
                  </div>
                </div>
                <div className="text-lg font-black text-slate-900 dark:text-white">
                  {selectedStation.code}
                </div>
                <div className="text-xs text-slate-500 dark:text-zinc-400 truncate">
                  {selectedStation.city} {selectedStation.district ? `· ${selectedStation.district}` : ""}
                </div>
              </div>

              {/* SaaS Lisans Durumu */}
              <div className="bg-white dark:bg-[#111218] border border-slate-100 dark:border-zinc-800 rounded-3xl p-4 sm:p-5 shadow-sm space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">
                    {tr ? "SaaS Lisans Durumu" : "License Status"}
                  </span>
                  <div className="w-8 h-8 rounded-xl bg-emerald-50 dark:bg-emerald-900/30 flex items-center justify-center text-emerald-600">
                    <ShieldCheck size={16} />
                  </div>
                </div>
                <div className="text-lg font-black text-emerald-600 dark:text-emerald-400 flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                  <span>{selectedStation.subscription_status === "suspended" ? (tr ? "Askıya Alındı" : "Suspended") : (tr ? "Aktif Lisans" : "Active")}</span>
                </div>
                <div className="text-xs text-slate-500 dark:text-zinc-400">
                  {selectedStation.subscription_plan || "Pro SaaS"} · {tr ? "Bulut Güvencesi" : "Cloud Secured"}
                </div>
              </div>

              {/* Aktif Pompa Kapasitesi */}
              <div className="bg-white dark:bg-[#111218] border border-slate-100 dark:border-zinc-800 rounded-3xl p-4 sm:p-5 shadow-sm space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">
                    {tr ? "Pompa Altyapısı" : "Pump Units"}
                  </span>
                  <div className="w-8 h-8 rounded-xl bg-amber-50 dark:bg-amber-900/30 flex items-center justify-center text-amber-600">
                    <Fuel size={16} />
                  </div>
                </div>
                <div className="text-lg font-black text-slate-900 dark:text-white">
                  {pumps.length} {tr ? "Aktif Pompa" : "Active Pumps"}
                </div>
                <div className="text-xs text-slate-500 dark:text-zinc-400">
                  {tr ? "Fiziksel yakıt dağıtım adası" : "Physical dispensing islands"}
                </div>
              </div>

              {/* Atanmış Personel Kadrosu */}
              <div className="bg-white dark:bg-[#111218] border border-slate-100 dark:border-zinc-800 rounded-3xl p-4 sm:p-5 shadow-sm space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">
                    {tr ? "Şube Personeli" : "Assigned Staff"}
                  </span>
                  <div className="w-8 h-8 rounded-xl bg-purple-50 dark:bg-purple-900/30 flex items-center justify-center text-purple-600">
                    <Users size={16} />
                  </div>
                </div>
                <div className="text-lg font-black text-slate-900 dark:text-white">
                  {stationUsers.length} {tr ? "Personel" : "Staff Members"}
                </div>
                <div className="text-xs text-slate-500 dark:text-zinc-400">
                  {tr ? "Müdür ve Kasiyer Kadrosu" : "Manager & Cashier team"}
                </div>
              </div>
            </div>
          )}

          {/* ── 2. YAN YANA İKİ ANA YÖNETİM PANELİ: POMPALAR (SOL) & PERSONEL (SAĞ) ── */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
            {/* ══ SOL SÜTUN: İSTASYON POMPALARI (7 KOLON) ══ */}
            <div className="lg:col-span-7 bg-white dark:bg-[#111218] rounded-3xl p-5 sm:p-6 shadow-sm border border-slate-100 dark:border-zinc-800 space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 dark:border-zinc-800 pb-3">
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-xl bg-blue-50 dark:bg-blue-900/30 text-blue-600 flex items-center justify-center">
                    <Cpu size={16} />
                  </div>
                  <div>
                    <h3 className="font-black text-base text-slate-900 dark:text-white">
                      {tr ? "İstasyon Pompaları" : "Station Pumps"}
                    </h3>
                    <p className="text-[11px] text-slate-400">
                      {pumps.length} {tr ? "Pompa Tanımlı" : "Pumps Configured"}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  {/* Tarih seçici — varsayılan bugün, ileri tarih seçilemez */}
                  <div className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl bg-slate-50 dark:bg-[#181920] border border-slate-200 dark:border-zinc-700">
                    <CalendarDays size={13} className="text-blue-600 dark:text-blue-400 shrink-0" />
                    <input
                      type="date"
                      value={salesDate}
                      max={todayTR()}
                      onChange={(e) => {
                        const v = e.target.value;
                        if (v && v <= todayTR()) setSalesDate(v);
                      }}
                      className="bg-transparent text-[11px] font-bold text-slate-700 dark:text-slate-200 focus:outline-none cursor-pointer [color-scheme:light] dark:[color-scheme:dark]"
                      aria-label={tr ? "Satış tarihi" : "Sales date"}
                    />
                  </div>

                  <button
                    onClick={() => {
                      setPumpNumber(pumps.length + 1);
                      setPumpLabel(tr ? `Pompa ${pumps.length + 1}` : `Pump ${pumps.length + 1}`);
                      setIsPumpModalOpen(true);
                    }}
                    className="px-2.5 py-1.5 rounded-xl bg-blue-50 dark:bg-blue-950/40 hover:bg-blue-100 text-blue-600 dark:text-blue-400 text-xs font-bold transition flex items-center gap-1"
                  >
                    <Plus size={13} />
                    <span>{tr ? "Pompa Ekle" : "Add Pump"}</span>
                  </button>
                </div>
              </div>

              {/* Günlük istasyon toplamı (seçili tarih) */}
              <div className="flex flex-wrap items-center justify-between gap-2 px-3.5 py-2.5 rounded-2xl bg-blue-50/60 dark:bg-blue-950/20 border border-blue-100 dark:border-blue-900/40">
                <span className="text-[10px] font-black text-blue-700 dark:text-blue-300 uppercase tracking-wider">
                  {t("st.daily_total")}
                </span>
                {summaryLoading ? (
                  <div className="h-4 w-40 rounded-md bg-blue-200/60 dark:bg-blue-900/40 animate-pulse" />
                ) : summaryError ? (
                  <span className="text-[11px] text-rose-500 font-bold">—</span>
                ) : (
                  <span className="text-xs font-black text-slate-800 dark:text-white font-mono">
                    {hasNoSales ? (
                      <span className="text-slate-400 dark:text-slate-500 font-sans">
                        {t("st.no_sales_date")}
                      </span>
                    ) : (
                      <>
                        {formatNumber(dayTotalLiters, 2)} Lt · {formatCurrency(dayTotalAmount)}
                      </>
                    )}
                  </span>
                )}
              </div>

              {/* Satış özeti yüklenemedi — tekrar dene */}
              {summaryError && (
                <div className="flex flex-wrap items-center justify-between gap-2 px-3.5 py-2.5 rounded-2xl bg-rose-50 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-800/50">
                  <span className="text-[11px] font-bold text-rose-600 dark:text-rose-400 flex items-center gap-1.5">
                    <AlertCircle size={13} />
                    {t("st.load_failed")}
                  </span>
                  <button
                    onClick={() => selectedStation && fetchPumpSummary(selectedStation.id, salesDate, true)}
                    className="px-2.5 py-1 rounded-lg bg-rose-600 hover:bg-rose-700 text-white text-[11px] font-bold transition flex items-center gap-1 active:scale-95"
                  >
                    <RefreshCw size={11} />
                    {t("st.retry")}
                  </button>
                </div>
              )}

              {pumps.length === 0 ? (
                <div className="p-10 text-center text-slate-400 text-xs space-y-2">
                  <Fuel size={28} className="mx-auto text-slate-300 dark:text-slate-700" />
                  <p>{tr ? "Bu istasyonda tanımlı pompa bulunmuyor." : "No pumps configured for this station."}</p>
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {pumps.map((pump) => {
                    const summary = summaryByPump.get(pump.id);
                    return (
                      <div
                        key={pump.id}
                        className="p-4 rounded-2xl border border-slate-200/80 dark:border-zinc-700/60 bg-slate-50/80 dark:bg-[#181920]/40 space-y-3 relative group"
                      >
                        <div className="flex items-center justify-between">
                          <div>
                            <div className="text-sm font-black text-slate-900 dark:text-white">
                              {pump.label}
                            </div>
                            <div className="text-[10px] text-slate-400 font-mono">
                              No: #{pump.pump_number}
                            </div>
                          </div>

                          <div className="flex items-center gap-1.5">
                            <span className="flex items-center gap-1 text-[10px] font-bold text-emerald-600 bg-emerald-100/70 dark:bg-emerald-900/40 px-2 py-0.5 rounded-full">
                              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                              {tr ? "Aktif" : "Active"}
                            </span>
                            <button
                              onClick={() => handleDeletePump(pump.id)}
                              className="p-1 text-slate-400 hover:text-rose-500 rounded-lg transition"
                              title={tr ? "Pompayı Sil" : "Delete Pump"}
                            >
                              <Trash2 size={13} />
                            </button>
                          </div>
                        </div>

                        {/* Yakıt etiketleri + o yakıttan satılan litre */}
                        <div className="flex flex-wrap gap-1">
                          {pump.fuel_types.split(",").map((ft) => {
                            const fuel = ft.trim();
                            const sold = summary?.fuel_breakdown.find(
                              (f) => f.fuel_type.toLowerCase() === fuel.toLowerCase()
                            );
                            return (
                              <span
                                key={ft}
                                className={`text-[10px] font-bold px-2 py-0.5 rounded-md border ${fuelBadgeColor(ft)}`}
                              >
                                {fuel}
                                {summaryLoading ? null : (
                                  <span className="font-mono font-black opacity-80">
                                    {" "}: {formatNumber(sold?.liters ?? 0, 0)} Lt
                                  </span>
                                )}
                              </span>
                            );
                          })}
                        </div>

                        {/* Günlük satış toplamı (litre · tutar) */}
                        {summaryLoading ? (
                          <div className="h-[30px] rounded-xl bg-slate-200/70 dark:bg-zinc-700/40 animate-pulse" />
                        ) : (
                          <div className="pt-1 border-t border-slate-200/60 dark:border-zinc-700/50 flex items-center justify-between gap-2">
                            <span className="text-[9px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-wider shrink-0">
                              {t("st.pump_daily")}
                            </span>
                            <span className="text-[11px] font-black text-slate-800 dark:text-white font-mono truncate">
                              {summary
                                ? `${formatNumber(summary.total_liters, 2)} Lt · ${formatCurrency(summary.total_amount)}`
                                : "—"}
                            </span>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* ══ SAĞ SÜTUN: İSTASYONA ATANMIŞ PERSONELLER (5 KOLON) ══ */}
            <div className="lg:col-span-5 bg-white dark:bg-[#111218] rounded-3xl p-5 sm:p-6 shadow-sm border border-slate-100 dark:border-zinc-800 space-y-4">
              <div className="flex items-center justify-between border-b border-slate-100 dark:border-zinc-800 pb-3">
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-xl bg-purple-50 dark:bg-purple-900/30 text-purple-600 flex items-center justify-center">
                    <Users size={16} />
                  </div>
                  <div>
                    <h3 className="font-black text-base text-slate-900 dark:text-white">
                      {tr ? "Şube Yetkili Kadrosu" : "Station Staff"}
                    </h3>
                    <p className="text-[11px] text-slate-400">
                      {stationUsers.length} {tr ? "Kayıtlı Çalışan" : "Assigned Users"}
                    </p>
                  </div>
                </div>

                <Link
                  to="/users"
                  className="px-2.5 py-1.5 rounded-xl bg-purple-50 dark:bg-purple-950/40 hover:bg-purple-100 text-purple-600 dark:text-purple-400 text-xs font-bold transition flex items-center gap-1"
                >
                  <UserCheck size={13} />
                  <span>{tr ? "Yönet" : "Manage"}</span>
                </Link>
              </div>

              {stationUsers.length === 0 ? (
                <div className="p-10 text-center text-slate-400 text-xs space-y-3">
                  <Users size={28} className="mx-auto text-slate-300 dark:text-slate-700" />
                  <p>{tr ? "Bu istasyona henüz atanmış personel bulunmuyor." : "No staff members assigned to this station yet."}</p>
                  <Link
                    to="/users"
                    className="inline-flex items-center gap-1.5 text-xs font-bold text-blue-600 hover:underline"
                  >
                    <span>{tr ? "Kullanıcılar sayfasından personel ata" : "Assign staff in Users page"}</span>
                    <ChevronRight size={13} />
                  </Link>
                </div>
              ) : (
                <div className="space-y-2.5">
                  {stationUsers.map((u) => {
                    const isManager = u.role === "station_manager";
                    return (
                      <div
                        key={u.id}
                        className="p-3.5 rounded-2xl bg-slate-50 dark:bg-[#161720] border border-slate-200/80 dark:border-zinc-800 flex items-center justify-between gap-3"
                      >
                        <div className="min-w-0">
                          <div className="text-xs font-black text-slate-900 dark:text-white truncate">
                            {u.full_name}
                          </div>
                          <div className="text-[11px] text-slate-400 truncate">{u.email}</div>
                        </div>

                        <span
                          className={`text-[10px] font-bold px-2.5 py-1 rounded-xl border shrink-0 ${
                            isManager
                              ? "bg-purple-500/10 text-purple-600 border-purple-500/20"
                              : "bg-blue-500/10 text-blue-600 border-blue-500/20"
                          }`}
                        >
                          {isManager ? (tr ? "İstasyon Müdürü" : "Station Manager") : (tr ? "Kasiyer / Görevli" : "Cashier")}
                        </span>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* ── YENİ İSTASYON MODAL (Admin) ── */}
      {isStationModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-white dark:bg-[#111218] border border-slate-200 dark:border-zinc-800 rounded-3xl w-full max-w-md shadow-2xl overflow-hidden">
            <div className="p-5 border-b border-slate-100 dark:border-zinc-800 flex items-center justify-between">
              <h3 className="font-black text-sm text-slate-900 dark:text-white">
                {tr ? "Yeni İstasyon Oluştur" : "Create New Station"}
              </h3>
              <button
                type="button"
                onClick={() => setIsStationModalOpen(false)}
                className="w-8 h-8 rounded-xl bg-slate-100 dark:bg-zinc-800 text-slate-500 hover:bg-slate-200 flex items-center justify-center"
              >
                <X size={15} />
              </button>
            </div>

            <form onSubmit={handleCreateStation} className="p-5 space-y-3">
              {stModalError && (
                <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-600 text-xs">
                  {stModalError}
                </div>
              )}
              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                  {tr ? "İstasyon Adı *" : "Station Name *"}
                </label>
                <input
                  type="text"
                  required
                  placeholder="örn: Shell Beşiktaş"
                  value={stName}
                  onChange={(e) => setStName(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-[#161720] border border-slate-200 dark:border-zinc-800 text-xs font-bold text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-amber-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                    {tr ? "Kod *" : "Code *"}
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="örn: BSK-01"
                    value={stCode}
                    onChange={(e) => setStCode(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-[#161720] border border-slate-200 dark:border-zinc-800 text-xs font-mono font-bold uppercase text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-amber-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                    {tr ? "Şehir *" : "City *"}
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="örn: İstanbul"
                    value={stCity}
                    onChange={(e) => setStCity(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-[#161720] border border-slate-200 dark:border-zinc-800 text-xs font-bold text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-amber-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                  {tr ? "İlçe" : "District"}
                </label>
                <input
                  type="text"
                  placeholder="örn: Beşiktaş"
                  value={stDistrict}
                  onChange={(e) => setStDistrict(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-[#161720] border border-slate-200 dark:border-zinc-800 text-xs font-bold text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-amber-500"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                  {tr ? "Adres" : "Address"}
                </label>
                <input
                  type="text"
                  placeholder="örn: Barbaros Bulvarı No: 42"
                  value={stAddress}
                  onChange={(e) => setStAddress(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-[#161720] border border-slate-200 dark:border-zinc-800 text-xs font-bold text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-amber-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                    {tr ? "SaaS Paketi" : "SaaS Plan"}
                  </label>
                  <select
                    value={stPlan}
                    onChange={(e) => {
                      const p = e.target.value;
                      setStPlan(p);
                      if (p === "Standart") setStFee(2990);
                      else if (p === "Pro SaaS") setStFee(4990);
                      else if (p === "Kurumsal") setStFee(8990);
                    }}
                    className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-[#161720] border border-slate-200 dark:border-zinc-800 text-xs font-bold text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-amber-500"
                  >
                    <option value="Standart">Standart</option>
                    <option value="Pro SaaS">Pro SaaS</option>
                    <option value="Kurumsal">Kurumsal</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                    {tr ? "Aylık Bedel (₺)" : "Fee (₺)"}
                  </label>
                  <input
                    type="number"
                    value={stFee}
                    onChange={(e) => setStFee(Number(e.target.value))}
                    className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-[#161720] border border-slate-200 dark:border-zinc-800 text-xs font-bold text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-amber-500"
                  />
                </div>
              </div>

              <div className="pt-3 flex justify-end gap-2 border-t border-slate-100 dark:border-zinc-800">
                <button
                  type="button"
                  onClick={() => setIsStationModalOpen(false)}
                  className="px-4 py-2 rounded-xl text-xs font-bold text-slate-500 hover:text-slate-800 dark:text-zinc-400"
                >
                  {tr ? "Vazgeç" : "Cancel"}
                </button>
                <button
                  type="submit"
                  disabled={stModalLoading}
                  className="px-5 py-2 rounded-xl bg-amber-500 hover:bg-amber-600 text-slate-950 font-black text-xs shadow-md transition disabled:opacity-50"
                >
                  {stModalLoading ? <Loader2 size={14} className="animate-spin" /> : (tr ? "Kaydet" : "Save")}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── YENİ POMPA MODAL ── */}
      {isPumpModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-white dark:bg-[#111218] border border-slate-200 dark:border-zinc-800 rounded-3xl w-full max-w-sm shadow-2xl overflow-hidden">
            <div className="p-5 border-b border-slate-100 dark:border-zinc-800 flex items-center justify-between">
              <h3 className="font-black text-sm text-slate-900 dark:text-white">
                {tr ? "Yeni Pompa Ekle" : "Add New Pump"}
              </h3>
              <button
                type="button"
                onClick={() => setIsPumpModalOpen(false)}
                className="w-8 h-8 rounded-xl bg-slate-100 dark:bg-zinc-800 text-slate-500 hover:bg-slate-200 flex items-center justify-center"
              >
                <X size={15} />
              </button>
            </div>

            <form onSubmit={handleCreatePump} className="p-5 space-y-3">
              {pumpModalError && (
                <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-600 text-xs">
                  {pumpModalError}
                </div>
              )}
              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                  {tr ? "Pompa Numarası" : "Pump Number"}
                </label>
                <input
                  type="number"
                  min="1"
                  required
                  value={pumpNumber}
                  onChange={(e) => setPumpNumber(parseInt(e.target.value) || 1)}
                  className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-[#161720] border border-slate-200 dark:border-zinc-800 text-xs font-bold text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                  {tr ? "Etiket / İsim" : "Label / Name"}
                </label>
                <input
                  type="text"
                  placeholder="örn: Pompa 1 (Ada 1)"
                  value={pumpLabel}
                  onChange={(e) => setPumpLabel(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-[#161720] border border-slate-200 dark:border-zinc-800 text-xs font-bold text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                  {tr ? "Desteklenen Yakıtlar" : "Fuel Types (comma separated)"}
                </label>
                <input
                  type="text"
                  placeholder="Motorin,Benzin,LPG"
                  value={pumpFuelTypes}
                  onChange={(e) => setPumpFuelTypes(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-[#161720] border border-slate-200 dark:border-zinc-800 text-xs font-bold text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div className="pt-3 flex justify-end gap-2 border-t border-slate-100 dark:border-zinc-800">
                <button
                  type="button"
                  onClick={() => setIsPumpModalOpen(false)}
                  className="px-4 py-2 rounded-xl text-xs font-bold text-slate-500 hover:text-slate-800 dark:text-zinc-400"
                >
                  {tr ? "Vazgeç" : "Cancel"}
                </button>
                <button
                  type="submit"
                  disabled={pumpModalLoading}
                  className="px-5 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-black text-xs shadow-md transition disabled:opacity-50"
                >
                  {pumpModalLoading ? <Loader2 size={14} className="animate-spin" /> : (tr ? "Ekle" : "Add")}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
