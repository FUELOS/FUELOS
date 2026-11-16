import React, { useEffect, useRef, useState } from "react";
import { Camera, FileUp, Loader2, X } from "lucide-react";
import { apiClient } from "@/lib/api";
import { useLanguage } from "@/context/LanguageContext";
import { apiErrorMessage } from "@/lib/veresiye";

interface ReceiptUploadModalProps {
  saleId: string | null;
  summaryText?: string;
  onClose: () => void;
  onSuccess: () => void;
}

export const ReceiptUploadModal: React.FC<ReceiptUploadModalProps> = ({
  saleId,
  summaryText,
  onClose,
  onSuccess,
}) => {
  const { t } = useLanguage();
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  useEffect(() => {
    setFile(null);
    setPreviewUrl(null);
    setError(null);
    if (saleId) {
      setTimeout(() => fileInputRef.current?.focus(), 20);
    }
  }, [saleId]);

  useEffect(() => {
    if (!file || !file.type.startsWith("image/")) {
      setPreviewUrl(null);
      return;
    }
    const url = URL.createObjectURL(file);
    setPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  if (!saleId) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!file) return;
    setSubmitting(true);
    setError(null);
    try {
      const fd = new FormData();
      fd.append("file", file);
      await apiClient.post(`/veresiye/sales/${saleId}/receipt`, fd, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      onSuccess();
      onClose();
    } catch (err) {
      setError(apiErrorMessage(err, t("veresiye.error_upload")));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center bg-black/65 backdrop-blur-sm p-4"
      role="dialog"
      aria-modal="true"
      aria-label={t("veresiye.receipt_upload_title")}
    >
      <form
        onSubmit={handleSubmit}
        className="w-full max-w-md bg-white dark:bg-[#111218] border border-slate-200 dark:border-zinc-800 rounded-3xl shadow-2xl overflow-hidden"
      >
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 dark:border-zinc-800">
          <div className="flex items-center gap-2.5">
            <Camera size={20} className="text-blue-600" />
            <h3 className="text-base font-black text-slate-900 dark:text-white">
              {t("veresiye.receipt_upload_title")}
            </h3>
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
          {summaryText && (
            <div className="px-3.5 py-2.5 rounded-2xl bg-slate-50 dark:bg-zinc-900 border border-slate-200/70 dark:border-zinc-800 text-xs font-semibold text-slate-700 dark:text-zinc-300">
              {summaryText}
            </div>
          )}

          <p className="text-xs font-medium text-slate-600 dark:text-zinc-400 leading-relaxed">
            {t("veresiye.receipt_instruction")}
          </p>

          <div>
            <label
              htmlFor="veresiye-receipt-file"
              className="block text-xs font-bold text-slate-700 dark:text-zinc-300 mb-1.5"
            >
              {t("veresiye.choose_file")}
            </label>
            <input
              ref={fileInputRef}
              id="veresiye-receipt-file"
              type="file"
              accept="image/*,application/pdf"
              capture="environment"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              className="block w-full text-xs text-slate-600 dark:text-zinc-300 file:mr-3 file:py-2 file:px-3.5 file:rounded-xl file:border-0 file:text-xs file:font-bold file:bg-blue-50 file:text-blue-700 dark:file:bg-blue-950/60 dark:file:text-blue-300 hover:file:bg-blue-100 cursor-pointer"
            />
          </div>

          {previewUrl && (
            <div className="rounded-2xl overflow-hidden border border-slate-200 dark:border-zinc-800 bg-slate-50 dark:bg-zinc-950 p-2">
              <img
                src={previewUrl}
                alt={t("veresiye.receipt_upload_title")}
                className="max-h-52 mx-auto object-contain rounded-xl"
              />
            </div>
          )}

          {file && !previewUrl && (
            <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-slate-50 dark:bg-zinc-900 text-xs font-semibold text-slate-700 dark:text-zinc-300">
              <FileUp size={16} className="text-blue-600" />
              <span className="truncate">{file.name}</span>
            </div>
          )}

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
            disabled={!file || submitting}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-xs font-bold shadow-md shadow-blue-600/20 transition"
          >
            {submitting && <Loader2 size={14} className="animate-spin" />}
            <span>{t("veresiye.upload_btn")}</span>
          </button>
        </div>
      </form>
    </div>
  );
};
