import React, { useState, useEffect } from "react";
import { apiClient } from "@/lib/api";
import { Station } from "@/types";
import { useAuth } from "@/context/AuthContext";
import { Building2, Plus, Loader2, RefreshCw, X, AlertCircle, MapPin, ChevronRight } from "lucide-react";

export const StationsPage: React.FC = () => {
  const { user } = useAuth();
  const [stations, setStations] = useState<Station[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [refreshing, setRefreshing] = useState<boolean>(false);

  // New station modal
  const [isModalOpen, setIsModalOpen] = useState<boolean>(false);
  const [name, setName] = useState<string>("");
  const [code, setCode] = useState<string>("");
  const [city, setCity] = useState<string>("");
  const [district, setDistrict] = useState<string>("");
  const [address, setAddress] = useState<string>("");
  const [modalLoading, setModalLoading] = useState<boolean>(false);
  const [modalError, setModalError] = useState<string | null>(null);

  const fetchStations = async () => {
    try {
      setRefreshing(true);
      const res = await apiClient.get<Station[]>("/stations");
      setStations(res.data);
    } catch (err) {
      console.error("İstasyonlar alınamadı", err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchStations();
  }, []);

  const handleCreateStation = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setModalLoading(true);
      setModalError(null);
      await apiClient.post("/stations", {
        name: name.trim(),
        code: code.trim().toUpperCase(),
        city: city.trim(),
        district: district.trim() || null,
        address: address.trim() || null,
      });
      setIsModalOpen(false);
      setName("");
      setCode("");
      setCity("");
      setDistrict("");
      setAddress("");
      fetchStations();
    } catch (err: any) {
      const msg = err.response?.data?.detail || "İstasyon oluşturulurken bir hata oluştu";
      setModalError(msg);
    } finally {
      setModalLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">
            <span>Operasyon</span>
            <ChevronRight size={12} />
            <span className="text-amber-500">Şube ve İstasyonlar</span>
          </div>
          <h1 className="text-2xl font-black text-slate-800 tracking-tight flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-zinc-900 flex items-center justify-center text-white shadow-md">
              <Building2 size={20} />
            </div>
            <span>Akaryakıt İstasyonları</span>
          </h1>
          <p className="text-xs text-slate-500 mt-1">
            Şirketinize bağlı fiziksel istasyonların lokasyon, kod ve durum dökümü
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={fetchStations}
            disabled={refreshing}
            className="p-2.5 rounded-2xl bg-white border border-slate-200 text-slate-600 hover:text-slate-900 hover:bg-slate-50 transition shadow-sm"
            title="Yenile"
          >
            <RefreshCw size={16} className={refreshing ? "animate-spin text-amber-500" : ""} />
          </button>

          {user?.role === "super_admin" && (
            <button
              onClick={() => setIsModalOpen(true)}
              className="px-4 py-2.5 rounded-2xl bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600 text-slate-950 text-xs font-black flex items-center gap-2 shadow-md shadow-amber-500/25 transition active:scale-95"
            >
              <Plus size={16} />
              <span>Yeni İstasyon Ekle</span>
            </button>
          )}
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center p-12 text-slate-400">
          <Loader2 size={36} className="animate-spin text-amber-500" />
        </div>
      ) : stations.length === 0 ? (
        <div className="p-10 text-center bg-white dark:bg-slate-900/90 border border-slate-100 dark:border-slate-800 rounded-3xl text-slate-500 dark:text-slate-400 text-sm shadow-sm">
          Henüz tanımlı bir istasyon bulunmuyor.
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 pt-3">
          {stations.map((st) => (
            <div
              key={st.id}
              className="bg-white dark:bg-slate-900/90 border border-slate-100 dark:border-slate-800 rounded-3xl p-6 space-y-4 shadow-md dark:shadow-xl shadow-slate-200/60 dark:shadow-slate-950/50 hover:shadow-xl transition duration-200 relative group"
            >
              <div className="flex items-start justify-between">
                <div>
                  <div className="font-black text-lg text-slate-800 dark:text-white group-hover:text-amber-500 transition">{st.name}</div>
                  <div className="text-xs font-mono font-bold text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-500/10 px-2 py-0.5 rounded-lg border border-amber-200 dark:border-amber-500/20 inline-block mt-1">
                    KOD: {st.code}
                  </div>
                </div>
                <span className="px-3 py-1 rounded-full text-xs font-bold bg-emerald-50 dark:bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-200/60 dark:border-emerald-500/20">
                  Aktif İstasyon
                </span>
              </div>

              <div className="pt-2 border-t border-slate-100 dark:border-slate-800 text-xs text-slate-600 dark:text-slate-300 space-y-1.5">
                <div className="flex items-center gap-2 text-slate-500 dark:text-slate-400">
                  <MapPin size={14} className="text-amber-500 shrink-0" />
                  <span>{st.city} {st.district ? `— ${st.district}` : ""}</span>
                </div>
                {st.address && (
                  <p className="text-slate-400 dark:text-slate-500 pl-5 text-[11px] leading-relaxed">
                    {st.address}
                  </p>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* New Station Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl w-full max-w-md overflow-hidden shadow-2xl animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between p-5 border-b border-slate-800 bg-gradient-to-r from-amber-900/30 to-orange-900/30">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-amber-500 to-orange-500 text-slate-950 flex items-center justify-center shadow-md">
                  <Building2 size={16} />
                </div>
                <h3 className="font-bold text-lg text-white">Yeni İstasyon Tanımla</h3>
              </div>
              <button
                onClick={() => setIsModalOpen(false)}
                className="text-slate-400 hover:text-slate-200 p-1 rounded-lg hover:bg-slate-800"
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleCreateStation} className="p-6 space-y-4">
              {modalError && (
                <div className="p-3.5 bg-red-500/10 border border-red-500/20 rounded-2xl text-red-400 text-xs flex items-start gap-2.5">
                  <AlertCircle size={16} className="shrink-0 mt-0.5" />
                  <span>{modalError}</span>
                </div>
              )}

              <div>
                <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1.5">
                  İstasyon Adı *
                </label>
                <input
                  type="text"
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Örn: İzmir Bornova İstasyonu"
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2.5 text-sm text-slate-200 focus:outline-none focus:border-amber-500 transition"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1.5">
                  İstasyon Kodu * (Benzersiz)
                </label>
                <input
                  type="text"
                  required
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                  placeholder="Örn: IST-003"
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2.5 text-sm text-slate-200 focus:outline-none focus:border-amber-500 transition uppercase font-mono"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1.5">
                    Şehir *
                  </label>
                  <input
                    type="text"
                    required
                    value={city}
                    onChange={(e) => setCity(e.target.value)}
                    placeholder="İzmir"
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2.5 text-sm text-slate-200 focus:outline-none focus:border-amber-500 transition"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1.5">
                    İlçe
                  </label>
                  <input
                    type="text"
                    value={district}
                    onChange={(e) => setDistrict(e.target.value)}
                    placeholder="Bornova"
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2.5 text-sm text-slate-200 focus:outline-none focus:border-amber-500 transition"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1.5">
                  Açık Adres
                </label>
                <textarea
                  rows={2}
                  value={address}
                  onChange={(e) => setAddress(e.target.value)}
                  placeholder="Cadde, bulvar ve numara"
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2.5 text-sm text-slate-200 focus:outline-none focus:border-amber-500 transition resize-none"
                />
              </div>

              <div className="pt-3 flex items-center justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2.5 text-sm text-slate-400 hover:text-slate-200"
                >
                  Vazgeç
                </button>
                <button
                  type="submit"
                  disabled={modalLoading}
                  className="px-5 py-2.5 text-sm font-bold bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-400 hover:to-orange-400 text-slate-950 rounded-xl shadow-lg shadow-amber-500/25 transition flex items-center gap-2 disabled:opacity-50 active:scale-95"
                >
                  {modalLoading && <Loader2 size={16} className="animate-spin text-slate-950" />}
                  <span>İstasyonu Kaydet</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
