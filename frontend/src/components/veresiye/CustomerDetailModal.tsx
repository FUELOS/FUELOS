import React, { useCallback, useEffect, useState } from "react";
import { Camera, Eye, Loader2, ShieldCheck, UserCircle2, X } from "lucide-react";
import { apiClient } from "@/lib/api";
import { useLanguage } from "@/context/LanguageContext";
import { apiErrorMessage, formatPlate, normalizePlate } from "@/lib/veresiye";
import { AccountStatementPanel } from "@/components/veresiye/AccountStatementPanel";
import { DocumentViewerModal } from "@/components/veresiye/DocumentViewerModal";
import type { CreditCustomerDetail } from "@/types/veresiye";

interface CustomerDetailModalProps {
  customerId: string | null;
  isManager: boolean;
  onClose: () => void;
  onChanged: () => void;
}

export const CustomerDetailModal: React.FC<CustomerDetailModalProps> = ({
  customerId,
  isManager,
  onClose,
  onChanged,
}) => {
  const { t } = useLanguage();
  const [customer, setCustomer] = useState<CreditCustomerDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [viewerDocId, setViewerDocId] = useState<string | null>(null);

  const [editing, setEditing] = useState(false);
  const [editName, setEditName] = useState("");
  const [editPhone, setEditPhone] = useState("");
  const [editPlate, setEditPlate] = useState("");
  const [editLimit, setEditLimit] = useState("");
  const [editNotes, setEditNotes] = useState("");
  const [savingInfo, setSavingInfo] = useState(false);

  const hydrateEdit = (c: CreditCustomerDetail) => {
    setEditName(c.full_name);
    setEditPhone(c.phone);
    setEditPlate(c.plate ?? "");
    setEditLimit(c.credit_limit !== null ? String(c.credit_limit) : "");
    setEditNotes(c.notes ?? "");
  };

  const loadDetail = useCallback(async () => {
    if (!customerId) return;
    setLoading(true);
    setError(null);
    try {
      const res = await apiClient.get<CreditCustomerDetail>(`/veresiye/customers/${customerId}`);
      setCustomer(res.data);
      hydrateEdit(res.data);
    } catch (err) {
      setError(apiErrorMessage(err, t("veresiye.error_load")));
    } finally {
      setLoading(false);
    }
  }, [customerId, t]);

  useEffect(() => {
    if (!customerId) {
      setCustomer(null);
      return;
    }
    setEditing(false);
    loadDetail();
  }, [customerId, loadDetail]);

  useEffect(() => {
    if (!customerId) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [customerId, onClose]);

  if (!customerId) return null;

  const handleSaveEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!customer) return;
    setSavingInfo(true);
    setError(null);
    try {
      const res = await apiClient.patch<CreditCustomerDetail>(`/veresiye/customers/${customer.id}`, {
        full_name: editName.trim(),
        phone: editPhone.trim(),
        plate: editPlate.trim() ? normalizePlate(editPlate) : null,
        credit_limit: editLimit.trim() ? Number(editLimit.replace(",", ".")).toFixed(2) : null,
        notes: editNotes.trim() || null,
      });
      setCustomer(res.data);
      setEditing(false);
      onChanged();
    } catch (err) {
      setError(apiErrorMessage(err, t("veresiye.error_save")));
    } finally {
      setSavingInfo(false);
    }
  };

  const handleToggleActive = async () => {
    if (!customer) return;
    setError(null);
    try {
      const res = await apiClient.patch<CreditCustomerDetail>(`/veresiye/customers/${customer.id}`, {
        is_active: !customer.is_active,
      });
      setCustomer(res.data);
      onChanged();
    } catch (err) {
      setError(apiErrorMessage(err, t("veresiye.error_save")));
    }
  };

  const handleUploadIdPhoto = async (file: File | undefined) => {
    if (!customer || !file) return;
    setUploadingPhoto(true);
    setError(null);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await apiClient.post<CreditCustomerDetail>(
        `/veresiye/customers/${customer.id}/id-photo`,
        fd,
        { headers: { "Content-Type": "multipart/form-data" } },
      );
      setCustomer(res.data);
      onChanged();
    } catch (err) {
      setError(apiErrorMessage(err, t("veresiye.error_upload")));
    } finally {
      setUploadingPhoto(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/65 backdrop-blur-sm p-3 sm:p-5"
      role="dialog"
      aria-modal="true"
      aria-label={customer?.full_name || t("veresiye.tab_individual")}
    >
      <div className="w-full max-w-5xl bg-white dark:bg-[#111218] border border-slate-200 dark:border-zinc-800 rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[92vh]">
        <div className="flex items-center justify-between gap-3 px-6 py-4 border-b border-slate-100 dark:border-zinc-800">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 rounded-2xl bg-emerald-600/10 text-emerald-600 dark:text-emerald-400 flex items-center justify-center shrink-0">
              <UserCircle2 size={22} />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h3 className="text-base sm:text-lg font-black text-slate-900 dark:text-white truncate">
                  {customer?.full_name || t("veresiye.loading")}
                </h3>
                {customer && (
                  <>
                    <span
                      className={`px-2 py-0.5 rounded-md text-[10px] font-bold ${
                        customer.is_active
                          ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300"
                          : "bg-slate-200 text-slate-600 dark:bg-zinc-800 dark:text-zinc-400"
                      }`}
                    >
                      {customer.is_active ? t("veresiye.active") : t("veresiye.inactive")}
                    </span>
                    <span
                      className={`px-2 py-0.5 rounded-md text-[10px] font-bold ${
                        customer.has_id_photo
                          ? "bg-blue-100 text-blue-700 dark:bg-blue-950/60 dark:text-blue-300"
                          : "bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300"
                      }`}
                    >
                      {customer.has_id_photo
                        ? t("veresiye.id_photo_present")
                        : t("veresiye.id_photo_missing")}
                    </span>
                  </>
                )}
              </div>
              {customer && (
                <p className="text-xs font-mono text-slate-500 dark:text-zinc-400">
                  T.C.: {customer.tc_masked} • {customer.phone}
                  {customer.plate ? ` • ${formatPlate(customer.plate)}` : ""}
                </p>
              )}
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label={t("veresiye.close")}
            className="p-2 rounded-xl text-slate-400 hover:text-slate-700 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-zinc-800 transition"
          >
            <X size={20} />
          </button>
        </div>

        <div className="p-6 overflow-y-auto flex-1 space-y-5">
          {error && (
            <div className="px-4 py-3 rounded-2xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900/50 text-xs font-semibold text-rose-700 dark:text-rose-300">
              {error}
            </div>
          )}

          {loading && !customer ? (
            <div className="py-12 flex items-center justify-center gap-2 text-xs font-semibold text-slate-500">
              <Loader2 size={18} className="animate-spin text-blue-600" />
              <span>{t("veresiye.loading")}</span>
            </div>
          ) : (
            customer && (
              <>
                {/* Profile & ID Photo Actions */}
                <div className="rounded-2xl border border-slate-200/80 dark:border-zinc-800 p-4 bg-slate-50/60 dark:bg-zinc-900/40 space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex flex-wrap items-center gap-2">
                      {isManager && customer.has_id_photo && customer.id_photo_document_id && (
                        <button
                          type="button"
                          onClick={() => setViewerDocId(customer.id_photo_document_id)}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold transition"
                        >
                          <Eye size={14} />
                          <span>{t("veresiye.view_id_photo")}</span>
                        </button>
                      )}

                      <label className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-200/80 dark:bg-zinc-800 hover:bg-slate-200 dark:hover:bg-zinc-700 text-slate-800 dark:text-zinc-200 text-xs font-bold cursor-pointer transition">
                        {uploadingPhoto ? (
                          <Loader2 size={14} className="animate-spin" />
                        ) : (
                          <Camera size={14} />
                        )}
                        <span>{t("veresiye.upload_id_photo")}</span>
                        <input
                          type="file"
                          accept="image/*"
                          capture="environment"
                          className="sr-only"
                          onChange={(e) => handleUploadIdPhoto(e.target.files?.[0])}
                        />
                      </label>
                    </div>

                    {isManager && (
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => setEditing((v) => !v)}
                          className="px-3 py-1.5 rounded-xl bg-slate-200/80 dark:bg-zinc-800 text-xs font-bold text-slate-700 dark:text-zinc-200"
                        >
                          {editing ? t("veresiye.cancel") : t("veresiye.edit")}
                        </button>
                        <button
                          type="button"
                          onClick={handleToggleActive}
                          className="px-3 py-1.5 rounded-xl bg-amber-100 dark:bg-amber-950/60 text-xs font-bold text-amber-800 dark:text-amber-300"
                        >
                          {customer.is_active ? t("veresiye.deactivate") : t("veresiye.activate")}
                        </button>
                      </div>
                    )}
                  </div>

                  {editing && isManager ? (
                    <form onSubmit={handleSaveEdit} className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs pt-2">
                      <input
                        type="text"
                        required
                        value={editName}
                        onChange={(e) => setEditName(e.target.value)}
                        placeholder={t("veresiye.full_name")}
                        className="px-3 py-2 rounded-xl bg-white dark:bg-zinc-950 border border-slate-200 dark:border-zinc-800"
                      />
                      <input
                        type="text"
                        required
                        value={editPhone}
                        onChange={(e) => setEditPhone(e.target.value)}
                        placeholder={t("veresiye.phone")}
                        className="px-3 py-2 rounded-xl bg-white dark:bg-zinc-950 border border-slate-200 dark:border-zinc-800"
                      />
                      <input
                        type="text"
                        value={editPlate}
                        onChange={(e) => setEditPlate(e.target.value.toUpperCase())}
                        placeholder={t("veresiye.plate")}
                        className="px-3 py-2 rounded-xl bg-white dark:bg-zinc-950 border border-slate-200 dark:border-zinc-800 font-mono"
                      />
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        value={editLimit}
                        onChange={(e) => setEditLimit(e.target.value)}
                        placeholder={t("veresiye.credit_limit")}
                        className="px-3 py-2 rounded-xl bg-white dark:bg-zinc-950 border border-slate-200 dark:border-zinc-800"
                      />
                      <textarea
                        rows={2}
                        value={editNotes}
                        onChange={(e) => setEditNotes(e.target.value)}
                        placeholder={t("veresiye.notes")}
                        className="sm:col-span-2 px-3 py-2 rounded-xl bg-white dark:bg-zinc-950 border border-slate-200 dark:border-zinc-800"
                      />
                      <div className="sm:col-span-2 flex justify-end gap-2">
                        <button
                          type="submit"
                          disabled={savingInfo}
                          className="px-4 py-1.5 rounded-xl bg-blue-600 text-white font-bold"
                        >
                          {savingInfo ? t("veresiye.saving") : t("veresiye.save")}
                        </button>
                      </div>
                    </form>
                  ) : (
                    customer.notes && (
                      <p className="text-xs text-slate-600 dark:text-zinc-400">
                        {customer.notes}
                      </p>
                    )
                  )}
                </div>

                {/* Statement (Manager only) */}
                {isManager ? (
                  <div className="space-y-2">
                    <h4 className="text-xs font-black text-slate-800 dark:text-zinc-200 uppercase tracking-wider">
                      {t("veresiye.digital_ledger_title")}
                    </h4>
                    <AccountStatementPanel
                      accountType="individual"
                      accountId={customer.id}
                      accountName={customer.full_name}
                      onBalanceChanged={() => {
                        loadDetail();
                        onChanged();
                      }}
                    />
                  </div>
                ) : (
                  <div className="p-4 rounded-2xl bg-slate-50 dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 flex items-center gap-2.5 text-xs font-semibold text-slate-600 dark:text-zinc-300">
                    <ShieldCheck size={16} className="text-blue-600 shrink-0" />
                    <span>{t("veresiye.cashier_no_ledger")}</span>
                  </div>
                )}
              </>
            )
          )}
        </div>
      </div>

      <DocumentViewerModal
        documentId={viewerDocId}
        title={customer ? `${customer.full_name} — ${t("veresiye.col_id_photo")}` : undefined}
        onClose={() => setViewerDocId(null)}
      />
    </div>
  );
};
