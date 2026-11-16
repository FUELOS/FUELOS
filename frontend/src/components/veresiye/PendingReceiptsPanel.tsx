import React, { useState } from "react";
import { AlertTriangle, Camera, CheckCircle2 } from "lucide-react";
import { useLanguage } from "@/context/LanguageContext";
import { formatCurrency, formatDateTime, formatNumber } from "@/lib/utils";
import { formatPlate } from "@/lib/veresiye";
import { ReceiptUploadModal } from "@/components/veresiye/ReceiptUploadModal";
import type { CreditSale } from "@/types/veresiye";

interface PendingReceiptsPanelProps {
  sales: CreditSale[];
  loading: boolean;
  onUploaded: () => void;
}

export const PendingReceiptsPanel: React.FC<PendingReceiptsPanelProps> = ({
  sales,
  loading,
  onUploaded,
}) => {
  const { t } = useLanguage();
  const [uploadTarget, setUploadTarget] = useState<CreditSale | null>(null);

  return (
    <div className="bg-white dark:bg-[#111218] border border-slate-100 dark:border-zinc-800 rounded-3xl p-5 shadow-sm">
      <div className="flex items-center justify-between gap-3 mb-4">
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-2xl bg-amber-500/10 text-amber-600 dark:text-amber-400 flex items-center justify-center">
            <AlertTriangle size={18} />
          </div>
          <div>
            <h2 className="text-sm font-black text-slate-900 dark:text-white">
              {t("veresiye.pending_receipts_title")}
            </h2>
            <p className="text-xs font-medium text-slate-500 dark:text-zinc-400">
              {t("veresiye.pending_receipts_subtitle")}
            </p>
          </div>
        </div>
        <span className="px-2.5 py-1 rounded-xl text-xs font-black bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300">
          {sales.length}
        </span>
      </div>

      {loading ? (
        <div className="py-6 text-center text-xs font-semibold text-slate-500 dark:text-zinc-400">
          {t("veresiye.loading")}
        </div>
      ) : sales.length === 0 ? (
        <div className="py-5 flex items-center justify-center gap-2 text-xs font-semibold text-emerald-600 dark:text-emerald-400">
          <CheckCircle2 size={16} />
          <span>{t("veresiye.pending_receipts_empty")}</span>
        </div>
      ) : (
        <div className="space-y-2.5">
          {sales.map((sale) => (
            <div
              key={sale.id}
              className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3.5 rounded-2xl bg-slate-50 dark:bg-zinc-900/70 border border-slate-200/60 dark:border-zinc-800"
            >
              <div className="space-y-0.5 min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-xs font-black text-slate-900 dark:text-white truncate">
                    {sale.account_name || "-"}
                  </span>
                  {sale.plate && (
                    <span className="px-2 py-0.5 rounded-lg bg-slate-200/70 dark:bg-zinc-800 text-[11px] font-mono font-bold text-slate-700 dark:text-zinc-200">
                      {formatPlate(sale.plate)}
                    </span>
                  )}
                  <span className="text-[11px] font-semibold text-slate-500 dark:text-zinc-400">
                    {formatDateTime(sale.sale_time)}
                  </span>
                </div>
                <div className="text-xs font-medium text-slate-600 dark:text-zinc-400">
                  {sale.driver_name ? `${sale.driver_name} • ` : ""}
                  {sale.fuel_type ? `${sale.fuel_type} ` : ""}
                  {sale.liters ? `(${formatNumber(sale.liters, 2)} L) • ` : ""}
                  <span className="font-black text-slate-900 dark:text-white">
                    {formatCurrency(sale.amount)}
                  </span>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setUploadTarget(sale)}
                className="inline-flex items-center justify-center gap-1.5 px-3.5 py-2 rounded-xl bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold shrink-0 transition"
              >
                <Camera size={14} />
                <span>{t("veresiye.upload_receipt")}</span>
              </button>
            </div>
          ))}
        </div>
      )}

      <ReceiptUploadModal
        saleId={uploadTarget?.id ?? null}
        summaryText={
          uploadTarget
            ? `${uploadTarget.account_name ?? ""} • ${formatPlate(uploadTarget.plate)} • ${formatCurrency(uploadTarget.amount)}`
            : undefined
        }
        onClose={() => setUploadTarget(null)}
        onSuccess={onUploaded}
      />
    </div>
  );
};
