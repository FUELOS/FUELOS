/**
 * FuelOS — Yeni Vardiya Aç Modal (Pompa Bazlı + Avatar Sistemi)
 * Pompa seçimi → İşçi adı → Avatar (fotoğraf / erkek / kadın / yok) → Açılış kasası
 */

import React, { useState, useEffect, useRef } from "react";
import { apiClient } from "@/lib/api";
import { Station } from "@/types";
import { useAuth } from "@/context/AuthContext";
import {
  X, Play, AlertCircle, Loader2, Building2, Wallet,
  Cpu, User, Upload, UserCircle, ChevronDown,
} from "lucide-react";

interface Pump {
  id: string;
  pump_number: number;
  label: string;
  fuel_types: string;
}

interface OpenShiftModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

// ── Avatar seçenekleri ────────────────────────────────────────────────
const MALE_AVATARS = [
  { id: "m1", emoji: "👨", label: "Erkek 1", color: "bg-blue-100 dark:bg-blue-900/40" },
  { id: "m2", emoji: "👨‍🦱", label: "Erkek 2", color: "bg-indigo-100 dark:bg-indigo-900/40" },
  { id: "m3", emoji: "👨‍🦳", label: "Erkek 3", color: "bg-sky-100 dark:bg-sky-900/40" },
  { id: "m4", emoji: "🧔", label: "Erkek 4", color: "bg-cyan-100 dark:bg-cyan-900/40" },
];
const FEMALE_AVATARS = [
  { id: "f1", emoji: "👩", label: "Kadın 1", color: "bg-rose-100 dark:bg-rose-900/40" },
  { id: "f2", emoji: "👩‍🦱", label: "Kadın 2", color: "bg-pink-100 dark:bg-pink-900/40" },
  { id: "f3", emoji: "👩‍🦳", label: "Kadın 3", color: "bg-fuchsia-100 dark:bg-fuchsia-900/40" },
  { id: "f4", emoji: "👩‍🦰", label: "Kadın 4", color: "bg-purple-100 dark:bg-purple-900/40" },
];

type AvatarMode = "none" | "male" | "female" | "photo";

export const OpenShiftModal: React.FC<OpenShiftModalProps> = ({ isOpen, onClose, onSuccess }) => {
  const { user } = useAuth();
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Form state
  const [stations, setStations] = useState<Station[]>([]);
  const [selectedStationId, setSelectedStationId] = useState("");
  const [pumps, setPumps] = useState<Pump[]>([]);
  const [selectedPumpId, setSelectedPumpId] = useState("");
  const [workerName, setWorkerName] = useState("");
  const [openingCash, setOpeningCash] = useState("0");
  const [notes, setNotes] = useState("");

  // Avatar state
  const [avatarMode, setAvatarMode] = useState<AvatarMode>("none");
  const [selectedAvatarId, setSelectedAvatarId] = useState("");
  const [photoDataUrl, setPhotoDataUrl] = useState<string | null>(null);

  // UI state
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [step, setStep] = useState<1 | 2>(1); // Adım 1: Pompa/İstasyon, Adım 2: İşçi/Avatar

  // ── Fetch istasyonlar ────────────────────────────────────────────
  useEffect(() => {
    if (!isOpen) return;
    setError(null);
    setStep(1);
    setPumps([]);
    setSelectedPumpId("");
    setWorkerName("");
    setAvatarMode("none");
    setSelectedAvatarId("");
    setPhotoDataUrl(null);

    apiClient.get<Station[]>("/stations").then((res) => {
      setStations(res.data);
      const init = user?.station_id || (res.data.length > 0 ? res.data[0].id : "");
      setSelectedStationId(init);
    }).catch(console.error);
  }, [isOpen, user]);

  // ── Fetch pompalar (istasyon değişince) ──────────────────────────
  useEffect(() => {
    if (!selectedStationId) { setPumps([]); return; }
    apiClient.get<Pump[]>(`/pumps/station/${selectedStationId}`)
      .then((res) => {
        setPumps(res.data);
        setSelectedPumpId(res.data.length > 0 ? res.data[0].id : "");
      })
      .catch(() => setPumps([]));
  }, [selectedStationId]);

  if (!isOpen) return null;

  // ── Avatar değeri hesapla ────────────────────────────────────────
  const getAvatarValue = (): string | null => {
    if (avatarMode === "photo" && photoDataUrl) return photoDataUrl;
    if ((avatarMode === "male" || avatarMode === "female") && selectedAvatarId) return selectedAvatarId;
    return null;
  };

  // ── Fotoğraf yükle ───────────────────────────────────────────────
  const handlePhotoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => setPhotoDataUrl(ev.target?.result as string);
    reader.readAsDataURL(file);
  };

  // ── Submit ───────────────────────────────────────────────────────
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedStationId) { setError("Lütfen bir istasyon seçin."); return; }
    if (!workerName.trim()) { setError("İşçi adı zorunludur."); return; }

    try {
      setLoading(true);
      setError(null);
      await apiClient.post("/shifts/open", {
        station_id: selectedStationId,
        pump_id: selectedPumpId || null,
        worker_name: workerName.trim(),
        worker_avatar: getAvatarValue(),
        opening_cash: parseFloat(openingCash) || 0,
        notes: notes.trim() || null,
      });
      onSuccess();
      onClose();
    } catch (err: any) {
      setError(err.response?.data?.detail || "Vardiya açılırken bir hata oluştu");
    } finally {
      setLoading(false);
    }
  };

  // ── Pompa yoksa uyarı ────────────────────────────────────────────
  const noPumps = pumps.length === 0 && selectedStationId;

  return (
    <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-white dark:bg-[#0f172a] border border-slate-200 dark:border-slate-700 rounded-3xl w-full max-w-lg overflow-hidden shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-slate-100 dark:border-slate-800 bg-gradient-to-r from-emerald-50 to-teal-50 dark:from-emerald-950/30 dark:to-teal-950/30">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-emerald-600 text-white flex items-center justify-center shadow-lg shadow-emerald-600/30">
              <Play size={18} className="fill-white ml-0.5" />
            </div>
            <div>
              <h3 className="font-black text-lg text-slate-900 dark:text-white">Yeni Vardiya Başlat</h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Adım {step}/2 — {step === 1 ? "Pompa & İstasyon" : "İşçi & Avatar"}
              </p>
            </div>
          </div>
          <button onClick={onClose} className="w-8 h-8 rounded-xl bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-slate-500 hover:text-slate-800 dark:hover:text-white transition">
            <X size={16} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 space-y-4 max-h-[80vh] overflow-y-auto">
          {error && (
            <div className="p-3.5 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800/40 rounded-2xl text-red-600 dark:text-red-400 text-xs flex items-start gap-2.5">
              <AlertCircle size={15} className="shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          {/* ── ADIM 1: İstasyon + Pompa ── */}
          {step === 1 && (
            <>
              {/* İstasyon */}
              <div>
                <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1.5 flex items-center gap-1.5">
                  <Building2 size={13} className="text-blue-500" />
                  İstasyon
                </label>
                <div className="relative">
                  <select
                    value={selectedStationId}
                    onChange={(e) => setSelectedStationId(e.target.value)}
                    disabled={Boolean(user?.station_id && user?.role !== "super_admin")}
                    className="w-full bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 rounded-2xl px-4 py-3 text-sm text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-emerald-500 transition appearance-none pr-10 disabled:opacity-60"
                  >
                    {stations.map((st) => (
                      <option key={st.id} value={st.id} className="bg-white dark:bg-slate-900">
                        {st.name} — {st.city} [{st.code}]
                      </option>
                    ))}
                  </select>
                  <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                </div>
              </div>

              {/* Pompa Seçimi */}
              <div>
                <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1.5 flex items-center gap-1.5">
                  <Cpu size={13} className="text-emerald-500" />
                  Pompa Seç
                </label>

                {noPumps ? (
                  <div className="p-4 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800/40 rounded-2xl text-amber-700 dark:text-amber-400 text-xs flex items-start gap-2">
                    <AlertCircle size={14} className="shrink-0 mt-0.5" />
                    <div>
                      <div className="font-bold">Bu istasyonda pompa tanımlı değil.</div>
                      <div className="mt-0.5 text-amber-600 dark:text-amber-500">Pompaları eklemek için İstasyonlar sayfasına gidin.</div>
                    </div>
                  </div>
                ) : (
                  <div className="grid grid-cols-2 gap-2">
                    {pumps.map((pump) => (
                      <button
                        key={pump.id}
                        type="button"
                        onClick={() => setSelectedPumpId(pump.id)}
                        className={`p-3.5 rounded-2xl border text-left transition ${
                          selectedPumpId === pump.id
                            ? "border-emerald-500 bg-emerald-50 dark:bg-emerald-900/20"
                            : "border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/60 hover:border-slate-300"
                        }`}
                      >
                        <div className={`text-xs font-black ${selectedPumpId === pump.id ? "text-emerald-700 dark:text-emerald-400" : "text-slate-700 dark:text-slate-300"}`}>
                          {pump.label}
                        </div>
                        <div className="text-[10px] text-slate-400 mt-0.5">{pump.fuel_types}</div>
                      </button>
                    ))}
                    {/* Pompa belirtme seçeneği */}
                    <button
                      type="button"
                      onClick={() => setSelectedPumpId("")}
                      className={`p-3.5 rounded-2xl border text-left transition ${
                        selectedPumpId === ""
                          ? "border-slate-500 bg-slate-100 dark:bg-slate-800"
                          : "border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/60 hover:border-slate-300"
                      }`}
                    >
                      <div className="text-xs font-black text-slate-500 dark:text-slate-400">Pompa Belirtme</div>
                      <div className="text-[10px] text-slate-400 mt-0.5">Genel vardiya</div>
                    </button>
                  </div>
                )}
              </div>

              {/* Açılış Kasası */}
              <div>
                <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1.5 flex items-center gap-1.5">
                  <Wallet size={13} className="text-emerald-500" />
                  Açılış Kasa Nakit (₺)
                </label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={openingCash}
                  onChange={(e) => setOpeningCash(e.target.value)}
                  placeholder="0.00"
                  className="w-full bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 rounded-2xl px-4 py-3 text-sm text-slate-800 dark:text-slate-200 font-mono focus:outline-none focus:ring-2 focus:ring-emerald-500 transition"
                />
              </div>

              <button
                type="button"
                onClick={() => setStep(2)}
                className="w-full py-3.5 rounded-2xl bg-emerald-600 hover:bg-emerald-700 text-white font-black flex items-center justify-center gap-2 shadow-lg shadow-emerald-600/30 transition active:scale-95"
              >
                İşçi Bilgisi →
              </button>
            </>
          )}

          {/* ── ADIM 2: İşçi Adı + Avatar ── */}
          {step === 2 && (
            <>
              {/* İşçi Adı */}
              <div>
                <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1.5 flex items-center gap-1.5">
                  <User size={13} className="text-blue-500" />
                  İşçi Adı Soyadı *
                </label>
                <input
                  type="text"
                  required
                  value={workerName}
                  onChange={(e) => setWorkerName(e.target.value)}
                  placeholder="Örn: Ali Yılmaz"
                  className="w-full bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 rounded-2xl px-4 py-3 text-sm text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500 transition"
                  autoFocus
                />
              </div>

              {/* Avatar Mod Seçimi */}
              <div>
                <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-2">
                  Profil Görseli
                </label>
                <div className="grid grid-cols-4 gap-2">
                  {(["none", "male", "female", "photo"] as AvatarMode[]).map((mode) => {
                    const labels = { none: "Yok", male: "Erkek", female: "Kadın", photo: "Fotoğraf" };
                    const icons = { none: "⬜", male: "👨", female: "👩", photo: "📷" };
                    return (
                      <button
                        key={mode}
                        type="button"
                        onClick={() => { setAvatarMode(mode); setSelectedAvatarId(""); setPhotoDataUrl(null); }}
                        className={`p-2.5 rounded-2xl border text-center transition ${
                          avatarMode === mode
                            ? "border-blue-500 bg-blue-50 dark:bg-blue-900/20"
                            : "border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/60"
                        }`}
                      >
                        <div className="text-xl">{icons[mode]}</div>
                        <div className={`text-[10px] font-bold mt-0.5 ${avatarMode === mode ? "text-blue-600 dark:text-blue-400" : "text-slate-500"}`}>
                          {labels[mode]}
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Erkek Avatarları */}
              {avatarMode === "male" && (
                <div className="grid grid-cols-4 gap-2">
                  {MALE_AVATARS.map((av) => (
                    <button
                      key={av.id}
                      type="button"
                      onClick={() => setSelectedAvatarId(av.id)}
                      className={`p-3 rounded-2xl border text-center transition ${
                        selectedAvatarId === av.id
                          ? "border-blue-500 bg-blue-50 dark:bg-blue-900/20"
                          : `border-slate-200 dark:border-slate-700 ${av.color}`
                      }`}
                    >
                      <div className="text-2xl">{av.emoji}</div>
                    </button>
                  ))}
                </div>
              )}

              {/* Kadın Avatarları */}
              {avatarMode === "female" && (
                <div className="grid grid-cols-4 gap-2">
                  {FEMALE_AVATARS.map((av) => (
                    <button
                      key={av.id}
                      type="button"
                      onClick={() => setSelectedAvatarId(av.id)}
                      className={`p-3 rounded-2xl border text-center transition ${
                        selectedAvatarId === av.id
                          ? "border-pink-500 bg-pink-50 dark:bg-pink-900/20"
                          : `border-slate-200 dark:border-slate-700 ${av.color}`
                      }`}
                    >
                      <div className="text-2xl">{av.emoji}</div>
                    </button>
                  ))}
                </div>
              )}

              {/* Fotoğraf Yükle */}
              {avatarMode === "photo" && (
                <div className="space-y-3">
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    onChange={handlePhotoChange}
                    className="hidden"
                  />
                  {photoDataUrl ? (
                    <div className="flex items-center gap-3">
                      <img
                        src={photoDataUrl}
                        alt="Profil"
                        className="w-16 h-16 rounded-2xl object-cover border-2 border-blue-500"
                      />
                      <button
                        type="button"
                        onClick={() => { setPhotoDataUrl(null); fileInputRef.current?.click(); }}
                        className="text-xs text-blue-600 dark:text-blue-400 font-bold underline"
                      >
                        Değiştir
                      </button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      className="w-full py-4 rounded-2xl border-2 border-dashed border-slate-300 dark:border-slate-600 flex items-center justify-center gap-2 text-slate-500 dark:text-slate-400 hover:border-blue-400 hover:text-blue-600 transition"
                    >
                      <Upload size={18} />
                      <span className="text-sm font-bold">Fotoğraf Seç (JPG/PNG)</span>
                    </button>
                  )}
                </div>
              )}

              {/* Önizleme */}
              {(workerName || avatarMode !== "none") && (
                <div className="flex items-center gap-3 p-3.5 bg-slate-50 dark:bg-slate-800/60 rounded-2xl border border-slate-200 dark:border-slate-700">
                  <div className="w-12 h-12 rounded-2xl bg-white dark:bg-slate-700 border border-slate-200 dark:border-slate-600 flex items-center justify-center overflow-hidden shrink-0">
                    {avatarMode === "photo" && photoDataUrl ? (
                      <img src={photoDataUrl} alt="" className="w-full h-full object-cover" />
                    ) : avatarMode === "male" && selectedAvatarId ? (
                      <span className="text-2xl">{MALE_AVATARS.find(a => a.id === selectedAvatarId)?.emoji || "👨"}</span>
                    ) : avatarMode === "female" && selectedAvatarId ? (
                      <span className="text-2xl">{FEMALE_AVATARS.find(a => a.id === selectedAvatarId)?.emoji || "👩"}</span>
                    ) : (
                      <UserCircle size={28} className="text-slate-400" />
                    )}
                  </div>
                  <div>
                    <div className="text-sm font-black text-slate-900 dark:text-white">{workerName || "İşçi Adı"}</div>
                    <div className="text-xs text-slate-400 mt-0.5">
                      {pumps.find(p => p.id === selectedPumpId)?.label || "Genel Vardiya"}
                    </div>
                  </div>
                </div>
              )}

              {/* Vardiya Notu */}
              <div>
                <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1.5">
                  Vardiya Notu (Opsiyonel)
                </label>
                <textarea
                  rows={2}
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Örn: Sabah vardiyası, kasa devri..."
                  className="w-full bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 rounded-2xl px-4 py-3 text-sm text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-emerald-500 transition resize-none"
                />
              </div>

              {/* Actions */}
              <div className="flex gap-3 pt-1">
                <button
                  type="button"
                  onClick={() => setStep(1)}
                  className="px-4 py-3 rounded-2xl border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400 text-sm font-bold hover:bg-slate-50 transition"
                >
                  ← Geri
                </button>
                <button
                  type="submit"
                  disabled={loading || !workerName.trim()}
                  className="flex-1 py-3.5 rounded-2xl bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white font-black flex items-center justify-center gap-2 shadow-lg shadow-emerald-600/30 transition active:scale-95"
                >
                  {loading ? <Loader2 size={16} className="animate-spin" /> : <Play size={16} className="fill-white" />}
                  <span>{loading ? "Açılıyor..." : "Vardiyayı Başlat"}</span>
                </button>
              </div>
            </>
          )}
        </form>
      </div>
    </div>
  );
};
