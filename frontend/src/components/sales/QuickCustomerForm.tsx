import React, { useEffect, useState } from "react";
import { Loader2, UserPlus } from "lucide-react";
import { apiClient } from "@/lib/api";
import { useLanguage } from "@/context/LanguageContext";
import { apiErrorMessage, isValidTc, normalizePlate } from "@/lib/veresiye";
import type { CreditCustomerDetail, CreditCustomerSummary } from "@/types/veresiye";

interface QuickCustomerFormProps {
  stationId?: string;
  onCancel: () => void;
  onCreated: (customer: CreditCustomerSummary) => void;
}

export const QuickCustomerForm: React.FC<QuickCustomerFormProps> = ({
  stationId,
  onCancel,
  onCreated,
}) => {
  const { t } = useLanguage();
  const [fullName, setFullName] = useState("");
  const [tcNo, setTcNo] = useState("");
  const [phone, setPhone] = useState("");
  const [plate, setPlate] = useState("");
  const [idPhotoFile, setIdPhotoFile] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    return () => {
      setTcNo("");
    };
  }, []);

  const tcValid = tcNo.trim() ? isValidTc(tcNo) : null;

  const handleCreate = async () => {
    setError(null);
    if (!fullName.trim() || !phone.trim() || !isValidTc(tcNo)) {
      setError(t("creditsale.tc_hint_invalid"));
      return;
    }
    setSaving(true);
    try {
      const res = await apiClient.post<CreditCustomerDetail>("/veresiye/customers", {
        ...(stationId ? { station_id: stationId } : {}),
        full_name: fullName.trim(),
        tc_no: tcNo.trim(),
        phone: phone.trim(),
        plate: plate.trim() ? normalizePlate(plate) : undefined,
      });
      let created: CreditCustomerSummary = res.data;
      if (idPhotoFile) {
        try {
          const fd = new FormData();
          fd.append("file", idPhotoFile);
          const photoRes = await apiClient.post<CreditCustomerDetail>(
            `/veresiye/customers/${res.data.id}/id-photo`,
            fd,
            { headers: { "Content-Type": "multipart/form-data" } },
          );
          created = photoRes.data;
        } catch {
          // Müşteri kaydı oluştu; fotoğraf daha sonra eklenebilir
        }
      }
      setTcNo("");
      onCreated(created);
    } catch (err) {
      setError(apiErrorMessage(err, t("veresiye.error_save")));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="p-3.5 rounded-2xl bg-white dark:bg-zinc-900 border border-blue-200 dark:border-blue-900/50 space-y-2.5">
      <div className="flex items-center justify-between">
        <span className="inline-flex items-center gap-1.5 text-xs font-black text-blue-700 dark:text-blue-300">
          <UserPlus size={14} />
          {t("creditsale.new_customer_btn")}
        </span>
        <button
          type="button"
          onClick={onCancel}
          className="text-[11px] font-bold text-slate-500 hover:text-slate-800 dark:hover:text-white"
        >
          {t("common.cancel")}
        </button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        <input
          type="text"
          aria-label={t("creditsale.quick_name")}
          placeholder={t("creditsale.quick_name")}
          value={fullName}
          onChange={(e) => setFullName(e.target.value)}
          className="px-3 py-2 rounded-xl bg-slate-50 dark:bg-zinc-950 border border-slate-200 dark:border-zinc-800 text-xs"
        />
        <div>
          <input
            type="text"
            inputMode="numeric"
            maxLength={11}
            aria-label={t("creditsale.quick_tc")}
            placeholder={t("creditsale.quick_tc")}
            value={tcNo}
            onChange={(e) => setTcNo(e.target.value.replace(/\D/g, "").slice(0, 11))}
            className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-zinc-950 border border-slate-200 dark:border-zinc-800 text-xs font-mono"
          />
          {tcValid !== null && (
            <div className={`text-[10px] font-bold mt-0.5 ${tcValid ? "text-emerald-600" : "text-rose-600"}`}>
              {tcValid ? t("creditsale.tc_hint_valid") : t("creditsale.tc_hint_invalid")}
            </div>
          )}
        </div>
        <input
          type="text"
          aria-label={t("creditsale.quick_phone")}
          placeholder={t("creditsale.quick_phone")}
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          className="px-3 py-2 rounded-xl bg-slate-50 dark:bg-zinc-950 border border-slate-200 dark:border-zinc-800 text-xs"
        />
        <input
          type="text"
          aria-label={t("creditsale.quick_plate")}
          placeholder={t("creditsale.quick_plate")}
          value={plate}
          onChange={(e) => setPlate(e.target.value.toUpperCase())}
          className="px-3 py-2 rounded-xl bg-slate-50 dark:bg-zinc-950 border border-slate-200 dark:border-zinc-800 text-xs font-mono"
        />
      </div>

      <div>
        <label className="block text-[11px] font-bold text-slate-600 dark:text-zinc-400 mb-1">
          {t("creditsale.quick_id_photo")}
        </label>
        <input
          type="file"
          accept="image/*"
          capture="environment"
          onChange={(e) => setIdPhotoFile(e.target.files?.[0] ?? null)}
          className="block w-full text-[11px] text-slate-600 dark:text-zinc-300 file:mr-2 file:py-1 file:px-2.5 file:rounded-lg file:border-0 file:text-[11px] file:font-bold file:bg-blue-50 file:text-blue-700"
        />
      </div>

      {error && (
        <div className="px-3 py-2 rounded-xl bg-rose-50 dark:bg-rose-950/40 text-[11px] font-semibold text-rose-700 dark:text-rose-300">
          {error}
        </div>
      )}

      <div className="flex justify-end">
        <button
          type="button"
          disabled={saving || !fullName.trim() || !phone.trim() || !isValidTc(tcNo)}
          onClick={handleCreate}
          className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-xs font-bold"
        >
          {saving && <Loader2 size={13} className="animate-spin" />}
          <span>{t("creditsale.quick_save_customer")}</span>
        </button>
      </div>
    </div>
  );
};
