import React from "react";
import { ActiveTrade, BrainDecision, CompletedTrade } from "../types";
import { Clock, Zap, ShieldAlert, AlertTriangle, Sparkles, ArrowRight, CheckCircle2 } from "lucide-react";

interface ExecutionGuideTimelineProps {
  activeTrade: ActiveTrade | null;
  lastDecision: "BUY" | "SELL" | "NO_SIGNAL" | undefined;
  brains: BrainDecision | undefined;
  tradesLog: CompletedTrade[];
}

export function ExecutionGuideTimeline({ activeTrade, lastDecision, brains, tradesLog }: ExecutionGuideTimelineProps) {
  const lastTrade = tradesLog.length > 0 ? tradesLog[0] : null;

  // Compute current active stage
  let activeStage = 1; // 1 = Prepare, 2 = Enter, 3 = Hold, 4 = Exit Prepare, 5 = Profit Banqed
  let subText = "System scanning real-time quantitative gold (XAU/USD) order flows...";
  let highlightedDirection: "BUY" | "SELL" | null = null;

  // Check XGBoost for setup prep
  const b1 = brains?.b1_xgboost ?? 0.5;
  const isPrepBuy = b1 >= 0.60;
  const isPrepSell = b1 <= 0.40;

  if (activeTrade) {
    if (activeTrade.isPartialClosed || activeTrade.stopMovedToBE) {
      activeStage = 4;
      highlightedDirection = activeTrade.type;
      subText = `PARTIAL TARGET SECURED: Trailing remaining ${activeTrade.qty} lots on ${activeTrade.type} position. Guarding break-even level.`;
    } else {
      activeStage = 3;
      highlightedDirection = activeTrade.type;
      subText = `HOLD ENTRY ACTIVE: Running ${activeTrade.type} position. Active Lot size: 0.01. Entry: $${activeTrade.entryPrice.toFixed(2)} • TP: $${activeTrade.tp.toFixed(2)}`;
    }
  } else if (lastDecision === "BUY" || lastDecision === "SELL") {
    activeStage = 2;
    highlightedDirection = lastDecision;
    subText = `TRIGGER FIRED: All 10 quantitative risk gates passed! Dispatching automated ${lastDecision} market execution loop.`;
  } else {
    // Stage 1 (Prepare) or Stage 5 (Take Profit / completed recently)
    const justClosed = lastTrade && (Date.now() - lastTrade.exitTime < 15000); // 15 seconds after closure
    if (justClosed && lastTrade) {
      activeStage = 5;
      highlightedDirection = lastTrade.type;
      subText = `TRADE CYCLE COMPLETE: ${lastTrade.type} exit finalized via ${lastTrade.exitReason}. Realized P&L: ${lastTrade.profit >= 0 ? "+" : ""}$${lastTrade.profit.toFixed(2)} USD.`;
    } else {
      activeStage = 1;
      if (isPrepBuy) {
        highlightedDirection = "BUY";
        subText = `PREPARE BUY IS COMING: Momentum is building Upward. Confluence indicators assembling candidate Buy patterns at Pivot Support.`;
      } else if (isPrepSell) {
        highlightedDirection = "SELL";
        subText = `PREPARE SELL IS COMING: Volatility expanding Downward. Alignment channels brewing potential Sell configurations under Resistance.`;
      } else {
        subText = "Awaiting directional breakout. Confluence algorithms are monitoring volatile spreads to prepare entries.";
      }
    }
  }

  const steps = [
    {
      id: 1,
      title: "PREPARE SETUP",
      desc: highlightedDirection && activeStage === 1 
        ? `Prepare ${highlightedDirection}` 
        : "Prepare Signal",
      icon: Clock,
      color: "from-amber-600 to-yellow-500",
      accent: "text-amber-400"
    },
    {
      id: 2,
      title: "EXECUTION",
      desc: highlightedDirection && activeStage === 2
        ? `ENTER THE ${highlightedDirection}!`
        : "Gate Execution",
      icon: Zap,
      color: "from-cyan-600 to-indigo-500",
      accent: "text-cyan-400"
    },
    {
      id: 3,
      title: "HOLD ENTRY",
      desc: activeTrade ? `Hold ${activeTrade.type} (0.01 Lot)` : "Hold Position",
      icon: ShieldAlert,
      color: "from-green-600 to-emerald-500",
      accent: "text-green-500"
    },
    {
      id: 4,
      title: "PREPARE EXIT",
      desc: "Trail & Secure",
      icon: AlertTriangle,
      color: "from-pink-600 to-rose-500",
      accent: "text-pink-400"
    },
    {
      id: 5,
      title: "TAKE PROFIT",
      desc: "Bank & Clear",
      icon: Sparkles,
      color: "from-purple-600 to-blue-500",
      accent: "text-purple-400"
    }
  ];

  return (
    <div className="bg-neutral-950/40 p-5 rounded-2xl border border-neutral-800 backdrop-blur-sm shadow-xl relative overflow-hidden select-none mb-6">
      <div className="absolute top-0 right-0 p-4 opacity-5 pointer-events-none">
        <Sparkles className="w-24 h-24 text-amber-400" />
      </div>

      {/* Dynamic Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2 mb-5 border-b border-neutral-900/80 pb-3">
        <div>
          <h3 className="font-display font-black text-neutral-100 text-xs tracking-wider uppercase flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-amber-400 animate-ping" />
            Live Market Strategy & Execution Guide Flow
          </h3>
          <p className="text-[10px] text-neutral-500 font-mono mt-0.5">STATE AUTOMATON PIPELINE</p>
        </div>
        
        {/* Highlighted Live Entry Banner */}
        {highlightedDirection && (
          <div className="flex items-center gap-1.5 shrink-0">
            <span className="text-[10px] font-mono text-neutral-400">DIRECTION FOCUS:</span>
            <span className={`text-[11px] font-black tracking-widest uppercase px-3 py-1 rounded shadow-lg border  ${
              highlightedDirection === "BUY"
                ? "bg-emerald-950/50 text-emerald-400 border-emerald-500/30 animate-pulse"
                : "bg-rose-950/50 text-rose-400 border-rose-500/30 animate-pulse"
            }`}>
              {highlightedDirection === "BUY" ? "🟢 BUY HIGHLIGHTED" : "🔴 SELL HIGHLIGHTED"}
            </span>
          </div>
        )}
      </div>

      {/* Progress Timeline Roadmap Bar */}
      <div className="grid grid-cols-5 md:grid-cols-5 items-center gap-1.5 md:gap-4 relative z-10 py-2">
        {steps.map((step, idx) => {
          const isActive = activeStage === step.id;
          const isPassed = activeStage > step.id;
          const IconComponent = step.icon;

          return (
            <div key={step.id} className="flex flex-col items-center text-center relative group">
              {/* Connecting lines */}
              {idx < steps.length - 1 && (
                <div className={`absolute left-[50%] right-[-50%] top-6 h-0.5 z-0 ${
                  isPassed 
                    ? "bg-gradient-to-r from-emerald-500 to-indigo-500" 
                    : isActive 
                    ? "bg-[#ea580c] bg-opacity-40 animate-pulse"
                    : "bg-neutral-800"
                }`} />
              )}

              {/* Glowing Circle Button */}
              <div className={`relative z-10 w-11 h-11 md:w-12 md:h-12 rounded-full flex items-center justify-center transition-all duration-300 ${
                isActive 
                  ? `bg-neutral-900 border-2 ${highlightedDirection === "BUY" ? "border-emerald-500 shadow-[0_0_15px_rgba(16,185,129,0.35)]" : highlightedDirection === "SELL" ? "border-rose-500 shadow-[0_0_15px_rgba(244,63,94,0.35)]" : "border-amber-500 shadow-[0_0_15px_rgba(245,158,11,0.3)]"} scale-110` 
                  : isPassed 
                  ? "bg-gradient-to-br from-emerald-500/20 to-neutral-900 border border-emerald-500/50 scale-100" 
                  : "bg-neutral-900 border border-neutral-800 scale-95"
              }`}>
                {isPassed ? (
                  <CheckCircle2 className="w-5.5 h-5.5 text-emerald-400" />
                ) : (
                  <IconComponent className={`w-5 h-5 ${
                    isActive 
                      ? highlightedDirection === "BUY" ? "text-emerald-400" : highlightedDirection === "SELL" ? "text-rose-400" : "text-amber-400" 
                      : "text-neutral-500"
                  }`} />
                )}

                {/* Outer concentric pulsing target circle */}
                {isActive && (
                  <div className={`absolute -inset-1.5 rounded-full border-2 border-dashed animate-spin ${
                    highlightedDirection === "BUY" ? "border-emerald-500/15" : highlightedDirection === "SELL" ? "border-rose-500/15" : "border-amber-500/15"
                  }`} />
                )}
              </div>

              {/* Labels */}
              <span className={`text-[9px] md:text-[10px] font-mono tracking-wider mt-2.5 font-bold uppercase transition-colors duration-300 ${
                isActive 
                  ? highlightedDirection === "BUY" ? "text-emerald-400" : highlightedDirection === "SELL" ? "text-rose-400" : "text-amber-400" 
                  : isPassed 
                  ? "text-neutral-400" 
                  : "text-neutral-600"
              }`}>
                {step.title}
              </span>
              <span className="text-[8px] md:text-[9px] text-neutral-500 mt-0.5 truncate max-w-full font-medium italic hidden sm:block">
                {isActive && highlightedDirection && step.id === 1 ? `Prepare ${highlightedDirection}` : step.desc}
              </span>
            </div>
          );
        })}
      </div>

      {/* Dynamic Description Box */}
      <div className="mt-4 bg-neutral-900/60 rounded-xl p-3 border border-neutral-850/80 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className={`w-2 h-2 rounded-full shrink-0 ${
            activeStage === 5 
              ? "bg-purple-500" 
              : activeStage === 4 
              ? "bg-pink-500/80" 
              : activeStage === 3 
              ? "bg-emerald-500 animate-pulse" 
              : activeStage === 2 
              ? "bg-cyan-500 animate-bounce" 
              : "bg-amber-500"
          }`} />
          <p className="text-xs font-sans text-neutral-350 leading-relaxed font-semibold">
            {subText}
          </p>
        </div>
        
        {/* Interactive current Lot tag indicator */}
        <div className="hidden md:flex items-center gap-2 font-mono text-[10px] bg-neutral-950 px-2 py-1 rounded border border-neutral-800">
          <span className="text-neutral-500">LOT CALIBRATION:</span>
          <span className="text-green-400 font-extrabold">0.01 LOT</span>
        </div>
      </div>
    </div>
  );
}
