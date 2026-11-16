import React, { useEffect, useState } from "react";
import { Camera, CheckCircle2, FileUp, Loader2 } from "lucide-react";
import { apiClient } from "@/lib/api";
import { useLanguage } from "@/context/LanguageContext";
import { formatCurrency, formatNumber } from "@/lib/utils";
import { apiErrorMessage, formatPlate } from "@/lib/veresiye";

interface ReceiptUploadStepProps {
  creditSaleId: string;
  accountName: string | null;
  plate: string | null;
  driverName: string | null;
  fuelType: string | null;
  liters: string | number | null;
  amount: string | number;
  onSuccess: () => void;
  onSkip: () => void;
}

export const ReceiptUploadStep: React.FC<ReceiptUploadStepProps> = ({
  creditSaleId,
  accountName,
  plate,
  driverName,
  fuelType,
  liters,
  amount,
  onSuccess,
  onSkip,
}) => {
  const { t } = useLanguage();
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!file || !file.type.startsWith("image/")) {
      setPreviewUrl(null);
      return;
    }
    const url = URL.createObjectURL(file);
    setPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  const handleUpload = async () => {
    if (!file) return;
    setUploading(true);
    setError(null);
    try {
      const fd = new FormData();
      fd.append("file", file);
      await apiClient.post(`/veresiye/sales/${creditSaleId}/receipt`, fd, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      setDone(true);
      onSuccess();
    } catch (err) {
      setError(apiErrorMessage(err, t("veresiye.error_upload")));
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="p-5 space-y-4">
      <div className="p-4 rounded-2xl bg-slate-50 dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 space-y-1.5 text-xs">
        <div className="font-black text-slate-900 dark:text-white text-sm">
          {t("creditsale.receipt_step_title")}
        </div>
        <div className="text-slate-600 dark:text-zinc-300 font-semibold">
          {accountName || "-"}
          {plate ? ` • ${formatPlate(plate)}` : ""}
          {driverName ? ` • ${driverName}` : ""}
        </div>
        <div className="text-slate-500 dark:text-zinc-400">
          {fuelType || "-"}
          {liters !== null && liters !== undefined ? ` • ${formatNumber(liters, 2)} L` : ""} •{" "}
          <span className="font-black text-slate-900 dark:text-white">
            {formatCurrency(amount)}
          </span>
        </div>
      </div>

      <p className="text-xs font-medium text-slate-600 dark:text-zinc-300 leading-relaxed">
        {t("creditsale.receipt_instruction")}
      </p>

      <div>
        <label className="block text-xs font-bold text-slate-700 dark:text-zinc-300 mb-1.5">
          {t("creditsale.receipt_file_label")}
        </label>
        <input
          type="file"
          accept="image/*,application/pdf"
          capture="environment"
          onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          className="block w-full text-xs text-slate-600 dark:text-zinc-300 file:mr-3 file:py-2 file:px-3.5 file:rounded-xl file:border-0 file:text-xs file:font-bold file:bg-emerald-50 file:text-emerald-700 dark:file:bg-emerald-950/60 dark:file:text-emerald-300 cursor-pointer"
        />
      </div>

      {previewUrl && (
        <div className="rounded-2xl overflow-hidden border border-slate-200 dark:border-zinc-800 bg-slate-50 dark:bg-zinc-950 p-2">
          <img src={previewUrl} alt="Fiş önizleme" className="max-h-52 mx-auto object-contain rounded-xl" />
        </div>
      )}

      {file && !previewUrl && (
        <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-slate-50 dark:bg-zinc-900 text-xs font-semibold">
          <FileUp size={15} className="text-emerald-600" />
          <span className="truncate">{file.name}</span>
        </div>
      )}

      {error && (
        <div className="p-3 rounded-xl bg-rose-50 dark:bg-rose-950/40 text-xs font-semibold text-rose-700 dark:text-rose-300">
          {error}
        </div>
      )}

      {done && (
        <div className="p-3 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 flex items-center gap-2 text-xs font-bold text-emerald-700 dark:text-emerald-300">
          <CheckCircle2 size={16} />
          <span>{t("creditsale.receipt_uploaded_ok")}</span>
        </div>
      )}

      <div className="flex items-center justify-end gap-2.5 pt-2">
        <button
          type="button"
          onClick={onSkip}
          className="px-4 py-2 rounded-xl text-xs font-bold text-slate-500 hover:text-slate-800 dark:hover:text-white transition"
        >
          {t("creditsale.receipt_skip_btn")}
        </button>
        <button
          type="button"
          disabled={!file || uploading}
          onClick={handleUpload}
          className="inline-flex items-center gap-2 px-4 py-2.5 rounded-2xl bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white text-xs font-black shadow-md transition"
        >
          {uploading ? <Loader2 size={14} className="animate-spin" /> : <Camera size={14} />}
          <span>{t("creditsale.receipt_upload_btn")}</span>
        </button>
      </div>
    </div>
  );
};
