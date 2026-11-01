import { useEffect, useRef, useState } from 'react';
import { AlertTriangle, Ban, Camera, Mic, CheckCircle2, XCircle, Lock, ArrowUpDown } from 'lucide-react';
import { Button } from './ui';

export function ViolationWarningModal({ warning, onDismiss }) {
  if (!warning) return null;
  // Strike 3 triggers freeze — the TestFrozenModal handles that UI;
  // but we still let the warning flash briefly so the student knows WHY.
  const remainingBeforeFreeze = 3 - warning.warningNumber;
  return (
    <div className="fixed inset-0 z-[200] bg-black/70 flex items-center justify-center p-4">
      <div className="animate-fade-up bg-card border border-warning/40 rounded-2xl p-7 max-w-sm w-full text-center">
        <div className="flex items-center justify-center gap-2 text-warning font-bold text-lg mb-4">
          <AlertTriangle size={22} />
          {warning.warningNumber >= 3 ? 'Test Frozen' : 'Warning'}
        </div>
        <p className="text-text font-medium mb-2">{warning.message}</p>
        <p className="text-text-secondary text-sm mb-6">
          Strike {warning.warningNumber} of 3.{' '}
          {warning.warningNumber >= 3
            ? 'Your test has been frozen. Please wait for your instructor to unlock it.'
            : remainingBeforeFreeze === 1
            ? 'One more violation will freeze your test.'
            : `${remainingBeforeFreeze} more violations will freeze your test.`}
        </p>
        <Button variant="secondary" onClick={onDismiss} className="w-full !bg-warning !text-bg hover:brightness-110">
          I Understand
        </Button>
      </div>
    </div>
  );
}

export function AutoSubmitModal({ info }) {
  if (!info) return null;
  return (
    <div className="fixed inset-0 z-[200] bg-black/80 flex items-center justify-center p-4">
      <div className="animate-fade-up bg-card border border-error/40 rounded-2xl p-7 max-w-sm w-full text-center shadow-theme-xl">
        <div className="flex items-center justify-center gap-2 text-error font-bold text-lg mb-4">
          <Ban size={22} />
          Test Auto-Submitted
        </div>
        <p className="text-text font-medium mb-2">Reason: {info.message}</p>
        <p className="text-text-secondary text-sm">
          Your test was submitted automatically. If you believe this was an error, please contact your invigilator.
        </p>
      </div>
    </div>
  );
}

/**
 * 5-Minute countdown modal when test is frozen by proctoring violations.
 * If professor allows to continue within 5 minutes, student resumes test!
 * If not allowed within 5 minutes, onTimeUp fires and auto-submits answers.
 */
export function TestFrozenModal({ reason, onTimeUp }) {
  const [secondsLeft, setSecondsLeft] = useState(300); // 5 minutes = 300s

  useEffect(() => {
    const timer = setInterval(() => {
      setSecondsLeft((s) => {
        if (s <= 1) {
          clearInterval(timer);
          onTimeUp?.();
          return 0;
        }
        return s - 1;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [onTimeUp]);

  const mins = Math.floor(secondsLeft / 60);
  const secs = secondsLeft % 60;
  const timeStr = `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  const pct = (secondsLeft / 300) * 100;

  return (
    <div className="fixed inset-0 z-[200] bg-black/85 backdrop-blur-md flex items-center justify-center p-4">
      <div className="animate-fade-up bg-card border border-warning/50 rounded-2xl p-7 max-w-md w-full text-center shadow-theme-xl space-y-4">
        <div className="w-14 h-14 mx-auto rounded-full bg-warning/10 border border-warning/30 flex items-center justify-center text-warning">
          <Lock size={28} />
        </div>
        <div>
          <h2 className="text-xl font-bold text-text">Test Frozen</h2>
          <p className="text-sm font-medium text-warning mt-1">Reason: {reason}</p>
        </div>

        <div className="bg-surface border border-border rounded-xl p-4 space-y-2">
          <p className="text-xs text-text-secondary">Auto-submitting in</p>
          <div className="text-3xl font-mono font-bold text-text tracking-wider">{timeStr}</div>
          <div className="w-full bg-border h-1.5 rounded-full overflow-hidden">
            <div
              className="bg-warning h-full transition-all duration-1000 ease-linear rounded-full"
              style={{ width: `${pct}%` }}
            />
          </div>
        </div>

        <p className="text-xs text-text-secondary leading-relaxed">
          Please notify your professor or lab invigilator. Once they click <strong>Allow to continue</strong> on their monitor dashboard, your test will unfreeze and you can continue answering.
        </p>
        <p className="text-[11px] text-error font-medium">
          If your professor does not unlock your test within 5 minutes, your answered questions will be automatically submitted.
        </p>
      </div>
    </div>
  );
}

export function PermissionPromptModal({ state, onRetry }) {
  if (!state || state === 'granted' || state === 'idle') return null;

  const isHttps = window.location.protocol === 'https:';

  return (
    <div className="fixed inset-0 z-[200] bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="animate-fade-up bg-card border border-border rounded-2xl p-6 max-w-md w-full text-left shadow-theme-xl space-y-4">
        <div className="flex items-center gap-2 text-warning font-semibold text-base">
          <AlertTriangle size={20} />
          {state === 'insecure-context'
            ? 'HTTPS Required for Camera Proctoring'
            : state === 'no-device'
            ? 'No Camera / Microphone Detected'
            : 'Camera & Microphone Access Required'}
        </div>

        {state === 'insecure-context' ? (
          <div className="space-y-3 text-sm text-text-secondary">
            <p>
              Browsers block camera/mic access over insecure HTTP on other devices. Please open the secure HTTPS URL:
            </p>
            {!isHttps && (
              <a
                href={`https://${window.location.hostname}:4000${window.location.pathname}${window.location.search}`}
                className="inline-block bg-primary text-white font-mono text-xs px-3 py-2 rounded-xl hover:bg-brand-600 transition-colors"
              >
                Switch to HTTPS (Port 4000)
              </a>
            )}
            <p className="text-xs">
              When the browser displays <em>"Connection not private"</em>, click <strong>Advanced → Proceed</strong>.
            </p>
          </div>
        ) : state === 'no-device' ? (
          <div className="space-y-2 text-sm text-text-secondary">
            <p>We could not find a working camera or microphone on this device.</p>
            <p className="text-xs">
              If this is a desktop PC, plug in a USB webcam or headset and click Retry below.
            </p>
          </div>
        ) : (
          <div className="space-y-2.5 text-sm text-text-secondary">
            <p>
              This contest or quiz is proctored. You must grant camera and microphone permission to proceed.
            </p>
            <div className="bg-surface border border-border rounded-xl p-3 text-xs space-y-1.5 text-text-secondary">
              <p className="font-semibold text-text">If you previously blocked access:</p>
              <p>1. Click the <strong>lock / tune icon</strong> in the left of the browser address bar.</p>
              <p>2. Set <strong>Camera</strong> and <strong>Microphone</strong> to <strong>Allow</strong>.</p>
              <p>3. Click the <strong>Retry</strong> button below.</p>
            </div>
          </div>
        )}

        <div className="flex justify-end gap-2 pt-2">
          <Button onClick={onRetry} className="w-full">
            Retry Camera Access
          </Button>
        </div>
      </div>
    </div>
  );
}

/**
 * Floating Picture-in-Picture preview that displays the student's camera,
 * face verification indicator, and live audio indicator.
 */
export function ProctoringMiniPip({ stream, faceDetected, audioLevel, enabled }) {
  const videoRef = useRef(null);
  const [minimized, setMinimized] = useState(false);
  // Default position: on mobile (< 768px), default to top-right (top: 72px, right: 12px)
  // so it never overlaps or hides the bottom action buttons (Save / Next / Submit).
  // On desktop, default to bottom-right (bottom: 16px, right: 16px).
  const [position, setPosition] = useState(() => {
    if (typeof window !== 'undefined' && window.innerWidth < 768) {
      return { top: 72, right: 12 };
    }
    return { bottom: 16, right: 16 };
  });
  const [isDragging, setIsDragging] = useState(false);
  const dragRef = useRef({ startX: 0, startY: 0, startLeft: 0, startTop: 0 });
  const containerRef = useRef(null);

  useEffect(() => {
    if (videoRef.current && stream) {
      videoRef.current.srcObject = stream;
    }
  }, [stream, minimized]);

  // Flip position between top dock and bottom dock with one tap
  const toggleDock = (e) => {
    e.stopPropagation();
    setPosition((pos) => {
      if (pos.top !== undefined) {
        return { bottom: 16, right: pos.right ?? 16 };
      } else {
        return { top: 72, right: pos.right ?? 16 };
      }
    });
  };

  const handlePointerDown = (e) => {
    if (e.target.closest('button')) return;
    setIsDragging(true);
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return;
    const clientX = e.clientX ?? (e.touches && e.touches[0]?.clientX) ?? 0;
    const clientY = e.clientY ?? (e.touches && e.touches[0]?.clientY) ?? 0;
    dragRef.current = {
      startX: clientX,
      startY: clientY,
      startLeft: rect.left,
      startTop: rect.top,
    };
  };

  useEffect(() => {
    if (!isDragging) return undefined;
    const onMove = (e) => {
      const clientX = e.clientX ?? e.touches?.[0]?.clientX;
      const clientY = e.clientY ?? e.touches?.[0]?.clientY;
      if (clientX == null || clientY == null) return;
      const deltaX = clientX - dragRef.current.startX;
      const deltaY = clientY - dragRef.current.startY;
      const cardWidth = containerRef.current?.offsetWidth || 176;
      const cardHeight = containerRef.current?.offsetHeight || 140;
      const maxLeft = Math.max(8, window.innerWidth - cardWidth - 8);
      const maxTop = Math.max(8, window.innerHeight - cardHeight - 8);
      const newLeft = Math.max(8, Math.min(maxLeft, dragRef.current.startLeft + deltaX));
      const newTop = Math.max(8, Math.min(maxTop, dragRef.current.startTop + deltaY));
      setPosition({ top: newTop, left: newLeft });
    };
    const onEnd = () => setIsDragging(false);

    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onEnd);
    window.addEventListener('touchmove', onMove, { passive: false });
    window.addEventListener('touchend', onEnd);
    return () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onEnd);
      window.removeEventListener('touchmove', onMove);
      window.removeEventListener('touchend', onEnd);
    };
  }, [isDragging]);

  if (!enabled || !stream) return null;

  const style = {};
  if (position.top !== undefined) style.top = `${position.top}px`;
  if (position.bottom !== undefined) style.bottom = `${position.bottom}px`;
  if (position.left !== undefined) style.left = `${position.left}px`;
  if (position.right !== undefined) style.right = `${position.right}px`;

  return (
    <div
      ref={containerRef}
      style={style}
      className={`fixed z-[150] select-none transition-shadow duration-200 ${
        isDragging ? 'cursor-grabbing opacity-90 scale-95 shadow-2xl' : 'shadow-xl'
      }`}
    >
      <div className="bg-card/95 backdrop-blur-md border border-border/80 rounded-2xl p-2.5 shadow-theme-xl flex flex-col gap-2 w-44">
        <div
          onPointerDown={handlePointerDown}
          onTouchStart={handlePointerDown}
          className="flex items-center justify-between gap-1 px-1 cursor-grab active:cursor-grabbing"
          title="Drag anywhere or click the arrow button to toggle Top / Bottom"
        >
          <div className="flex items-center gap-1.5 min-w-0">
            <span
              className={`w-2 h-2 rounded-full shrink-0 ${
                faceDetected === true
                  ? 'bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.8)]'
                  : faceDetected === false
                  ? 'bg-rose-500 shadow-[0_0_8px_rgba(244,63,94,0.8)]'
                  : faceDetected === 'covered' || faceDetected === 'too-dark'
                  ? 'bg-amber-400 shadow-[0_0_8px_rgba(251,191,36,0.8)]'
                  : faceDetected === 'multi-face'
                  ? 'bg-orange-400 shadow-[0_0_8px_rgba(251,146,60,0.8)]'
                  : 'bg-amber-400 shadow-[0_0_8px_rgba(251,191,36,0.8)]'
              }`}
            />
            <span className="text-[11px] font-medium text-text-secondary truncate">
              {faceDetected === true
                ? 'Face Verified'
                : faceDetected === false
                ? 'No Face'
                : faceDetected === 'covered'
                ? 'Camera Covered'
                : faceDetected === 'too-dark'
                ? 'Room Too Dark'
                : faceDetected === 'multi-face'
                ? 'Multiple Faces'
                : 'Calibrating'}
            </span>
          </div>
          <div className="flex items-center gap-1 shrink-0">
            <button
              type="button"
              onClick={toggleDock}
              title={position.top !== undefined ? 'Dock to bottom' : 'Dock to top'}
              className="text-text-secondary hover:text-text text-[10px] p-1 rounded bg-surface border border-border/60 transition-colors"
            >
              <ArrowUpDown size={11} />
            </button>
            <button
              type="button"
              onClick={() => setMinimized((m) => !m)}
              className="text-text-secondary hover:text-text text-[10px] px-1.5 py-0.5 rounded bg-surface border border-border/60 transition-colors"
            >
              {minimized ? 'Show' : 'Hide'}
            </button>
          </div>
        </div>

        {!minimized && (
          <div className="relative rounded-xl overflow-hidden aspect-[4/3] bg-black/60 border border-border/40">
            <video
              ref={videoRef}
              autoPlay
              playsInline
              muted
              className="w-full h-full object-cover -scale-x-100"
            />
            <div className="absolute bottom-1 left-1 right-1 flex items-center justify-between px-1.5 py-0.5 bg-black/70 backdrop-blur-sm rounded text-[9px] text-white/90">
              <span className="flex items-center gap-1 font-mono">
                <span>Mic</span>
                <span
                  className={`inline-block w-1.5 h-1.5 rounded-full ${
                    audioLevel > 85 ? 'bg-amber-400' : 'bg-emerald-400'
                  }`}
                />
              </span>
              <span className="font-mono text-[8px] text-emerald-400 font-semibold">SECURE</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
