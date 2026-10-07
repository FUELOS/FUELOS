/**
 * FuelOS — Sanal POS Ödeme Simülatörü Modal
 * pos-sim mantığıyla banka slip onayı üretir, panelde POS toplamını anlık artırır.
 */

import React, { useState } from "react";
import { apiClient } from "@/lib/api";
import { formatCurrency } from "@/lib/utils";
import { useLanguage } from "@/context/LanguageContext";
import {
  CreditCard,
  X,
  Loader2,
  CheckCircle2,
  AlertCircle,
  Building2,
  Hash,
  Receipt,
  Fuel,
  ChevronDown,
} from "lucide-react";

interface POSModalProps {
  isOpen: boolean;
  shiftId: string;
  workerName: string;
  onClose: () => void;
  onSuccess: () => void;
}

interface POSResult {
  auth_code: string;
  ref_number: string;
  masked_card: string;
  bank_name: string;
  amount: number;
  message: string;
}

export const POSSimulatorModal: React.FC<POSModalProps> = ({
  isOpen,
  shiftId,
  workerName,
  onClose,
  onSuccess,
}) => {
  const { t, language } = useLanguage();
  const [amount, setAmount] = useState("");
  const [liters, setLiters] = useState("");
  const [fuelType, setFuelType] = useState("Motorin");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<POSResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const reset = () => {
    setAmount("");
    setLiters("");
    setFuelType("Motorin");
    setResult(null);
    setError(null);
  };

  const handleClose = () => {
    reset();
    onClose();
  };

  const handleSubmit = async () => {
    const amountNum = parseFloat(amount);
    if (!amount || isNaN(amountNum) || amountNum <= 0) {
      setError(language === "tr" ? "Geçerli bir tutar girin." : "Enter a valid amount.");
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const res = await apiClient.post("/simulate/pos", {
        shift_id: shiftId,
        amount: amountNum,
        liters: parseFloat(liters) || 0,
        fuel_type: fuelType,
      });
      setResult(res.data);
      onSuccess(); // Dashboard'u yenile
    } catch (err: any) {
      setError(
        err.response?.data?.detail || (language === "tr" ? "POS işlemi gerçekleştirilemedi." : "Failed to process POS payment.")
      );
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Overlay */}
      <div
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        onClick={handleClose}
      />

      {/* Modal */}
      <div className="relative bg-white dark:bg-[#111218] rounded-3xl shadow-2xl w-full max-w-md border border-slate-200 dark:border-zinc-700 overflow-hidden">
        {/* Header */}
        <div className="bg-gradient-to-r from-blue-600 to-blue-700 p-5 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-white/20 flex items-center justify-center">
              <CreditCard size={20} className="text-white" />
            </div>
            <div>
              <div className="text-white font-black text-base">{language === "tr" ? "Sanal POS" : "Virtual POS"}</div>
              <div className="text-blue-200 text-xs font-medium">
                {workerName}
              </div>
            </div>
          </div>
          <button
            onClick={handleClose}
            className="w-8 h-8 rounded-xl bg-white/20 flex items-center justify-center text-white hover:bg-white/30 transition"
          >
            <X size={16} />
          </button>
        </div>

        <div className="p-5 space-y-4">
          {!result ? (
            <>
              {/* POS Terminali Görseli */}
              <div className="flex justify-center">
                <div className="bg-slate-800 dark:bg-[#111218] rounded-2xl p-4 w-48 shadow-xl border border-slate-700">
                  <div className="bg-slate-700 rounded-lg h-16 flex items-center justify-center mb-3">
                    <div className="text-center">
                      <div className="text-slate-300 text-[10px] font-bold">{language === "tr" ? "SANAL POS" : "VIRTUAL POS"}</div>
                      <div className="text-white text-lg font-black">
                        {amount ? formatCurrency(parseFloat(amount) || 0) : "₺ 0,00"}
                      </div>
                    </div>
                  </div>
                  {/* Tuş takımı görseli */}
                  <div className="grid grid-cols-3 gap-1">
                    {["1","2","3","4","5","6","7","8","9","*","0","#"].map((k) => (
                      <div
                        key={k}
                        className="h-6 bg-slate-600 rounded text-[9px] font-bold text-slate-300 flex items-center justify-center"
                      >
                        {k}
                      </div>
                    ))}
                  </div>
                  <div className="mt-2 h-6 bg-green-700 rounded text-[9px] font-black text-white flex items-center justify-center">
                    {language === "tr" ? "ONAYLA" : "APPROVE"}
                  </div>
                </div>
              </div>

              {/* Form */}
              <div className="space-y-3">
                {/* Tutar */}
                <div>
                  <label className="block text-xs font-bold text-slate-600 dark:text-slate-300 mb-1.5">
                    {language === "tr" ? "Ödeme Tutarı (₺)" : "Payment Amount (₺)"}
                  </label>
                  <input
                    type="number"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    placeholder="0,00"
                    className="w-full px-4 py-3 rounded-2xl border border-slate-200 dark:border-zinc-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white text-sm font-bold focus:outline-none focus:ring-2 focus:ring-blue-500 transition"
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  {/* Yakıt Türü */}
                  <div>
                    <label className="block text-xs font-bold text-slate-600 dark:text-slate-300 mb-1.5">
                      <Fuel size={11} className="inline mr-1" />
                      {language === "tr" ? "Yakıt Türü" : "Fuel Type"}
                    </label>
                    <div className="relative">
                      <select
                        value={fuelType}
                        onChange={(e) => setFuelType(e.target.value)}
                        className="w-full px-3 py-3 rounded-2xl border border-slate-200 dark:border-zinc-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white text-xs font-bold focus:outline-none focus:ring-2 focus:ring-blue-500 appearance-none pr-8 transition"
                      >
                        <option>{language === "tr" ? "Motorin" : "Diesel"}</option>
                        <option>{language === "tr" ? "Benzin" : "Gasoline"}</option>
                        <option>LPG</option>
                      </select>
                      <ChevronDown size={12} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                    </div>
                  </div>

                  {/* Litre */}
                  <div>
                    <label className="block text-xs font-bold text-slate-600 dark:text-slate-300 mb-1.5">
                      {language === "tr" ? "Litre (opsiyonel)" : "Liters (optional)"}
                    </label>
                    <input
                      type="number"
                      value={liters}
                      onChange={(e) => setLiters(e.target.value)}
                      placeholder="0.000"
                      className="w-full px-3 py-3 rounded-2xl border border-slate-200 dark:border-zinc-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white text-xs font-bold focus:outline-none focus:ring-2 focus:ring-blue-500 transition"
                    />
                  </div>
                </div>

                {/* Hızlı Tutar Butonları */}
                <div className="flex gap-2">
                  {[100, 250, 500, 1000].map((v) => (
                    <button
                      key={v}
                      onClick={() => setAmount(String(v))}
                      className="flex-1 py-2 rounded-xl text-xs font-bold border border-blue-200 dark:border-blue-800 text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/30 transition"
                    >
                      {v}₺
                    </button>
                  ))}
                </div>
              </div>

              {error && (
                <div className="flex items-center gap-2 text-xs text-red-600 bg-red-50 dark:bg-red-900/20 rounded-2xl p-3 border border-red-200 dark:border-red-800">
                  <AlertCircle size={14} />
                  <span>{error}</span>
                </div>
              )}

              <button
                onClick={handleSubmit}
                disabled={loading || !amount}
                className="w-full py-3.5 rounded-2xl bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-black flex items-center justify-center gap-2 shadow-lg shadow-blue-600/30 transition active:scale-95"
              >
                {loading ? (
                  <Loader2 size={18} className="animate-spin" />
                ) : (
                  <CreditCard size={18} />
                )}
                <span>{loading ? (language === "tr" ? "Banka ile iletişim kuruluyor..." : "Connecting to bank...") : (language === "tr" ? "POS İşlemini Başlat" : "Authorize POS Payment")}</span>
              </button>
            </>
          ) : (
            /* Onay Slip Ekranı */
            <div className="space-y-4">
              {/* Başarı Animasyonu */}
              <div className="flex flex-col items-center gap-2 py-2">
                <div className="w-16 h-16 rounded-full bg-emerald-100 dark:bg-emerald-900/30 flex items-center justify-center">
                  <CheckCircle2 size={36} className="text-emerald-600 stroke-[2.5]" />
                </div>
                <div className="text-base font-black text-slate-900 dark:text-white">
                  {language === "tr" ? "Ödeme Onaylandı!" : "Payment Approved!"}
                </div>
                <div className="text-xs text-slate-500 dark:text-slate-400 text-center">
                  {result.message}
                </div>
              </div>

              {/* Slip Detayları */}
              <div className="bg-slate-50 dark:bg-slate-800/60 rounded-2xl p-4 space-y-3 border border-slate-200 dark:border-zinc-700">
                <div className="text-[10px] font-black text-slate-400 uppercase tracking-widest text-center">
                  {language === "tr" ? "— BANKA SLİP —" : "— BANK RECEIPT —"}
                </div>

                {[
                  { icon: Building2, label: language === "tr" ? "Banka" : "Bank", value: result.bank_name, color: "text-blue-600" },
                  { icon: CreditCard, label: language === "tr" ? "Kart No" : "Card No", value: result.masked_card, color: "text-slate-700 dark:text-slate-300" },
                  { icon: Hash, label: language === "tr" ? "Onay Kodu" : "Auth Code", value: result.auth_code, color: "text-emerald-600 font-mono text-lg" },
                  { icon: Receipt, label: language === "tr" ? "Slip No" : "Slip Ref", value: result.ref_number, color: "text-slate-600 dark:text-slate-400 font-mono text-xs" },
                ].map(({ icon: Icon, label, value, color }) => (
                  <div key={label} className="flex items-center justify-between text-xs">
                    <span className="flex items-center gap-1.5 text-slate-500 dark:text-slate-400 font-semibold">
                      <Icon size={13} />
                      {label}
                    </span>
                    <span className={`font-bold ${color}`}>{value}</span>
                  </div>
                ))}

                <div className="border-t border-slate-200 dark:border-zinc-700 pt-3 flex items-center justify-between">
                  <span className="text-xs font-bold text-slate-500">{language === "tr" ? "TUTAR" : "AMOUNT"}</span>
                  <span className="text-xl font-black text-blue-600">
                    {formatCurrency(result.amount)}
                  </span>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <button
                  onClick={() => { reset(); }}
                  className="py-3 rounded-2xl border border-blue-200 dark:border-blue-800 text-blue-600 dark:text-blue-400 font-bold text-sm hover:bg-blue-50 dark:hover:bg-blue-900/20 transition"
                >
                  {language === "tr" ? "Yeni İşlem" : "New Sale"}
                </button>
                <button
                  onClick={handleClose}
                  className="py-3 rounded-2xl bg-slate-800 dark:bg-slate-700 text-white font-bold text-sm hover:bg-slate-700 transition"
                >
                  {t("common.close")}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

