import React, { useEffect, useState } from "react";
import {
  AlertTriangle,
  Building2,
  CheckCircle2,
  Loader2,
  Search,
  ShieldAlert,
  UserCheck,
} from "lucide-react";
import { apiClient } from "@/lib/api";
import { useLanguage } from "@/context/LanguageContext";
import { apiErrorMessage, formatPlate, isValidTc, normalizePlate } from "@/lib/veresiye";
import { IndividualCreditPicker } from "@/components/sales/IndividualCreditPicker";
import type {
  CreditAccountType,
  CreditSaleInput,
  VerifyReason,
  VerifyResponse,
} from "@/types/veresiye";

interface CreditAccountSectionProps {
  stationId?: string;
  amount: string;
  accountType: CreditAccountType;
  individualCreditEnabled: boolean;
  onAccountTypeChange: (type: CreditAccountType) => void;
  onCreditInputChange: (input: CreditSaleInput | null) => void;
}

interface VerifiedSnapshot {
  plateKey: string;
  driverId: string;
  driverTc: string;
  amountKey: string;
  input: CreditSaleInput;
}

function reasonMessage(reason: VerifyReason, t: (k: string) => string): string {
  return t(`creditsale.reason_${reason}`);
}

export const CreditAccountSection: React.FC<CreditAccountSectionProps> = ({
  stationId,
  amount,
  accountType: selectedAccountType,
  individualCreditEnabled,
  onAccountTypeChange,
  onCreditInputChange,
}) => {
  const { t } = useLanguage();

  const accountType = individualCreditEnabled ? selectedAccountType : "corporate";

  // Corporate state
  const [plate, setPlate] = useState("");
  const [lookingUpPlate, setLookingUpPlate] = useState(false);
  const [lookupResult, setLookupResult] = useState<VerifyResponse | null>(null);
  const [selectedDriverId, setSelectedDriverId] = useState("");
  const [driverTc, setDriverTc] = useState("");
  const [verifyingIdentity, setVerifyingIdentity] = useState(false);
  const [verifyError, setVerifyError] = useState<string | null>(null);
  const [verifiedSnapshot, setVerifiedSnapshot] = useState<VerifiedSnapshot | null>(null);

  // Re-evaluate emitted CreditSaleInput cleanly whenever inputs change
  const amountKey = amount.trim();
  const normalizedPlateKey = normalizePlate(plate);

  const isCorporateSnapshotValid =
    accountType === "corporate" &&
    verifiedSnapshot !== null &&
    verifiedSnapshot.plateKey === normalizedPlateKey &&
    verifiedSnapshot.driverId === selectedDriverId &&
    verifiedSnapshot.driverTc === driverTc.trim() &&
    verifiedSnapshot.amountKey === amountKey;

  useEffect(() => {
    if (accountType === "corporate") {
      onCreditInputChange(isCorporateSnapshotValid && verifiedSnapshot ? verifiedSnapshot.input : null);
      return;
    }
  }, [accountType, isCorporateSnapshotValid, verifiedSnapshot, onCreditInputChange]);

  const parsedPositiveAmount = () => {
    const n = Number(amount.replace(",", "."));
    return Number.isFinite(n) && n > 0 ? n.toFixed(2) : undefined;
  };

  const handlePlateLookup = async () => {
    if (!normalizePlate(plate)) return;
    setLookingUpPlate(true);
    setVerifyError(null);
    setLookupResult(null);
    setVerifiedSnapshot(null);
    setSelectedDriverId("");
    setDriverTc("");
    try {
      const res = await apiClient.post<VerifyResponse>("/veresiye/verify", {
        plate: normalizePlate(plate),
        ...(stationId ? { station_id: stationId } : {}),
        ...(parsedPositiveAmount() ? { amount: parsedPositiveAmount() } : {}),
      });
      setLookupResult(res.data);
      if (res.data.drivers.length === 1) {
        setSelectedDriverId(res.data.drivers[0].id);
      }
    } catch (err) {
      setVerifyError(apiErrorMessage(err, t("veresiye.error_load")));
    } finally {
      setLookingUpPlate(false);
    }
  };

  const handleVerifyIdentity = async () => {
    if (!lookupResult?.company || !selectedDriverId || !isValidTc(driverTc)) return;
    setVerifyingIdentity(true);
    setVerifyError(null);
    setVerifiedSnapshot(null);
    const snapPlate = normalizePlate(plate);
    const snapTc = driverTc.trim();
    const snapAmt = amountKey;
    try {
      const res = await apiClient.post<VerifyResponse>("/veresiye/verify", {
        plate: snapPlate,
        driver_id: selectedDriverId,
        driver_tc: snapTc,
        ...(stationId ? { station_id: stationId } : {}),
        ...(parsedPositiveAmount() ? { amount: parsedPositiveAmount() } : {}),
      });
      setLookupResult(res.data);
      if (res.data.authorized && res.data.identity_verified && res.data.company) {
        setVerifiedSnapshot({
          plateKey: snapPlate,
          driverId: selectedDriverId,
          driverTc: snapTc,
          amountKey: snapAmt,
          input: {
            account_type: "corporate",
            credit_company_id: res.data.company.id,
            vehicle_id: res.data.vehicle?.id ?? undefined,
            plate: snapPlate,
            driver_id: selectedDriverId,
            driver_tc: snapTc,
          },
        });
      }
    } catch (err) {
      setVerifyError(apiErrorMessage(err, t("veresiye.error_load")));
    } finally {
      setVerifyingIdentity(false);
    }
  };

  const tcHintValid = driverTc.trim() ? isValidTc(driverTc) : null;

  return (
    <div className="p-4 rounded-2xl bg-amber-50/70 dark:bg-amber-950/20 border border-amber-200/80 dark:border-amber-900/50 space-y-3.5">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
        <span className="text-xs font-black text-amber-900 dark:text-amber-200 uppercase tracking-wider">
          {t("creditsale.section_title")}
        </span>
        {individualCreditEnabled && (
          <div className="grid grid-cols-2 gap-1 p-1 rounded-xl bg-white dark:bg-zinc-900 border border-amber-200/70 dark:border-zinc-800">
            <button
              type="button"
              onClick={() => onAccountTypeChange("corporate")}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition ${
                accountType === "corporate"
                  ? "bg-amber-600 text-white shadow-sm"
                  : "text-slate-600 dark:text-zinc-300"
              }`}
            >
              {t("creditsale.corporate")}
            </button>
            <button
              type="button"
              onClick={() => onAccountTypeChange("individual")}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition ${
                accountType === "individual"
                  ? "bg-amber-600 text-white shadow-sm"
                  : "text-slate-600 dark:text-zinc-300"
              }`}
            >
              {t("creditsale.individual")}
            </button>
          </div>
        )}
      </div>

      {/* Corporate Flow */}
      {accountType === "corporate" && (
        <div className="space-y-3">
          <div className="flex gap-2">
            <input
              type="text"
              aria-label={t("veresiye.plate")}
              placeholder={t("creditsale.plate_placeholder")}
              value={plate}
              onChange={(e) => setPlate(e.target.value.toUpperCase())}
              className="flex-1 px-3.5 py-2.5 rounded-xl bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-700 text-xs font-mono font-bold uppercase text-slate-900 dark:text-white"
            />
            <button
              type="button"
              disabled={lookingUpPlate || !normalizePlate(plate)}
              onClick={handlePlateLookup}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-slate-900 dark:bg-blue-600 hover:opacity-90 disabled:opacity-50 text-white text-xs font-bold shrink-0 transition"
            >
              {lookingUpPlate ? <Loader2 size={14} className="animate-spin" /> : <Search size={14} />}
              <span>{t("creditsale.query_plate")}</span>
            </button>
          </div>

          {verifyError && (
            <div className="p-3 rounded-xl bg-rose-50 dark:bg-rose-950/50 border border-rose-200 dark:border-rose-900 text-xs font-semibold text-rose-700 dark:text-rose-300">
              {verifyError}
            </div>
          )}

          {lookupResult && !lookupResult.company && (
            <div className="p-3 rounded-xl bg-rose-50 dark:bg-rose-950/50 border border-rose-200 dark:border-rose-900 flex items-start gap-2 text-xs font-bold text-rose-700 dark:text-rose-300">
              <ShieldAlert size={15} className="shrink-0 mt-0.5" />
              <span>{t("creditsale.plate_not_registered")}</span>
            </div>
          )}

          {lookupResult?.company && (
            <div className="space-y-3">
              <div className="p-3 rounded-xl bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 flex items-center justify-between gap-2 text-xs">
                <div className="flex items-center gap-2 font-black text-slate-900 dark:text-white">
                  <Building2 size={15} className="text-blue-600" />
                  <span>{lookupResult.company.name}</span>
                </div>
                {lookupResult.vehicle && (
                  <span className="font-mono font-bold text-slate-600 dark:text-zinc-300">
                    {formatPlate(lookupResult.vehicle.plate)}
                  </span>
                )}
              </div>

              {!lookupResult.company.is_authorized ? (
                <div className="p-3 rounded-xl bg-rose-600 text-white flex items-start gap-2 text-xs font-bold">
                  <ShieldAlert size={16} className="shrink-0 mt-0.5" />
                  <span>{t("creditsale.company_unauthorized_banner")}</span>
                </div>
              ) : (
                <>
                  {/* Drivers list */}
                  <div className="space-y-1.5">
                    <div className="text-[11px] font-bold text-slate-600 dark:text-zinc-300">
                      {t("creditsale.select_driver")}
                    </div>
                    {lookupResult.drivers.length === 0 ? (
                      <div className="p-2.5 rounded-xl bg-white dark:bg-zinc-900 text-xs text-rose-600 font-semibold">
                        {t("creditsale.no_drivers")}
                      </div>
                    ) : (
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        {lookupResult.drivers.map((d) => {
                          const selected = selectedDriverId === d.id;
                          return (
                            <button
                              key={d.id}
                              type="button"
                              onClick={() => setSelectedDriverId(d.id)}
                              className={`p-2.5 rounded-xl border text-left transition ${
                                selected
                                  ? "border-blue-600 bg-blue-50 dark:bg-blue-950/40"
                                  : "border-slate-200 dark:border-zinc-700 bg-white dark:bg-zinc-900"
                              }`}
                            >
                              <div className="text-xs font-black text-slate-900 dark:text-white truncate">
                                {d.full_name}
                              </div>
                              <div className="text-[10px] font-mono text-slate-500 dark:text-zinc-400">
                                {d.tc_masked}
                              </div>
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>

                  {/* Driver T.C. Verification */}
                  {selectedDriverId && (
                    <div className="space-y-2 pt-1">
                      <label className="block text-[11px] font-bold text-slate-700 dark:text-zinc-300">
                        {t("creditsale.driver_tc_label")}
                      </label>
                      <div className="flex gap-2">
                        <input
                          type="text"
                          inputMode="numeric"
                          maxLength={11}
                          value={driverTc}
                          onChange={(e) =>
                            setDriverTc(e.target.value.replace(/\D/g, "").slice(0, 11))
                          }
                          placeholder="11 haneli T.C. no"
                          className="flex-1 px-3 py-2 rounded-xl bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-700 text-xs font-mono text-slate-900 dark:text-white"
                        />
                        <button
                          type="button"
                          disabled={verifyingIdentity || !isValidTc(driverTc)}
                          onClick={handleVerifyIdentity}
                          className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white text-xs font-bold shrink-0 transition"
                        >
                          {verifyingIdentity ? (
                            <Loader2 size={14} className="animate-spin" />
                          ) : (
                            <UserCheck size={14} />
                          )}
                          <span>{t("creditsale.verify_identity")}</span>
                        </button>
                      </div>
                      {tcHintValid !== null && (
                        <div
                          className={`text-[10px] font-bold ${
                            tcHintValid ? "text-emerald-600" : "text-rose-600"
                          }`}
                        >
                          {tcHintValid ? t("creditsale.tc_hint_valid") : t("creditsale.tc_hint_invalid")}
                        </div>
                      )}
                    </div>
                  )}

                  {/* Reasons or Verified Banner */}
                  {isCorporateSnapshotValid ? (
                    <div className="p-2.5 rounded-xl bg-emerald-100/90 dark:bg-emerald-950/60 border border-emerald-300 dark:border-emerald-800 flex items-center gap-2 text-xs font-black text-emerald-800 dark:text-emerald-300">
                      <CheckCircle2 size={16} />
                      <span>{t("creditsale.verified_ok")}</span>
                    </div>
                  ) : verifiedSnapshot !== null ? (
                    <div className="p-2.5 rounded-xl bg-amber-100 dark:bg-amber-950/60 border border-amber-300 dark:border-amber-800 flex items-center gap-2 text-xs font-bold text-amber-900 dark:text-amber-300">
                      <AlertTriangle size={15} />
                      <span>{t("creditsale.needs_reverify")}</span>
                    </div>
                  ) : (
                    lookupResult.reasons.length > 0 &&
                    !(lookupResult.reasons.length === 1 && lookupResult.reasons[0] === "driver_required" && !driverTc) && (
                      <div className="p-2.5 rounded-xl bg-rose-50 dark:bg-rose-950/50 border border-rose-200 dark:border-rose-900 space-y-1 text-xs font-semibold text-rose-700 dark:text-rose-300">
                        {lookupResult.reasons.map((r) => (
                          <div key={r}>• {reasonMessage(r, t)}</div>
                        ))}
                      </div>
                    )
                  )}
                </>
              )}
            </div>
          )}
        </div>
      )}

      {accountType === "individual" && (
        <IndividualCreditPicker stationId={stationId} onCreditInputChange={onCreditInputChange} />
      )}
    </div>
  );
};
