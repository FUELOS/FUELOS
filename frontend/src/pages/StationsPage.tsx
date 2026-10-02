/**
 * FuelOS — İstasyon Detay Sayfası
 * Yan yana ayrımı net: Pompalar Paneli (sol) & İşçi Bazlı Satış & Vardiya (sağ)
 * Tam ekran genişliği kullanımı, ferah ve modern UI.
 */

import React, { useState, useEffect, useCallback } from "react";
import { apiClient } from "@/lib/api";
import { Station } from "@/types";
import { useAuth } from "@/context/AuthContext";
import { formatCurrency, formatNumber } from "@/lib/utils";
import {
  Building2,
  Plus,
  Loader2,
  RefreshCw,
  MapPin,
  Car,
  Droplet,
  TrendingUp,
  Users,
  Cpu,
  ChevronRight,
  AlertCircle,
  UserCircle,
  X,
  AlertTriangle,
  Fuel,
  CheckCircle,
} from "lucide-react";

// ── Tip tanımları ────────────────────────────────────────────────────

interface Pump {
  id: string;
  pump_number: number;
  label: string;
  fuel_types: string;
  is_active: boolean;
}

interface FuelBreakdown {
  fuel_type: string;
  liters: number;
  revenue: number;
  vehicle_count: number;
}

interface WorkerDetailStats {
  worker_name: string;
  worker_avatar: string | null;
  shift_id: string;
  pump_label: string | null;
  fuel_breakdown: FuelBreakdown[];
  total_liters: number;
  total_revenue: number;
  total_vehicles: number;
}

interface StationDetailData {
  station_id: string;
  station_name: string;
  station_code: string;
  city: string;
  workers: WorkerDetailStats[];
  grand_total_liters: number;
  grand_total_revenue: number;
  grand_total_vehicles: number;
}

// ── Avatar render ────────────────────────────────────────────────────
const MALE_AVATARS: Record<string, string> = { m1: "👨", m2: "👨‍🦱", m3: "👨‍🦳", m4: "🧔" };
const FEMALE_AVATARS: Record<string, string> = { f1: "👩", f2: "👩‍🦱", f3: "👩‍🦳", f4: "👩‍🦰" };

const WorkerAvatar: React.FC<{ avatar: string | null; name: string; size?: "sm" | "md" | "lg" }> = ({
  avatar,
  name,
  size = "md",
}) => {
  const dim = size === "lg" ? "w-14 h-14" : size === "md" ? "w-11 h-11" : "w-8 h-8";
  const textSize = size === "lg" ? "text-3xl" : size === "md" ? "text-2xl" : "text-base";

  if (!avatar) {
    const initials = name ? name.split(" ").map((n) => n[0]).join("").slice(0, 2).toUpperCase() : "?";
    return (
      <div className={`${dim} rounded-2xl bg-blue-600 text-white flex items-center justify-center font-black text-sm shrink-0 shadow-sm`}>
        {initials}
      </div>
    );
  }
  if (avatar.startsWith("data:image")) {
    return <img src={avatar} alt={name} className={`${dim} rounded-2xl object-cover border border-slate-200 dark:border-slate-700 shrink-0 shadow-sm`} />;
  }
  const emoji = MALE_AVATARS[avatar] || FEMALE_AVATARS[avatar] || null;
  if (emoji) {
    return (
      <div className={`${dim} rounded-2xl bg-blue-50 dark:bg-blue-900/30 border border-blue-200 dark:border-blue-800/50 flex items-center justify-center shrink-0 shadow-sm`}>
        <span className={textSize}>{emoji}</span>
      </div>
    );
  }
  return (
    <div className={`${dim} rounded-2xl bg-slate-100 dark:bg-slate-800 flex items-center justify-center shrink-0`}>
      <UserCircle className="text-slate-400" size={24} />
    </div>
  );
};

const fuelBadgeColor = (ft: string) => {
  const low = ft.toLowerCase();
  if (low.includes("benzin") || low.includes("95")) return "bg-emerald-500/10 text-emerald-600 border-emerald-200 dark:border-emerald-800/40";
  if (low.includes("motorin") || low.includes("dizel")) return "bg-amber-500/10 text-amber-600 border-amber-200 dark:border-amber-800/40";
  if (low.includes("lpg") || low.includes("otogaz")) return "bg-rose-500/10 text-rose-600 border-rose-200 dark:border-rose-800/40";
  return "bg-blue-500/10 text-blue-600 border-blue-200 dark:border-blue-800/40";
};

// ── Ana Bileşen ───────────────────────────────────────────────────────

export const StationsPage: React.FC = () => {
  const { user } = useAuth();
  const isAdmin = user?.role === "super_admin";

  const [stations, setStations] = useState<Station[]>([]);
  const [selectedStation, setSelectedStation] = useState<Station | null>(null);
  const [detailData, setDetailData] = useState<StationDetailData | null>(null);
  const [pumps, setPumps] = useState<Pump[]>([]);

  const [loadingList, setLoadingList] = useState(true);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Yeni istasyon modal
  const [isStationModalOpen, setIsStationModalOpen] = useState(false);
  const [stName, setStName] = useState("");
  const [stCode, setStCode] = useState("");
  const [stCity, setStCity] = useState("");
  const [stDistrict, setStDistrict] = useState("");
  const [stAddress, setStAddress] = useState("");
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

  // ── Fetch detay ───────────────────────────────────────────────────
  const fetchDetail = useCallback(async (stationId: string) => {
    try {
      setLoadingDetail(true);
      setError(null);
      const [detailRes, pumpsRes] = await Promise.all([
        apiClient.get<StationDetailData>(`/station-detail/${stationId}`),
        apiClient.get<Pump[]>(`/pumps/station/${stationId}`),
      ]);
      setDetailData(detailRes.data);
      setPumps(pumpsRes.data);
    } catch (err: any) {
      setError(err.response?.data?.detail || "İstasyon detayı alınamadı");
    } finally {
      setLoadingDetail(false);
    }
  }, []);

  useEffect(() => {
    if (selectedStation) fetchDetail(selectedStation.id);
    else {
      setDetailData(null);
      setPumps([]);
    }
  }, [selectedStation, fetchDetail]);

  // ── İstasyon oluştur ──────────────────────────────────────────────
  const handleCreateStation = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setStModalLoading(true);
      setStModalError(null);
      await apiClient.post("/stations", {
        name: stName.trim(),
        code: stCode.trim().toUpperCase(),
        city: stCity.trim(),
        district: stDistrict.trim() || null,
        address: stAddress.trim() || null,
      });
      setIsStationModalOpen(false);
      setStName("");
      setStCode("");
      setStCity("");
      setStDistrict("");
      setStAddress("");
      fetchStations();
    } catch (err: any) {
      setStModalError(err.response?.data?.detail || "Hata oluştu");
    } finally {
      setStModalLoading(false);
    }
  };

  // ── Pompa oluştur ─────────────────────────────────────────────────
  const handleCreatePump = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedStation) return;
    try {
      setPumpModalLoading(true);
      setPumpModalError(null);
      await apiClient.post("/pumps/", {
        station_id: selectedStation.id,
        pump_number: pumpNumber,
        label: pumpLabel.trim(),
        fuel_types: pumpFuelTypes.trim(),
      });
      setIsPumpModalOpen(false);
      setPumpLabel("");
      setPumpNumber(pumps.length + 2);
      fetchDetail(selectedStation.id);
    } catch (err: any) {
      setPumpModalError(err.response?.data?.detail || "Hata oluştu");
    } finally {
      setPumpModalLoading(false);
    }
  };

  if (loadingList) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-3 text-slate-400">
        <Loader2 size={36} className="animate-spin text-blue-600" />
        <span className="text-sm font-semibold">İstasyon bilgileri yükleniyor...</span>
      </div>
    );
  }

  return (
    <div className="space-y-6 w-full">
      {/* ── ÜST BAŞLIK VE AKSİYON BAR ── */}
      <div className="bg-white dark:bg-[#0f172a] rounded-3xl p-5 sm:p-6 shadow-sm border border-slate-100 dark:border-slate-800 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-3.5">
          <div className="w-12 h-12 rounded-2xl bg-amber-500 text-white flex items-center justify-center shadow-lg shadow-amber-500/25 shrink-0">
            <Building2 size={24} />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl sm:text-2xl font-black text-slate-900 dark:text-white tracking-tight">
                {selectedStation ? selectedStation.name : "İstasyon Yönetimi"}
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
                "İstasyon seçin veya yeni istasyon ekleyin"
              )}
            </p>
          </div>
        </div>

        {/* Butonlar */}
        <div className="flex items-center gap-2.5 self-end md:self-auto">
          {selectedStation && (
            <button
              onClick={() => fetchDetail(selectedStation.id)}
              disabled={refreshing || loadingDetail}
              className="p-2.5 rounded-2xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:text-blue-600 hover:bg-slate-100 transition shadow-sm"
              title="Yenile"
            >
              <RefreshCw size={16} className={loadingDetail ? "animate-spin text-blue-600" : ""} />
            </button>
          )}

          {selectedStation && (
            <button
              onClick={() => {
                setPumpNumber(pumps.length + 1);
                setPumpLabel(`Pompa ${pumps.length + 1}`);
                setIsPumpModalOpen(true);
              }}
              className="px-4 py-2.5 rounded-2xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-black flex items-center gap-2 shadow-md shadow-blue-600/30 transition active:scale-95"
            >
              <Cpu size={15} />
              <span>Pompa Ekle</span>
            </button>
          )}

          {isAdmin && (
            <button
              onClick={() => setIsStationModalOpen(true)}
              className="px-4 py-2.5 rounded-2xl bg-amber-500 hover:bg-amber-600 text-slate-950 text-xs font-black flex items-center gap-2 shadow-md shadow-amber-500/30 transition active:scale-95"
            >
              <Plus size={15} />
              <span>Yeni İstasyon</span>
            </button>
          )}
        </div>
      </div>

      {/* ── İSTASYON DETAY VE ANA İÇERİK (TAM GENİŞLİK) ── */}
      <div className={`grid gap-6 ${isAdmin ? "grid-cols-1 lg:grid-cols-12" : "grid-cols-1"}`}>
        {/* Admin için Sol Panel İstasyon Listesi */}
        {isAdmin && (
          <div className="lg:col-span-3 space-y-2">
            <div className="text-[11px] font-black text-slate-400 uppercase tracking-wider px-1">
              İstasyonlar ({stations.length})
            </div>
            <div className="space-y-2">
              {stations.map((st) => (
                <button
                  key={st.id}
                  onClick={() => setSelectedStation(st)}
                  className={`w-full text-left p-4 rounded-3xl border transition flex items-center justify-between gap-3 ${
                    selectedStation?.id === st.id
                      ? "bg-blue-50/80 dark:bg-blue-900/20 border-blue-400 dark:border-blue-700 shadow-sm"
                      : "bg-white dark:bg-[#0f172a] border-slate-100 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700"
                  }`}
                >
                  <div className="min-w-0">
                    <div className={`text-sm font-black truncate ${selectedStation?.id === st.id ? "text-blue-700 dark:text-blue-300" : "text-slate-800 dark:text-white"}`}>
                      {st.name}
                    </div>
                    <div className="flex items-center gap-2 mt-1">
                      <span className="text-[10px] font-mono font-bold text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-500/10 px-1.5 py-0.2 rounded">
                        {st.code}
                      </span>
                      <span className="text-[11px] text-slate-400 truncate">{st.city}</span>
                    </div>
                  </div>
                  <ChevronRight size={16} className={selectedStation?.id === st.id ? "text-blue-600" : "text-slate-300 dark:text-slate-700"} />
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Ana İçerik Bloğu (Müdür için tüm 12 sütunu, Admin için 9 sütunu doldurur) */}
        <div className={isAdmin ? "lg:col-span-9 space-y-6" : "space-y-6 w-full"}>
          {error && (
            <div className="p-4 bg-red-50 border border-red-200 rounded-2xl text-red-600 text-xs font-semibold flex items-center gap-2.5">
              <AlertCircle size={16} />
              <span>{error}</span>
            </div>
          )}

          {/* ── 1. ÜST GENEL TOPLAMLAR (3 GENİŞ METRİK KARTI) ── */}
          {detailData && (
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              {/* Toplam Satış */}
              <div className="bg-purple-50/80 dark:bg-purple-950/20 border border-purple-100 dark:border-purple-800/40 rounded-3xl p-5 shadow-sm">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-purple-700 dark:text-purple-400 uppercase tracking-wider">
                    Toplam Satış Tutarı
                  </span>
                  <div className="w-9 h-9 rounded-xl bg-purple-100 dark:bg-purple-900/40 flex items-center justify-center text-purple-600">
                    <TrendingUp size={18} />
                  </div>
                </div>
                <div className="text-2xl sm:text-3xl font-black text-purple-700 dark:text-purple-300 mt-2">
                  {formatCurrency(detailData.grand_total_revenue)}
                </div>
                <div className="text-[11px] text-purple-500/80 dark:text-purple-400/80 font-medium mt-1">
                  Bugünkü açık vardiya cirosu
                </div>
              </div>

              {/* Toplam Litre */}
              <div className="bg-emerald-50/80 dark:bg-emerald-950/20 border border-emerald-100 dark:border-emerald-800/40 rounded-3xl p-5 shadow-sm">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-emerald-700 dark:text-emerald-400 uppercase tracking-wider">
                    Toplam Verilen Litre
                  </span>
                  <div className="w-9 h-9 rounded-xl bg-emerald-100 dark:bg-emerald-900/40 flex items-center justify-center text-emerald-600">
                    <Droplet size={18} />
                  </div>
                </div>
                <div className="text-2xl sm:text-3xl font-black text-emerald-700 dark:text-emerald-300 mt-2">
                  {formatNumber(detailData.grand_total_liters, 2)} L
                </div>
                <div className="text-[11px] text-emerald-500/80 dark:text-emerald-400/80 font-medium mt-1">
                  Pompalanan toplam yakıt
                </div>
              </div>

              {/* Toplam Araç */}
              <div className="bg-blue-50/80 dark:bg-blue-950/20 border border-blue-100 dark:border-blue-800/40 rounded-3xl p-5 shadow-sm">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-blue-700 dark:text-blue-400 uppercase tracking-wider">
                    Hizmet Verilen Araç
                  </span>
                  <div className="w-9 h-9 rounded-xl bg-blue-100 dark:bg-blue-900/40 flex items-center justify-center text-blue-600">
                    <Car size={18} />
                  </div>
                </div>
                <div className="text-2xl sm:text-3xl font-black text-blue-700 dark:text-blue-300 mt-2">
                  {detailData.grand_total_vehicles} Araç
                </div>
                <div className="text-[11px] text-blue-500/80 dark:text-blue-400/80 font-medium mt-1">
                  İstasyona giriş yapan araç sayısı
                </div>
              </div>
            </div>
          )}

          {/* ── 2. YAN YANA İKİ ANA PANEL: POMPALAR (SOL) & İŞÇİ SATIŞLARI (SAĞ) ── */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
            {/* ══ SOL SÜTUN: İSTASYON POMPALARI (5 KOLON) ══ */}
            <div className="lg:col-span-5 bg-white dark:bg-[#0f172a] rounded-3xl p-5 sm:p-6 shadow-sm border border-slate-100 dark:border-slate-800 space-y-4">
              <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-xl bg-blue-50 dark:bg-blue-900/30 text-blue-600 flex items-center justify-center">
                    <Cpu size={16} />
                  </div>
                  <div>
                    <h3 className="font-black text-base text-slate-900 dark:text-white">İstasyon Pompaları</h3>
                    <p className="text-[11px] text-slate-400">{pumps.length} Pompa Tanımlı</p>
                  </div>
                </div>
                <button
                  onClick={() => {
                    setPumpNumber(pumps.length + 1);
                    setPumpLabel(`Pompa ${pumps.length + 1}`);
                    setIsPumpModalOpen(true);
                  }}
                  className="px-2.5 py-1.5 rounded-xl bg-blue-50 dark:bg-blue-950/40 hover:bg-blue-100 text-blue-600 dark:text-blue-400 text-xs font-bold transition flex items-center gap-1"
                >
                  <Plus size={13} />
                  <span>Ekle</span>
                </button>
              </div>

              {pumps.length === 0 ? (
                <div className="p-8 text-center text-slate-400 text-xs space-y-2">
                  <Fuel size={28} className="mx-auto text-slate-300 dark:text-slate-700" />
                  <div>Henüz tanımlı pompa bulunmuyor.</div>
                  <button
                    onClick={() => setIsPumpModalOpen(true)}
                    className="text-blue-600 font-bold underline"
                  >
                    İlk pompayı ekleyin
                  </button>
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2 gap-3">
                  {pumps.map((pump) => {
                    // Bu pompada çalışan işçi var mı?
                    const assignedWorker = detailData?.workers.find(
                      (w) => w.pump_label === pump.label
                    );

                    return (
                      <div
                        key={pump.id}
                        className={`p-4 rounded-2xl border transition relative space-y-2.5 ${
                          assignedWorker
                            ? "bg-emerald-50/50 dark:bg-emerald-950/10 border-emerald-300 dark:border-emerald-800/60 shadow-sm"
                            : "bg-slate-50/80 dark:bg-slate-800/40 border-slate-200/80 dark:border-slate-700/60"
                        }`}
                      >
                        <div className="flex items-start justify-between">
                          <div>
                            <div className="font-black text-sm text-slate-900 dark:text-white">
                              {pump.label}
                            </div>
                            <div className="text-[10px] font-mono text-slate-400">
                              No: #{pump.pump_number}
                            </div>
                          </div>
                          {assignedWorker ? (
                            <span className="flex items-center gap-1 text-[10px] font-bold text-emerald-600 bg-emerald-100/70 dark:bg-emerald-900/40 px-2 py-0.5 rounded-full">
                              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                              Aktif
                            </span>
                          ) : (
                            <span className="text-[10px] font-medium text-slate-400 bg-slate-200/60 dark:bg-slate-700/60 px-2 py-0.5 rounded-full">
                              Boşta
                            </span>
                          )}
                        </div>

                        {/* Yakıt Etiketleri */}
                        <div className="flex flex-wrap gap-1">
                          {pump.fuel_types.split(",").map((ft, idx) => (
                            <span
                              key={idx}
                              className={`text-[9px] font-bold px-1.5 py-0.5 rounded border ${fuelBadgeColor(
                                ft
                              )}`}
                            >
                              {ft.trim()}
                            </span>
                          ))}
                        </div>

                        {/* Atanan Personel */}
                        <div className="pt-2 border-t border-slate-200/60 dark:border-slate-700/40 flex items-center justify-between text-[11px]">
                          <span className="text-slate-400 font-medium">Görevli:</span>
                          {assignedWorker ? (
                            <span className="font-extrabold text-slate-800 dark:text-slate-200 flex items-center gap-1">
                              <span>👤</span>
                              <span>{assignedWorker.worker_name}</span>
                            </span>
                          ) : (
                            <span className="text-slate-400 italic">Vardiya Yok</span>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* ══ SAĞ SÜTUN: İŞÇİ BAZLI SATIŞ VE VARDİYA (7 KOLON) ══ */}
            <div className="lg:col-span-7 bg-white dark:bg-[#0f172a] rounded-3xl p-5 sm:p-6 shadow-sm border border-slate-100 dark:border-slate-800 space-y-4">
              <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-xl bg-purple-50 dark:bg-purple-900/30 text-purple-600 flex items-center justify-center">
                    <Users size={16} />
                  </div>
                  <div>
                    <h3 className="font-black text-base text-slate-900 dark:text-white">İşçi & Vardiya Satışları</h3>
                    <p className="text-[11px] text-slate-400">
                      {detailData?.workers.length || 0} Aktif Çalışan Personel
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-1 text-xs font-bold text-emerald-600 bg-emerald-50 dark:bg-emerald-950/30 px-3 py-1 rounded-xl border border-emerald-200 dark:border-emerald-800/40">
                  <CheckCircle size={13} />
                  <span>Canlı Akış</span>
                </div>
              </div>

              {!detailData?.workers || detailData.workers.length === 0 ? (
                <div className="p-12 text-center text-slate-400 text-xs space-y-3">
                  <AlertTriangle size={32} className="mx-auto text-slate-300 dark:text-slate-700" />
                  <div className="font-bold text-sm text-slate-600 dark:text-slate-400">
                    Bu istasyonda şu anda açık bir vardiya bulunmuyor.
                  </div>
                  <p className="text-slate-400 max-w-sm mx-auto">
                    Yeni bir işçi ve pompa vardiyası başlatmak için sol menüden Vardiya sekmesine gidin.
                  </p>
                </div>
              ) : (
                <div className="space-y-4">
                  {detailData.workers.map((worker) => (
                    <div
                      key={worker.shift_id}
                      className="p-4 sm:p-5 rounded-2xl bg-slate-50/70 dark:bg-slate-800/40 border border-slate-200/80 dark:border-slate-700/60 space-y-4"
                    >
                      {/* İşçi Başlık Barı */}
                      <div className="flex items-center justify-between gap-3">
                        <div className="flex items-center gap-3 min-w-0">
                          <WorkerAvatar avatar={worker.worker_avatar} name={worker.worker_name} />
                          <div className="min-w-0">
                            <div className="text-sm font-black text-slate-900 dark:text-white truncate">
                              {worker.worker_name}
                            </div>
                            <div className="flex items-center gap-2 mt-0.5 text-xs text-slate-400">
                              <span className="font-bold text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/30 px-2 py-0.5 rounded-lg border border-blue-200 dark:border-blue-800/40">
                                {worker.pump_label || "Genel Vardiya"}
                              </span>
                              <span>·</span>
                              <span className="flex items-center gap-1 font-bold text-slate-600 dark:text-slate-300">
                                <Car size={12} className="text-blue-500" />
                                {worker.total_vehicles} Araç
                              </span>
                            </div>
                          </div>
                        </div>

                        {/* İşçi Genel Rakamları */}
                        <div className="text-right shrink-0">
                          <div className="text-base font-black text-purple-600 dark:text-purple-400">
                            {formatCurrency(worker.total_revenue)}
                          </div>
                          <div className="text-xs font-mono font-bold text-emerald-600 dark:text-emerald-400">
                            {formatNumber(worker.total_liters, 2)} L
                          </div>
                        </div>
                      </div>

                      {/* Yakıt Detay Tablosu */}
                      {worker.fuel_breakdown.length > 0 ? (
                        <div className="overflow-x-auto bg-white dark:bg-[#0b1329] rounded-xl border border-slate-200/60 dark:border-slate-700/50 p-2">
                          <table className="w-full text-xs">
                            <thead>
                              <tr className="text-[10px] font-black text-slate-400 uppercase tracking-wider border-b border-slate-100 dark:border-slate-800/80">
                                <th className="text-left py-2 px-3">Yakıt Türü</th>
                                <th className="text-right py-2 px-3">Verilen Litre</th>
                                <th className="text-right py-2 px-3">Satış Tutarı</th>
                                <th className="text-right py-2 px-3">Araç Sayısı</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100 dark:divide-slate-800/50">
                              {worker.fuel_breakdown.map((fb) => (
                                <tr key={fb.fuel_type} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/30">
                                  <td className="py-2.5 px-3">
                                    <span
                                      className={`inline-block font-extrabold px-2 py-0.5 rounded-lg border text-[11px] ${fuelBadgeColor(
                                        fb.fuel_type
                                      )}`}
                                    >
                                      {fb.fuel_type}
                                    </span>
                                  </td>
                                  <td className="py-2.5 px-3 text-right font-mono font-bold text-slate-700 dark:text-slate-300">
                                    {formatNumber(fb.liters, 2)} L
                                  </td>
                                  <td className="py-2.5 px-3 text-right font-bold text-purple-600 dark:text-purple-400">
                                    {formatCurrency(fb.revenue)}
                                  </td>
                                  <td className="py-2.5 px-3 text-right">
                                    <span className="inline-flex items-center gap-1 font-bold text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/30 px-2 py-0.5 rounded-lg">
                                      <Car size={11} />
                                      {fb.vehicle_count}
                                    </span>
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      ) : (
                        <div className="p-3 text-center text-slate-400 text-xs bg-white dark:bg-slate-900/40 rounded-xl">
                          Henüz bu vardiyada satış kaydı bulunmuyor.
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* ── YENİ İSTASYON MODAL (Admin) ── */}
      {isStationModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white dark:bg-[#0f172a] border border-slate-200 dark:border-slate-700 rounded-3xl w-full max-w-md shadow-2xl overflow-hidden">
            <div className="flex items-center justify-between p-5 border-b border-slate-100 dark:border-slate-800">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-xl bg-amber-500 text-white flex items-center justify-center">
                  <Building2 size={16} />
                </div>
                <h3 className="font-black text-lg text-slate-900 dark:text-white">Yeni İstasyon</h3>
              </div>
              <button
                onClick={() => setIsStationModalOpen(false)}
                className="w-8 h-8 rounded-xl bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-slate-500 hover:text-slate-800 transition"
              >
                <X size={15} />
              </button>
            </div>
            <form onSubmit={handleCreateStation} className="p-5 space-y-3">
              {stModalError && (
                <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-red-600 text-xs flex items-center gap-2">
                  <AlertCircle size={13} />
                  {stModalError}
                </div>
              )}
              <div>
                <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 mb-1">
                  İstasyon Adı *
                </label>
                <input
                  type="text"
                  required
                  value={stName}
                  onChange={(e) => setStName(e.target.value)}
                  placeholder="Örn: İzmir Bornova İstasyonu"
                  className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl px-3.5 py-2.5 text-sm text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-amber-500 transition"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 mb-1">
                  İstasyon Kodu *
                </label>
                <input
                  type="text"
                  required
                  value={stCode}
                  onChange={(e) => setStCode(e.target.value)}
                  placeholder="IST-002"
                  className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl px-3.5 py-2.5 text-sm text-slate-800 dark:text-slate-200 uppercase font-mono focus:outline-none focus:ring-2 focus:ring-amber-500 transition"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 mb-1">
                    Şehir *
                  </label>
                  <input
                    type="text"
                    required
                    value={stCity}
                    onChange={(e) => setStCity(e.target.value)}
                    placeholder="İzmir"
                    className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl px-3.5 py-2.5 text-sm text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-amber-500 transition"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 mb-1">
                    İlçe
                  </label>
                  <input
                    type="text"
                    value={stDistrict}
                    onChange={(e) => setStDistrict(e.target.value)}
                    placeholder="Bornova"
                    className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl px-3.5 py-2.5 text-sm text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-amber-500 transition"
                  />
                </div>
              </div>
              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setIsStationModalOpen(false)}
                  className="flex-1 py-2.5 rounded-2xl border border-slate-200 dark:border-slate-700 text-slate-500 text-sm font-bold"
                >
                  Vazgeç
                </button>
                <button
                  type="submit"
                  disabled={stModalLoading}
                  className="flex-1 py-2.5 rounded-2xl bg-amber-500 hover:bg-amber-600 text-slate-950 font-black text-sm flex items-center justify-center gap-2 shadow-md transition"
                >
                  {stModalLoading ? <Loader2 size={14} className="animate-spin" /> : null}
                  Kaydet
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── YENİ POMPA MODAL ── */}
      {isPumpModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white dark:bg-[#0f172a] border border-slate-200 dark:border-slate-700 rounded-3xl w-full max-w-sm shadow-2xl overflow-hidden">
            <div className="flex items-center justify-between p-5 border-b border-slate-100 dark:border-slate-800">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-xl bg-blue-600 text-white flex items-center justify-center">
                  <Cpu size={16} />
                </div>
                <h3 className="font-black text-lg text-slate-900 dark:text-white">Pompa Ekle</h3>
              </div>
              <button
                onClick={() => setIsPumpModalOpen(false)}
                className="w-8 h-8 rounded-xl bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-slate-500 hover:text-slate-800 transition"
              >
                <X size={15} />
              </button>
            </div>
            <form onSubmit={handleCreatePump} className="p-5 space-y-3">
              {pumpModalError && (
                <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-red-600 text-xs flex items-center gap-2">
                  <AlertCircle size={13} />
                  {pumpModalError}
                </div>
              )}
              <div>
                <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 mb-1">
                  Pompa Numarası
                </label>
                <input
                  type="number"
                  min={1}
                  required
                  value={pumpNumber}
                  onChange={(e) => setPumpNumber(parseInt(e.target.value) || 1)}
                  className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl px-3.5 py-2.5 text-sm text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500 transition"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 mb-1">
                  Pompa Etiketi *
                </label>
                <input
                  type="text"
                  required
                  value={pumpLabel}
                  onChange={(e) => setPumpLabel(e.target.value)}
                  placeholder="Örn: Pompa 1"
                  className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl px-3.5 py-2.5 text-sm text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500 transition"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 mb-1">
                  Desteklenen Yakıt Türleri (virgülle ayırın)
                </label>
                <input
                  type="text"
                  value={pumpFuelTypes}
                  onChange={(e) => setPumpFuelTypes(e.target.value)}
                  placeholder="Motorin,Benzin,LPG"
                  className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl px-3.5 py-2.5 text-sm text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500 transition"
                />
              </div>
              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setIsPumpModalOpen(false)}
                  className="flex-1 py-2.5 rounded-2xl border border-slate-200 dark:border-slate-700 text-slate-500 text-sm font-bold"
                >
                  Vazgeç
                </button>
                <button
                  type="submit"
                  disabled={pumpModalLoading}
                  className="flex-1 py-2.5 rounded-2xl bg-blue-600 hover:bg-blue-700 text-white font-black text-sm flex items-center justify-center gap-2 shadow-md transition"
                >
                  {pumpModalLoading ? <Loader2 size={14} className="animate-spin" /> : null}
                  Ekle
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
