import { Buffer } from 'buffer';
import process from 'process';

globalThis.Buffer = Buffer;
globalThis.process = process;
const result = document.getElementById('result')!;
const status = document.getElementById('wallet-status')!;
result.textContent = 'Midnight modülleri yükleniyor…';
try {
  await import('./app.js');
} catch (error) {
  const text = error instanceof Error ? error.message : String(error);
  status.textContent = 'Uygulama açılamadı.';
  result.textContent = `Uygulama başlatılamadı: ${text}`;
}
