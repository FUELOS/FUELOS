import React, { useState, useEffect, useCallback } from "react";
import { apiClient } from "@/lib/api";
import { Transaction, Station } from "@/types";
import { formatCurrency, formatNumber, formatDateTime } from "@/lib/utils";
import { useLanguage } from "@/context/LanguageContext";
import { AddTransactionModal } from "@/components/modals/AddTransactionModal";
import {
  Receipt,
  PlusCircle,
  RefreshCw,
  Fuel,
  ShoppingBag,
  MoreHorizontal,
  Loader2,
  Wallet,
  CreditCard,
  Building,
  ChevronRight,
} from "lucide-react";

export const TransactionsPage: React.FC = () => {
  const { t, language } = useLanguage();
  const tr = language === "tr";

  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [stations, setStations] = useState<Station[]>([]);
  const [selectedStationId, setSelectedStationId] = useState<string>("");
  const [activeShifts, setActiveShifts] = useState<any[]>([]);
  const [summary, setSummary] = useState<any>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [refreshing, setRefreshing] = useState<boolean>(false);
  const [isAddModalOpen, setIsAddModalOpen] = useState<boolean>(false);

  const fetchData = useCallback(async () => {
    try {
      setRefreshing(true);
      const params = selectedStationId ? `?station_id=${selectedStationId}` : "";
      const [txRes, sumRes, stRes, dashRes] = await Promise.all([
        apiClient.get<Transaction[]>(`/transactions${params}`),
        apiClient.get(`/transactions/summary${params}`),
        apiClient.get<Station[]>("/stations").catch(() => ({ data: [] })),
        apiClient.get("/dashboard").catch(() => ({ data: { active_shifts: [] } })),
      ]);

      setTransactions(txRes.data);
      setSummary(sumRes.data);
      setStations(stRes.data);
      setActiveShifts(dashRes.data?.active_shifts || []);
    } catch (err) {
      console.error("İşlemler yüklenemedi", err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [selectedStationId]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const getTypeBadge = (type: string) => {
    switch (type) {
      case "fuel":
        return (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-amber-50 text-amber-700 border border-amber-200">
            <Fuel size={13} /> {t("tx.fuel")}
          </span>
        );
      case "market":
        return (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-blue-50 text-blue-700 border border-blue-200">
            <ShoppingBag size={13} /> {t("tx.market")}
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-purple-50 text-purple-700 border border-purple-200">
            <MoreHorizontal size={13} /> {t("tx.other")}
          </span>
        );
    }
  };

  const getPaymentBadge = (method: string) => {
    switch (method) {
      case "cash":
        return <span className="text-emerald-600 font-bold text-xs flex items-center gap-1.5"><Wallet size={13} /> {t("tx.cash")}</span>;
      case "credit_card":
        return <span className="text-blue-600 font-bold text-xs flex items-center gap-1.5"><CreditCard size={13} /> {t("tx.pos")}</span>;
      case "eft":
        return <span className="text-indigo-600 font-bold text-xs flex items-center gap-1.5"><Building size={13} /> {t("tx.fast")}</span>;
      case "veresiye":
        return <span className="text-amber-600 font-bold text-xs flex items-center gap-1.5"><Receipt size={13} /> {t("tx.credit")}</span>;
      default:
        return <span className="text-slate-500 text-xs">{method}</span>;
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">
            <span>{t("tx.breadcrumb")}</span>
            <ChevronRight size={12} />
            <span className="text-amber-500">{t("tx.sub_breadcrumb")}</span>
          </div>
          <h1 className="text-2xl font-black text-slate-800 dark:text-white tracking-tight flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-zinc-900 flex items-center justify-center text-white shadow-md">
              <Receipt size={20} />
            </div>
            <span>{t("tx.title")}</span>
          </h1>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
            {t("tx.subtitle")}
          </p>
        </div>

        <div className="flex items-center gap-3">
          {stations.length > 0 && (
            <select
              value={selectedStationId}
              onChange={(e) => setSelectedStationId(e.target.value)}
              className="bg-white dark:bg-[#111218] border border-slate-200 dark:border-zinc-800 rounded-2xl px-3.5 py-2.5 text-xs font-bold text-slate-700 dark:text-slate-200 focus:outline-none focus:border-amber-500 transition shadow-sm"
            >
              <option value="">{t("header.all_stations")}</option>
              {stations.map((st) => (
                <option key={st.id} value={st.id}>
                  {st.name} ({st.code})
                </option>
              ))}
            </select>
          )}

          <button
            onClick={fetchData}
            disabled={refreshing}
            className="p-2.5 rounded-2xl bg-white dark:bg-[#111218] border border-slate-200 dark:border-zinc-800 text-slate-600 dark:text-slate-300 hover:text-slate-900 hover:bg-slate-50 transition shadow-sm"
            title={t("header.refresh")}
          >
            <RefreshCw size={16} className={refreshing ? "animate-spin text-amber-500" : ""} />
          </button>

          <button
            onClick={() => setIsAddModalOpen(true)}
            className="px-4 py-2.5 rounded-2xl bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600 text-slate-950 text-xs font-black flex items-center gap-2 shadow-md shadow-amber-500/25 transition active:scale-95"
          >
            <PlusCircle size={15} />
            <span>{t("tx.new_record")}</span>
          </button>
        </div>
      </div>

      {/* Summary Highlight Cards */}
      {summary && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 bg-white dark:bg-[#111218] p-5 border border-slate-100 dark:border-zinc-800 rounded-3xl shadow-sm">
          <div>
            <div className="text-[11px] font-bold text-slate-400 uppercase tracking-widest">{t("tx.card_total_rev")}</div>
            <div className="text-xl font-black text-slate-800 dark:text-white mt-1">{formatCurrency(summary.total_amount)}</div>
          </div>
          <div>
            <div className="text-[11px] font-bold text-slate-400 uppercase tracking-widest">{t("tx.card_total_liters")}</div>
            <div className="text-xl font-black text-amber-600 dark:text-amber-400 mt-1">{formatNumber(summary.total_fuel_liters, 2)} Lt</div>
          </div>
          <div>
            <div className="text-[11px] font-bold text-slate-400 uppercase tracking-widest">{t("tx.card_cash_pos")}</div>
            <div className="text-xs font-bold text-slate-700 dark:text-slate-300 mt-2 flex items-center gap-2">
              <span className="text-emerald-600 dark:text-emerald-400">{formatCurrency(summary.cash_total)}</span>
              <span className="text-slate-400">/</span>
              <span className="text-blue-600 dark:text-sky-400">{formatCurrency(summary.credit_card_total)}</span>
            </div>
          </div>
          <div>
            <div className="text-[11px] font-bold text-slate-400 uppercase tracking-widest">{t("tx.card_credit")}</div>
            <div className="text-xl font-black text-amber-600 dark:text-amber-400 mt-1">{formatCurrency(summary.veresiye_total)}</div>
          </div>
        </div>
      )}

      {loading ? (
        <div className="flex justify-center p-12 text-slate-400">
          <Loader2 size={36} className="animate-spin text-amber-500" />
        </div>
      ) : transactions.length === 0 ? (
        <div className="p-10 text-center bg-white dark:bg-[#111218] border border-slate-100 dark:border-zinc-800 rounded-3xl text-slate-500 dark:text-slate-400 text-sm shadow-sm">
          {t("tx.no_records")}
        </div>
      ) : (
        <div className="overflow-x-auto bg-white dark:bg-[#111218] border border-slate-100 dark:border-zinc-800 rounded-3xl shadow-sm">
          <table className="w-full text-left text-sm text-slate-600 dark:text-slate-300">
            <thead className="bg-[#f8fafc] dark:bg-[#111218]/60 text-slate-400 uppercase text-[11px] font-bold border-b border-slate-100 dark:border-zinc-800">
              <tr>
                <th className="px-5 py-3.5">{t("tx.col_time")}</th>
                <th className="px-5 py-3.5">{t("tx.col_type")}</th>
                <th className="px-5 py-3.5">{t("tx.col_product")}</th>
                <th className="px-5 py-3.5">{t("tx.col_amount_liters")}</th>
                <th className="px-5 py-3.5">{t("tx.col_total")}</th>
                <th className="px-5 py-3.5">{t("tx.col_channel")}</th>
                <th className="px-5 py-3.5">{t("tx.col_note")}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60 font-normal">
              {transactions.map((tx) => (
                <tr key={tx.id} className="hover:bg-slate-50/80 dark:hover:bg-slate-800/40 transition">
                  <td className="px-5 py-3.5 text-slate-500 dark:text-slate-400 font-mono text-xs">
                    {formatDateTime(tx.transaction_time)}
                  </td>
                  <td className="px-5 py-3.5">{getTypeBadge(tx.type)}</td>
                  <td className="px-5 py-3.5 text-slate-800 dark:text-white font-semibold">
                    {tx.fuel_type || (tx.type === "market" ? (tr ? "Market Satışı" : "Convenience Sale") : "—")}
                  </td>
                  <td className="px-5 py-3.5 font-mono font-medium text-slate-600 dark:text-slate-300">
                    {tx.liters ? `${formatNumber(tx.liters, 2)} Lt` : "—"}
                  </td>
                  <td className="px-5 py-3.5 font-mono font-black text-slate-900 dark:text-white text-base">
                    {formatCurrency(tx.amount)}
                  </td>
                  <td className="px-5 py-3.5">{getPaymentBadge(tx.payment_method)}</td>
                  <td className="px-5 py-3.5 text-slate-500 dark:text-slate-400 text-xs truncate max-w-xs">
                    {tx.description || "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <AddTransactionModal
        isOpen={isAddModalOpen}
        activeShifts={activeShifts}
        onClose={() => setIsAddModalOpen(false)}
        onSuccess={fetchData}
      />
    </div>
  );
};
