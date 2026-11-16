import React, { useEffect, useState } from "react";
import { AlertCircle, Link2, Loader2, X } from "lucide-react";
import { apiClient } from "@/lib/api";
import { useLanguage } from "@/context/LanguageContext";
import { apiErrorMessage, formatPlate } from "@/lib/veresiye";
import type {
  CreditAccountType,
  CreditCompanyDetail,
  CreditCompanySummary,
  CreditCustomerSummary,
  CreditSaleLinkRequest,
} from "@/types/veresiye";

interface LinkCreditSaleModalProps {
  transactionId: string | null;
  summaryText?: string;
  onClose: () => void;
  onSuccess: () => void;
}

export const LinkCreditSaleModal: React.FC<LinkCreditSaleModalProps> = ({
  transactionId,
  summaryText,
  onClose,
  onSuccess,
}) => {
  const { t } = useLanguage();
  const [accountType, setAccountType] = useState<CreditAccountType>("corporate");
  const [companies, setCompanies] = useState<CreditCompanySummary[]>([]);
  const [customers, setCustomers] = useState<CreditCustomerSummary[]>([]);
  const [selectedCompanyId, setSelectedCompanyId] = useState("");
  const [companyDetail, setCompanyDetail] = useState<CreditCompanyDetail | null>(null);
  const [selectedVehicleId, setSelectedVehicleId] = useState("");
  const [selectedDriverId, setSelectedDriverId] = useState("");
  const [selectedCustomerId, setSelectedCustomerId] = useState("");
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!transactionId) return;
    setError(null);
    setSelectedCompanyId("");
    setCompanyDetail(null);
    setSelectedVehicleId("");
    setSelectedDriverId("");
    setSelectedCustomerId("");

    let cancelled = false;
    setLoading(true);
    Promise.all([
      apiClient.get<CreditCompanySummary[]>("/veresiye/companies"),
      apiClient.get<CreditCustomerSummary[]>("/veresiye/customers", { params: { active: true } }),
    ])
      .then(([compRes, custRes]) => {
        if (cancelled) return;
        setCompanies(compRes.data);
        setCustomers(custRes.data);
      })
      .catch((err) => {
        if (!cancelled) setError(apiErrorMessage(err, t("veresiye.error_load")));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [transactionId, t]);

  useEffect(() => {
    if (!selectedCompanyId) {
      setCompanyDetail(null);
      setSelectedVehicleId("");
      setSelectedDriverId("");
      return;
    }
    let cancelled = false;
    apiClient
      .get<CreditCompanyDetail>(`/veresiye/companies/${selectedCompanyId}`)
      .then((res) => {
        if (!cancelled) setCompanyDetail(res.data);
      })
      .catch(() => {
        if (!cancelled) setCompanyDetail(null);
      });
    return () => {
      cancelled = true;
    };
  }, [selectedCompanyId]);

  useEffect(() => {
    if (!transactionId) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [transactionId, onClose]);

  if (!transactionId) return null;

  const canSubmit =
    accountType === "corporate" ? Boolean(selectedCompanyId) : Boolean(selectedCustomerId);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit) return;
    setSaving(true);
    setError(null);
    try {
      const selectedVehicle = companyDetail?.vehicles.find((v) => v.id === selectedVehicleId);
      const payload: CreditSaleLinkRequest =
        accountType === "corporate"
          ? {
              transaction_id: transactionId,
              account_type: "corporate",
              credit_company_id: selectedCompanyId,
              ...(selectedVehicleId ? { vehicle_id: selectedVehicleId } : {}),
              ...(selectedVehicle ? { plate: selectedVehicle.plate } : {}),
              ...(selectedDriverId ? { driver_id: selectedDriverId } : {}),
            }
          : {
              transaction_id: transactionId,
              account_type: "individual",
              credit_customer_id: selectedCustomerId,
            };

      await apiClient.post("/veresiye/sales/link", payload);
      onSuccess();
      onClose();
    } catch (err) {
      setError(apiErrorMessage(err, t("veresiye.error_save")));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center bg-black/65 backdrop-blur-sm p-4"
      role="dialog"
      aria-modal="true"
      aria-label={t("creditsale.link_modal_title")}
    >
      <form
        onSubmit={handleSubmit}
        className="w-full max-w-md bg-white dark:bg-[#111218] border border-slate-200 dark:border-zinc-800 rounded-3xl shadow-2xl overflow-hidden"
      >
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 dark:border-zinc-800">
          <div className="flex items-center gap-2.5">
            <Link2 size={19} className="text-blue-600" />
            <h3 className="text-base font-black text-slate-900 dark:text-white">
              {t("creditsale.link_modal_title")}
            </h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label={t("veresiye.close")}
            className="p-2 rounded-xl text-slate-400 hover:text-slate-700 dark:hover:text-white"
          >
            <X size={18} />
          </button>
        </div>

        <div className="p-6 space-y-4">
          {summaryText && (
            <div className="px-3.5 py-2.5 rounded-2xl bg-slate-50 dark:bg-zinc-900 text-xs font-semibold text-slate-700 dark:text-zinc-300">
              {summaryText}
            </div>
          )}

          <div className="p-3 rounded-2xl bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900/50 flex items-start gap-2 text-xs text-amber-800 dark:text-amber-300 font-medium">
            <AlertCircle size={15} className="shrink-0 mt-0.5" />
            <span>{t("creditsale.link_retro_notice")}</span>
          </div>

          <div className="grid grid-cols-2 gap-1 p-1 rounded-2xl bg-slate-100 dark:bg-zinc-900">
            <button
              type="button"
              onClick={() => setAccountType("corporate")}
              className={`py-2 rounded-xl text-xs font-bold transition ${
                accountType === "corporate"
                  ? "bg-white dark:bg-zinc-800 text-slate-900 dark:text-white shadow-sm"
                  : "text-slate-500"
              }`}
            >
              {t("creditsale.corporate")}
            </button>
            <button
              type="button"
              onClick={() => setAccountType("individual")}
              className={`py-2 rounded-xl text-xs font-bold transition ${
                accountType === "individual"
                  ? "bg-white dark:bg-zinc-800 text-slate-900 dark:text-white shadow-sm"
                  : "text-slate-500"
              }`}
            >
              {t("creditsale.individual")}
            </button>
          </div>

          {loading ? (
            <div className="py-4 text-center text-xs text-slate-500">{t("veresiye.loading")}</div>
          ) : accountType === "corporate" ? (
            <div className="space-y-3">
              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-zinc-300 mb-1">
                  {t("creditsale.link_select_company")}
                </label>
                <select
                  required
                  value={selectedCompanyId}
                  onChange={(e) => setSelectedCompanyId(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl bg-slate-50 dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 text-xs font-semibold"
                >
                  <option value="">--</option>
                  {companies.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </div>

              {companyDetail && (
                <>
                  <div>
                    <label className="block text-xs font-bold text-slate-700 dark:text-zinc-300 mb-1">
                      {t("creditsale.link_select_vehicle")}
                    </label>
                    <select
                      value={selectedVehicleId}
                      onChange={(e) => setSelectedVehicleId(e.target.value)}
                      className="w-full px-3.5 py-2 rounded-xl bg-slate-50 dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 text-xs"
                    >
                      <option value="">--</option>
                      {companyDetail.vehicles.map((v) => (
                        <option key={v.id} value={v.id}>
                          {formatPlate(v.plate)} {v.description ? `(${v.description})` : ""}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-700 dark:text-zinc-300 mb-1">
                      {t("creditsale.link_select_driver")}
                    </label>
                    <select
                      value={selectedDriverId}
                      onChange={(e) => setSelectedDriverId(e.target.value)}
                      className="w-full px-3.5 py-2 rounded-xl bg-slate-50 dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 text-xs"
                    >
                      <option value="">--</option>
                      {companyDetail.drivers.map((d) => (
                        <option key={d.id} value={d.id}>
                          {d.full_name} ({d.tc_masked})
                        </option>
                      ))}
                    </select>
                  </div>
                </>
              )}
            </div>
          ) : (
            <div>
              <label className="block text-xs font-bold text-slate-700 dark:text-zinc-300 mb-1">
                {t("veresiye.col_customer")} *
              </label>
              <select
                required
                value={selectedCustomerId}
                onChange={(e) => setSelectedCustomerId(e.target.value)}
                className="w-full px-3.5 py-2.5 rounded-xl bg-slate-50 dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 text-xs font-semibold"
              >
                <option value="">--</option>
                {customers.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.full_name} ({c.tc_masked})
                  </option>
                ))}
              </select>
            </div>
          )}

          {error && (
            <div className="p-3 rounded-xl bg-rose-50 dark:bg-rose-950/40 text-xs font-semibold text-rose-700 dark:text-rose-300">
              {error}
            </div>
          )}
        </div>

        <div className="px-6 py-4 border-t border-slate-100 dark:border-zinc-800 flex justify-end gap-2.5">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-xl text-xs font-bold text-slate-600 dark:text-zinc-300"
          >
            {t("veresiye.cancel")}
          </button>
          <button
            type="submit"
            disabled={saving || !canSubmit}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-xs font-bold"
          >
            {saving && <Loader2 size={14} className="animate-spin" />}
            <span>{t("creditsale.link_submit")}</span>
          </button>
        </div>
      </form>
    </div>
  );
};
