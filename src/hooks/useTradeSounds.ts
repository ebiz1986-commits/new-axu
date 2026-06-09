import { useEffect, useRef } from "react";
import { ActiveTrade } from "../types";

function playTone(freqs: number[], type: OscillatorType, duration: number, delayBetween: number = 0) {
  try {
    const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioContextClass) return;

    const ctx = new AudioContextClass();
    
    // Resume context if suspended (browser security autoplay policy)
    if (ctx.state === "suspended") {
      ctx.resume();
    }

    freqs.forEach((freq, index) => {
      const osc = ctx.createOscillator();
      const gainNode = ctx.createGain();

      osc.type = type;
      osc.frequency.setValueAtTime(freq, ctx.currentTime + index * delayBetween);

      const startTime = ctx.currentTime + index * delayBetween;
      gainNode.gain.setValueAtTime(0, startTime);
      
      // Fine-tuned volume profile (0.04 - 0.06 is loud enough to be pleasant but soft and non-disruptive)
      gainNode.gain.linearRampToValueAtTime(0.05, startTime + 0.03); 
      gainNode.gain.exponentialRampToValueAtTime(0.0001, startTime + duration);

      osc.connect(gainNode);
      gainNode.connect(ctx.destination);

      osc.start(startTime);
      osc.stop(startTime + duration);
    });
  } catch (error) {
    // Silently capture any autoplay or audio element failures
    console.debug("Web Audio playback skipped:", error);
  }
}

export function useTradeSounds(activeTrade: ActiveTrade | null, soundEnabled: boolean) {
  const prevActiveTradeRef = useRef<ActiveTrade | null>(null);

  // Initialize the ref with the initial active trade state upon mount to prevent double sound on boot
  const isFirstRender = useRef(true);

  useEffect(() => {
    if (isFirstRender.current) {
      prevActiveTradeRef.current = activeTrade;
      isFirstRender.current = false;
      return;
    }

    if (!soundEnabled) {
      prevActiveTradeRef.current = activeTrade;
      return;
    }

    const prev = prevActiveTradeRef.current;

    // Played only when transition rules match
    if (prev === null && activeTrade !== null) {
      // Trade Opened: rising chime (C5. e.g. 523.25Hz -> E5. e.g. 659.25Hz)
      playTone([523.25, 659.25], "sine", 0.35, 0.08);
    } else if (prev !== null && activeTrade === null) {
      // Trade Closed: falling chime (D5. e.g. 587.33Hz -> A4. e.g. 440.00Hz)
      playTone([587.33, 440.00], "sine", 0.4, 0.10);
    } else if (prev !== null && activeTrade !== null && prev.id !== activeTrade.id) {
      // Rapid Rollover (old position exited, new position entered simultaneously)
      playTone([587.33, 440.00], "sine", 0.4, 0.10);
      setTimeout(() => {
        playTone([523.25, 659.25], "sine", 0.35, 0.08);
      }, 250);
    }

    prevActiveTradeRef.current = activeTrade;
  }, [activeTrade, soundEnabled]);
}
