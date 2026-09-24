import React, { useState, useEffect } from "react";
import { apiClient } from "@/lib/api";
import { User, Station, UserRole } from "@/types";
import { useAuth } from "@/context/AuthContext";
import { formatDateTime } from "@/lib/utils";
import {
  Users,
  UserPlus,
  ShieldCheck,
  Building2,
  UserCircle2,
  RefreshCw,
  Loader2,
  X,
  AlertCircle,
  Lock,
  Mail,
  User as UserIcon,
  ChevronRight,
} from "lucide-react";

export const UsersPage: React.FC = () => {
  const { user: currentUser } = useAuth();
  const [users, setUsers] = useState<User[]>([]);
  const [stations, setStations] = useState<Record<string, Station>>({});
  const [loading, setLoading] = useState<boolean>(true);
  const [refreshing, setRefreshing] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  // New User Modal State
  const [isModalOpen, setIsModalOpen] = useState<boolean>(false);
  const [fullName, setFullName] = useState<string>("");
  const [email, setEmail] = useState<string>("");
  const [password, setPassword] = useState<string>("");
  const [role, setRole] = useState<UserRole>("cashier");
  const [stationId, setStationId] = useState<string>("");
  const [modalLoading, setModalLoading] = useState<boolean>(false);
  const [modalError, setModalError] = useState<string | null>(null);

  const fetchData = async () => {
    try {
      setRefreshing(true);
      setError(null);
      const [usersRes, stationsRes] = await Promise.all([
        apiClient.get<User[]>("/users"),
        apiClient.get<Station[]>("/stations").catch(() => ({ data: [] })),
      ]);
      setUsers(usersRes.data);

      const stMap: Record<string, Station> = {};
      stationsRes.data.forEach((s) => (stMap[s.id] = s));
      setStations(stMap);

      if (stationsRes.data.length > 0 && !stationId) {
        setStationId(stationsRes.data[0].id);
      }
    } catch (err: any) {
      setError(err.response?.data?.detail || "Kullanıcılar yüklenemedi");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setModalLoading(true);
      setModalError(null);

      const payload: any = {
        full_name: fullName.trim(),
        email: email.trim(),
        password: password,
        role: role,
        station_id: role === "super_admin" ? null : stationId || null,
      };

      await apiClient.post("/users", payload);
      setIsModalOpen(false);
      setFullName("");
      setEmail("");
      setPassword("");
      setRole("cashier");
      fetchData();
    } catch (err: any) {
      setModalError(err.response?.data?.detail || "Personel eklenirken hata oluştu");
    } finally {
      setModalLoading(false);
    }
  };

  const getRoleBadge = (role: string) => {
    switch (role) {
      case "super_admin":
        return (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-red-50 text-red-600 border border-red-200">
            <ShieldCheck size={13} className="text-red-600" />
            <span>SuperAdmin</span>
          </span>
        );
      case "station_manager":
        return (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-amber-50 text-amber-700 border border-amber-200">
            <Building2 size={13} className="text-amber-700" />
            <span>İstasyon Müdürü</span>
          </span>
        );
      case "cashier":
        return (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-blue-50 text-blue-700 border border-blue-200">
            <UserCircle2 size={13} className="text-blue-700" />
            <span>Kasiyer</span>
          </span>
        );
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
            <span className="text-amber-500">Kullanıcı & Yetki</span>
          </div>
          <h1 className="text-2xl font-black text-slate-800 tracking-tight flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-zinc-900 flex items-center justify-center text-white shadow-md">
              <Users size={20} />
            </div>
            <span>Personel ve Kullanıcı Yönetimi</span>
          </h1>
          <p className="text-xs text-slate-500 mt-1">
            İstasyon personeli, kasiyerler ve yetkilendirilmiş yöneticiler listesi
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={fetchData}
            disabled={refreshing}
            className="p-2.5 rounded-2xl bg-white border border-slate-200 text-slate-600 hover:text-slate-900 hover:bg-slate-50 transition shadow-sm"
            title="Yenile"
          >
            <RefreshCw size={16} className={refreshing ? "animate-spin text-amber-500" : ""} />
          </button>

          {(currentUser?.role === "super_admin" || currentUser?.role === "station_manager") && (
            <button
              onClick={() => setIsModalOpen(true)}
              className="px-4 py-2.5 rounded-2xl bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600 text-slate-950 text-xs font-black flex items-center gap-2 shadow-md shadow-amber-500/25 transition active:scale-95"
            >
              <UserPlus size={16} />
              <span>Yeni Personel Tanımla</span>
            </button>
          )}
        </div>
      </div>

      {error && (
        <div className="p-4 bg-red-50 border border-red-200 rounded-2xl text-red-600 text-sm flex items-center gap-2">
          <AlertCircle size={18} className="shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Table */}
      {loading ? (
        <div className="flex justify-center p-12 text-slate-400">
          <Loader2 size={32} className="animate-spin text-amber-500" />
        </div>
      ) : users.length === 0 ? (
        <div className="p-8 text-center bg-white dark:bg-slate-900/90 border border-slate-100 dark:border-slate-800 rounded-3xl text-slate-500 dark:text-slate-400 text-sm shadow-sm">
          Kayıtlı personel bulunamadı.
        </div>
      ) : (
        <div className="overflow-x-auto bg-white dark:bg-slate-900/90 border border-slate-100 dark:border-slate-800 rounded-3xl shadow-md dark:shadow-xl shadow-slate-200/60 dark:shadow-slate-950/50">
          <table className="w-full text-left text-sm text-slate-600 dark:text-slate-300">
            <thead className="bg-[#f8fafc] dark:bg-slate-950/60 text-slate-400 uppercase text-[11px] font-bold border-b border-slate-100 dark:border-slate-800">
              <tr>
                <th className="px-5 py-3.5">Ad Soyad</th>
                <th className="px-5 py-3.5">E-posta</th>
                <th className="px-5 py-3.5">Yetki Rolü</th>
                <th className="px-5 py-3.5">Bağlı İstasyon</th>
                <th className="px-5 py-3.5">Durum</th>
                <th className="px-5 py-3.5">Kayıt Tarihi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60 font-normal">
              {users.map((u) => (
                <tr key={u.id} className="hover:bg-slate-50/80 dark:hover:bg-slate-800/40 transition">
                  <td className="px-5 py-3.5 font-bold text-slate-800 dark:text-white flex items-center gap-3">
                    <div className="w-8 h-8 rounded-xl bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 flex items-center justify-center text-slate-700 dark:text-slate-200 font-bold text-xs">
                      {u.full_name.charAt(0).toUpperCase()}
                    </div>
                    <span>{u.full_name}</span>
                  </td>
                  <td className="px-5 py-3.5 text-slate-500 dark:text-slate-400 font-mono text-xs">
                    {u.email}
                  </td>
                  <td className="px-5 py-3.5">{getRoleBadge(u.role)}</td>
                  <td className="px-5 py-3.5 text-slate-700 dark:text-slate-300 font-medium">
                    {u.station_id && stations[u.station_id] ? (
                      <span className="flex items-center gap-1.5 text-xs text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-500/10 px-2.5 py-1 rounded-lg border border-amber-200 dark:border-amber-500/20 inline-flex">
                        <Building2 size={12} />
                        {stations[u.station_id].name} ({stations[u.station_id].code})
                      </span>
                    ) : (
                      <span className="text-slate-400 text-xs italic">Merkez / Tüm Şubeler</span>
                    )}
                  </td>
                  <td className="px-5 py-3.5">
                    {u.is_active ? (
                      <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-50 dark:bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-200/60 dark:border-emerald-500/20">
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
                        Aktif
                      </span>
                    ) : (
                      <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 border border-slate-200 dark:border-slate-700">
                        Pasif
                      </span>
                    )}
                  </td>
                  <td className="px-5 py-3.5 text-slate-400 text-xs">
                    {formatDateTime(u.created_at)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* New User Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl w-full max-w-md overflow-hidden shadow-2xl animate-in fade-in zoom-in-95 duration-150">
            {/* Modal Header */}
            <div className="flex items-center justify-between p-5 border-b border-slate-800 bg-gradient-to-r from-indigo-900/30 to-purple-900/30">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-indigo-500 to-purple-500 text-white flex items-center justify-center shadow-md">
                  <UserPlus size={16} />
                </div>
                <h3 className="font-bold text-lg text-white">Yeni Personel Tanımla</h3>
              </div>
              <button
                onClick={() => setIsModalOpen(false)}
                className="text-slate-400 hover:text-slate-200 p-1 rounded-lg hover:bg-slate-800 transition"
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleCreateUser} className="p-6 space-y-4">
              {modalError && (
                <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-xl text-red-400 text-sm flex items-start gap-2">
                  <AlertCircle size={16} className="shrink-0 mt-0.5" />
                  <span>{modalError}</span>
                </div>
              )}

              <div>
                <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1.5">
                  Personel Adı Soyadı *
                </label>
                <div className="relative">
                  <UserIcon size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-500" />
                  <input
                    type="text"
                    required
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    placeholder="Örn: Mehmet Demir"
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-10 pr-3.5 py-2.5 text-sm text-slate-200 focus:outline-none focus:border-indigo-500 transition"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1.5">
                  E-posta (Giriş İçin) *
                </label>
                <div className="relative">
                  <Mail size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-500" />
                  <input
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="mehmet@fuelos.com"
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-10 pr-3.5 py-2.5 text-sm text-slate-200 focus:outline-none focus:border-indigo-500 transition"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1.5">
                  Geçici Şifre *
                </label>
                <div className="relative">
                  <Lock size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-500" />
                  <input
                    type="password"
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••"
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-10 pr-3.5 py-2.5 text-sm text-slate-200 focus:outline-none focus:border-indigo-500 transition"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1.5">
                    Yetki Rolü *
                  </label>
                  <select
                    value={role}
                    onChange={(e) => setRole(e.target.value as UserRole)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2.5 text-sm text-slate-200 focus:outline-none focus:border-indigo-500 transition"
                  >
                    <option value="cashier">Kasiyer</option>
                    {currentUser?.role === "super_admin" && (
                      <>
                        <option value="station_manager">İstasyon Müdürü</option>
                        <option value="super_admin">SuperAdmin</option>
                      </>
                    )}
                  </select>
                </div>

                {role !== "super_admin" && (
                  <div>
                    <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1.5">
                      Görevli İstasyon *
                    </label>
                    <select
                      value={stationId}
                      onChange={(e) => setStationId(e.target.value)}
                      className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2.5 text-sm text-slate-200 focus:outline-none focus:border-indigo-500 transition"
                    >
                      {Object.values(stations).map((st) => (
                        <option key={st.id} value={st.id}>
                          {st.name} ({st.code})
                        </option>
                      ))}
                    </select>
                  </div>
                )}
              </div>

              <div className="pt-3 flex items-center justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2.5 text-sm text-slate-400 hover:text-slate-200 rounded-xl hover:bg-slate-800 transition"
                >
                  Vazgeç
                </button>
                <button
                  type="submit"
                  disabled={modalLoading}
                  className="px-5 py-2.5 text-sm font-bold bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 text-white rounded-xl shadow-lg shadow-indigo-600/25 transition flex items-center gap-2 disabled:opacity-50"
                >
                  {modalLoading && <Loader2 size={16} className="animate-spin" />}
                  <span>Personeli Kaydet</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
