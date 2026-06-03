import React, { useState, useEffect } from "react";
import { BotState, BotParams } from "./types";
import { GoldChart } from "./components/GoldChart";
import { BrainDeck } from "./components/BrainDeck";
import { GateGauntlet } from "./components/GateGauntlet";
import { ControlDashboard } from "./components/ControlDashboard";
import { MetricsPanel } from "./components/MetricsPanel";
import { ExecutionGuideTimeline } from "./components/ExecutionGuideTimeline";
import { ShieldAlert, Cpu, Terminal, Radio } from "lucide-react";
import { motion } from "motion/react";

export default function App() {
  const [state, setState] = useState<BotState | null>(null);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");
  const [consecutiveFailures, setConsecutiveFailures] = useState(0);

  const fetchState = async () => {
    try {
      const res = await fetch("/api/state");
      if (!res.ok) throw new Error("Could not fetch state parameters");
      const data = await res.json();
      setState(data);
      setErrorMessage("");
      setConsecutiveFailures(0);
    } catch (err) {
      console.error(err);
      setConsecutiveFailures((prev) => {
        const next = prev + 1;
        if (next >= 3) {
          setErrorMessage("Lost contact with autonomous backend trading engine. Re-establishing connection...");
        }
        return next;
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchState();
    // Poll the backend simulator at 1200ms interval for balanced real-time performance and absolute stability
    const t = setInterval(fetchState, 1200);
    return () => clearInterval(t);
  }, []);

  const handleUpdateParams = async (newParams: Partial<BotParams>) => {
    try {
      await fetch("/api/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ params: newParams }),
      });
      fetchState();
    } catch (err) {
      console.error(err);
    }
  };

  const handleUpdateModeSpeed = async (mode: string, speed: string) => {
    try {
      await fetch("/api/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ simulationMode: mode, simulationSpeed: speed }),
      });
      fetchState();
    } catch (err) {
      console.error(err);
    }
  };

  const handleForceTrade = async (direction: "BUY" | "SELL") => {
    try {
      const res = await fetch("/api/manual-trigger", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: direction }),
      });
      const data = await res.json();
      if (!data.success) {
        alert(data.message);
      }
      fetchState();
    } catch (err) {
      console.error(err);
    }
  };

  const handleTriggerNews = async (title: string, impact: "HIGH" | "MEDIUM") => {
    try {
      await fetch("/api/trigger-news", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title, impact }),
      });
      fetchState();
    } catch (err) {
      console.error(err);
    }
  };

  const handleReset = async () => {
    if (!window.confirm("Caution: Are you sure you want to clear simulated balances and restore the core database to original defaults?")) return;
    try {
      await fetch("/api/reset", { method: "POST" });
      fetchState();
    } catch (err) {
      console.error(err);
    }
  };

  const handleAskMentor = async () => {
    try {
      const res = await fetch("/api/mentor", { method: "POST" });
      const data = await res.json();
      if (state) {
        setState({
          ...state,
          lastGeminiCoaching: data.coaching,
        });
      }
    } catch (err) {
      console.error(err);
    }
  };

  if (!state) {
    return (
      <div className="min-h-screen bg-[#0a0b0c] flex flex-col items-center justify-center font-sans px-4 text-center">
        <div className="w-12 h-12 rounded-full border-4 border-amber-500/20 border-t-amber-500 animate-spin mb-4" />
        <h2 className="text-sm font-mono text-amber-500 uppercase tracking-widest animate-pulse">
          {errorMessage ? "RECONNECTING TO AEGIS GOLD SERVER..." : "BOOTING AEGIS GOLD AUTONOMOUS ENGINE..."}
        </h2>
        {errorMessage && (
          <p className="text-xs text-red-500/90 font-mono mt-3 max-w-md bg-red-950/30 border border-red-900/30 p-3 rounded-xl">
            {errorMessage}
          </p>
        )}
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#070809] text-[#e4e6eb] font-sans selection:bg-amber-500 selection:text-black">
      {/* Top HUD Status Alert Block */}
      {errorMessage && (
        <div className="bg-red-950/70 text-red-400 border-b border-red-900/50 py-2 px-4 text-center text-xs font-mono flex items-center justify-center gap-2 animate-pulse sticky top-0 z-50">
          <ShieldAlert className="w-4 h-4" />
          <span>{errorMessage}</span>
        </div>
      )}

      {/* Main Command Header */}
      <header className="border-b border-neutral-900 bg-neutral-950/80 px-6 py-4 flex flex-col md:flex-row justify-between items-start md:items-center gap-4 sticky top-0 z-40 backdrop-blur-md">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="gold-border border rounded-lg p-1 px-2.5 bg-gradient-to-br from-amber-500/20 to-neutral-900">
              <span className="font-display font-black text-amber-400 text-sm tracking-wider">XAU/USD</span>
            </div>
            <div>
              <h1 className="font-display font-black text-neutral-100 text-lg tracking-tight uppercase flex items-center gap-2">
                Aegis Gold Autonomous System <span className="text-[10px] bg-amber-500/10 text-amber-400 border border-amber-500/30 font-mono font-bold py-0.5 px-2 rounded tracking-widest uppercase">AUTOPILOT RUNNING</span>
              </h1>
              <p className="text-[10px] text-neutral-500 font-mono tracking-wide">
                Simulated Institutional Trading Environment • Sri Lanka Local Time (SLST): {new Date().toLocaleTimeString("en-US", { timeZone: "Asia/Colombo" })} • System Local Time: {new Date().toLocaleTimeString()} UTC
              </p>
              <div className="flex flex-wrap gap-2 mt-1.5">
                <span className="text-[9px] text-neutral-500 font-mono flex items-center pr-1 select-none">INTEGRATION STATUS HUD:</span>
                <span className={`text-[9px] font-mono px-2 py-0.5 rounded border flex items-center gap-1 ${
                  state?.hasTwelveDataKey 
                    ? "bg-green-500/15 text-green-400 border-green-500/30" 
                    : "bg-amber-500/10 text-amber-500/80 border-amber-500/20"
                }`}>
                  <span className={`w-1 h-1 rounded-full ${state?.hasTwelveDataKey ? "bg-green-400" : "bg-amber-400 animate-pulse"}`} />
                  Twelve Data API: {state?.hasTwelveDataKey ? "ACTIVE (REAL GOLD FEED)" : "OFFLINE (SIMULATION TIMELINE)"}
                </span>

                <span className={`text-[9px] font-mono px-2 py-0.5 rounded border flex items-center gap-1 ${
                  state?.hasGeminiKey 
                    ? "bg-purple-500/15 text-purple-400 border-purple-500/30" 
                    : "bg-neutral-500/10 text-neutral-500 border-neutral-800"
                }`}>
                  <span className={`w-1 h-1 rounded-full ${state?.hasGeminiKey ? "bg-purple-400" : "bg-neutral-500"}`} />
                  Gemini Agent Mind: {state?.hasGeminiKey ? "ACTIVE (COACHING & ADVICE)" : "OFFLINE (RULE PRESETS ONLY)"}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Global Live Tickers */}
        <div className="flex gap-4 font-mono text-xs">
          <div className="bg-neutral-900/60 border border-neutral-800/80 px-3 py-1.5 rounded-xl text-center">
            <span className="text-[9px] text-neutral-500 block">REAL-TIME BID</span>
            <span className="text-amber-400 font-bold">${state?.goldPrice.toFixed(2)}</span>
          </div>
          <div className="bg-neutral-900/60 border border-neutral-800/80 px-3 py-1.5 rounded-xl text-center">
            <span className="text-[9px] text-neutral-500 block">UNREALIZED</span>
            <span className={`font-bold ${(state?.unrealizedPnL ?? 0) >= 0 ? "text-green-400" : "text-red-400"}`}>
              {(state?.unrealizedPnL ?? 0) >= 0 ? "+" : ""}${state?.unrealizedPnL.toFixed(2)}
            </span>
          </div>
          <div className="bg-neutral-900/60 border border-neutral-800/80 px-3 py-1.5 rounded-xl text-center">
            <span className="text-[9px] text-neutral-500 block">NET BALANCE</span>
            <span className="text-neutral-100 font-black">${state?.balance.toLocaleString("en", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
          </div>
        </div>
      </header>

      {/* Primary Cockpit Matrix Grid */}
      <main className="max-w-7xl mx-auto p-4 lg:p-6 space-y-6">
        
        {/* Dynamic State Roadmap Execution Timeline */}
        {state && (
          <ExecutionGuideTimeline
            activeTrade={state.activeTrade}
            lastDecision={state.lastSignalCheck?.decision}
            brains={state.lastSignalCheck?.brains}
            tradesLog={state.tradesLog}
          />
        )}
        
        {/* Row 1: The 5 Brain Analysers Deck */}
        {state && (
          <BrainDeck
            brains={state.lastSignalCheck?.brains || {
              b0_velocity: 0,
              b1_xgboost: 0.5,
              b2_confluence: 5,
              b3_gemini: { action: "HOLD", veto: false, reason: "Awaiting candle cycle metrics to analyze." },
              b4_news_lockout: false,
              b4_upcoming_news: "No lockouts"
            }}
            goldPrice={state.goldPrice}
            lastCoaching={state.lastGeminiCoaching}
            hasGeminiKey={state.hasGeminiKey}
            onAskMentor={handleAskMentor}
          />
        )}

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Left Column (2/3 width) */}
          <div className="lg:col-span-2 space-y-6">
            
            {/* Chart Area */}
            {state && (
              <GoldChart
                candles={state.candles}
                price={state.goldPrice}
                activeTrade={state.activeTrade}
              />
            )}

            {/* Controller Boxes */}
            {state && (
              <ControlDashboard
                params={state.params}
                simMode={state.simulationMode}
                simSpeed={state.simulationSpeed}
                hasTwelveDataKey={state.hasTwelveDataKey}
                onUpdateParams={handleUpdateParams}
                onUpdateModeSpeed={handleUpdateModeSpeed}
                onForceTrade={handleForceTrade}
                onTriggerNews={handleTriggerNews}
                onReset={handleReset}
              />
            )}
          </div>

          {/* Right Column (1/3 width) */}
          <div className="space-y-6">
            
            {/* 10 Decision Gates checking list */}
            <GateGauntlet
              gates={state?.lastSignalCheck?.gates}
              lastDecision={state?.lastSignalCheck?.decision}
              lastCheckTime={state?.lastSignalCheck?.time}
              notes={state?.lastSignalCheck?.notes}
              onRecheck={fetchState}
            />

            {/* System Blackbox Logs Console */}
            <div className="bg-neutral-950/50 p-5 rounded-2xl border border-neutral-800 flex flex-col justify-between">
              <div>
                <div className="flex justify-between items-center mb-3">
                  <div className="flex items-center gap-2">
                    <Terminal className="text-amber-500 w-4 h-4" />
                    <h3 className="font-display font-bold text-neutral-100 text-xs tracking-tight uppercase">System Flight Logs</h3>
                  </div>
                  <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />
                </div>

                <div className="bg-neutral-900/80 rounded-xl p-3 border border-neutral-800/80 font-mono text-[10px] space-y-2 h-[220px] overflow-y-auto scrollbar-thin flex flex-col">
                  {state?.auditLogs && state.auditLogs.length > 0 ? (
                    state.auditLogs.map((log, index) => {
                      const getTypeColor = () => {
                        if (log.type === "TRADE") return "text-green-400";
                        if (log.type === "RISK") return "text-red-400 font-bold";
                        if (log.type === "BRAIN") return "text-purple-400";
                        return "text-cyan-400";
                      };

                      // Generate a stable unique key
                      const itemKey = `${log.time}-${log.message.slice(0, 30)}`;

                      return (
                        <motion.div
                          key={itemKey}
                          layout="position"
                          initial={{ opacity: 0, y: -10, scale: 0.98 }}
                          animate={{ opacity: 1, y: 0, scale: 1 }}
                          transition={{ type: "spring", stiffness: 350, damping: 25 }}
                          className={`border-b border-neutral-950/40 pb-1.5 leading-relaxed text-neutral-300 flex items-start gap-1 flex-wrap transition-all ${
                            index === 0
                              ? "bg-amber-950/20 border-l border-amber-500/50 p-1 rounded-r shadow-[inset_0_0_10px_rgba(245,158,11,0.03)]"
                              : ""
                          }`}
                        >
                          <span className="text-neutral-500 shrink-0" title="Sri Lanka Standard Time (SLST)">
                            [{new Date(log.time).toLocaleTimeString("en-US", { timeZone: "Asia/Colombo" })}]
                          </span>{" "}
                          <span className={`font-black shrink-0 ${getTypeColor()}`}>[{log.type}]</span>{" "}
                          <span className="flex-1 min-w-0 break-words">{log.message}</span>
                          {index === 0 && (
                            <span className="ml-1 text-[8px] font-mono font-bold bg-amber-500/20 text-amber-400 px-1 py-0.2 rounded border border-amber-500/35 animate-pulse tracking-wide select-none">
                              LATEST
                            </span>
                          )}
                        </motion.div>
                      );
                    })
                  ) : (
                    <div className="text-center py-20 text-neutral-600">Awaiting system flight events...</div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Row 3: Account Metrics & Finished Positions List */}
        {state && (
          <MetricsPanel
            balance={state.balance}
            equity={state.equity}
            unrealizedPnL={state.activeTrade ? state.activeTrade.unrealizedPl : 0}
            tradesLog={state.tradesLog}
            activeTrade={state.activeTrade}
          />
        )}
      </main>
    </div>
  );
}
