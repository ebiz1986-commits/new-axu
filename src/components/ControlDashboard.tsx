import React, { useState } from "react";
import { BotParams } from "../types";
import { Sliders, Zap, Play, Radio, Calendar, Trash2, Ban } from "lucide-react";

interface ControlDashboardProps {
  params: BotParams;
  simMode: string;
  simSpeed: string;
  hasTwelveDataKey?: boolean;
  onUpdateParams: (newParams: Partial<BotParams>) => Promise<void>;
  onUpdateModeSpeed: (mode: string, speed: string) => Promise<void>;
  onForceTrade: (direction: "BUY" | "SELL") => Promise<void>;
  onTriggerNews: (title: string, impact: "HIGH" | "MEDIUM") => Promise<void>;
  onReset: () => Promise<void>;
}

export function ControlDashboard({
  params,
  simMode,
  simSpeed,
  hasTwelveDataKey = false,
  onUpdateParams,
  onUpdateModeSpeed,
  onForceTrade,
  onTriggerNews,
  onReset,
}: ControlDashboardProps) {
  // Local state for inputs
  const [risk, setRisk] = useState(params.riskPercent);
  const [b1, setB1] = useState(params.b1Threshold);
  const [b2, setB2] = useState(params.b2Floor);
  const [newsWindow, setNewsWindow] = useState(params.newsLockoutWindowMinutes);
  const [lockoutDaily, setLockoutDaily] = useState(params.lockoutMaxDailyLossPercent);

  // News custom events
  const [newsTitle, setNewsTitle] = useState("USD Fed Interest Decision (Simulated)");
  const [newsImpact, setNewsImpact] = useState<"HIGH" | "MEDIUM">("HIGH");

  const handleSaveParams = async (e: React.FormEvent) => {
    e.preventDefault();
    await onUpdateParams({
      riskPercent: Number(risk),
      b1Threshold: Number(b1),
      b2Floor: Number(b2),
      newsLockoutWindowMinutes: Number(newsWindow),
      lockoutMaxDailyLossPercent: Number(lockoutDaily),
    });
    alert("Simulator parameters saved.");
  };

  const handleNewsSubmit = async () => {
    if (!newsTitle.trim()) return;
    await onTriggerNews(newsTitle, newsImpact);
    setNewsTitle("");
  };

  return (
    <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
      {/* 1. Simulation Scenarios & Timings Control Box */}
      <div className="bg-neutral-950/50 p-5 rounded-2xl border border-neutral-800 flex flex-col justify-between">
        <div>
          <div className="flex items-center gap-2 mb-3">
            <Zap className="text-amber-500 w-5 h-5" />
            <h3 className="font-display font-black text-neutral-100 text-sm tracking-tight uppercase">Gold Simulation Controller</h3>
          </div>
          <p className="text-xs text-neutral-400 mb-4">Fast-forward time and test custom market stress scenarios to observe exit mechanics.</p>

          {/* Scenario select */}
          <div className="mb-4">
            <label className="text-[10px] font-mono text-neutral-400 font-bold uppercase tracking-widest block mb-2">Preset Scenario</label>
            <div className="grid grid-cols-2 gap-2 text-xs">
              {[
                { id: "LIVE", label: "Random Live Walk" },
                { id: "TREND_UP", label: "📈 Trend Up (Bull Rush)" },
                { id: "TREND_DOWN", label: "📉 Trend Down (Waterfall)" },
                { id: "CHOP", label: "↔️ Sideways Chop" },
                { id: "NEWS_SPIKE", label: "⚡ news spike" },
                { id: "TWELVE_DATA", label: "🌐 Twelve Data Price Feed" },
              ].map((item) => (
                <button
                  key={item.id}
                  onClick={() => onUpdateModeSpeed(item.id, simSpeed)}
                  className={`py-2 px-3 rounded-lg border text-left font-medium transition-all ${simMode === item.id ? "bg-amber-500 text-black border-amber-400 font-bold" : "bg-neutral-900 border-neutral-800 text-neutral-300 hover:border-neutral-700"}`}
                >
                  {item.label}
                </button>
              ))}
            </div>
          </div>

          {/* Speed settings */}
          <div>
            <label className="text-[10px] font-mono text-neutral-400 font-bold uppercase tracking-widest block mb-2">Simulation Engine Speed</label>
            <div className="flex gap-2">
              {[
                { id: "REALTIME", label: "Realtime (2.5s Ticks)" },
                { id: "FAST", label: "Fast (1.2s Ticks)" },
                { id: "ULTRA", label: "Ultra Hyper (0.15s Ticks)" },
              ].map((sp) => (
                <button
                  key={sp.id}
                  onClick={() => onUpdateModeSpeed(simMode, sp.id)}
                  className={`flex-1 py-1.5 px-2 rounded-lg border text-center text-xs transition-all ${simSpeed === sp.id ? "bg-[#38bdf8] text-black border-[#0ea5e9] font-bold" : "bg-neutral-900 border-neutral-800 text-neutral-400 hover:border-neutral-700"}`}
                >
                  {sp.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="pt-4 border-t border-neutral-800/60 mt-4 text-[10px] text-neutral-500 flex justify-between items-center font-mono">
          <span>STATUS: AUTOPILOT ACTIVE</span>
          <span className="animate-pulse text-amber-500">ENGINE CLOCKED AT 3000 MHz</span>
        </div>
      </div>

      {/* 2. Parameters Tuning Form */}
      <div className="bg-neutral-950/50 p-5 rounded-2xl border border-neutral-800">
        <div className="flex items-center gap-2 mb-3">
          <Sliders className="text-purple-400 w-5 h-5" />
          <h3 className="font-display font-black text-neutral-100 text-sm tracking-tight uppercase">Tweak Algorithmic Gates</h3>
        </div>
        <p className="text-xs text-neutral-400 mb-4">Fine-tune indicator thresholds to observe how loosening/tightening impacts trade volume.</p>

        <form onSubmit={handleSaveParams} className="space-y-4 text-xs">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-[10px] font-mono text-neutral-400 block mb-1 uppercase font-bold tracking-widest">Risk Allocation (%)</label>
              <input
                type="number"
                step="0.1"
                min="0.1"
                max="5.0"
                value={risk}
                onChange={(e) => setRisk(Number(e.target.value))}
                className="w-full bg-neutral-900 border border-neutral-800 p-2 rounded-lg text-neutral-100 focus:outline-none focus:border-amber-500 font-mono"
              />
            </div>
            <div>
              <label className="text-[10px] font-mono text-neutral-400 block mb-1 uppercase font-bold tracking-widest">XGBoost Threshold (B1)</label>
              <input
                type="number"
                step="0.01"
                min="0.5"
                max="0.95"
                value={b1}
                onChange={(e) => setB1(Number(e.target.value))}
                className="w-full bg-neutral-900 border border-neutral-800 p-2 rounded-lg text-neutral-100 focus:outline-none focus:border-amber-500 font-mono"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-[10px] font-mono text-neutral-400 block mb-1 uppercase font-bold tracking-widest">Technical Confluence (B2)</label>
              <input
                type="number"
                step="1"
                min="4"
                max="10"
                value={b2}
                onChange={(e) => setB2(Number(e.target.value))}
                className="w-full bg-neutral-900 border border-neutral-800 p-2 rounded-lg text-neutral-100 focus:outline-none focus:border-amber-500 font-mono"
              />
            </div>
            <div>
              <label className="text-[10px] font-mono text-neutral-400 block mb-1 uppercase font-bold tracking-widest">News Lockout window (M)</label>
              <input
                type="number"
                step="1"
                min="1"
                max="30"
                value={newsWindow}
                onChange={(e) => setNewsWindow(Number(e.target.value))}
                className="w-full bg-neutral-900 border border-neutral-800 p-2 rounded-lg text-neutral-100 focus:outline-none focus:border-amber-500 font-mono"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-[10px] font-mono text-neutral-400 block mb-1 uppercase font-bold tracking-widest">Max Daily Loss (%)</label>
              <input
                type="number"
                step="0.1"
                min="0.5"
                max="10.0"
                value={lockoutDaily}
                onChange={(e) => setLockoutDaily(Number(e.target.value))}
                className="w-full bg-neutral-900 border border-neutral-800 p-2 rounded-lg text-neutral-100 focus:outline-none focus:border-amber-500 font-mono"
              />
            </div>
            <div className="flex items-end">
              <button
                type="submit"
                className="w-full bg-gradient-to-r from-purple-500 to-indigo-600 hover:from-purple-600 hover:to-indigo-700 py-2.5 px-4 rounded-lg font-bold text-neutral-100 hover:scale-102 hover:shadow-lg transition-all text-xs outline-none"
              >
                Apply Parameters
              </button>
            </div>
          </div>
        </form>
      </div>

      {/* 3. News Dispatch & Emergency Control Deck */}
      <div className="bg-neutral-950/50 p-5 rounded-2xl border border-neutral-800 flex flex-col justify-between">
        <div>
          <div className="flex items-center gap-2 mb-3">
            <Radio className="text-red-400 w-5 h-5 animate-pulse" />
            <h3 className="font-display font-black text-neutral-100 text-sm tracking-tight uppercase">Interactive Manual Spikes</h3>
          </div>
          <p className="text-xs text-neutral-400 mb-4">Manually inject sudden news releases or bypass signals to verify the ATR stop loss models.</p>

          {/* Dispatch custom calendar news items */}
          <div className="bg-neutral-900 p-3 rounded-xl border border-neutral-800 mb-4">
            <span className="text-[9px] font-mono font-bold text-red-400 uppercase tracking-widest block mb-2">Virtual Economic calendar</span>
            <div className="flex gap-2">
              <input
                type="text"
                placeholder="USD CPI News Event..."
                value={newsTitle}
                onChange={(e) => setNewsTitle(e.target.value)}
                className="flex-1 bg-neutral-950 text-xs border border-neutral-800 p-2 rounded-lg text-neutral-200 outline-none focus:border-red-500"
              />
              <button
                onClick={handleNewsSubmit}
                className="bg-red-950/30 font-bold hover:bg-red-500 hover:text-white text-red-400 border border-red-900/60 transition-all text-xs px-2 rounded-lg py-1 flex items-center gap-1 shrink-0"
              >
                <Calendar className="w-3 h-3" /> Spike News
              </button>
            </div>
          </div>

          <div className="flex gap-3">
            <button
              onClick={() => onForceTrade("BUY")}
              className="flex-1 bg-green-500/10 hover:bg-green-500 hover:text-black hover:scale-102 text-green-400 font-bold border border-green-500/30 text-xs py-2 px-3 rounded-xl transition-all"
            >
              Manual BUY entry
            </button>
            <button
              onClick={() => onForceTrade("SELL")}
              className="flex-1 bg-red-500/10 hover:bg-red-500 hover:text-black hover:scale-102 text-red-400 font-bold border border-red-500/30 text-xs py-2 px-3 rounded-xl transition-all"
            >
              Manual SELL entry
            </button>
          </div>
        </div>

        {/* Global wiping parameters */}
        <div className="flex justify-between items-center border-t border-neutral-800/60 pt-4 mt-4">
          <span className="text-[10px] text-neutral-500 font-mono uppercase tracking-wider">Emergency overrides</span>
          <button
            onClick={onReset}
            className="flex items-center gap-1 bg-red-500/20 hover:bg-red-500 hover:text-white border border-red-500/30 text-red-400 font-bold text-[10px] font-mono px-3 py-1.5 rounded-lg active:scale-95 transition-all"
          >
            <Trash2 className="w-3.5 h-3.5" /> Wipe Bot Database & Restarts
          </button>
        </div>
      </div>
    </div>
  );
}
