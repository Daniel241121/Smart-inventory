'use client';

import { Camera, CameraOff, Keyboard } from 'lucide-react';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Button, Input, cn } from './ui';

export type ScanOutcome = 'ok' | 'repeated' | 'error';

let audioContext: AudioContext | null = null;

/** Pitido corto: agudo si se aceptó, grave si hubo problema. */
function beep(outcome: ScanOutcome) {
  try {
    audioContext ??= new AudioContext();
    const osc = audioContext.createOscillator();
    const gain = audioContext.createGain();
    osc.frequency.value = outcome === 'ok' ? 1320 : 330;
    gain.gain.value = 0.08;
    osc.connect(gain).connect(audioContext.destination);
    osc.start();
    osc.stop(audioContext.currentTime + (outcome === 'ok' ? 0.08 : 0.25));
    navigator.vibrate?.(outcome === 'ok' ? 40 : [80, 60, 80]);
  } catch {
    // El sonido es opcional.
  }
}

/** Normaliza lo que trae el QR: acepta el código solo o una URL que termine en él. */
function normalize(raw: string) {
  const value = raw.trim().toUpperCase();
  const match = value.match(/P-\d{4,}/);
  return match ? match[0] : value;
}

/**
 * Escáner en ráfaga: la cámara queda abierta y cada QR nuevo se reporta una vez.
 * También acepta escritura manual o lectores Bluetooth (que escriben y envían Enter).
 */
export function Scanner({ onScan }: { onScan: (code: string) => Promise<ScanOutcome> | ScanOutcome }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const lastSeen = useRef(new Map<string, number>());
  const onScanRef = useRef(onScan);
  onScanRef.current = onScan;

  const [active, setActive] = useState(true);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [flash, setFlash] = useState<ScanOutcome | null>(null);
  const [manual, setManual] = useState('');

  async function handle(raw: string) {
    const code = normalize(raw);
    if (!code) return;
    const now = Date.now();
    // Ignora el mismo código mientras siga frente a la cámara.
    if (now - (lastSeen.current.get(code) ?? 0) < 2500) return;
    lastSeen.current.set(code, now);

    const outcome = await onScanRef.current(code);
    beep(outcome);
    setFlash(outcome);
    setTimeout(() => setFlash(null), 350);
  }

  useEffect(() => {
    if (!active || !videoRef.current) return;
    let scanner: import('qr-scanner').default | null = null;
    let cancelled = false;

    (async () => {
      const { default: QrScanner } = await import('qr-scanner');
      if (cancelled || !videoRef.current) return;
      scanner = new QrScanner(videoRef.current, (result) => handle(result.data), {
        preferredCamera: 'environment',
        maxScansPerSecond: 12,
        highlightScanRegion: true,
        highlightCodeOutline: true,
        returnDetailedScanResult: true
      });
      try {
        await scanner.start();
        setCameraError(null);
      } catch {
        setCameraError('No se pudo abrir la cámara. Revisa los permisos del navegador o escribe el código abajo.');
      }
    })();

    return () => {
      cancelled = true;
      scanner?.destroy();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active]);

  function submitManual(event: FormEvent) {
    event.preventDefault();
    lastSeen.current.delete(normalize(manual));
    handle(manual);
    setManual('');
  }

  return (
    <div className="space-y-3">
      <div
        className={cn(
          'relative aspect-[4/3] overflow-hidden rounded-xl bg-slate-900 ring-4 transition sm:aspect-video',
          flash === 'ok' && 'ring-emerald-400',
          flash === 'repeated' && 'ring-amber-400',
          flash === 'error' && 'ring-rose-500',
          !flash && 'ring-transparent'
        )}
      >
        {active ? (
          <video ref={videoRef} className="h-full w-full object-cover" muted playsInline />
        ) : (
          <div className="flex h-full flex-col items-center justify-center gap-2 text-sm text-slate-400">
            <CameraOff className="h-8 w-8" />
            Cámara en pausa
          </div>
        )}
        {cameraError && (
          <div className="absolute inset-0 flex items-center justify-center bg-slate-900/90 p-6 text-center text-sm text-slate-200">
            {cameraError}
          </div>
        )}
        <Button
          variant="secondary"
          size="sm"
          className="absolute right-3 top-3"
          onClick={() => setActive((value) => !value)}
          type="button"
        >
          {active ? <CameraOff className="h-4 w-4" /> : <Camera className="h-4 w-4" />}
          {active ? 'Pausar' : 'Activar'}
        </Button>
      </div>

      <form onSubmit={submitManual} className="flex gap-2">
        <div className="relative flex-1">
          <Keyboard className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <Input
            value={manual}
            onChange={(event) => setManual(event.target.value)}
            placeholder="Código manual, ej. P-000123"
            className="pl-9 uppercase"
            autoCapitalize="characters"
            autoComplete="off"
          />
        </div>
        <Button type="submit" variant="secondary" disabled={!manual.trim()}>
          Agregar
        </Button>
      </form>
    </div>
  );
}
