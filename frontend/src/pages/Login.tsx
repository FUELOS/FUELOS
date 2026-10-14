import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";
import { Fuel, Lock, Mail, AlertCircle, Loader2, ArrowRight } from "lucide-react";

export const Login: React.FC = () => {
  const navigate = useNavigate();
  const { login } = useAuth();
  const [email, setEmail] = useState<string>("");
  const [password, setPassword] = useState<string>("");
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setLoading(true);
      setError(null);
      await login(email, password);
      navigate("/");
    } catch (err: any) {
      const msg = err.response?.data?.detail || "Giriş başarısız. Lütfen bilgilerinizi kontrol edin.";
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="relative min-h-screen bg-black flex flex-col justify-center items-center p-4 overflow-hidden">

      {/* ── Animated Wave / Mesh Background ── */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none" aria-hidden="true">
        {/* Deep base gradient */}
        <div className="absolute inset-0 bg-gradient-to-br from-[#090a0f] via-[#0d0f1a] to-[#080b10]" />

        {/* Large diffuse electric-blue glow (top-right) */}
        <div className="absolute -top-32 -right-32 w-[600px] h-[600px] rounded-full bg-blue-600/10 blur-[120px]" />

        {/* Smaller teal glow (bottom-left) */}
        <div className="absolute -bottom-24 -left-24 w-[400px] h-[400px] rounded-full bg-cyan-500/8 blur-[100px]" />

        {/* Animated wavy SVG */}
        <svg
          className="absolute bottom-0 left-0 w-full opacity-20"
          viewBox="0 0 1440 220"
          preserveAspectRatio="none"
          xmlns="http://www.w3.org/2000/svg"
        >
          <defs>
            <linearGradient id="waveGrad" x1="0" y1="0" x2="1" y2="0">
              <stop offset="0%" stopColor="#2563eb" stopOpacity="0.6" />
              <stop offset="50%" stopColor="#06b6d4" stopOpacity="0.4" />
              <stop offset="100%" stopColor="#2563eb" stopOpacity="0.6" />
            </linearGradient>
          </defs>
          <path
            d="M0,100 C240,160 480,40 720,100 C960,160 1200,40 1440,100 L1440,220 L0,220 Z"
            fill="url(#waveGrad)"
          />
          <path
            d="M0,140 C300,80 600,180 900,120 C1200,60 1350,160 1440,130 L1440,220 L0,220 Z"
            fill="#1d4ed8"
            fillOpacity="0.12"
          />
        </svg>

        {/* Grid overlay */}
        <div
          className="absolute inset-0 opacity-[0.03]"
          style={{
            backgroundImage:
              "linear-gradient(rgba(255,255,255,0.5) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.5) 1px, transparent 1px)",
            backgroundSize: "40px 40px",
          }}
        />
      </div>

      {/* ── Card ── */}
      <div className="w-full max-w-md relative z-10 space-y-6">

        {/* Branding */}
        <div className="text-center space-y-3">
          {/* Icon */}
          <div className="inline-flex w-16 h-16 rounded-3xl bg-gradient-to-tr from-blue-600 to-cyan-400 items-center justify-center text-white shadow-2xl shadow-blue-600/40 mb-1 ring-1 ring-blue-500/30">
            <Fuel size={32} className="stroke-[2.5]" />
          </div>

          <div>
            <h1 className="text-3xl font-black tracking-tight text-white">
              Fuel<span className="text-blue-400">OS</span>
            </h1>
            <p className="text-sm text-zinc-400 mt-1 font-medium">
              Akaryakıt İstasyon Yönetim &amp; Doğrulama Platformu
            </p>
          </div>
        </div>

        {/* Glassmorphic Form Card */}
        <div className="bg-white/[0.04] backdrop-blur-2xl border border-white/10 rounded-3xl p-7 shadow-2xl shadow-black/60 ring-1 ring-inset ring-white/5">

          {/* Error Banner */}
          {error && (
            <div className="mb-5 p-3 bg-red-500/10 border border-red-500/20 rounded-2xl text-red-400 text-sm flex items-start gap-2">
              <AlertCircle size={16} className="shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            {/* E-posta */}
            <div>
              <label className="block text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-1.5">
                E-posta Adresi
              </label>
              <div className="relative">
                <Mail size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-zinc-500" />
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder=""
                  autoComplete="email"
                  className="w-full bg-white/5 border border-white/10 rounded-xl pl-10 pr-3.5 py-2.5 text-sm text-zinc-100 placeholder:text-zinc-600 focus:outline-none focus:border-blue-500/60 focus:bg-white/8 transition-colors"
                />
              </div>
            </div>

            {/* Şifre */}
            <div>
              <label className="block text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-1.5">
                Şifre
              </label>
              <div className="relative">
                <Lock size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-zinc-500" />
                <input
                  type="password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder=""
                  autoComplete="current-password"
                  className="w-full bg-white/5 border border-white/10 rounded-xl pl-10 pr-3.5 py-2.5 text-sm text-zinc-100 placeholder:text-zinc-600 focus:outline-none focus:border-blue-500/60 focus:bg-white/8 transition-colors"
                />
              </div>
            </div>

            {/* Submit */}
            <button
              type="submit"
              disabled={loading}
              className="w-full mt-2 py-3 px-4 font-bold text-white bg-blue-600 hover:bg-blue-500 active:bg-blue-700 rounded-xl shadow-lg shadow-blue-600/30 transition-all flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? (
                <Loader2 size={18} className="animate-spin" />
              ) : (
                <>
                  <span>Giriş Yap</span>
                  <ArrowRight size={16} />
                </>
              )}
            </button>
          </form>
        </div>

        {/* Footer */}
        <div className="text-center text-xs text-zinc-600 font-medium">
          FuelOS V1.0 &copy; 2026 — Akıllı Mutabakat Katmanı
        </div>
      </div>
    </div>
  );
};
