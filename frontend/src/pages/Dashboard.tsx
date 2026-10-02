import React, { useState, useEffect, useCallback } from "react";
import { apiClient } from "@/lib/api";
import { DashboardResponse, Station, WorkerShiftStats } from "@/types";
import { formatCurrency, formatNumber } from "@/lib/utils";
import { useLanguage } from "@/context/LanguageContext";
import { OpenShiftModal } from "@/components/modals/OpenShiftModal";
import { CloseShiftModal } from "@/components/modals/CloseShiftModal";
import { AddTransactionModal } from "@/components/modals/AddTransactionModal";
import { POSSimulatorModal } from "@/components/modals/POSSimulatorModal";
import { QRSimulatorModal } from "@/components/modals/QRSimulatorModal";
import {
  Calendar,
  Clock,
  MapPin,
  Droplet,
  Banknote,
  CreditCard,
  ArrowRightLeft,
  CheckCircle2,
  BarChart2,
  RefreshCw,
  PlusCircle,
  Play,
  AlertCircle,
  Loader2,
  Layers,
  Info,
} from "lucide-react";

export const Dashboard: React.FC = () => {
  const { t, language } = useLanguage();
  const [data, setData] = useState<DashboardResponse | null>(null);
  const [stations, setStations] = useState<Station[]>([]);
  const [selectedStationId, setSelectedStationId] = useState<string>("");
  const [loading, setLoading] = useState<boolean>(true);
  const [refreshing, setRefreshing] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  // Görsel 2: Ürün Bazlı Detayı Aç/Kapat Toggle State
  const [showProductBreakdown, setShowProductBreakdown] = useState<boolean>(true);

  // Modals state
  const [isOpenShiftOpen, setIsOpenShiftOpen] = useState<boolean>(false);
  const [isCloseShiftOpen, setIsCloseShiftOpen] = useState<boolean>(false);
  const [isAddTxOpen, setIsAddTxOpen] = useState<boolean>(false);
  const [isPOSOpen, setIsPOSOpen] = useState<boolean>(false);
  const [isQROpen, setIsQROpen] = useState<boolean>(false);
  const [targetShift, setTargetShift] = useState<{
    shift_id: string;
    station_name: string;
    user_name: string;
  } | null>(null);

  const fetchStations = async () => {
    try {
      const res = await apiClient.get<Station[]>("/stations");
      setStations(res.data);
    } catch (err) {
      console.error("İstasyonlar alınamadı", err);
    }
  };

  const fetchDashboardData = useCallback(async () => {
    try {
      setRefreshing(true);
      setError(null);
      const url = selectedStationId
        ? `/dashboard?station_id=${selectedStationId}`
        : "/dashboard";
      const res = await apiClient.get<DashboardResponse>(url);
      setData(res.data);
    } catch (err: any) {
      const msg = err.response?.data?.detail || "Dashboard verileri alınamadı";
      setError(msg);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [selectedStationId]);

  useEffect(() => {
    fetchStations();
  }, []);

  useEffect(() => {
    fetchDashboardData();
  }, [fetchDashboardData]);

  const handleOpenCloseModal = (worker: WorkerShiftStats) => {
    setTargetShift({
      shift_id: worker.shift_id,
      station_name: worker.station_name,
      user_name: worker.user_name,
    });
    setIsCloseShiftOpen(true);
  };

  const handleOpenAddTxModal = (shiftId?: string) => {
    if (shiftId && data) {
      const found = data.active_workers.find((w) => w.shift_id === shiftId);
      if (found) {
        setTargetShift({
          shift_id: found.shift_id,
          station_name: found.station_name,
          user_name: found.user_name,
        });
      }
    } else {
      setTargetShift(null);
    }
    setIsAddTxOpen(true);
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-3 text-slate-500">
        <Loader2 size={36} className="animate-spin text-blue-600" />
        <span className="text-sm font-semibold tracking-wide">
          {language === "tr" ? "Vardiya mutabakatı yükleniyor..." : "Loading shift reconciliation..."}
        </span>
      </div>
    );
  }

  // ── Avatar yardımcı fonksiyonu ──
  const MALE_EMOJI: Record<string, string> = { m1: "👨", m2: "👨‍🦱", m3: "👨‍🦳", m4: "🧔" };
  const FEMALE_EMOJI: Record<string, string> = { f1: "👩", f2: "👩‍🦱", f3: "👩‍🦳", f4: "👩‍🦰" };

  const WorkerAvatar: React.FC<{ avatar: string | null | undefined; name: string }> = ({ avatar, name }) => {
    // base64 fotoğraf
    if (avatar && avatar.startsWith("data:image")) {
      return <img src={avatar} alt={name} className="w-full h-full object-cover" />;
    }
    // emoji avatar kodu
    const emoji = avatar ? (MALE_EMOJI[avatar] || FEMALE_EMOJI[avatar]) : null;
    if (emoji) {
      return (
        <div className="w-full h-full flex items-center justify-center bg-blue-50 dark:bg-blue-900/20">
          <span className="text-5xl">{emoji}</span>
        </div>
      );
    }
    // Fallback: renkli initial
    const initials = name ? name.split(" ").map(n => n[0]).join("").slice(0, 2).toUpperCase() : "?";
    const colors = ["bg-blue-500", "bg-emerald-500", "bg-purple-500", "bg-amber-500", "bg-rose-500"];
    const colorIdx = name ? name.charCodeAt(0) % colors.length : 0;
    return (
      <div className={`w-full h-full flex items-center justify-center ${colors[colorIdx]}`}>
        <span className="text-2xl font-black text-white">{initials}</span>
      </div>
    );
  };

  return (
    <div className="space-y-6">
      {/* ── 1. ÜST BAŞLIK VE OPERASYON BAR (Görsel 1 & 2) ── */}
      <div className="bg-white dark:bg-[#0f172a] rounded-3xl p-5 sm:p-6 shadow-sm border border-slate-100 dark:border-slate-800 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl sm:text-3xl font-black tracking-tight text-slate-900 dark:text-white flex items-center gap-2">
              <span className="text-slate-900 dark:text-white">Fuel</span>
              <span className="text-blue-600">OS</span>
              <span className="font-bold text-slate-800 dark:text-slate-200 ml-1.5">{t("header.title")}</span>
            </h1>
          </div>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 font-medium">
            {t("header.subtitle")}
          </p>
        </div>

        {/* Sağ Üst Meta Rozetleri ve Aksiyon Butonları */}
        <div className="flex flex-wrap items-center gap-2.5 sm:gap-3 text-xs font-semibold text-slate-600 dark:text-slate-300">
          {/* Tarih Rozeti */}
          <div className="flex items-center gap-1.5 px-3 py-2 rounded-2xl bg-slate-50 dark:bg-slate-800/80 border border-slate-200/80 dark:border-slate-700">
            <Calendar size={14} className="text-blue-600" />
            <span>{data?.current_date_str || "27 Eylül 2026"}</span>
          </div>

          {/* Saat Aralığı Rozeti */}
          <div className="flex items-center gap-1.5 px-3 py-2 rounded-2xl bg-slate-50 dark:bg-slate-800/80 border border-slate-200/80 dark:border-slate-700">
            <Clock size={14} className="text-blue-600" />
            <span>{data?.shift_time_range || "06:00 - 14:00"}</span>
          </div>

          {/* İstasyon Seçici */}
          <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-2xl bg-slate-50 dark:bg-slate-800/80 border border-slate-200/80 dark:border-slate-700">
            <MapPin size={14} className="text-blue-600 shrink-0" />
            <select
              value={selectedStationId}
              onChange={(e) => setSelectedStationId(e.target.value)}
              className="bg-transparent font-bold text-xs text-slate-700 dark:text-slate-200 focus:outline-none cursor-pointer"
            >
              <option value="" className="bg-white dark:bg-slate-900 text-slate-900 dark:text-white">
                {t("header.all_stations")} ({stations.length})
              </option>
              {stations.map((st) => (
                <option key={st.id} value={st.id} className="bg-white dark:bg-slate-900 text-slate-900 dark:text-white">
                  {st.name} [{st.code}]
                </option>
              ))}
            </select>
          </div>

          {/* Yenile */}
          <button
            onClick={() => fetchDashboardData()}
            disabled={refreshing}
            className="p-2 rounded-2xl bg-slate-50 dark:bg-slate-800 border border-slate-200/80 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-100 transition shadow-sm"
            title={t("header.refresh")}
          >
            <RefreshCw size={15} className={refreshing ? "animate-spin text-blue-600" : ""} />
          </button>

          {/* Yeni Vardiya Başlat */}
          <button
            onClick={() => setIsOpenShiftOpen(true)}
            className="px-3.5 py-2 rounded-2xl bg-blue-600 hover:bg-blue-700 text-white font-bold flex items-center gap-1.5 shadow-md shadow-blue-600/30 transition active:scale-95"
          >
            <Play size={13} className="fill-white" />
            <span>{t("header.new_shift")}</span>
          </button>

          {/* Satış Ekle */}
          <button
            onClick={() => handleOpenAddTxModal()}
            className="px-3.5 py-2 rounded-2xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold flex items-center gap-1.5 shadow-md shadow-emerald-600/30 transition active:scale-95"
          >
            <PlusCircle size={14} />
            <span>{t("header.add_sale")}</span>
          </button>
        </div>
      </div>

      {error && (
        <div className="p-4 bg-red-50 border border-red-200 rounded-2xl text-red-600 text-xs font-semibold flex items-center gap-2.5">
          <AlertCircle size={16} />
          <span>{error}</span>
        </div>
      )}

      {/* ── 2. İŞÇİ BAZLI VARDİYA MUTABAKATI (Görsel 1: Çoklu İşçi Kartları) ── */}
      {data?.active_workers && data.active_workers.length > 0 ? (
        <div className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
            {data.active_workers.map((worker, index) => (
              <div
                key={worker.shift_id}
                className="bg-white dark:bg-[#0f172a] rounded-3xl p-5 shadow-sm border border-slate-100 dark:border-slate-800 flex gap-4 relative group hover:shadow-md transition"
              >
                {/* İşçi Fotoğrafı / Avatarı */}
                <div className="w-24 sm:w-28 h-32 sm:h-36 rounded-2xl overflow-hidden shrink-0 bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 relative">
                  <WorkerAvatar avatar={worker.avatar_url} name={worker.user_name} />
                  <div className="absolute bottom-1 right-1 w-3 h-3 rounded-full bg-emerald-500 border-2 border-white dark:border-slate-900" />
                </div>

                {/* İşçi Satış Rakamları */}
                <div className="flex-1 flex flex-col justify-between py-0.5">
                  <div>
                    <div className="flex items-start justify-between">
                      <div>
                        <div className="text-xs font-extrabold text-blue-600 dark:text-blue-400">
                          {t("worker.title")} {index + 1}
                        </div>
                        <div className="text-base font-black text-slate-800 dark:text-white leading-tight">
                          {worker.user_name}
                        </div>
                      </div>
                      <button
                        onClick={() => handleOpenCloseModal(worker)}
                        className="px-2 py-1 rounded-xl bg-rose-50 dark:bg-rose-500/10 text-rose-600 dark:text-rose-400 border border-rose-200 dark:border-rose-500/20 text-[10px] font-black hover:bg-rose-100 transition"
                        title={t("header.close_shift")}
                      >
                        {language === "tr" ? "Kapat" : "Close"}
                      </button>
                    </div>

                    {/* Metrikler (Litre, Nakit, POS, FAST) */}
                    <div className="space-y-1.5 mt-3 text-xs">
                      {/* Satılan Litre */}
                      <div className="flex items-center justify-between">
                        <span className="text-slate-500 dark:text-slate-400 flex items-center gap-1.5">
                          <Droplet size={13} className="text-emerald-500 fill-emerald-500/20" />
                          <span>{t("worker.liters")}</span>
                        </span>
                        <span className="font-extrabold text-slate-900 dark:text-white">
                          {formatNumber(worker.dispensed_liters, 2)} L
                        </span>
                      </div>

                      {/* Nakit Satış */}
                      <div className="flex items-center justify-between">
                        <span className="text-slate-500 dark:text-slate-400 flex items-center gap-1.5">
                          <Banknote size={13} className="text-emerald-600" />
                          <span>{t("worker.cash")}</span>
                        </span>
                        <span className="font-extrabold text-slate-900 dark:text-white">
                          {formatCurrency(worker.cash_sales)}
                        </span>
                      </div>

                      {/* POS Satış */}
                      <div className="flex items-center justify-between">
                        <span className="text-slate-500 dark:text-slate-400 flex items-center gap-1.5">
                          <CreditCard size={13} className="text-blue-500" />
                          <span>{t("worker.pos")}</span>
                        </span>
                        <span className="font-extrabold text-slate-900 dark:text-white">
                          {formatCurrency(worker.pos_sales)}
                        </span>
                      </div>

                      {/* FAST Satış */}
                      <div className="flex items-center justify-between">
                        <span className="text-slate-500 dark:text-slate-400 flex items-center gap-1.5">
                          <ArrowRightLeft size={13} className="text-purple-500" />
                          <span>{t("worker.fast")}</span>
                        </span>
                        <span className="font-extrabold text-slate-900 dark:text-white">
                          {formatCurrency(worker.fast_sales)}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* POS + QR + Satış Fiş Butonları */}
                  <div className="grid grid-cols-3 gap-1.5 mt-3">
                    <button
                      onClick={() => {
                        setTargetShift({
                          shift_id: worker.shift_id,
                          station_name: worker.station_name,
                          user_name: worker.user_name,
                        });
                        setIsAddTxOpen(true);
                      }}
                      className="flex items-center justify-center gap-1 py-2 px-1 rounded-xl bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800 text-emerald-600 dark:text-emerald-400 text-[10px] font-black hover:bg-emerald-100 dark:hover:bg-emerald-900/40 transition active:scale-95"
                    >
                      <PlusCircle size={11} />
                      <span>Dolum / Fiş</span>
                    </button>
                    <button
                      onClick={() => {
                        setTargetShift({
                          shift_id: worker.shift_id,
                          station_name: worker.station_name,
                          user_name: worker.user_name,
                        });
                        setIsPOSOpen(true);
                      }}
                      className="flex items-center justify-center gap-1 py-2 px-1 rounded-xl bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 text-blue-600 dark:text-blue-400 text-[10px] font-black hover:bg-blue-100 dark:hover:bg-blue-900/40 transition active:scale-95"
                    >
                      <CreditCard size={11} />
                      <span>Sanal POS</span>
                    </button>
                    <button
                      onClick={() => {
                        setTargetShift({
                          shift_id: worker.shift_id,
                          station_name: worker.station_name,
                          user_name: worker.user_name,
                        });
                        setIsQROpen(true);
                      }}
                      className="flex items-center justify-center gap-1 py-2 px-1 rounded-xl bg-purple-50 dark:bg-purple-900/20 border border-purple-200 dark:border-purple-800 text-purple-600 dark:text-purple-400 text-[10px] font-black hover:bg-purple-100 dark:hover:bg-purple-900/40 transition active:scale-95"
                    >
                      <ArrowRightLeft size={11} />
                      <span>QR / FAST</span>
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* ── TOPLAM SATIŞLAR ŞERİDİ (Görsel 1: İşçilerin Birleşimi) ── */}
          <div className="bg-white dark:bg-[#0f172a] rounded-3xl p-5 shadow-sm border border-slate-100 dark:border-slate-800 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
            <div>
              <div className="text-base font-black text-slate-900 dark:text-white">{t("worker.total_label")}</div>
              <div className="text-xs text-slate-400 font-medium">
                {data.active_workers.length} {t("worker.total_sub")}
              </div>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 flex-1 lg:max-w-4xl">
              {/* Toplam Satılan Litre */}
              <div className="bg-emerald-50/70 dark:bg-emerald-950/20 border border-emerald-100 dark:border-emerald-800/40 rounded-2xl p-3.5 flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-emerald-100 dark:bg-emerald-900/50 text-emerald-600 flex items-center justify-center shrink-0">
                  <Droplet size={18} className="fill-emerald-600/30" />
                </div>
                <div>
                  <div className="text-[10px] uppercase font-bold text-emerald-700 dark:text-emerald-400">{t("summary.liters_total")}</div>
                  <div className="text-base font-black text-slate-900 dark:text-white mt-0.5">
                    {formatNumber(data.total_dispensed_liters, 2)} L
                  </div>
                </div>
              </div>

              {/* Toplam Nakit */}
              <div className="bg-emerald-50/70 dark:bg-emerald-950/20 border border-emerald-100 dark:border-emerald-800/40 rounded-2xl p-3.5 flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-emerald-100 dark:bg-emerald-900/50 text-emerald-600 flex items-center justify-center shrink-0">
                  <Banknote size={18} />
                </div>
                <div>
                  <div className="text-[10px] uppercase font-bold text-emerald-700 dark:text-emerald-400">{t("summary.cash_sales")}</div>
                  <div className="text-base font-black text-slate-900 dark:text-white mt-0.5">
                    {formatCurrency(data.total_cash_sales)}
                  </div>
                </div>
              </div>

              {/* Toplam POS */}
              <div className="bg-blue-50/70 dark:bg-blue-950/20 border border-blue-100 dark:border-blue-800/40 rounded-2xl p-3.5 flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-blue-100 dark:bg-blue-900/50 text-blue-600 flex items-center justify-center shrink-0">
                  <CreditCard size={18} />
                </div>
                <div>
                  <div className="text-[10px] uppercase font-bold text-blue-700 dark:text-blue-400">{t("summary.pos_sales")}</div>
                  <div className="text-base font-black text-slate-900 dark:text-white mt-0.5">
                    {formatCurrency(data.total_pos_sales)}
                  </div>
                </div>
              </div>

              {/* Toplam FAST */}
              <div className="bg-purple-50/70 dark:bg-purple-950/20 border border-purple-100 dark:border-purple-800/40 rounded-2xl p-3.5 flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-purple-100 dark:bg-purple-900/50 text-purple-600 flex items-center justify-center shrink-0">
                  <ArrowRightLeft size={18} />
                </div>
                <div>
                  <div className="text-[10px] uppercase font-bold text-purple-700 dark:text-purple-400">{t("summary.fast_sales")}</div>
                  <div className="text-base font-black text-slate-900 dark:text-white mt-0.5">
                    {formatCurrency(data.total_fast_sales)}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      ) : (
        /* Açık Vardiya Yoksa Bilgi Kartı */
        <div className="bg-white dark:bg-[#0f172a] rounded-3xl p-8 text-center border border-slate-100 dark:border-slate-800 space-y-3">
          <div className="w-14 h-14 rounded-2xl bg-blue-50 dark:bg-blue-900/20 text-blue-600 flex items-center justify-center mx-auto">
            <Clock size={28} />
          </div>
          <div className="text-lg font-black text-slate-800 dark:text-white">
            {language === "tr" ? "Şu Anda Açık Bir Vardiya Oturumu Bulunmuyor" : "No Active Shift Currently Open"}
          </div>
          <p className="text-xs text-slate-500 dark:text-slate-400 max-w-md mx-auto leading-relaxed">
            {language === "tr"
              ? "İşçi bazlı canlı mutabakatı ve pompa sayaçlarını başlatmak için yukarıdaki 'Yeni Vardiya Aç' butonunu kullanabilirsiniz."
              : "Use the 'Start New Shift' button above to initialize worker reconciliation and begin tracking live pump sales."}
          </p>
          <button
            onClick={() => setIsOpenShiftOpen(true)}
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-2xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold shadow-md shadow-blue-600/30 transition active:scale-95"
          >
            <Play size={13} className="fill-white" />
            <span>{t("header.new_shift")}</span>
          </button>
        </div>
      )}

      {/* ── 3. GENEL TOPLAM & MUTABAKAT FORMÜL ŞERİDİ (Görsel 1) ── */}
      <div className="bg-white dark:bg-[#0f172a] rounded-3xl p-5 sm:p-6 shadow-sm border border-slate-100 dark:border-slate-800 space-y-4">
        <div>
          <div className="text-base font-black text-slate-900 dark:text-white">{t("summary.general_total")}</div>
          <div className="text-xs text-slate-400 font-medium">{t("summary.general_sub")}</div>
        </div>

        {/* Görsel 1: [Açılış] + [Nakit] + [POS] + [FAST] = [Toplam Satış Tutarı] */}
        <div className="flex flex-col lg:flex-row items-stretch lg:items-center gap-3">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 flex-1">
            {/* Açılış Kasası */}
            <div className="bg-slate-50 dark:bg-slate-800/80 rounded-2xl p-4 border border-slate-200/80 dark:border-slate-700">
              <div className="text-xs font-bold text-slate-500 dark:text-slate-400">{t("summary.opening_cash")}</div>
              <div className="text-lg font-black text-slate-900 dark:text-white mt-1">
                {formatCurrency(data?.opening_cash)}
              </div>
            </div>

            {/* Toplam Nakit Satış */}
            <div className="bg-emerald-50/80 dark:bg-emerald-950/20 rounded-2xl p-4 border border-emerald-100 dark:border-emerald-800/40">
              <div className="text-xs font-bold text-emerald-700 dark:text-emerald-400">{t("summary.cash_sales")}</div>
              <div className="text-lg font-black text-emerald-600 dark:text-emerald-400 mt-1">
                {formatCurrency(data?.total_cash_sales)}
              </div>
            </div>

            {/* Toplam POS (Kart) */}
            <div className="bg-blue-50/80 dark:bg-blue-950/20 rounded-2xl p-4 border border-blue-100 dark:border-blue-800/40">
              <div className="text-xs font-bold text-blue-700 dark:text-blue-400">{t("summary.pos_sales")}</div>
              <div className="text-lg font-black text-blue-600 dark:text-blue-400 mt-1">
                {formatCurrency(data?.total_pos_sales)}
              </div>
            </div>

            {/* Toplam FAST */}
            <div className="bg-purple-50/80 dark:bg-purple-950/20 rounded-2xl p-4 border border-purple-100 dark:border-purple-800/40">
              <div className="text-xs font-bold text-purple-700 dark:text-purple-400">{t("summary.fast_sales")}</div>
              <div className="text-lg font-black text-purple-600 dark:text-purple-400 mt-1">
                {formatCurrency(data?.total_fast_sales)}
              </div>
            </div>
          </div>

          {/* Eşittir ve Büyük Yeşil Toplam Satış Tutarı Kutusu (Görsel 1) */}
          <div className="bg-emerald-800 dark:bg-emerald-900 text-white rounded-2xl p-5 flex flex-col justify-center min-w-[240px] shadow-lg shadow-emerald-800/20">
            <div className="flex items-center gap-2 text-xs font-bold text-emerald-200 uppercase tracking-wider">
              <BarChart2 size={16} />
              <span>{t("summary.total_revenue")}</span>
            </div>
            <div className="text-2xl sm:text-3xl font-black tracking-tight mt-1">
              {formatCurrency(data?.total_sales_revenue)}
            </div>
          </div>
        </div>
      </div>

      {/* ── 4. KASA DENGE FORMÜLÜ + MUTABAKAT KARTI ── */}
      <div className="space-y-4">
        {/* Formül Satırı: Açılış + Nakit = Beklenen Kasa */}
        <div className="bg-white dark:bg-[#0f172a] rounded-3xl p-5 shadow-sm border border-slate-100 dark:border-slate-800">
          <div className="flex flex-wrap items-center gap-3 sm:gap-4">
            <div className="flex-1 min-w-[120px]">
              <div className="text-[11px] text-slate-400 font-bold uppercase tracking-wider">{t("summary.opening_cash")}</div>
              <div className="text-xl font-black text-slate-900 dark:text-white mt-1">
                {formatCurrency(data?.opening_cash)}
              </div>
            </div>
            <div className="text-2xl font-black text-slate-300 dark:text-slate-600">+</div>
            <div className="flex-1 min-w-[120px]">
              <div className="text-[11px] text-emerald-600 dark:text-emerald-400 font-bold uppercase tracking-wider">{t("summary.cash_sales")}</div>
              <div className="text-xl font-black text-emerald-600 dark:text-emerald-400 mt-1">
                {formatCurrency(data?.total_cash_sales)}
              </div>
            </div>
            <div className="text-2xl font-black text-slate-300 dark:text-slate-600">=</div>
            <div className="bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800/50 rounded-2xl px-5 py-3 flex-1 min-w-[150px]">
              <div className="text-[11px] text-emerald-700 dark:text-emerald-400 font-bold uppercase tracking-wider">{t("summary.expected_cash")}</div>
              <div className="text-2xl font-black text-emerald-700 dark:text-emerald-300 mt-1">
                {formatCurrency(data?.expected_cash)}
              </div>
            </div>
          </div>
        </div>

        {/* Mutabakat Durumu Kartı */}
        {data?.reconciliation_completed ? (
          <div className="bg-emerald-50/90 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800/50 rounded-3xl p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-2xl bg-emerald-600 text-white flex items-center justify-center shrink-0 shadow-lg shadow-emerald-600/30">
                <CheckCircle2 size={26} className="stroke-[2.5]" />
              </div>
              <div>
                <div className="text-base font-black text-emerald-900 dark:text-emerald-200">
                  {t("status.completed_title")}
                </div>
                <p className="text-xs text-emerald-700 dark:text-emerald-400 mt-0.5">
                  {t("status.completed_desc")}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-3 text-xs font-semibold text-emerald-800 dark:text-emerald-300 shrink-0">
              <span className="flex items-center gap-1">
                <Calendar size={13} />
                <span>{data?.current_date_str || "27 Eylül 2026"}</span>
              </span>
              <span>•</span>
              <span className="flex items-center gap-1">
                <Clock size={13} />
                <span>{data?.shift_time_range || "06:00 - 14:00"}</span>
              </span>
            </div>
          </div>
        ) : null}
      </div>

      {/* ── 5. OPSİYONEL ÜRÜN BAZLI DETAY (Görsel 2: Benzin, Motorin, LPG & Donut Chart) ── */}
      <div className="bg-white dark:bg-[#0f172a] rounded-3xl p-5 sm:p-6 shadow-sm border border-slate-100 dark:border-slate-800 space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 dark:border-slate-800/80 pb-4">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-blue-50 dark:bg-blue-900/30 text-blue-600 flex items-center justify-center">
              <Layers size={18} />
            </div>
            <div>
              <div className="text-base font-black text-slate-900 dark:text-white flex items-center gap-2">
                <span>{t("product.title")}</span>
                <span className="text-xs font-normal text-slate-400">{t("product.optional")}</span>
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                {t("product.desc")}
              </p>
            </div>
          </div>

          {/* Toggle Switch */}
          <div className="flex items-center gap-3 self-end sm:self-auto">
            <span className="text-xs font-bold text-slate-600 dark:text-slate-300">
              {t("product.toggle")}
            </span>
            <button
              onClick={() => setShowProductBreakdown(!showProductBreakdown)}
              className={`w-12 h-6 rounded-full transition-colors relative focus:outline-none ${
                showProductBreakdown ? "bg-blue-600" : "bg-slate-300 dark:bg-slate-700"
              }`}
            >
              <div
                className={`w-5 h-5 rounded-full bg-white transition-transform absolute top-0.5 ${
                  showProductBreakdown ? "translate-x-6" : "translate-x-0.5"
                }`}
              />
            </button>
          </div>
        </div>

        {showProductBreakdown && (
          <div className="space-y-4 animate-in fade-in duration-200">
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              {/* Tablo: Ürün Bazlı Satış Detayı */}
              <div className="lg:col-span-2 overflow-x-auto">
                <div className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2.5">
                  {t("product.table_title")}
                </div>
                <table className="w-full text-left text-xs">
                  <thead className="text-slate-400 font-bold border-b border-slate-100 dark:border-slate-800">
                    <tr>
                      <th className="py-2.5 pr-4">{t("product.col_product")}</th>
                      <th className="py-2.5 px-3 text-right">{t("product.col_liters")}</th>
                      <th className="py-2.5 px-3 text-right">{t("product.col_cash")}</th>
                      <th className="py-2.5 px-3 text-right">{t("product.col_pos")}</th>
                      <th className="py-2.5 px-3 text-right">{t("product.col_fast")}</th>
                      <th className="py-2.5 pl-3 text-right">{t("product.col_total")}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800/80 font-medium">
                    {data?.product_breakdown?.map((item) => (
                      <tr key={item.product_name} className="hover:bg-slate-50/60 dark:hover:bg-slate-800/30">
                        <td className="py-3 pr-4 font-bold text-slate-800 dark:text-white flex items-center gap-2">
                          <span
                            className={`w-2.5 h-2.5 rounded-full ${
                              item.product_name === "Benzin"
                                ? "bg-emerald-500"
                                : item.product_name === "Motorin"
                                ? "bg-amber-500"
                                : "bg-red-500"
                            }`}
                          />
                          <span>{item.product_name}</span>
                        </td>
                        <td className="py-3 px-3 text-right font-mono text-slate-700 dark:text-slate-300">
                          {formatNumber(item.liters, 2)} L
                        </td>
                        <td className="py-3 px-3 text-right font-mono text-slate-700 dark:text-slate-300">
                          {formatCurrency(item.cash_sales)}
                        </td>
                        <td className="py-3 px-3 text-right font-mono text-slate-700 dark:text-slate-300">
                          {formatCurrency(item.pos_sales)}
                        </td>
                        <td className="py-3 px-3 text-right font-mono text-slate-700 dark:text-slate-300">
                          {formatCurrency(item.fast_sales)}
                        </td>
                        <td className="py-3 pl-3 text-right font-mono font-bold text-slate-900 dark:text-white">
                          {formatCurrency(item.total_sales)}
                        </td>
                      </tr>
                    ))}
                    {/* Toplam Satırı */}
                    <tr className="border-t-2 border-slate-200 dark:border-slate-700 font-black text-slate-900 dark:text-white">
                      <td className="py-3 pr-4 uppercase">TOPLAM</td>
                      <td className="py-3 px-3 text-right font-mono">
                        {formatNumber(data?.total_dispensed_liters, 2)} L
                      </td>
                      <td className="py-3 px-3 text-right font-mono">
                        {formatCurrency(data?.total_cash_sales)}
                      </td>
                      <td className="py-3 px-3 text-right font-mono">
                        {formatCurrency(data?.total_pos_sales)}
                      </td>
                      <td className="py-3 px-3 text-right font-mono">
                        {formatCurrency(data?.total_fast_sales)}
                      </td>
                      <td className="py-3 pl-3 text-right font-mono text-blue-600 dark:text-blue-400">
                        {formatCurrency(data?.total_sales_revenue)}
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>

              {/* Sağ Kısım: Satılan Litre Dağılımı (Donut Chart Görseli) */}
              <div className="bg-slate-50 dark:bg-slate-800/40 rounded-2xl p-4 border border-slate-200/60 dark:border-slate-700/80 flex flex-col justify-between">
                <div>
                  <div className="text-xs font-bold text-slate-700 dark:text-slate-200 mb-3">
                    {t("product.chart_title")}
                  </div>

                  {/* Pasta Grafik Görsel İllüstrasyonu */}
                  <div className="flex items-center gap-5">
                    {/* Donut representation */}
                    <div className="w-24 h-24 rounded-full border-8 border-emerald-500 border-t-amber-500 border-r-red-500 flex flex-col items-center justify-center shrink-0 bg-white dark:bg-slate-900 shadow-sm">
                      <div className="text-xs font-black text-slate-900 dark:text-white leading-tight">
                        {formatNumber(data?.total_dispensed_liters, 0)} L
                      </div>
                      <div className="text-[9px] text-slate-400 font-semibold">{t("product.chart_total")}</div>
                    </div>

                    {/* Lejant ve Yüzdeler */}
                    <div className="space-y-2 text-xs flex-1">
                      {data?.product_breakdown?.map((item) => (
                        <div key={item.product_name} className="flex items-center justify-between">
                          <span className="flex items-center gap-1.5 font-bold text-slate-700 dark:text-slate-300">
                            <span
                              className={`w-2 h-2 rounded-full ${
                                item.product_name === "Benzin"
                                  ? "bg-emerald-500"
                                  : item.product_name === "Motorin"
                                  ? "bg-amber-500"
                                  : "bg-red-500"
                              }`}
                            />
                            <span>{item.product_name}</span>
                          </span>
                          <span className="font-mono text-slate-500 dark:text-slate-400 text-[11px]">
                            {item.share_percent > 0 ? `%${item.share_percent}` : "—"}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>

                <div className="mt-4 pt-3 border-t border-slate-200/60 dark:border-slate-700/80 flex items-start gap-2 text-[10px] text-slate-400 leading-relaxed">
                  <Info size={14} className="shrink-0 text-blue-500 mt-0.5" />
                  <span>{t("product.info_note")}</span>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Modals */}
      <OpenShiftModal
        isOpen={isOpenShiftOpen}
        onClose={() => setIsOpenShiftOpen(false)}
        onSuccess={() => fetchDashboardData()}
      />

      <CloseShiftModal
        isOpen={isCloseShiftOpen}
        shiftId={targetShift?.shift_id || null}
        stationName={targetShift?.station_name}
        cashierName={targetShift?.user_name}
        onClose={() => {
          setIsCloseShiftOpen(false);
          setTargetShift(null);
        }}
        onSuccess={() => fetchDashboardData()}
      />

      <AddTransactionModal
        isOpen={isAddTxOpen}
        activeShifts={
          data?.active_workers.map((w) => ({
            shift_id: w.shift_id,
            station_name: w.station_name,
            user_name: w.user_name,
            start_time: w.start_time,
            opening_cash: w.opening_cash,
          })) || []
        }
        defaultShiftId={targetShift?.shift_id}
        onClose={() => {
          setIsAddTxOpen(false);
          setTargetShift(null);
        }}
        onSuccess={() => fetchDashboardData()}
      />

      {/* POS Simülatör Modal */}
      {targetShift && (
        <POSSimulatorModal
          isOpen={isPOSOpen}
          shiftId={targetShift.shift_id}
          workerName={targetShift.user_name}
          onClose={() => {
            setIsPOSOpen(false);
            setTargetShift(null);
          }}
          onSuccess={() => fetchDashboardData()}
        />
      )}

      {/* QR / FAST Simülatör Modal */}
      {targetShift && (
        <QRSimulatorModal
          isOpen={isQROpen}
          shiftId={targetShift.shift_id}
          workerName={targetShift.user_name}
          onClose={() => {
            setIsQROpen(false);
            setTargetShift(null);
          }}
          onSuccess={() => fetchDashboardData()}
        />
      )}
    </div>
  );
};
