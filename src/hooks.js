import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Small reusable hooks. Kept free of app state so any component can use
 * them without side effects beyond their own local state.
 */

const MOBILE_BREAKPOINT_PX = 620;

/** @returns {boolean} True when the viewport is at or below the phone width. */
export function useIsMobile() {
  const [isMobile, setIsMobile] = useState(() =>
    typeof window === "undefined" ? false : window.innerWidth <= MOBILE_BREAKPOINT_PX
  );

  useEffect(() => {
    const onResize = () => setIsMobile(window.innerWidth <= MOBILE_BREAKPOINT_PX);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  return isMobile;
}

/**
 * A start/stop/reset stopwatch reporting whole elapsed seconds.
 * @returns {{ seconds: number, running: boolean, start: Function,
 *             stop: Function, reset: Function }}
 */
export function useStopwatch() {
  const [seconds, setSeconds] = useState(0);
  const [running, setRunning] = useState(false);
  const startedAtRef = useRef(0);
  const baseRef = useRef(0);
  const timerRef = useRef(null);

  const tick = useCallback(() => {
    const elapsed = (Date.now() - startedAtRef.current) / 1000;
    setSeconds(Math.floor(baseRef.current + elapsed));
  }, []);

  const start = useCallback(() => {
    if (timerRef.current !== null) {
      return;
    }
    startedAtRef.current = Date.now();
    timerRef.current = window.setInterval(tick, 250);
    setRunning(true);
  }, [tick]);

  const stop = useCallback(() => {
    if (timerRef.current === null) {
      return;
    }
    window.clearInterval(timerRef.current);
    timerRef.current = null;
    baseRef.current += (Date.now() - startedAtRef.current) / 1000;
    setSeconds(Math.floor(baseRef.current));
    setRunning(false);
  }, []);

  const reset = useCallback(() => {
    if (timerRef.current !== null) {
      window.clearInterval(timerRef.current);
      timerRef.current = null;
    }
    baseRef.current = 0;
    startedAtRef.current = 0;
    setSeconds(0);
    setRunning(false);
  }, []);

  useEffect(() => {
    return () => {
      if (timerRef.current !== null) {
        window.clearInterval(timerRef.current);
      }
    };
  }, []);

  return { seconds, running, start, stop, reset };
}
