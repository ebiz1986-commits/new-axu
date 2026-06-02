import React from "react";
import { GateStatus } from "../types";
import { CheckCircle2, XCircle, ShieldAlert, Award } from "lucide-react";

interface GateGauntletProps {
  gates: GateStatus[] | undefined;
  lastDecision: string | undefined;
  lastCheckTime: number | undefined;
  notes: string | undefined;
}

export function GateGauntlet({ gates, lastDecision, lastCheckTime, notes }: GateGauntletProps) {
  const formatTime = (t: number) => {
    return new Date(t).toLocaleTimeString();
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

  return (
    <div className="bg-neutral-950/50 p-5 rounded-2xl border border-neutral-800 flex flex-col justify-between">
      <div>
        <div className="flex justify-between items-center mb-4">
          <div>
            <h3 className="font-display font-bold text-neutral-100 text-base">The Signal Gate Gauntlet</h3>
            <p className="text-xs text-neutral-400">Every candle close, the price is filtered sequentially through 10 strategic gates.</p>
          </div>
          {lastCheckTime && (
            <span className="text-[10px] font-mono text-neutral-500 bg-neutral-900 border border-neutral-800 px-2 py-1 rounded">
              Last check: {formatTime(lastCheckTime)}
            </span>
          )}
        </div>

        {/* Global check summary */}
        <div className={`p-4 rounded-xl border border-dashed mb-5 flex gap-3 items-start ${banner.bg}`}>
          <Icon className="w-5 h-5 shrink-0 mt-0.5" />
          <div>
            <div className="text-xs font-mono font-bold uppercase tracking-widest">{banner.label}</div>
            <div className="text-xs font-sans text-neutral-300 mt-1 leading-relaxed">{banner.summary}</div>
          </div>
        </div>

        {/* List of 10 sequential gates */}
        <div className="space-y-2.5">
          {gates && gates.length > 0 ? (
            gates.map((g, idx) => (
              <div
                key={g.id}
                className={`p-3 rounded-xl border flex items-start gap-3 transition-all ${g.passed ? "bg-green-950/5 border-green-900/30 text-neutral-200" : "bg-red-950/10 border-red-900/30 text-neutral-300"}`}
              >
                <div className="mt-0.5 shrink-0">
                  {g.passed ? (
                    <CheckCircle2 className="w-4 h-4 text-green-400" />
                  ) : (
                    <XCircle className="w-4 h-4 text-red-400 animate-pulse" />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] font-mono font-bold text-neutral-500 bg-neutral-900 border border-neutral-800 px-1 py-0.2 rounded shrink-0">
                      GATE {(idx + 1).toString().padStart(2, "0")}
                    </span>
                    <span className="text-xs font-sans font-bold text-neutral-200 truncate">{g.name}</span>
                  </div>
                  <p className="text-[11px] text-neutral-400 leading-relaxed mt-1">{g.detail}</p>
                </div>
              </div>
            ))
          ) : (
            <div className="text-center py-10 text-neutral-500 text-xs font-mono">
              Waiting for initial tick candle close (approx. {lastCheckTime ? "30s" : "Instant"} in FAST Mode)...
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
