import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertCircle,
  AlertTriangle,
  Banknote,
  Building2,
  Calendar,
  CheckCircle2,
  CreditCard,
  Info,
  Link2,
  Loader2,
  RefreshCw,
  ShieldCheck,
  Upload,
  UserCircle2,
  Wallet,
} from "lucide-react";
import { apiClient } from "@/lib/api";
import { useLanguage } from "@/context/LanguageContext";
import { formatCurrency, formatDateTime, formatNumber } from "@/lib/utils";
import { apiErrorMessage, toAmountNumber } from "@/lib/veresiye";
import { LinkCreditSaleModal } from "@/components/sales/LinkCreditSaleModal";
import { ReceiptUploadModal } from "@/components/veresiye/ReceiptUploadModal";
import { ProofViewerModal } from "@/components/reconciliation/ProofViewerModal";
import type {
  DailyReconciliation,
  ReconciliationIssue,
  SalesChannel,
} from "@/types/veresiye";

interface DailyReconciliationTabProps {
  selectedStationId: string;
}

function getIstanbulTodayIso(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Istanbul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

const CHANNEL_STYLE: Record<
  SalesChannel,
  { badge: string; card: string; icon: React.ComponentType<{ size?: number }> }
> = {
  cash: {
    badge: "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300",
    card: "border-emerald-200/70 dark:border-emerald-800/40",
    icon: Wallet,
  },
  credit_card: {
    badge: "bg-blue-100 text-blue-700 dark:bg-blue-950/50 dark:text-blue-300",
    card: "border-blue-200/70 dark:border-blue-800/40",
    icon: CreditCard,
  },
  eft: {
    badge: "bg-indigo-100 text-indigo-700 dark:bg-indigo-950/50 dark:text-indigo-300",
    card: "border-indigo-200/70 dark:border-indigo-800/40",
    icon: Banknote,
  },
  corporate_veresiye: {
    badge: "bg-amber-100 text-amber-800 dark:bg-amber-950/50 dark:text-amber-300",
    card: "border-amber-200/70 dark:border-amber-800/40",
    icon: Building2,
  },
  individual_veresiye: {
    badge: "bg-purple-100 text-purple-700 dark:bg-purple-950/50 dark:text-purple-300",
    card: "border-purple-200/70 dark:border-purple-800/40",
    icon: UserCircle2,
  },
  unlinked_veresiye: {
    badge: "bg-red-100 text-red-700 dark:bg-red-950/50 dark:text-red-300",
    card: "border-red-300 dark:border-red-800/60 bg-red-50/40 dark:bg-red-950/15",
    icon: AlertTriangle,
  },
};

export const DailyReconciliationTab: React.FC<DailyReconciliationTabProps> = ({
  selectedStationId,
}) => {
  const { t, language } = useLanguage();
  const isTr = language === "tr";

  const [selectedDate, setSelectedDate] = useState<string>(() => getIstanbulTodayIso());
  const [data, setData] = useState<DailyReconciliation | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [refreshing, setRefreshing] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [forbidden, setForbidden] = useState<boolean>(false);

  const [uploadTarget, setUploadTarget] = useState<{
    saleId: string;
    summaryText: string;
  } | null>(null);
  const [linkTarget, setLinkTarget] = useState<{
    txId: string;
    summaryText: string;
  } | null>(null);
  const [proofTarget, setProofTarget] = useState<{
    shiftId: string;
    shiftLabel: string;
  } | null>(null);

  const fetchReconciliation = useCallback(async () => {
    try {
      setRefreshing(true);
      setErrorMsg(null);
      setForbidden(false);
      const query = new URLSearchParams({ date: selectedDate });
      if (selectedStationId) {
        query.set("station_id", selectedStationId);
      }
      const res = await apiClient.get<DailyReconciliation>(
        `/veresiye/reconciliation/daily?${query.toString()}`
      );
      setData(res.data);
    } catch (err: any) {
      if (err?.response?.status === 403) {
        setForbidden(true);
        setErrorMsg(t("recon.manager_only"));
      } else {
        setErrorMsg(
          apiErrorMessage(
            err,
            isTr
              ? "Günlük mutabakat verisi yüklenemedi"
              : "Failed to load daily reconciliation"
          )
        );
      }
      setData(null);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [selectedDate, selectedStationId, t, isTr]);

  useEffect(() => {
    fetchReconciliation();
  }, [fetchReconciliation]);

  const { errorIssues, warningIssues } = useMemo(() => {
    const errors: ReconciliationIssue[] = [];
    const warnings: ReconciliationIssue[] = [];
    for (const issue of data?.issues ?? []) {
      if (issue.severity === "error") {
        errors.push(issue);
      } else {
        warnings.push(issue);
      }
    }
    return { errorIssues: errors, warningIssues: warnings };
  }, [data]);

  const visibleChannels = useMemo(() => {
    return (data?.channels ?? []).filter(
      (ch) => ch.channel !== "unlinked_veresiye" || toAmountNumber(ch.amount) > 0
    );
  }, [data]);

  const renderIssueTitle = (code: ReconciliationIssue["code"]) => {
    const key = `recon.issue_${code}`;
    const label = t(key);
    return label === key ? code : label;
  };

  const renderCollectionMethod = (method: string) => {
    if (method === "cash") return t("tx.cash");
    if (method === "credit_card") return t("tx.pos");
    if (method === "eft") return t("tx.fast");
    return t("tx.other");
  };

  const renderIssueCard = (issue: ReconciliationIssue, idx: number) => {
    const isErr = issue.severity === "error";
    return (
      <div
        key={`${issue.code}-${issue.credit_sale_id || issue.transaction_id || issue.shift_id || idx}`}
        className={`p-3.5 rounded-2xl border flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs ${
          isErr
            ? "bg-red-50/70 dark:bg-red-950/20 border-red-200 dark:border-red-800/50"
            : "bg-amber-50/70 dark:bg-amber-950/20 border-amber-200 dark:border-amber-800/50"
        }`}
      >
        <div className="space-y-1 min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span
              className={`font-black ${
                isErr
                  ? "text-red-800 dark:text-red-300"
                  : "text-amber-800 dark:text-amber-300"
              }`}
            >
              {renderIssueTitle(issue.code)}
            </span>
            {issue.account_name && (
              <span className="px-2 py-0.5 rounded-full bg-white/80 dark:bg-zinc-900 border border-slate-200 dark:border-zinc-700 font-bold text-slate-700 dark:text-zinc-200">
                {issue.account_name}
              </span>
            )}
            {issue.amount !== null && issue.amount !== undefined && (
              <span className="font-mono font-black text-slate-900 dark:text-white">
                {formatCurrency(issue.amount)}
              </span>
            )}
          </div>
          <p
            className={
              isErr
                ? "text-red-700/90 dark:text-red-300/90"
                : "text-amber-800/90 dark:text-amber-200/90"
            }
          >
            {issue.message}
          </p>
          {issue.occurred_at && (
            <div className="text-[11px] text-slate-500 dark:text-zinc-400 font-mono">
              {formatDateTime(issue.occurred_at)}
            </div>
          )}
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {issue.code === "missing_receipt" && issue.credit_sale_id && (
            <button
              type="button"
              onClick={() =>
                setUploadTarget({
                  saleId: issue.credit_sale_id!,
                  summaryText: `${issue.account_name || "—"} • ${
                    issue.amount !== null ? formatCurrency(issue.amount) : ""
                  }`,
                })
              }
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-[11px] transition"
            >
              <Upload size={12} />
              {t("veresiye.upload_receipt_btn")}
            </button>
          )}
          {issue.code === "unlinked_veresiye" && issue.transaction_id && (
            <button
              type="button"
              onClick={() =>
                setLinkTarget({
                  txId: issue.transaction_id!,
                  summaryText:
                    issue.amount !== null ? formatCurrency(issue.amount) : "",
                })
              }
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-[11px] transition"
            >
              <Link2 size={12} />
              {t("creditsale.link_account_btn")}
            </button>
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-5">
      {/* Controls bar */}
      <div className="bg-white dark:bg-[#111218] border border-slate-100 dark:border-zinc-800 rounded-2xl p-4 flex flex-wrap items-center justify-between gap-3 shadow-sm">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2 text-xs font-bold text-slate-500 dark:text-zinc-400">
            <Calendar size={15} className="text-indigo-500" />
            <span>{t("recon.date_label")}:</span>
          </div>
          <input
            type="date"
            value={selectedDate}
            onChange={(e) => setSelectedDate(e.target.value)}
            className="bg-slate-50 dark:bg-zinc-900 border border-slate-200 dark:border-zinc-700 rounded-xl px-3 py-1.5 text-xs font-mono font-bold text-slate-800 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
          {data?.station_name && (
            <span className="px-2.5 py-1 rounded-full bg-slate-100 dark:bg-zinc-800 text-xs font-bold text-slate-700 dark:text-zinc-300">
              {data.station_name}
            </span>
          )}
        </div>

        <button
          type="button"
          onClick={fetchReconciliation}
          disabled={refreshing}
          className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-700 text-slate-700 dark:text-zinc-200 text-xs font-bold hover:bg-slate-50 dark:hover:bg-zinc-800 transition disabled:opacity-50"
        >
          <RefreshCw size={14} className={refreshing ? "animate-spin" : ""} />
          <span>{t("common.refresh")}</span>
        </button>
      </div>

      {loading ? (
        <div className="h-56 flex items-center justify-center text-slate-400 text-xs gap-2">
          <Loader2 size={20} className="animate-spin text-indigo-500" />
          <span>{t("common.loading")}</span>
        </div>
      ) : errorMsg ? (
        <div
          className={`p-5 rounded-3xl border flex items-start gap-3 text-sm ${
            forbidden
              ? "bg-amber-50 dark:bg-amber-950/20 border-amber-200 dark:border-amber-800/40 text-amber-800 dark:text-amber-300"
              : "bg-red-50 dark:bg-red-950/20 border-red-200 dark:border-red-800/40 text-red-700 dark:text-red-300"
          }`}
        >
          <AlertCircle size={18} className="shrink-0 mt-0.5" />
          <span>{errorMsg}</span>
        </div>
      ) : data ? (
        <>
          {/* Status banner + Totals */}
          <div
            className={`rounded-3xl border p-5 flex flex-col md:flex-row md:items-center justify-between gap-4 shadow-sm ${
              data.status === "matched"
                ? "bg-emerald-50/80 dark:bg-emerald-950/25 border-emerald-200 dark:border-emerald-800/50"
                : data.status === "attention"
                ? "bg-amber-50/80 dark:bg-amber-950/25 border-amber-200 dark:border-amber-800/50"
                : "bg-red-50/80 dark:bg-red-950/25 border-red-200 dark:border-red-800/50"
            }`}
          >
            <div className="flex items-start gap-3">
              <div
                className={`w-10 h-10 rounded-2xl flex items-center justify-center shrink-0 ${
                  data.status === "matched"
                    ? "bg-emerald-600 text-white"
                    : data.status === "attention"
                    ? "bg-amber-500 text-white"
                    : "bg-red-600 text-white"
                }`}
              >
                {data.status === "matched" ? (
                  <CheckCircle2 size={20} />
                ) : data.status === "attention" ? (
                  <AlertTriangle size={20} />
                ) : (
                  <AlertCircle size={20} />
                )}
              </div>
              <div>
                <div className="text-sm font-black text-slate-900 dark:text-white">
                  {data.status === "matched"
                    ? t("recon.status_matched")
                    : data.status === "attention"
                    ? t("recon.status_attention")
                    : t("recon.status_mismatch")}
                </div>
                <div className="text-xs text-slate-600 dark:text-zinc-300 mt-0.5">
                  {data.station_name} · {data.date} ·{" "}
                  {t("recon.tx_count").replace("{count}", String(data.transaction_count))}
                </div>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-6">
              <div>
                <div className="text-[11px] font-bold uppercase text-slate-500 dark:text-zinc-400">
                  {t("recon.all_channels_total")}
                </div>
                <div className="text-2xl font-black text-slate-900 dark:text-white font-mono">
                  {formatCurrency(data.total_sales)}
                </div>
              </div>
              <div>
                <div className="text-[11px] font-bold uppercase text-slate-500 dark:text-zinc-400">
                  {isTr ? "Toplam Hacim" : "Total Liters"}
                </div>
                <div className="text-lg font-black text-slate-700 dark:text-zinc-200 font-mono">
                  {formatNumber(data.total_liters, 2)} L
                </div>
              </div>
            </div>
          </div>

          {/* Channels Grid */}
          <div className="space-y-2.5">
            <h3 className="text-xs font-black uppercase tracking-wider text-slate-500 dark:text-zinc-400">
              {t("recon.channels_title")}
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {visibleChannels.map((ch) => {
                const style = CHANNEL_STYLE[ch.channel];
                const Icon = style.icon;
                return (
                  <div
                    key={ch.channel}
                    className={`bg-white dark:bg-[#111218] border rounded-2xl p-4 flex items-center justify-between gap-3 shadow-sm ${style.card}`}
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div
                        className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${style.badge}`}
                      >
                        <Icon size={18} />
                      </div>
                      <div className="min-w-0">
                        <div className="text-xs font-bold text-slate-700 dark:text-zinc-200 truncate">
                          {t(`recon.channel_${ch.channel}`)}
                        </div>
                        <div className="text-[11px] text-slate-400 font-medium mt-0.5">
                          {t("recon.tx_count").replace("{count}", String(ch.count))} ·{" "}
                          {formatNumber(ch.liters, 1)} L
                        </div>
                      </div>
                    </div>
                    <div className="text-base font-black text-slate-900 dark:text-white font-mono shrink-0">
                      {formatCurrency(ch.amount)}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Automation vs Ledger comparison */}
          <div className="bg-white dark:bg-[#111218] border border-slate-100 dark:border-zinc-800 rounded-3xl p-5 shadow-sm space-y-3">
            <h3 className="text-sm font-black text-slate-900 dark:text-white">
              {t("recon.comparison_title")}
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="p-4 rounded-2xl bg-slate-50 dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800">
                <div className="text-xs font-bold text-slate-500 dark:text-zinc-400">
                  {t("recon.automation_total")}
                </div>
                <div className="text-xl font-black text-slate-900 dark:text-white font-mono mt-1">
                  {formatCurrency(data.automation_veresiye_total)}
                </div>
              </div>
              <div className="p-4 rounded-2xl bg-slate-50 dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800">
                <div className="text-xs font-bold text-slate-500 dark:text-zinc-400">
                  {t("recon.ledger_total")}
                </div>
                <div className="text-xl font-black text-slate-900 dark:text-white font-mono mt-1">
                  {formatCurrency(data.ledger_veresiye_total)}
                </div>
                <div className="text-[11px] text-slate-500 dark:text-zinc-400 mt-1">
                  {t("creditsale.corp_short")}: {formatCurrency(data.corporate_veresiye_total)} ·{" "}
                  {t("creditsale.indiv_short")}: {formatCurrency(data.individual_veresiye_total)}
                </div>
              </div>
              <div
                className={`p-4 rounded-2xl border ${
                  toAmountNumber(data.veresiye_difference) === 0
                    ? "bg-emerald-50/70 dark:bg-emerald-950/20 border-emerald-200 dark:border-emerald-800/40"
                    : "bg-red-50/70 dark:bg-red-950/20 border-red-200 dark:border-red-800/40"
                }`}
              >
                <div className="text-xs font-bold text-slate-600 dark:text-zinc-300">
                  {t("recon.difference")}
                </div>
                <div
                  className={`text-xl font-black font-mono mt-1 ${
                    toAmountNumber(data.veresiye_difference) === 0
                      ? "text-emerald-700 dark:text-emerald-300"
                      : "text-red-700 dark:text-red-300"
                  }`}
                >
                  {formatCurrency(data.veresiye_difference)}
                </div>
              </div>
            </div>
          </div>

          {/* Issues list */}
          <div className="bg-white dark:bg-[#111218] border border-slate-100 dark:border-zinc-800 rounded-3xl p-5 shadow-sm space-y-3">
            <h3 className="text-sm font-black text-slate-900 dark:text-white">
              {t("recon.issues_title")} ({data.issues.length})
            </h3>
            {data.issues.length === 0 ? (
              <div className="p-4 rounded-2xl bg-emerald-50/70 dark:bg-emerald-950/20 border border-emerald-200 dark:border-emerald-800/40 text-emerald-700 dark:text-emerald-300 text-xs font-semibold flex items-center gap-2">
                <CheckCircle2 size={16} />
                <span>{t("recon.no_issues")}</span>
              </div>
            ) : (
              <div className="space-y-4">
                {errorIssues.length > 0 && (
                  <div className="space-y-2">
                    <div className="text-[11px] font-black uppercase tracking-wider text-red-600 dark:text-red-400">
                      {t("recon.errors_group")} ({errorIssues.length})
                    </div>
                    <div className="space-y-2">{errorIssues.map(renderIssueCard)}</div>
                  </div>
                )}
                {warningIssues.length > 0 && (
                  <div className="space-y-2">
                    <div className="text-[11px] font-black uppercase tracking-wider text-amber-600 dark:text-amber-400">
                      {t("recon.warnings_group")} ({warningIssues.length})
                    </div>
                    <div className="space-y-2">{warningIssues.map(renderIssueCard)}</div>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Shift breakdown table */}
          <div className="bg-white dark:bg-[#111218] border border-slate-100 dark:border-zinc-800 rounded-3xl p-5 shadow-sm space-y-3">
            <h3 className="text-sm font-black text-slate-900 dark:text-white">
              {t("recon.shifts_title")}
            </h3>
            {data.shifts.length === 0 ? (
              <div className="p-6 text-center text-xs text-slate-400">{t("recon.no_shifts")}</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs text-slate-600 dark:text-zinc-300">
                  <thead className="bg-slate-50 dark:bg-zinc-900/80 text-slate-400 uppercase text-[10px] font-bold border-b border-slate-100 dark:border-zinc-800">
                    <tr>
                      <th className="px-4 py-3">{t("recon.col_worker")}</th>
                      <th className="px-4 py-3">{t("recon.col_recorded")}</th>
                      <th className="px-4 py-3">{t("recon.col_ledger")}</th>
                      <th className="px-4 py-3">{t("recon.col_declared")}</th>
                      <th className="px-4 py-3 text-center">{t("recon.col_missing_rcpt")}</th>
                      <th className="px-4 py-3 text-right">{t("recon.col_proof")}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-zinc-800/70">
                    {data.shifts.map((sh) => (
                      <tr key={sh.shift_id} className="hover:bg-slate-50/70 dark:hover:bg-zinc-900/40">
                        <td className="px-4 py-3">
                          <div className="font-bold text-slate-900 dark:text-white">
                            {sh.worker_name}
                          </div>
                          <div className="text-[10px] text-slate-400 mt-0.5">
                            <span className="uppercase font-bold">{sh.shift_status}</span> ·{" "}
                            {formatDateTime(sh.start_time)}
                          </div>
                        </td>
                        <td className="px-4 py-3 font-mono font-bold text-slate-900 dark:text-white">
                          {formatCurrency(sh.recorded_credit)}
                        </td>
                        <td className="px-4 py-3">
                          <div className="font-mono font-bold text-slate-900 dark:text-white">
                            {formatCurrency(sh.ledger_credit)}
                          </div>
                          <div className="text-[10px] text-slate-400 font-mono">
                            K: {formatCurrency(sh.corporate_credit)} / B:{" "}
                            {formatCurrency(sh.individual_credit)}
                            {toAmountNumber(sh.unlinked_credit) > 0
                              ? ` / Bağsız: ${formatCurrency(sh.unlinked_credit)}`
                              : ""}
                          </div>
                        </td>
                        <td className="px-4 py-3 font-mono">
                          {sh.declared_credit !== null && sh.declared_credit !== undefined ? (
                            <div>
                              <div>{formatCurrency(sh.declared_credit)}</div>
                              {sh.declared_difference !== null &&
                                sh.declared_difference !== undefined &&
                                toAmountNumber(sh.declared_difference) !== 0 && (
                                  <div className="text-[10px] text-amber-600 dark:text-amber-400 font-bold">
                                    Δ {formatCurrency(sh.declared_difference)}
                                  </div>
                                )}
                            </div>
                          ) : (
                            "—"
                          )}
                        </td>
                        <td className="px-4 py-3 text-center">
                          {sh.missing_receipt_count > 0 ? (
                            <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-amber-100 dark:bg-amber-950/50 text-amber-800 dark:text-amber-300 font-bold text-[11px]">
                              {sh.missing_receipt_count}
                            </span>
                          ) : (
                            <span className="text-emerald-600 dark:text-emerald-400 font-bold">
                              0
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-right">
                          <button
                            type="button"
                            onClick={() =>
                              setProofTarget({
                                shiftId: sh.shift_id,
                                shiftLabel: `${sh.worker_name} (${formatDateTime(sh.start_time)})`,
                              })
                            }
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-indigo-50 dark:bg-indigo-950/40 text-indigo-700 dark:text-indigo-300 hover:bg-indigo-100 dark:hover:bg-indigo-900/50 font-bold text-[11px] border border-indigo-200 dark:border-indigo-800/40 transition"
                          >
                            <ShieldCheck size={13} />
                            {t("recon.view_merkle_proof")}
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Day collections (informational) */}
          <div className="bg-white dark:bg-[#111218] border border-slate-100 dark:border-zinc-800 rounded-3xl p-5 shadow-sm space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="text-sm font-black text-slate-900 dark:text-white">
                {t("recon.collections_title")}
              </h3>
              <span className="text-sm font-black font-mono text-emerald-700 dark:text-emerald-300">
                {formatCurrency(data.collections_total)}
              </span>
            </div>
            <div className="p-3 rounded-2xl bg-slate-50 dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 text-xs text-slate-600 dark:text-zinc-300 flex items-start gap-2">
              <Info size={15} className="shrink-0 mt-0.5 text-slate-400" />
              <span>{t("recon.collections_note")}</span>
            </div>
            {data.collections.length === 0 ? (
              <div className="text-xs text-slate-400 py-2">{t("recon.no_collections")}</div>
            ) : (
              <div className="flex flex-wrap gap-2">
                {data.collections.map((c) => (
                  <div
                    key={c.method}
                    className="px-3.5 py-2 rounded-2xl bg-emerald-50/70 dark:bg-emerald-950/20 border border-emerald-200 dark:border-emerald-800/40 text-xs"
                  >
                    <span className="font-bold text-slate-700 dark:text-zinc-200">
                      {renderCollectionMethod(c.method)}:
                    </span>{" "}
                    <span className="font-mono font-black text-emerald-700 dark:text-emerald-300">
                      {formatCurrency(c.amount)}
                    </span>{" "}
                    <span className="text-[11px] text-slate-500 dark:text-zinc-400">
                      ({c.count})
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </>
      ) : null}

      <ReceiptUploadModal
        saleId={uploadTarget?.saleId ?? null}
        summaryText={uploadTarget?.summaryText}
        onClose={() => setUploadTarget(null)}
        onSuccess={() => {
          setUploadTarget(null);
          fetchReconciliation();
        }}
      />

      <LinkCreditSaleModal
        transactionId={linkTarget?.txId ?? null}
        summaryText={linkTarget?.summaryText}
        onClose={() => setLinkTarget(null)}
        onSuccess={() => {
          setLinkTarget(null);
          fetchReconciliation();
        }}
      />

      <ProofViewerModal
        shiftId={proofTarget?.shiftId ?? null}
        shiftLabel={proofTarget?.shiftLabel}
        onClose={() => setProofTarget(null)}
      />
    </div>
  );
};
