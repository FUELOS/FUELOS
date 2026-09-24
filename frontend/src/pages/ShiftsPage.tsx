import React, { useState, useEffect } from "react";
import { apiClient } from "@/lib/api";
import { Shift, Station, User } from "@/types";
import { formatCurrency, formatDateTime } from "@/lib/utils";
import { OpenShiftModal } from "@/components/modals/OpenShiftModal";
import { CloseShiftModal } from "@/components/modals/CloseShiftModal";
import {
  Clock,
  Play,
  Square,
  Loader2,
  RefreshCw,
  CheckCircle2,
  AlertTriangle,
  TrendingUp,
  ShieldAlert,
  ChevronRight,
} from "lucide-react";

export const ShiftsPage: React.FC = () => {
  const [shifts, setShifts] = useState<Shift[]>([]);
  const [stations, setStations] = useState<Record<string, Station>>({});
  const [users, setUsers] = useState<Record<string, User>>({});
  const [loading, setLoading] = useState<boolean>(true);
  const [refreshing, setRefreshing] = useState<boolean>(false);
  const [statusFilter, setStatusFilter] = useState<string>("all");

  const [isOpenModal, setIsOpenModal] = useState<boolean>(false);
  const [isCloseModal, setIsCloseModal] = useState<boolean>(false);
  const [selectedShift, setSelectedShift] = useState<Shift | null>(null);

  const fetchData = async () => {
    try {
      setRefreshing(true);
      const [shiftsRes, stationsRes, usersRes] = await Promise.all([
        apiClient.get<Shift[]>("/shifts"),
        apiClient.get<Station[]>("/stations").catch(() => ({ data: [] })),
        apiClient.get<User[]>("/users").catch(() => ({ data: [] })),
      ]);

      setShifts(shiftsRes.data);

      const stMap: Record<string, Station> = {};
      stationsRes.data.forEach((s) => (stMap[s.id] = s));
      setStations(stMap);

      const uMap: Record<string, User> = {};
      usersRes.data.forEach((u) => (uMap[u.id] = u));
      setUsers(uMap);
    } catch (err) {
      console.error("Vardiyalar getirilemedi", err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const filteredShifts = shifts.filter((s) => {
    if (statusFilter === "open") return s.status === "open";
    if (statusFilter === "closed") return s.status === "closed";
    return true;
  });

  const getReconciliationBadge = (shift: Shift) => {
    if (shift.status === "open") {
      return (
        <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-amber-500/10 text-amber-400 border border-amber-500/20">
          <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse"></span>
          <span>Açık Oturum</span>
        </span>
      );
    }

    const diff = Number(shift.cash_difference ?? 0);

    if (shift.reconciliation_status === "matched" || diff === 0) {
      return (
        <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 shadow-sm shadow-emerald-500/10">
          <CheckCircle2 size={13} className="text-emerald-400" />
          <span>Tam Mutabakat (0,00 ₺)</span>
        </span>
      );
    }

    if (diff < 0) {
      return (
        <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-rose-500/10 text-rose-400 border border-rose-500/25 shadow-sm shadow-rose-500/15">
          <AlertTriangle size={13} className="text-rose-400" />
          <span>{formatCurrency(diff)} KASA AÇIĞI</span>
        </span>
      );
    }

    return (
      <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-sky-500/10 text-sky-400 border border-sky-500/25 shadow-sm shadow-sky-500/15">
        <TrendingUp size={13} className="text-sky-400" />
        <span>+{formatCurrency(diff)} Kasa Fazlası</span>
      </span>
    );
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">
            <span>Operasyon</span>
            <ChevronRight size={12} />
            <span className="text-amber-500">Vardiya & Mutabakat</span>
          </div>
          <h1 className="text-2xl font-black text-slate-800 tracking-tight flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-zinc-900 flex items-center justify-center text-white shadow-md">
              <Clock size={20} />
            </div>
            <span>Akıllı Vardiya Mutabakatı</span>
          </h1>
          <p className="text-xs text-slate-500 mt-1">
            Açılış nakdi, vardiya içi nakit satışlar, kapanış kasası ve otomatik kasa farkı tespiti
          </p>
        </div>

        <div className="flex items-center gap-3">
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="bg-white border border-slate-200 rounded-2xl px-3.5 py-2.5 text-xs font-bold text-slate-700 focus:outline-none focus:border-amber-500 transition shadow-sm"
          >
            <option value="all">Tüm Vardiyalar</option>
            <option value="open">Sadece Açık Olanlar</option>
            <option value="closed">Kapatılan Vardiyalar</option>
          </select>

          <button
            onClick={fetchData}
            disabled={refreshing}
            className="p-2.5 rounded-2xl bg-white border border-slate-200 text-slate-600 hover:text-slate-900 hover:bg-slate-50 transition shadow-sm"
            title="Yenile"
          >
            <RefreshCw size={16} className={refreshing ? "animate-spin text-amber-500" : ""} />
          </button>

          <button
            onClick={() => setIsOpenModal(true)}
            className="px-4 py-2.5 rounded-2xl bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-600 hover:to-teal-600 text-white text-xs font-bold flex items-center gap-2 shadow-md shadow-emerald-500/25 transition active:scale-95"
          >
            <Play size={14} className="fill-white" />
            <span>Yeni Vardiya Başlat</span>
          </button>
        </div>
      </div>

      {/* Info Banner for Smart Reconciliation */}
      <div className="p-4 bg-white dark:bg-slate-900/90 border border-indigo-100 dark:border-indigo-900/40 rounded-2xl flex items-center justify-between text-xs text-slate-600 dark:text-slate-300 shadow-sm">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-xl bg-indigo-50 dark:bg-indigo-500/20 text-indigo-600 dark:text-indigo-400 flex items-center justify-center shrink-0">
            <ShieldAlert size={16} />
          </div>
          <div>
            <span className="font-bold text-slate-800 dark:text-white">Akıllı Kasa Doğrulama Formülü:</span>
            <span className="text-slate-500 dark:text-slate-400 ml-2">Beklenen Kasa = Açılış Nakdi + Vardiya İçi Nakit Satışlar. Sistem kapanışta sayılan tutarı otomatik karşılaştırır.</span>
          </div>
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center p-12 text-slate-400">
          <Loader2 size={36} className="animate-spin text-amber-500" />
        </div>
      ) : filteredShifts.length === 0 ? (
        <div className="p-10 text-center bg-white dark:bg-slate-900/90 border border-slate-100 dark:border-slate-800 rounded-3xl text-slate-500 dark:text-slate-400 text-sm shadow-sm">
          Filtrelere uygun kayıtlı bir vardiya bulunamadı.
        </div>
      ) : (
        <div className="overflow-x-auto bg-white dark:bg-slate-900/90 border border-slate-100 dark:border-slate-800 rounded-3xl shadow-md dark:shadow-xl shadow-slate-200/60 dark:shadow-slate-950/50">
          <table className="w-full text-left text-sm text-slate-600 dark:text-slate-300">
            <thead className="bg-[#f8fafc] dark:bg-slate-950/60 text-slate-400 uppercase text-[11px] font-bold border-b border-slate-100 dark:border-slate-800">
              <tr>
                <th className="px-5 py-3.5">İstasyon & Personel</th>
                <th className="px-5 py-3.5">Vardiya Zamanı</th>
                <th className="px-5 py-3.5">Açılış Kasa</th>
                <th className="px-5 py-3.5">Nakit Satışlar</th>
                <th className="px-5 py-3.5">Beklenen Kasa</th>
                <th className="px-5 py-3.5">Fiziki Kapanış</th>
                <th className="px-5 py-3.5">Kasa Mutabakat Durumu</th>
                <th className="px-5 py-3.5 text-right">Aksiyon</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60 font-normal">
              {filteredShifts.map((shift) => (
                <tr key={shift.id} className="hover:bg-slate-50/80 dark:hover:bg-slate-800/40 transition">
                  <td className="px-5 py-3.5">
                    <div className="font-bold text-slate-800 dark:text-white">
                      {stations[shift.station_id]?.name || "İstasyon"}
                    </div>
                    <div className="text-xs text-amber-600 dark:text-amber-400 font-medium mt-0.5">
                      {users[shift.user_id]?.full_name || "Personel"}
                    </div>
                  </td>
                  <td className="px-5 py-3.5 text-xs font-mono text-slate-500 dark:text-slate-400">
                    <div>Başlangıç: {formatDateTime(shift.start_time)}</div>
                    <div>Bitiş: {shift.end_time ? formatDateTime(shift.end_time) : "—"}</div>
                  </td>
                  <td className="px-5 py-3.5 font-mono font-bold text-slate-700 dark:text-slate-300">
                    {formatCurrency(shift.opening_cash)}
                  </td>
                  <td className="px-5 py-3.5 font-mono font-medium text-emerald-600 dark:text-emerald-400">
                    {formatCurrency(shift.cash_sales)}
                  </td>
                  <td className="px-5 py-3.5 font-mono font-bold text-blue-600 dark:text-sky-400">
                    {formatCurrency(shift.expected_cash)}
                  </td>
                  <td className="px-5 py-3.5 font-mono font-bold text-slate-800 dark:text-white">
                    {shift.closing_cash !== null ? formatCurrency(shift.closing_cash) : "—"}
                  </td>
                  <td className="px-5 py-3.5">
                    {getReconciliationBadge(shift)}
                  </td>
                  <td className="px-5 py-3.5 text-right">
                    {shift.status === "open" && (
                      <button
                        onClick={() => {
                          setSelectedShift(shift);
                          setIsCloseModal(true);
                        }}
                        className="px-3 py-1.5 rounded-xl bg-rose-50 dark:bg-rose-500/10 text-rose-600 dark:text-rose-400 border border-rose-200 dark:border-rose-500/20 hover:bg-rose-100 dark:hover:bg-rose-500/20 text-xs font-bold transition inline-flex items-center gap-1.5 active:scale-95"
                      >
                        <Square size={12} className="fill-rose-600 dark:fill-rose-400" />
                        <span>Kapat</span>
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <OpenShiftModal
        isOpen={isOpenModal}
        onClose={() => setIsOpenModal(false)}
        onSuccess={fetchData}
      />

      <CloseShiftModal
        isOpen={isCloseModal}
        shiftId={selectedShift?.id || null}
        stationName={selectedShift ? stations[selectedShift.station_id]?.name : undefined}
        cashierName={selectedShift ? users[selectedShift.user_id]?.full_name : undefined}
        onClose={() => {
          setIsCloseModal(false);
          setSelectedShift(null);
        }}
        onSuccess={fetchData}
      />
    </div>
  );
};
