import React, { useState, useEffect, useCallback } from "react";
import { apiClient } from "@/lib/api";
import { Transaction, Station } from "@/types";
import { formatCurrency, formatNumber, formatDateTime } from "@/lib/utils";
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
            <Fuel size={13} /> Akaryakıt
          </span>
        );
      case "market":
        return (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-blue-50 text-blue-700 border border-blue-200">
            <ShoppingBag size={13} /> Market
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-purple-50 text-purple-700 border border-purple-200">
            <MoreHorizontal size={13} /> Diğer
          </span>
        );
    }
  };

  const getPaymentBadge = (method: string) => {
    switch (method) {
      case "cash":
        return <span className="text-emerald-600 font-bold text-xs flex items-center gap-1.5"><Wallet size={13} /> Nakit</span>;
      case "credit_card":
        return <span className="text-blue-600 font-bold text-xs flex items-center gap-1.5"><CreditCard size={13} /> POS / Kart</span>;
      case "eft":
        return <span className="text-indigo-600 font-bold text-xs flex items-center gap-1.5"><Building size={13} /> EFT / Havale</span>;
      case "veresiye":
        return <span className="text-amber-600 font-bold text-xs flex items-center gap-1.5"><Receipt size={13} /> Veresiye</span>;
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
            <span>Operasyon</span>
            <ChevronRight size={12} />
            <span className="text-amber-500">Satış Defteri</span>
          </div>
          <h1 className="text-2xl font-black text-slate-800 tracking-tight flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-zinc-900 flex items-center justify-center text-white shadow-md">
              <Receipt size={20} />
            </div>
            <span>Satış ve İşlem Kayıtları</span>
          </h1>
          <p className="text-xs text-slate-500 mt-1">
            Akaryakıt pompaları ve istasyon marketinden yapılan gerçek zamanlı işlem akışı
          </p>
        </div>

        <div className="flex items-center gap-3">
          {stations.length > 0 && (
            <select
              value={selectedStationId}
              onChange={(e) => setSelectedStationId(e.target.value)}
              className="bg-white border border-slate-200 rounded-2xl px-3.5 py-2.5 text-xs font-bold text-slate-700 focus:outline-none focus:border-amber-500 transition shadow-sm"
            >
              <option value="">Tüm İstasyonlar</option>
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
            className="p-2.5 rounded-2xl bg-white border border-slate-200 text-slate-600 hover:text-slate-900 hover:bg-slate-50 transition shadow-sm"
            title="Yenile"
          >
            <RefreshCw size={16} className={refreshing ? "animate-spin text-amber-500" : ""} />
          </button>

          <button
            onClick={() => setIsAddModalOpen(true)}
            className="px-4 py-2.5 rounded-2xl bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600 text-slate-950 text-xs font-black flex items-center gap-2 shadow-md shadow-amber-500/25 transition active:scale-95"
          >
            <PlusCircle size={15} />
            <span>Yeni Satış Kaydı</span>
          </button>
        </div>
      </div>

      {/* Summary Highlight Cards */}
      {summary && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 bg-white dark:bg-slate-900/90 p-5 border border-slate-100 dark:border-slate-800 rounded-3xl shadow-md dark:shadow-xl shadow-slate-200/60 dark:shadow-slate-950/50">
          <div>
            <div className="text-[11px] font-bold text-slate-400 uppercase tracking-widest">TOPLAM CİRO HACMİ</div>
            <div className="text-xl font-black text-slate-800 dark:text-white mt-1">{formatCurrency(summary.total_amount)}</div>
          </div>
          <div>
            <div className="text-[11px] font-bold text-slate-400 uppercase tracking-widest">TOPLAM YAKIT LİTRESİ</div>
            <div className="text-xl font-black text-amber-600 dark:text-amber-400 mt-1">{formatNumber(summary.total_fuel_liters, 2)} Lt</div>
          </div>
          <div>
            <div className="text-[11px] font-bold text-slate-400 uppercase tracking-widest">NAKİT / POS DAĞILIMI</div>
            <div className="text-xs font-bold text-slate-700 dark:text-slate-300 mt-2 flex items-center gap-2">
              <span className="text-emerald-600 dark:text-emerald-400">{formatCurrency(summary.cash_total)}</span>
              <span className="text-slate-400">/</span>
              <span className="text-blue-600 dark:text-sky-400">{formatCurrency(summary.credit_card_total)}</span>
            </div>
          </div>
          <div>
            <div className="text-[11px] font-bold text-slate-400 uppercase tracking-widest">VERESİYE ALACAKLAR</div>
            <div className="text-xl font-black text-amber-600 dark:text-amber-400 mt-1">{formatCurrency(summary.veresiye_total)}</div>
          </div>
        </div>
      )}

      {loading ? (
        <div className="flex justify-center p-12 text-slate-400">
          <Loader2 size={36} className="animate-spin text-amber-500" />
        </div>
      ) : transactions.length === 0 ? (
        <div className="p-10 text-center bg-white dark:bg-slate-900/90 border border-slate-100 dark:border-slate-800 rounded-3xl text-slate-500 dark:text-slate-400 text-sm shadow-sm">
          Henüz kayıtlı bir satış/işlem bulunmuyor.
        </div>
      ) : (
        <div className="overflow-x-auto bg-white dark:bg-slate-900/90 border border-slate-100 dark:border-slate-800 rounded-3xl shadow-md dark:shadow-xl shadow-slate-200/60 dark:shadow-slate-950/50">
          <table className="w-full text-left text-sm text-slate-600 dark:text-slate-300">
            <thead className="bg-[#f8fafc] dark:bg-slate-950/60 text-slate-400 uppercase text-[11px] font-bold border-b border-slate-100 dark:border-slate-800">
              <tr>
                <th className="px-5 py-3.5">İşlem Saati</th>
                <th className="px-5 py-3.5">Tür</th>
                <th className="px-5 py-3.5">Ürün / Yakıt Türü</th>
                <th className="px-5 py-3.5">Miktar (Litre)</th>
                <th className="px-5 py-3.5">Tutar</th>
                <th className="px-5 py-3.5">Ödeme Kanalı</th>
                <th className="px-5 py-3.5">Açıklama / Plaka</th>
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
                    {tx.fuel_type || (tx.type === "market" ? "Market Satışı" : "—")}
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
