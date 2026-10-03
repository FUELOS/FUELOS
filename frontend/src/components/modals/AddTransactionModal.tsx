/**
 * FuelOS — Yeni Akaryakıt Satış & Pompa Otomasyon Fişi Girişi
 * - %100 Akaryakıt Odaklı (Market/Diğer kaldırıldı)
 * - Personel RFID Kartı Tek Tıkla Seçimi (Dropdown kaldırıldı)
 * - İstasyon Pompa Seçimi (Pompa 1, 2, 3, 4...)
 * - Ödeme Yöntemi (Varsayılan: Nakit - Kart çekilmediyse otomatik nakit sayılır)
 */

import React, { useState, useEffect } from "react";
import { apiClient } from "@/lib/api";
import { useLanguage } from "@/context/LanguageContext";
import { PaymentMethod } from "@/types";
import {
  X,
  AlertCircle,
  Loader2,
  Fuel,
  Wallet,
  CreditCard,
  ArrowRightLeft,
  Receipt,
  User,
  Cpu,
  CheckCircle2,
} from "lucide-react";

interface ShiftOption {
  shift_id: string;
  station_name: string;
  user_name: string;
  worker_name?: string;
  worker_avatar?: string | null;
  pump_label?: string | null;
}

interface AddTransactionModalProps {
  isOpen: boolean;
  activeShifts: ShiftOption[];
  defaultShiftId?: string | null;
  onClose: () => void;
  onSuccess: () => void;
}

const FUEL_TYPES = [
  { name: "Kurşunsuz 95 (Benzin)", priceApprox: 44.5 },
  { name: "Motorin (Dizel)", priceApprox: 45.2 },
  { name: "Otogaz (LPG)", priceApprox: 25.8 },
];

export const AddTransactionModal: React.FC<AddTransactionModalProps> = ({
  isOpen,
  activeShifts,
  defaultShiftId,
  onClose,
  onSuccess,
}) => {
  const { t, language } = useLanguage();
  const [selectedShiftId, setSelectedShiftId] = useState<string>("");
  const [selectedPumpLabel, setSelectedPumpLabel] = useState<string>("Pompa 1");
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("cash");
  const [amount, setAmount] = useState<string>("");
  const [liters, setLiters] = useState<string>("");
  const [fuelType, setFuelType] = useState<string>("Motorin (Dizel)");
  const [plateNumber, setPlateNumber] = useState<string>("");
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  // Modal açıldığında varsayılan atamalar
  useEffect(() => {
    if (isOpen) {
      setError(null);
      if (defaultShiftId) {
        setSelectedShiftId(defaultShiftId);
      } else if (activeShifts.length > 0) {
        setSelectedShiftId(activeShifts[0].shift_id);
      }
      setPaymentMethod("cash"); // Varsayılan: Nakit (kart çekilmediyse nakit kabul edilir)
      setAmount("");
      setLiters("");
      setPlateNumber("");
    }
  }, [isOpen, defaultShiftId, activeShifts]);

  if (!isOpen) return null;

  // Tutar girildiğinde yaklaşık litreyi otomatik hesaplama desteği
  const handleAmountChange = (val: string) => {
    setAmount(val);
    const parsed = parseFloat(val);
    const selectedFuel = FUEL_TYPES.find((f) => f.name === fuelType);
    if (!isNaN(parsed) && parsed > 0 && selectedFuel) {
      const autoLiters = (parsed / selectedFuel.priceApprox).toFixed(2);
      setLiters(autoLiters);
    }
  };

  // Litre girildiğinde tutarı otomatik hesaplama desteği
  const handleLitersChange = (val: string) => {
    setLiters(val);
    const parsed = parseFloat(val);
    const selectedFuel = FUEL_TYPES.find((f) => f.name === fuelType);
    if (!isNaN(parsed) && parsed > 0 && selectedFuel) {
      const autoAmount = (parsed * selectedFuel.priceApprox).toFixed(2);
      setAmount(autoAmount);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedShiftId) {
      setError(language === "tr" ? "İşlem eklemek için açık bir personel vardiyası seçilmelidir" : "An active staff shift must be selected");
      return;
    }

    const parsedAmount = parseFloat(amount);
    if (isNaN(parsedAmount) || parsedAmount <= 0) {
      setError(language === "tr" ? "Lütfen geçerli ve pozitif bir satış tutarı girin" : "Please enter a valid positive sale amount");
      return;
    }

    const parsedLiters = parseFloat(liters);
    if (isNaN(parsedLiters) || parsedLiters <= 0) {
      setError(language === "tr" ? "Verilen yakıt litresi zorunludur ve pozitif olmalıdır" : "Dispensed liters must be a positive number");
      return;
    }

    const descParts = [];
    if (selectedPumpLabel) descParts.push(selectedPumpLabel);
    if (plateNumber.trim()) descParts.push(`${language === "tr" ? "Plaka" : "Plate"}: ${plateNumber.trim().toUpperCase()}`);

    const payload = {
      shift_id: selectedShiftId,
      type: "fuel",
      payment_method: paymentMethod,
      amount: parsedAmount,
      liters: parsedLiters,
      fuel_type: fuelType,
      description: descParts.length > 0 ? descParts.join(" - ") : null,
    };

    try {
      setLoading(true);
      setError(null);
      await apiClient.post("/transactions", payload);
      onSuccess();
      onClose();
    } catch (err: any) {
      const msg = err.response?.data?.detail || (language === "tr" ? "Satış kaydı eklenirken bir hata oluştu" : "Failed to record sale");
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-white dark:bg-[#0f172a] border border-slate-200 dark:border-slate-800 rounded-3xl w-full max-w-lg overflow-hidden shadow-2xl animate-in fade-in zoom-in-95 duration-150">
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-slate-100 dark:border-slate-800 bg-gradient-to-r from-emerald-500/10 to-teal-500/10">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-emerald-600 text-white flex items-center justify-center shadow-lg shadow-emerald-600/30">
              <Fuel size={20} />
            </div>
            <div>
              <h3 className="font-black text-lg text-slate-900 dark:text-white">{t("modal.add_sale_title")}</h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                {t("modal.add_sale_sub")}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-xl bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-slate-500 hover:text-slate-800 dark:hover:text-white transition"
          >
            <X size={16} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 space-y-4 max-h-[82vh] overflow-y-auto">
          {error && (
            <div className="p-3.5 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800/40 rounded-2xl text-red-600 dark:text-red-400 text-xs flex items-start gap-2.5">
              <AlertCircle size={15} className="shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          {/* ── 1. PERSONEL KARTI SEÇİMİ (Kartlar Halinde, Dropdown Yok) ── */}
          <div>
            <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-2 flex items-center justify-between">
              <span className="flex items-center gap-1.5">
                <User size={13} className="text-blue-500" />
                {t("modal.select_staff_rfid")} *
              </span>
              <span className="text-[10px] text-slate-400 font-normal">{language === "tr" ? "Tek tıkla seçin" : "One-click select"}</span>
            </label>

            {activeShifts.length === 0 ? (
              <div className="p-4 bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800/40 rounded-2xl text-amber-700 dark:text-amber-300 text-xs">
                {language === "tr" ? "Şu anda açık bir personel vardiyası bulunmuyor. Satış girmeden önce lütfen vardiya başlatın." : "No open shifts found. Please open a shift before recording sales."}
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-2">
                {activeShifts.map((s) => {
                  const isSelected = selectedShiftId === s.shift_id;
                  const displayName = s.worker_name || s.user_name;
                  return (
                    <button
                      key={s.shift_id}
                      type="button"
                      onClick={() => setSelectedShiftId(s.shift_id)}
                      className={`p-3 rounded-2xl border text-left transition flex items-center gap-2.5 ${
                        isSelected
                          ? "border-blue-500 bg-blue-50/80 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300 shadow-sm"
                          : "border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50 hover:border-slate-300 text-slate-700 dark:text-slate-300"
                      }`}
                    >
                      <div className="w-8 h-8 rounded-xl bg-blue-600 text-white flex items-center justify-center font-black text-xs shrink-0">
                        {displayName.charAt(0).toUpperCase()}
                      </div>
                      <div className="min-w-0">
                        <div className="text-xs font-black truncate">{displayName}</div>
                        <div className="text-[10px] text-slate-400 truncate">
                          {s.pump_label || (language === "tr" ? "Gezici Personel" : "Roaming Attendant")}
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {/* ── 2. DOLUM YAPILAN POMPA ── */}
          <div>
            <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1.5 flex items-center gap-1.5">
              <Cpu size={13} className="text-emerald-500" />
              {t("modal.select_pump")}
            </label>
            <div className="grid grid-cols-4 gap-2">
              {["Pompa 1", "Pompa 2", "Pompa 3", "Pompa 4"].map((pLabel) => (
                <button
                  key={pLabel}
                  type="button"
                  onClick={() => setSelectedPumpLabel(pLabel)}
                  className={`py-2 px-2 rounded-xl border text-xs font-bold transition text-center ${
                    selectedPumpLabel === pLabel
                      ? "border-emerald-500 bg-emerald-50 dark:bg-emerald-950/30 text-emerald-700 dark:text-emerald-300 shadow-sm"
                      : "border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50 text-slate-600 dark:text-slate-400 hover:border-slate-300"
                  }`}
                >
                  {pLabel}
                </button>
              ))}
            </div>
          </div>

          {/* ── 3. YAKIT TÜRÜ ── */}
          <div>
            <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1.5">
              {t("modal.fuel_type")}
            </label>
            <div className="grid grid-cols-3 gap-2">
              {FUEL_TYPES.map((f) => (
                <button
                  key={f.name}
                  type="button"
                  onClick={() => {
                    setFuelType(f.name);
                    if (amount) {
                      const autoLiters = (parseFloat(amount) / f.priceApprox).toFixed(2);
                      setLiters(autoLiters);
                    }
                  }}
                  className={`p-2.5 rounded-2xl border text-left transition ${
                    fuelType === f.name
                      ? "border-amber-500 bg-amber-50 dark:bg-amber-950/30 text-amber-700 dark:text-amber-300 shadow-sm"
                      : "border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50 text-slate-600 dark:text-slate-400 hover:border-slate-300"
                  }`}
                >
                  <div className="text-[11px] font-black leading-tight">{f.name.split(" ")[0]}</div>
                  <div className="text-[10px] text-slate-400 mt-0.5 font-mono">~{f.priceApprox} ₺/L</div>
                </button>
              ))}
            </div>
          </div>

          {/* ── 4. TUTAR VE LİTRE ── */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1">
                {t("modal.fuel_amount")} *
              </label>
              <div className="relative">
                <input
                  type="number"
                  step="0.01"
                  min="0.01"
                  required
                  value={amount}
                  onChange={(e) => handleAmountChange(e.target.value)}
                  placeholder="850.00"
                  className="w-full bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 rounded-2xl px-4 py-3 text-sm text-slate-800 dark:text-slate-200 font-mono font-bold focus:outline-none focus:ring-2 focus:ring-emerald-500 transition pr-8"
                />
                <span className="absolute right-3.5 top-1/2 -translate-y-1/2 font-bold text-slate-400 text-sm">₺</span>
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1">
                {t("modal.fuel_liters")} *
              </label>
              <div className="relative">
                <input
                  type="number"
                  step="0.01"
                  min="0.01"
                  required
                  value={liters}
                  onChange={(e) => handleLitersChange(e.target.value)}
                  placeholder="18.80"
                  className="w-full bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 rounded-2xl px-4 py-3 text-sm text-slate-800 dark:text-slate-200 font-mono font-bold focus:outline-none focus:ring-2 focus:ring-emerald-500 transition pr-8"
                />
                <span className="absolute right-3.5 top-1/2 -translate-y-1/2 font-bold text-slate-400 text-xs">L</span>
              </div>
            </div>
          </div>

          {/* ── 5. ÖDEME YÖNTEMİ (Varsayılan Nakit - Kart Çekilmediyse Nakit) ── */}
          <div>
            <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1.5 flex items-center justify-between">
              <span>{t("modal.payment_channel")} *</span>
              <span className="text-[10px] text-emerald-600 dark:text-emerald-400 font-semibold">
                {language === "tr" ? "Kart çekilmediyse otomatik nakit sayılır" : "Default cash if card not tapped"}
              </span>
            </label>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {[
                { id: "cash", label: t("modal.payment_cash"), sub: language === "tr" ? "Elden alındı" : "Direct cash", icon: Wallet, color: "emerald" },
                { id: "credit_card", label: t("modal.payment_pos"), sub: language === "tr" ? "Banka kartı" : "Bank card", icon: CreditCard, color: "blue" },
                { id: "eft", label: t("modal.payment_fast"), sub: language === "tr" ? "Anlık transfer" : "Instant wire", icon: ArrowRightLeft, color: "purple" },
                { id: "veresiye", label: language === "tr" ? "Veresiye" : "Credit", sub: language === "tr" ? "Cari hesap" : "Account balance", icon: Receipt, color: "amber" },
              ].map((pm) => {
                const Icon = pm.icon;
                const isSelected = paymentMethod === pm.id;
                return (
                  <button
                    key={pm.id}
                    type="button"
                    onClick={() => setPaymentMethod(pm.id as PaymentMethod)}
                    className={`p-2.5 rounded-2xl border text-center transition flex flex-col items-center justify-center ${
                      isSelected
                        ? "border-emerald-500 bg-emerald-50 dark:bg-emerald-950/30 text-emerald-700 dark:text-emerald-300 shadow-sm"
                        : "border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50 text-slate-600 dark:text-slate-400 hover:border-slate-300"
                    }`}
                  >
                    <Icon size={16} className={isSelected ? "text-emerald-600" : "text-slate-400"} />
                    <div className="text-xs font-black mt-1">{pm.label}</div>
                    <div className="text-[9px] text-slate-400">{pm.sub}</div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Plaka (Opsiyonel) */}
          <div>
            <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1">
              {t("modal.plate_number")}
            </label>
            <input
              type="text"
              value={plateNumber}
              onChange={(e) => setPlateNumber(e.target.value)}
              placeholder="Örn: 06 ABC 123"
              className="w-full bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 rounded-2xl px-4 py-2.5 text-sm text-slate-800 dark:text-slate-200 uppercase font-mono font-bold focus:outline-none focus:ring-2 focus:ring-emerald-500 transition"
            />
          </div>

          {/* İşlemi Kaydet Butonu */}
          <div className="pt-2 flex items-center justify-end gap-3">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2.5 text-sm font-bold text-slate-500 hover:text-slate-800 dark:hover:text-white transition"
            >
              {t("common.cancel")}
            </button>
            <button
              type="submit"
              disabled={loading || activeShifts.length === 0}
              className="px-6 py-3 rounded-2xl bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white font-black text-sm flex items-center gap-2 shadow-lg shadow-emerald-600/30 transition active:scale-95"
            >
              {loading ? <Loader2 size={16} className="animate-spin" /> : <CheckCircle2 size={16} />}
              <span>{t("modal.save_sale")}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
