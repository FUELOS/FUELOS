import React, { useState } from "react";
import { Shift } from "@/types";
import { apiClient } from "@/lib/api";
import {
  ShieldCheck,
  Lock,
  CheckCircle2,
  Copy,
  Check,
  RefreshCw,
  X,
  FileCheck,
  EyeOff,
} from "lucide-react";

interface ZKVerificationModalProps {
  isOpen: boolean;
  shift: Shift | null;
  onClose: () => void;
  onRefresh?: () => void;
}

export const ZKVerificationModal: React.FC<ZKVerificationModalProps> = ({
  isOpen,
  shift,
  onClose,
  onRefresh,
}) => {
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [verifying, setVerifying] = useState<boolean>(false);
  const [verifyMessage, setVerifyMessage] = useState<string | null>(null);

  if (!isOpen || !shift) return null;

  const copyToClipboard = (text: string, key: string) => {
    navigator.clipboard.writeText(text);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 2000);
  };

  const handleVerify = async () => {
    try {
      setVerifying(true);
      setVerifyMessage(null);
      if (shift.zk_proof_status === "proved" || shift.zk_proof_status === "verified") {
        const response = await apiClient.get(`/shifts/${shift.id}/zk-verify`);
        setVerifyMessage(
          response.data.ledger_verified
            ? "Ledger doğrulaması tamamlandı"
            : "Proof bütünlüğü geçerli; ledger doğrulaması bekliyor",
        );
      } else {
        await apiClient.post(`/shifts/${shift.id}/zk-prove`);
        setVerifyMessage("Gerçek proof üretildi; ledger doğrulaması bekliyor");
      }
      setTimeout(() => setVerifyMessage(null), 3000);
      if (onRefresh) onRefresh();
    } catch (err) {
      console.error("ZK proof operation failed", err);
      setVerifyMessage("Proof işlemi tamamlanamadı");
    } finally {
      setVerifying(false);
    }
  };

  const commitment = shift.zk_commitment;
  const proofHash = shift.zk_proof_hash;
  const publicClass = (shift.zk_reconciliation_class || shift.reconciliation_status || "matched").toUpperCase();
  const tolerance = shift.zk_tolerance != null ? `${shift.zk_tolerance} TL` : "Henüz kanıtlanmadı";
  const ledgerVerified = shift.zk_verified === true;
  const proofProduced = shift.zk_proof_status === "proved" || shift.zk_proof_status === "verified";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="relative w-full max-w-lg bg-slate-900 border border-slate-800 rounded-3xl p-6 text-white shadow-2xl overflow-hidden">
        {/* Decorative background glow */}
        <div className="absolute -top-24 -right-24 w-60 h-60 bg-indigo-500/10 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute -bottom-24 -left-24 w-60 h-60 bg-emerald-500/10 rounded-full blur-3xl pointer-events-none" />

        {/* Modal Header */}
        <div className="flex items-start justify-between pb-4 border-b border-slate-800/80">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center text-white shadow-lg shadow-indigo-500/20">
              <ShieldCheck size={22} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-base font-bold text-slate-100">Midnight ZK Mutabakatı</h3>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-extrabold uppercase bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">
                  Zero-Knowledge
                </span>
              </div>
              <p className="text-xs text-slate-400 mt-0.5">
                Gizlilik Korumalı Proof Üretim Durumu
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 transition"
          >
            <X size={18} />
          </button>
        </div>

        {/* Status Card */}
        <div className="mt-5 p-4 rounded-2xl bg-slate-950/60 border border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-xl bg-emerald-500/20 text-emerald-400 flex items-center justify-center">
              <CheckCircle2 size={18} />
            </div>
            <div>
              <div className="text-xs text-slate-400">Doğrulama Durumu</div>
              <div className="text-sm font-bold text-emerald-400">
                {ledgerVerified
                  ? "Kriptografik Olarak Doğrulandı"
                  : proofProduced
                    ? "Proof Üretildi — Ledger Bekleniyor"
                    : "Proof Henüz Üretilmedi"}
              </div>
            </div>
          </div>
          <div className="text-right">
            <div className="text-xs text-slate-400">Sonuç Sınıfı</div>
            <span
              className={`inline-block px-2.5 py-0.5 rounded-lg text-xs font-black uppercase ${
                publicClass === "MATCHED"
                  ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/30"
                  : publicClass === "SHORTAGE"
                  ? "bg-rose-500/20 text-rose-300 border border-rose-500/30"
                  : "bg-sky-500/20 text-sky-300 border border-sky-500/30"
              }`}
            >
              {publicClass}
            </span>
          </div>
        </div>

        {/* Parameters Grid */}
        <div className="mt-4 space-y-3">
          <div className="p-3.5 rounded-2xl bg-slate-950/40 border border-slate-800/80">
            <div className="flex items-center justify-between text-xs text-slate-400 mb-1">
              <span className="flex items-center gap-1.5">
                <Lock size={12} className="text-indigo-400" />
                <span>Vardiya Bağlam Özeti (henüz devreye bağlı değil)</span>
              </span>
              <button
                onClick={() => commitment && copyToClipboard(commitment, "commitment")}
                disabled={!commitment}
                className="text-indigo-400 hover:text-indigo-300 inline-flex items-center gap-1 text-[11px]"
              >
                {copiedKey === "commitment" ? <Check size={12} /> : <Copy size={12} />}
                <span>{copiedKey === "commitment" ? "Kopyalandı" : "Kopyala"}</span>
              </button>
            </div>
            <div className="font-mono text-xs text-slate-200 break-all select-all">
              {commitment || "Proof üretildikten sonra oluşur"}
            </div>
          </div>

          <div className="p-3.5 rounded-2xl bg-slate-950/40 border border-slate-800/80">
            <div className="flex items-center justify-between text-xs text-slate-400 mb-1">
              <span className="flex items-center gap-1.5">
                <FileCheck size={12} className="text-emerald-400" />
                <span>ZK Kanıt Özeti (Proof Hash)</span>
              </span>
              <button
                onClick={() => proofHash && copyToClipboard(proofHash, "proof")}
                disabled={!proofHash}
                className="text-indigo-400 hover:text-indigo-300 inline-flex items-center gap-1 text-[11px]"
              >
                {copiedKey === "proof" ? <Check size={12} /> : <Copy size={12} />}
                <span>{copiedKey === "proof" ? "Kopyalandı" : "Kopyala"}</span>
              </button>
            </div>
            <div className="font-mono text-xs text-slate-200 break-all select-all">
              {proofHash || "Proof henüz üretilmedi"}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="p-3 rounded-2xl bg-slate-950/40 border border-slate-800/80">
              <div className="text-[11px] text-slate-400">Yetkili Dinamik Tolerans</div>
              <div className="text-xs font-mono font-bold text-slate-200 mt-0.5">
                {tolerance}
              </div>
            </div>
            <div className="p-3 rounded-2xl bg-slate-950/40 border border-slate-800/80">
              <div className="text-[11px] text-slate-400">Protokol & Devre</div>
              <div className="text-xs font-mono font-bold text-indigo-300 mt-0.5">
                Compact 0.31.1 / Midnight
              </div>
            </div>
          </div>
        </div>

        {/* Zero-Knowledge Privacy Guarantee Banner */}
        <div className="mt-4 p-3.5 rounded-2xl bg-indigo-950/30 border border-indigo-900/40 flex items-start gap-2.5">
          <EyeOff size={16} className="text-indigo-400 shrink-0 mt-0.5" />
          <p className="text-[11px] text-indigo-200/90 leading-relaxed">
            <span className="font-bold text-indigo-100">Gizli girdiler:</span> Toplam ciro,
            POS dağılımı ve nakit kasası API yanıtında veya proof içinde açıklanmaz. Proof üretimi
            yerel proof server tarafından yapılır; bağımsız ledger doğrulaması ağ entegrasyonunda tamamlanır.
          </p>
        </div>

        {/* Actions */}
        <div className="mt-5 flex items-center justify-between gap-3 pt-2">
          <div className="flex items-center gap-2">
            {verifyMessage && (
              <span className="text-xs font-bold text-emerald-400">
                {verifyMessage}
              </span>
            )}
            <span className="text-[11px] text-slate-500 font-mono">
              {shift.zk_proved_at
                ? new Date(shift.zk_proved_at).toLocaleTimeString()
                : "V1.0 MVP"}
            </span>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handleVerify}
              disabled={verifying}
              className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold transition flex items-center gap-1.5 active:scale-95 disabled:opacity-50"
            >
              <RefreshCw size={13} className={verifying ? "animate-spin" : ""} />
              <span>{verifying ? "İşleniyor..." : proofProduced ? "Proof Durumunu Kontrol Et" : "Gerçek Proof Üret"}</span>
            </button>
            <button
              onClick={onClose}
              className="px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold transition"
            >
              Kapat
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
