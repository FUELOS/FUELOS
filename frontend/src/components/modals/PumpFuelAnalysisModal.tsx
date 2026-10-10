/**
 * FuelOS — Pompa + Yakıt Analiz Paneli (Adım 6)
 * İstasyon Pompaları kartındaki yakıt etiketine tıklanınca açılır.
 * Veri: Adım 4'teki GET /api/pump-analytics/pump-detail endpoint'i.
 * - Özet kartları: toplam litre, toplam tutar, işlem sayısı, ortalama tutar
 * - Saatlik satış grafiği (0-23, boş saatler 0; hover'da değer)
 * - Ödeme kanalı dağılımı (tutar + işlem sayısı + yüzde + etiket)
 * - Yeni grafik kütüphanesi yok: saf Tailwind/CSS çubuk grafik.
 */

import React, { useEffect, useRef, useState } from "react";
import { apiClient } from "@/lib/api";
import { useLanguage } from "@/context/LanguageContext";
import { formatCurrency, formatNumber } from "@/lib/utils";
import {
  X,
  Fuel,
  AlertCircle,
  RefreshCw,
  Loader2,
  Droplets,
  Receipt,
  ShoppingBag,
  Scale,
} from "lucide-react";

// ── Endpoint yanıt modelleri (Adım 4) ────────────────────────────────

interface HourlyBucket {
  hour: number;
  liters: string;
  amount: string;
  transaction_count: number;
}
interface PaymentChannelSummary {
  amount: string;
  transaction_count: number;
}
interface PaymentBreakdown {
  cash: PaymentChannelSummary;
  credit_card: PaymentChannelSummary;
  eft: PaymentChannelSummary;
  veresiye: PaymentChannelSummary;
}
interface PumpFuelDetail {
  station_id: string;
  station_name: string;
  pump_id: string;
  pump_label: string;
  fuel_type: string;
  date: string;
  total_liters: string;
  total_amount: string;
  transaction_count: number;
  average_transaction_amount: string;
  hourly_distribution: HourlyBucket[];
  payment_breakdown: PaymentBreakdown;
}

interface PumpRef {
  id: string;
  label: string;
}

interface PumpFuelAnalysisModalProps {
  isOpen: boolean;
  stationId: string | null;
  pump: PumpRef | null;
  fuelType: string;
  date: string;
  onClose: () => void;
}

// Ödeme kanalı satır yapılandırması — renk tek başına anlam taşımaz,
// etiket de her zaman yazılır (erişilebilirlik).
const PAYMENT_CHANNELS = [
  { key: "cash", labelKey: "tx.cash", barClass: "bg-emerald-500", textClass: "text-emerald-600 dark:text-emerald-400" },
  { key: "credit_card", labelKey: "tx.pos", barClass: "bg-blue-500", textClass: "text-blue-600 dark:text-blue-400" },
  { key: "eft", labelKey: "tx.fast", barClass: "bg-indigo-500", textClass: "text-indigo-600 dark:text-indigo-400" },
  { key: "veresiye", labelKey: "tx.credit", barClass: "bg-amber-500", textClass: "text-amber-600 dark:text-amber-400" },
] as const;

export const PumpFuelAnalysisModal: React.FC<PumpFuelAnalysisModalProps> = ({
  isOpen,
  stationId,
  pump,
  fuelType,
  date,
  onClose,
}) => {
  const { t } = useLanguage();
  const [data, setData] = useState<PumpFuelDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Aynı pompa+yakıt+tarih için gereksiz istek atılmasın (sayfa ömrü boyunca yaşar).
  const cache = useRef<Map<string, PumpFuelDetail>>(new Map());
  const abort = useRef<AbortController | null>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  // ── Veri çekme (iptal + cache destekli) ───────────────────────────
  const fetchDetail = (force = false) => {
    if (!stationId || !pump) return;
    const cacheKey = `${stationId}|${pump.id}|${fuelType}|${date}`;
    if (!force) {
      const cached = cache.current.get(cacheKey);
      if (cached) {
        setData(cached);
        setError(null);
        setLoading(false);
        return;
      }
    }
    abort.current?.abort();
    const controller = new AbortController();
    abort.current = controller;
    setLoading(true);
    setError(null);
    apiClient
      .get<PumpFuelDetail>("/pump-analytics/pump-detail", {
        params: { station_id: stationId, pump_id: pump.id, fuel_type: fuelType, date },
        signal: controller.signal,
      })
      .then((res) => {
        cache.current.set(cacheKey, res.data);
        setData(res.data);
      })
      .catch((err: any) => {
        if (err?.code === "ERR_CANCELED" || err?.name === "CanceledError" || err?.name === "AbortError") return;
        setError(err?.response?.data?.detail || t("st.load_failed"));
      })
      .finally(() => {
        if (abort.current === controller) setLoading(false);
      });
  };

  useEffect(() => {
    if (!isOpen) return;
    fetchDetail();
    // Tarih değişirse ya da panel kapanırsa bekleyen istek iptal edilir.
    return () => {
      abort.current?.abort();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, stationId, pump, fuelType, date]);

  // ── Esc ile kapatma ───────────────────────────────────────────────
  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [isOpen, onClose]);

  // ── Açılınca odak panele geçsin ───────────────────────────────────
  useEffect(() => {
    if (isOpen) panelRef.current?.focus();
  }, [isOpen]);

  if (!isOpen || !pump) return null;

  const hourly = data?.hourly_distribution || [];
  const maxHourAmount = Math.max(...hourly.map((h) => Number(h.amount)), 1);
  const totalAmount = Number(data?.total_amount || 0);
  const hasNoSales = !loading && !error && data !== null && data.transaction_count === 0;

  return (
    <div
      className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-0 sm:p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        ref={panelRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-label={`${pump.label} · ${fuelType}`}
        className="bg-white dark:bg-[#111218] border border-slate-200 dark:border-zinc-800 rounded-none sm:rounded-3xl w-full sm:max-w-2xl max-h-[100vh] sm:max-h-[88vh] overflow-hidden shadow-2xl flex flex-col focus:outline-none"
      >
        {/* Başlık: Pompa · Yakıt + tarih + kapat */}
        <div className="flex items-center justify-between p-5 border-b border-slate-100 dark:border-zinc-800 bg-gradient-to-r from-blue-500/10 to-indigo-500/10">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 rounded-2xl bg-blue-600 text-white flex items-center justify-center shadow-lg shadow-blue-600/30 shrink-0">
              <Fuel size={18} />
            </div>
            <div className="min-w-0">
              <h3 className="font-black text-base sm:text-lg text-slate-900 dark:text-white truncate">
                {pump.label} · {fuelType}
              </h3>
              <p className="text-[11px] text-slate-500 dark:text-slate-400 font-mono">{date}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-xl bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-slate-500 hover:text-slate-800 dark:hover:text-white transition shrink-0"
            aria-label={t("common.close")}
          >
            <X size={16} />
          </button>
        </div>

        <div className="p-5 space-y-5 overflow-y-auto">
          {/* Hata */}
          {error && (
            <div className="flex flex-wrap items-center justify-between gap-2 px-3.5 py-3 rounded-2xl bg-rose-50 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-800/50">
              <span className="text-xs font-bold text-rose-600 dark:text-rose-400 flex items-center gap-1.5">
                <AlertCircle size={14} />
                {t("st.load_failed")}
              </span>
              <button
                onClick={() => fetchDetail(true)}
                className="px-2.5 py-1 rounded-lg bg-rose-600 hover:bg-rose-700 text-white text-[11px] font-bold transition flex items-center gap-1 active:scale-95"
              >
                <RefreshCw size={11} />
                {t("st.retry")}
              </button>
            </div>
          )}

          {/* Yükleme — iskelet */}
          {loading && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {[0, 1, 2, 3].map((i) => (
                  <div key={i} className="h-20 rounded-2xl bg-slate-200/70 dark:bg-zinc-700/40 animate-pulse" />
                ))}
              </div>
              <div className="h-40 rounded-2xl bg-slate-200/70 dark:bg-zinc-700/40 animate-pulse" />
              <div className="h-32 rounded-2xl bg-slate-200/70 dark:bg-zinc-700/40 animate-pulse" />
            </div>
          )}

          {/* Veri yok */}
          {!loading && !error && hasNoSales && (
            <div className="p-8 text-center rounded-2xl bg-amber-50/70 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800/40">
              <Droplets size={28} className="mx-auto text-amber-500" />
              <p className="text-xs font-bold text-amber-700 dark:text-amber-300 mt-2">
                {t("st.no_sales_pump_fuel")}
              </p>
            </div>
          )}

          {/* İçerik */}
          {!loading && !error && data && (
            <>
              {/* Özet kartları */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="p-3.5 rounded-2xl bg-slate-50 dark:bg-[#181920] border border-slate-200/70 dark:border-zinc-800">
                  <div className="flex items-center gap-1.5 text-[10px] font-black text-slate-400 uppercase tracking-wider">
                    <Droplets size={11} className="text-blue-500" />
                    {t("st.total_liters")}
                  </div>
                  <div className="text-base font-black text-slate-900 dark:text-white font-mono mt-1.5 truncate">
                    {formatNumber(data.total_liters, 2)} Lt
                  </div>
                </div>
                <div className="p-3.5 rounded-2xl bg-slate-50 dark:bg-[#181920] border border-slate-200/70 dark:border-zinc-800">
                  <div className="flex items-center gap-1.5 text-[10px] font-black text-slate-400 uppercase tracking-wider">
                    <Receipt size={11} className="text-emerald-500" />
                    {t("st.total_amount")}
                  </div>
                  <div className="text-base font-black text-slate-900 dark:text-white font-mono mt-1.5 truncate">
                    {formatCurrency(data.total_amount)}
                  </div>
                </div>
                <div className="p-3.5 rounded-2xl bg-slate-50 dark:bg-[#181920] border border-slate-200/70 dark:border-zinc-800">
                  <div className="flex items-center gap-1.5 text-[10px] font-black text-slate-400 uppercase tracking-wider">
                    <ShoppingBag size={11} className="text-amber-500" />
                    {t("st.tx_count")}
                  </div>
                  <div className="text-base font-black text-slate-900 dark:text-white font-mono mt-1.5">
                    {formatNumber(data.transaction_count, 0)}
                  </div>
                </div>
                <div className="p-3.5 rounded-2xl bg-slate-50 dark:bg-[#181920] border border-slate-200/70 dark:border-zinc-800">
                  <div className="flex items-center gap-1.5 text-[10px] font-black text-slate-400 uppercase tracking-wider">
                    <Scale size={11} className="text-purple-500" />
                    {t("st.avg_amount")}
                  </div>
                  <div className="text-base font-black text-slate-900 dark:text-white font-mono mt-1.5 truncate">
                    {formatCurrency(data.average_transaction_amount)}
                  </div>
                </div>
              </div>

              {/* Saatlik satış grafiği (CSS çubuk, yeni bağımlılık yok) */}
              <div className="p-4 rounded-2xl bg-slate-50 dark:bg-[#181920] border border-slate-200/70 dark:border-zinc-800">
                <div className="text-[11px] font-black text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-3">
                  {t("st.hourly_sales")}
                </div>
                <div className="flex items-end gap-[2px] h-28" role="img" aria-label={t("st.hourly_sales")}>
                  {hourly.map((h, i) => {
                    const amount = Number(h.amount);
                    const pct = Math.round((amount / maxHourAmount) * 100);
                    return (
                      <div key={i} className="relative flex-1 h-full flex items-end group">
                        {/* Hover değeri */}
                        <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1.5 hidden group-hover:block z-10 pointer-events-none">
                          <div className="px-2 py-1 rounded-lg bg-slate-900 dark:bg-black text-white text-[9px] font-mono whitespace-nowrap shadow-lg">
                            {String(h.hour).padStart(2, "0")}:00 · {formatNumber(h.liters, 2)} Lt ·{" "}
                            {formatCurrency(h.amount)}
                          </div>
                        </div>
                        <div
                          className={`w-full rounded-t-sm transition-colors ${
                            h.transaction_count > 0
                              ? "bg-blue-400/70 dark:bg-blue-500/60 group-hover:bg-blue-600 dark:group-hover:bg-blue-400"
                              : "bg-slate-200 dark:bg-zinc-700/50"
                          }`}
                          style={{ height: h.transaction_count > 0 ? `${Math.max(pct, 3)}%` : "2px" }}
                        />
                      </div>
                    );
                  })}
                </div>
                {/* Saat ekseni (0-23, her 3 saatte etiket) */}
                <div className="flex gap-[2px] mt-1.5">
                  {hourly.map((h) => (
                    <div key={h.hour} className="flex-1 text-center text-[8px] font-mono text-slate-400">
                      {h.hour % 3 === 0 ? h.hour : ""}
                    </div>
                  ))}
                </div>
              </div>

              {/* Ödeme kanalı dağılımı */}
              <div className="p-4 rounded-2xl bg-slate-50 dark:bg-[#181920] border border-slate-200/70 dark:border-zinc-800 space-y-3">
                <div className="text-[11px] font-black text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                  {t("st.payment_dist")}
                </div>
                {PAYMENT_CHANNELS.map((ch) => {
                  const summary = data.payment_breakdown[ch.key];
                  const amount = Number(summary?.amount || 0);
                  const count = summary?.transaction_count || 0;
                  const pct = totalAmount > 0 ? Math.round((amount / totalAmount) * 100) : 0;
                  return (
                    <div key={ch.key}>
                      <div className="flex items-center justify-between gap-2 text-[11px] mb-1">
                        <span className={`font-black ${ch.textClass}`}>{t(ch.labelKey)}</span>
                        <span className="font-mono font-bold text-slate-600 dark:text-slate-300">
                          {formatCurrency(amount)} · {count} {t("st.tx_short")} · {pct}%
                        </span>
                      </div>
                      <div className="h-1.5 rounded-full bg-slate-200 dark:bg-zinc-700/60 overflow-hidden">
                        <div className={`h-full rounded-full ${ch.barClass}`} style={{ width: `${pct}%` }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            </>
          )}

          {/* Yükleniyor göstergesi (hata + yeniden deneme akışında) */}
          {loading && error === null && data === null && (
            <div className="flex items-center justify-center gap-2 text-xs text-slate-400">
              <Loader2 size={14} className="animate-spin" />
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
