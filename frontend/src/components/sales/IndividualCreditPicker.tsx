import { useEffect, useState } from "react";
import { Search, UserPlus } from "lucide-react";
import { useLanguage } from "@/context/LanguageContext";
import { apiClient } from "@/lib/api";
import { apiErrorMessage, formatPlate, isValidTc } from "@/lib/veresiye";
import { QuickCustomerForm } from "@/components/sales/QuickCustomerForm";
import type { CreditCustomerSummary, CreditSaleInput } from "@/types/veresiye";

interface IndividualCreditPickerProps {
  stationId?: string;
  onCreditInputChange: (input: CreditSaleInput | null) => void;
}

export function IndividualCreditPicker({ stationId, onCreditInputChange }: IndividualCreditPickerProps) {
  const { t } = useLanguage();
  const [customerSearch, setCustomerSearch] = useState("");
  const [customers, setCustomers] = useState<CreditCustomerSummary[]>([]);
  const [loadingCustomers, setLoadingCustomers] = useState(false);
  const [selectedCustomer, setSelectedCustomer] = useState<CreditCustomerSummary | null>(null);
  const [customerTc, setCustomerTc] = useState("");
  const [showQuickCreate, setShowQuickCreate] = useState(false);

  const [searchError, setSearchError] = useState<string | null>(null);

  useEffect(() => {
    if (!selectedCustomer) {
      onCreditInputChange(null);
      return;
    }
    const cleanTc = customerTc.trim();
    if (cleanTc.length > 0 && !isValidTc(cleanTc)) {
      onCreditInputChange(null);
      return;
    }
    onCreditInputChange({
      account_type: "individual",
      credit_customer_id: selectedCustomer.id,
      ...(cleanTc.length === 11 ? { customer_tc: cleanTc } : {}),
    });
  }, [selectedCustomer, customerTc, onCreditInputChange]);

  useEffect(() => {
    let cancelled = false;
    const timer = setTimeout(async () => {
      setLoadingCustomers(true);
      setSearchError(null);
      try {
        const res = await apiClient.get<CreditCustomerSummary[]>("/veresiye/customers", {
          params: {
            active: true,
            ...(stationId ? { station_id: stationId } : {}),
            ...(customerSearch.trim() ? { search: customerSearch.trim() } : {}),
          },
        });
        if (!cancelled) setCustomers(res.data);
      } catch (err) {
        if (!cancelled) {
          setCustomers([]);
          setSearchError(apiErrorMessage(err, t("veresiye.error_load")));
        }
      } finally {
        if (!cancelled) setLoadingCustomers(false);
      }
    }, 250);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [customerSearch, stationId, t]);

  const customerTcValid = customerTc.trim() ? isValidTc(customerTc) : null;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <label className="text-[11px] font-bold text-slate-700 dark:text-zinc-300">
          {t("creditsale.search_customer")}
        </label>
        <button
          type="button"
          onClick={() => setShowQuickCreate((v) => !v)}
          className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-[11px] font-bold"
        >
          <UserPlus size={12} />
          <span>{t("creditsale.new_customer_btn")}</span>
        </button>
      </div>

      {showQuickCreate && (
        <QuickCustomerForm
          stationId={stationId}
          onCancel={() => setShowQuickCreate(false)}
          onCreated={(created) => {
            setShowQuickCreate(false);
            setSelectedCustomer(created);
            setCustomers((prev) => [created, ...prev.filter((c) => c.id !== created.id)]);
          }}
        />
      )}

      <div className="relative">
        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
        <input
          type="text"
          placeholder={t("creditsale.search_placeholder")}
          value={customerSearch}
          onChange={(e) => setCustomerSearch(e.target.value)}
          className="w-full pl-8 pr-3 py-2 rounded-xl bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-700 text-xs text-slate-900 dark:text-white"
        />
      </div>

      <div className="max-h-40 overflow-y-auto space-y-1.5">
        {loadingCustomers ? (
          <div className="py-3 text-center text-xs text-slate-500">
            {t("veresiye.loading")}
          </div>
        ) : searchError ? (
          <p role="alert" className="py-3 text-center text-xs text-rose-600">{searchError}</p>
        ) : customers.length === 0 ? (
          <div className="py-3 text-center text-xs text-slate-500">
            {t("creditsale.no_customers_found")}
          </div>
        ) : (
          customers.map((c) => {
            const isSelected = selectedCustomer?.id === c.id;
            return (
              <button
                key={c.id}
                type="button"
                onClick={() => setSelectedCustomer(c)}
                className={`w-full p-2.5 rounded-xl border text-left flex items-center justify-between gap-2 transition ${
                  isSelected
                    ? "border-blue-600 bg-blue-50 dark:bg-blue-950/40"
                    : "border-slate-200 dark:border-zinc-800 bg-white dark:bg-zinc-900"
                }`}
              >
                <div className="min-w-0">
                  <div className="text-xs font-black text-slate-900 dark:text-white truncate">
                    {c.full_name}
                  </div>
                  <div className="text-[10px] font-mono text-slate-500 dark:text-zinc-400">
                    {c.tc_masked} • {c.phone}
                    {c.plate ? ` • ${formatPlate(c.plate)}` : ""}
                  </div>
                </div>
                {!c.has_id_photo && (
                  <span className="px-2 py-0.5 rounded-md bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300 text-[10px] font-bold shrink-0">
                    {t("creditsale.id_missing_badge")}
                  </span>
                )}
              </button>
            );
          })
        )}
      </div>

      {selectedCustomer && (
        <div className="pt-1 space-y-1">
          <label className="block text-[11px] font-bold text-slate-700 dark:text-zinc-300">
            {t("creditsale.customer_tc_optional")}
          </label>
          <input
            type="text"
            inputMode="numeric"
            maxLength={11}
            value={customerTc}
            onChange={(e) => setCustomerTc(e.target.value.replace(/\D/g, "").slice(0, 11))}
            placeholder="11 haneli T.C. no (opsiyonel)"
            className="w-full px-3 py-2 rounded-xl bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-700 text-xs font-mono text-slate-900 dark:text-white"
          />
          <p className="text-[10px] text-slate-500 dark:text-zinc-400">
            {t("creditsale.customer_tc_hint")}
          </p>
          {customerTcValid === false && (
            <p className="text-[10px] font-bold text-rose-600">
              {t("creditsale.tc_hint_invalid")}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
