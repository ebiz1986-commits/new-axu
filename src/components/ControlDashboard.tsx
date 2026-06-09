import React, { useState, useEffect } from "react";
import { BotParams } from "../types";
import { Sliders, Zap, Play, Radio, Calendar, Trash2, Ban, Send, Info, Check, HelpCircle, AlertCircle, Volume2, VolumeX, TrendingUp, TrendingDown } from "lucide-react";

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
  soundEnabled: boolean;
  onToggleSound: (enabled: boolean) => void;
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
  soundEnabled,
  onToggleSound,
}: ControlDashboardProps) {
  // Local state for inputs
  const [risk, setRisk] = useState(params.riskPercent);
  const [b1, setB1] = useState(params.b1Threshold);
  const [b2, setB2] = useState(params.b2Floor);
  const [newsWindow, setNewsWindow] = useState(params.newsLockoutWindowMinutes);
  const [lockoutDaily, setLockoutDaily] = useState(params.lockoutMaxDailyLossPercent);
  const [sessionLockoutEnabled, setSessionLockoutEnabled] = useState(params.isSessionLockoutEnabled || false);

  // Telegram pipeline states
  const [telegramToken, setTelegramToken] = useState(params.telegramBotToken || "");
  const [telegramChatId, setTelegramChatId] = useState(params.telegramChatId || "");
  const [telegramEnabled, setTelegramEnabled] = useState(params.isTelegramEnabled || false);

  const [testLoading, setTestLoading] = useState(false);
  const [testResult, setTestResult] = useState<{ success: boolean; msg: string } | null>(null);

  // Sync state whenever parents load/modify parameters
  useEffect(() => {
    setTelegramToken(params.telegramBotToken || "");
    setTelegramChatId(params.telegramChatId || "");
    setTelegramEnabled(params.isTelegramEnabled || false);
    setSessionLockoutEnabled(params.isSessionLockoutEnabled || false);
  }, [params.telegramBotToken, params.telegramChatId, params.isTelegramEnabled, params.isSessionLockoutEnabled]);

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
      isSessionLockoutEnabled: sessionLockoutEnabled,
    });
    alert("Simulator parameters saved.");
  };

  const handleSaveTelegram = async () => {
    await onUpdateParams({
      telegramBotToken: telegramToken,
      telegramChatId: telegramChatId,
      isTelegramEnabled: telegramEnabled,
    });
    alert("Telegram integration settings updated.");
  };

  const handleTestTelegram = async () => {
    if (!telegramToken.trim() || !telegramChatId.trim()) {
      alert("Please enter a valid Telegram Bot Token and Chat ID to run connection checks.");
      return;
    }
    setTestLoading(true);
    setTestResult(null);
    try {
      const response = await fetch("/api/test-telegram", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ botToken: telegramToken, chatId: telegramChatId }),
      });
      const data = await response.json();
      if (response.ok && data.success) {
        setTestResult({ success: true, msg: data.detail });
      } else {
        setTestResult({ success: false, msg: data.error || "Delivery failed." });
      }
    } catch (err: any) {
      setTestResult({ success: false, msg: "Connection check failed: " + err.message });
    } finally {
      setTestLoading(false);
    }
  };

  const handleNewsSubmit = async () => {
    if (!newsTitle.trim()) return;
    await onTriggerNews(newsTitle, newsImpact);
    setNewsTitle("");
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-4 gap-6">
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
            <label className="text-[10px] font-mono text-neutral-400 font-bold uppercase tracking-widest block mb-1.5">Preset Scenario</label>
            <div className="flex flex-col gap-1.5 text-xs">
              {[
                { id: "LIVE", label: "🌐 Real-Time Gold Feed" },
                { id: "TREND_UP", label: "📈 Trend Up (Bull Rush)" },
                { id: "TREND_DOWN", label: "📉 Trend Down (Waterfall)" },
                { id: "CHOP", label: "↔️ Sideways Chop" },
                { id: "NEWS_SPIKE", label: "⚡ news spike" },
                { id: "TWELVE_DATA", label: "🌐 Twelve Data Price Feed" },
              ].map((item) => (
                <button
                  key={item.id}
                  onClick={() => onUpdateModeSpeed(item.id, simSpeed)}
                  className={`w-full py-1.5 px-3 rounded-lg border text-left font-semibold transition-all flex items-center justify-between cursor-pointer select-none ${
                    simMode === item.id 
                      ? "bg-amber-500/15 border-amber-500/50 text-amber-400 shadow-sm shadow-amber-500/10" 
                      : "bg-neutral-900/60 border-neutral-800 text-neutral-400 hover:border-neutral-700 hover:text-neutral-300"
                  }`}
                >
                  <span className="truncate">{item.label}</span>
                  {simMode === item.id && <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse shrink-0" />}
                </button>
              ))}
            </div>
          </div>

          {/* Speed settings */}
          <div className="mb-4">
            <label className="text-[10px] font-mono text-neutral-400 font-bold uppercase tracking-widest block mb-1.5">Simulation Engine Speed</label>
            <div className="grid grid-cols-3 gap-1.5">
              {[
                { id: "REALTIME", label: "Realtime", desc: "2.5s" },
                { id: "FAST", label: "Fast", desc: "1.2s" },
                { id: "ULTRA", label: "Ultra", desc: "0.15s" },
              ].map((sp) => (
                <button
                  key={sp.id}
                  onClick={() => onUpdateModeSpeed(simMode, sp.id)}
                  className={`py-1.5 px-1 rounded-lg border text-center transition-all cursor-pointer flex flex-col items-center justify-center select-none ${
                    simSpeed === sp.id 
                      ? "bg-sky-500/15 text-sky-450 border-sky-500/40 font-bold" 
                      : "bg-neutral-900 border-neutral-800 text-neutral-400 hover:border-neutral-750"
                  }`}
                >
                  <span className="text-[11px] leading-tight">{sp.label}</span>
                  <span className={`text-[8.5px] font-mono mt-0.5 leading-none ${simSpeed === sp.id ? "text-sky-300" : "text-neutral-500"}`}>{sp.desc}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Sound notifications */}
          <div>
            <label className="text-[10px] font-mono text-neutral-400 font-bold uppercase tracking-widest block mb-1.5">Audio Notifications</label>
            <button
              type="button"
              onClick={() => onToggleSound(!soundEnabled)}
              className={`w-full flex items-center justify-between py-2 px-3.5 rounded-lg border text-xs font-semibold select-none transition-all ${
                soundEnabled
                  ? "bg-amber-500/15 text-amber-400 border-amber-500/35 hover:bg-amber-500/25 cursor-pointer"
                  : "bg-neutral-900 border-neutral-800 text-neutral-500 hover:border-neutral-700 hover:text-neutral-400 cursor-pointer"
              }`}
            >
              <div className="flex items-center gap-2">
                {soundEnabled ? <Volume2 className="w-4 h-4 text-amber-400 animate-bounce" style={{ animationDuration: '2s' }} /> : <VolumeX className="w-4 h-4 text-neutral-500" />}
                <span>{soundEnabled ? "Audio Cues Enabled" : "Audio Cues Muted"}</span>
              </div>
              <span className={`text-[9px] font-mono font-bold px-2 py-0.5 rounded ${
                soundEnabled ? "bg-amber-500/25 text-amber-300" : "bg-neutral-950 text-neutral-600"
              }`}>
                {soundEnabled ? "ON" : "OFF"}
              </span>
            </button>
          </div>
        </div>

        <div className="pt-4 border-t border-neutral-800/60 mt-4 text-[10px] text-neutral-500 flex justify-between items-center font-mono">
          <span>STATUS: AUTOPILOT ACTIVE</span>
          <span className="animate-pulse text-amber-500">ENGINE PORT: 3000</span>
        </div>
      </div>

      {/* 2. Parameters Tuning Form */}
      <div className="bg-neutral-950/50 p-5 rounded-2xl border border-neutral-800 flex flex-col justify-between">
        <div>
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
                  className="w-full bg-neutral-900 border border-neutral-850 p-2 rounded-lg text-neutral-100 focus:outline-none focus:border-purple-500 font-mono"
                />
              </div>
              <div>
                <label className="text-[10px] font-mono text-neutral-400 block mb-1 uppercase font-bold tracking-widest">XGBoost (B1)</label>
                <input
                  type="number"
                  step="0.01"
                  min="0.5"
                  max="0.95"
                  value={b1}
                  onChange={(e) => setB1(Number(e.target.value))}
                  className="w-full bg-neutral-900 border border-neutral-850 p-2 rounded-lg text-neutral-100 focus:outline-none focus:border-purple-500 font-mono"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-[10px] font-mono text-neutral-400 block mb-1 uppercase font-bold tracking-widest">Confluence (B2)</label>
                <input
                  type="number"
                  step="1"
                  min="4"
                  max="10"
                  value={b2}
                  onChange={(e) => setB2(Number(e.target.value))}
                  className="w-full bg-neutral-900 border border-neutral-850 p-2 rounded-lg text-neutral-100 focus:outline-none focus:border-purple-500 font-mono"
                />
              </div>
              <div>
                <label className="text-[10px] font-mono text-neutral-400 block mb-1 uppercase font-bold tracking-widest">Lockout (M)</label>
                <input
                  type="number"
                  step="1"
                  min="0"
                  max="30"
                  value={newsWindow}
                  onChange={(e) => setNewsWindow(Number(e.target.value))}
                  className="w-full bg-neutral-900 border border-neutral-850 p-2 rounded-lg text-neutral-100 focus:outline-none focus:border-purple-500 font-mono"
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
                  className="w-full bg-neutral-900 border border-neutral-850 p-2 rounded-lg text-neutral-100 focus:outline-none focus:border-purple-500 font-mono"
                />
              </div>
              <div className="flex flex-col justify-end">
                <label className="flex items-center gap-2 cursor-pointer bg-neutral-900/60 px-2 py-2 rounded-lg border border-neutral-800 hover:border-neutral-750 select-none">
                  <input
                    type="checkbox"
                    checked={sessionLockoutEnabled}
                    onChange={(e) => setSessionLockoutEnabled(e.target.checked)}
                    className="w-4 h-4 text-purple-500 focus:ring-purple-500 bg-neutral-950 border-neutral-850 rounded cursor-pointer"
                  />
                  <div className="flex flex-col min-w-0">
                    <span className="text-[9.5px] text-neutral-200 font-bold uppercase tracking-wide">Asian Lock</span>
                    <span className="text-[8.5px] text-neutral-500 truncate">Lock session clock</span>
                  </div>
                </label>
              </div>
            </div>

            <button
              type="submit"
              className="w-full bg-gradient-to-r from-purple-500 to-indigo-600 hover:from-purple-600 hover:to-indigo-700 py-2.5 px-4 rounded-lg font-bold text-neutral-100 hover:shadow-lg transition-all text-xs outline-none uppercase font-mono tracking-widest mt-2 cursor-pointer select-none"
            >
              Apply Parameters
            </button>
          </form>
        </div>

        <div className="pt-4 border-t border-neutral-800/60 mt-4 text-[10px] text-neutral-500 flex justify-between items-center font-mono">
          <span>PIPELINE: ACTIVE</span>
          <span className="text-purple-400">GATES AUDITED</span>
        </div>
      </div>

      {/* 3. News Dispatch & Emergency Control Deck */}
      <div className="bg-neutral-950/50 p-5 rounded-2xl border border-neutral-800 flex flex-col justify-between">
        <div className="flex-1">
          <div className="flex items-center gap-2 mb-3">
            <Radio className="text-red-400 w-5 h-5 animate-pulse" />
            <h3 className="font-display font-black text-neutral-100 text-sm tracking-tight uppercase">Interactive Manual Spikes</h3>
          </div>
          <p className="text-xs text-neutral-400 mb-4">Manually inject sudden news releases or bypass signals to verify the ATR stop loss models.</p>

          {/* Dispatch custom calendar news items - Vertically Stacked to Prevent Overlapping */}
          <div className="bg-neutral-900/50 p-3 rounded-xl border border-neutral-850 mb-4 flex flex-col gap-2.5">
            <div>
              <span className="text-[9px] font-mono font-bold text-red-400 uppercase tracking-widest block mb-1">Economic Event Descriptor</span>
              <input
                type="text"
                placeholder="USD CPI News Event..."
                value={newsTitle}
                onChange={(e) => setNewsTitle(e.target.value)}
                className="w-full bg-neutral-950 text-xs border border-neutral-800 p-2 rounded-lg text-neutral-200 outline-none focus:border-red-500 font-mono"
              />
            </div>
            <button
              onClick={handleNewsSubmit}
              className="w-full justify-center bg-red-950/30 font-bold hover:bg-red-500 hover:text-white text-red-400 border border-red-900/40 hover:border-red-500 transition-all text-xs rounded-lg py-2 flex items-center gap-1.5 cursor-pointer select-none"
            >
              <Calendar className="w-3.5 h-3.5" /> Inject News Spike
            </button>
          </div>

          <div className="grid grid-cols-2 gap-2.5">
            <button
              onClick={() => onForceTrade("BUY")}
              className="flex items-center justify-center gap-1.5 py-2.5 px-2 bg-green-500/10 hover:bg-green-500 hover:text-black text-green-400 font-extrabold border border-green-500/20 hover:border-green-400 rounded-xl transition-all text-xs cursor-pointer select-none active:scale-95"
            >
              <TrendingUp className="w-4 h-4 shrink-0" /> BUY
            </button>
            <button
              onClick={() => onForceTrade("SELL")}
              className="flex items-center justify-center gap-1.5 py-2.5 px-2 bg-red-500/10 hover:bg-red-500 hover:text-black text-red-400 font-extrabold border border-red-500/20 hover:border-red-400 rounded-xl transition-all text-xs cursor-pointer select-none active:scale-95"
            >
              <TrendingDown className="w-4 h-4 shrink-0" /> SELL
            </button>
          </div>
        </div>

        {/* Global wiping parameters */}
        <div className="flex flex-col gap-2 border-t border-neutral-800/60 pt-4 mt-5">
          <span className="text-[9px] text-neutral-500 font-mono uppercase tracking-wider block font-bold">Emergency Overrides</span>
          <button
            onClick={onReset}
            className="w-full flex items-center justify-center gap-1.5 bg-red-500/10 hover:bg-red-600 hover:text-white border border-red-500/20 text-red-400 font-bold text-xs py-2 rounded-lg active:scale-95 transition-all cursor-pointer select-none font-mono"
          >
            <Trash2 className="w-3.5 h-3.5" /> Wipe Bot Database
          </button>
        </div>
      </div>

      {/* 4. Telegram Broadcaster Control Box */}
      <div className="bg-neutral-950/50 p-5 rounded-2xl border border-neutral-800 flex flex-col justify-between">
        <div>
          <div className="flex items-center gap-2 mb-3">
            <Send className="text-sky-400 w-5 h-5" />
            <h3 className="font-display font-black text-neutral-100 text-sm tracking-tight uppercase">Telegram Broadcaster</h3>
          </div>
          <p className="text-xs text-neutral-400 mb-4">
            Route real-time Execution Guide Timeline phases, lot details, and TP/SL limits directly to your Telegram channel!
          </p>

          <div className="space-y-3 text-xs">
            {/* Token entry */}
            <div>
              <label className="text-[10px] font-mono text-neutral-400 block mb-1 uppercase font-bold tracking-widest">BOT API TOKEN</label>
              <input
                type="password"
                placeholder="e.g. 1234567890:AAF7u-X8..."
                value={telegramToken}
                onChange={(e) => setTelegramToken(e.target.value)}
                className="w-full bg-neutral-900 border border-neutral-850 p-2 rounded-lg text-neutral-100 placeholder-neutral-600 focus:outline-none focus:border-sky-500 font-mono text-xs"
              />
            </div>

            {/* Chat ID entry */}
            <div>
              <label className="text-[10px] font-mono text-neutral-400 block mb-1 uppercase font-bold tracking-widest">CHAT ID / HANDLE</label>
              <input
                type="text"
                placeholder="e.g. -10012345678 or @channel"
                value={telegramChatId}
                onChange={(e) => setTelegramChatId(e.target.value)}
                className="w-full bg-neutral-900 border border-neutral-850 p-2 rounded-lg text-neutral-100 placeholder-neutral-600 focus:outline-none focus:border-sky-500 font-mono text-xs"
              />
            </div>

            {/* Enabled switch toggles */}
            <div className="flex items-center justify-between bg-neutral-900/60 p-2 rounded-xl border border-neutral-855">
              <div className="flex flex-col">
                <span className="text-[10px] font-bold text-neutral-200 tracking-wide uppercase">Broadcast Live</span>
                <span className="text-[9px] text-neutral-500">Enable automated channel alerts</span>
              </div>
              <input
                type="checkbox"
                checked={telegramEnabled}
                onChange={(e) => setTelegramEnabled(e.target.checked)}
                className="w-4 h-4 rounded border-neutral-850 text-sky-500 focus:ring-sky-500 bg-neutral-900 cursor-pointer"
              />
            </div>

            {/* Connection test and save dashboard */}
            <div className="grid grid-cols-2 gap-2 pt-1">
              <button
                onClick={handleTestTelegram}
                disabled={testLoading}
                className="bg-neutral-900 hover:bg-neutral-800 text-neutral-350 font-bold border border-neutral-800 text-xs py-2 px-1 rounded-lg active:scale-95 transition-all text-center disabled:opacity-50 cursor-pointer select-none"
              >
                {testLoading ? "Checking..." : "⚡ Test Ping"}
              </button>
              <button
                onClick={handleSaveTelegram}
                className="bg-[#0284c7] hover:bg-[#0369a1] text-white font-bold text-xs py-2 px-1 rounded-lg active:scale-95 transition-all text-center cursor-pointer select-none"
              >
                💾 Save Pipeline
              </button>
            </div>

            {/* Render Connection Diagnostics result */}
            {testResult && (
              <div className={`p-2 rounded-lg text-[10px] border font-mono flex items-start gap-1.5 ${
                testResult.success 
                  ? "bg-emerald-950/40 text-emerald-400 border-emerald-500/20" 
                  : "bg-red-950/40 text-red-400 border-red-500/20"
              }`}>
                {testResult.success ? (
                  <Check className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                ) : (
                  <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                )}
                <span className="break-all">{testResult.msg}</span>
              </div>
            )}
          </div>
        </div>

        {/* Dynamic step-by-step guidance accordion lists */}
        <div className="border-t border-neutral-800/60 pt-4 mt-4 text-[9.5px] text-neutral-500 font-medium">
          <span className="text-[9px] text-sky-400 font-mono uppercase tracking-wider block font-bold mb-1.5">How to set this up:</span>
          <div className="space-y-1 font-mono text-[9px] leading-relaxed">
            <div>1. Open Telegram Search <span className="text-neutral-450 font-bold">@BotFather</span></div>
            <div>2. Message <span className="text-amber-500 font-mono">/newbot</span> to get Token ID</div>
            <div>3. Use <span className="text-neutral-450 font-bold">@GetMyChatID_Bot</span> for Chat ID</div>
            <div>4. Create public channel, add bot as <span className="text-neutral-450 font-bold">Admin</span></div>
          </div>
        </div>
      </div>
    </div>
  );
}
