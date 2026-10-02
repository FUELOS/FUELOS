/**
 * FuelOS — İstasyon Detay Sayfası
 * İşçi bazlı, yakıt türü bazlı satış ve araç sayısı tablosu.
 * SuperAdmin: tüm istasyonları listeler + seçince detay gösterir.
 * Müdür: kendi istasyonunun detayını gösterir.
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

const WorkerAvatar: React.FC<{ avatar: string | null; name: string; size?: "sm" | "lg" }> = ({ avatar, name, size = "sm" }) => {
  const dim = size === "lg" ? "w-16 h-16" : "w-10 h-10";
  const textSize = size === "lg" ? "text-3xl" : "text-xl";

  if (!avatar) {
    return (
      <div className={`${dim} rounded-2xl bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 flex items-center justify-center shrink-0`}>
        <UserCircle className="text-slate-400" size={size === "lg" ? 32 : 20} />
      </div>
    );
  }
  if (avatar.startsWith("data:image")) {
    return <img src={avatar} alt={name} className={`${dim} rounded-2xl object-cover border border-slate-200 dark:border-slate-700 shrink-0`} />;
  }
  const emoji = MALE_AVATARS[avatar] || FEMALE_AVATARS[avatar] || null;
  if (emoji) {
    return (
      <div className={`${dim} rounded-2xl bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800/40 flex items-center justify-center shrink-0`}>
        <span className={textSize}>{emoji}</span>
      </div>
    );
  }
  return (
    <div className={`${dim} rounded-2xl bg-slate-100 dark:bg-slate-800 flex items-center justify-center shrink-0`}>
      <UserCircle className="text-slate-400" size={size === "lg" ? 32 : 20} />
    </div>
  );
};

const fuelColor = (ft: string) => {
  if (ft.toLowerCase().includes("benzin")) return "bg-emerald-500";
  if (ft.toLowerCase().includes("motorin") || ft.toLowerCase().includes("dizel")) return "bg-amber-500";
  if (ft.toLowerCase().includes("lpg")) return "bg-red-500";
  return "bg-blue-500";
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
  const [pumpFuelTypes, setPumpFuelTypes] = useState("Motorin,Benzin");
  const [pumpModalLoading, setPumpModalLoading] = useState(false);
  const [pumpModalError, setPumpModalError] = useState<string | null>(null);

  // ── Fetch istasyonlar ─────────────────────────────────────────────
  const fetchStations = useCallback(async () => {
    try {
      setRefreshing(true);
      const res = await apiClient.get<Station[]>("/stations");
      setStations(res.data);
      // Müdür için otomatik kendi istasyonunu seç
      if (!isAdmin && user?.station_id && res.data.length > 0) {
        const mine = res.data.find((s) => s.id === user.station_id);
        if (mine) setSelectedStation(mine);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoadingList(false);
      setRefreshing(false);
    }
  }, [isAdmin, user]);

  useEffect(() => { fetchStations(); }, [fetchStations]);

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
    else { setDetailData(null); setPumps([]); }
  }, [selectedStation, fetchDetail]);

  // ── İstasyon oluştur ──────────────────────────────────────────────
  const handleCreateStation = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setStModalLoading(true);
      setStModalError(null);
      await apiClient.post("/stations", { name: stName.trim(), code: stCode.trim().toUpperCase(), city: stCity.trim(), district: stDistrict.trim() || null, address: stAddress.trim() || null });
      setIsStationModalOpen(false);
      setStName(""); setStCode(""); setStCity(""); setStDistrict(""); setStAddress("");
      fetchStations();
    } catch (err: any) {
      setStModalError(err.response?.data?.detail || "Hata");
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
      await apiClient.post("/pumps/", { station_id: selectedStation.id, pump_number: pumpNumber, label: pumpLabel.trim(), fuel_types: pumpFuelTypes.trim() });
      setIsPumpModalOpen(false);
      setPumpLabel(""); setPumpNumber(pumps.length + 2);
      fetchDetail(selectedStation.id);
    } catch (err: any) {
      setPumpModalError(err.response?.data?.detail || "Hata");
    } finally {
      setPumpModalLoading(false);
    }
  };

  // ── Render ────────────────────────────────────────────────────────

  if (loadingList) {
    return (
      <div className="flex justify-center p-16 text-slate-400">
        <Loader2 size={36} className="animate-spin text-blue-600" />
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* ── BAŞLIK ── */}
      <div className="bg-white dark:bg-[#0f172a] rounded-3xl p-5 shadow-sm border border-slate-100 dark:border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-2xl bg-amber-500 flex items-center justify-center shadow-lg shadow-amber-500/30">
            <Building2 size={20} className="text-white" />
          </div>
          <div>
            <h1 className="text-xl font-black text-slate-900 dark:text-white">
              {selectedStation ? selectedStation.name : "İstasyonlar"}
            </h1>
            <p className="text-xs text-slate-400 mt-0.5">
              {selectedStation
                ? `${selectedStation.city} · Kod: ${selectedStation.code}`
                : "İstasyon seçin veya yeni ekleyin"}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2.5">
          {selectedStation && (
            <button onClick={() => fetchDetail(selectedStation.id)} disabled={refreshing} className="p-2 rounded-2xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-500 hover:text-blue-600 transition">
              <RefreshCw size={15} className={loadingDetail ? "animate-spin text-blue-600" : ""} />
            </button>
          )}
          {selectedStation && (
            <button onClick={() => { setPumpNumber(pumps.length + 1); setIsPumpModalOpen(true); }} className="px-3.5 py-2 rounded-2xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-black flex items-center gap-1.5 shadow-md shadow-blue-600/30 transition active:scale-95">
              <Cpu size={13} />
              Pompa Ekle
            </button>
          )}
          {isAdmin && (
            <button onClick={() => setIsStationModalOpen(true)} className="px-3.5 py-2 rounded-2xl bg-amber-500 hover:bg-amber-600 text-white text-xs font-black flex items-center gap-1.5 shadow-md shadow-amber-500/30 transition active:scale-95">
              <Plus size={13} />
              Yeni İstasyon
            </button>
          )}
        </div>
      </div>

      <div className={`grid gap-5 ${isAdmin && !selectedStation ? "grid-cols-1" : "grid-cols-1 lg:grid-cols-4"}`}>
        {/* ── İSTASYON LİSTESİ (Admin için sol panel) ── */}
        {isAdmin && (
          <div className="lg:col-span-1 space-y-2">
            <div className="text-[10px] font-black text-slate-400 uppercase tracking-widest px-1">İstasyonlar</div>
            {stations.length === 0 ? (
              <div className="p-4 bg-white dark:bg-[#0f172a] rounded-2xl border border-slate-100 dark:border-slate-800 text-xs text-slate-400 text-center">
                Henüz istasyon yok
              </div>
            ) : (
              stations.map((st) => (
                <button
                  key={st.id}
                  onClick={() => setSelectedStation(st)}
                  className={`w-full text-left p-4 rounded-2xl border transition flex items-center justify-between gap-2 ${
                    selectedStation?.id === st.id
                      ? "bg-blue-50 dark:bg-blue-900/20 border-blue-300 dark:border-blue-700"
                      : "bg-white dark:bg-[#0f172a] border-slate-100 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-600"
                  }`}
                >
                  <div>
                    <div className={`text-sm font-black ${selectedStation?.id === st.id ? "text-blue-700 dark:text-blue-300" : "text-slate-800 dark:text-white"}`}>{st.name}</div>
                    <div className="flex items-center gap-1.5 mt-0.5">
                      <MapPin size={10} className="text-slate-400" />
                      <span className="text-[10px] text-slate-400">{st.city}</span>
                      <span className="text-[10px] font-mono text-amber-600 dark:text-amber-400">{st.code}</span>
                    </div>
                  </div>
                  <ChevronRight size={14} className={selectedStation?.id === st.id ? "text-blue-500" : "text-slate-300"} />
                </button>
              ))
            )}
          </div>
        )}

        {/* ── İSTASYON DETAY ── */}
        <div className={isAdmin ? "lg:col-span-3 space-y-5" : "space-y-5"}>
          {!selectedStation ? (
            <div className="bg-white dark:bg-[#0f172a] rounded-3xl p-12 text-center border border-slate-100 dark:border-slate-800 space-y-3">
              <Building2 size={36} className="text-slate-300 dark:text-slate-700 mx-auto" />
              <div className="text-base font-black text-slate-400">Bir istasyon seçin</div>
              <p className="text-xs text-slate-400">Soldan bir istasyon seçerek işçi ve pompa detaylarını görüntüleyin.</p>
            </div>
          ) : loadingDetail ? (
            <div className="flex justify-center p-16"><Loader2 size={30} className="animate-spin text-blue-600" /></div>
          ) : error ? (
            <div className="p-4 bg-red-50 border border-red-200 rounded-2xl text-red-600 text-xs font-semibold flex items-center gap-2">
              <AlertCircle size={15} />
              {error}
            </div>
          ) : (
            <>
              {/* Genel Toplamlar */}
              {detailData && (
                <div className="grid grid-cols-3 gap-4">
                  {[
                    { label: "Toplam Satış", value: formatCurrency(detailData.grand_total_revenue), icon: TrendingUp, color: "text-purple-600 dark:text-purple-400", bg: "bg-purple-50 dark:bg-purple-950/20", border: "border-purple-100 dark:border-purple-800/40" },
                    { label: "Toplam Litre", value: `${formatNumber(detailData.grand_total_liters, 2)} L`, icon: Droplet, color: "text-emerald-600 dark:text-emerald-400", bg: "bg-emerald-50 dark:bg-emerald-950/20", border: "border-emerald-100 dark:border-emerald-800/40" },
                    { label: "Toplam Araç", value: detailData.grand_total_vehicles.toString(), icon: Car, color: "text-blue-600 dark:text-blue-400", bg: "bg-blue-50 dark:bg-blue-950/20", border: "border-blue-100 dark:border-blue-800/40" },
                  ].map(({ label, value, icon: Icon, color, bg, border }) => (
                    <div key={label} className={`${bg} ${border} border rounded-3xl p-4`}>
                      <Icon size={18} className={color} />
                      <div className={`text-xl font-black ${color} mt-2`}>{value}</div>
                      <div className="text-xs font-semibold text-slate-500 dark:text-slate-400 mt-0.5">{label}</div>
                    </div>
                  ))}
                </div>
              )}

              {/* Pompalar */}
              {pumps.length > 0 && (
                <div className="bg-white dark:bg-[#0f172a] rounded-3xl p-5 border border-slate-100 dark:border-slate-800 shadow-sm">
                  <div className="flex items-center gap-2 mb-4">
                    <Cpu size={16} className="text-blue-600" />
                    <span className="text-sm font-black text-slate-900 dark:text-white">Pompalar</span>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {pumps.map((pump) => (
                      <div key={pump.id} className="px-3.5 py-2 rounded-2xl bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800/40 text-xs font-bold text-blue-700 dark:text-blue-300">
                        <div>{pump.label}</div>
                        <div className="text-[10px] text-blue-500 dark:text-blue-500 font-normal">{pump.fuel_types}</div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* İşçi Kartları */}
              <div className="bg-white dark:bg-[#0f172a] rounded-3xl border border-slate-100 dark:border-slate-800 shadow-sm overflow-hidden">
                <div className="p-5 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Users size={16} className="text-blue-600" />
                    <span className="text-sm font-black text-slate-900 dark:text-white">İşçi Bazlı Satış</span>
                  </div>
                  <span className="text-xs text-slate-400">{detailData?.workers.length ?? 0} aktif vardiya</span>
                </div>

                {!detailData?.workers.length ? (
                  <div className="p-10 text-center">
                    <AlertTriangle size={28} className="text-slate-300 dark:text-slate-700 mx-auto mb-3" />
                    <div className="text-sm font-bold text-slate-400">Bu istasyonda açık vardiya bulunmuyor.</div>
                    <p className="text-xs text-slate-400 mt-1">Vardiya açmak için dashboard'a gidin.</p>
                  </div>
                ) : (
                  <div className="divide-y divide-slate-100 dark:divide-slate-800">
                    {detailData!.workers.map((worker) => (
                      <div key={worker.shift_id} className="p-5 space-y-4">
                        {/* İşçi Başlık */}
                        <div className="flex items-center gap-3">
                          <WorkerAvatar avatar={worker.worker_avatar} name={worker.worker_name} />
                          <div>
                            <div className="text-sm font-black text-slate-900 dark:text-white">{worker.worker_name}</div>
                            <div className="text-xs text-slate-400">
                              {worker.pump_label || "Genel Vardiya"} · <span className="text-blue-600 dark:text-blue-400 font-bold">{worker.total_vehicles} araç</span>
                            </div>
                          </div>
                          {/* Sağ özet */}
                          <div className="ml-auto text-right">
                            <div className="text-base font-black text-purple-600 dark:text-purple-400">{formatCurrency(worker.total_revenue)}</div>
                            <div className="text-xs text-slate-400">{formatNumber(worker.total_liters, 2)} L</div>
                          </div>
                        </div>

                        {/* Yakıt Türü Detay Tablosu */}
                        {worker.fuel_breakdown.length > 0 && (
                          <div className="overflow-x-auto">
                            <table className="w-full text-xs">
                              <thead>
                                <tr className="text-[10px] font-black text-slate-400 uppercase tracking-wider border-b border-slate-100 dark:border-slate-800">
                                  <th className="text-left py-2 pr-4">Yakıt</th>
                                  <th className="text-right px-3">Litre</th>
                                  <th className="text-right px-3">Satış</th>
                                  <th className="text-right pl-3">Araç</th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-slate-50 dark:divide-slate-800/60">
                                {worker.fuel_breakdown.map((fb) => (
                                  <tr key={fb.fuel_type} className="font-medium">
                                    <td className="py-2.5 pr-4">
                                      <div className="flex items-center gap-2">
                                        <div className={`w-2 h-2 rounded-full ${fuelColor(fb.fuel_type)}`} />
                                        <span className="text-slate-800 dark:text-slate-200 font-bold">{fb.fuel_type}</span>
                                      </div>
                                    </td>
                                    <td className="py-2.5 px-3 text-right font-mono text-slate-600 dark:text-slate-400">
                                      {formatNumber(fb.liters, 2)} L
                                    </td>
                                    <td className="py-2.5 px-3 text-right font-mono text-slate-700 dark:text-slate-300">
                                      {formatCurrency(fb.revenue)}
                                    </td>
                                    <td className="py-2.5 pl-3 text-right">
                                      <span className="flex items-center justify-end gap-1 font-bold text-blue-600 dark:text-blue-400">
                                        <Car size={10} />
                                        {fb.vehicle_count}
                                      </span>
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                              <tfoot>
                                <tr className="border-t-2 border-slate-200 dark:border-slate-700 font-black text-slate-900 dark:text-white">
                                  <td className="pt-2.5 pr-4 text-[10px] uppercase text-slate-400">Toplam</td>
                                  <td className="pt-2.5 px-3 text-right font-mono">{formatNumber(worker.total_liters, 2)} L</td>
                                  <td className="pt-2.5 px-3 text-right text-purple-600 dark:text-purple-400">{formatCurrency(worker.total_revenue)}</td>
                                  <td className="pt-2.5 pl-3 text-right text-blue-600 dark:text-blue-400">{worker.total_vehicles}</td>
                                </tr>
                              </tfoot>
                            </table>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      </div>

      {/* ── YENİ İSTASYON MODAL ── */}
      {isStationModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white dark:bg-[#0f172a] border border-slate-200 dark:border-slate-700 rounded-3xl w-full max-w-md shadow-2xl">
            <div className="flex items-center justify-between p-5 border-b border-slate-100 dark:border-slate-800">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-xl bg-amber-500 text-white flex items-center justify-center"><Building2 size={16} /></div>
                <h3 className="font-black text-lg text-slate-900 dark:text-white">Yeni İstasyon</h3>
              </div>
              <button onClick={() => setIsStationModalOpen(false)} className="w-8 h-8 rounded-xl bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-slate-500 hover:text-slate-800 transition"><X size={15} /></button>
            </div>
            <form onSubmit={handleCreateStation} className="p-5 space-y-3">
              {stModalError && <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-red-600 text-xs flex items-center gap-2"><AlertCircle size={13} />{stModalError}</div>}
              {[["İstasyon Adı *", stName, setStName, "Örn: Ankara Merkez", true], ["İstasyon Kodu *", stCode, setStCode, "IST-001", true], ["Şehir *", stCity, setStCity, "Ankara", true], ["İlçe", stDistrict, setStDistrict, "Çankaya", false]].map(([label, val, set, placeholder, req]: any) => (
                <div key={label as string}>
                  <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 mb-1">{label as string}</label>
                  <input type="text" required={req as boolean} value={val as string} onChange={(e) => (set as any)(e.target.value)} placeholder={placeholder as string} className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl px-3.5 py-2.5 text-sm text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-amber-500 transition" />
                </div>
              ))}
              <div className="flex gap-3 pt-2">
                <button type="button" onClick={() => setIsStationModalOpen(false)} className="flex-1 py-2.5 rounded-2xl border border-slate-200 dark:border-slate-700 text-slate-500 text-sm font-bold">Vazgeç</button>
                <button type="submit" disabled={stModalLoading} className="flex-1 py-2.5 rounded-2xl bg-amber-500 hover:bg-amber-600 text-white font-black text-sm flex items-center justify-center gap-2 shadow-md transition">
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
          <div className="bg-white dark:bg-[#0f172a] border border-slate-200 dark:border-slate-700 rounded-3xl w-full max-w-sm shadow-2xl">
            <div className="flex items-center justify-between p-5 border-b border-slate-100 dark:border-slate-800">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-xl bg-blue-600 text-white flex items-center justify-center"><Cpu size={16} /></div>
                <h3 className="font-black text-lg text-slate-900 dark:text-white">Pompa Ekle</h3>
              </div>
              <button onClick={() => setIsPumpModalOpen(false)} className="w-8 h-8 rounded-xl bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-slate-500 hover:text-slate-800 transition"><X size={15} /></button>
            </div>
            <form onSubmit={handleCreatePump} className="p-5 space-y-3">
              {pumpModalError && <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-red-600 text-xs flex items-center gap-2"><AlertCircle size={13} />{pumpModalError}</div>}
              <div>
                <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 mb-1">Pompa Numarası</label>
                <input type="number" min={1} required value={pumpNumber} onChange={(e) => setPumpNumber(parseInt(e.target.value))} className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl px-3.5 py-2.5 text-sm text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500 transition" />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 mb-1">Pompa Etiketi *</label>
                <input type="text" required value={pumpLabel} onChange={(e) => setPumpLabel(e.target.value)} placeholder="Örn: Pompa 1" className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl px-3.5 py-2.5 text-sm text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500 transition" />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 mb-1">Yakıt Türleri (virgülle ayır)</label>
                <input type="text" value={pumpFuelTypes} onChange={(e) => setPumpFuelTypes(e.target.value)} placeholder="Motorin,Benzin,LPG" className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl px-3.5 py-2.5 text-sm text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500 transition" />
              </div>
              <div className="flex gap-3 pt-2">
                <button type="button" onClick={() => setIsPumpModalOpen(false)} className="flex-1 py-2.5 rounded-2xl border border-slate-200 dark:border-slate-700 text-slate-500 text-sm font-bold">Vazgeç</button>
                <button type="submit" disabled={pumpModalLoading} className="flex-1 py-2.5 rounded-2xl bg-blue-600 hover:bg-blue-700 text-white font-black text-sm flex items-center justify-center gap-2 shadow-md transition">
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
