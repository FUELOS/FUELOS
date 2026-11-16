import React, { useEffect, useState } from "react";
import { Download, FileText, Loader2, X } from "lucide-react";
import { useLanguage } from "@/context/LanguageContext";
import { apiErrorMessage, fetchDocumentBlob } from "@/lib/veresiye";

interface DocumentViewerModalProps {
  documentId: string | null;
  title?: string;
  onClose: () => void;
}

export const DocumentViewerModal: React.FC<DocumentViewerModalProps> = ({
  documentId,
  title,
  onClose,
}) => {
  const { t } = useLanguage();
  const [blobUrl, setBlobUrl] = useState<string | null>(null);
  const [contentType, setContentType] = useState<string>("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  useEffect(() => {
    if (!documentId) {
      setBlobUrl(null);
      setContentType("");
      setError(null);
      return;
    }

    let cancelled = false;
    let createdUrl: string | null = null;
    setLoading(true);
    setError(null);
    setBlobUrl(null);

    fetchDocumentBlob(documentId)
      .then(({ url, contentType: ct }) => {
        if (cancelled) {
          URL.revokeObjectURL(url);
          return;
        }
        createdUrl = url;
        setBlobUrl(url);
        setContentType(ct);
      })
      .catch((err) => {
        if (!cancelled) {
          setError(apiErrorMessage(err, t("veresiye.error_load")));
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
      if (createdUrl) {
        URL.revokeObjectURL(createdUrl);
      }
    };
  }, [documentId, t]);

  if (!documentId) return null;

  const isPdf = contentType.toLowerCase().includes("pdf");

  return (
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center bg-black/65 backdrop-blur-sm p-4"
      role="dialog"
      aria-modal="true"
      aria-label={title || t("veresiye.document_viewer_title")}
    >
      <div className="w-full max-w-3xl bg-white dark:bg-[#111218] border border-slate-200 dark:border-zinc-800 rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 dark:border-zinc-800">
          <div className="flex items-center gap-2.5 min-w-0">
            <FileText size={20} className="text-blue-600 shrink-0" />
            <h3 className="text-base font-black text-slate-900 dark:text-white truncate">
              {title || t("veresiye.document_viewer_title")}
            </h3>
          </div>
          <div className="flex items-center gap-2">
            {blobUrl && (
              <a
                href={blobUrl}
                download={`belge-${documentId.slice(0, 8)}`}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-100 dark:bg-zinc-800 text-xs font-bold text-slate-700 dark:text-zinc-200 hover:bg-slate-200 dark:hover:bg-zinc-700 transition"
              >
                <Download size={14} />
                <span>{t("veresiye.download_document")}</span>
              </a>
            )}
            <button
              type="button"
              onClick={onClose}
              aria-label={t("veresiye.close")}
              className="p-2 rounded-xl text-slate-400 hover:text-slate-700 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-zinc-800 transition"
            >
              <X size={18} />
            </button>
          </div>
        </div>

        <div className="p-4 sm:p-6 overflow-auto flex-1 flex items-center justify-center min-h-[320px] bg-slate-50 dark:bg-zinc-950/60">
          {loading && (
            <div className="flex flex-col items-center gap-2 text-slate-500 dark:text-zinc-400 text-sm font-semibold">
              <Loader2 size={28} className="animate-spin text-blue-600" />
              <span>{t("veresiye.loading")}</span>
            </div>
          )}

          {!loading && error && (
            <div className="px-4 py-3 rounded-2xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900/50 text-rose-700 dark:text-rose-300 text-sm font-semibold">
              {error}
            </div>
          )}

          {!loading && !error && blobUrl && isPdf && (
            <iframe
              src={blobUrl}
              title={title || t("veresiye.document_viewer_title")}
              className="w-full h-[65vh] rounded-2xl border border-slate-200 dark:border-zinc-800 bg-white"
            />
          )}

          {!loading && !error && blobUrl && !isPdf && (
            <img
              src={blobUrl}
              alt={title || t("veresiye.document_viewer_title")}
              className="max-w-full max-h-[68vh] object-contain rounded-2xl shadow-md"
            />
          )}
        </div>
      </div>
    </div>
  );
};
