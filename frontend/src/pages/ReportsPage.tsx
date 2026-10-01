import React, { useState, useEffect } from "react";
import { apiClient } from "@/lib/api";
import { Shift, Station, User } from "@/types";
import { formatCurrency, formatDateTime } from "@/lib/utils";
import { useLanguage } from "@/context/LanguageContext";
import {
  Calendar,
  Building2,
  CheckCircle2,
  AlertTriangle,
  TrendingUp,
  RefreshCw,
  Loader2,
  FileSpreadsheet,
} from "lucide-react";

export const ReportsPage: React.FC = () => {
  const { t, language } = useLanguage();
  const [shifts, setShifts] = useState<Shift[]>([]);
  const [stations, setStations] = useState<Record<string, Station>>({});
  const [users, setUsers] = useState<Record<string, User>>({});
  const [loading, setLoading] = useState<boolean>(true);
  const [refreshing, setRefreshing] = useState<boolean>(false);
  const [selectedStationId, setSelectedStationId] = useState<string>("");
  const [periodFilter, setPeriodFilter] = useState<string>("all");

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
      console.error("Raporlar yüklenemedi", err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  // Tarih filtrelemesi
  const filteredShifts = shifts.filter((s) => {
    if (selectedStationId && s.station_id !== selectedStationId) return false;

    if (periodFilter === "today") {
      const shiftDate = new Date(s.start_time).toDateString();
      const today = new Date().toDateString();
      return shiftDate === today;
    }

    if (periodFilter === "yesterday") {
      const shiftDate = new Date(s.start_time).toDateString();
      const yesterday = new Date(Date.now() - 86400000).toDateString();
      return shiftDate === yesterday;
    }

    if (periodFilter === "last_7") {
      const diffDays = (Date.now() - new Date(s.start_time).getTime()) / (1000 * 3600 * 24);
      return diffDays <= 7;
    }

    if (periodFilter === "this_month") {
      const d = new Date(s.start_time);
      const now = new Date();
      return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
    }

    return true;
  });

  const getReconciliationBadge = (shift: Shift) => {
    if (shift.status === "open") {
      return (
        <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-blue-50 dark:bg-blue-950/30 text-blue-600 dark:text-blue-400 border border-blue-200 dark:border-blue-800">
          <span className="w-1.5 h-1.5 rounded-full bg-blue-500 animate-pulse"></span>
          <span>{t("status.active_title")}</span>
        </span>
      );
    }

    const diff = Number(shift.cash_difference ?? 0);

    if (shift.reconciliation_status === "matched" || diff === 0) {
      return (
        <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-emerald-50 dark:bg-emerald-950/30 text-emerald-600 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800/60">
          <CheckCircle2 size={13} className="text-emerald-500" />
          <span>{t("reports.matched")}</span>
        </span>
      );
    }

    if (diff < 0) {
      return (
        <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-rose-50 dark:bg-rose-950/30 text-rose-600 dark:text-rose-400 border border-rose-200 dark:border-rose-800/60">
          <AlertTriangle size={13} className="text-rose-500" />
          <span>{formatCurrency(diff)} ({language === "tr" ? "Kasa Açığı" : "Shortage"})</span>
        </span>
      );
    }

    return (
      <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-sky-50 dark:bg-sky-950/30 text-sky-600 dark:text-sky-400 border border-sky-200 dark:border-sky-800/60">
        <TrendingUp size={13} className="text-sky-500" />
        <span>+{formatCurrency(diff)} ({language === "tr" ? "Kasa Fazlası" : "Surplus"})</span>
      </span>
    );
  };

  return (
    <div className="space-y-6">
      {/* ── ÜST BAŞLIK & FİLTRELER ── */}
      <div className="bg-white dark:bg-[#0f172a] rounded-3xl p-5 sm:p-6 shadow-sm border border-slate-100 dark:border-slate-800 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-2xl bg-blue-600 text-white flex items-center justify-center shadow-md shadow-blue-600/30">
              <FileSpreadsheet size={20} />
            </div>
            <div>
              <h1 className="text-xl sm:text-2xl font-black text-slate-900 dark:text-white">
                {t("reports.title")}
              </h1>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                {t("reports.subtitle")}
              </p>
            </div>
          </div>
        </div>

        {/* Filtre Kontrolleri */}
        <div className="flex flex-wrap items-center gap-2.5 sm:gap-3 text-xs">
          {/* İstasyon Filtresi */}
          <div className="flex items-center gap-1.5 px-3 py-2 rounded-2xl bg-slate-50 dark:bg-slate-800/80 border border-slate-200/80 dark:border-slate-700">
            <Building2 size={14} className="text-blue-600 shrink-0" />
            <select
              value={selectedStationId}
              onChange={(e) => setSelectedStationId(e.target.value)}
              className="bg-transparent font-bold text-xs text-slate-700 dark:text-slate-200 focus:outline-none cursor-pointer"
            >
              <option value="" className="bg-white dark:bg-slate-900 text-slate-900 dark:text-white">
                {t("header.all_stations")}
              </option>
              {Object.values(stations).map((st) => (
                <option key={st.id} value={st.id} className="bg-white dark:bg-slate-900 text-slate-900 dark:text-white">
                  {st.name}
                </option>
              ))}
            </select>
          </div>

          {/* Dönem Filtresi (Bugün, Dün, Son 7 Gün, Bu Ay) */}
          <div className="flex items-center gap-1.5 px-3 py-2 rounded-2xl bg-slate-50 dark:bg-slate-800/80 border border-slate-200/80 dark:border-slate-700">
            <Calendar size={14} className="text-blue-600 shrink-0" />
            <select
              value={periodFilter}
              onChange={(e) => setPeriodFilter(e.target.value)}
              className="bg-transparent font-bold text-xs text-slate-700 dark:text-slate-200 focus:outline-none cursor-pointer"
            >
              <option value="all" className="bg-white dark:bg-slate-900 text-slate-900 dark:text-white">
                {t("reports.all")}
              </option>
              <option value="today" className="bg-white dark:bg-slate-900 text-slate-900 dark:text-white">
                {t("reports.today")}
              </option>
              <option value="yesterday" className="bg-white dark:bg-slate-900 text-slate-900 dark:text-white">
                {t("reports.yesterday")}
              </option>
              <option value="last_7" className="bg-white dark:bg-slate-900 text-slate-900 dark:text-white">
                {t("reports.last_7")}
              </option>
              <option value="this_month" className="bg-white dark:bg-slate-900 text-slate-900 dark:text-white">
                {t("reports.this_month")}
              </option>
            </select>
          </div>

          <button
            onClick={fetchData}
            disabled={refreshing}
            className="p-2.5 rounded-2xl bg-slate-50 dark:bg-slate-800 border border-slate-200/80 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-100 transition shadow-sm"
            title={t("header.refresh")}
          >
            <RefreshCw size={15} className={refreshing ? "animate-spin text-blue-600" : ""} />
          </button>
        </div>
      </div>

      {/* ── RAPOR LİSTESİ TABLOSU ── */}
      {loading ? (
        <div className="flex justify-center p-12 text-slate-400">
          <Loader2 size={36} className="animate-spin text-blue-600" />
        </div>
      ) : filteredShifts.length === 0 ? (
        <div className="p-10 text-center bg-white dark:bg-[#0f172a] border border-slate-100 dark:border-slate-800 rounded-3xl text-slate-500 dark:text-slate-400 text-xs shadow-sm space-y-2">
          <FileSpreadsheet size={32} className="mx-auto text-slate-300 dark:text-slate-600" />
          <div className="font-bold text-sm text-slate-700 dark:text-slate-300">{t("reports.no_data")}</div>
        </div>
      ) : (
        <div className="overflow-x-auto bg-white dark:bg-[#0f172a] border border-slate-100 dark:border-slate-800 rounded-3xl shadow-sm">
          <table className="w-full text-left text-xs text-slate-600 dark:text-slate-300">
            <thead className="bg-[#f8fafc] dark:bg-slate-950/60 text-slate-400 uppercase text-[11px] font-bold border-b border-slate-100 dark:border-slate-800">
              <tr>
                <th className="px-5 py-3.5">{t("reports.col_date")}</th>
                <th className="px-5 py-3.5">{t("reports.col_station")}</th>
                <th className="px-5 py-3.5">{t("reports.col_cashier")}</th>
                <th className="px-5 py-3.5 text-right">{t("summary.opening_cash")}</th>
                <th className="px-5 py-3.5 text-right">{t("summary.cash_sales")}</th>
                <th className="px-5 py-3.5 text-right">{t("reports.col_expected")}</th>
                <th className="px-5 py-3.5 text-right">{t("reports.col_closing")}</th>
                <th className="px-5 py-3.5 text-center">{t("reports.col_status")}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800/80 font-normal">
              {filteredShifts.map((shift) => (
                <tr key={shift.id} className="hover:bg-slate-50/80 dark:hover:bg-slate-800/40 transition">
                  <td className="px-5 py-3.5 font-mono text-slate-700 dark:text-slate-300">
                    <div>{formatDateTime(shift.start_time)}</div>
                    <div className="text-[10px] text-slate-400">
                      {shift.end_time ? formatDateTime(shift.end_time) : "Devam Ediyor"}
                    </div>
                  </td>
                  <td className="px-5 py-3.5 font-bold text-slate-800 dark:text-white">
                    {stations[shift.station_id]?.name || "İstasyon"}
                  </td>
                  <td className="px-5 py-3.5 font-medium text-slate-800 dark:text-slate-200">
                    {users[shift.user_id]?.full_name || "Personel"}
                  </td>
                  <td className="px-5 py-3.5 text-right font-mono text-slate-600 dark:text-slate-300">
                    {formatCurrency(shift.opening_cash)}
                  </td>
                  <td className="px-5 py-3.5 text-right font-mono font-medium text-emerald-600 dark:text-emerald-400">
                    {formatCurrency(shift.cash_sales)}
                  </td>
                  <td className="px-5 py-3.5 text-right font-mono font-bold text-blue-600 dark:text-blue-400">
                    {formatCurrency(shift.expected_cash)}
                  </td>
                  <td className="px-5 py-3.5 text-right font-mono font-bold text-slate-900 dark:text-white">
                    {shift.closing_cash !== null ? formatCurrency(shift.closing_cash) : "—"}
                  </td>
                  <td className="px-5 py-3.5 text-center">
                    {getReconciliationBadge(shift)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};
