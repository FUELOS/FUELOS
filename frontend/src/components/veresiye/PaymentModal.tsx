import React, { useEffect, useRef, useState } from "react";
import { Banknote, Loader2, X } from "lucide-react";
import { apiClient } from "@/lib/api";
import { useLanguage } from "@/context/LanguageContext";
import { apiErrorMessage, financialRequestHeaders } from "@/lib/veresiye";
import type {
  CollectionMethod,
  CreditAccountType,
  CreditEntryKind,
  CreditPaymentCreate,
} from "@/types/veresiye";

interface PaymentModalProps {
  open: boolean;
  accountType: CreditAccountType;
  accountId: string;
  accountName: string;
  initialMode?: CreditEntryKind;
  onClose: () => void;
  onSuccess: () => void;
}

function todayLocalInput(): string {
  const now = new Date();
  const offsetMs = now.getTimezoneOffset() * 60_000;
  return new Date(now.getTime() - offsetMs).toISOString().slice(0, 16);
}

export const PaymentModal: React.FC<PaymentModalProps> = ({
  open,
  accountType,
  accountId,
  accountName,
  initialMode = "payment",
  onClose,
  onSuccess,
}) => {
  const { t } = useLanguage();
  const [kind, setKind] = useState<CreditEntryKind>(initialMode);
  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState<CollectionMethod>("cash");
  const [paymentDate, setPaymentDate] = useState(todayLocalInput());
  const [reference, setReference] = useState("");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const amountRef = useRef<HTMLInputElement>(null);
  const attempt = useRef({ signature: "", key: "" });
  const submitting = useRef(false);

  useEffect(() => {
    if (!open) return;
    attempt.current = { signature: "", key: "" };
    setKind(initialMode);
    setAmount("");
    setMethod("cash");
    setPaymentDate(todayLocalInput());
    setReference("");
    setNote("");
    setError(null);
    setTimeout(() => amountRef.current?.focus(), 20);
  }, [open, initialMode]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submitting.current) return;
    const numeric = Number(amount.replace(",", "."));
    if (!Number.isFinite(numeric) || (kind === "payment" ? numeric <= 0 : numeric === 0)) {
      setError(t("veresiye.error_save"));
      return;
    }
    if (kind === "adjustment" && !note.trim()) {
      setError(t("veresiye.note_required_adjustment"));
      return;
    }

    submitting.current = true;
    setSaving(true);
    setError(null);
    try {
      const payload: CreditPaymentCreate = {
        account_type: accountType,
        ...(accountType === "corporate"
          ? { credit_company_id: accountId }
          : { credit_customer_id: accountId }),
        kind,
        amount: numeric.toFixed(2),
        method: kind === "payment" ? method : "other",
        payment_date: paymentDate ? new Date(paymentDate).toISOString() : undefined,
        reference: reference.trim() || undefined,
        note: note.trim() || undefined,
      };
      await apiClient.post("/veresiye/payments", payload, {
        headers: financialRequestHeaders(attempt.current, payload),
      });
      onSuccess();
      onClose();
    } catch (err) {
      setError(apiErrorMessage(err, t("veresiye.error_save")));
    } finally {
      submitting.current = false;
      setSaving(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center bg-black/65 backdrop-blur-sm p-4"
      role="dialog"
      aria-modal="true"
      aria-label={t("veresiye.record_payment")}
    >
      <form
        onSubmit={handleSubmit}
        className="w-full max-w-md bg-white dark:bg-[#111218] border border-slate-200 dark:border-zinc-800 rounded-3xl shadow-2xl overflow-hidden"
      >
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 dark:border-zinc-800">
          <div className="flex items-center gap-2.5 min-w-0">
            <Banknote size={20} className="text-emerald-600 shrink-0" />
            <div className="min-w-0">
              <h3 className="text-base font-black text-slate-900 dark:text-white truncate">
                {kind === "payment" ? t("veresiye.record_payment") : t("veresiye.record_adjustment")}
              </h3>
              <p className="text-xs font-semibold text-slate-500 dark:text-zinc-400 truncate">
                {accountName}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label={t("veresiye.close")}
            className="p-2 rounded-xl text-slate-400 hover:text-slate-700 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-zinc-800 transition"
          >
            <X size={18} />
          </button>
        </div>

        <div className="p-6 space-y-4">
          <div className="grid grid-cols-2 gap-2 p-1 rounded-2xl bg-slate-100 dark:bg-zinc-900">
            <button
              type="button"
              onClick={() => setKind("payment")}
              className={`py-2 rounded-xl text-xs font-bold transition ${
                kind === "payment"
                  ? "bg-white dark:bg-zinc-800 text-slate-900 dark:text-white shadow-sm"
                  : "text-slate-500 dark:text-zinc-400"
              }`}
            >
              {t("veresiye.payment_mode")}
            </button>
            <button
              type="button"
              onClick={() => setKind("adjustment")}
              className={`py-2 rounded-xl text-xs font-bold transition ${
                kind === "adjustment"
                  ? "bg-white dark:bg-zinc-800 text-slate-900 dark:text-white shadow-sm"
                  : "text-slate-500 dark:text-zinc-400"
              }`}
            >
              {t("veresiye.adjustment_mode")}
            </button>
          </div>

          <div>
            <label htmlFor="payment-amount" className="block text-xs font-bold text-slate-700 dark:text-zinc-300 mb-1">
              {t("veresiye.amount")}
            </label>
            <input
              ref={amountRef}
              id="payment-amount"
              type="number"
              step="0.01"
              required
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="0.00"
              className="w-full px-3.5 py-2.5 rounded-xl bg-slate-50 dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 text-sm font-bold text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            {kind === "adjustment" && (
              <p className="mt-1 text-[11px] font-medium text-slate-500 dark:text-zinc-400">
                {t("veresiye.adjustment_amount_hint")}
              </p>
            )}
          </div>

          {kind === "payment" && (
            <div>
              <label htmlFor="payment-method" className="block text-xs font-bold text-slate-700 dark:text-zinc-300 mb-1">
                {t("veresiye.payment_method")}
              </label>
              <select
                id="payment-method"
                value={method}
                onChange={(e) => setMethod(e.target.value as CollectionMethod)}
                className="w-full px-3.5 py-2.5 rounded-xl bg-slate-50 dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 text-sm font-semibold text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="cash">{t("veresiye.method_cash")}</option>
                <option value="credit_card">{t("veresiye.method_credit_card")}</option>
                <option value="eft">{t("veresiye.method_eft")}</option>
                <option value="other">{t("veresiye.method_other")}</option>
              </select>
            </div>
          )}

          <div>
            <label htmlFor="payment-date" className="block text-xs font-bold text-slate-700 dark:text-zinc-300 mb-1">
              {t("veresiye.payment_date")}
            </label>
            <input
              id="payment-date"
              type="datetime-local"
              value={paymentDate}
              onChange={(e) => setPaymentDate(e.target.value)}
              className="w-full px-3.5 py-2.5 rounded-xl bg-slate-50 dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 text-sm font-semibold text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div>
            <label htmlFor="payment-ref" className="block text-xs font-bold text-slate-700 dark:text-zinc-300 mb-1">
              {t("veresiye.reference")}
            </label>
            <input
              id="payment-ref"
              type="text"
              value={reference}
              onChange={(e) => setReference(e.target.value)}
              className="w-full px-3.5 py-2 rounded-xl bg-slate-50 dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div>
            <label htmlFor="payment-note" className="block text-xs font-bold text-slate-700 dark:text-zinc-300 mb-1">
              {t("veresiye.note")} {kind === "adjustment" ? "*" : ""}
            </label>
            <textarea
              id="payment-note"
              rows={2}
              required={kind === "adjustment"}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              className="w-full px-3.5 py-2 rounded-xl bg-slate-50 dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          {error && (
            <div className="px-3.5 py-2.5 rounded-2xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900/50 text-xs font-semibold text-rose-700 dark:text-rose-300">
              {error}
            </div>
          )}
        </div>

        <div className="px-6 py-4 border-t border-slate-100 dark:border-zinc-800 flex items-center justify-end gap-2.5">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-xl text-xs font-bold text-slate-600 dark:text-zinc-300 hover:bg-slate-100 dark:hover:bg-zinc-800 transition"
          >
            {t("veresiye.cancel")}
          </button>
          <button
            type="submit"
            disabled={saving}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white text-xs font-bold shadow-md shadow-emerald-600/20 transition"
          >
            {saving && <Loader2 size={14} className="animate-spin" />}
            <span>{saving ? t("veresiye.saving") : t("veresiye.save")}</span>
          </button>
        </div>
      </form>
    </div>
  );
};
