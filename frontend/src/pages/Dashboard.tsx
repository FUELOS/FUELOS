import React, { useState, useEffect, useCallback } from "react";
import { apiClient } from "@/lib/api";
import { DashboardResponse, Station } from "@/types";
import { formatCurrency, formatNumber, formatDateTime } from "@/lib/utils";
import { OpenShiftModal } from "@/components/modals/OpenShiftModal";
import { CloseShiftModal } from "@/components/modals/CloseShiftModal";
import { AddTransactionModal } from "@/components/modals/AddTransactionModal";
import {
  TrendingUp,
  Fuel,
  Receipt,
  Clock,
  Wallet,
  CreditCard,
  Building,
  RefreshCw,
  PlusCircle,
  Play,
  Square,
  AlertCircle,
  Loader2,
  CheckCircle2,
  ArrowUpRight,
} from "lucide-react";

export const Dashboard: React.FC = () => {
  const [data, setData] = useState<DashboardResponse | null>(null);
  const [stations, setStations] = useState<Station[]>([]);
  const [selectedStationId, setSelectedStationId] = useState<string>("");
  const [loading, setLoading] = useState<boolean>(true);
  const [refreshing, setRefreshing] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  // Modals state
  const [isOpenShiftOpen, setIsOpenShiftOpen] = useState<boolean>(false);
  const [isCloseShiftOpen, setIsCloseShiftOpen] = useState<boolean>(false);
  const [isAddTxOpen, setIsAddTxOpen] = useState<boolean>(false);
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

  const handleOpenCloseModal = (shift: { shift_id: string; station_name: string; user_name: string }) => {
    setTargetShift(shift);
    setIsCloseShiftOpen(true);
  };

  const handleOpenAddTxModal = (shiftId?: string) => {
    if (shiftId && data) {
      const found = data.active_shifts.find((s) => s.shift_id === shiftId);
      if (found) setTargetShift(found);
    } else {
      setTargetShift(null);
    }
    setIsAddTxOpen(true);
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-3 text-slate-500">
        <Loader2 size={36} className="animate-spin text-amber-500" />
        <span className="text-sm font-semibold tracking-wide">Operasyon verileri yükleniyor...</span>
      </div>
    );
  }

  return (
    <div className="space-y-7">
      {/* 1. HERO BANNER: "Builds Amazing Teams" yerine SİSTEM BAŞLIĞI VE ÖZETİ */}
      <div className="relative overflow-hidden rounded-3xl bg-gradient-to-r from-slate-900 via-slate-800 to-slate-950 p-6 sm:p-8 text-white shadow-xl shadow-slate-900/15 border border-slate-700/50">
        <div className="relative z-10 flex flex-col lg:flex-row lg:items-center lg:justify-between gap-6">
          <div className="space-y-2 max-w-2xl">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-amber-500/20 text-amber-300 text-xs font-bold border border-amber-400/30">
              <span className="w-2 h-2 rounded-full bg-amber-400 animate-ping" />
              SİSTEM KONTROL MASASI
            </div>
            <h1 className="text-2xl sm:text-3xl font-black tracking-tight text-white">
              FUELOS | Akaryakıt İstasyon Otomasyon & Yönetim Sistemi
            </h1>
            <p className="text-slate-300 text-xs sm:text-sm leading-relaxed">
              Pompa sayaçları, kasa mutabakatı, vardiya denetimi ve anlık tahsilat akışı tek ekranda.
            </p>
          </div>

          {/* Quick Actions inside Hero Banner */}
          <div className="flex flex-wrap items-center gap-3">
            {stations.length > 0 && (
              <select
                value={selectedStationId}
                onChange={(e) => setSelectedStationId(e.target.value)}
                className="bg-white/10 text-white border border-white/20 rounded-2xl px-3.5 py-2.5 text-xs font-bold focus:outline-none focus:bg-slate-900 focus:border-amber-400 transition"
              >
                <option value="" className="bg-slate-900 text-white">Tüm İstasyonlar ({stations.length})</option>
                {stations.map((st) => (
                  <option key={st.id} value={st.id} className="bg-slate-900 text-white">
                    {st.name} [{st.code}]
                  </option>
                ))}
              </select>
            )}

            <button
              onClick={() => fetchDashboardData()}
              disabled={refreshing}
              className="p-2.5 rounded-2xl bg-white/10 hover:bg-white/20 text-white border border-white/15 transition active:scale-95"
              title="Yenile"
            >
              <RefreshCw size={16} className={refreshing ? "animate-spin text-amber-400" : ""} />
            </button>

            <button
              onClick={() => setIsOpenShiftOpen(true)}
              className="px-4 py-2.5 rounded-2xl bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-600 hover:to-teal-600 text-white text-xs font-bold flex items-center gap-2 shadow-lg shadow-emerald-500/30 transition active:scale-95"
            >
              <Play size={14} className="fill-white" />
              <span>Vardiya Başlat</span>
            </button>

            <button
              onClick={() => handleOpenAddTxModal()}
              className="px-4 py-2.5 rounded-2xl bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600 text-slate-950 text-xs font-black flex items-center gap-2 shadow-lg shadow-amber-500/30 transition active:scale-95"
            >
              <PlusCircle size={15} />
              <span>Satış Kaydı Ekle</span>
            </button>
          </div>
        </div>

        {/* Decorative background shapes */}
        <div className="absolute -right-10 -bottom-10 w-64 h-64 bg-amber-500/10 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute right-40 -top-10 w-48 h-48 bg-emerald-500/10 rounded-full blur-2xl pointer-events-none" />
      </div>

      {error && (
        <div className="p-4 bg-red-50 border border-red-200 rounded-2xl text-red-600 text-sm flex items-center gap-2.5">
          <AlertCircle size={18} className="shrink-0" />
          <span className="font-medium">{error}</span>
        </div>
      )}

      {/* 2. CREATIVE TIM MATERIAL ELEVATED CARDS (Bembeyaz kartlar + dışarı taşan gradyan kutular / Koyu modda derin slate) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 pt-4">
        {/* Card 1: Today Revenue (Emerald Box) */}
        <div className="bg-white dark:bg-slate-900/90 rounded-3xl p-5 relative shadow-md dark:shadow-xl shadow-slate-200/80 dark:shadow-slate-950/50 border border-slate-100 dark:border-slate-800/90 hover:shadow-xl transition-all duration-200">
          <div className="flex items-start justify-between">
            {/* Elevated Gradient Box */}
            <div className="-mt-8 w-14 h-14 rounded-2xl bg-gradient-to-tr from-emerald-600 to-emerald-400 text-white flex items-center justify-center shadow-lg shadow-emerald-500/40 border border-emerald-400/20">
              <TrendingUp size={24} className="stroke-[2.5]" />
            </div>
            <div className="text-right">
              <span className="text-[11px] font-bold text-slate-400 uppercase tracking-widest">GÜNLÜK CİRO</span>
              <div className="text-2xl font-black text-slate-800 dark:text-white tracking-tight mt-1">
                {formatCurrency(data?.today_total_sales)}
              </div>
            </div>
          </div>
          <div className="mt-4 pt-3 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between text-xs">
            <span className="text-emerald-600 dark:text-emerald-400 font-bold flex items-center gap-1">
              <CheckCircle2 size={13} />
              <span>Canlı Tahsilat</span>
            </span>
            <span className="text-slate-400 dark:text-slate-500 font-mono text-[11px]">Bugün</span>
          </div>
        </div>

        {/* Card 2: Fuel Liters (Orange Box) */}
        <div className="bg-white dark:bg-slate-900/90 rounded-3xl p-5 relative shadow-md dark:shadow-xl shadow-slate-200/80 dark:shadow-slate-950/50 border border-slate-100 dark:border-slate-800/90 hover:shadow-xl transition-all duration-200">
          <div className="flex items-start justify-between">
            <div className="-mt-8 w-14 h-14 rounded-2xl bg-gradient-to-tr from-amber-500 to-orange-500 text-white flex items-center justify-center shadow-lg shadow-amber-500/40 border border-amber-400/20">
              <Fuel size={24} className="stroke-[2.5]" />
            </div>
            <div className="text-right">
              <span className="text-[11px] font-bold text-slate-400 uppercase tracking-widest">YAKIT HACMİ</span>
              <div className="text-2xl font-black text-slate-800 dark:text-white tracking-tight mt-1">
                {formatNumber(data?.today_total_liters, 2)} <span className="text-sm font-bold text-amber-500">Lt</span>
              </div>
            </div>
          </div>
          <div className="mt-4 pt-3 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between text-xs">
            <span className="text-amber-600 dark:text-amber-400 font-medium flex items-center gap-1">
              <ArrowUpRight size={13} />
              <span>Pompa Sayaç Toplamı</span>
            </span>
            <span className="text-slate-400 dark:text-slate-500 font-mono text-[11px]">Dizel & Benzin</span>
          </div>
        </div>

        {/* Card 3: Transaction Count (Blue Box) */}
        <div className="bg-white dark:bg-slate-900/90 rounded-3xl p-5 relative shadow-md dark:shadow-xl shadow-slate-200/80 dark:shadow-slate-950/50 border border-slate-100 dark:border-slate-800/90 hover:shadow-xl transition-all duration-200">
          <div className="flex items-start justify-between">
            <div className="-mt-8 w-14 h-14 rounded-2xl bg-gradient-to-tr from-blue-600 to-cyan-500 text-white flex items-center justify-center shadow-lg shadow-blue-500/40 border border-blue-400/20">
              <Receipt size={24} className="stroke-[2.5]" />
            </div>
            <div className="text-right">
              <span className="text-[11px] font-bold text-slate-400 uppercase tracking-widest">İŞLEM ADEDİ</span>
              <div className="text-2xl font-black text-slate-800 dark:text-white tracking-tight mt-1">
                {data?.today_transaction_count ?? 0} <span className="text-sm font-semibold text-slate-500 dark:text-slate-400">Adet</span>
              </div>
            </div>
          </div>
          <div className="mt-4 pt-3 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between text-xs">
            <span className="text-blue-600 dark:text-sky-400 font-medium">Akaryakıt + Market</span>
            <span className="text-slate-400 dark:text-slate-500 font-mono text-[11px]">Tam Kayıt</span>
          </div>
        </div>

        {/* Card 4: Active Shifts (Dark Purple/Carbon Box) */}
        <div className="bg-white dark:bg-slate-900/90 rounded-3xl p-5 relative shadow-md dark:shadow-xl shadow-slate-200/80 dark:shadow-slate-950/50 border border-slate-100 dark:border-slate-800/90 hover:shadow-xl transition-all duration-200">
          <div className="flex items-start justify-between">
            <div className="-mt-8 w-14 h-14 rounded-2xl bg-gradient-to-tr from-zinc-800 to-zinc-950 text-white flex items-center justify-center shadow-lg shadow-zinc-800/40 border border-zinc-700/30">
              <Clock size={24} className="stroke-[2.5]" />
            </div>
            <div className="text-right">
              <span className="text-[11px] font-bold text-slate-400 uppercase tracking-widest">AÇIK VARDİYA</span>
              <div className="text-2xl font-black text-slate-800 dark:text-white tracking-tight mt-1">
                {data?.active_shift_count ?? 0} <span className="text-sm font-semibold text-zinc-500 dark:text-purple-400">Vardiya</span>
              </div>
            </div>
          </div>
          <div className="mt-4 pt-3 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between text-xs">
            <span className="text-emerald-600 dark:text-emerald-400 font-bold flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
              <span>Canlı Kasa Oturumu</span>
            </span>
            <span className="text-slate-400 dark:text-slate-500 font-mono text-[11px]">Sahada</span>
          </div>
        </div>
      </div>

      {/* 3. PAYMENT BREAKDOWN (Material White Cards / Dark Slate in Dark Mode) */}
      <div className="space-y-3 pt-2">
        <div className="flex items-center justify-between">
          <h2 className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-widest flex items-center gap-2">
            <Wallet size={15} className="text-amber-500" />
            <span>Ödeme Kanalları Dağılımı (Bugün)</span>
          </h2>
          <span className="text-xs text-slate-400 dark:text-slate-500 font-mono">Tahsilat Kanalları</span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {/* Nakit */}
          <div className="bg-white dark:bg-slate-900/90 border border-slate-100 dark:border-slate-800 rounded-2xl p-4 flex items-center justify-between shadow-sm hover:shadow-md transition">
            <div>
              <div className="text-xs text-slate-500 dark:text-slate-400 font-semibold">Nakit Kasa</div>
              <div className="text-lg font-black text-emerald-600 dark:text-emerald-400 mt-1">
                {formatCurrency(data?.today_cash)}
              </div>
            </div>
            <div className="p-3 rounded-xl bg-emerald-50 dark:bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
              <Wallet size={20} />
            </div>
          </div>

          {/* POS / Kredi Kartı */}
          <div className="bg-white dark:bg-slate-900/90 border border-slate-100 dark:border-slate-800 rounded-2xl p-4 flex items-center justify-between shadow-sm hover:shadow-md transition">
            <div>
              <div className="text-xs text-slate-500 dark:text-slate-400 font-semibold">POS / Kredi Kartı</div>
              <div className="text-lg font-black text-blue-600 dark:text-sky-400 mt-1">
                {formatCurrency(data?.today_credit_card)}
              </div>
            </div>
            <div className="p-3 rounded-xl bg-blue-50 dark:bg-sky-500/10 text-blue-600 dark:text-sky-400">
              <CreditCard size={20} />
            </div>
          </div>

          {/* EFT / Banka */}
          <div className="bg-white dark:bg-slate-900/90 border border-slate-100 dark:border-slate-800 rounded-2xl p-4 flex items-center justify-between shadow-sm hover:shadow-md transition">
            <div>
              <div className="text-xs text-slate-500 dark:text-slate-400 font-semibold">Banka / Havale</div>
              <div className="text-lg font-black text-indigo-600 dark:text-indigo-400 mt-1">
                {formatCurrency(data?.today_eft)}
              </div>
            </div>
            <div className="p-3 rounded-xl bg-indigo-50 dark:bg-indigo-500/10 text-indigo-600 dark:text-indigo-400">
              <Building size={20} />
            </div>
          </div>

          {/* Veresiye */}
          <div className="bg-white dark:bg-slate-900/90 border border-slate-100 dark:border-slate-800 rounded-2xl p-4 flex items-center justify-between shadow-sm hover:shadow-md transition">
            <div>
              <div className="text-xs text-slate-500 dark:text-slate-400 font-semibold">Veresiye Kayıtları</div>
              <div className="text-lg font-black text-amber-600 dark:text-amber-400 mt-1">
                {formatCurrency(data?.today_veresiye)}
              </div>
            </div>
            <div className="p-3 rounded-xl bg-amber-50 dark:bg-amber-500/10 text-amber-600 dark:text-amber-400">
              <Receipt size={20} />
            </div>
          </div>
        </div>
      </div>

      {/* 4. ACTIVE SHIFTS TABLE (Material Clean White Card / Dark Slate) */}
      <div className="bg-white dark:bg-slate-900/90 rounded-3xl p-6 shadow-md dark:shadow-xl shadow-slate-200/80 dark:shadow-slate-950/50 border border-slate-100 dark:border-slate-800 space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-2xl bg-zinc-900 dark:bg-amber-500 text-white dark:text-slate-950 flex items-center justify-center shadow-md">
              <Clock size={18} />
            </div>
            <div>
              <h2 className="text-base font-extrabold text-slate-800 dark:text-white tracking-tight">Canlı Vardiyalar & Kasa Takip Masası</h2>
              <p className="text-xs text-slate-400">Şu anda sahada çalışan personeller ve kasa oturumları</p>
            </div>
          </div>
          <span className="bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 text-xs px-3 py-1.5 rounded-full font-bold">
            {data?.active_shifts.length ?? 0} Aktif Kasiyer
          </span>
        </div>

        {data?.active_shifts.length === 0 ? (
          <div className="p-8 text-center bg-[#f8fafc] dark:bg-slate-950/50 border border-slate-100 dark:border-slate-800 rounded-2xl space-y-3">
            <div className="w-12 h-12 rounded-2xl bg-slate-200 dark:bg-slate-800 text-slate-500 dark:text-slate-400 flex items-center justify-center mx-auto">
              <Clock size={24} />
            </div>
            <div className="text-slate-800 dark:text-white font-bold text-sm">Şu anda açık bir vardiya bulunmuyor</div>
            <p className="text-xs text-slate-500 dark:text-slate-400 max-w-sm mx-auto leading-relaxed">
              İstasyonda pompa veya market satışı yapabilmek için lütfen yukarıdaki butondan bir vardiya oturumu başlatın.
            </p>
            <button
              onClick={() => setIsOpenShiftOpen(true)}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-600 hover:to-teal-600 text-white text-xs font-bold shadow-md shadow-emerald-500/25 transition active:scale-95"
            >
              <Play size={13} className="fill-white" />
              <span>İlk Vardiyayı Başlat</span>
            </button>
          </div>
        ) : (
          <div className="overflow-x-auto border border-slate-100 dark:border-slate-800 rounded-2xl">
            <table className="w-full text-left text-sm text-slate-600 dark:text-slate-300">
              <thead className="bg-[#f8fafc] dark:bg-slate-950/60 text-slate-400 uppercase text-[11px] font-bold border-b border-slate-100 dark:border-slate-800">
                <tr>
                  <th className="px-5 py-3.5">İstasyon</th>
                  <th className="px-5 py-3.5">Kasiyer / Görevli</th>
                  <th className="px-5 py-3.5">Başlangıç Zamanı</th>
                  <th className="px-5 py-3.5">Açılış Kasa</th>
                  <th className="px-5 py-3.5">Durum</th>
                  <th className="px-5 py-3.5 text-right">İşlemler</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60 font-normal">
                {data?.active_shifts.map((shift) => (
                  <tr key={shift.shift_id} className="hover:bg-slate-50/80 dark:hover:bg-slate-800/40 transition">
                    <td className="px-5 py-3.5 font-bold text-slate-800 dark:text-white">
                      {shift.station_name}
                    </td>
                    <td className="px-5 py-3.5 text-slate-700 dark:text-slate-200 font-medium">
                      {shift.user_name}
                    </td>
                    <td className="px-5 py-3.5 text-slate-500 dark:text-slate-400 font-mono text-xs">
                      {formatDateTime(shift.start_time)}
                    </td>
                    <td className="px-5 py-3.5 font-mono font-bold text-emerald-600 dark:text-emerald-400">
                      {formatCurrency(shift.opening_cash)}
                    </td>
                    <td className="px-5 py-3.5">
                      <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-emerald-50 dark:bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-200/60 dark:border-emerald-500/20">
                        <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
                        Açık Oturum
                      </span>
                    </td>
                    <td className="px-5 py-3.5 text-right space-x-2">
                      <button
                        onClick={() => handleOpenAddTxModal(shift.shift_id)}
                        className="px-3 py-1.5 rounded-xl bg-amber-50 dark:bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-200 dark:border-amber-500/20 hover:bg-amber-100 dark:hover:bg-amber-500/20 text-xs font-bold transition active:scale-95"
                      >
                        + Fiş Gir
                      </button>
                      <button
                        onClick={() => handleOpenCloseModal(shift)}
                        className="px-3 py-1.5 rounded-xl bg-rose-50 dark:bg-rose-500/10 text-rose-600 dark:text-rose-400 border border-rose-200 dark:border-rose-500/20 hover:bg-rose-100 dark:hover:bg-rose-500/20 text-xs font-bold transition inline-flex items-center gap-1.5 active:scale-95"
                      >
                        <Square size={13} className="fill-rose-600 dark:fill-rose-400" />
                        <span>Kapat</span>
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
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
        activeShifts={data?.active_shifts || []}
        defaultShiftId={targetShift?.shift_id}
        onClose={() => {
          setIsAddTxOpen(false);
          setTargetShift(null);
        }}
        onSuccess={() => fetchDashboardData()}
      />
    </div>
  );
};
