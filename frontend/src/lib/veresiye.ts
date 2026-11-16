import { apiClient } from "@/lib/api";
import type { Money } from "@/types/veresiye";

const TR_CHAR_MAP: Record<string, string> = {
  "ı": "I",
  "İ": "I",
  "i": "I",
  "ş": "S",
  "Ş": "S",
  "ğ": "G",
  "Ğ": "G",
  "ü": "U",
  "Ü": "U",
  "ö": "O",
  "Ö": "O",
  "ç": "C",
  "Ç": "C",
};

export function normalizePlate(raw: string | null | undefined): string {
  if (!raw) return "";
  const replaced = raw.replace(/[ıİişŞğĞüÜöÖçÇ]/g, (ch) => TR_CHAR_MAP[ch] ?? ch);
  return replaced.replace(/[^a-zA-Z0-9]/g, "").toUpperCase();
}

export function formatPlate(raw: string | null | undefined): string {
  const norm = normalizePlate(raw);
  if (!norm) return "-";
  const match = norm.match(/^([0-9]{2})([A-Z]{1,3})([0-9]{2,4})$/);
  if (match) {
    return `${match[1]} ${match[2]} ${match[3]}`;
  }
  return norm;
}

export function isValidTc(raw: string): boolean {
  const cleaned = raw.trim();
  if (!/^[1-9][0-9]{10}$/.test(cleaned)) {
    return false;
  }
  const digits = cleaned.split("").map((d) => Number(d));
  const oddSum = digits[0] + digits[2] + digits[4] + digits[6] + digits[8];
  const evenSum = digits[1] + digits[3] + digits[5] + digits[7];
  const d10 = (((oddSum * 7 - evenSum) % 10) + 10) % 10;
  if (d10 !== digits[9]) return false;
  const first10Sum = digits.slice(0, 10).reduce((acc, n) => acc + n, 0);
  const d11 = first10Sum % 10;
  return d11 === digits[10];
}

export function toAmountNumber(value: Money | null | undefined): number {
  if (value === null || value === undefined || value === "") return 0;
  const num = typeof value === "number" ? value : Number(String(value).replace(",", "."));
  return Number.isFinite(num) ? num : 0;
}

export function formatApiDetail(detail: unknown): string | null {
  if (typeof detail === "string" && detail.trim()) {
    return detail.trim();
  }
  if (Array.isArray(detail)) {
    const parts = detail
      .map((item) => {
        if (typeof item === "string") return item;
        if (item && typeof item === "object") {
          const obj = item as { msg?: unknown; loc?: unknown };
          const msg = typeof obj.msg === "string" ? obj.msg : JSON.stringify(obj);
          if (Array.isArray(obj.loc) && obj.loc.length > 0) {
            const field = obj.loc[obj.loc.length - 1];
            if (field && field !== "body") {
              return `${String(field)}: ${msg}`;
            }
          }
          return msg;
        }
        return String(item);
      })
      .filter((s) => Boolean(s));
    if (parts.length > 0) return parts.join(" • ");
  }
  if (detail && typeof detail === "object") {
    const msg = (detail as { msg?: unknown; message?: unknown }).msg ?? (detail as { message?: unknown }).message;
    if (typeof msg === "string" && msg.trim()) return msg.trim();
  }
  return null;
}

export function apiErrorMessage(err: unknown, fallback: string): string {
  const anyErr = err as {
    response?: { data?: { detail?: unknown; message?: unknown } };
    message?: unknown;
  } | null;
  const detail = formatApiDetail(anyErr?.response?.data?.detail);
  if (detail) return detail;
  if (typeof anyErr?.response?.data?.message === "string" && anyErr.response.data.message.trim()) {
    return anyErr.response.data.message.trim();
  }
  if (typeof anyErr?.message === "string" && anyErr.message.trim() && !anyErr.message.startsWith("Request failed")) {
    return anyErr.message.trim();
  }
  return fallback;
}

export async function fetchDocumentBlob(
  documentId: string,
): Promise<{ url: string; contentType: string }> {
  const response = await apiClient.get<Blob>(`/veresiye/documents/${documentId}`, {
    responseType: "blob",
  });
  const headerCt =
    typeof response.headers?.["content-type"] === "string"
      ? response.headers["content-type"]
      : "";
  const contentType = response.data.type || headerCt || "application/octet-stream";
  const url = URL.createObjectURL(response.data);
  return { url, contentType };
}

export async function fetchDocumentBlobUrl(documentId: string): Promise<string> {
  const { url } = await fetchDocumentBlob(documentId);
  return url;
}

export function formatShortDate(dateStr: string | null | undefined): string {
  if (!dateStr) return "-";
  const d = new Date(dateStr);
  if (Number.isNaN(d.getTime())) return dateStr;
  return new Intl.DateTimeFormat("tr-TR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(d);
}
