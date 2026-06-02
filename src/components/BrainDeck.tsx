import React, { useState } from "react";
import { BrainDecision } from "../types";
import { Brain, Cpu, TrendingUp, AlertTriangle, RefreshCw } from "lucide-react";

interface BrainDeckProps {
  brains: BrainDecision;
  goldPrice: number;
  lastCoaching: string;
  hasGeminiKey: boolean;
  onAskMentor: () => Promise<void>;
}

export function BrainDeck({ brains, goldPrice, lastCoaching, hasGeminiKey, onAskMentor }: BrainDeckProps) {
  const [asking, setAsking] = useState(false);

  // Parse XGBoost visual alignment
  const xgboostPercent = Math.round(brains.b1_xgboost * 100);
  const getXGBoostColor = (val: number) => {
    if (val >= 0.65) return "text-green-400 bg-green-950/40 border-green-800";
    if (val <= 0.35) return "text-red-400 bg-red-950/40 border-red-800";
    return "text-neutral-400 bg-neutral-900/60 border-neutral-800";
  };

  const handleMentorClick = async () => {
    setAsking(true);
    await onAskMentor();
    setAsking(false);
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
      {/* Brain 0: B0 Pre-Trigger */}
      <div className="bg-neutral-950/50 p-4 rounded-xl border border-neutral-800 flex flex-col justify-between">
        <div>
          <div className="flex justify-between items-start mb-2">
            <span className="text-[10px] font-mono font-bold text-cyan-400 uppercase tracking-widest bg-cyan-950/40 border border-cyan-800/60 px-1.5 py-0.5 rounded">B0 • Early warning</span>
            <Cpu className="w-4 h-4 text-cyan-400" />
          </div>
          <h4 className="font-display font-bold text-neutral-100 text-sm">Tick-Velocity Meter</h4>
          <p className="text-xs text-neutral-400 mt-1">Tracks instantaneous derivative rate-of-change over the last 10 gold ticks.</p>
        </div>
        <div className="mt-4">
          <div className="bg-neutral-900 p-2.5 rounded-lg border border-neutral-800 font-mono text-center">
            <div className={`text-xl font-bold font-mono tracking-tight ${brains.b0_velocity > 1.5 ? "text-green-400" : brains.b0_velocity < -1.5 ? "text-red-400" : "text-neutral-300"}`}>
              {brains.b0_velocity >= 0 ? "+" : ""}{brains.b0_velocity.toFixed(2)} pts
            </div>
            <div className="text-[9px] text-neutral-500 mt-0.5">SPEED (PTS / SEC)</div>
          </div>

          <div className="mt-2.5 flex items-center justify-center gap-1.5 text-xs font-semibold">
            {brains.b0_velocity > 2.0 && (
              <span className="text-green-400 bg-green-950/40 border border-green-800 px-2 py-0.5 rounded-full animate-bounce">
                🚀 ROCKET MOMENTUM
              </span>
            )}
            {brains.b0_velocity < -2.0 && (
              <span className="text-red-400 bg-red-950/40 border border-red-800 px-2 py-0.5 rounded-full animate-bounce">
                🌊 WATERFALL DUMP
              </span>
            )}
            {Math.abs(brains.b0_velocity) <= 2.0 && (
              <span className="text-neutral-500 bg-neutral-900 border border-neutral-800/60 px-2 py-0.5 rounded-full">
                STRETCHING CONSOLIDATION
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Brain 1: B1 XGBoost Model */}
      <div className="bg-neutral-950/50 p-4 rounded-xl border border-neutral-800 flex flex-col justify-between">
        <div>
          <div className="flex justify-between items-start mb-2">
            <span className="text-[10px] font-mono font-bold text-purple-400 uppercase tracking-widest bg-purple-950/40 border border-purple-800/60 px-1.5 py-0.5 rounded">B1 • Predictor</span>
            <TrendingUp className="w-4 h-4 text-purple-400" />
          </div>
          <h4 className="font-display font-bold text-neutral-100 text-sm">XGBoost ML Forecast</h4>
          <p className="text-xs text-neutral-400 mt-1">Generates statistical up-probability forecast for the upcoming 5-minute candle.</p>
        </div>
        <div className="mt-4">
          <div className={`p-3 rounded-lg border text-center ${getXGBoostColor(brains.b1_xgboost)}`}>
            <div className="text-2xl font-black font-mono">{xgboostPercent}%</div>
            <div className="text-[9px] font-bold uppercase mt-1">probability of UP move</div>
          </div>
          <div className="mt-2.5 text-[10px] text-center text-neutral-500 font-mono">
            BUY threshold &gt;=65% | SELL &lt;=35%
          </div>
        </div>
      </div>

      {/* Brain 2: B2 Confluence Score */}
      <div className="bg-neutral-950/50 p-4 rounded-xl border border-neutral-800 flex flex-col justify-between">
        <div>
          <div className="flex justify-between items-start mb-2">
            <span className="text-[10px] font-mono font-bold text-green-400 uppercase tracking-widest bg-green-950/40 border border-green-800/60 px-1.5 py-0.5 rounded">B2 • Indicators</span>
            <TrendingUp className="w-4 h-4 text-green-400" />
          </div>
          <h4 className="font-display font-bold text-neutral-100 text-sm">Technical Confluence</h4>
          <p className="text-xs text-neutral-400 mt-1">Aggregates trend direction (EMA crossovers, RSI levels, volatility expansions).</p>
        </div>
        <div className="mt-4">
          <div className="bg-neutral-900 p-2.5 rounded-lg border border-neutral-800 text-center">
            <div className="text-2xl font-black font-mono text-green-400">{brains.b2_confluence}<span className="text-neutral-500 text-xs">/10</span></div>
            <div className="text-[9px] text-neutral-400 font-bold uppercase mt-0.5">alignment score</div>
          </div>
          <div className="mt-2 text-[10px] text-center text-neutral-500">
            Requires minimum 6.0/10 confluence to approve entries.
          </div>
        </div>
      </div>

      {/* Brain 4: B4 Economic Calendar Lockouts */}
      <div className="bg-neutral-950/50 p-4 rounded-xl border border-neutral-800 flex flex-col justify-between">
        <div>
          <div className="flex justify-between items-start mb-2">
            <span className="text-[10px] font-mono font-bold text-red-400 uppercase tracking-widest bg-red-950/40 border border-red-800/60 px-1.5 py-0.5 rounded">B4 • Risk lock</span>
            <AlertTriangle className="w-4 h-4 text-red-500" />
          </div>
          <h4 className="font-display font-bold text-neutral-100 text-sm">Economic Lockout Gate</h4>
          <p className="text-xs text-neutral-400 mt-1">ForexFactory real-time tracker protecting entries around major economic releases.</p>
        </div>
        <div className="mt-4">
          {brains.b4_news_lockout ? (
            <div className="bg-red-950/40 border border-red-500/50 text-red-400 p-2.5 rounded-lg text-center animate-pulse">
              <div className="text-[10px] font-black uppercase tracking-wider mb-0.5 flex items-center justify-center gap-1">
                <span>⚠️ BLOCK ACTIVE</span>
              </div>
              <div className="text-[10px] font-sans font-medium hover:underline truncate" title={brains.b4_upcoming_news}>
                {brains.b4_upcoming_news}
              </div>
            </div>
          ) : (
            <div className="bg-green-950/20 border border-green-800/30 text-green-400 p-2.5 rounded-lg text-center">
              <div className="text-[10px] font-black uppercase tracking-wider mb-0.5">🔒 PIPELINE SAFE</div>
              <div className="text-[10px] text-neutral-400 hover:underline truncate" title={brains.b4_upcoming_news}>
                {brains.b4_upcoming_news}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Brain 3: B3 Gemini AI Mentor / Analyst */}
      <div className="bg-neutral-950/50 p-4 rounded-xl border border-amber-800/40 lg:col-span-1 flex flex-col justify-between">
        <div>
          <div className="flex justify-between items-start mb-2">
            <span className="text-[10px] font-mono font-bold text-amber-400 uppercase tracking-widest bg-amber-950/40 border border-amber-800/60 px-1.5 py-0.5 rounded">B3 • Gemini Analyst</span>
            <Brain className="w-4 h-4 text-amber-400" />
          </div>
          <h4 className="font-display font-bold text-neutral-100 text-sm">Strategic Veto Guard</h4>
          <p className="text-xs text-neutral-400 mt-1">Continuous contextual LLM analysis confirming macro structure alignment.</p>
        </div>
        <div className="mt-4">
          <div className="bg-amber-950/10 border border-amber-800/20 text-neutral-300 p-2.5 rounded-lg">
            <div className="flex justify-between items-center mb-1">
              <span className="text-[9px] font-bold text-amber-400 font-mono tracking-widest">DECISION:</span>
              <span className={`text-[10px] font-black underline px-1 rounded ${brains.b3_gemini.action === 'BUY' ? 'text-green-400 bg-green-950/30' : brains.b3_gemini.action === 'SELL' ? 'text-red-400 bg-red-950/30' : 'text-neutral-400 bg-neutral-900'}`}>
                {brains.b3_gemini.action} {brains.b3_gemini.veto ? "• VETOED" : ""}
              </span>
            </div>
            <p className="text-[10px] leading-relaxed text-neutral-400 line-clamp-2" title={brains.b3_gemini.reason}>
              {brains.b3_gemini.reason}
            </p>
          </div>
        </div>
      </div>

      {/* Gemini AI Coach Briefing Card */}
      <div className="bg-gradient-to-r from-neutral-950 to-[#12110c] p-5 rounded-2xl border border-amber-500/20 lg:col-span-5 gold-glow flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div className="flex-1">
          <div className="flex items-center gap-2 mb-1.5">
            <span className="text-xs font-mono font-bold text-amber-400 tracking-wider flex items-center gap-1 bg-amber-950/40 border border-amber-800/40 px-2 py-0.5 rounded-md">
              <Brain className="w-3.5 h-3.5 text-amber-500 inline" /> Gemini 2.5-Coach Briefing
            </span>
            <span className="text-neutral-500 text-xs font-mono">XAU/USD Active Advisor Channel</span>
          </div>
          <p className="text-xs text-neutral-300 italic max-w-4xl leading-relaxed">
            "{lastCoaching}"
          </p>
        </div>
        <button
          onClick={handleMentorClick}
          disabled={asking}
          className="bg-amber-500/10 hover:bg-amber-500 hover:text-black hover:scale-102 transition-all border border-amber-500/30 font-medium text-amber-400 text-xs px-4 py-2.5 rounded-xl flex items-center gap-2 font-mono"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${asking ? "animate-spin" : ""}`} />
          {asking ? "Consulting AI Coach..." : "Consult AI Coach"}
        </button>
      </div>
    </div>
  );
}
