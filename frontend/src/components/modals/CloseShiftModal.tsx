import React, { useState } from "react";
import { apiClient } from "@/lib/api";
import { useLanguage } from "@/context/LanguageContext";
import { X, Square, AlertCircle, Loader2, Wallet, Building2, UserCircle2 } from "lucide-react";

interface CloseShiftModalProps {
  isOpen: boolean;
  shiftId: string | null;
  stationName?: string;
  cashierName?: string;
  onClose: () => void;
  onSuccess: () => void;
}

export const CloseShiftModal: React.FC<CloseShiftModalProps> = ({
  isOpen,
  shiftId,
  stationName,
  cashierName,
  onClose,
  onSuccess,
}) => {
  const { t, language } = useLanguage();
  const [closingCash, setClosingCash] = useState<string>("");
  const [notes, setNotes] = useState<string>("");
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen || !shiftId) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (closingCash === "") {
      setError(language === "tr" ? "Lütfen kapanış kasa tutarını girin" : "Please enter closing cash amount");
      return;
    }

    try {
      setLoading(true);
      setError(null);
      await apiClient.post(`/shifts/${shiftId}/close`, {
        closing_cash: parseFloat(closingCash) || 0,
        notes: notes.trim() || null,
      });
      onSuccess();
      onClose();
    } catch (err: any) {
      const msg = err.response?.data?.detail || (language === "tr" ? "Vardiya kapatılırken hata oluştu" : "Failed to close shift");
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-slate-900 border border-slate-800 rounded-3xl w-full max-w-md overflow-hidden shadow-2xl animate-in fade-in zoom-in-95 duration-150">
        {/* Material Header */}
        <div className="flex items-center justify-between p-5 border-b border-slate-800 bg-gradient-to-r from-rose-900/30 to-red-900/30">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-gradient-to-tr from-rose-500 to-red-600 text-white flex items-center justify-center shadow-lg shadow-rose-500/25">
              <Square size={18} className="fill-white" />
            </div>
            <div>
              <h3 className="font-bold text-lg text-white">{t("modal.close_title")}</h3>
              <p className="text-xs text-slate-400">{t("modal.close_sub")}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-200 p-1.5 rounded-xl hover:bg-slate-800 transition"
          >
            <X size={18} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {stationName && cashierName && (
            <div className="p-3.5 bg-slate-950/70 border border-slate-800 rounded-2xl text-xs space-y-1.5">
              <div className="text-slate-400 flex items-center justify-between">
                <span className="flex items-center gap-1 text-slate-500"><Building2 size={13} /> {t("reports.col_station")}:</span>
                <span className="text-white font-semibold">{stationName}</span>
              </div>
              <div className="text-slate-400 flex items-center justify-between">
                <span className="flex items-center gap-1 text-slate-500"><UserCircle2 size={13} /> {t("reports.col_cashier")}:</span>
                <span className="text-amber-400 font-semibold">{cashierName}</span>
              </div>
            </div>
          )}

          {error && (
            <div className="p-3.5 bg-red-500/10 border border-red-500/20 rounded-2xl text-red-400 text-xs flex items-start gap-2.5">
              <AlertCircle size={16} className="shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          <div>
            <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1.5 flex items-center gap-1.5">
              <Wallet size={14} className="text-rose-400" />
              <span>{t("modal.closing_cash_label")}</span>
            </label>
            <input
              type="number"
              step="0.01"
              min="0"
              required
              value={closingCash}
              onChange={(e) => setClosingCash(e.target.value)}
              placeholder="0.00"
              className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2.5 text-sm text-slate-200 font-mono font-medium focus:outline-none focus:border-rose-500 transition"
            />
            <p className="text-[11px] text-slate-500 mt-1">
              {t("modal.closing_cash_hint")}
            </p>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1.5">
              {t("modal.closing_notes")}
            </label>
            <textarea
              rows={2}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder={t("modal.closing_notes_ph")}
              className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2.5 text-sm text-slate-200 focus:outline-none focus:border-rose-500 transition resize-none"
            />
          </div>

          <div className="pt-3 flex items-center justify-end gap-3">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2.5 text-sm text-slate-400 hover:text-slate-200 rounded-xl hover:bg-slate-800 transition"
            >
              {t("common.cancel")}
            </button>
            <button
              type="submit"
              disabled={loading}
              className="px-5 py-2.5 text-sm font-bold bg-gradient-to-r from-rose-600 to-red-600 hover:from-rose-500 hover:to-red-500 text-white rounded-xl shadow-lg shadow-rose-600/25 transition flex items-center gap-2 disabled:opacity-50 active:scale-95"
            >
              {loading && <Loader2 size={16} className="animate-spin text-white" />}
              <span>{t("modal.close_and_reconcile")}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
