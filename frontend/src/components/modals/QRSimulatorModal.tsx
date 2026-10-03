/**
 * FuelOS — Sanal QR / FAST Ödeme Simülatörü Modal
 * qris_simulator mantığıyla dinamik QR gösterir, onaylandığında FAST transfer simüle eder.
 */

import React, { useState, useEffect } from "react";
import { apiClient } from "@/lib/api";
import { formatCurrency } from "@/lib/utils";
import { useLanguage } from "@/context/LanguageContext";
import {
  QrCode,
  X,
  Loader2,
  CheckCircle2,
  AlertCircle,
  Zap,
  User,
  CreditCard,
  ArrowRightLeft,
  ChevronDown,
  Fuel,
  RefreshCw,
} from "lucide-react";

interface QRModalProps {
  isOpen: boolean;
  shiftId: string;
  workerName: string;
  onClose: () => void;
  onSuccess: () => void;
}

interface QRResult {
  qr_ref: string;
  sender_iban: string;
  sender_name: string;
  amount: number;
  fast_ref: string;
  message: string;
}

// Sanal QR SVG — gerçekçi piksel deseni
const FakeQRCode: React.FC<{ amount: string; seed: number; label: string }> = ({ amount, seed, label }) => {
  // Deterministik piksel matrisi (seed'e göre)
  const size = 11;
  const cells: boolean[][] = Array.from({ length: size }, (_, r) =>
    Array.from({ length: size }, (_, c) => {
      // Köşe konumlandırma kareleri (gerçek QR gibi)
      if ((r < 3 && c < 3) || (r < 3 && c >= size - 3) || (r >= size - 3 && c < 3))
        return true;
      // Sanal rastgele desen
      return (((r * 7 + c * 13 + seed) % 5) !== 0);
    })
  );

  return (
    <div className="flex flex-col items-center gap-3">
      <div className="bg-white rounded-2xl p-4 shadow-lg border-2 border-slate-200">
        <div className="grid" style={{ gridTemplateColumns: `repeat(${size}, 1fr)`, gap: 2, width: 132 }}>
          {cells.map((row, r) =>
            row.map((cell, c) => (
              <div
                key={`${r}-${c}`}
                className={`rounded-[1px] ${cell ? "bg-slate-900" : "bg-white"}`}
                style={{ width: 10, height: 10 }}
              />
            ))
          )}
        </div>
      </div>
      <div className="flex items-center gap-2">
        <div className="w-6 h-6 rounded-lg bg-purple-600 flex items-center justify-center">
          <Zap size={12} className="text-white fill-white" />
        </div>
        <span className="text-xs font-black text-slate-700 dark:text-slate-200">
          {label}
        </span>
      </div>
      {amount && parseFloat(amount) > 0 && (
        <div className="text-2xl font-black text-purple-600">
          {formatCurrency(parseFloat(amount))}
        </div>
      )}
    </div>
  );
};

export const QRSimulatorModal: React.FC<QRModalProps> = ({
  isOpen,
  shiftId,
  workerName,
  onClose,
  onSuccess,
}) => {
  const { t, language } = useLanguage();
  const [step, setStep] = useState<"form" | "qr" | "processing" | "result">("form");
  const [amount, setAmount] = useState("");
  const [liters, setLiters] = useState("");
  const [fuelType, setFuelType] = useState("Motorin");
  const [qrSeed, setQrSeed] = useState(Math.floor(Math.random() * 1000));
  const [countdown, setCountdown] = useState(0);
  const [_loading, setLoading] = useState(false);
  const [result, setResult] = useState<QRResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  // QR ekranında geri sayım (simülasyon için)
  useEffect(() => {
    if (step === "qr" && countdown > 0) {
      const timer = setTimeout(() => setCountdown((c) => c - 1), 1000);
      return () => clearTimeout(timer);
    }
  }, [step, countdown]);

  const reset = () => {
    setStep("form");
    setAmount("");
    setLiters("");
    setFuelType("Motorin");
    setQrSeed(Math.floor(Math.random() * 1000));
    setCountdown(0);
    setResult(null);
    setError(null);
  };

  const handleClose = () => {
    reset();
    onClose();
  };

  const handleShowQR = () => {
    const amountNum = parseFloat(amount);
    if (!amount || isNaN(amountNum) || amountNum <= 0) {
      setError(language === "tr" ? "Geçerli bir tutar girin." : "Enter a valid amount.");
      return;
    }
    setError(null);
    setQrSeed(Math.floor(Math.random() * 1000));
    setCountdown(120); // 2 dakika QR geçerlilik
    setStep("qr");
  };

  const handleConfirmPayment = async () => {
    setStep("processing");
    setLoading(true);

    try {
      const res = await apiClient.post("/simulate/qr", {
        shift_id: shiftId,
        amount: parseFloat(amount),
        liters: parseFloat(liters) || 0,
        fuel_type: fuelType,
      });
      setResult(res.data);
      onSuccess(); // Dashboard'u yenile
      setStep("result");
    } catch (err: any) {
      setError(err.response?.data?.detail || (language === "tr" ? "QR ödeme gerçekleştirilemedi." : "QR payment failed."));
      setStep("qr");
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
      <div className="relative bg-white dark:bg-[#0f172a] rounded-3xl shadow-2xl w-full max-w-md border border-slate-200 dark:border-slate-700 overflow-hidden">
        {/* Header */}
        <div className="bg-gradient-to-r from-purple-600 to-purple-700 p-5 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-white/20 flex items-center justify-center">
              <QrCode size={20} className="text-white" />
            </div>
            <div>
              <div className="text-white font-black text-base">
                {language === "tr" ? "QR / FAST Ödeme" : "QR / FAST Payment"}
              </div>
              <div className="text-purple-200 text-xs font-medium">{workerName}</div>
            </div>
          </div>
          <button
            onClick={handleClose}
            className="w-8 h-8 rounded-xl bg-white/20 flex items-center justify-center text-white hover:bg-white/30 transition"
          >
            <X size={16} />
          </button>
        </div>

        <div className="p-5">
          {/* ADIM 1: Form */}
          {step === "form" && (
            <div className="space-y-4">
              <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
                {language === "tr"
                  ? "Tutarı girin, QR kod oluşturun. Müşteri uygulamasıyla okutulduğunda FAST transferi otomatik vardiyaya işlenir."
                  : "Enter the amount and generate QR code. Once scanned by customer banking app, the FAST transfer is recorded in the active shift."}
              </p>

              <div className="space-y-3">
                <div>
                  <label className="block text-xs font-bold text-slate-600 dark:text-slate-300 mb-1.5">
                    {language === "tr" ? "Ödeme Tutarı (₺)" : "Payment Amount (₺)"}
                  </label>
                  <input
                    type="number"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    placeholder="0,00"
                    className="w-full px-4 py-3 rounded-2xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white text-sm font-bold focus:outline-none focus:ring-2 focus:ring-purple-500 transition"
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-bold text-slate-600 dark:text-slate-300 mb-1.5">
                      <Fuel size={11} className="inline mr-1" />
                      {language === "tr" ? "Yakıt Türü" : "Fuel Type"}
                    </label>
                    <div className="relative">
                      <select
                        value={fuelType}
                        onChange={(e) => setFuelType(e.target.value)}
                        className="w-full px-3 py-3 rounded-2xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white text-xs font-bold focus:outline-none focus:ring-2 focus:ring-purple-500 appearance-none pr-8 transition"
                      >
                        <option>Motorin</option>
                        <option>Benzin</option>
                        <option>LPG</option>
                      </select>
                      <ChevronDown size={12} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-600 dark:text-slate-300 mb-1.5">
                      {language === "tr" ? "Litre (opsiyonel)" : "Liters (optional)"}
                    </label>
                    <input
                      type="number"
                      value={liters}
                      onChange={(e) => setLiters(e.target.value)}
                      placeholder="0.000"
                      className="w-full px-3 py-3 rounded-2xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white text-xs font-bold focus:outline-none focus:ring-2 focus:ring-purple-500 transition"
                    />
                  </div>
                </div>

                {/* Hızlı Tutar */}
                <div className="flex gap-2">
                  {[100, 250, 500, 1000].map((v) => (
                    <button
                      key={v}
                      onClick={() => setAmount(String(v))}
                      className="flex-1 py-2 rounded-xl text-xs font-bold border border-purple-200 dark:border-purple-800 text-purple-600 dark:text-purple-400 hover:bg-purple-50 dark:hover:bg-purple-900/30 transition"
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
                onClick={handleShowQR}
                disabled={!amount}
                className="w-full py-3.5 rounded-2xl bg-purple-600 hover:bg-purple-700 disabled:opacity-50 text-white font-black flex items-center justify-center gap-2 shadow-lg shadow-purple-600/30 transition active:scale-95"
              >
                <QrCode size={18} />
                <span>{language === "tr" ? "QR Kod Oluştur" : "Generate QR Code"}</span>
              </button>
            </div>
          )}

          {/* ADIM 2: QR Göster */}
          {step === "qr" && (
            <div className="space-y-4">
              <FakeQRCode
                amount={amount}
                seed={qrSeed}
                label={language === "tr" ? "FAST / QR Ödeme" : "FAST / QR Payment"}
              />

              {/* Geri sayım */}
              <div className="flex items-center justify-between text-xs font-semibold text-slate-500 dark:text-slate-400">
                <span>{language === "tr" ? "QR Geçerlilik" : "QR Validity"}</span>
                <span className={`font-mono font-black ${countdown < 30 ? "text-red-500" : "text-slate-700 dark:text-slate-200"}`}>
                  {Math.floor(countdown / 60)}:{String(countdown % 60).padStart(2, "0")}
                </span>
              </div>

              {error && (
                <div className="flex items-center gap-2 text-xs text-red-600 bg-red-50 dark:bg-red-900/20 rounded-2xl p-3 border border-red-200 dark:border-red-800">
                  <AlertCircle size={14} />
                  <span>{error}</span>
                </div>
              )}

              <div className="grid grid-cols-2 gap-3">
                <button
                  onClick={() => {
                    setQrSeed(Math.floor(Math.random() * 1000));
                    setCountdown(120);
                  }}
                  className="py-3 rounded-2xl border border-purple-200 dark:border-purple-800 text-purple-600 dark:text-purple-400 font-bold text-sm hover:bg-purple-50 dark:hover:bg-purple-900/20 flex items-center justify-center gap-1.5 transition"
                >
                  <RefreshCw size={14} />
                  {language === "tr" ? "Yenile" : "Refresh"}
                </button>
                <button
                  onClick={handleConfirmPayment}
                  className="py-3 rounded-2xl bg-purple-600 hover:bg-purple-700 text-white font-black text-sm flex items-center justify-center gap-1.5 shadow-lg shadow-purple-600/30 transition active:scale-95"
                >
                  <Zap size={14} className="fill-white" />
                  {language === "tr" ? "Ödemeyi Onayla" : "Confirm Payment"}
                </button>
              </div>

              <button
                onClick={() => setStep("form")}
                className="w-full text-xs text-slate-400 hover:text-slate-600 transition"
              >
                {language === "tr" ? "← Geri" : "← Back"}
              </button>
            </div>
          )}

          {/* ADIM 3: İşleniyor */}
          {step === "processing" && (
            <div className="flex flex-col items-center gap-4 py-8">
              <div className="w-16 h-16 rounded-full bg-purple-100 dark:bg-purple-900/30 flex items-center justify-center">
                <Loader2 size={32} className="text-purple-600 animate-spin" />
              </div>
              <div className="text-base font-black text-slate-900 dark:text-white">
                {language === "tr" ? "FAST Transfer Alınıyor..." : "Receiving FAST Transfer..."}
              </div>
              <div className="text-xs text-slate-500 dark:text-slate-400 text-center leading-relaxed">
                {language === "tr" ? (
                  <>
                    Banka webhook'u bekleniyor.<br />
                    İşleminiz gerçekleştiriliyor.
                  </>
                ) : (
                  <>
                    Waiting for bank webhook.<br />
                    Processing transaction.
                  </>
                )}
              </div>
              <div className="flex gap-1">
                {[0, 1, 2].map((i) => (
                  <div
                    key={i}
                    className="w-2 h-2 rounded-full bg-purple-400 animate-bounce"
                    style={{ animationDelay: `${i * 0.2}s` }}
                  />
                ))}
              </div>
            </div>
          )}

          {/* ADIM 4: Sonuç */}
          {step === "result" && result && (
            <div className="space-y-4">
              <div className="flex flex-col items-center gap-2 py-2">
                <div className="w-16 h-16 rounded-full bg-emerald-100 dark:bg-emerald-900/30 flex items-center justify-center">
                  <CheckCircle2 size={36} className="text-emerald-600 stroke-[2.5]" />
                </div>
                <div className="text-base font-black text-slate-900 dark:text-white">
                  {language === "tr" ? "Transfer Alındı!" : "Transfer Received!"}
                </div>
                <div className="text-xs text-slate-500 dark:text-slate-400 text-center">
                  {result.message}
                </div>
              </div>

              {/* Transfer Detayları */}
              <div className="bg-slate-50 dark:bg-slate-800/60 rounded-2xl p-4 space-y-3 border border-slate-200 dark:border-slate-700">
                <div className="text-[10px] font-black text-slate-400 uppercase tracking-widest text-center">
                  {language === "tr" ? "— FAST TRANSFER DEKONTU —" : "— FAST TRANSFER RECEIPT —"}
                </div>

                {[
                  { icon: User, label: language === "tr" ? "Gönderen" : "Sender", value: result.sender_name, color: "text-slate-800 dark:text-slate-200" },
                  { icon: CreditCard, label: "IBAN", value: result.sender_iban.slice(0, 12) + "****", color: "text-slate-600 dark:text-slate-400 font-mono text-xs" },
                  { icon: ArrowRightLeft, label: "FAST Ref", value: result.fast_ref, color: "text-purple-600 font-mono text-xs" },
                  { icon: QrCode, label: "QR Ref", value: result.qr_ref.slice(0, 16), color: "text-slate-500 dark:text-slate-400 font-mono text-xs" },
                ].map(({ icon: Icon, label, value, color }) => (
                  <div key={label} className="flex items-center justify-between text-xs">
                    <span className="flex items-center gap-1.5 text-slate-500 dark:text-slate-400 font-semibold">
                      <Icon size={13} />
                      {label}
                    </span>
                    <span className={`font-bold ${color}`}>{value}</span>
                  </div>
                ))}

                <div className="border-t border-slate-200 dark:border-slate-700 pt-3 flex items-center justify-between">
                  <span className="text-xs font-bold text-slate-500">{language === "tr" ? "TUTAR" : "AMOUNT"}</span>
                  <span className="text-xl font-black text-purple-600">
                    {formatCurrency(result.amount)}
                  </span>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <button
                  onClick={reset}
                  className="py-3 rounded-2xl border border-purple-200 dark:border-purple-800 text-purple-600 dark:text-purple-400 font-bold text-sm hover:bg-purple-50 dark:hover:bg-purple-900/20 transition"
                >
                  {language === "tr" ? "Yeni QR" : "New QR"}
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

