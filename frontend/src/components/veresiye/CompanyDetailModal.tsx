import React, { useCallback, useEffect, useState } from "react";
import {
  Building2,
  Car,
  CheckCircle2,
  Loader2,
  Plus,
  ShieldAlert,
  ShieldCheck,
  Users,
  X,
} from "lucide-react";
import { apiClient } from "@/lib/api";
import { useLanguage } from "@/context/LanguageContext";
import { formatDateTime } from "@/lib/utils";
import { apiErrorMessage, formatPlate, isValidTc, normalizePlate } from "@/lib/veresiye";
import { AccountStatementPanel } from "@/components/veresiye/AccountStatementPanel";
import type { CreditCompanyDetail, CreditDriver, CreditVehicle } from "@/types/veresiye";

interface CompanyDetailModalProps {
  companyId: string | null;
  isManager: boolean;
  onClose: () => void;
  onChanged: () => void;
}

export const CompanyDetailModal: React.FC<CompanyDetailModalProps> = ({
  companyId,
  isManager,
  onClose,
  onChanged,
}) => {
  const { t } = useLanguage();
  const [company, setCompany] = useState<CreditCompanyDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<"info" | "statement">("info");

  const [editing, setEditing] = useState(false);
  const [editName, setEditName] = useState("");
  const [editTaxNo, setEditTaxNo] = useState("");
  const [editTaxOffice, setEditTaxOffice] = useState("");
  const [editContact, setEditContact] = useState("");
  const [editPhone, setEditPhone] = useState("");
  const [editEmail, setEditEmail] = useState("");
  const [editAddress, setEditAddress] = useState("");
  const [editLimit, setEditLimit] = useState("");
  const [editTermDays, setEditTermDays] = useState("");
  const [editNotes, setEditNotes] = useState("");
  const [savingInfo, setSavingInfo] = useState(false);

  const [showTerminateBox, setShowTerminateBox] = useState(false);
  const [terminateReason, setTerminateReason] = useState("");
  const [authSaving, setAuthSaving] = useState(false);

  const [newPlate, setNewPlate] = useState("");
  const [newVehicleDesc, setNewVehicleDesc] = useState("");
  const [addingVehicle, setAddingVehicle] = useState(false);

  const [newDriverName, setNewDriverName] = useState("");
  const [newDriverTc, setNewDriverTc] = useState("");
  const [newDriverPhone, setNewDriverPhone] = useState("");
  const [addingDriver, setAddingDriver] = useState(false);

  const hydrateEdit = (c: CreditCompanyDetail) => {
    setEditName(c.name);
    setEditTaxNo(c.tax_number ?? "");
    setEditTaxOffice(c.tax_office ?? "");
    setEditContact(c.contact_name ?? "");
    setEditPhone(c.phone ?? "");
    setEditEmail(c.email ?? "");
    setEditAddress(c.address ?? "");
    setEditLimit(c.credit_limit !== null ? String(c.credit_limit) : "");
    setEditTermDays(c.payment_term_days !== null ? String(c.payment_term_days) : "");
    setEditNotes(c.notes ?? "");
  };

  const loadDetail = useCallback(async () => {
    if (!companyId) return;
    setLoading(true);
    setError(null);
    try {
      const res = await apiClient.get<CreditCompanyDetail>(`/veresiye/companies/${companyId}`);
      setCompany(res.data);
      hydrateEdit(res.data);
    } catch (err) {
      setError(apiErrorMessage(err, t("veresiye.error_load")));
    } finally {
      setLoading(false);
    }
  }, [companyId, t]);

  useEffect(() => {
    if (!companyId) {
      setCompany(null);
      setNewDriverTc("");
      return;
    }
    setTab("info");
    setEditing(false);
    setShowTerminateBox(false);
    setTerminateReason("");
    setNewDriverName("");
    setNewDriverTc("");
    setNewDriverPhone("");
    loadDetail();
  }, [companyId, loadDetail]);

  useEffect(() => {
    if (!companyId) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [companyId, onClose]);

  if (!companyId) return null;

  const handleSaveInfo = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!company) return;
    setSavingInfo(true);
    setError(null);
    try {
      const res = await apiClient.patch<CreditCompanyDetail>(`/veresiye/companies/${company.id}`, {
        name: editName.trim(),
        tax_number: editTaxNo.trim() || null,
        tax_office: editTaxOffice.trim() || null,
        contact_name: editContact.trim() || null,
        phone: editPhone.trim() || null,
        email: editEmail.trim() || null,
        address: editAddress.trim() || null,
        credit_limit: editLimit.trim() ? Number(editLimit.replace(",", ".")).toFixed(2) : null,
        payment_term_days: editTermDays.trim() ? Number(editTermDays) : null,
        notes: editNotes.trim() || null,
      });
      setCompany(res.data);
      setEditing(false);
      onChanged();
    } catch (err) {
      setError(apiErrorMessage(err, t("veresiye.error_save")));
    } finally {
      setSavingInfo(false);
    }
  };

  const handleAuthorizationChange = async (authorized: boolean) => {
    if (!company) return;
    setAuthSaving(true);
    setError(null);
    try {
      const res = await apiClient.post<CreditCompanyDetail>(
        `/veresiye/companies/${company.id}/authorization`,
        {
          authorized,
          reason: authorized ? undefined : terminateReason.trim() || undefined,
        },
      );
      setCompany(res.data);
      setShowTerminateBox(false);
      setTerminateReason("");
      onChanged();
    } catch (err) {
      setError(apiErrorMessage(err, t("veresiye.error_save")));
    } finally {
      setAuthSaving(false);
    }
  };

  const handleAddVehicle = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!company || !newPlate.trim()) return;
    setAddingVehicle(true);
    setError(null);
    try {
      await apiClient.post<CreditVehicle>(`/veresiye/companies/${company.id}/vehicles`, {
        plate: normalizePlate(newPlate),
        description: newVehicleDesc.trim() || undefined,
      });
      setNewPlate("");
      setNewVehicleDesc("");
      await loadDetail();
      onChanged();
    } catch (err) {
      setError(apiErrorMessage(err, t("veresiye.error_save")));
    } finally {
      setAddingVehicle(false);
    }
  };

  const handleToggleVehicle = async (v: CreditVehicle) => {
    setError(null);
    try {
      await apiClient.patch<CreditVehicle>(`/veresiye/vehicles/${v.id}`, {
        is_active: !v.is_active,
      });
      await loadDetail();
      onChanged();
    } catch (err) {
      setError(apiErrorMessage(err, t("veresiye.error_save")));
    }
  };

  const handleAddDriver = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!company || !newDriverName.trim() || !isValidTc(newDriverTc)) {
      setError(t("veresiye.driver_fields_required"));
      return;
    }
    setAddingDriver(true);
    setError(null);
    try {
      await apiClient.post<CreditDriver>(`/veresiye/companies/${company.id}/drivers`, {
        full_name: newDriverName.trim(),
        tc_no: newDriverTc.trim(),
        phone: newDriverPhone.trim() || undefined,
      });
      setNewDriverName("");
      setNewDriverTc("");
      setNewDriverPhone("");
      await loadDetail();
      onChanged();
    } catch (err) {
      setError(apiErrorMessage(err, t("veresiye.error_save")));
    } finally {
      setAddingDriver(false);
    }
  };

  const handleToggleDriver = async (d: CreditDriver) => {
    setError(null);
    try {
      await apiClient.patch<CreditDriver>(`/veresiye/drivers/${d.id}`, {
        is_active: !d.is_active,
      });
      await loadDetail();
      onChanged();
    } catch (err) {
      setError(apiErrorMessage(err, t("veresiye.error_save")));
    }
  };

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/65 backdrop-blur-sm p-3 sm:p-5"
      role="dialog"
      aria-modal="true"
      aria-label={company?.name || t("veresiye.tab_corporate")}
    >
      <div className="flex max-h-full w-full max-w-5xl flex-col overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-2xl dark:border-zinc-800 dark:bg-[#111218]">
        {/* Header */}
        <div className="flex shrink-0 items-center justify-between gap-3 border-b border-slate-100 px-4 py-3 dark:border-zinc-800 sm:px-6 sm:py-4">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 rounded-2xl bg-blue-600/10 text-blue-600 dark:text-blue-400 flex items-center justify-center shrink-0">
              <Building2 size={20} />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h3 className="text-base sm:text-lg font-black text-slate-900 dark:text-white truncate">
                  {company?.name || t("veresiye.loading")}
                </h3>
                {company && (
                  <span
                    className={`px-2.5 py-0.5 rounded-lg text-[11px] font-bold ${
                      company.is_authorized
                        ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300"
                        : "bg-rose-100 text-rose-700 dark:bg-rose-950/60 dark:text-rose-300"
                    }`}
                  >
                    {company.is_authorized
                      ? t("veresiye.authorized_badge")
                      : t("veresiye.unauthorized_badge")}
                  </span>
                )}
              </div>
              {company?.tax_number && (
                <p className="text-xs text-slate-500 dark:text-zinc-400">
                  VKN: {company.tax_number} {company.tax_office ? `• ${company.tax_office}` : ""}
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

        {/* Sub-tabs */}
        {isManager && company && (
          <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-slate-100 px-3 pt-3 dark:border-zinc-800 sm:px-6">
            <button
              type="button"
              onClick={() => setTab("info")}
              className={`px-4 py-2.5 text-xs font-black border-b-2 transition ${
                tab === "info"
                  ? "border-blue-600 text-blue-600 dark:text-blue-400"
                  : "border-transparent text-slate-500 dark:text-zinc-400"
              }`}
            >
              {t("veresiye.tab_info")}
            </button>
            <button
              type="button"
              onClick={() => setTab("statement")}
              className={`px-4 py-2.5 text-xs font-black border-b-2 transition ${
                tab === "statement"
                  ? "border-blue-600 text-blue-600 dark:text-blue-400"
                  : "border-transparent text-slate-500 dark:text-zinc-400"
              }`}
            >
              {t("veresiye.tab_statement")}
            </button>
          </div>
        )}

        {/* Body */}
        <div className="min-h-0 flex-1 space-y-5 overflow-y-auto overscroll-contain p-3 sm:p-6">
          {error && (
            <div className="px-4 py-3 rounded-2xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900/50 text-xs font-semibold text-rose-700 dark:text-rose-300">
              {error}
            </div>
          )}

          {loading && !company ? (
            <div className="py-12 flex items-center justify-center gap-2 text-xs font-semibold text-slate-500">
              <Loader2 size={18} className="animate-spin text-blue-600" />
              <span>{t("veresiye.loading")}</span>
            </div>
          ) : company && tab === "statement" && isManager ? (
            <AccountStatementPanel
              accountType="corporate"
              accountId={company.id}
              accountName={company.name}
              onBalanceChanged={() => {
                loadDetail();
                onChanged();
              }}
            />
          ) : (
            company && (
              <div className="space-y-6">
                {/* Authorization Status Card */}
                <div
                  className={`p-4 rounded-2xl border flex flex-col sm:flex-row sm:items-center justify-between gap-3 ${
                    company.is_authorized
                      ? "bg-emerald-50/60 dark:bg-emerald-950/20 border-emerald-200/70 dark:border-emerald-900/50"
                      : "bg-rose-50/70 dark:bg-rose-950/30 border-rose-200/80 dark:border-rose-900/60"
                  }`}
                >
                  <div className="space-y-1 text-xs">
                    <div className="flex items-center gap-2 font-black text-slate-900 dark:text-white">
                      {company.is_authorized ? (
                        <ShieldCheck size={17} className="text-emerald-600" />
                      ) : (
                        <ShieldAlert size={17} className="text-rose-600" />
                      )}
                      <span>
                        {company.is_authorized
                          ? t("veresiye.authorized_badge")
                          : t("veresiye.unauthorized_badge")}
                      </span>
                    </div>
                    {!company.is_authorized && (
                      <div className="text-rose-800 dark:text-rose-300 font-medium">
                        {company.authorization_ended_at &&
                          t("veresiye.auth_ended_at").replace(
                            "{date}",
                            formatDateTime(company.authorization_ended_at),
                          )}
                        {company.authorization_end_reason
                          ? ` — ${company.authorization_end_reason}`
                          : ""}
                      </div>
                    )}
                  </div>

                  {isManager && (
                    <div>
                      {company.is_authorized ? (
                        <button
                          type="button"
                          onClick={() => setShowTerminateBox((v) => !v)}
                          className="px-3.5 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold transition"
                        >
                          {t("veresiye.auth_terminate")}
                        </button>
                      ) : (
                        <button
                          type="button"
                          disabled={authSaving}
                          onClick={() => handleAuthorizationChange(true)}
                          className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white text-xs font-bold transition"
                        >
                          <CheckCircle2 size={14} />
                          {t("veresiye.auth_restore")}
                        </button>
                      )}
                    </div>
                  )}
                </div>

                {isManager && showTerminateBox && company.is_authorized && (
                  <div className="p-4 rounded-2xl bg-rose-50 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-900/50 space-y-3">
                    <label
                      htmlFor="terminate-reason"
                      className="block text-xs font-bold text-rose-900 dark:text-rose-200"
                    >
                      {t("veresiye.auth_reason_label")}
                    </label>
                    <input
                      id="terminate-reason"
                      type="text"
                      value={terminateReason}
                      onChange={(e) => setTerminateReason(e.target.value)}
                      placeholder={t("veresiye.auth_reason_placeholder")}
                      className="w-full px-3.5 py-2 rounded-xl bg-white dark:bg-zinc-950 border border-rose-200 dark:border-rose-900 text-xs text-slate-900 dark:text-white"
                    />
                    <div className="flex justify-end gap-2">
                      <button
                        type="button"
                        onClick={() => setShowTerminateBox(false)}
                        className="px-3 py-1.5 rounded-lg text-xs font-bold text-slate-600 dark:text-zinc-300"
                      >
                        {t("veresiye.cancel")}
                      </button>
                      <button
                        type="button"
                        disabled={authSaving}
                        onClick={() => handleAuthorizationChange(false)}
                        className="px-4 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-700 disabled:opacity-50 text-white text-xs font-bold"
                      >
                        {t("veresiye.auth_confirm_terminate")}
                      </button>
                    </div>
                  </div>
                )}

                {/* Info Card */}
                <div className="rounded-2xl border border-slate-200/80 dark:border-zinc-800 p-4 bg-slate-50/50 dark:bg-zinc-900/40">
                  <div className="flex items-center justify-between mb-3">
                    <h4 className="text-xs font-black text-slate-800 dark:text-zinc-200 uppercase tracking-wider">
                      {t("veresiye.col_company")}
                    </h4>
                    {isManager && !editing && (
                      <button
                        type="button"
                        onClick={() => setEditing(true)}
                        className="px-3 py-1 rounded-lg bg-slate-200/70 dark:bg-zinc-800 text-xs font-bold text-slate-700 dark:text-zinc-200"
                      >
                        {t("veresiye.edit")}
                      </button>
                    )}
                  </div>

                  {editing ? (
                    <form onSubmit={handleSaveInfo} className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                      <input
                        type="text"
                        required
                        value={editName}
                        onChange={(e) => setEditName(e.target.value)}
                        placeholder={t("veresiye.company_name")}
                        className="sm:col-span-2 px-3 py-2 rounded-xl bg-white dark:bg-zinc-950 border border-slate-200 dark:border-zinc-800"
                      />
                      <input
                        type="text"
                        value={editTaxNo}
                        onChange={(e) => setEditTaxNo(e.target.value)}
                        placeholder={t("veresiye.tax_number")}
                        className="px-3 py-2 rounded-xl bg-white dark:bg-zinc-950 border border-slate-200 dark:border-zinc-800"
                      />
                      <input
                        type="text"
                        value={editTaxOffice}
                        onChange={(e) => setEditTaxOffice(e.target.value)}
                        placeholder={t("veresiye.tax_office")}
                        className="px-3 py-2 rounded-xl bg-white dark:bg-zinc-950 border border-slate-200 dark:border-zinc-800"
                      />
                      <input
                        type="text"
                        value={editContact}
                        onChange={(e) => setEditContact(e.target.value)}
                        placeholder={t("veresiye.contact_name")}
                        className="px-3 py-2 rounded-xl bg-white dark:bg-zinc-950 border border-slate-200 dark:border-zinc-800"
                      />
                      <input
                        type="text"
                        value={editPhone}
                        onChange={(e) => setEditPhone(e.target.value)}
                        placeholder={t("veresiye.phone")}
                        className="px-3 py-2 rounded-xl bg-white dark:bg-zinc-950 border border-slate-200 dark:border-zinc-800"
                      />
                      <input
                        type="email"
                        value={editEmail}
                        onChange={(e) => setEditEmail(e.target.value)}
                        placeholder={t("veresiye.email")}
                        className="px-3 py-2 rounded-xl bg-white dark:bg-zinc-950 border border-slate-200 dark:border-zinc-800"
                      />
                      <input
                        type="text"
                        value={editAddress}
                        onChange={(e) => setEditAddress(e.target.value)}
                        placeholder={t("veresiye.address")}
                        className="px-3 py-2 rounded-xl bg-white dark:bg-zinc-950 border border-slate-200 dark:border-zinc-800"
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
                      <input
                        type="number"
                        min="1"
                        max="365"
                        value={editTermDays}
                        onChange={(e) => setEditTermDays(e.target.value)}
                        placeholder={t("veresiye.payment_term_days")}
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
                          type="button"
                          onClick={() => {
                            setEditing(false);
                            hydrateEdit(company);
                          }}
                          className="px-3 py-1.5 rounded-lg font-bold text-slate-600 dark:text-zinc-300"
                        >
                          {t("veresiye.cancel")}
                        </button>
                        <button
                          type="submit"
                          disabled={savingInfo}
                          className="px-4 py-1.5 rounded-lg bg-blue-600 text-white font-bold"
                        >
                          {savingInfo ? t("veresiye.saving") : t("veresiye.save")}
                        </button>
                      </div>
                    </form>
                  ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
                      <div>
                        <span className="text-slate-400 block">{t("veresiye.contact_name")}</span>
                        <span className="font-bold text-slate-800 dark:text-zinc-200">
                          {company.contact_name || "-"} {company.phone ? `• ${company.phone}` : ""}
                        </span>
                      </div>
                      <div>
                        <span className="text-slate-400 block">{t("veresiye.email")}</span>
                        <span className="font-bold text-slate-800 dark:text-zinc-200">
                          {company.email || "-"}
                        </span>
                      </div>
                      <div>
                        <span className="text-slate-400 block">{t("veresiye.col_limit")}</span>
                        <span className="font-bold text-slate-800 dark:text-zinc-200">
                          {company.credit_limit ? `${company.credit_limit} ₺` : "-"}
                          {company.payment_term_days ? ` • ${company.payment_term_days} gün` : ""}
                        </span>
                      </div>
                      {(company.address || company.notes) && (
                        <div className="sm:col-span-3 text-slate-600 dark:text-zinc-400">
                          {company.address ? `${company.address} ` : ""}
                          {company.notes ? `(${company.notes})` : ""}
                        </div>
                      )}
                    </div>
                  )}
                </div>

                {/* Vehicles & Drivers */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                  {/* Vehicles */}
                  <div className="rounded-2xl border border-slate-200/80 dark:border-zinc-800 p-4 space-y-3">
                    <div className="flex items-center gap-2">
                      <Car size={16} className="text-blue-600" />
                      <h4 className="text-xs font-black text-slate-800 dark:text-zinc-200 uppercase tracking-wider">
                        {t("veresiye.vehicles_section")} ({company.vehicles.length})
                      </h4>
                    </div>

                    {isManager && (
                      <form onSubmit={handleAddVehicle} className="flex flex-wrap gap-2">
                        <input
                          type="text"
                          required
                          placeholder={t("veresiye.plate")}
                          value={newPlate}
                          onChange={(e) => setNewPlate(e.target.value.toUpperCase())}
                          className="w-28 px-3 py-1.5 rounded-xl bg-slate-50 dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 text-xs font-mono font-bold"
                        />
                        <input
                          type="text"
                          placeholder={t("veresiye.vehicle_description")}
                          value={newVehicleDesc}
                          onChange={(e) => setNewVehicleDesc(e.target.value)}
                          className="flex-1 min-w-[120px] px-3 py-1.5 rounded-xl bg-slate-50 dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 text-xs"
                        />
                        <button
                          type="submit"
                          disabled={addingVehicle || !newPlate.trim()}
                          className="inline-flex items-center gap-1 px-3 py-1.5 rounded-xl bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-xs font-bold"
                        >
                          <Plus size={13} />
                          {t("veresiye.add")}
                        </button>
                      </form>
                    )}

                    <div className="space-y-2 max-h-60 overflow-y-auto">
                      {company.vehicles.map((v) => (
                        <div
                          key={v.id}
                          className="flex items-center justify-between gap-2 px-3 py-2 rounded-xl bg-slate-50 dark:bg-zinc-900/70 text-xs"
                        >
                          <div className="min-w-0">
                            <span className="font-mono font-black text-slate-900 dark:text-white">
                              {formatPlate(v.plate)}
                            </span>
                            {v.description && (
                              <span className="ml-2 text-slate-500 dark:text-zinc-400">
                                {v.description}
                              </span>
                            )}
                          </div>
                          <div className="flex items-center gap-2 shrink-0">
                            <span
                              className={`px-2 py-0.5 rounded-md text-[10px] font-bold ${
                                v.is_active
                                  ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300"
                                  : "bg-slate-200 text-slate-600 dark:bg-zinc-800 dark:text-zinc-400"
                              }`}
                            >
                              {v.is_active ? t("veresiye.active") : t("veresiye.inactive")}
                            </span>
                            {isManager && (
                              <button
                                type="button"
                                onClick={() => handleToggleVehicle(v)}
                                className="text-[11px] font-bold text-blue-600 dark:text-blue-400 hover:underline"
                              >
                                {v.is_active ? t("veresiye.deactivate") : t("veresiye.activate")}
                              </button>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Drivers */}
                  <div className="rounded-2xl border border-slate-200/80 dark:border-zinc-800 p-4 space-y-3">
                    <div className="flex items-center gap-2">
                      <Users size={16} className="text-blue-600" />
                      <h4 className="text-xs font-black text-slate-800 dark:text-zinc-200 uppercase tracking-wider">
                        {t("veresiye.drivers_section")} ({company.drivers.length})
                      </h4>
                    </div>

                    {isManager && (
                      <form onSubmit={handleAddDriver} className="grid grid-cols-1 sm:grid-cols-12 gap-2">
                        <input
                          type="text"
                          required
                          placeholder={t("veresiye.full_name")}
                          value={newDriverName}
                          onChange={(e) => setNewDriverName(e.target.value)}
                          className="sm:col-span-4 px-3 py-1.5 rounded-xl bg-slate-50 dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 text-xs"
                        />
                        <input
                          type="text"
                          inputMode="numeric"
                          maxLength={11}
                          required
                          placeholder={t("veresiye.tc_no")}
                          value={newDriverTc}
                          onChange={(e) => setNewDriverTc(e.target.value.replace(/\D/g, "").slice(0, 11))}
                          className="sm:col-span-4 px-3 py-1.5 rounded-xl bg-slate-50 dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 text-xs font-mono"
                        />
                        <input
                          type="text"
                          placeholder={t("veresiye.phone")}
                          value={newDriverPhone}
                          onChange={(e) => setNewDriverPhone(e.target.value)}
                          className="sm:col-span-2 px-2.5 py-1.5 rounded-xl bg-slate-50 dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 text-xs"
                        />
                        <button
                          type="submit"
                          disabled={addingDriver || !newDriverName.trim() || !isValidTc(newDriverTc)}
                          className="sm:col-span-2 inline-flex items-center justify-center gap-1 px-2.5 py-1.5 rounded-xl bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-xs font-bold"
                        >
                          <Plus size={13} />
                          {t("veresiye.add")}
                        </button>
                      </form>
                    )}

                    <div className="space-y-2 max-h-60 overflow-y-auto">
                      {company.drivers.map((d) => (
                        <div
                          key={d.id}
                          className="flex items-center justify-between gap-2 px-3 py-2 rounded-xl bg-slate-50 dark:bg-zinc-900/70 text-xs"
                        >
                          <div className="min-w-0">
                            <div className="font-bold text-slate-900 dark:text-white truncate">
                              {d.full_name}
                            </div>
                            <div className="text-[11px] font-mono text-slate-500 dark:text-zinc-400">
                              {d.tc_masked} {d.phone ? `• ${d.phone}` : ""}
                            </div>
                          </div>
                          <div className="flex items-center gap-2 shrink-0">
                            <span
                              className={`px-2 py-0.5 rounded-md text-[10px] font-bold ${
                                d.is_active
                                  ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300"
                                  : "bg-slate-200 text-slate-600 dark:bg-zinc-800 dark:text-zinc-400"
                              }`}
                            >
                              {d.is_active ? t("veresiye.active") : t("veresiye.inactive")}
                            </span>
                            {isManager && (
                              <button
                                type="button"
                                onClick={() => handleToggleDriver(d)}
                                className="text-[11px] font-bold text-blue-600 dark:text-blue-400 hover:underline"
                              >
                                {d.is_active ? t("veresiye.deactivate") : t("veresiye.activate")}
                              </button>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            )
          )}
        </div>
      </div>
    </div>
  );
};
