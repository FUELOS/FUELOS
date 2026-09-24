import React, { useState } from "react";
import { apiClient } from "@/lib/api";
import { PaymentMethod, TransactionType } from "@/types";
import { X, PlusCircle, AlertCircle, Loader2, Fuel, ShoppingBag, MoreHorizontal, Wallet, CreditCard, Building, Receipt } from "lucide-react";

interface AddTransactionModalProps {
  isOpen: boolean;
  activeShifts: { shift_id: string; station_name: string; user_name: string }[];
  defaultShiftId?: string | null;
  onClose: () => void;
  onSuccess: () => void;
}

export const AddTransactionModal: React.FC<AddTransactionModalProps> = ({
  isOpen,
  activeShifts,
  defaultShiftId,
  onClose,
  onSuccess,
}) => {
  const [selectedShiftId, setSelectedShiftId] = useState<string>("");
  const [type, setType] = useState<TransactionType>("fuel");
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("cash");
  const [amount, setAmount] = useState<string>("");
  const [liters, setLiters] = useState<string>("");
  const [fuelType, setFuelType] = useState<string>("Motorin (Dizel)");
  const [description, setDescription] = useState<string>("");
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  React.useEffect(() => {
    if (isOpen) {
      setError(null);
      if (defaultShiftId) {
        setSelectedShiftId(defaultShiftId);
      } else if (activeShifts.length > 0) {
        setSelectedShiftId(activeShifts[0].shift_id);
      }
    }
  }, [isOpen, defaultShiftId, activeShifts]);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedShiftId) {
      setError("İşlem eklemek için açık bir vardiya seçilmelidir");
      return;
    }

    const parsedAmount = parseFloat(amount);
    if (isNaN(parsedAmount) || parsedAmount <= 0) {
      setError("Lütfen geçerli ve pozitif bir tutar girin");
      return;
    }

    const payload: any = {
      shift_id: selectedShiftId,
      type,
      payment_method: paymentMethod,
      amount: parsedAmount,
      description: description.trim() || null,
    };

    if (type === "fuel") {
      const parsedLiters = parseFloat(liters);
      if (isNaN(parsedLiters) || parsedLiters <= 0) {
        setError("Yakıt satışı için litre bilgisi zorunludur ve pozitif olmalıdır");
        return;
      }
      if (!fuelType.trim()) {
        setError("Yakıt türü seçilmelidir");
        return;
      }
      payload.liters = parsedLiters;
      payload.fuel_type = fuelType;
    }

    try {
      setLoading(true);
      setError(null);
      await apiClient.post("/transactions", payload);
      onSuccess();
      onClose();
      // Reset form
      setAmount("");
      setLiters("");
      setDescription("");
    } catch (err: any) {
      const msg = err.response?.data?.detail || "Satış kaydı eklenirken bir hata oluştu";
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-slate-900 border border-slate-800 rounded-3xl w-full max-w-lg overflow-hidden shadow-2xl animate-in fade-in zoom-in-95 duration-150">
        {/* Material Header */}
        <div className="flex items-center justify-between p-5 border-b border-slate-800 bg-gradient-to-r from-amber-900/30 to-orange-900/30">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-gradient-to-tr from-amber-500 to-orange-500 text-slate-950 flex items-center justify-center shadow-lg shadow-amber-500/25">
              <PlusCircle size={18} />
            </div>
            <div>
              <h3 className="font-bold text-lg text-white">Yeni Satış / İşlem Kaydı</h3>
              <p className="text-xs text-slate-400">Pompa veya market satış fişi girişi</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-200 p-1.5 rounded-xl hover:bg-slate-800 transition"
          >
            <X size={18} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {error && (
            <div className="p-3.5 bg-red-500/10 border border-red-500/20 rounded-2xl text-red-400 text-xs flex items-start gap-2.5">
              <AlertCircle size={16} className="shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          {activeShifts.length === 0 ? (
            <div className="p-4 bg-amber-500/10 border border-amber-500/20 rounded-2xl text-amber-300 text-xs leading-relaxed">
              Şu anda açık bir vardiya bulunmuyor. Satış kaydı girebilmek için önce bir vardiya başlatmalısınız.
            </div>
          ) : (
            <div>
              <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1.5">
                Aktif Vardiya Seçimi *
              </label>
              <select
                value={selectedShiftId}
                onChange={(e) => setSelectedShiftId(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2.5 text-sm text-slate-200 focus:outline-none focus:border-amber-500 transition"
              >
                {activeShifts.map((s) => (
                  <option key={s.shift_id} value={s.shift_id}>
                    {s.station_name} — {s.user_name}
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Transaction Type Buttons */}
          <div>
            <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1.5">
              İşlem Türü
            </label>
            <div className="grid grid-cols-3 gap-2">
              <button
                type="button"
                onClick={() => setType("fuel")}
                className={`flex items-center justify-center gap-2 py-2.5 px-3 rounded-xl border text-xs font-bold transition-all ${
                  type === "fuel"
                    ? "bg-gradient-to-r from-amber-500 to-orange-500 text-slate-950 border-amber-500 shadow-md shadow-amber-500/20"
                    : "bg-slate-950 border-slate-800 text-slate-400 hover:text-white"
                }`}
              >
                <Fuel size={15} />
                <span>Akaryakıt</span>
              </button>
              <button
                type="button"
                onClick={() => setType("market")}
                className={`flex items-center justify-center gap-2 py-2.5 px-3 rounded-xl border text-xs font-bold transition-all ${
                  type === "market"
                    ? "bg-gradient-to-r from-blue-500 to-cyan-500 text-white border-blue-500 shadow-md shadow-blue-500/20"
                    : "bg-slate-950 border-slate-800 text-slate-400 hover:text-white"
                }`}
              >
                <ShoppingBag size={15} />
                <span>Market</span>
              </button>
              <button
                type="button"
                onClick={() => setType("other")}
                className={`flex items-center justify-center gap-2 py-2.5 px-3 rounded-xl border text-xs font-bold transition-all ${
                  type === "other"
                    ? "bg-gradient-to-r from-purple-500 to-indigo-500 text-white border-purple-500 shadow-md shadow-purple-500/20"
                    : "bg-slate-950 border-slate-800 text-slate-400 hover:text-white"
                }`}
              >
                <MoreHorizontal size={15} />
                <span>Diğer</span>
              </button>
            </div>
          </div>

          {/* Payment Method */}
          <div>
            <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1.5">
              Ödeme Kanalı
            </label>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {[
                { id: "cash", label: "Nakit", icon: Wallet, activeClass: "from-emerald-500 to-teal-500 text-slate-950 shadow-emerald-500/20" },
                { id: "credit_card", label: "POS / Kart", icon: CreditCard, activeClass: "from-sky-500 to-blue-500 text-white shadow-sky-500/20" },
                { id: "eft", label: "EFT / Banka", icon: Building, activeClass: "from-indigo-500 to-purple-500 text-white shadow-indigo-500/20" },
                { id: "veresiye", label: "Veresiye", icon: Receipt, activeClass: "from-amber-500 to-orange-500 text-slate-950 shadow-amber-500/20" },
              ].map((pm) => {
                const Icon = pm.icon;
                const isSelected = paymentMethod === pm.id;
                return (
                  <button
                    key={pm.id}
                    type="button"
                    onClick={() => setPaymentMethod(pm.id as PaymentMethod)}
                    className={`py-2 px-2.5 rounded-xl border text-xs font-bold transition-all flex items-center justify-center gap-1.5 ${
                      isSelected
                        ? `bg-gradient-to-r ${pm.activeClass} border-transparent shadow-md`
                        : "bg-slate-950 border-slate-800 text-slate-400 hover:text-white"
                    }`}
                  >
                    <Icon size={13} />
                    <span>{pm.label}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Amount & Liters */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1.5">
                Satış Tutarı (TL) *
              </label>
              <input
                type="number"
                step="0.01"
                min="0.01"
                required
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="Örn: 850.00"
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2.5 text-sm text-slate-200 font-mono font-medium focus:outline-none focus:border-amber-500 transition"
              />
            </div>

            {type === "fuel" && (
              <div>
                <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1.5">
                  Litre Miktarı *
                </label>
                <input
                  type="number"
                  step="0.001"
                  min="0.001"
                  required
                  value={liters}
                  onChange={(e) => setLiters(e.target.value)}
                  placeholder="Örn: 20.500"
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2.5 text-sm text-slate-200 font-mono font-medium focus:outline-none focus:border-amber-500 transition"
                />
              </div>
            )}
          </div>

          {type === "fuel" && (
            <div>
              <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1.5">
                Yakıt Ürün Türü *
              </label>
              <select
                value={fuelType}
                onChange={(e) => setFuelType(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2.5 text-sm text-slate-200 focus:outline-none focus:border-amber-500 transition"
              >
                <option value="Motorin (Dizel)">Motorin (Dizel)</option>
                <option value="Kurşunsuz 95 (Benzin)">Kurşunsuz 95 (Benzin)</option>
                <option value="Kurşunsuz 98 (V-Max)">Kurşunsuz 98 (V-Max)</option>
                <option value="Otogaz (LPG)">Otogaz (LPG)</option>
              </select>
            </div>
          )}

          <div>
            <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1.5">
              Plaka / Açıklama (Opsiyonel)
            </label>
            <input
              type="text"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Örn: 34 VR 1234 - Pompa 2"
              className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2.5 text-sm text-slate-200 focus:outline-none focus:border-amber-500 transition"
            />
          </div>

          <div className="pt-3 flex items-center justify-end gap-3">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2.5 text-sm text-slate-400 hover:text-slate-200 rounded-xl hover:bg-slate-800 transition"
            >
              Vazgeç
            </button>
            <button
              type="submit"
              disabled={loading || activeShifts.length === 0}
              className="px-5 py-2.5 text-sm font-bold bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-400 hover:to-orange-400 text-slate-950 rounded-xl shadow-lg shadow-amber-500/25 transition flex items-center gap-2 disabled:opacity-50 active:scale-95"
            >
              {loading && <Loader2 size={16} className="animate-spin text-slate-950" />}
              <span>İşlemi Sisteme Kaydet</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
