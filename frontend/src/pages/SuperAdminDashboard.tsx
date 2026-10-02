/**
 * FuelOS — SuperAdmin Genel Dashboard
 * Tüm istasyonların kuş bakışı görünümü: aktif vardiyalar, günlük ciro, istasyon sağlık durumu.
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
  Clock,
  CheckCircle2,
  AlertCircle,
  Loader2,
  BarChart3,
  Zap,
  ChevronRight,
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
}

interface AdminDashboardData {
  total_stations: number;
  active_stations: number;
  total_active_shifts: number;
  total_today_revenue: number;
  total_today_transactions: number;
  stations: StationSummary[];
}

export const SuperAdminDashboard: React.FC = () => {
  const { language } = useLanguage();
  const [data, setData] = useState<AdminDashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

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

  useEffect(() => { fetch(); }, [fetch]);

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
      sub: tr ? `${data?.active_stations ?? 0} aktif` : `${data?.active_stations ?? 0} active`,
      icon: Building2,
      color: "blue",
      bg: "bg-blue-50 dark:bg-blue-950/20",
      border: "border-blue-100 dark:border-blue-800/40",
      iconBg: "bg-blue-100 dark:bg-blue-900/50",
      iconColor: "text-blue-600",
      valueColor: "text-blue-700 dark:text-blue-300",
    },
    {
      label: tr ? "Açık Vardiya" : "Active Shifts",
      value: data?.total_active_shifts ?? 0,
      sub: tr ? "Şu an çalışıyor" : "Currently running",
      icon: Activity,
      color: "emerald",
      bg: "bg-emerald-50 dark:bg-emerald-950/20",
      border: "border-emerald-100 dark:border-emerald-800/40",
      iconBg: "bg-emerald-100 dark:bg-emerald-900/50",
      iconColor: "text-emerald-600",
      valueColor: "text-emerald-700 dark:text-emerald-300",
    },
    {
      label: tr ? "Günlük Ciro" : "Today's Revenue",
      value: formatCurrency(data?.total_today_revenue),
      sub: tr ? "Tüm istasyonlar" : "All stations",
      icon: TrendingUp,
      color: "purple",
      bg: "bg-purple-50 dark:bg-purple-950/20",
      border: "border-purple-100 dark:border-purple-800/40",
      iconBg: "bg-purple-100 dark:bg-purple-900/50",
      iconColor: "text-purple-600",
      valueColor: "text-purple-700 dark:text-purple-300",
      isText: true,
    },
    {
      label: tr ? "Günlük İşlem" : "Today's Transactions",
      value: data?.total_today_transactions ?? 0,
      sub: tr ? "Toplam satış" : "Total sales",
      icon: BarChart3,
      color: "amber",
      bg: "bg-amber-50 dark:bg-amber-950/20",
      border: "border-amber-100 dark:border-amber-800/40",
      iconBg: "bg-amber-100 dark:bg-amber-900/50",
      iconColor: "text-amber-600",
      valueColor: "text-amber-700 dark:text-amber-300",
    },
  ];

  return (
    <div className="space-y-6">
      {/* ── BAŞLIK ── */}
      <div className="bg-white dark:bg-[#0f172a] rounded-3xl p-5 sm:p-6 shadow-sm border border-slate-100 dark:border-slate-800 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-blue-600 to-blue-700 flex items-center justify-center shadow-lg shadow-blue-600/30">
              <Zap size={18} className="text-white fill-white" />
            </div>
            <div>
              <h1 className="text-2xl font-black tracking-tight text-slate-900 dark:text-white flex items-center gap-2">
                <span className="text-slate-900 dark:text-white">Fuel</span>
                <span className="text-blue-600">OS</span>
                <span className="font-bold text-slate-700 dark:text-slate-300 ml-1">
                  {tr ? "Sistem Yönetimi" : "System Administration"}
                </span>
              </h1>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                {tr
                  ? "Tüm istasyonların anlık durumu ve günlük performans özeti"
                  : "Real-time status of all stations and daily performance summary"}
              </p>
            </div>
          </div>
        </div>

        <button
          onClick={fetch}
          disabled={refreshing}
          className="p-2.5 rounded-2xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-100 transition shadow-sm"
          title={tr ? "Yenile" : "Refresh"}
        >
          <RefreshCw size={16} className={refreshing ? "animate-spin text-blue-600" : ""} />
        </button>
      </div>

      {error && (
        <div className="p-4 bg-red-50 border border-red-200 rounded-2xl text-red-600 text-xs font-semibold flex items-center gap-2.5">
          <AlertCircle size={16} />
          <span>{error}</span>
        </div>
      )}

      {/* ── 4 METRİK KART ── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {metricCards.map(({ label, value, sub, icon: Icon, bg, border, iconBg, iconColor, valueColor, isText }) => (
          <div key={label} className={`${bg} ${border} border rounded-3xl p-5 space-y-3`}>
            <div className={`w-10 h-10 rounded-2xl ${iconBg} flex items-center justify-center`}>
              <Icon size={20} className={iconColor} />
            </div>
            <div>
              <div className={`text-xl sm:text-2xl font-black ${valueColor}`}>
                {isText ? value : value.toLocaleString("tr-TR")}
              </div>
              <div className="text-xs font-bold text-slate-600 dark:text-slate-300 mt-0.5">{label}</div>
              <div className="text-[11px] text-slate-400 dark:text-slate-500 mt-0.5">{sub}</div>
            </div>
          </div>
        ))}
      </div>

      {/* ── İSTASYON TABLOSU ── */}
      <div className="bg-white dark:bg-[#0f172a] rounded-3xl shadow-sm border border-slate-100 dark:border-slate-800 overflow-hidden">
        <div className="p-5 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
          <div>
            <div className="text-base font-black text-slate-900 dark:text-white">
              {tr ? "İstasyon Durumu" : "Station Status"}
            </div>
            <div className="text-xs text-slate-400 mt-0.5">
              {tr ? "Tüm lokasyonların canlı görünümü" : "Live view of all locations"}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
            <span className="text-xs font-semibold text-emerald-600 dark:text-emerald-400">
              {tr ? "Canlı" : "Live"}
            </span>
          </div>
        </div>

        {!data?.stations?.length ? (
          <div className="p-10 text-center text-slate-400 text-sm">
            {tr ? "Kayıtlı istasyon bulunmuyor." : "No stations registered."}
          </div>
        ) : (
          <div className="divide-y divide-slate-100 dark:divide-slate-800">
            {data.stations.map((st) => (
              <div
                key={st.station_id}
                className="p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center gap-4 hover:bg-slate-50 dark:hover:bg-slate-800/30 transition group"
              >
                {/* Sol: İstasyon Bilgisi */}
                <div className="flex items-center gap-4 flex-1 min-w-0">
                  <div className={`w-12 h-12 rounded-2xl flex items-center justify-center shrink-0 ${
                    st.active_shift_count > 0
                      ? "bg-emerald-100 dark:bg-emerald-900/30"
                      : "bg-slate-100 dark:bg-slate-800"
                  }`}>
                    <Building2 size={22} className={st.active_shift_count > 0 ? "text-emerald-600" : "text-slate-400"} />
                  </div>
                  <div className="min-w-0">
                    <div className="font-black text-slate-900 dark:text-white text-sm truncate group-hover:text-blue-600 transition">
                      {st.station_name}
                    </div>
                    <div className="flex items-center gap-2 mt-0.5">
                      <span className="text-[10px] font-mono font-bold text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/30 px-1.5 py-0.5 rounded-lg border border-blue-200 dark:border-blue-800/40">
                        {st.station_code}
                      </span>
                      <span className="flex items-center gap-1 text-[11px] text-slate-400 dark:text-slate-500">
                        <MapPin size={10} />
                        {st.city}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Orta: Metrikler */}
                <div className="flex items-center gap-5 text-xs">
                  {/* Açık Vardiya */}
                  <div className="text-center">
                    <div className={`text-base font-black ${
                      st.active_shift_count > 0 ? "text-emerald-600" : "text-slate-400"
                    }`}>
                      {st.active_shift_count}
                    </div>
                    <div className="text-slate-400 text-[10px] font-semibold">
                      {tr ? "Vardiya" : "Shift"}
                    </div>
                  </div>

                  <div className="w-px h-8 bg-slate-200 dark:bg-slate-700" />

                  {/* İşçi */}
                  <div className="text-center">
                    <div className="text-base font-black text-slate-700 dark:text-slate-200 flex items-center gap-1 justify-center">
                      <Users size={13} className="text-blue-500" />
                      {st.worker_count}
                    </div>
                    <div className="text-slate-400 text-[10px] font-semibold">
                      {tr ? "Personel" : "Staff"}
                    </div>
                  </div>

                  <div className="w-px h-8 bg-slate-200 dark:bg-slate-700" />

                  {/* Günlük İşlem */}
                  <div className="text-center">
                    <div className="text-base font-black text-slate-700 dark:text-slate-200">
                      {st.today_transaction_count}
                    </div>
                    <div className="text-slate-400 text-[10px] font-semibold">
                      {tr ? "İşlem" : "Txns"}
                    </div>
                  </div>

                  <div className="w-px h-8 bg-slate-200 dark:bg-slate-700" />

                  {/* Günlük Ciro */}
                  <div className="text-right">
                    <div className="text-base font-black text-purple-600 dark:text-purple-400">
                      {formatCurrency(st.today_revenue)}
                    </div>
                    <div className="text-slate-400 text-[10px] font-semibold">
                      {tr ? "Günlük Ciro" : "Today Rev."}
                    </div>
                  </div>
                </div>

                {/* Sağ: Durum Rozeti */}
                <div className="flex items-center gap-2 shrink-0">
                  {st.active_shift_count > 0 ? (
                    <span className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800/40 text-emerald-700 dark:text-emerald-400 text-[11px] font-black">
                      <CheckCircle2 size={12} />
                      {tr ? "Aktif" : "Active"}
                    </span>
                  ) : (
                    <span className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-400 text-[11px] font-bold">
                      <Clock size={12} />
                      {tr ? "Bekleniyor" : "Idle"}
                    </span>
                  )}
                  <ChevronRight size={14} className="text-slate-300 dark:text-slate-600 group-hover:text-blue-500 transition" />
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── ALT BİLGİ ── */}
      <div className="bg-gradient-to-r from-blue-600 to-blue-700 rounded-3xl p-5 flex flex-col sm:flex-row items-center justify-between gap-3">
        <div className="text-white">
          <div className="font-black text-sm">
            {tr ? "Sistem Durumu" : "System Status"}
          </div>
          <div className="text-blue-200 text-xs mt-0.5">
            {tr ? "Tüm servisler çalışıyor · API bağlantısı sağlıklı" : "All services operational · API connection healthy"}
          </div>
        </div>
        <div className="flex items-center gap-2 text-xs text-blue-200 font-semibold shrink-0">
          <div className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
          FuelOS v1.0 · {tr ? "Canlı" : "Live"}
        </div>
      </div>
    </div>
  );
};
