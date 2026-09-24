import React, { useState, useEffect } from "react";
import { apiClient } from "@/lib/api";
import { Station, User } from "@/types";
import { useAuth } from "@/context/AuthContext";
import { X, Play, AlertCircle, Loader2, UserCircle2, Building2, Wallet } from "lucide-react";

interface OpenShiftModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

export const OpenShiftModal: React.FC<OpenShiftModalProps> = ({ isOpen, onClose, onSuccess }) => {
  const { user } = useAuth();
  const [stations, setStations] = useState<Station[]>([]);
  const [selectedStationId, setSelectedStationId] = useState<string>("");
  const [cashiers, setCashiers] = useState<User[]>([]);
  const [selectedUserId, setSelectedUserId] = useState<string>("");
  const [openingCash, setOpeningCash] = useState<string>("0");
  const [notes, setNotes] = useState<string>("");
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      setError(null);
      // Fetch stations
      apiClient
        .get<Station[]>("/stations")
        .then((res) => {
          setStations(res.data);
          const initialStationId = user?.station_id || (res.data.length > 0 ? res.data[0].id : "");
          setSelectedStationId(initialStationId);
        })
        .catch((err) => {
          console.error("İstasyonlar yüklenemedi", err);
        });

      // Fetch users for cashier selection if manager or admin
      if (user?.role === "super_admin" || user?.role === "station_manager") {
        apiClient
          .get<User[]>("/users")
          .then((res) => {
            const activeCashiers = res.data.filter((u) => u.is_active);
            setCashiers(activeCashiers);
            setSelectedUserId(user.user_id); // Default to current user
          })
          .catch((err) => {
            console.error("Personeller yüklenemedi", err);
          });
      }
    }
  }, [isOpen, user]);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedStationId) {
      setError("Lütfen bir istasyon seçin");
      return;
    }

    try {
      setLoading(true);
      setError(null);
      await apiClient.post("/shifts/open", {
        station_id: selectedStationId,
        user_id: selectedUserId || undefined,
        opening_cash: parseFloat(openingCash) || 0,
        notes: notes.trim() || null,
      });
      onSuccess();
      onClose();
    } catch (err: any) {
      const msg = err.response?.data?.detail || "Vardiya açılırken bir hata oluştu";
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  const isManagerOrAdmin = user?.role === "super_admin" || user?.role === "station_manager";
  const filteredCashiers = cashiers.filter(
    (c) => user?.role === "super_admin" || !c.station_id || c.station_id === selectedStationId
  );

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-slate-900 border border-slate-800 rounded-3xl w-full max-w-md overflow-hidden shadow-2xl animate-in fade-in zoom-in-95 duration-150">
        {/* Material Elevated Header */}
        <div className="flex items-center justify-between p-5 border-b border-slate-800 bg-gradient-to-r from-emerald-900/30 to-teal-900/30">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-gradient-to-tr from-emerald-500 to-teal-500 text-slate-950 flex items-center justify-center shadow-lg shadow-emerald-500/25">
              <Play size={18} className="fill-slate-950 ml-0.5" />
            </div>
            <div>
              <h3 className="font-bold text-lg text-white">Yeni Vardiya Başlat</h3>
              <p className="text-xs text-slate-400">Kasa devri ve çalışma oturumu açılışı</p>
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

          {/* Station Selector */}
          <div>
            <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1.5 flex items-center gap-1.5">
              <Building2 size={14} className="text-amber-400" />
              <span>İstasyon</span>
            </label>
            <select
              value={selectedStationId}
              onChange={(e) => setSelectedStationId(e.target.value)}
              disabled={Boolean(user?.station_id && user?.role === "cashier")}
              className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2.5 text-sm text-slate-200 focus:outline-none focus:border-emerald-500 transition disabled:opacity-60"
            >
              {stations.map((st) => (
                <option key={st.id} value={st.id}>
                  {st.name} ({st.code}) - {st.city}
                </option>
              ))}
            </select>
          </div>

          {/* Cashier Assignment (for Manager & Admin) */}
          {isManagerOrAdmin && filteredCashiers.length > 0 && (
            <div>
              <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1.5 flex items-center gap-1.5">
                <UserCircle2 size={14} className="text-sky-400" />
                <span>Vardiyayı Açan Personel / Kasiyer</span>
              </label>
              <select
                value={selectedUserId}
                onChange={(e) => setSelectedUserId(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2.5 text-sm text-slate-200 focus:outline-none focus:border-emerald-500 transition"
              >
                <option value={user?.user_id}>Benim Adıma ({user?.full_name})</option>
                {filteredCashiers
                  .filter((c) => c.id !== user?.user_id)
                  .map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.full_name} ({c.email}) - {c.role === "cashier" ? "Kasiyer" : "Yönetici"}
                    </option>
                  ))}
              </select>
            </div>
          )}

          {/* Opening Cash Input */}
          <div>
            <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1.5 flex items-center gap-1.5">
              <Wallet size={14} className="text-emerald-400" />
              <span>Açılış Kasa Nakit Tutarı (TL) *</span>
            </label>
            <input
              type="number"
              step="0.01"
              min="0"
              required
              value={openingCash}
              onChange={(e) => setOpeningCash(e.target.value)}
              placeholder="0.00"
              className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2.5 text-sm text-slate-200 font-mono font-medium focus:outline-none focus:border-emerald-500 transition"
            />
            <p className="text-[11px] text-slate-500 mt-1">
              Kasada bulunan fiziki bozuk para ve nakit devir miktarı
            </p>
          </div>

          {/* Notes */}
          <div>
            <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1.5">
              Vardiya Notu (Opsiyonel)
            </label>
            <textarea
              rows={2}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Örn: 08:00 - 16:00 vardiyası kasa teslimi"
              className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2.5 text-sm text-slate-200 focus:outline-none focus:border-emerald-500 transition resize-none"
            />
          </div>

          {/* Actions */}
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
              disabled={loading}
              className="px-5 py-2.5 text-sm font-bold bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-400 hover:to-teal-500 text-slate-950 rounded-xl shadow-lg shadow-emerald-500/25 transition flex items-center gap-2 disabled:opacity-50 active:scale-95"
            >
              {loading && <Loader2 size={16} className="animate-spin text-slate-950" />}
              <span>Vardiyayı Başlat</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
