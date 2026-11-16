import React, { useCallback, useEffect, useState } from "react";
import {
  AlertCircle,
  Banknote,
  Camera,
  Eye,
  FileCheck2,
  Loader2,
  SlidersHorizontal,
  XCircle,
} from "lucide-react";
import { apiClient } from "@/lib/api";
import { useLanguage } from "@/context/LanguageContext";
import { formatCurrency, formatDateTime, formatNumber } from "@/lib/utils";
import { apiErrorMessage, formatPlate, formatShortDate, toAmountNumber } from "@/lib/veresiye";
import { DocumentViewerModal } from "@/components/veresiye/DocumentViewerModal";
import { PaymentModal } from "@/components/veresiye/PaymentModal";
import { ReceiptUploadModal } from "@/components/veresiye/ReceiptUploadModal";
import type {
  AccountStatement,
  CollectionMethod,
  CreditAccountType,
  CreditEntryKind,
  CreditPayment,
  StatementEntry,
} from "@/types/veresiye";

interface AccountStatementPanelProps {
  accountType: CreditAccountType;
  accountId: string;
  accountName: string;
  onBalanceChanged?: () => void;
}

export const AccountStatementPanel: React.FC<AccountStatementPanelProps> = ({
  accountType,
  accountId,
  accountName,
  onBalanceChanged,
}) => {
  const { t } = useLanguage();
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [statement, setStatement] = useState<AccountStatement | null>(null);
  const [payments, setPayments] = useState<CreditPayment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [spendingMode, setSpendingMode] = useState<"daily" | "monthly">("daily");

  const [paymentModalMode, setPaymentModalMode] = useState<CreditEntryKind | null>(null);
  const [viewerDocId, setViewerDocId] = useState<string | null>(null);
  const [receiptSale, setReceiptSale] = useState<StatementEntry | null>(null);

  const [voidTarget, setVoidTarget] = useState<CreditPayment | null>(null);
  const [voidReason, setVoidReason] = useState("");
  const [voidSubmitting, setVoidSubmitting] = useState(false);
  const [voidError, setVoidError] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const basePath =
        accountType === "corporate"
          ? `/veresiye/companies/${accountId}/statement`
          : `/veresiye/customers/${accountId}/statement`;
      const stmtParams: Record<string, string> = {};
      if (dateFrom) stmtParams.date_from = dateFrom;
      if (dateTo) stmtParams.date_to = dateTo;

      const payParams: Record<string, string | boolean> = {
        include_void: true,
        ...(accountType === "corporate"
          ? { credit_company_id: accountId }
          : { credit_customer_id: accountId }),
      };

      const [stmtRes, payRes] = await Promise.all([
        apiClient.get<AccountStatement>(basePath, { params: stmtParams }),
        apiClient.get<CreditPayment[]>("/veresiye/payments", { params: payParams }),
      ]);
      setStatement(stmtRes.data);
      setPayments(payRes.data);
    } catch (err) {
      setError(apiErrorMessage(err, t("veresiye.error_load")));
    } finally {
      setLoading(false);
    }
  }, [accountId, accountType, dateFrom, dateTo, t]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const methodLabel = (m: CollectionMethod | null) => {
    if (!m) return "-";
    switch (m) {
      case "cash":
        return t("veresiye.method_cash");
      case "credit_card":
        return t("veresiye.method_credit_card");
      case "eft":
        return t("veresiye.method_eft");
      default:
        return t("veresiye.method_other");
    }
  };

  const handleVoidSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!voidTarget) return;
    setVoidSubmitting(true);
    setVoidError(null);
    try {
      await apiClient.post(`/veresiye/payments/${voidTarget.id}/void`, {
        reason: voidReason.trim(),
      });
      setVoidTarget(null);
      setVoidReason("");
      await loadData();
      onBalanceChanged?.();
    } catch (err) {
      setVoidError(apiErrorMessage(err, t("veresiye.error_save")));
    } finally {
      setVoidSubmitting(false);
    }
  };

  const handleMutationSuccess = async () => {
    await loadData();
    onBalanceChanged?.();
  };

  const periods =
    spendingMode === "daily"
      ? statement?.daily_spending ?? []
      : statement?.monthly_spending ?? [];
  const maxPeriodAmount = Math.max(1, ...periods.map((p) => toAmountNumber(p.amount)));

  return (
    <div className="space-y-5">
      {/* Toolbar: filters + actions */}
      <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-3 bg-slate-50 dark:bg-zinc-900/60 p-4 rounded-2xl border border-slate-200/70 dark:border-zinc-800">
        <div className="flex flex-wrap items-end gap-2.5">
          <div>
            <label htmlFor="stmt-from" className="block text-[11px] font-bold text-slate-500 dark:text-zinc-400 mb-1">
              {t("veresiye.date_from")}
            </label>
            <input
              id="stmt-from"
              type="date"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
              className="px-3 py-1.5 rounded-xl bg-white dark:bg-zinc-950 border border-slate-200 dark:border-zinc-800 text-xs font-semibold text-slate-800 dark:text-zinc-200"
            />
          </div>
          <div>
            <label htmlFor="stmt-to" className="block text-[11px] font-bold text-slate-500 dark:text-zinc-400 mb-1">
              {t("veresiye.date_to")}
            </label>
            <input
              id="stmt-to"
              type="date"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
              className="px-3 py-1.5 rounded-xl bg-white dark:bg-zinc-950 border border-slate-200 dark:border-zinc-800 text-xs font-semibold text-slate-800 dark:text-zinc-200"
            />
          </div>
          {(dateFrom || dateTo) && (
            <button
              type="button"
              onClick={() => {
                setDateFrom("");
                setDateTo("");
              }}
              className="px-3 py-1.5 rounded-xl bg-slate-200/70 dark:bg-zinc-800 text-xs font-bold text-slate-700 dark:text-zinc-300 hover:bg-slate-200 dark:hover:bg-zinc-700 transition"
            >
              {t("veresiye.clear_filter")}
            </button>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setPaymentModalMode("payment")}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold shadow-sm transition"
          >
            <Banknote size={14} />
            <span>{t("veresiye.record_payment")}</span>
          </button>
          <button
            type="button"
            onClick={() => setPaymentModalMode("adjustment")}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-slate-800 dark:bg-zinc-800 hover:bg-slate-900 dark:hover:bg-zinc-700 text-white text-xs font-bold transition"
          >
            <SlidersHorizontal size={14} />
            <span>{t("veresiye.record_adjustment")}</span>
          </button>
        </div>
      </div>

      {loading && !statement && (
        <div className="py-10 flex items-center justify-center gap-2 text-xs font-semibold text-slate-500 dark:text-zinc-400">
          <Loader2 size={18} className="animate-spin text-blue-600" />
          <span>{t("veresiye.loading")}</span>
        </div>
      )}

      {error && (
        <div className="px-4 py-3 rounded-2xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900/50 text-xs font-semibold text-rose-700 dark:text-rose-300">
          {error}
        </div>
      )}

      {statement && (
        <>
          {/* KPI Row */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
            <div className="p-3.5 rounded-2xl bg-slate-50 dark:bg-zinc-900/70 border border-slate-200/70 dark:border-zinc-800">
              <div className="text-[11px] font-bold text-slate-500 dark:text-zinc-400">
                {t("veresiye.kpi_total_sales")}
              </div>
              <div className="text-base font-black text-slate-900 dark:text-white mt-1">
                {formatCurrency(statement.balance.total_sales)}
              </div>
            </div>
            <div className="p-3.5 rounded-2xl bg-slate-50 dark:bg-zinc-900/70 border border-slate-200/70 dark:border-zinc-800">
              <div className="text-[11px] font-bold text-slate-500 dark:text-zinc-400">
                {t("veresiye.kpi_total_payments")}
              </div>
              <div className="text-base font-black text-emerald-600 dark:text-emerald-400 mt-1">
                {formatCurrency(statement.balance.total_payments)}
              </div>
            </div>
            <div className="p-3.5 rounded-2xl bg-blue-50/70 dark:bg-blue-950/30 border border-blue-200/70 dark:border-blue-900/50">
              <div className="text-[11px] font-bold text-blue-700 dark:text-blue-300">
                {t("veresiye.kpi_current_balance")}
              </div>
              <div className="text-base font-black text-blue-900 dark:text-blue-100 mt-1">
                {formatCurrency(statement.balance.balance)}
              </div>
            </div>
            {statement.balance.overdue_amount !== null && (
              <div className="p-3.5 rounded-2xl bg-amber-50/80 dark:bg-amber-950/30 border border-amber-200/70 dark:border-amber-900/50">
                <div className="text-[11px] font-bold text-amber-700 dark:text-amber-300">
                  {t("veresiye.kpi_overdue")}
                </div>
                <div className="text-base font-black text-amber-800 dark:text-amber-200 mt-1">
                  {formatCurrency(statement.balance.overdue_amount)}
                </div>
              </div>
            )}
            {statement.balance.credit_limit_remaining !== null && (
              <div className="p-3.5 rounded-2xl bg-slate-50 dark:bg-zinc-900/70 border border-slate-200/70 dark:border-zinc-800">
                <div className="text-[11px] font-bold text-slate-500 dark:text-zinc-400">
                  {t("veresiye.kpi_remaining_limit")}
                </div>
                <div className="text-base font-black text-slate-900 dark:text-white mt-1">
                  {formatCurrency(statement.balance.credit_limit_remaining)}
                </div>
              </div>
            )}
          </div>

          {/* Vehicle Breakdown (Corporate or non-empty) */}
          {(accountType === "corporate" || statement.vehicle_breakdown.length > 0) && (
            <div className="rounded-2xl border border-slate-200/80 dark:border-zinc-800 p-4 bg-white dark:bg-zinc-950/40">
              <h4 className="text-xs font-black text-slate-800 dark:text-zinc-200 uppercase tracking-wider mb-3">
                {t("veresiye.vehicle_breakdown_title")}
              </h4>
              {statement.vehicle_breakdown.length === 0 ? (
                <p className="text-xs text-slate-500 dark:text-zinc-400">
                  {t("veresiye.vehicle_breakdown_empty")}
                </p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-xs text-left">
                    <thead className="text-[11px] text-slate-500 dark:text-zinc-400 border-b border-slate-100 dark:border-zinc-800">
                      <tr>
                        <th className="py-2 pr-3 font-bold">{t("veresiye.plate")}</th>
                        <th className="py-2 pr-3 font-bold text-right">Satış</th>
                        <th className="py-2 pr-3 font-bold text-right">Litre</th>
                        <th className="py-2 pr-3 font-bold text-right">Tutar</th>
                        <th className="py-2 font-bold text-right">{t("veresiye.col_date")}</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-zinc-800/80">
                      {statement.vehicle_breakdown.map((v, i) => (
                        <tr key={`${v.plate}-${i}`}>
                          <td className="py-2 pr-3 font-mono font-bold text-slate-900 dark:text-white">
                            {formatPlate(v.plate)}
                          </td>
                          <td className="py-2 pr-3 text-right font-semibold text-slate-700 dark:text-zinc-300">
                            {v.sale_count}
                          </td>
                          <td className="py-2 pr-3 text-right font-semibold text-slate-700 dark:text-zinc-300">
                            {formatNumber(v.liters, 2)} L
                          </td>
                          <td className="py-2 pr-3 text-right font-black text-slate-900 dark:text-white">
                            {formatCurrency(v.amount)}
                          </td>
                          <td className="py-2 text-right text-slate-500 dark:text-zinc-400">
                            {v.last_sale_at ? formatShortDate(v.last_sale_at) : "-"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {/* Daily / Monthly Spending */}
          <div className="rounded-2xl border border-slate-200/80 dark:border-zinc-800 p-4 bg-white dark:bg-zinc-950/40">
            <div className="flex items-center justify-between gap-2 mb-3">
              <h4 className="text-xs font-black text-slate-800 dark:text-zinc-200 uppercase tracking-wider">
                {t("veresiye.spending_title")}
              </h4>
              <div className="flex items-center gap-1 p-0.5 rounded-xl bg-slate-100 dark:bg-zinc-900">
                <button
                  type="button"
                  onClick={() => setSpendingMode("daily")}
                  className={`px-2.5 py-1 rounded-lg text-[11px] font-bold transition ${
                    spendingMode === "daily"
                      ? "bg-white dark:bg-zinc-800 text-slate-900 dark:text-white shadow-sm"
                      : "text-slate-500 dark:text-zinc-400"
                  }`}
                >
                  {t("veresiye.daily")}
                </button>
                <button
                  type="button"
                  onClick={() => setSpendingMode("monthly")}
                  className={`px-2.5 py-1 rounded-lg text-[11px] font-bold transition ${
                    spendingMode === "monthly"
                      ? "bg-white dark:bg-zinc-800 text-slate-900 dark:text-white shadow-sm"
                      : "text-slate-500 dark:text-zinc-400"
                  }`}
                >
                  {t("veresiye.monthly")}
                </button>
              </div>
            </div>

            {periods.length === 0 ? (
              <p className="text-xs text-slate-500 dark:text-zinc-400">
                {t("veresiye.period_empty")}
              </p>
            ) : (
              <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
                {periods.map((p) => {
                  const pct = Math.min(100, Math.round((toAmountNumber(p.amount) / maxPeriodAmount) * 100));
                  return (
                    <div key={p.period} className="space-y-1">
                      <div className="flex items-center justify-between text-xs">
                        <span className="font-mono font-bold text-slate-700 dark:text-zinc-300">
                          {p.period}
                        </span>
                        <span className="font-semibold text-slate-500 dark:text-zinc-400">
                          {p.sale_count} satış • {formatNumber(p.liters, 1)} L •{" "}
                          <span className="font-black text-slate-900 dark:text-white">
                            {formatCurrency(p.amount)}
                          </span>
                        </span>
                      </div>
                      <div className="h-2 rounded-full bg-slate-100 dark:bg-zinc-800 overflow-hidden">
                        <div
                          className="h-full rounded-full bg-blue-600 transition-all"
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Ledger Entries */}
          <div className="rounded-2xl border border-slate-200/80 dark:border-zinc-800 p-4 bg-white dark:bg-zinc-950/40">
            <h4 className="text-xs font-black text-slate-800 dark:text-zinc-200 uppercase tracking-wider mb-3">
              {t("veresiye.ledger_entries_title")}
            </h4>
            {statement.entries.length === 0 ? (
              <p className="text-xs text-slate-500 dark:text-zinc-400">
                {t("veresiye.ledger_empty")}
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-xs text-left">
                  <thead className="text-[11px] text-slate-500 dark:text-zinc-400 border-b border-slate-100 dark:border-zinc-800">
                    <tr>
                      <th className="py-2 pr-3 font-bold">{t("veresiye.col_date")}</th>
                      <th className="py-2 pr-3 font-bold">{t("veresiye.col_description")}</th>
                      <th className="py-2 pr-3 font-bold">{t("veresiye.plate")}</th>
                      <th className="py-2 pr-3 font-bold">{t("veresiye.col_fuel_liters")}</th>
                      <th className="py-2 pr-3 font-bold text-right">{t("veresiye.col_debit")}</th>
                      <th className="py-2 pr-3 font-bold text-right">{t("veresiye.col_credit")}</th>
                      <th className="py-2 pr-3 font-bold text-right">{t("veresiye.col_balance_after")}</th>
                      <th className="py-2 font-bold text-right">{t("veresiye.col_receipt")}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-zinc-800/80">
                    {statement.entries.map((entry) => (
                      <tr key={`${entry.entry_type}-${entry.id}`}>
                        <td className="py-2.5 pr-3 whitespace-nowrap text-slate-600 dark:text-zinc-400">
                          {formatDateTime(entry.date)}
                        </td>
                        <td className="py-2.5 pr-3">
                          <div className="font-semibold text-slate-900 dark:text-white">
                            {entry.description}
                          </div>
                          {entry.driver_name && (
                            <div className="text-[11px] text-slate-500 dark:text-zinc-400">
                              {entry.driver_name}
                            </div>
                          )}
                          {entry.entry_type === "sale" && entry.identity_verified === false && (
                            <span className="inline-flex items-center gap-1 mt-0.5 px-1.5 py-0.5 rounded bg-amber-100 dark:bg-amber-950/60 text-amber-800 dark:text-amber-300 text-[10px] font-bold">
                              <AlertCircle size={10} />
                              {t("veresiye.unverified_identity")}
                            </span>
                          )}
                        </td>
                        <td className="py-2.5 pr-3 font-mono font-bold text-slate-700 dark:text-zinc-300 whitespace-nowrap">
                          {entry.plate ? formatPlate(entry.plate) : "-"}
                        </td>
                        <td className="py-2.5 pr-3 text-slate-600 dark:text-zinc-300 whitespace-nowrap">
                          {entry.fuel_type || ""}
                          {entry.liters ? ` (${formatNumber(entry.liters, 2)} L)` : ""}
                          {!entry.fuel_type && !entry.liters ? "-" : ""}
                        </td>
                        <td className="py-2.5 pr-3 text-right font-bold text-rose-600 dark:text-rose-400 whitespace-nowrap">
                          {toAmountNumber(entry.debit) > 0 ? formatCurrency(entry.debit) : "-"}
                        </td>
                        <td className="py-2.5 pr-3 text-right font-bold text-emerald-600 dark:text-emerald-400 whitespace-nowrap">
                          {toAmountNumber(entry.credit) !== 0 ? formatCurrency(entry.credit) : "-"}
                        </td>
                        <td className="py-2.5 pr-3 text-right font-black text-slate-900 dark:text-white whitespace-nowrap">
                          {formatCurrency(entry.balance_after)}
                        </td>
                        <td className="py-2.5 text-right whitespace-nowrap">
                          {entry.entry_type === "sale" ? (
                            entry.has_receipt && entry.receipt_document_id ? (
                              <button
                                type="button"
                                onClick={() => setViewerDocId(entry.receipt_document_id)}
                                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-emerald-50 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-300 text-[11px] font-bold hover:bg-emerald-100 transition"
                              >
                                <Eye size={12} />
                                {t("veresiye.view_receipt")}
                              </button>
                            ) : (
                              <button
                                type="button"
                                onClick={() => setReceiptSale(entry)}
                                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-amber-50 dark:bg-amber-950/50 text-amber-700 dark:text-amber-300 text-[11px] font-bold hover:bg-amber-100 transition"
                              >
                                <Camera size={12} />
                                {t("veresiye.upload_receipt")}
                              </button>
                            )
                          ) : (
                            <span className="inline-flex items-center gap-1 text-[11px] text-slate-400">
                              <FileCheck2 size={12} />
                            </span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Payment history */}
          <div className="rounded-2xl border border-slate-200/80 dark:border-zinc-800 p-4 bg-white dark:bg-zinc-950/40">
            <h4 className="text-xs font-black text-slate-800 dark:text-zinc-200 uppercase tracking-wider mb-3">
              {t("veresiye.payments_history_title")}
            </h4>
            {payments.length === 0 ? (
              <p className="text-xs text-slate-500 dark:text-zinc-400">
                {t("veresiye.payments_empty")}
              </p>
            ) : (
              <div className="space-y-2">
                {payments.map((p) => {
                  const isVoided = Boolean(p.voided_at);
                  return (
                    <div
                      key={p.id}
                      className={`flex flex-col sm:flex-row sm:items-center justify-between gap-2 p-3 rounded-xl border ${
                        isVoided
                          ? "bg-slate-50/50 dark:bg-zinc-900/30 border-slate-200/50 dark:border-zinc-800/50 opacity-70"
                          : "bg-slate-50 dark:bg-zinc-900/60 border-slate-200/80 dark:border-zinc-800"
                      }`}
                    >
                      <div className="space-y-0.5 text-xs">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className={`font-black ${isVoided ? "line-through text-slate-400" : "text-slate-900 dark:text-white"}`}>
                            {formatCurrency(p.amount)}
                          </span>
                          <span className="px-2 py-0.5 rounded-lg bg-slate-200/70 dark:bg-zinc-800 text-[10px] font-bold text-slate-700 dark:text-zinc-300">
                            {p.kind === "adjustment" ? t("veresiye.adjustment_mode") : methodLabel(p.method)}
                          </span>
                          <span className="text-[11px] text-slate-500 dark:text-zinc-400">
                            {formatDateTime(p.payment_date)}
                          </span>
                          {isVoided && (
                            <span className="px-2 py-0.5 rounded-lg bg-rose-100 dark:bg-rose-950/60 text-rose-700 dark:text-rose-300 text-[10px] font-bold">
                              {t("veresiye.voided_badge")}
                            </span>
                          )}
                        </div>
                        {(p.reference || p.note || p.void_reason) && (
                          <div className="text-[11px] text-slate-500 dark:text-zinc-400">
                            {p.reference ? `Ref: ${p.reference} • ` : ""}
                            {p.note || ""}
                            {p.void_reason ? ` (${p.void_reason})` : ""}
                          </div>
                        )}
                      </div>

                      {!isVoided && (
                        <button
                          type="button"
                          onClick={() => {
                            setVoidTarget(p);
                            setVoidReason("");
                            setVoidError(null);
                          }}
                          className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[11px] font-bold text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/40 self-start sm:self-center transition"
                        >
                          <XCircle size={13} />
                          <span>{t("veresiye.void_payment")}</span>
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            )}

            {voidTarget && (
              <form
                onSubmit={handleVoidSubmit}
                className="mt-3 p-3.5 rounded-xl bg-rose-50 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-900/50 space-y-2.5"
              >
                <div className="text-xs font-bold text-rose-900 dark:text-rose-200">
                  {t("veresiye.void_reason_prompt")} ({formatCurrency(voidTarget.amount)})
                </div>
                <input
                  type="text"
                  minLength={3}
                  required
                  value={voidReason}
                  onChange={(e) => setVoidReason(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl bg-white dark:bg-zinc-950 border border-rose-200 dark:border-rose-900 text-xs text-slate-900 dark:text-white"
                />
                {voidError && (
                  <div className="text-xs font-semibold text-rose-700 dark:text-rose-300">
                    {voidError}
                  </div>
                )}
                <div className="flex items-center justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => setVoidTarget(null)}
                    className="px-3 py-1.5 rounded-lg text-xs font-bold text-slate-600 dark:text-zinc-300"
                  >
                    {t("veresiye.cancel")}
                  </button>
                  <button
                    type="submit"
                    disabled={voidSubmitting || voidReason.trim().length < 3}
                    className="px-3 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-700 disabled:opacity-50 text-white text-xs font-bold"
                  >
                    {t("veresiye.void_payment")}
                  </button>
                </div>
              </form>
            )}
          </div>
        </>
      )}

      <PaymentModal
        open={paymentModalMode !== null}
        accountType={accountType}
        accountId={accountId}
        accountName={accountName}
        initialMode={paymentModalMode ?? "payment"}
        onClose={() => setPaymentModalMode(null)}
        onSuccess={handleMutationSuccess}
      />

      <DocumentViewerModal
        documentId={viewerDocId}
        onClose={() => setViewerDocId(null)}
      />

      <ReceiptUploadModal
        saleId={receiptSale?.id ?? null}
        summaryText={
          receiptSale
            ? `${accountName} • ${formatPlate(receiptSale.plate)} • ${formatCurrency(receiptSale.debit)}`
            : undefined
        }
        onClose={() => setReceiptSale(null)}
        onSuccess={handleMutationSuccess}
      />
    </div>
  );
};
