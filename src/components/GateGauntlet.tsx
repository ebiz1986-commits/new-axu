import React, { useState } from "react";
import { GateStatus } from "../types";
import { CheckCircle2, XCircle, ShieldAlert, Award, Terminal, Wrench, X, AlertTriangle, Lightbulb, RefreshCw, Check } from "lucide-react";

interface GateGauntletProps {
  gates: GateStatus[] | undefined;
  lastDecision: string | undefined;
  lastCheckTime: number | undefined;
  notes: string | undefined;
  onRecheck?: () => void;
}

const GATE_TROUBLESHOOTING: Record<string, string> = {
  g1: "Directional consensus is missing between indicators. Ensure that the price direction is clear, or toggle 'TREND_UP' / 'TREND_DOWN' simulation mode to force indicator alignment.",
  g2: "Flip-flop lock is active to avoid over-trading. Wait for a few more simulated candle closes before the engine permits another trade.",
  g3: "An active position is already open. The bot is restricted to a single concurrent trade. Close the active position in the positions ledger to enable new entries.",
  g4: "H4 higher-timeframe trend of the price action is opposing the entry. Look at changing simulation mode or waiting for technical price structure shift.",
  g5: "EMA lines (9 vs 21 or 20 vs 50) have too narrow a space or are crossed in the opposite direction. Requires clearer trend expansion.",
  g6: "RSI is in extreme overbought (>70 for BUY) or oversold (<30 for SELL) zones. The bot stays clear to avoid buying the top or selling the bottom.",
  g7: "ADX trend strength or momentum is too weak. Increase market movement or use the simulation speed slider to advance to higher volatility conditions.",
  g8: "Outer Bollinger Bands contain the price too tightly or price is outside valid boundaries. The risk desk is blocking entry.",
  g9: "Average True Range (ATR) volatility is below the floor limit. Gold is moving too slowly. Increase volatility parameters.",
  g10: "Gemini AI analysis has flagged high risk, or economic calendar news is locked out (NFP/CPI). Disengage veto parameters or wait for lockout clearance."
};

function getGateCloseness(g: GateStatus): { percent: number; label: string } {
  if (g.passed) {
    return { percent: 100, label: "Threshold Achieved" };
  }

  switch (g.id) {
    case "g1": {
      const matchConfluence = g.detail.match(/Confluence score is (\d+)\/10/i);
      const matchReq = g.detail.match(/requires >=(\d+)/i);
      if (matchConfluence && matchReq) {
        const cur = parseInt(matchConfluence[1], 10);
        const req = parseInt(matchReq[1], 10);
        const pct = Math.round((cur / req) * 100);
        return { percent: Math.max(10, Math.min(95, pct)), label: `Indicator Confluence: ${cur}/${req}` };
      }
      return { percent: 50, label: "Confluence Disagreement" };
    }
    case "g2":
      return { percent: 33, label: "Flip-flop Cooldown active" };
    case "g3":
      return { percent: 0, label: "Positions Buffer Limit: 1/1" };
    case "g4":
      return { percent: 40, label: "Framework Bias Mismatch" };
    case "g5": {
      const hrMatch = g.detail.match(/Hour:\s*(\d+)/i);
      if (hrMatch) {
        const hour = parseInt(hrMatch[1], 10);
        const hoursToGo = hour >= 22 ? (24 - hour + 7) : (7 - hour);
        const pct = Math.round(((9 - hoursToGo) / 9) * 100);
        return { percent: Math.max(10, Math.min(95, pct)), label: `Liquidity countdown: ${hoursToGo}h left` };
      }
      return { percent: 30, label: "Offsession Low-Spread Lock" };
    }
    case "g6": {
      const pnlMatch = g.detail.match(/P&L is \$?(-?\d+\.?\d*).*?Limit\s*\(\$?(\d+\.?\d*)\)/i);
      if (pnlMatch) {
        const curPnL = Math.abs(parseFloat(pnlMatch[1]));
        const limitAmt = parseFloat(pnlMatch[2]);
        const pct = Math.round(Math.max(10, Math.min(95, (1 - (curPnL / limitAmt)) * 100)));
        return { percent: pct, label: `Daily Drawdown Limit Buffer` };
      }
      return { percent: 15, label: "Drawdown Breach Stop" };
    }
    case "g7": {
      const rsiMatch = g.detail.match(/RSI is (?:Overbought|Oversold) \((\d+\.?\d*)/i);
      if (rsiMatch) {
        const rsiVal = parseFloat(rsiMatch[1]);
        const dist = rsiVal > 50 ? (100 - rsiVal) / 30 : rsiVal / 30;
        const pct = Math.round(Math.max(10, Math.min(95, dist * 100)));
        return { percent: pct, label: `RSI Buffer: ${rsiVal.toFixed(1)} / 70 max` };
      }
      return { percent: 45, label: "Market Volatility Compression Squeeze" };
    }
    case "g8": {
      const extensionMatch = g.detail.match(/Distance:\s*\$?(\d+\.?\d*).*?Max allowed:\s*\$?(\d+\.?\d*)/i);
      if (extensionMatch) {
        const distVal = parseFloat(extensionMatch[1]);
        const maxVal = parseFloat(extensionMatch[2]);
        const pct = Math.round(Math.min(95, (maxVal / distVal) * 100));
        return { percent: pct, label: `EMA Distance: $${distVal.toFixed(2)}/$${maxVal.toFixed(2)}` };
      }
      return { percent: 60, label: "EMA Over-Extension Lock" };
    }
    case "g9": {
      const adxMatch = g.detail.match(/ADX:\s*(\d+\.?\d*).*?requires >=(\d+)/i);
      if (adxMatch) {
        const current = parseFloat(adxMatch[1]);
        const target = parseFloat(adxMatch[2]);
        const pct = Math.round(Math.min(95, (current / target) * 100));
        return { percent: pct, label: `ADX Momentum: ${current.toFixed(1)}/${target}` };
      }
      const distanceMatch = g.detail.match(/distance:\s*\$?(\d+\.?\d*)/i);
      if (distanceMatch) {
        const distVal = parseFloat(distanceMatch[1]);
        const pct = Math.round(Math.max(15, Math.min(95, (1.5 / distVal) * 100)));
        return { percent: pct, label: `S/R Pivot Proximity` };
      }
      return { percent: 50, label: "Momentum / Key Structure Buffer" };
    }
    case "g10":
      return { percent: 20, label: "Macro Economic Calendar Lock" };
    default:
      return { percent: 55, label: "Calculating logic buffers..." };
  }
}

function MiniRadialGauge({ percent, passed }: { percent: number; passed: boolean }) {
  const radius = 10;
  const stroke = 2.5;
  const normalizedRadius = radius - stroke;
  const circumference = normalizedRadius * 2 * Math.PI;
  const strokeDashoffset = circumference - (percent / 100) * circumference;

  const color = passed 
    ? "stroke-emerald-400" 
    : percent >= 75 
      ? "stroke-orange-400" 
      : "stroke-red-500";
  
  const ghostColor = passed ? "stroke-emerald-950/40" : "stroke-neutral-800";

  return (
    <div className="relative inline-flex items-center justify-center w-7 h-7 shrink-0" title={`${percent}% threshold alignment`}>
      <svg className="w-7 h-7 transform -rotate-90">
        <circle
          className={`${ghostColor}`}
          fill="transparent"
          strokeWidth={stroke}
          r={normalizedRadius}
          cx="14"
          cy="14"
        />
        <circle
          className={`${color} transition-all duration-500 ease-out`}
          fill="transparent"
          strokeWidth={stroke}
          strokeDasharray={circumference + " " + circumference}
          style={{ strokeDashoffset }}
          strokeLinecap="round"
          r={normalizedRadius}
          cx="14"
          cy="14"
        />
      </svg>
      <span className="absolute text-[8px] font-mono font-bold text-neutral-300">
        {passed ? "✓" : percent}
      </span>
    </div>
  );
}

export function GateGauntlet({ gates, lastDecision, lastCheckTime, notes, onRecheck }: GateGauntletProps) {
  const [showDebugOverlay, setShowDebugOverlay] = useState(false);
  const [isRechecking, setIsRechecking] = useState(false);
  const [recheckFeedback, setRecheckFeedback] = useState<string | null>(null);

  const formatTime = (t: number) => {
    return new Date(t).toLocaleTimeString("en-US", { timeZone: "Asia/Colombo" }) + " (SLST)";
  };

  const handleTriggerRecheck = async () => {
    setIsRechecking(true);
    setRecheckFeedback(null);
    try {
      const res = await fetch("/api/recheck", { method: "POST" });
      if (res.ok) {
        setRecheckFeedback("Snapshot checklist updated successfully!");
        if (onRecheck) {
          onRecheck();
        }
        setTimeout(() => setRecheckFeedback(null), 3000);
      }
    } catch (err) {
      console.error("Manual recheck error:", err);
    } finally {
      setIsRechecking(false);
    }
  };

  const getStatusBanner = () => {
    if (!lastDecision || lastDecision === "HOLD" || lastDecision === "NO_SIGNAL") {
      return {
        bg: "bg-red-950/20 border-red-900/40 text-red-400",
        label: "AUTOMATED SIGNALS: PAUSED / INACTIVE",
        icon: ShieldAlert,
        summary: notes || "Consolidating price tick velocity. Waiting for directional consensus triggers."
      };
    }
    return {
      bg: "bg-green-950/40 border-green-800/40 text-green-400",
      label: `EXECUTION TRIGGERED: ${lastDecision} LIMIT ALIGNED`,
      icon: Award,
      summary: "All 10 quantitative risk gates approved this position. Order dispatched cleanly."
    };
  };

  const banner = getStatusBanner();
  const Icon = banner.icon;
  const isNoSignal = !lastDecision || lastDecision === "HOLD" || lastDecision === "NO_SIGNAL";
  const failedGates = gates ? gates.filter((g) => !g.passed) : [];

  return (
    <div id="gate-gauntlet-wrapper" className="relative bg-neutral-950/50 p-5 rounded-2xl border border-neutral-800 flex flex-col justify-between overflow-hidden min-h-[480px]">
      <div>
        <div id="gate-gauntlet-header" className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
          <div>
            <h3 className="font-display font-medium text-neutral-100 text-base">The Signal Gate Gauntlet</h3>
            <p className="text-xs text-neutral-400">Every candle close, the price is filtered sequentially through 10 strategic gates.</p>
          </div>
          <div className="flex items-center gap-2 shrink-0 self-end sm:self-auto">
            {lastCheckTime && (
              <span id="g-last-check-time" className="text-[10px] font-mono text-neutral-400 bg-neutral-900 border border-neutral-800 px-2 py-1 rounded">
                {formatTime(lastCheckTime)}
              </span>
            )}
            <button
              id="g-manual-recheck-btn"
              disabled={isRechecking}
              onClick={handleTriggerRecheck}
              className={`p-1 px-2.5 rounded-lg border text-neutral-300 hover:text-white flex items-center gap-1.5 font-mono text-[10px] font-bold uppercase transition-all whitespace-nowrap cursor-pointer select-none ${
                isRechecking 
                  ? "bg-neutral-900 border-neutral-800 opacity-50 cursor-not-allowed" 
                  : "bg-neutral-900 border-neutral-800 hover:bg-neutral-800 hover:border-neutral-700 active:bg-neutral-950"
              }`}
              title="Force manual gate check against live market snapshot"
            >
              <RefreshCw className={`w-3 h-3 text-amber-400 ${isRechecking ? "animate-spin" : ""}`} />
              <span>{isRechecking ? "checking" : "re-check"}</span>
            </button>
          </div>
        </div>

        {recheckFeedback && (
          <div className="mb-3 px-3 py-1.5 rounded-lg bg-emerald-950/30 border border-emerald-500/20 text-emerald-400 font-mono text-[10px] flex items-center gap-1.5 animate-pulse">
            <Check className="w-3.5 h-3.5" />
            <span>{recheckFeedback}</span>
          </div>
        )}

        {/* Global check summary with overlay toggle */}
        <div id="g-banner-container" className={`p-4 rounded-xl border border-dashed mb-5 flex flex-col sm:flex-row justify-between gap-3 items-start ${banner.bg}`}>
          <div className="flex gap-3 items-start">
            <Icon className="w-5 h-5 shrink-0 mt-0.5" />
            <div>
              <div className="text-xs font-mono font-bold uppercase tracking-widest flex items-center gap-1.5">
                {banner.label}
                {isNoSignal && (
                  <span className="relative flex h-1.5 w-1.5">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-red-500"></span>
                  </span>
                )}
              </div>
              <div className="text-xs font-sans text-neutral-300 mt-1 leading-relaxed">{banner.summary}</div>
            </div>
          </div>
          {isNoSignal && (
            <button
              id="g-debug-toggle-btn"
              onClick={() => setShowDebugOverlay(true)}
              className="mt-2 sm:mt-0 px-3 py-1.5 bg-amber-500 hover:bg-amber-600 text-neutral-950 font-bold font-mono text-[10px] rounded-lg shadow-lg hover:shadow-amber-500/10 cursor-pointer flex items-center gap-1.5 transition-all text-center self-stretch sm:self-auto shrink-0 animate-pulse"
            >
              <Terminal className="w-3.5 h-3.5" />
              <span>DIAGNOSE FAILURE</span>
            </button>
          )}
        </div>

        {/* List of 10 sequential gates */}
        <div className="space-y-2.5">
          {gates && gates.length > 0 ? (
            gates.map((g, idx) => {
              const closeness = getGateCloseness(g);
              const barColor = g.passed
                ? "bg-emerald-400"
                : closeness.percent >= 75
                  ? "bg-orange-400 animate-pulse"
                  : "bg-red-500/80";

              return (
                <div
                  key={g.id}
                  className={`p-3 rounded-xl border flex gap-3.5 transition-all items-start ${g.passed ? "bg-green-950/5 border-green-900/30 text-neutral-200" : "bg-red-950/10 border-red-900/30 text-neutral-300"}`}
                >
                  <div className="mt-0.5 shrink-0 flex flex-col items-center gap-1.5">
                    {g.passed ? (
                      <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                    ) : (
                      <XCircle className="w-4 h-4 text-red-400/80 animate-pulse" />
                    )}
                    <MiniRadialGauge percent={closeness.percent} passed={g.passed} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="text-[10px] font-mono font-bold text-neutral-500 bg-neutral-900 border border-neutral-800 px-1 py-0.2 rounded shrink-0">
                          GATE {(idx + 1).toString().padStart(2, "0")}
                        </span>
                        <span className="text-xs font-sans font-bold text-neutral-200 truncate">{g.name}</span>
                      </div>
                      {!g.passed && (
                        <span className="text-[9px] font-mono font-semibold text-neutral-400 shrink-0">
                          {closeness.percent}% aligned
                        </span>
                      )}
                    </div>
                    
                    <p className="text-[11px] text-neutral-400 leading-relaxed mt-1">{g.detail}</p>
                    
                    {/* Linear Progress Bar of parameter proximity */}
                    <div className="mt-2.5">
                      <div className="w-full bg-neutral-900/90 rounded-full h-1.5 overflow-hidden border border-neutral-800/60 flex">
                        <div
                          className={`h-full rounded-full transition-all duration-700 ease-out ${barColor}`}
                          style={{ width: `${closeness.percent}%` }}
                        />
                      </div>
                      <div className="flex justify-between items-center text-[9px] font-mono text-neutral-500 mt-1">
                        <span>{closeness.label}</span>
                        {g.passed ? (
                          <span className="text-emerald-400 font-bold">100% READY</span>
                        ) : (
                          <span>TARGET NOT MET</span>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })
          ) : (
            <div className="text-center py-10 text-neutral-500 text-xs font-mono">
              Waiting for initial tick candle close (approx. {lastCheckTime ? "30s" : "Instant"} in FAST Mode)...
            </div>
          )}
        </div>
      </div>

      {/* Diagnostics Overlay Component inside GateGauntlet */}
      {showDebugOverlay && (
        <div
          id="diagnostics-overlay-window"
          className="absolute inset-0 z-30 bg-neutral-950/98 backdrop-blur-md p-5 flex flex-col justify-between overflow-y-auto animate-in fade-in duration-200"
        >
          <div className="space-y-4">
            {/* Overlay Header */}
            <div id="diagnostics-header" className="flex items-center justify-between border-b border-neutral-800 pb-3">
              <div className="flex items-center gap-2">
                <Terminal className="w-4 h-4 text-amber-400 animate-pulse" />
                <h3 className="font-display font-bold text-neutral-100 text-sm tracking-tight uppercase">
                  Engine Signal Diagnostics
                </h3>
              </div>
              <button
                id="diagnostics-close-btn"
                onClick={() => setShowDebugOverlay(false)}
                className="p-1 px-2.5 rounded-lg bg-neutral-900 border border-neutral-800 hover:bg-neutral-800 text-neutral-400 hover:text-neutral-200 transition-colors cursor-pointer text-xs flex items-center gap-1 font-mono font-bold"
              >
                <X className="w-3.5 h-3.5" />
                <span>CLOSE</span>
              </button>
            </div>

            {/* Diagnostics Status Banner */}
            <div id="diagnostics-status-banner" className="p-3.5 rounded-xl bg-red-950/10 border border-red-900/30 text-neutral-300 font-mono">
              <div className="flex items-center gap-2 text-xs font-mono font-bold text-red-400 mb-1.5">
                <AlertTriangle className="w-4 h-4" />
                <span>DIAGNOSTICS READOUT: DISCORDANCE LOCK</span>
              </div>
              <p className="text-[11px] text-neutral-400 leading-relaxed font-mono">
                {notes || "Algorithmic safety checks detected a lack of indicators alignment. Trigger failed to discharge buy/sell instructions."}
              </p>
            </div>

            {/* List of active failed gates */}
            <div id="diagnostics-gates-list" className="space-y-3.5">
              <h4 className="text-[10px] uppercase font-mono font-bold text-neutral-500 tracking-wider">
                Sequential Broken Gates ({failedGates.length})
              </h4>
              <div className="space-y-3">
                {failedGates.length > 0 ? (
                  failedGates.map((g) => (
                    <div key={g.id} className="p-3 rounded-xl bg-neutral-900/40 border border-neutral-800 font-mono">
                      <div className="flex items-center justify-between border-b border-neutral-800/40 pb-1.5 mb-2">
                        <span className="text-[10px] font-bold text-red-400 bg-red-950/20 border border-red-900/30 px-1.5 py-0.5 rounded">
                          {g.id.toUpperCase()}: BLOCK
                        </span>
                        <span className="text-xs font-sans font-bold text-neutral-200">{g.name}</span>
                      </div>
                      <div className="space-y-2">
                        <div>
                          <span className="text-[9px] text-neutral-500 block uppercase">METRIC LOG</span>
                          <span className="text-[11px] text-neutral-400 leading-relaxed font-sans block">{g.detail}</span>
                        </div>
                        <div className="bg-amber-950/10 border-l-2 border-amber-500/55 p-2 rounded-r-md">
                          <span className="text-[9px] text-amber-500 font-bold block uppercase flex items-center gap-1">
                            <Wrench className="w-3 h-3" /> Live Trouble recommendation
                          </span>
                          <span className="text-[10.5px] text-neutral-300 leading-relaxed font-sans block mt-0.5">
                            {GATE_TROUBLESHOOTING[g.id] || "Adjust engine constraints or toggle simulations."}
                          </span>
                        </div>
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="text-center py-4 text-neutral-500 text-xs italic">
                    All sequential gates cleared! Position ledger is active or cooling-off recency guard is buffering.
                  </div>
                )}
              </div>
            </div>

            {/* Dynamic troubleshooting guidelines */}
            <div id="diagnostics-helper-card" className="p-3.5 rounded-xl bg-neutral-900/80 border border-neutral-800 space-y-2.5">
              <span className="text-[10px] font-mono font-bold text-amber-400 uppercase tracking-widest block flex items-center gap-1">
                <Lightbulb className="w-3.5 h-3.5 text-amber-400 animate-pulse" /> Live Repair Shortcuts
              </span>
              <ul className="list-disc pl-4 text-[10.5px] text-neutral-400 space-y-2 font-sans leading-relaxed">
                <li>
                  <strong className="text-neutral-200 font-bold font-sans">Trigger Indicator Overrides:</strong> Select the <strong className="text-amber-500 font-bold font-sans">TREND_UP</strong> or <strong className="text-amber-500 font-bold font-sans font-mono">TREND_DOWN</strong> simulation modes inside the controller dashboard. This immediately forces all technical indicators into perfect directional alignment!
                </li>
                <li>
                  <strong className="text-neutral-200 font-bold font-sans">Manage Active State Limits:</strong> Check if an active open position already exists. Under risk bounds, only one position is managed sequentially.
                </li>
              </ul>
            </div>
          </div>

          <div className="pt-4 mt-6 border-t border-neutral-800 flex justify-between items-center text-[9px] text-neutral-504 text-neutral-500 font-mono">
            <span>ENGINE STATUS MONITOR v1.0.4</span>
            <span>DIAG INTERFACE SLST</span>
          </div>
        </div>
      )}
    </div>
  );
}
