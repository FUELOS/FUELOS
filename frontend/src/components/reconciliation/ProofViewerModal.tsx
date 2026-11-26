import React, { useEffect, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  Copy,
  Eye,
  EyeOff,
  Loader2,
  ShieldCheck,
  X,
} from "lucide-react";
import { apiClient } from "@/lib/api";
import { useLanguage } from "@/context/LanguageContext";
import { formatCurrency, formatDateTime } from "@/lib/utils";
import { apiErrorMessage, formatPlate, getShiftCreditSales } from "@/lib/veresiye";
import type {
  CreditSale,
  SaleInclusionProof,
  ShiftLedgerProof,
} from "@/types/veresiye";

interface ProofViewerModalProps {
  shiftId: string | null;
  shiftLabel?: string;
  onClose: () => void;
}

export const ProofViewerModal: React.FC<ProofViewerModalProps> = ({
  shiftId,
  shiftLabel,
  onClose,
}) => {
  const { t, language } = useLanguage();
  const isTr = language === "tr";

  const [proof, setProof] = useState<ShiftLedgerProof | null>(null);
  const [sales, setSales] = useState<CreditSale[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [selectedSaleId, setSelectedSaleId] = useState<string | null>(null);
  const [saleProof, setSaleProof] = useState<SaleInclusionProof | null>(null);
  const [saleProofLoading, setSaleProofLoading] = useState(false);
  const [saleProofError, setSaleProofError] = useState<string | null>(null);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  useEffect(() => {
    if (!shiftId) return;
    let active = true;
    Promise.resolve().then(() => {
      if (!active) return;
      setLoading(true);
      setError(null);
      setProof(null);
      setSales([]);
      setSelectedSaleId(null);
      setSaleProof(null);
      setSaleProofError(null);
    });

    Promise.all([
      apiClient.get<ShiftLedgerProof>(`/veresiye/proofs/shifts/${shiftId}`),
      getShiftCreditSales(shiftId),
    ])
      .then(([proofRes, salesRes]) => {
        if (!active) return;
        setProof(proofRes.data);
        setSales(salesRes);
      })
      .catch((err) => {
        if (!active) return;
        setError(
          apiErrorMessage(
            err,
            isTr ? "Vardiya Merkle kanıtı yüklenemedi" : "Failed to load shift proof"
          )
        );
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [shiftId, isTr]);

  const fetchSaleProof = async (saleId: string, disclose: boolean) => {
    setSelectedSaleId(saleId);
    setSaleProofLoading(true);
    setSaleProofError(null);
    try {
      const res = await apiClient.get<SaleInclusionProof>(
        `/veresiye/proofs/sales/${saleId}?disclose=${disclose ? "true" : "false"}`
      );
      setSaleProof(res.data);
    } catch (err) {
      setSaleProof(null);
      setSaleProofError(
        apiErrorMessage(
          err,
          isTr ? "Satış dahil edilme kanıtı alınamadı" : "Failed to fetch inclusion proof"
        )
      );
    } finally {
      setSaleProofLoading(false);
    }
  };

  const handleCopy = async (key: string, text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedKey(key);
      window.setTimeout(() => {
        setCopiedKey((prev) => (prev === key ? null : prev));
      }, 1800);
    } catch {
      // Clipboard izin verilmezse sessiz kal
    }
  };

  const handleClose = () => {
    setProof(null);
    setSales([]);
    setSelectedSaleId(null);
    setSaleProof(null);
    setSaleProofError(null);
    onClose();
  };

  if (!shiftId) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-white dark:bg-[#111218] border border-slate-200 dark:border-zinc-800 rounded-3xl w-full max-w-2xl overflow-hidden shadow-2xl animate-in fade-in zoom-in-95 duration-150">
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-slate-100 dark:border-zinc-800 bg-gradient-to-r from-indigo-500/10 to-emerald-500/10">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 rounded-2xl bg-indigo-600 text-white flex items-center justify-center shadow-lg shadow-indigo-600/25 shrink-0">
              <ShieldCheck size={20} />
            </div>
            <div className="min-w-0">
              <h3 className="font-black text-base text-slate-900 dark:text-white truncate">
                {t("recon.proof_modal_title")}
              </h3>
              <p className="text-xs text-slate-500 dark:text-zinc-400 truncate">
                {shiftLabel || shiftId}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={handleClose}
            className="w-8 h-8 rounded-xl bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-slate-500 hover:text-slate-800 dark:hover:text-white transition shrink-0"
          >
            <X size={16} />
          </button>
        </div>

        <div className="p-5 max-h-[80vh] overflow-y-auto space-y-4">
          {loading ? (
            <div className="py-12 flex flex-col items-center justify-center text-slate-400 gap-2 text-xs">
              <Loader2 size={22} className="animate-spin text-indigo-500" />
              <span>{t("common.loading")}</span>
            </div>
          ) : error ? (
            <div className="p-4 rounded-2xl bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800/40 text-xs text-red-700 dark:text-red-300 flex items-start gap-2">
              <AlertTriangle size={16} className="shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          ) : proof ? (
            <>
              {/* Shift proof metrics */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="p-3.5 rounded-2xl bg-slate-50 dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800">
                  <div className="text-[11px] font-bold text-slate-500 dark:text-zinc-400 uppercase">
                    {t("recon.proof_leaf_count")}
                  </div>
                  <div className="text-xl font-black text-slate-900 dark:text-white mt-1 font-mono">
                    {proof.leaf_count}
                  </div>
                </div>

                <div className="p-3.5 rounded-2xl bg-slate-50 dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800">
                  <div className="text-[11px] font-bold text-slate-500 dark:text-zinc-400 uppercase">
                    {t("recon.proof_ledger_match")}
                  </div>
                  <div className="mt-1.5">
                    {proof.ledger_matches_recorded_credit ? (
                      <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 text-xs font-bold border border-emerald-200 dark:border-emerald-800/40">
                        <CheckCircle2 size={12} />
                        {isTr ? "Eşleşiyor" : "Matched"}
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-red-50 dark:bg-red-950/40 text-red-700 dark:text-red-300 text-xs font-bold border border-red-200 dark:border-red-800/40">
                        <AlertTriangle size={12} />
                        {isTr ? "Uyumsuz" : "Mismatch"}
                      </span>
                    )}
                  </div>
                </div>

                <div className="p-3.5 rounded-2xl bg-slate-50 dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800">
                  <div className="text-[11px] font-bold text-slate-500 dark:text-zinc-400 uppercase">
                    {t("recon.proof_zk_status")}
                  </div>
                  <div className="text-xs font-black text-indigo-600 dark:text-indigo-400 mt-2 uppercase font-mono">
                    {proof.zk_proof_status || "none"}
                  </div>
                </div>
              </div>

              {/* Merkle root & statement digest */}
              <div className="space-y-2.5">
                <div className="p-3 rounded-2xl bg-slate-50 dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800">
                  <div className="flex items-center justify-between gap-2 mb-1">
                    <span className="text-[11px] font-bold text-slate-500 dark:text-zinc-400 uppercase">
                      {t("recon.proof_merkle_root")}
                    </span>
                    <button
                      type="button"
                      onClick={() => handleCopy("merkle_root", proof.merkle_root)}
                      className="inline-flex items-center gap-1 text-[11px] font-bold text-indigo-600 dark:text-indigo-400 hover:underline"
                    >
                      <Copy size={11} />
                      {copiedKey === "merkle_root" ? t("recon.proof_copied") : "Kopyala"}
                    </button>
                  </div>
                  <div className="font-mono text-[11px] text-slate-800 dark:text-zinc-200 break-all">
                    {proof.merkle_root}
                  </div>
                </div>

                <div className="p-3 rounded-2xl bg-slate-50 dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800">
                  <div className="flex items-center justify-between gap-2 mb-1">
                    <span className="text-[11px] font-bold text-slate-500 dark:text-zinc-400 uppercase">
                      {t("recon.proof_statement_digest")}
                    </span>
                    <button
                      type="button"
                      onClick={() => handleCopy("statement_digest", proof.statement_digest)}
                      className="inline-flex items-center gap-1 text-[11px] font-bold text-indigo-600 dark:text-indigo-400 hover:underline"
                    >
                      <Copy size={11} />
                      {copiedKey === "statement_digest" ? t("recon.proof_copied") : "Kopyala"}
                    </button>
                  </div>
                  <div className="font-mono text-[11px] text-slate-800 dark:text-zinc-200 break-all">
                    {proof.statement_digest}
                  </div>
                </div>
              </div>

              {/* Per-sale inclusion proofs */}
              <div className="space-y-2">
                <div className="text-xs font-black text-slate-700 dark:text-zinc-200 uppercase tracking-wider">
                  {t("recon.proof_sale_list")} ({sales.length})
                </div>

                {sales.length === 0 ? (
                  <div className="p-4 rounded-2xl bg-slate-50 dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 text-xs text-slate-500 dark:text-zinc-400 text-center">
                    {isTr
                      ? "Bu vardiyada henüz veresiye defter kaydı bulunmuyor."
                      : "No ledger credit sales found in this shift."}
                  </div>
                ) : (
                  <div className="divide-y divide-slate-100 dark:divide-zinc-800 rounded-2xl border border-slate-200 dark:border-zinc-800 overflow-hidden">
                    {sales.map((sale) => {
                      const activeRow = selectedSaleId === sale.id;
                      return (
                        <div
                          key={sale.id}
                          className={`p-3 flex flex-wrap items-center justify-between gap-2 text-xs ${
                            activeRow
                              ? "bg-indigo-50/70 dark:bg-indigo-950/25"
                              : "bg-white dark:bg-[#111218]"
                          }`}
                        >
                          <div className="min-w-0 space-y-0.5">
                            <div className="font-bold text-slate-900 dark:text-white flex items-center gap-1.5 flex-wrap">
                              <span className="truncate">
                                {sale.account_name ||
                                  (sale.account_type === "corporate"
                                    ? t("creditsale.corporate")
                                    : t("creditsale.individual"))}
                              </span>
                              {sale.plate && (
                                <span className="px-1.5 py-0.5 rounded bg-slate-100 dark:bg-zinc-800 font-mono text-[10px]">
                                  {formatPlate(sale.plate)}
                                </span>
                              )}
                            </div>
                            <div className="text-[11px] text-slate-500 dark:text-zinc-400">
                              {formatCurrency(sale.amount)} · {formatDateTime(sale.sale_time)}
                            </div>
                          </div>
                          <button
                            type="button"
                            onClick={() => fetchSaleProof(sale.id, false)}
                            className="px-3 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-[11px] transition shrink-0"
                          >
                            {t("recon.proof_inspect_sale")}
                          </button>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Selected sale inclusion proof panel */}
              {saleProofLoading && (
                <div className="p-4 rounded-2xl bg-slate-50 dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 flex items-center justify-center gap-2 text-xs text-slate-500">
                  <Loader2 size={16} className="animate-spin text-indigo-500" />
                  <span>{t("common.loading")}</span>
                </div>
              )}

              {saleProofError && (
                <div className="p-3.5 rounded-2xl bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800/40 text-xs text-red-700 dark:text-red-300 flex items-start gap-2">
                  <AlertTriangle size={15} className="shrink-0 mt-0.5" />
                  <span>{saleProofError}</span>
                </div>
              )}

              {saleProof && !saleProofLoading && (
                <div className="p-4 rounded-2xl bg-slate-50 dark:bg-zinc-900 border border-indigo-200 dark:border-indigo-800/50 space-y-3 text-xs">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="font-black text-slate-900 dark:text-white">
                      Leaf #{saleProof.leaf_index} / {saleProof.leaf_count}
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      {!saleProof.disclosure ? (
                        <button
                          type="button"
                          onClick={() => fetchSaleProof(saleProof.credit_sale_id, true)}
                          className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-xl bg-amber-500 hover:bg-amber-600 text-white font-bold text-[11px] transition"
                        >
                          <Eye size={12} />
                          {t("recon.proof_disclose_btn")}
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={() => fetchSaleProof(saleProof.credit_sale_id, false)}
                          className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-xl bg-slate-200 dark:bg-zinc-800 hover:bg-slate-300 dark:hover:bg-zinc-700 text-slate-800 dark:text-zinc-200 font-bold text-[11px] transition"
                        >
                          <EyeOff size={12} />
                          {t("recon.proof_hide_disclose")}
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() =>
                          handleCopy("cli_json", JSON.stringify(saleProof, null, 2))
                        }
                        className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-[11px] transition"
                      >
                        <Copy size={12} />
                        {copiedKey === "cli_json"
                          ? t("recon.proof_copied")
                          : t("recon.proof_copy_json")}
                      </button>
                    </div>
                  </div>

                  <div>
                    <div className="text-[10px] font-bold uppercase text-slate-500 dark:text-zinc-400">
                      Commitment
                    </div>
                    <div className="font-mono text-[11px] text-slate-800 dark:text-zinc-200 break-all">
                      {saleProof.commitment}
                    </div>
                  </div>

                  <div>
                    <div className="text-[10px] font-bold uppercase text-slate-500 dark:text-zinc-400">
                      Merkle Path ({saleProof.merkle_path.length})
                    </div>
                    {saleProof.merkle_path.length === 0 ? (
                      <div className="font-mono text-[11px] text-slate-400">[]</div>
                    ) : (
                      <div className="space-y-1 mt-1">
                        {saleProof.merkle_path.map((h, idx) => (
                          <div
                            key={`${idx}-${h}`}
                            className="font-mono text-[10px] text-slate-700 dark:text-zinc-300 break-all bg-white dark:bg-zinc-950 px-2 py-1 rounded-lg border border-slate-200 dark:border-zinc-800"
                          >
                            [{idx}] {h}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  {saleProof.disclosure && (
                    <div className="space-y-2 pt-2 border-t border-slate-200 dark:border-zinc-800">
                      <div className="p-2.5 rounded-xl bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800/40 text-amber-800 dark:text-amber-300 text-[11px] flex items-start gap-2">
                        <AlertTriangle size={14} className="shrink-0 mt-0.5" />
                        <span>{t("recon.proof_nonce_warning")}</span>
                      </div>
                      <div className="grid grid-cols-2 gap-2 font-mono text-[11px] text-slate-700 dark:text-zinc-300">
                        <div>
                          account_type:{" "}
                          <span className="font-bold">{saleProof.disclosure.account_type}</span>
                        </div>
                        <div>
                          amount_kurus:{" "}
                          <span className="font-bold">{saleProof.disclosure.amount_kurus}</span>
                        </div>
                        <div>
                          plate:{" "}
                          <span className="font-bold">
                            {saleProof.disclosure.plate || "null"}
                          </span>
                        </div>
                        <div>
                          fuel_type:{" "}
                          <span className="font-bold">
                            {saleProof.disclosure.fuel_type || "null"}
                          </span>
                        </div>
                        <div>
                          liters_ml:{" "}
                          <span className="font-bold">
                            {saleProof.disclosure.liters_ml || "null"}
                          </span>
                        </div>
                        <div>
                          sale_time:{" "}
                          <span className="font-bold">{saleProof.disclosure.sale_time}</span>
                        </div>
                      </div>
                      <div>
                        <div className="text-[10px] font-bold uppercase text-slate-500 dark:text-zinc-400">
                          nonce
                        </div>
                        <div className="font-mono text-[10px] text-amber-700 dark:text-amber-300 break-all bg-white dark:bg-zinc-950 px-2 py-1 rounded-lg border border-slate-200 dark:border-zinc-800">
                          {saleProof.disclosure.nonce}
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </>
          ) : null}
        </div>
      </div>
    </div>
  );
};
