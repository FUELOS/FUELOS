import React, { useCallback, useEffect, useState } from "react";
import { Navigate } from "react-router-dom";
import {
  AlertTriangle,
  Building2,
  NotebookText,
  Plus,
  RefreshCw,
  Search,
  UserCircle2,
  Wallet,
} from "lucide-react";
import { apiClient } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { useLanguage } from "@/context/LanguageContext";
import { formatCurrency } from "@/lib/utils";
import { apiErrorMessage, formatPlate, toAmountNumber } from "@/lib/veresiye";
import { CompanyDetailModal } from "@/components/veresiye/CompanyDetailModal";
import { CreateCompanyModal } from "@/components/veresiye/CreateCompanyModal";
import { CreateCustomerModal } from "@/components/veresiye/CreateCustomerModal";
import { CustomerDetailModal } from "@/components/veresiye/CustomerDetailModal";
import { PendingReceiptsPanel } from "@/components/veresiye/PendingReceiptsPanel";
import type { CreditCompanySummary, CreditCustomerSummary, CreditSale, CreditOverview } from "@/types/veresiye";

export const VeresiyePage: React.FC = () => {
  const { user } = useAuth();
  const { t } = useLanguage();
  const isSuperAdmin = user?.role === "super_admin";
  const isManager = user?.role === "station_manager";
  const isCashier = user?.role === "cashier";

  const [activeTab, setActiveTab] = useState<"corporate" | "individual">("corporate");
  const [companySearch, setCompanySearch] = useState("");
  const [customerSearch, setCustomerSearch] = useState("");
  const [debouncedCompanySearch, setDebouncedCompanySearch] = useState("");
  const [debouncedCustomerSearch, setDebouncedCustomerSearch] = useState("");

  const [companies, setCompanies] = useState<CreditCompanySummary[]>([]);
  const [customers, setCustomers] = useState<CreditCustomerSummary[]>([]);
  const [missingReceipts, setMissingReceipts] = useState<CreditSale[]>([]);
  const [missingTotal, setMissingTotal] = useState(0);
  const [overview, setOverview] = useState<CreditOverview | null>(null);
  const [loadingCompanies, setLoadingCompanies] = useState(true);
  const [loadingCustomers, setLoadingCustomers] = useState(true);
  const [loadingMissing, setLoadingMissing] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [createCompanyOpen, setCreateCompanyOpen] = useState(false);
  const [createCustomerOpen, setCreateCustomerOpen] = useState(false);
  const [selectedCompanyId, setSelectedCompanyId] = useState<string | null>(null);
  const [selectedCustomerId, setSelectedCustomerId] = useState<string | null>(null);

  useEffect(() => {
    const id = setTimeout(() => setDebouncedCompanySearch(companySearch.trim()), 250);
    return () => clearTimeout(id);
  }, [companySearch]);

  useEffect(() => {
    const id = setTimeout(() => setDebouncedCustomerSearch(customerSearch.trim()), 250);
    return () => clearTimeout(id);
  }, [customerSearch]);

  const fetchCompanies = useCallback(async () => {
    if (isSuperAdmin) return;
    setLoadingCompanies(true);
    try {
      const res = await apiClient.get<CreditCompanySummary[]>("/veresiye/companies", {
        params: debouncedCompanySearch ? { search: debouncedCompanySearch } : undefined,
      });
      setCompanies(res.data);
    } catch (err) {
      setError(apiErrorMessage(err, t("veresiye.error_load")));
    } finally {
      setLoadingCompanies(false);
    }
  }, [debouncedCompanySearch, isSuperAdmin, t]);

  const fetchCustomers = useCallback(async () => {
    if (isSuperAdmin) return;
    setLoadingCustomers(true);
    try {
      const res = await apiClient.get<CreditCustomerSummary[]>("/veresiye/customers", {
        params: debouncedCustomerSearch ? { search: debouncedCustomerSearch } : undefined,
      });
      setCustomers(res.data);
    } catch (err) {
      setError(apiErrorMessage(err, t("veresiye.error_load")));
    } finally {
      setLoadingCustomers(false);
    }
  }, [debouncedCustomerSearch, isSuperAdmin, t]);

  const fetchMissingReceipts = useCallback(async (offset = 0) => {
    if (isSuperAdmin) return;
    setLoadingMissing(true);
    try {
      const res = await apiClient.get<CreditSale[]>("/veresiye/sales", {
        params: { missing_receipt: true, offset },
      });
      setMissingReceipts((previous) => offset ? [...previous, ...res.data] : res.data);
      setMissingTotal(Number(res.headers["x-total-count"] ?? res.data.length));
    } catch (err) {
      setError(apiErrorMessage(err, t("veresiye.error_load")));
    } finally {
      setLoadingMissing(false);
    }
  }, [isSuperAdmin, t]);

  const fetchOverview = useCallback(async () => {
    if (!isManager) return;
    try {
      const res = await apiClient.get<CreditOverview>("/veresiye/summary");
      setOverview(res.data);
    } catch (err) {
      setOverview(null);
      setError(apiErrorMessage(err, t("veresiye.error_load")));
    }
  }, [isManager, t]);

  useEffect(() => { fetchOverview(); }, [fetchOverview]);

  useEffect(() => {
    fetchCompanies();
  }, [fetchCompanies]);

  useEffect(() => {
    fetchCustomers();
  }, [fetchCustomers]);

  useEffect(() => {
    fetchMissingReceipts();
  }, [fetchMissingReceipts]);

  const refreshAll = () => {
    setError(null);
    fetchCompanies();
    fetchCustomers();
    fetchMissingReceipts();
    fetchOverview();
  };

  const corporateTotal = overview ? toAmountNumber(overview.corporate_receivable) : 0;
  const individualTotal = overview ? toAmountNumber(overview.individual_receivable) : 0;
  const totalReceivable = corporateTotal + individualTotal;

  if (isSuperAdmin) {
    return <Navigate to="/" replace />;
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-2xl bg-blue-600/10 text-blue-600 dark:text-blue-400 flex items-center justify-center shrink-0">
            <NotebookText size={22} />
          </div>
          <div>
            <h1 className="text-xl sm:text-2xl font-black text-slate-900 dark:text-white tracking-tight">
              {t("veresiye.title")}
            </h1>
            <p className="text-xs font-medium text-slate-500 dark:text-zinc-400">
              {t("veresiye.subtitle")}
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={refreshAll}
          className="inline-flex items-center gap-2 px-4 py-2.5 rounded-2xl bg-white dark:bg-[#111218] border border-slate-200 dark:border-zinc-800 text-xs font-bold text-slate-700 dark:text-zinc-200 hover:bg-slate-50 dark:hover:bg-zinc-900 shadow-sm self-start sm:self-auto transition"
        >
          <RefreshCw size={14} />
          <span>{t("veresiye.refresh")}</span>
        </button>
      </div>

      {error && (
        <div className="px-4 py-3 rounded-2xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900/50 text-xs font-semibold text-rose-700 dark:text-rose-300">
          {error}
        </div>
      )}

      {/* Manager KPI Summary */}
      {isManager && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="bg-white dark:bg-[#111218] border border-slate-100 dark:border-zinc-800 rounded-3xl p-5 shadow-sm">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-slate-500 dark:text-zinc-400">
                {t("veresiye.kpi_total_receivable")}
              </span>
              <Wallet size={18} className="text-blue-600" />
            </div>
            <div className="text-2xl font-black text-slate-900 dark:text-white mt-2">
              {overview ? formatCurrency(totalReceivable) : "-"}
            </div>
          </div>

          <div className="bg-white dark:bg-[#111218] border border-slate-100 dark:border-zinc-800 rounded-3xl p-5 shadow-sm">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-slate-500 dark:text-zinc-400">
                {t("veresiye.kpi_corporate_receivable")}
              </span>
              <Building2 size={18} className="text-indigo-600" />
            </div>
            <div className="text-2xl font-black text-slate-900 dark:text-white mt-2">
              {overview ? formatCurrency(corporateTotal) : "-"}
            </div>
            <div className="text-[11px] font-medium text-slate-400 mt-1">
              {t("veresiye.kpi_corporate_sub").replace("{count}", String(overview?.company_count ?? "-"))}
            </div>
          </div>

          <div className="bg-white dark:bg-[#111218] border border-slate-100 dark:border-zinc-800 rounded-3xl p-5 shadow-sm">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-slate-500 dark:text-zinc-400">
                {t("veresiye.kpi_individual_receivable")}
              </span>
              <UserCircle2 size={18} className="text-emerald-600" />
            </div>
            <div className="text-2xl font-black text-slate-900 dark:text-white mt-2">
              {overview ? formatCurrency(individualTotal) : "-"}
            </div>
            <div className="text-[11px] font-medium text-slate-400 mt-1">
              {t("veresiye.kpi_individual_sub").replace("{count}", String(overview?.customer_count ?? "-"))}
            </div>
          </div>

          <div className="bg-white dark:bg-[#111218] border border-slate-100 dark:border-zinc-800 rounded-3xl p-5 shadow-sm">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-slate-500 dark:text-zinc-400">
                {t("veresiye.kpi_missing_receipts")}
              </span>
              <AlertTriangle size={18} className="text-amber-500" />
            </div>
            <div className="text-2xl font-black text-slate-900 dark:text-white mt-2">
              {missingTotal}
            </div>
            <div className="text-[11px] font-medium text-slate-400 mt-1">
              {t("veresiye.kpi_missing_sub")}
            </div>
          </div>
        </div>
      )}

      {/* Cashier Pending Receipts Panel */}
      {isCashier && (
        <>
        <PendingReceiptsPanel
          sales={missingReceipts}
          loading={loadingMissing}
          onUploaded={refreshAll}
        />
        <p className="text-xs text-slate-500">{missingReceipts.length} / {missingTotal}</p>
        {missingReceipts.length < missingTotal && (
          <button type="button" disabled={loadingMissing} onClick={() => fetchMissingReceipts(missingReceipts.length)}
            className="text-sm font-semibold text-blue-600 disabled:opacity-50">
            {t("veresiye.load_more")}
          </button>
        )}
        </>
      )}

      {/* Tabs Container */}
      <div className="bg-white dark:bg-[#111218] border border-slate-100 dark:border-zinc-800 rounded-3xl p-5 shadow-sm space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 dark:border-zinc-800 pb-4">
          <div className="inline-flex p-1 rounded-2xl bg-slate-100 dark:bg-zinc-900 self-start">
            <button
              type="button"
              onClick={() => setActiveTab("corporate")}
              className={`inline-flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-black transition ${
                activeTab === "corporate"
                  ? "bg-white dark:bg-zinc-800 text-slate-900 dark:text-white shadow-sm"
                  : "text-slate-500 dark:text-zinc-400"
              }`}
            >
              <Building2 size={14} />
              <span>{t("veresiye.tab_corporate")}</span>
            </button>
            <button
              type="button"
              onClick={() => setActiveTab("individual")}
              className={`inline-flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-black transition ${
                activeTab === "individual"
                  ? "bg-white dark:bg-zinc-800 text-slate-900 dark:text-white shadow-sm"
                  : "text-slate-500 dark:text-zinc-400"
              }`}
            >
              <UserCircle2 size={14} />
              <span>{t("veresiye.tab_individual")}</span>
            </button>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            <div className="relative flex-1 sm:w-72">
              <Search
                size={15}
                className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400"
              />
              <input
                type="text"
                aria-label={
                  activeTab === "corporate"
                    ? t("veresiye.search_companies")
                    : t("veresiye.search_customers")
                }
                placeholder={
                  activeTab === "corporate"
                    ? t("veresiye.search_companies")
                    : t("veresiye.search_customers")
                }
                value={activeTab === "corporate" ? companySearch : customerSearch}
                onChange={(e) =>
                  activeTab === "corporate"
                    ? setCompanySearch(e.target.value)
                    : setCustomerSearch(e.target.value)
                }
                className="w-full pl-9 pr-3.5 py-2 rounded-2xl bg-slate-50 dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 text-xs font-medium text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            {activeTab === "corporate" && isManager && (
              <button
                type="button"
                onClick={() => setCreateCompanyOpen(true)}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-2xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-black shadow-md shadow-blue-600/20 transition"
              >
                <Plus size={15} />
                <span>{t("veresiye.new_company")}</span>
              </button>
            )}

            {activeTab === "individual" && (
              <button
                type="button"
                onClick={() => setCreateCustomerOpen(true)}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-2xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-black shadow-md shadow-blue-600/20 transition"
              >
                <Plus size={15} />
                <span>{t("veresiye.new_customer")}</span>
              </button>
            )}
          </div>
        </div>

        {/* Corporate Table */}
        {activeTab === "corporate" && (
          loadingCompanies ? (
            <div className="py-10 text-center text-xs font-semibold text-slate-500 dark:text-zinc-400">
              {t("veresiye.loading")}
            </div>
          ) : companies.length === 0 ? (
            <div className="py-10 text-center text-xs font-semibold text-slate-500 dark:text-zinc-400">
              {t("veresiye.empty_companies")}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs text-left">
                <thead className="text-[11px] text-slate-500 dark:text-zinc-400 border-b border-slate-100 dark:border-zinc-800">
                  <tr>
                    <th className="py-2.5 pr-3 font-bold">{t("veresiye.col_company")}</th>
                    <th className="py-2.5 pr-3 font-bold">{t("veresiye.col_contact")}</th>
                    <th className="py-2.5 pr-3 font-bold">{t("veresiye.col_vehicles_drivers")}</th>
                    <th className="py-2.5 pr-3 font-bold">{t("veresiye.col_status")}</th>
                    <th className="py-2.5 pr-3 font-bold text-right">{t("veresiye.col_limit")}</th>
                    {isManager && (
                      <th className="py-2.5 font-bold text-right">{t("veresiye.col_balance")}</th>
                    )}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-zinc-800/80">
                  {companies.map((c) => (
                    <tr
                      key={c.id}
                      onClick={() => setSelectedCompanyId(c.id)}
                      className="cursor-pointer hover:bg-slate-50 dark:hover:bg-zinc-900/60 transition"
                    >
                      <td className="py-3 pr-3">
                        <div className="font-black text-slate-900 dark:text-white">{c.name}</div>
                        {c.tax_number && (
                          <div className="text-[11px] text-slate-500 dark:text-zinc-400">
                            {t("veresiye.col_tax")}: {c.tax_number}
                          </div>
                        )}
                      </td>
                      <td className="py-3 pr-3 text-slate-600 dark:text-zinc-300">
                        <div>{c.contact_name || "-"}</div>
                        {c.phone && <div className="text-[11px] text-slate-400">{c.phone}</div>}
                      </td>
                      <td className="py-3 pr-3 font-semibold text-slate-700 dark:text-zinc-300">
                        {t("veresiye.vehicle_driver_counts")
                          .replace("{vehicles}", String(c.vehicle_count))
                          .replace("{drivers}", String(c.driver_count))}
                      </td>
                      <td className="py-3 pr-3">
                        <span
                          className={`inline-flex px-2.5 py-0.5 rounded-lg text-[11px] font-bold ${
                            c.is_authorized
                              ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300"
                              : "bg-rose-100 text-rose-700 dark:bg-rose-950/60 dark:text-rose-300"
                          }`}
                        >
                          {c.is_authorized
                            ? t("veresiye.authorized_badge")
                            : t("veresiye.unauthorized_badge")}
                        </span>
                      </td>
                      <td className="py-3 pr-3 text-right font-semibold text-slate-600 dark:text-zinc-300">
                        {c.credit_limit ? formatCurrency(c.credit_limit) : "-"}
                        {c.payment_term_days && (
                          <span className="block text-[10px] text-slate-400">
                            {t("veresiye.term_days_badge").replace("{days}", String(c.payment_term_days))}
                          </span>
                        )}
                      </td>
                      {isManager && (
                        <td className="py-3 text-right font-black text-slate-900 dark:text-white">
                          {c.balance ? formatCurrency(c.balance.balance) : "-"}
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )
        )}

        {/* Individual Table */}
        {activeTab === "individual" && (
          loadingCustomers ? (
            <div className="py-10 text-center text-xs font-semibold text-slate-500 dark:text-zinc-400">
              {t("veresiye.loading")}
            </div>
          ) : customers.length === 0 ? (
            <div className="py-10 text-center text-xs font-semibold text-slate-500 dark:text-zinc-400">
              {t("veresiye.empty_customers")}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs text-left">
                <thead className="text-[11px] text-slate-500 dark:text-zinc-400 border-b border-slate-100 dark:border-zinc-800">
                  <tr>
                    <th className="py-2.5 pr-3 font-bold">{t("veresiye.col_customer")}</th>
                    <th className="py-2.5 pr-3 font-bold">{t("veresiye.col_tc")}</th>
                    <th className="py-2.5 pr-3 font-bold">{t("veresiye.phone")}</th>
                    <th className="py-2.5 pr-3 font-bold">{t("veresiye.col_plate")}</th>
                    <th className="py-2.5 pr-3 font-bold">{t("veresiye.col_id_photo")}</th>
                    <th className="py-2.5 pr-3 font-bold">{t("veresiye.active")}</th>
                    {isManager && (
                      <th className="py-2.5 font-bold text-right">{t("veresiye.col_balance")}</th>
                    )}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-zinc-800/80">
                  {customers.map((cu) => (
                    <tr
                      key={cu.id}
                      onClick={() => setSelectedCustomerId(cu.id)}
                      className="cursor-pointer hover:bg-slate-50 dark:hover:bg-zinc-900/60 transition"
                    >
                      <td className="py-3 pr-3 font-black text-slate-900 dark:text-white">
                        {cu.full_name}
                      </td>
                      <td className="py-3 pr-3 font-mono text-slate-600 dark:text-zinc-300">
                        {cu.tc_masked}
                      </td>
                      <td className="py-3 pr-3 text-slate-600 dark:text-zinc-300">
                        {cu.phone}
                      </td>
                      <td className="py-3 pr-3 font-mono font-bold text-slate-700 dark:text-zinc-300">
                        {cu.plate ? formatPlate(cu.plate) : "-"}
                      </td>
                      <td className="py-3 pr-3">
                        <span
                          className={`inline-flex px-2 py-0.5 rounded-md text-[10px] font-bold ${
                            cu.has_id_photo
                              ? "bg-blue-100 text-blue-700 dark:bg-blue-950/60 dark:text-blue-300"
                              : "bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300"
                          }`}
                        >
                          {cu.has_id_photo
                            ? t("veresiye.id_photo_present")
                            : t("veresiye.id_photo_missing")}
                        </span>
                      </td>
                      <td className="py-3 pr-3">
                        <span
                          className={`inline-flex px-2 py-0.5 rounded-md text-[10px] font-bold ${
                            cu.is_active
                              ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300"
                              : "bg-slate-200 text-slate-600 dark:bg-zinc-800 dark:text-zinc-400"
                          }`}
                        >
                          {cu.is_active ? t("veresiye.active") : t("veresiye.inactive")}
                        </span>
                      </td>
                      {isManager && (
                        <td className="py-3 text-right font-black text-slate-900 dark:text-white">
                          {cu.balance ? formatCurrency(cu.balance.balance) : "-"}
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )
        )}
      </div>

      <CreateCompanyModal
        open={createCompanyOpen}
        onClose={() => setCreateCompanyOpen(false)}
        onCreated={(created) => {
          refreshAll();
          setSelectedCompanyId(created.id);
        }}
      />

      <CreateCustomerModal
        open={createCustomerOpen}
        isManager={isManager}
        onClose={() => setCreateCustomerOpen(false)}
        onCreated={(created) => {
          refreshAll();
          setSelectedCustomerId(created.id);
        }}
      />

      <CompanyDetailModal
        key={selectedCompanyId}
        companyId={selectedCompanyId}
        isManager={isManager}
        onClose={() => setSelectedCompanyId(null)}
        onChanged={refreshAll}
      />

      <CustomerDetailModal
        key={selectedCustomerId}
        customerId={selectedCustomerId}
        isManager={isManager}
        onClose={() => setSelectedCustomerId(null)}
        onChanged={refreshAll}
      />
    </div>
  );
};
