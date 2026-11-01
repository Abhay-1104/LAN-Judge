import { useEffect, useRef, useState, useCallback } from 'react';
import * as faceapi from 'face-api.js';

// ---------------------------------------------------------------------------
// Debug logging helper
// ---------------------------------------------------------------------------
const PROCTORING_DEBUG = true;
function dbg(...args) {
  if (PROCTORING_DEBUG) console.debug('[Proctoring]', ...args);
}

// ---------------------------------------------------------------------------
// Constants & Tuned Thresholds
// ---------------------------------------------------------------------------
const CHECK_INTERVAL_MS            = 2000;
const FACE_CHECK_INTERVAL_MS       = 2000;

// TinyFaceDetector configuration:
const FACE_DETECTOR_OPTIONS        = new faceapi.TinyFaceDetectorOptions({ inputSize: 320, scoreThreshold: 0.35 });

// --- Brightness & Coverage Detection ---------------------------------------
const STARTUP_GRACE_MS             = 2000;  // 2s warmup
const BASELINE_FRAME_COUNT         = 4;     // average 4 frames for steady baseline
const COVERED_BRIGHTNESS_MAX       = 35;    // covered camera usually has brightness below 35
const COVERED_STDDEV_MAX           = 10;    // flat uniform image with almost zero texture / contrast (covered lens)
const DARK_ROOM_BRIGHTNESS         = 26;    // below 26 is too dark for face detection
const RELATIVE_DARK_RATIO          = 0.32;  // flag if brightness drops to < 32% of calibrated baseline
const REQUIRED_DARK_CHECKS         = 2;     // 2 consecutive checks (4s) before violation

// --- Voice & Audio Detection -----------------------------------------------
// Tuned for loud noise / multiple people talking:
// Whispers, throat clearing, and room ambiance (30-65) are ignored.
// Loud speaking, shouting, or multiple talking voices register 85-150.
const BASE_VOICE_THRESHOLD         = 85;    // higher threshold requiring loud noise / multiple voices
const REQUIRED_VOICE_CHECKS        = 4;     // 4 consecutive checks (8s) of sustained loud talking
const SPEECH_BIN_START             = 3;     // ~250 Hz (skips DC offset & 50/60Hz AC hum)
const SPEECH_BIN_END               = 40;    // ~3750 Hz (human vocal tract formants)

// --- Face Presence ---------------------------------------------------------
const REQUIRED_MISSING_FACE_CHECKS = 2;     // 2 consecutive checks (4s) missing face before violation
const REQUIRED_MULTIPLE_FACES_CHECKS = 2;   // 2 consecutive checks (4s) multiple faces before violation

// --- Global Violation Cooldown ---------------------------------------------
const GLOBAL_VIOLATION_COOLDOWN_MS = 6000;  // 6s cooldown between ANY strikes

// ---------------------------------------------------------------------------
// Face model — singleton promise, shared across re-renders
// ---------------------------------------------------------------------------
let faceModelLoadPromise = null;
function loadFaceModel() {
  if (!faceModelLoadPromise) {
    faceModelLoadPromise = faceapi.nets.tinyFaceDetector.loadFromUri('/models');
  }
  return faceModelLoadPromise;
}

/**
 * Proctoring hook with calibrated thresholds, noise cancellation,
 * continuous real-time face detection, debounced blur/tab detection,
 * non-fatal freeze with 5-min timer, and professor unlock resume.
 */
export function useProctoring({ enabled, send, onFreeze, onAutoSubmit }) {
  const [permissionState, setPermissionState] = useState('idle'); // idle | requesting | granted | denied
  const [warning, setWarning]                 = useState(null);   // { message, warningNumber } | null
  const [autoSubmitted, setAutoSubmitted]     = useState(null);   // { message } | null
  const [isFrozen, setIsFrozen]               = useState(false);  // true when 3 strikes reached, waiting for prof
  const [freezeReason, setFreezeReason]       = useState(null);
  const [faceDetected, setFaceDetected]       = useState(null);   // null | boolean | 'covered' | 'too-dark' | 'multi-face'
  const [audioLevel, setAudioLevel]           = useState(0);      // 0 - 255 current speech-band audio
  const [stream, setStream]                   = useState(null);

  // Store callbacks in refs so raiseViolation and effects remain stable
  // even when parent component re-renders every second (e.g. countdown timer).
  const sendRef = useRef(send);
  sendRef.current = send;
  const onFreezeRef = useRef(onFreeze);
  onFreezeRef.current = onFreeze;
  const onAutoSubmitRef = useRef(onAutoSubmit);
  onAutoSubmitRef.current = onAutoSubmit;

  const streamRef                      = useRef(null);
  const videoRef                       = useRef(null);
  const canvasRef                      = useRef(null);
  const audioCtxRef                    = useRef(null);
  const analyserRef                    = useRef(null);
  const warningCountRef                = useRef(0);
  const lastGlobalViolationAtRef       = useRef(0);
  const intervalRef                    = useRef(null);
  const faceModelReadyRef              = useRef(false);
  const faceCheckBusyRef               = useRef(false);
  const lastFaceCheckAtRef             = useRef(0);
  const consecutiveVoiceCountRef       = useRef(0);
  const consecutiveDarkCountRef        = useRef(0);
  const consecutiveMissingFaceCountRef = useRef(0);
  const consecutiveMultiFaceCountRef   = useRef(0);
  const streamStartedAtRef             = useRef(0);

  // Brightness calibration refs
  const baselineBrightnessRef = useRef(null);
  const baselineAccumRef      = useRef(0);
  const baselineFramesRef     = useRef(0);

  // Audio baseline calibration refs
  const baselineAudioRef      = useRef(null);
  const baselineAudioAccumRef = useRef(0);

  const raiseViolation = useCallback((message) => {
    const now = Date.now();
    // GLOBAL COOLDOWN across all violations
    if (now - lastGlobalViolationAtRef.current < GLOBAL_VIOLATION_COOLDOWN_MS) {
      dbg(`Violation suppressed by global cooldown (${message})`);
      return;
    }
    lastGlobalViolationAtRef.current = now;

    warningCountRef.current += 1;
    const count = warningCountRef.current;

    dbg(`Violation raised: "${message}" (Strike ${count}/3)`);

    if (count >= 3) {
      // Strike 3: FREEZE the test (do not immediately auto-submit!)
      // The student gets a 5-minute window for the professor to allow them to continue.
      setIsFrozen(true);
      setFreezeReason(message);
      setWarning({ message, warningNumber: 3 });
      sendRef.current?.({ type: 'violation', message, warningNumber: 3, autoSubmitted: false, freeze: true });
      onFreezeRef.current?.(message);
    } else {
      setWarning({ message, warningNumber: count });
      sendRef.current?.({ type: 'violation', message, warningNumber: count, autoSubmitted: false });
    }
  }, []);

  const resetWarnings = useCallback(() => {
    dbg('Resetting proctoring warnings — student unlocked by professor');
    warningCountRef.current = 0;
    lastGlobalViolationAtRef.current = Date.now();
    setWarning(null);
    setAutoSubmitted(null);
    setIsFrozen(false);
    setFreezeReason(null);
    consecutiveVoiceCountRef.current = 0;
    consecutiveDarkCountRef.current = 0;
    consecutiveMissingFaceCountRef.current = 0;
    consecutiveMultiFaceCountRef.current = 0;
  }, []);

  function cleanup() {
    if (intervalRef.current) clearInterval(intervalRef.current);
    if (streamRef.current) streamRef.current.getTracks().forEach((t) => t.stop());
    if (audioCtxRef.current && audioCtxRef.current.state !== 'closed') audioCtxRef.current.close();
    if (videoRef.current && videoRef.current.parentNode) {
      videoRef.current.parentNode.removeChild(videoRef.current);
    }
  }

  const triggerAutoSubmit = useCallback(
    (reason) => {
      const finalReason = reason || freezeReason || 'Exceeded 5 minutes in frozen state without instructor unlock';
      setAutoSubmitted({ message: finalReason });
      sendRef.current?.({ type: 'violation', message: finalReason, warningNumber: 3, autoSubmitted: true });
      cleanup();
      onAutoSubmitRef.current?.(finalReason);
    },
    [freezeReason]
  );

  useEffect(() => {
    if (!enabled) return undefined;

    let cancelled = false;

    async function start() {
      setPermissionState('requesting');

      if (!window.isSecureContext && window.location.hostname !== 'localhost' && window.location.hostname !== '127.0.0.1') {
        if (!cancelled) setPermissionState('insecure-context');
        return;
      }

      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        if (!cancelled) setPermissionState('insecure-context');
        return;
      }

      try {
        let activeStream = null;
        let hasAudio = false;
        let hasVideo = false;

        // Browser hardware noise cancellation + AEC
        const AUDIO_CONSTRAINTS = {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        };

        try {
          activeStream = await navigator.mediaDevices.getUserMedia({ audio: AUDIO_CONSTRAINTS, video: true });
          hasAudio = true;
          hasVideo = true;
        } catch {
          try {
            activeStream = await navigator.mediaDevices.getUserMedia({ video: true });
            hasVideo = true;
          } catch {
            try {
              activeStream = await navigator.mediaDevices.getUserMedia({ audio: AUDIO_CONSTRAINTS });
              hasAudio = true;
            } catch (e3) {
              throw e3;
            }
          }
        }

        if (cancelled) {
          if (activeStream) activeStream.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current          = activeStream;
        setStream(activeStream);
        setPermissionState('granted');
        streamStartedAtRef.current = Date.now();

        // ----- Video setup: attach to DOM (hidden) for guaranteed frame rendering -----
        if (hasVideo && activeStream.getVideoTracks().length > 0) {
          const video         = document.createElement('video');
          video.srcObject     = activeStream;
          video.muted         = true;
          video.playsInline   = true;
          video.style.position = 'fixed';
          video.style.top      = '-9999px';
          video.style.left     = '-9999px';
          video.style.width    = '320px';
          video.style.height   = '240px';
          video.style.opacity  = '0';
          video.style.pointerEvents = 'none';
          document.body.appendChild(video);

          await video.play().catch(() => {});
          videoRef.current = video;

          const canvas  = document.createElement('canvas');
          canvas.width  = 64;
          canvas.height = 48;
          canvasRef.current = canvas;

          try {
            await loadFaceModel();
            faceModelReadyRef.current = true;
            dbg('Face detection model ready ✓');
          } catch (e) {
            faceModelReadyRef.current = false;
            dbg('Face detection model failed to load:', e);
            console.warn('[Proctoring] Face detection model failed to load:', e);
          }
        }

        // ----- Web Audio analyser setup -------------------------------------
        if (hasAudio && activeStream.getAudioTracks().length > 0) {
          const AudioContextClass = window.AudioContext || window.webkitAudioContext;
          if (AudioContextClass) {
            const audioCtx = new AudioContextClass();
            audioCtx.resume().catch(() => {});
            if (audioCtx.state === 'suspended') {
              const resume = () => {
                if (audioCtx.state === 'suspended') audioCtx.resume().catch(() => {});
                window.removeEventListener('click', resume, true);
                window.removeEventListener('keydown', resume, true);
              };
              window.addEventListener('click', resume, true);
              window.addEventListener('keydown', resume, true);
            }
            const source   = audioCtx.createMediaStreamSource(activeStream);
            const analyser = audioCtx.createAnalyser();
            analyser.fftSize = 512;
            source.connect(analyser);
            audioCtxRef.current = audioCtx;
            analyserRef.current = analyser;
          }
        }

        if (!cancelled) {
          intervalRef.current = setInterval(runChecks, CHECK_INTERVAL_MS);
          setTimeout(runChecks, 500);
        }
      } catch (err) {
        if (!cancelled) {
          if (err.name === 'NotFoundError' || err.name === 'DevicesNotFoundError') {
            setPermissionState('no-device');
          } else {
            setPermissionState('denied');
          }
        }
      }
    }

    function runChecks() {
      // ------------------------------------------------------------------
      // 1. Audio & Voice Detection (High threshold: only loud/multiple voices)
      // ------------------------------------------------------------------
      const analyser = analyserRef.current;
      if (analyser) {
        const audioCtx = audioCtxRef.current;
        if (audioCtx && audioCtx.state === 'suspended') {
          audioCtx.resume().catch(() => {});
        }

        const data = new Uint8Array(analyser.frequencyBinCount);
        analyser.getByteFrequencyData(data);

        const startBin = Math.min(SPEECH_BIN_START, data.length - 1);
        const endBin   = Math.min(SPEECH_BIN_END, data.length);
        let sum = 0;
        let binCount = 0;
        for (let i = startBin; i < endBin; i++) {
          sum += data[i];
          binCount++;
        }
        const avgAudio = binCount > 0 ? sum / binCount : 0;
        setAudioLevel(Math.round(avgAudio));

        if (baselineAudioRef.current === null) {
          baselineAudioAccumRef.current += avgAudio;
        } else if (Date.now() - streamStartedAtRef.current >= STARTUP_GRACE_MS) {
          // Dynamic voice threshold: requires loud talking (>= 85) + 35 over room floor
          const effectiveVoiceThreshold = Math.max(BASE_VOICE_THRESHOLD, baselineAudioRef.current + 35);

          if (avgAudio > effectiveVoiceThreshold) {
            consecutiveVoiceCountRef.current += 1;
            dbg(`Loud voice detected: ${avgAudio.toFixed(1)} > ${effectiveVoiceThreshold.toFixed(1)} (${consecutiveVoiceCountRef.current}/${REQUIRED_VOICE_CHECKS})`);
          } else {
            consecutiveVoiceCountRef.current = 0;
          }

          if (consecutiveVoiceCountRef.current >= REQUIRED_VOICE_CHECKS) {
            raiseViolation('Loud talking / multiple voices detected');
            consecutiveVoiceCountRef.current = 0;
          }
        }
      }

      // ------------------------------------------------------------------
      // 2. Camera Brightness Calibration, Coverage & Dark-Room Detection
      // ------------------------------------------------------------------
      const video  = videoRef.current;
      const canvas = canvasRef.current;
      let currentBrightness = 100;
      // 'ok' | 'covered' | 'too-dark'
      let cameraState = 'ok';

      if (video && canvas && video.readyState >= 2) {
        if (video.videoWidth && video.width !== video.videoWidth) {
          video.width = video.videoWidth;
          video.height = video.videoHeight;
        }

        const ctx = canvas.getContext('2d');
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        const frame = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
        const pixelCount = frame.length / 4;

        // Compute average brightness
        let sum = 0;
        for (let i = 0; i < frame.length; i += 4) {
          sum += (frame[i] + frame[i + 1] + frame[i + 2]) / 3;
        }
        currentBrightness = sum / pixelCount;

        // Compute pixel standard deviation (contrast / texture measure).
        // A physically covered lens produces a nearly uniform dark image → very low stddev.
        // A dark but open room retains some texture → higher stddev.
        let sumSq = 0;
        for (let i = 0; i < frame.length; i += 4) {
          const luma = (frame[i] + frame[i + 1] + frame[i + 2]) / 3;
          const d = luma - currentBrightness;
          sumSq += d * d;
        }
        const stdDev = Math.sqrt(sumSq / pixelCount);

        if (baselineBrightnessRef.current === null) {
          baselineAccumRef.current  += currentBrightness;
          baselineFramesRef.current += 1;

          if (baselineFramesRef.current >= BASELINE_FRAME_COUNT) {
            const baseline = baselineAccumRef.current / BASELINE_FRAME_COUNT;
            baselineBrightnessRef.current = baseline;
            baselineAudioRef.current = baselineAudioAccumRef.current / Math.max(1, baselineFramesRef.current);
            dbg(`Calibration complete: Baseline Brightness=${baseline.toFixed(1)}, Baseline AudioFloor=${baselineAudioRef.current.toFixed(1)}`);
          }
          consecutiveDarkCountRef.current = 0;
        } else if (Date.now() - streamStartedAtRef.current >= STARTUP_GRACE_MS) {
          // Covered camera: low brightness AND very low contrast/texture
          const isCovered = currentBrightness < COVERED_BRIGHTNESS_MAX && stdDev < COVERED_STDDEV_MAX;
          // Dark room: brightness too low to see face, but has some texture (not a covered lens)
          const isDarkRoom = !isCovered && (
            currentBrightness < DARK_ROOM_BRIGHTNESS ||
            (baselineBrightnessRef.current > 40 && currentBrightness < baselineBrightnessRef.current * RELATIVE_DARK_RATIO)
          );

          dbg(`Frame: brightness=${currentBrightness.toFixed(1)}, stdDev=${stdDev.toFixed(1)}, covered=${isCovered}, darkRoom=${isDarkRoom}`);

          if (isCovered || isDarkRoom) {
            cameraState = isCovered ? 'covered' : 'too-dark';
            // Suppress face detection — these conditions look identical to missing face to faceapi.
            // Reset consecutive missing face counter so no spurious "face not detected" violations.
            consecutiveMissingFaceCountRef.current = 0;
            consecutiveMultiFaceCountRef.current = 0;

            consecutiveDarkCountRef.current += 1;
            dbg(`Camera ${cameraState}: brightness=${currentBrightness.toFixed(1)}, stdDev=${stdDev.toFixed(1)} (${consecutiveDarkCountRef.current}/${REQUIRED_DARK_CHECKS})`);

            if (consecutiveDarkCountRef.current >= REQUIRED_DARK_CHECKS) {
              const msg = isCovered
                ? 'Camera appears covered — please uncover your camera'
                : 'Room is too dark — please turn on lights to remain visible';
              raiseViolation(msg);
              consecutiveDarkCountRef.current = 0;
            }

            // Update PIP indicator without triggering a face-missing violation
            setFaceDetected(cameraState);

            // Auto-dismiss a stale "face not detected" warning now that we know why
            setWarning((prev) => {
              if (prev && prev.message === 'Face not detected — please stay visible on camera') {
                dbg('Camera covered / too dark — replacing face-missing warning context');
                return null;
              }
              return prev;
            });
          } else {
            // Camera is clear and room is lit — reset dark counter
            consecutiveDarkCountRef.current = 0;
            if (currentBrightness >= 30) {
              // Slow exponential moving average to adapt baseline gradually
              baselineBrightnessRef.current = 0.96 * baselineBrightnessRef.current + 0.04 * currentBrightness;
            }
            // Auto-clear any lingering covered/dark warning when conditions improve
            setWarning((prev) => {
              if (prev && (
                prev.message === 'Camera appears covered — please uncover your camera' ||
                prev.message === 'Room is too dark — please turn on lights to remain visible'
              )) {
                dbg('Camera/room conditions improved — auto-dismissing covered/dark warning');
                return null;
              }
              return prev;
            });
          }
        }
      }

      // ------------------------------------------------------------------
      // 3. Continuous Face Detection (skipped when camera covered or too dark)
      // ------------------------------------------------------------------
      if (
        video &&
        video.readyState >= 2 &&
        cameraState === 'ok' &&
        faceModelReadyRef.current &&
        !faceCheckBusyRef.current
      ) {
        const now = Date.now();
        if (now - lastFaceCheckAtRef.current >= FACE_CHECK_INTERVAL_MS) {
          lastFaceCheckAtRef.current = now;
          faceCheckBusyRef.current   = true;

          faceapi
            .detectAllFaces(video, FACE_DETECTOR_OPTIONS)
            .then((detections) => {
              if (detections.length === 0) {
                setFaceDetected(false);
                consecutiveMissingFaceCountRef.current += 1;
                consecutiveMultiFaceCountRef.current    = 0;
                dbg(`Face missing: consecutive=${consecutiveMissingFaceCountRef.current}/${REQUIRED_MISSING_FACE_CHECKS}`);

                if (Date.now() - streamStartedAtRef.current >= STARTUP_GRACE_MS &&
                    consecutiveMissingFaceCountRef.current >= REQUIRED_MISSING_FACE_CHECKS) {
                  raiseViolation('Face not detected — please stay visible on camera');
                  consecutiveMissingFaceCountRef.current = 0;
                }
              } else if (detections.length > 1) {
                setFaceDetected('multi-face');
                consecutiveMissingFaceCountRef.current = 0;
                consecutiveMultiFaceCountRef.current  += 1;
                dbg(`Multiple faces: consecutive=${consecutiveMultiFaceCountRef.current}/${REQUIRED_MULTIPLE_FACES_CHECKS}`);

                if (Date.now() - streamStartedAtRef.current >= STARTUP_GRACE_MS &&
                    consecutiveMultiFaceCountRef.current >= REQUIRED_MULTIPLE_FACES_CHECKS) {
                  raiseViolation('Multiple faces detected');
                  consecutiveMultiFaceCountRef.current = 0;
                }
              } else {
                setFaceDetected(true);
                consecutiveMissingFaceCountRef.current = 0;
                consecutiveMultiFaceCountRef.current   = 0;
                consecutiveDarkCountRef.current        = 0;

                // AUTO-RECOVER: When student returns to camera, auto-clear the missing face warning modal
                setWarning((prev) => {
                  if (prev && prev.message === 'Face not detected — please stay visible on camera') {
                    dbg('Face returned to camera — auto-dismissing missing face warning modal');
                    return null;
                  }
                  return prev;
                });
              }
            })
            .catch((err) => {
              dbg('detectAllFaces error:', err);
            })
            .finally(() => {
              faceCheckBusyRef.current = false;
            });
        }
      }
    }

    start();
    return () => {
      cancelled = true;
      cleanup();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled]);

  // -------------------------------------------------------------------------
  // Tab-switch / window-blur / window-change detection.
  // Uses multiple complementary signals so a switch is caught regardless
  // of browser focus policies or OS-level window management:
  //   1. document.visibilitychange  (most reliable for tab switches)
  //   2. window.blur                (catches Alt-Tab, new window, taskbar click)
  //   3. pagehide / pageshow        (catches back/forward navigation attempts)
  //   4. Periodic focus poll        (safety net: catches cases where blur fires
  //                                  but the delayed check races poorly)
  // IMPORTANT: raiseViolation is stable (no deps), read through a ref so this
  // effect only ever depends on [enabled] and is never torn down by the 1-second
  // countdown re-render in QuizTake.
  // -------------------------------------------------------------------------
  const raiseViolationRef = useRef(raiseViolation);
  raiseViolationRef.current = raiseViolation;

  useEffect(() => {
    if (!enabled) return undefined;

    let blurTimer = null;
    let hiddenTimer = null;
    let focusPollInterval = null;
    // Track whether we already fired for the current out-of-focus session
    // so the poll doesn't double-fire after blur already raised a violation.
    let blurViolationFired = false;

    const onVisibilityChange = () => {
      if (document.hidden) {
        if (!hiddenTimer) {
          hiddenTimer = setTimeout(() => {
            if (document.hidden) {
              blurViolationFired = true;
              raiseViolationRef.current('Tab switch or window minimized detected');
            }
            hiddenTimer = null;
          }, 800);
        }
      } else {
        if (hiddenTimer) {
          clearTimeout(hiddenTimer);
          hiddenTimer = null;
        }
        blurViolationFired = false;
      }
    };

    const onBlur = () => {
      if (!blurTimer) {
        blurTimer = setTimeout(() => {
          if (!document.hasFocus() && !blurViolationFired) {
            blurViolationFired = true;
            raiseViolationRef.current('Window lost focus — please stay on the test window');
          }
          blurTimer = null;
        }, 1200);
      }
    };

    const onFocus = () => {
      if (blurTimer) {
        clearTimeout(blurTimer);
        blurTimer = null;
      }
      blurViolationFired = false;
    };

    // pagehide fires on back/forward or when the page is being navigated away
    const onPageHide = () => {
      raiseViolationRef.current('Tab switch or window minimized detected');
    };

    // Periodic poll: if window stays out of focus for more than 3 poll cycles
    // (3 × 1.5s = 4.5s) without the blur event raising a violation, catch it here.
    // This covers edge cases where 'blur' fires but the hasFocus check above
    // returns true due to a transient race in some Chromium builds.
    let consecutiveLostFocusCount = 0;
    focusPollInterval = setInterval(() => {
      if (!document.hasFocus() && !document.hidden) {
        // document visible but window not focused = another app window is active
        consecutiveLostFocusCount += 1;
        if (consecutiveLostFocusCount >= 2 && !blurViolationFired) {
          blurViolationFired = true;
          raiseViolationRef.current('Window lost focus — please stay on the test window');
          consecutiveLostFocusCount = 0;
        }
      } else {
        consecutiveLostFocusCount = 0;
        if (document.hasFocus()) blurViolationFired = false;
      }
    }, 1500);

    document.addEventListener('visibilitychange', onVisibilityChange);
    window.addEventListener('blur', onBlur);
    window.addEventListener('focus', onFocus);
    window.addEventListener('pagehide', onPageHide);

    return () => {
      document.removeEventListener('visibilitychange', onVisibilityChange);
      window.removeEventListener('blur', onBlur);
      window.removeEventListener('focus', onFocus);
      window.removeEventListener('pagehide', onPageHide);
      if (blurTimer) clearTimeout(blurTimer);
      if (hiddenTimer) clearTimeout(hiddenTimer);
      if (focusPollInterval) clearInterval(focusPollInterval);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled]);


  const dismissWarning = useCallback(() => setWarning(null), []);

  const retry = useCallback(() => {
    cleanup();
    setPermissionState('requesting');
    setTimeout(() => {
      window.location.reload();
    }, 100);
  }, []);

  return {
    permissionState,
    warning,
    autoSubmitted,
    isFrozen,
    freezeReason,
    dismissWarning,
    raiseViolation,
    resetWarnings,
    triggerAutoSubmit,
    retry,
    stream,
    faceDetected,
    audioLevel,
  };
}

/**
 * Blocks paste events within a container (e.g. the code editor) during a
 * proctored test.
 */
export function blockPaste(e) {
  e.preventDefault();
  e.stopPropagation();
  return false;
}