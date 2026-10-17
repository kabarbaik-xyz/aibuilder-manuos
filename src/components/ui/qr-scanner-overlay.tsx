'use client';

import { useEffect, useRef, useState } from 'react';
import { Icon } from '@/components/icons';
import { Button } from '@/components/ui/button';

interface QrScannerOverlayProps {
  open: boolean;
  onClose: () => void;
  /** Called once with the decoded text; the scanner stops after a successful read. */
  onDetect: (code: string) => void;
  /** Optional handler when user switches to manual code entry. Defaults to onClose. */
  onManualFallback?: () => void;
  title?: string;
}

function cameraErrorMessage(error: unknown) {
  const name = error instanceof Error ? error.name : '';
  const text = typeof error === 'string' ? error : error instanceof Error ? error.message : '';
  if (name === 'NotAllowedError' || /denied|permission/i.test(text)) return 'Akses kamera ditolak. Izinkan kamera di pengaturan browser, atau masukkan kode secara manual.';
  if (/camera not found|NotFound/i.test(`${name} ${text}`)) return 'Kamera tidak ditemukan di perangkat ini. Masukkan kode secara manual.';
  return 'Kamera tidak dapat dibuka. Pastikan halaman dibuka lewat HTTPS, atau masukkan kode secara manual.';
}

export function QrScannerOverlay({ open, onClose, onDetect, onManualFallback, title = 'Pindai kode QR' }: QrScannerOverlayProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const scannerRef = useRef<import('qr-scanner').default | null>(null);
  const handledRef = useRef(false);
  const onDetectRef = useRef(onDetect);
  const onCloseRef = useRef(onClose);
  const [error, setError] = useState<string | null>(null);
  const [starting, setStarting] = useState(true);
  const [hasFlash, setHasFlash] = useState(false);
  const [torchOn, setTorchOn] = useState(false);
  onDetectRef.current = onDetect;
  onCloseRef.current = onClose;

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    handledRef.current = false;
    setError(null);
    setStarting(true);
    setTorchOn(false);
    setHasFlash(false);

    (async () => {
      try {
        const { default: QrScanner } = await import('qr-scanner');
        if (cancelled || !videoRef.current) return;
        if (!(await QrScanner.hasCamera())) {
          setError('Kamera tidak ditemukan di perangkat ini. Masukkan kode secara manual.');
          setStarting(false);
          return;
        }
        const scanner = new QrScanner(
          videoRef.current,
          (result) => {
            if (handledRef.current) return;
            handledRef.current = true;
            scanner.stop();
            if (navigator.vibrate) navigator.vibrate(40);
            onDetectRef.current(result.data);
          },
          { preferredCamera: 'environment', maxScansPerSecond: 5, highlightScanRegion: true, highlightCodeOutline: true, returnDetailedScanResult: true },
        );
        scannerRef.current = scanner;
        await scanner.start();
        if (cancelled) { scanner.destroy(); return; }
        setHasFlash(await scanner.hasFlash().catch(() => false));
        setStarting(false);
      } catch (cause) {
        if (!cancelled) { setError(cameraErrorMessage(cause)); setStarting(false); }
      }
    })();

    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') onCloseRef.current(); };
    window.addEventListener('keydown', onKey);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    return () => {
      cancelled = true;
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = previousOverflow;
      scannerRef.current?.destroy();
      scannerRef.current = null;
    };
  }, [open]);

  if (!open) return null;

  async function toggleTorch() {
    try {
      await scannerRef.current?.toggleFlash();
      setTorchOn(scannerRef.current?.isFlashOn() ?? false);
    } catch { /* flash unsupported at runtime */ }
  }

  return (
    <div className="qr-overlay" role="dialog" aria-modal="true" aria-label={title}>
      <div className="qr-sheet">
        <header className="qr-head">
          <div className="qr-title-wrap">
            <Icon name="qr" />
            <h2>{title}</h2>
          </div>
          <button type="button" className="qr-close" onClick={onClose} aria-label="Tutup pemindai"><Icon name="close" /></button>
        </header>
        <div className="qr-stage">
          <video ref={videoRef} className="qr-video" playsInline muted />
          {!error && <div className="qr-reticle" aria-hidden="true" />}
          {starting && !error && <p className="qr-status" role="status">Membuka kamera…</p>}
          {error && (
            <div className="qr-status qr-error" role="alert">
              <Icon name="alert" />
              <p>{error}</p>
            </div>
          )}
        </div>
        <footer className="qr-foot">
          <p>Arahkan kamera ke QR tugas, job, atau pesanan (TASK:, JOB:, ORDER:).</p>
          <div className="qr-actions">
            {hasFlash && <Button onClick={toggleTorch}>{torchOn ? 'Matikan lampu' : 'Nyalakan lampu'}</Button>}
            <Button onClick={onManualFallback ?? onClose}>Input manual</Button>
          </div>
        </footer>
      </div>
    </div>
  );
}
