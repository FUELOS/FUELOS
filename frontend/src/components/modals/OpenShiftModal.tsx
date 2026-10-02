/**
 * FuelOS — Yeni Vardiya Başlat Modal
 * - Personel / İşçi Adı & Avatar (Fotoğraf / Erkek / Kadın / Yok)
 * - Otomatik Kapanış Süresi (Manuel / 8 Saatlik / 12 Saatlik / Özel Saat)
 * - Opsiyonel Pompa Seçimi (Tüm pompalar / Sahada serbest işçi)
 * - Personele Verilen Bozuk Para Avansı (Zorunlu değil, varsayılan 0 TL)
 */

import React, { useState, useEffect, useRef } from "react";
import { apiClient } from "@/lib/api";
import { Station } from "@/types";
import { useAuth } from "@/context/AuthContext";
import {
  X,
  Play,
  AlertCircle,
  Loader2,
  Building2,
  Coins,
  Cpu,
  User,
  Upload,
  UserCircle,
  ChevronDown,
  Clock,
  Timer,
  CheckCircle2,
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
type DurationMode = "manual" | "8hours" | "12hours" | "custom";

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

  // Süre / Otomatik kapanış state
  const [durationMode, setDurationMode] = useState<DurationMode>("manual");
  const [customEndTime, setCustomEndTime] = useState("");

  // Avatar state
  const [avatarMode, setAvatarMode] = useState<AvatarMode>("male");
  const [selectedAvatarId, setSelectedAvatarId] = useState("m1");
  const [photoDataUrl, setPhotoDataUrl] = useState<string | null>(null);

  // UI state
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [step, setStep] = useState<1 | 2>(1); // Adım 1: İstasyon & Süre & Avans, Adım 2: İşçi & Avatar

  // ── Fetch istasyonlar ────────────────────────────────────────────
  useEffect(() => {
    if (!isOpen) return;
    setError(null);
    setStep(1);
    setPumps([]);
    setSelectedPumpId("");
    setWorkerName("");
    setOpeningCash("0");
    setDurationMode("manual");
    setCustomEndTime("");
    setAvatarMode("male");
    setSelectedAvatarId("m1");
    setPhotoDataUrl(null);

    apiClient
      .get<Station[]>("/stations")
      .then((res) => {
        setStations(res.data);
        const init = user?.station_id || (res.data.length > 0 ? res.data[0].id : "");
        setSelectedStationId(init);
      })
      .catch(console.error);
  }, [isOpen, user]);

  // ── Fetch pompalar (istasyon değişince) ──────────────────────────
  useEffect(() => {
    if (!selectedStationId) {
      setPumps([]);
      return;
    }
    apiClient
      .get<Pump[]>(`/pumps/station/${selectedStationId}`)
      .then((res) => {
        setPumps(res.data);
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

  // ── Planlanan Bitiş Zamanı Hesapla ───────────────────────────────
  const calculatePlannedEndTime = (): string | null => {
    const now = new Date();
    if (durationMode === "8hours") {
      return new Date(now.getTime() + 8 * 60 * 60 * 1000).toISOString();
    }
    if (durationMode === "12hours") {
      return new Date(now.getTime() + 12 * 60 * 60 * 1000).toISOString();
    }
    if (durationMode === "custom" && customEndTime) {
      // Bugünün seçilen saati
      const [hours, minutes] = customEndTime.split(":").map(Number);
      const target = new Date();
      target.setHours(hours, minutes, 0, 0);
      if (target <= now) {
        // Eğer seçilen saat geçmişse yarına planla
        target.setDate(target.getDate() + 1);
      }
      return target.toISOString();
    }
    return null;
  };

  // ── Submit ───────────────────────────────────────────────────────
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedStationId) {
      setError("Lütfen bir istasyon seçin.");
      return;
    }
    if (!workerName.trim()) {
      setError("İşçi adı soyadı zorunludur.");
      return;
    }

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
        planned_end_time: calculatePlannedEndTime(),
      });
      onSuccess();
      onClose();
    } catch (err: any) {
      setError(err.response?.data?.detail || "Vardiya açılırken bir hata oluştu");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-white dark:bg-[#0f172a] border border-slate-200 dark:border-slate-800 rounded-3xl w-full max-w-lg overflow-hidden shadow-2xl animate-in fade-in zoom-in-95 duration-150">
        {/* Modal Başlığı */}
        <div className="flex items-center justify-between p-5 border-b border-slate-100 dark:border-slate-800 bg-gradient-to-r from-emerald-500/10 to-teal-500/10">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-emerald-600 text-white flex items-center justify-center shadow-lg shadow-emerald-600/30">
              <Play size={18} className="fill-white ml-0.5" />
            </div>
            <div>
              <h3 className="font-black text-lg text-slate-900 dark:text-white">Yeni Vardiya Başlat</h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Adım {step}/2 — {step === 1 ? "İstasyon & Süre & Avans" : "İşçi Kartı & Avatar"}
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

          {/* ══════════ ADIM 1: İSTASYON, OTOMATİK SÜRE & AVANS ══════════ */}
          {step === 1 && (
            <>
              {/* İstasyon Seçimi */}
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
                    className="w-full bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 rounded-2xl px-4 py-3 text-sm text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-emerald-500 transition appearance-none pr-10 disabled:opacity-60 font-semibold"
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

              {/* Vardiya Süresi ve Otomatik Kapanış Ayarı (Sadık Hoca Özelliği) */}
              <div>
                <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                  <Timer size={13} className="text-purple-500" />
                  Vardiya Kapanış Modu (Otomasyon Süresi)
                </label>
                <div className="grid grid-cols-2 gap-2">
                  {[
                    { mode: "manual", label: "Manuel Kapanış", desc: "Müdür istediğinde kapatır", icon: Clock },
                    { mode: "8hours", label: "8 Saatlik Standart", desc: "Süre bitince otomatik uyarı", icon: Timer },
                    { mode: "12hours", label: "12 Saatlik Vardiya", desc: "Gece / uzun çalışma", icon: Timer },
                    { mode: "custom", label: "Özel Bitiş Saati", desc: "Belirli bir saatte sonlandır", icon: Clock },
                  ].map(({ mode, label, desc, icon: Icon }) => (
                    <button
                      key={mode}
                      type="button"
                      onClick={() => setDurationMode(mode as DurationMode)}
                      className={`p-3 rounded-2xl border text-left transition flex items-start gap-2.5 ${
                        durationMode === mode
                          ? "border-purple-500 bg-purple-50/80 dark:bg-purple-950/30 text-purple-700 dark:text-purple-300 shadow-sm"
                          : "border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/60 hover:border-slate-300"
                      }`}
                    >
                      <Icon size={16} className={durationMode === mode ? "text-purple-600 mt-0.5" : "text-slate-400 mt-0.5"} />
                      <div>
                        <div className="text-xs font-black">{label}</div>
                        <div className="text-[10px] text-slate-400 mt-0.5">{desc}</div>
                      </div>
                    </button>
                  ))}
                </div>

                {/* Özel saat seçimi açıksa */}
                {durationMode === "custom" && (
                  <div className="mt-2.5 p-3 rounded-2xl bg-purple-50/50 dark:bg-purple-950/20 border border-purple-200 dark:border-purple-800/50 flex items-center gap-3">
                    <span className="text-xs font-bold text-purple-700 dark:text-purple-300">Bitiş Saati:</span>
                    <input
                      type="time"
                      required={durationMode === "custom"}
                      value={customEndTime}
                      onChange={(e) => setCustomEndTime(e.target.value)}
                      className="bg-white dark:bg-slate-900 border border-purple-300 dark:border-purple-700 rounded-xl px-3 py-1.5 text-sm font-mono font-bold focus:outline-none focus:ring-2 focus:ring-purple-500 text-slate-800 dark:text-slate-200"
                    />
                  </div>
                )}
              </div>

              {/* Pompa Ön Seçimi (Artık Zorunlu Değil / Gezici Personel) */}
              <div>
                <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1.5 flex items-center justify-between">
                  <span className="flex items-center gap-1.5">
                    <Cpu size={13} className="text-emerald-500" />
                    Görevli Olduğu Pompa (Opsiyonel)
                  </span>
                  <span className="text-[10px] text-slate-400 font-normal lowercase">Kart tüm pompalarda geçerlidir</span>
                </label>

                <div className="grid grid-cols-3 sm:grid-cols-5 gap-1.5">
                  <button
                    type="button"
                    onClick={() => setSelectedPumpId("")}
                    className={`p-2.5 rounded-2xl border text-center transition ${
                      selectedPumpId === ""
                        ? "border-emerald-500 bg-emerald-50 dark:bg-emerald-950/30 text-emerald-700 dark:text-emerald-300 font-black shadow-sm"
                        : "border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/60 text-slate-500 hover:border-slate-300 font-semibold"
                    }`}
                  >
                    <div className="text-xs">Tüm Pompalar</div>
                    <div className="text-[9px] text-slate-400">Gezici</div>
                  </button>

                  {pumps.map((pump) => (
                    <button
                      key={pump.id}
                      type="button"
                      onClick={() => setSelectedPumpId(pump.id)}
                      className={`p-2.5 rounded-2xl border text-center transition ${
                        selectedPumpId === pump.id
                          ? "border-emerald-500 bg-emerald-50 dark:bg-emerald-950/30 text-emerald-700 dark:text-emerald-300 font-black shadow-sm"
                          : "border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/60 text-slate-700 dark:text-slate-300 hover:border-slate-300 font-semibold"
                      }`}
                    >
                      <div className="text-xs">{pump.label}</div>
                      <div className="text-[9px] text-slate-400">Sabit</div>
                    </button>
                  ))}
                </div>
              </div>

              {/* Bozuk Para Avansı (ZORUNLU DEĞİL - Varsayılan 0 TL) */}
              <div>
                <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1 flex items-center justify-between">
                  <span className="flex items-center gap-1.5">
                    <Coins size={13} className="text-amber-500" />
                    Personele Verilen Bozuk Para Avansı (Opsiyonel)
                  </span>
                  <span className="text-[10px] text-slate-400 font-normal">Varsayılan: 0 ₺</span>
                </label>
                <div className="relative">
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={openingCash}
                    onChange={(e) => setOpeningCash(e.target.value)}
                    placeholder="0.00"
                    className="w-full bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 rounded-2xl px-4 py-3 text-sm text-slate-800 dark:text-slate-200 font-mono font-bold focus:outline-none focus:ring-2 focus:ring-emerald-500 transition pr-10"
                  />
                  <span className="absolute right-4 top-1/2 -translate-y-1/2 font-bold text-slate-400 text-sm">₺</span>
                </div>
                <p className="text-[11px] text-slate-400 mt-1">
                  İşçiye sabah para üstü verebilmesi için avans nakit verildiyse giriniz (yoksa 0 kalabilir).
                </p>
              </div>

              {/* İleri Butonu */}
              <button
                type="button"
                onClick={() => setStep(2)}
                className="w-full py-3.5 rounded-2xl bg-emerald-600 hover:bg-emerald-700 text-white font-black flex items-center justify-center gap-2 shadow-lg shadow-emerald-600/30 transition active:scale-95 text-sm"
              >
                <span>İşçi Bilgileri & Kartı Tanımla →</span>
              </button>
            </>
          )}

          {/* ══════════ ADIM 2: İŞÇİ ADI & AVATAR ══════════ */}
          {step === 2 && (
            <>
              {/* İşçi Adı Soyadı */}
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
                  placeholder="Örn: Mehmet Yılmaz"
                  className="w-full bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 rounded-2xl px-4 py-3 text-sm text-slate-800 dark:text-slate-200 font-bold focus:outline-none focus:ring-2 focus:ring-blue-500 transition"
                  autoFocus
                />
              </div>

              {/* Avatar Mod Seçimi */}
              <div>
                <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-2">
                  Profil Görseli / Kart İkonu
                </label>
                <div className="grid grid-cols-4 gap-2">
                  {(["male", "female", "photo", "none"] as AvatarMode[]).map((mode) => {
                    const labels = { male: "Erkek Avatar", female: "Kadın Avatar", photo: "Fotoğraf", none: "Profilsiz" };
                    const icons = { male: "👨", female: "👩", photo: "📷", none: "⬜" };
                    return (
                      <button
                        key={mode}
                        type="button"
                        onClick={() => {
                          setAvatarMode(mode);
                          if (mode === "male") setSelectedAvatarId("m1");
                          else if (mode === "female") setSelectedAvatarId("f1");
                          else {
                            setSelectedAvatarId("");
                            setPhotoDataUrl(null);
                          }
                        }}
                        className={`p-2.5 rounded-2xl border text-center transition ${
                          avatarMode === mode
                            ? "border-blue-500 bg-blue-50 dark:bg-blue-900/20 shadow-sm"
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
                          ? "border-blue-500 bg-blue-50 dark:bg-blue-900/30 scale-105 shadow-sm"
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
                          ? "border-pink-500 bg-pink-50 dark:bg-pink-900/30 scale-105 shadow-sm"
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
                        className="w-16 h-16 rounded-2xl object-cover border-2 border-blue-500 shadow-md"
                      />
                      <button
                        type="button"
                        onClick={() => {
                          setPhotoDataUrl(null);
                          fileInputRef.current?.click();
                        }}
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
                      <span className="text-sm font-bold">Fotoğraf Yükle (JPG / PNG)</span>
                    </button>
                  )}
                </div>
              )}

              {/* Personel Kartı Canlı Önizleme */}
              <div className="p-4 bg-gradient-to-br from-blue-600 to-indigo-700 text-white rounded-2xl shadow-md flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 rounded-2xl bg-white/10 backdrop-blur-md border border-white/20 flex items-center justify-center overflow-hidden shrink-0">
                    {avatarMode === "photo" && photoDataUrl ? (
                      <img src={photoDataUrl} alt="" className="w-full h-full object-cover" />
                    ) : avatarMode === "male" && selectedAvatarId ? (
                      <span className="text-2xl">{MALE_AVATARS.find((a) => a.id === selectedAvatarId)?.emoji || "👨"}</span>
                    ) : avatarMode === "female" && selectedAvatarId ? (
                      <span className="text-2xl">{FEMALE_AVATARS.find((a) => a.id === selectedAvatarId)?.emoji || "👩"}</span>
                    ) : (
                      <UserCircle size={28} className="text-white/70" />
                    )}
                  </div>
                  <div>
                    <div className="text-xs text-blue-200 font-mono tracking-wider">RFID PERSONEL KARTI</div>
                    <div className="text-base font-black leading-tight mt-0.5">
                      {workerName || "İsimsiz Personel"}
                    </div>
                    <div className="text-[11px] text-blue-200 flex items-center gap-1.5 mt-0.5">
                      <span>{selectedPumpId ? pumps.find((p) => p.id === selectedPumpId)?.label : "Tüm Pompalar (Gezici)"}</span>
                      <span>·</span>
                      <span>{durationMode === "manual" ? "Süresiz" : durationMode === "8hours" ? "8 Saat" : durationMode === "12hours" ? "12 Saat" : customEndTime || "Özel Saat"}</span>
                    </div>
                  </div>
                </div>
                <div className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-pulse" />
              </div>

              {/* Vardiya Notu */}
              <div>
                <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1.5">
                  Vardiya Notu (Opsiyonel)
                </label>
                <textarea
                  rows={2}
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Örn: Sabah 08:00 vardiyası başlangıcı..."
                  className="w-full bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 rounded-2xl px-4 py-3 text-sm text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-emerald-500 transition resize-none"
                />
              </div>

              {/* Butonlar */}
              <div className="flex gap-3 pt-1">
                <button
                  type="button"
                  onClick={() => setStep(1)}
                  className="px-5 py-3 rounded-2xl border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400 text-sm font-bold hover:bg-slate-50 transition"
                >
                  ← Geri
                </button>
                <button
                  type="submit"
                  disabled={loading || !workerName.trim()}
                  className="flex-1 py-3.5 rounded-2xl bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white font-black flex items-center justify-center gap-2 shadow-lg shadow-emerald-600/30 transition active:scale-95 text-sm"
                >
                  {loading ? <Loader2 size={16} className="animate-spin" /> : <CheckCircle2 size={16} />}
                  <span>{loading ? "Vardiya Başlatılıyor..." : "Vardiyayı Onayla & Başlat"}</span>
                </button>
              </div>
            </>
          )}
        </form>
      </div>
    </div>
  );
};
