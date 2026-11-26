import React, { useEffect, useRef, useState } from "react";
import { Loader2, UserPlus, X } from "lucide-react";
import { apiClient } from "@/lib/api";
import { useLanguage } from "@/context/LanguageContext";
import { apiErrorMessage, isValidTc, normalizePlate } from "@/lib/veresiye";
import type { CreditCustomerDetail } from "@/types/veresiye";

interface CreateCustomerModalProps {
  open: boolean;
  isManager: boolean;
  onClose: () => void;
  onCreated: (customer: CreditCustomerDetail) => void;
}

export const CreateCustomerModal: React.FC<CreateCustomerModalProps> = ({
  open,
  isManager,
  onClose,
  onCreated,
}) => {
  const { t } = useLanguage();
  const [fullName, setFullName] = useState("");
  const [tcNo, setTcNo] = useState("");
  const [phone, setPhone] = useState("");
  const [plate, setPlate] = useState("");
  const [creditLimit, setCreditLimit] = useState("");
  const [notes, setNotes] = useState("");
  const [idPhotoFile, setIdPhotoFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [createdCustomer, setCreatedCustomer] = useState<CreditCustomerDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const nameRef = useRef<HTMLInputElement>(null);

  const resetForm = () => {
    setCreatedCustomer(null);
    setFullName("");
    setTcNo("");
    setPhone("");
    setPlate("");
    setCreditLimit("");
    setNotes("");
    setIdPhotoFile(null);
    setPreviewUrl(null);
    setError(null);
  };

  useEffect(() => {
    if (!open) {
      setTcNo("");
      return;
    }
    resetForm();
    setTimeout(() => nameRef.current?.focus(), 20);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  useEffect(() => {
    if (!idPhotoFile || !idPhotoFile.type.startsWith("image/")) {
      setPreviewUrl(null);
      return;
    }
    const url = URL.createObjectURL(idPhotoFile);
    setPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [idPhotoFile]);

  if (!open) return null;

  const tcValid = tcNo.trim() ? isValidTc(tcNo) : null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!isValidTc(tcNo)) {
      setError(t("veresiye.tc_invalid"));
      return;
    }

    setSaving(true);
    try {
      let customer = createdCustomer;
      if (!customer) {
      const res = await apiClient.post<CreditCustomerDetail>("/veresiye/customers", {
        full_name: fullName.trim(),
        tc_no: tcNo.trim(),
        phone: phone.trim(),
        plate: plate.trim() ? normalizePlate(plate) : undefined,
        ...(isManager && creditLimit.trim()
          ? { credit_limit: Number(creditLimit.replace(",", ".")).toFixed(2) }
          : {}),
        notes: notes.trim() || undefined,
      });

      customer = res.data;
      setCreatedCustomer(customer);
      }
      if (idPhotoFile) {
        try {
          const fd = new FormData();
          fd.append("file", idPhotoFile);
          const photoRes = await apiClient.post<CreditCustomerDetail>(
            `/veresiye/customers/${customer.id}/id-photo`,
            fd,
            { headers: { "Content-Type": "multipart/form-data" } },
          );
          customer = photoRes.data;
        } catch (err) {
          setError(t("veresiye.customer_created_photo_failed") + " " + apiErrorMessage(err, t("veresiye.error_upload")));
          return;
        }
      }

      resetForm();
      onCreated(customer);
      onClose();
    } catch (err) {
      setError(apiErrorMessage(err, t("veresiye.error_save")));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-[65] flex items-center justify-center bg-black/65 backdrop-blur-sm p-4"
      role="dialog"
      aria-modal="true"
      aria-label={t("veresiye.customer_modal_title")}
    >
      <form
        onSubmit={handleSubmit}
        className="w-full max-w-lg bg-white dark:bg-[#111218] border border-slate-200 dark:border-zinc-800 rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]"
      >
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 dark:border-zinc-800">
          <div className="flex items-center gap-2.5">
            <UserPlus size={20} className="text-blue-600" />
            <div>
              <h3 className="text-base font-black text-slate-900 dark:text-white">
                {t("veresiye.customer_modal_title")}
              </h3>
              <p className="text-xs font-medium text-slate-500 dark:text-zinc-400">
                {t("veresiye.customer_modal_sub")}
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

        <div className="p-6 overflow-y-auto space-y-4">
          <div>
            <label htmlFor="cust-name" className="block text-xs font-bold text-slate-700 dark:text-zinc-300 mb-1">
              {t("veresiye.full_name_required")}
            </label>
            <input
              ref={nameRef}
              id="cust-name"
              disabled={saving || Boolean(createdCustomer)}
              type="text"
              required
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              className="w-full px-3.5 py-2 rounded-xl bg-slate-50 dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 text-sm text-slate-900 dark:text-white"
            />
          </div>

          <div>
            <label htmlFor="cust-tc" className="block text-xs font-bold text-slate-700 dark:text-zinc-300 mb-1">
              {t("veresiye.tc_required")}
            </label>
            <input
              id="cust-tc"
              disabled={saving || Boolean(createdCustomer)}
              type="text"
              inputMode="numeric"
              maxLength={11}
              required
              value={tcNo}
              onChange={(e) => setTcNo(e.target.value.replace(/\D/g, "").slice(0, 11))}
              className="w-full px-3.5 py-2 rounded-xl bg-slate-50 dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 text-sm font-mono text-slate-900 dark:text-white"
            />
            {tcValid !== null && (
              <div
                className={`mt-1 text-[11px] font-bold ${
                  tcValid ? "text-emerald-600 dark:text-emerald-400" : "text-rose-600 dark:text-rose-400"
                }`}
              >
                {tcValid ? t("veresiye.tc_valid") : t("veresiye.tc_invalid")}
              </div>
            )}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
            <div>
              <label htmlFor="cust-phone" className="block text-xs font-bold text-slate-700 dark:text-zinc-300 mb-1">
                {t("veresiye.phone_required")}
              </label>
              <input
                id="cust-phone"
                disabled={saving || Boolean(createdCustomer)}
                type="text"
                required
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                className="w-full px-3.5 py-2 rounded-xl bg-slate-50 dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 text-sm text-slate-900 dark:text-white"
              />
            </div>

            <div>
              <label htmlFor="cust-plate" className="block text-xs font-bold text-slate-700 dark:text-zinc-300 mb-1">
                {t("veresiye.plate")}
              </label>
              <input
                id="cust-plate"
                disabled={saving || Boolean(createdCustomer)}
                type="text"
                value={plate}
                onChange={(e) => setPlate(e.target.value.toUpperCase())}
                placeholder="06 ABC 123"
                className="w-full px-3.5 py-2 rounded-xl bg-slate-50 dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 text-sm font-mono font-bold text-slate-900 dark:text-white"
              />
            </div>
          </div>

          {isManager && (
            <div>
              <label htmlFor="cust-limit" className="block text-xs font-bold text-slate-700 dark:text-zinc-300 mb-1">
                {t("veresiye.credit_limit")}
              </label>
              <input
                id="cust-limit"
                disabled={saving || Boolean(createdCustomer)}
                type="number"
                min="0"
                step="0.01"
                value={creditLimit}
                onChange={(e) => setCreditLimit(e.target.value)}
                className="w-full px-3.5 py-2 rounded-xl bg-slate-50 dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 text-sm text-slate-900 dark:text-white"
              />
            </div>
          )}

          <div>
            <label htmlFor="cust-id-photo" className="block text-xs font-bold text-slate-700 dark:text-zinc-300 mb-1">
              {t("veresiye.id_photo_label")}
            </label>
            <input
              id="cust-id-photo"
              disabled={saving}
              type="file"
              accept="image/*"
              capture="environment"
              onChange={(e) => setIdPhotoFile(e.target.files?.[0] ?? null)}
              className="block w-full text-xs text-slate-600 dark:text-zinc-300 file:mr-3 file:py-2 file:px-3.5 file:rounded-xl file:border-0 file:text-xs file:font-bold file:bg-blue-50 file:text-blue-700 dark:file:bg-blue-950/60 dark:file:text-blue-300 cursor-pointer"
            />
            <p className="mt-1 text-[11px] text-slate-500 dark:text-zinc-400">
              {t("veresiye.id_photo_hint")}
            </p>
            {previewUrl && (
              <div className="mt-2 rounded-xl overflow-hidden border border-slate-200 dark:border-zinc-800 bg-slate-50 dark:bg-zinc-950 p-2">
                <img src={previewUrl} alt="Kimlik önizleme" className="max-h-40 mx-auto object-contain rounded-lg" />
              </div>
            )}
          </div>

          <div>
            <label htmlFor="cust-notes" className="block text-xs font-bold text-slate-700 dark:text-zinc-300 mb-1">
              {t("veresiye.notes")}
            </label>
            <textarea
              id="cust-notes"
              disabled={saving || Boolean(createdCustomer)}
              rows={2}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="w-full px-3.5 py-2 rounded-xl bg-slate-50 dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 text-sm text-slate-900 dark:text-white"
            />
          </div>

          {error && (
            <div className="px-3.5 py-2.5 rounded-2xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900/50 text-xs font-semibold text-rose-700 dark:text-rose-300">
              {error}
            </div>
          )}
        </div>

        <div className="px-6 py-4 border-t border-slate-100 dark:border-zinc-800 flex items-center justify-end gap-2.5">
          {createdCustomer && <button type="button" disabled={saving} onClick={() => { onCreated(createdCustomer); onClose(); }}
            className="text-xs font-semibold text-slate-600">{t("veresiye.continue_without_photo")}</button>}
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-xl text-xs font-bold text-slate-600 dark:text-zinc-300 hover:bg-slate-100 dark:hover:bg-zinc-800 transition"
          >
            {t("veresiye.cancel")}
          </button>
          <button
            type="submit"
            disabled={saving || !fullName.trim() || !phone.trim()}
            className="inline-flex items-center gap-2 px-5 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-xs font-bold shadow-md shadow-blue-600/20 transition"
          >
            {saving && <Loader2 size={14} className="animate-spin" />}
            <span>{saving ? t("veresiye.saving") : t(createdCustomer ? "veresiye.retry_photo" : "veresiye.save")}</span>
          </button>
        </div>
      </form>
    </div>
  );
};
