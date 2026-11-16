import React, { useEffect, useRef, useState } from "react";
import { Building2, Loader2, Plus, Trash2, X } from "lucide-react";
import { apiClient } from "@/lib/api";
import { useLanguage } from "@/context/LanguageContext";
import { apiErrorMessage, isValidTc, normalizePlate } from "@/lib/veresiye";
import type { CreditCompanyDetail, DriverCreate, VehicleCreate } from "@/types/veresiye";

interface CreateCompanyModalProps {
  open: boolean;
  onClose: () => void;
  onCreated: (company: CreditCompanyDetail) => void;
}

interface VehicleDraft {
  plate: string;
  description: string;
}

interface DriverDraft {
  full_name: string;
  tc_no: string;
  phone: string;
}

export const CreateCompanyModal: React.FC<CreateCompanyModalProps> = ({
  open,
  onClose,
  onCreated,
}) => {
  const { t } = useLanguage();
  const [name, setName] = useState("");
  const [taxNumber, setTaxNumber] = useState("");
  const [taxOffice, setTaxOffice] = useState("");
  const [contactName, setContactName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [address, setAddress] = useState("");
  const [notes, setNotes] = useState("");
  const [creditLimit, setCreditLimit] = useState("");
  const [paymentTermDays, setPaymentTermDays] = useState("");
  const [vehicles, setVehicles] = useState<VehicleDraft[]>([{ plate: "", description: "" }]);
  const [drivers, setDrivers] = useState<DriverDraft[]>([{ full_name: "", tc_no: "", phone: "" }]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const nameRef = useRef<HTMLInputElement>(null);

  const resetForm = () => {
    setName("");
    setTaxNumber("");
    setTaxOffice("");
    setContactName("");
    setPhone("");
    setEmail("");
    setAddress("");
    setNotes("");
    setCreditLimit("");
    setPaymentTermDays("");
    setVehicles([{ plate: "", description: "" }]);
    setDrivers([{ full_name: "", tc_no: "", phone: "" }]);
    setError(null);
  };

  useEffect(() => {
    if (!open) {
      // Clear T.C. inputs cleanly when closing
      setDrivers([{ full_name: "", tc_no: "", phone: "" }]);
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

  if (!open) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const validVehicles: VehicleCreate[] = [];
    for (const v of vehicles) {
      if (!v.plate.trim() && !v.description.trim()) continue;
      if (!v.plate.trim()) {
        setError(t("veresiye.plate_required"));
        return;
      }
      validVehicles.push({
        plate: normalizePlate(v.plate),
        description: v.description.trim() || undefined,
      });
    }

    const validDrivers: DriverCreate[] = [];
    for (const d of drivers) {
      if (!d.full_name.trim() && !d.tc_no.trim() && !d.phone.trim()) continue;
      if (!d.full_name.trim() || !isValidTc(d.tc_no)) {
        setError(t("veresiye.driver_fields_required"));
        return;
      }
      validDrivers.push({
        full_name: d.full_name.trim(),
        tc_no: d.tc_no.trim(),
        phone: d.phone.trim() || undefined,
      });
    }

    setSaving(true);
    try {
      const res = await apiClient.post<CreditCompanyDetail>("/veresiye/companies", {
        name: name.trim(),
        tax_number: taxNumber.trim() || undefined,
        tax_office: taxOffice.trim() || undefined,
        contact_name: contactName.trim() || undefined,
        phone: phone.trim() || undefined,
        email: email.trim() || undefined,
        address: address.trim() || undefined,
        notes: notes.trim() || undefined,
        credit_limit: creditLimit.trim() ? Number(creditLimit.replace(",", ".")).toFixed(2) : undefined,
        payment_term_days: paymentTermDays.trim() ? Number(paymentTermDays) : undefined,
        vehicles: validVehicles,
        drivers: validDrivers,
      });
      resetForm();
      onCreated(res.data);
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
      aria-label={t("veresiye.company_modal_title")}
    >
      <form
        onSubmit={handleSubmit}
        className="w-full max-w-3xl bg-white dark:bg-[#111218] border border-slate-200 dark:border-zinc-800 rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[92vh]"
      >
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 dark:border-zinc-800">
          <div className="flex items-center gap-2.5">
            <Building2 size={20} className="text-blue-600" />
            <div>
              <h3 className="text-base font-black text-slate-900 dark:text-white">
                {t("veresiye.company_modal_title")}
              </h3>
              <p className="text-xs font-medium text-slate-500 dark:text-zinc-400">
                {t("veresiye.company_modal_sub")}
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

        <div className="p-6 overflow-y-auto space-y-5">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
            <div className="sm:col-span-2">
              <label htmlFor="comp-name" className="block text-xs font-bold text-slate-700 dark:text-zinc-300 mb-1">
                {t("veresiye.company_name")}
              </label>
              <input
                ref={nameRef}
                id="comp-name"
                type="text"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full px-3.5 py-2 rounded-xl bg-slate-50 dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 text-sm text-slate-900 dark:text-white"
              />
            </div>

            <div>
              <label htmlFor="comp-tax-no" className="block text-xs font-bold text-slate-700 dark:text-zinc-300 mb-1">
                {t("veresiye.tax_number")}
              </label>
              <input
                id="comp-tax-no"
                type="text"
                value={taxNumber}
                onChange={(e) => setTaxNumber(e.target.value)}
                className="w-full px-3.5 py-2 rounded-xl bg-slate-50 dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 text-sm text-slate-900 dark:text-white"
              />
            </div>

            <div>
              <label htmlFor="comp-tax-office" className="block text-xs font-bold text-slate-700 dark:text-zinc-300 mb-1">
                {t("veresiye.tax_office")}
              </label>
              <input
                id="comp-tax-office"
                type="text"
                value={taxOffice}
                onChange={(e) => setTaxOffice(e.target.value)}
                className="w-full px-3.5 py-2 rounded-xl bg-slate-50 dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 text-sm text-slate-900 dark:text-white"
              />
            </div>

            <div>
              <label htmlFor="comp-contact" className="block text-xs font-bold text-slate-700 dark:text-zinc-300 mb-1">
                {t("veresiye.contact_name")}
              </label>
              <input
                id="comp-contact"
                type="text"
                value={contactName}
                onChange={(e) => setContactName(e.target.value)}
                className="w-full px-3.5 py-2 rounded-xl bg-slate-50 dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 text-sm text-slate-900 dark:text-white"
              />
            </div>

            <div>
              <label htmlFor="comp-phone" className="block text-xs font-bold text-slate-700 dark:text-zinc-300 mb-1">
                {t("veresiye.phone")}
              </label>
              <input
                id="comp-phone"
                type="text"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                className="w-full px-3.5 py-2 rounded-xl bg-slate-50 dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 text-sm text-slate-900 dark:text-white"
              />
            </div>

            <div>
              <label htmlFor="comp-email" className="block text-xs font-bold text-slate-700 dark:text-zinc-300 mb-1">
                {t("veresiye.email")}
              </label>
              <input
                id="comp-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full px-3.5 py-2 rounded-xl bg-slate-50 dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 text-sm text-slate-900 dark:text-white"
              />
            </div>

            <div>
              <label htmlFor="comp-address" className="block text-xs font-bold text-slate-700 dark:text-zinc-300 mb-1">
                {t("veresiye.address")}
              </label>
              <input
                id="comp-address"
                type="text"
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                className="w-full px-3.5 py-2 rounded-xl bg-slate-50 dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 text-sm text-slate-900 dark:text-white"
              />
            </div>

            <div>
              <label htmlFor="comp-limit" className="block text-xs font-bold text-slate-700 dark:text-zinc-300 mb-1">
                {t("veresiye.credit_limit")}
              </label>
              <input
                id="comp-limit"
                type="number"
                min="0"
                step="0.01"
                value={creditLimit}
                onChange={(e) => setCreditLimit(e.target.value)}
                className="w-full px-3.5 py-2 rounded-xl bg-slate-50 dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 text-sm text-slate-900 dark:text-white"
              />
            </div>

            <div>
              <label htmlFor="comp-term" className="block text-xs font-bold text-slate-700 dark:text-zinc-300 mb-1">
                {t("veresiye.payment_term_days")}
              </label>
              <input
                id="comp-term"
                type="number"
                min="1"
                max="365"
                value={paymentTermDays}
                onChange={(e) => setPaymentTermDays(e.target.value)}
                className="w-full px-3.5 py-2 rounded-xl bg-slate-50 dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 text-sm text-slate-900 dark:text-white"
              />
            </div>

            <div className="sm:col-span-2 text-[11px] font-medium text-slate-500 dark:text-zinc-400">
              {t("veresiye.optional_terms_hint")}
            </div>

            <div className="sm:col-span-2">
              <label htmlFor="comp-notes" className="block text-xs font-bold text-slate-700 dark:text-zinc-300 mb-1">
                {t("veresiye.notes")}
              </label>
              <textarea
                id="comp-notes"
                rows={2}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                className="w-full px-3.5 py-2 rounded-xl bg-slate-50 dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 text-sm text-slate-900 dark:text-white"
              />
            </div>
          </div>

          {/* Vehicles list */}
          <div className="space-y-2.5 pt-2 border-t border-slate-100 dark:border-zinc-800">
            <div className="flex items-center justify-between">
              <span className="text-xs font-black text-slate-800 dark:text-zinc-200 uppercase tracking-wider">
                {t("veresiye.vehicles_section")}
              </span>
              <button
                type="button"
                onClick={() => setVehicles((prev) => [...prev, { plate: "", description: "" }])}
                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-blue-50 dark:bg-blue-950/50 text-blue-700 dark:text-blue-300 text-xs font-bold"
              >
                <Plus size={13} />
                {t("veresiye.add_vehicle")}
              </button>
            </div>

            {vehicles.map((v, idx) => (
              <div key={idx} className="grid grid-cols-1 sm:grid-cols-12 gap-2 items-center">
                <input
                  type="text"
                  aria-label={t("veresiye.plate")}
                  placeholder="06 ABC 123"
                  value={v.plate}
                  onChange={(e) => {
                    const val = e.target.value.toUpperCase();
                    setVehicles((prev) =>
                      prev.map((row, i) => (i === idx ? { ...row, plate: val } : row)),
                    );
                  }}
                  className="sm:col-span-4 px-3 py-2 rounded-xl bg-slate-50 dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 text-xs font-mono font-bold text-slate-900 dark:text-white"
                />
                <input
                  type="text"
                  aria-label={t("veresiye.vehicle_description")}
                  placeholder={t("veresiye.vehicle_description")}
                  value={v.description}
                  onChange={(e) => {
                    const val = e.target.value;
                    setVehicles((prev) =>
                      prev.map((row, i) => (i === idx ? { ...row, description: val } : row)),
                    );
                  }}
                  className="sm:col-span-7 px-3 py-2 rounded-xl bg-slate-50 dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 text-xs text-slate-900 dark:text-white"
                />
                <button
                  type="button"
                  aria-label={t("veresiye.remove")}
                  onClick={() =>
                    setVehicles((prev) =>
                      prev.length === 1 ? [{ plate: "", description: "" }] : prev.filter((_, i) => i !== idx),
                    )
                  }
                  className="sm:col-span-1 p-2 rounded-lg text-slate-400 hover:text-rose-600 justify-self-end"
                >
                  <Trash2 size={14} />
                </button>
              </div>
            ))}
          </div>

          {/* Drivers list */}
          <div className="space-y-2.5 pt-2 border-t border-slate-100 dark:border-zinc-800">
            <div className="flex items-center justify-between">
              <span className="text-xs font-black text-slate-800 dark:text-zinc-200 uppercase tracking-wider">
                {t("veresiye.drivers_section")}
              </span>
              <button
                type="button"
                onClick={() => setDrivers((prev) => [...prev, { full_name: "", tc_no: "", phone: "" }])}
                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-blue-50 dark:bg-blue-950/50 text-blue-700 dark:text-blue-300 text-xs font-bold"
              >
                <Plus size={13} />
                {t("veresiye.add_driver")}
              </button>
            </div>

            {drivers.map((d, idx) => {
              const tcOk = d.tc_no.trim() ? isValidTc(d.tc_no) : null;
              return (
                <div key={idx} className="grid grid-cols-1 sm:grid-cols-12 gap-2 items-start">
                  <input
                    type="text"
                    aria-label={t("veresiye.full_name")}
                    placeholder={t("veresiye.full_name")}
                    value={d.full_name}
                    onChange={(e) => {
                      const val = e.target.value;
                      setDrivers((prev) =>
                        prev.map((row, i) => (i === idx ? { ...row, full_name: val } : row)),
                      );
                    }}
                    className="sm:col-span-4 px-3 py-2 rounded-xl bg-slate-50 dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 text-xs text-slate-900 dark:text-white"
                  />
                  <div className="sm:col-span-4">
                    <input
                      type="text"
                      inputMode="numeric"
                      maxLength={11}
                      aria-label={t("veresiye.tc_no")}
                      placeholder={t("veresiye.tc_no")}
                      value={d.tc_no}
                      onChange={(e) => {
                        const val = e.target.value.replace(/\D/g, "").slice(0, 11);
                        setDrivers((prev) =>
                          prev.map((row, i) => (i === idx ? { ...row, tc_no: val } : row)),
                        );
                      }}
                      className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 text-xs font-mono text-slate-900 dark:text-white"
                    />
                    {tcOk !== null && (
                      <div
                        className={`mt-0.5 text-[10px] font-bold ${
                          tcOk ? "text-emerald-600 dark:text-emerald-400" : "text-rose-600 dark:text-rose-400"
                        }`}
                      >
                        {tcOk ? t("veresiye.tc_valid") : t("veresiye.tc_invalid")}
                      </div>
                    )}
                  </div>
                  <input
                    type="text"
                    aria-label={t("veresiye.phone")}
                    placeholder={t("veresiye.phone")}
                    value={d.phone}
                    onChange={(e) => {
                      const val = e.target.value;
                      setDrivers((prev) =>
                        prev.map((row, i) => (i === idx ? { ...row, phone: val } : row)),
                      );
                    }}
                    className="sm:col-span-3 px-3 py-2 rounded-xl bg-slate-50 dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 text-xs text-slate-900 dark:text-white"
                  />
                  <button
                    type="button"
                    aria-label={t("veresiye.remove")}
                    onClick={() =>
                      setDrivers((prev) =>
                        prev.length === 1 ? [{ full_name: "", tc_no: "", phone: "" }] : prev.filter((_, i) => i !== idx),
                      )
                    }
                    className="sm:col-span-1 p-2 rounded-lg text-slate-400 hover:text-rose-600 justify-self-end"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              );
            })}
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
            disabled={saving || !name.trim()}
            className="inline-flex items-center gap-2 px-5 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-xs font-bold shadow-md shadow-blue-600/20 transition"
          >
            {saving && <Loader2 size={14} className="animate-spin" />}
            <span>{saving ? t("veresiye.saving") : t("veresiye.save")}</span>
          </button>
        </div>
      </form>
    </div>
  );
};
