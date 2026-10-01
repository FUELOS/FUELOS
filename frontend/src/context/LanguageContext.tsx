import React, { createContext, useContext, useState } from "react";

export type Language = "tr" | "en";

interface LanguageContextType {
  language: Language;
  setLanguage: (lang: Language) => void;
  t: (key: string) => string;
}

const translations: Record<Language, Record<string, string>> = {
  tr: {
    // Nav
    "nav.shift": "Vardiya",
    "nav.transactions": "Satışlar",
    "nav.reports": "Raporlar",
    "nav.station": "İstasyon",
    "nav.settings": "Ayarlar",
    "nav.tagline": "Akaryakıt İstasyonları İçin Dijital Operasyon Platformu",

    // Header & Meta
    "header.title": "Vardiya Mutabakatı",
    "header.subtitle": "Tüm satış kanallarının tek ekranda özeti",
    "header.active_station": "İstasyon",
    "header.select_station": "İstasyon Seçin",
    "header.all_stations": "Tüm İstasyonlar",
    "header.shift_time": "06:00 - 14:00",
    "header.new_shift": "Yeni Vardiya Aç",
    "header.close_shift": "Vardiyayı Kapat & Sıfırla",
    "header.add_sale": "Satış Ekle",
    "header.refresh": "Yenile",

    // Worker Cards
    "worker.title": "İşçi",
    "worker.liters": "Satılan Litre",
    "worker.cash": "Nakit Satış",
    "worker.pos": "POS (Kart)",
    "worker.fast": "FAST",
    "worker.total_label": "Toplam Satışlar",
    "worker.total_sub": "aktif işçinin toplamı",

    // Summary Totals
    "summary.opening_cash": "Açılış Kasası",
    "summary.opening_sub": "Vardiya başında kasaya konulan nakit",
    "summary.cash_sales": "Toplam Nakit Satış",
    "summary.cash_sub": "Vardiya içinde yapılan nakit satış",
    "summary.pos_sales": "Toplam POS (Kart)",
    "summary.pos_sub": "Vardiya içinde yapılan kart satış",
    "summary.fast_sales": "Toplam FAST",
    "summary.fast_sub": "Vardiya içinde yapılan FAST satış",
    "summary.liters_total": "Toplam Satılan Litre",
    "summary.liters_sub": "Vardiya toplam akaryakıt satışı",
    "summary.expected_cash": "Beklenen Kasa",
    "summary.total_revenue": "Toplam Satış Tutarı",
    "summary.general_total": "Genel Toplam",
    "summary.general_sub": "Vardiya satışlarının toplam tutarı",

    // Reconciliation Status
    "status.completed_title": "Vardiya Mutabakatı Tamamlandı",
    "status.completed_desc": "Açılış kasası ve tüm satış kanalları başarıyla eşleştirildi.",
    "status.active_title": "Canlı Vardiya Açık & Devam Ediyor",
    "status.active_desc": "Saha personellerinden canlı satış ve tahsilat verisi alınıyor.",
    "status.shortage": "Kasa Açığı Tespit Edildi",
    "status.surplus": "Kasa Fazlası Tespit Edildi",

    // Product Breakdown
    "product.title": "Ürün Bazlı Detay",
    "product.optional": "(Opsiyonel)",
    "product.desc": "Ana ekranda ürün ayrımı olmadan çalışır. Detaylı analiz için ürün bazlı veriler görüntülenebilir.",
    "product.toggle": "Ürün Bazlı Detayı Göster",
    "product.table_title": "ÜRÜN BAZLI SATIŞ DETAYI",
    "product.col_product": "Ürün",
    "product.col_liters": "Satılan Litre",
    "product.col_cash": "Nakit Satış (TL)",
    "product.col_pos": "POS (Kart) (TL)",
    "product.col_fast": "FAST (TL)",
    "product.col_total": "Toplam Tutar (TL)",
    "product.benzin": "Benzin",
    "product.motorin": "Motorin",
    "product.lpg": "LPG",
    "product.chart_title": "Satılan Litre Dağılımı",
    "product.chart_total": "Toplam",
    "product.info_note": "Ürün bazlı detay, ana mutabakat işlemini etkilemez. Sistem, ana ekranda toplam litre ve toplam tutarlar üzerinden çalışır. Ürün bazlı veriler analiz ve raporlama için kullanılır.",

    // Reports Page
    "reports.title": "Geçmiş Vardiya Raporları",
    "reports.subtitle": "Dün, geçen hafta veya geçmiş tarihlerdeki tüm mutabakat karneleri",
    "reports.filter_period": "Zaman Aralığı",
    "reports.today": "Bugün",
    "reports.yesterday": "Dün",
    "reports.last_7": "Son 7 Gün",
    "reports.this_month": "Bu Ay",
    "reports.all": "Tüm Zamanlar",
    "reports.col_date": "Tarih & Saat",
    "reports.col_station": "İstasyon",
    "reports.col_cashier": "Kasiyer / İşçiler",
    "reports.col_expected": "Beklenen Kasa",
    "reports.col_closing": "Fiziki Kapanış",
    "reports.col_difference": "Kasa Farkı",
    "reports.col_status": "Mutabakat Durumu",
    "reports.matched": "Tam Mutabakat (0,00 TL)",
    "reports.no_data": "Seçilen tarih aralığında geçmiş mutabakat kaydı bulunamadı.",

    // Modals
    "modal.open_title": "Yeni Vardiya Aç",
    "modal.close_title": "Vardiyayı Kapat & Kasa Mutabakatı",
    "modal.add_tx_title": "Yeni Satış Kaydı Ekle",
    "modal.opening_cash_label": "Açılış Kasası (TL)",
    "modal.closing_cash_label": "Fiziki Kasada Sayılan Nakit (TL)",
    "modal.cashier_label": "Vardiya Kasiyeri / İşçi",
    "modal.cancel": "İptal",
    "modal.confirm": "Onayla",
    "modal.amount": "Satış Tutarı (TL)",
    "modal.payment_method": "Ödeme Yöntemi",
    "modal.fuel_type": "Yakıt / Ürün Türü",
  },
  en: {
    // Nav
    "nav.shift": "Shift",
    "nav.transactions": "Sales",
    "nav.reports": "Reports",
    "nav.station": "Station",
    "nav.settings": "Settings",
    "nav.tagline": "Digital Operations Platform for Fuel Stations",

    // Header & Meta
    "header.title": "Shift Reconciliation",
    "header.subtitle": "Single-screen overview of all sales channels",
    "header.active_station": "Station",
    "header.select_station": "Select Station",
    "header.all_stations": "All Stations",
    "header.shift_time": "06:00 - 14:00",
    "header.new_shift": "Start New Shift",
    "header.close_shift": "Close & Reset Shift",
    "header.add_sale": "Add Sale",
    "header.refresh": "Refresh",

    // Worker Cards
    "worker.title": "Worker",
    "worker.liters": "Dispensed Liters",
    "worker.cash": "Cash Sales",
    "worker.pos": "POS (Card)",
    "worker.fast": "FAST / Wire",
    "worker.total_label": "Total Sales",
    "worker.total_sub": "combined across active workers",

    // Summary Totals
    "summary.opening_cash": "Opening Cash",
    "summary.opening_sub": "Cash placed into register at shift start",
    "summary.cash_sales": "Total Cash Sales",
    "summary.cash_sub": "Cash sales collected during shift",
    "summary.pos_sales": "Total POS (Card)",
    "summary.pos_sub": "Card payments collected during shift",
    "summary.fast_sales": "Total FAST",
    "summary.fast_sub": "Instant transfer payments during shift",
    "summary.liters_total": "Total Liters Sold",
    "summary.liters_sub": "Total dispensed fuel volume in shift",
    "summary.expected_cash": "Expected Cash",
    "summary.total_revenue": "Total Revenue",
    "summary.general_total": "Grand Total",
    "summary.general_sub": "Total sum of shift sales across channels",

    // Reconciliation Status
    "status.completed_title": "Shift Reconciliation Completed",
    "status.completed_desc": "Opening cash and all sales channels successfully balanced.",
    "status.active_title": "Active Live Shift In Progress",
    "status.active_desc": "Real-time sales and collection data streaming from forecourt staff.",
    "status.shortage": "Cash Shortage Detected",
    "status.surplus": "Cash Surplus Detected",

    // Product Breakdown
    "product.title": "Product Breakdown",
    "product.optional": "(Optional)",
    "product.desc": "Operates without product distinction on main view. Enable for in-depth product analytics.",
    "product.toggle": "Show Product Breakdown",
    "product.table_title": "SALES BREAKDOWN BY PRODUCT",
    "product.col_product": "Product",
    "product.col_liters": "Liters Sold",
    "product.col_cash": "Cash Sales (TL)",
    "product.col_pos": "POS (Card) (TL)",
    "product.col_fast": "FAST (TL)",
    "product.col_total": "Total Amount (TL)",
    "product.benzin": "Gasoline 95",
    "product.motorin": "Diesel",
    "product.lpg": "Autogas (LPG)",
    "product.chart_title": "Dispensed Volume Share",
    "product.chart_total": "Total",
    "product.info_note": "Product breakdown does not alter the core cash reconciliation. The system balances on aggregate volumes and total collections. Product data is used for analytics and historical reporting.",

    // Reports Page
    "reports.title": "Historical Shift Reports",
    "reports.subtitle": "Audit shift reconciliations from yesterday, last week or prior months",
    "reports.filter_period": "Time Period",
    "reports.today": "Today",
    "reports.yesterday": "Yesterday",
    "reports.last_7": "Last 7 Days",
    "reports.this_month": "This Month",
    "reports.all": "All Time",
    "reports.col_date": "Date & Time",
    "reports.col_station": "Station",
    "reports.col_cashier": "Cashier / Staff",
    "reports.col_expected": "Expected Cash",
    "reports.col_closing": "Counted Cash",
    "reports.col_difference": "Cash Variance",
    "reports.col_status": "Reconciliation Status",
    "reports.matched": "Balanced (0.00 TL)",
    "reports.no_data": "No historical shift records found for the selected period.",

    // Modals
    "modal.open_title": "Start New Shift",
    "modal.close_title": "Close Shift & Count Cash",
    "modal.add_tx_title": "Record New Sale",
    "modal.opening_cash_label": "Opening Float Cash (TL)",
    "modal.closing_cash_label": "Physical Counted Cash (TL)",
    "modal.cashier_label": "Shift Cashier / Attendant",
    "modal.cancel": "Cancel",
    "modal.confirm": "Confirm",
    "modal.amount": "Sale Amount (TL)",
    "modal.payment_method": "Payment Method",
    "modal.fuel_type": "Fuel / Product Type",
  },
};

const LanguageContext = createContext<LanguageContextType | undefined>(undefined);

export const LanguageProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [language, setLanguageState] = useState<Language>(() => {
    const saved = localStorage.getItem("fuelos_lang") as Language | null;
    return saved === "en" || saved === "tr" ? saved : "tr";
  });

  const setLanguage = (lang: Language) => {
    setLanguageState(lang);
    localStorage.setItem("fuelos_lang", lang);
  };

  const t = (key: string): string => {
    return translations[language][key] || key;
  };

  return (
    <LanguageContext.Provider value={{ language, setLanguage, t }}>
      {children}
    </LanguageContext.Provider>
  );
};

export const useLanguage = () => {
  const context = useContext(LanguageContext);
  if (!context) {
    throw new Error("useLanguage must be used within a LanguageProvider");
  }
  return context;
};
