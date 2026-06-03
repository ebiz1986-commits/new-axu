import React from "react";
import { CompletedTrade, ActiveTrade } from "../types";
import { ShieldCheck, TrendingUp, TrendingDown, DollarSign, PieChart, Activity } from "lucide-react";
import { motion } from "motion/react";

interface MetricsPanelProps {
  balance: number;
  equity: number;
  unrealizedPnL: number;
  tradesLog: CompletedTrade[];
  activeTrade?: ActiveTrade | null;
}

export function MetricsPanel({ balance, equity, unrealizedPnL, tradesLog, activeTrade }: MetricsPanelProps) {
  // Compute Stats
  const totalTradesCount = tradesLog.length;
  const profitableTrades = tradesLog.filter((t) => t.profit > 0);
  const winRate = totalTradesCount > 0 ? (profitableTrades.length / totalTradesCount) * 100 : 0;

  const totalGains = tradesLog.filter((t) => t.profit > 0).reduce((sum, t) => sum + t.profit, 0);
  const totalLosses = Math.abs(tradesLog.filter((t) => t.profit < 0).reduce((sum, t) => sum + t.profit, 0));

  const profitFactor = totalLosses > 0 ? totalGains / totalLosses : totalGains > 0 ? 99.9 : 0;
  
  // Expectancy = (Win% * AvgWin) - (Loss% * AvgLoss)
  const avgWin = profitableTrades.length > 0 ? totalGains / profitableTrades.length : 0;
  const lossTradesCount = totalTradesCount - profitableTrades.length;
  const avgLoss = lossTradesCount > 0 ? totalLosses / lossTradesCount : 0;
  const expectancy = (winRate / 100) * avgWin - ((100 - winRate) / 100) * avgLoss;

  const totalClosedPnL = tradesLog.reduce((sum, t) => sum + t.profit, 0);

  return (
    <div className="space-y-6">
      {/* Dynamic Stats Row */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
        {/* Metric 1 */}
        <div className="bg-neutral-950/50 p-4 rounded-xl border border-neutral-800">
          <div className="flex justify-between items-center text-neutral-400 text-[10px] uppercase font-mono tracking-wider font-bold mb-1">
            <span>Account Balance</span>
            <DollarSign className="w-3.5 h-3.5 text-neutral-500" />
          </div>
          <p className="text-xl font-bold font-mono text-neutral-100">${balance.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
          <div className="text-[10px] text-neutral-500 mt-1">Starting size: $50.00</div>
        </div>

        {/* Metric 2 */}
        <div className="bg-neutral-950/50 p-4 rounded-xl border border-neutral-800">
          <div className="flex justify-between items-center text-neutral-400 text-[10px] uppercase font-mono tracking-wider font-bold mb-1">
            <span>Account Equity</span>
            <Activity className="w-3.5 h-3.5 text-neutral-500" />
          </div>
          <p className="text-xl font-bold font-mono text-neutral-100">${equity.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
          <div className="text-[10px] text-neutral-500 mt-1">
            Unrealized:{" "}
            <span className={unrealizedPnL >= 0 ? "text-green-400 font-bold" : "text-red-400 font-bold"}>
              {unrealizedPnL >= 0 ? "+" : ""}${unrealizedPnL.toFixed(2)}
            </span>
          </div>
        </div>

        {/* Metric 3 */}
        <div className="bg-neutral-950/50 p-4 rounded-xl border border-neutral-800">
          <div className="flex justify-between items-center text-neutral-400 text-[10px] uppercase font-mono tracking-wider font-bold mb-1">
            <span>Net Closed Profit</span>
            <PieChart className="w-3.5 h-3.5 text-neutral-500" />
          </div>
          <p className={`text-xl font-bold font-mono ${totalClosedPnL >= 0 ? "text-green-400" : "text-red-400"}`}>
            {totalClosedPnL >= 0 ? "+" : ""}${totalClosedPnL.toLocaleString("en-US", { minimumFractionDigits: 2 })}
          </p>
          <div className="text-[10px] text-neutral-500 mt-1">From {totalTradesCount} finished trades</div>
        </div>

        {/* Metric 4 */}
        <div className="bg-neutral-950/50 p-4 rounded-xl border border-neutral-800">
          <div className="flex justify-between items-center text-neutral-400 text-[10px] uppercase font-mono tracking-wider font-bold mb-1">
            <span>Bot Win Rate</span>
            <ShieldCheck className="w-3.5 h-3.5 text-neutral-500" />
          </div>
          <p className="text-xl font-black font-mono text-neutral-100">{winRate.toFixed(1)}%</p>
          <div className="text-[10px] text-neutral-500 mt-1">Target benchmark: &gt;50%</div>
        </div>

        {/* Metric 5 */}
        <div className="bg-neutral-950/50 p-4 rounded-xl border border-neutral-800">
          <div className="flex justify-between items-center text-neutral-400 text-[10px] uppercase font-mono tracking-wider font-bold mb-1">
            <span>Profit Factor</span>
            <TrendingUp className="w-3.5 h-3.5 text-neutral-500" />
          </div>
          <p className="text-xl font-bold font-mono text-neutral-100">{profitFactor === 99.9 ? "∞" : profitFactor.toFixed(2)}x</p>
          <div className="text-[10px] text-neutral-500 mt-1">Gains relative to losses</div>
        </div>

        {/* Metric 6 */}
        <div className="bg-neutral-950/50 p-4 rounded-xl border border-neutral-800">
          <div className="flex justify-between items-center text-neutral-400 text-[10px] uppercase font-mono tracking-wider font-bold mb-1">
            <span>Expectancy</span>
            <TrendingDown className="w-3.5 h-3.5 text-neutral-500" />
          </div>
          <p className={`text-xl font-bold font-mono ${expectancy >= 0 ? "text-green-400" : "text-red-400"}`}>
            {expectancy >= 0 ? "+" : ""}${expectancy.toFixed(1)}
          </p>
          <div className="text-[10px] text-neutral-500 mt-1">Avg dollar return per trade</div>
        </div>
      </div>

      {/* Completed Trades Ledger Table */}
      <div className="bg-neutral-950/50 p-5 rounded-2xl border border-neutral-800">
        <h3 className="font-display font-bold text-neutral-100 text-sm tracking-tight mb-4 uppercase">AUTONOMOUS POSITIONS LEDGER</h3>

        {activeTrade && (
          <motion.div
            initial={{ opacity: 0, y: -15, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            transition={{ type: "spring", stiffness: 300, damping: 20 }}
            className="mb-6 p-4 rounded-xl bg-neutral-900/40 border border-amber-500/20 shadow-[0_0_15px_rgba(245,158,11,0.03)]"
          >
            <div className="flex items-center justify-between mb-3 border-b border-neutral-800/60 pb-2">
              <div className="flex items-center gap-2">
                <span className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
                </span>
                <h4 className="text-xs font-bold font-mono text-emerald-400 uppercase tracking-widest">LIVE OPEN CRITICAL POSITION</h4>
              </div>
              <span className="text-[10px] text-neutral-500 font-mono">
                Piped into Execution Guide Timeline Stage {activeTrade.isPartialClosed || activeTrade.stopMovedToBE ? "4" : "3"}
              </span>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4 text-xs font-mono">
              <div>
                <span className="text-[9px] text-neutral-500 block uppercase">POS Type / ID</span>
                <div className="flex items-center gap-1.5 mt-0.5">
                  <span className={`text-[10px] font-black px-1.5 py-0.5 rounded ${activeTrade.type === "BUY" ? "bg-emerald-950/40 text-emerald-400 border border-emerald-900/40" : "bg-rose-950/40 text-rose-400 border border-rose-900/40"}`}>
                    {activeTrade.type}
                  </span>
                  <span className="text-neutral-300 font-bold">#{activeTrade.id.replace("trade_", "")}</span>
                </div>
              </div>

              <div>
                <span className="text-[9px] text-neutral-500 block uppercase">Volume Size</span>
                <span className="text-neutral-200 font-bold block mt-0.5">{activeTrade.qty.toFixed(2)} Lots</span>
              </div>

              <div>
                <span className="text-[9px] text-neutral-500 block uppercase">Entry Spot</span>
                <span className="text-neutral-200 font-bold block mt-0.5">${activeTrade.entryPrice.toFixed(2)}</span>
              </div>

              <div>
                <span className="text-[9px] text-neutral-500 block uppercase">Stop Loss</span>
                <span className={`font-bold block mt-0.5 ${activeTrade.stopMovedToBE ? "text-amber-400 font-extrabold animate-pulse" : "text-neutral-200"}`}>
                  ${activeTrade.sl.toFixed(2)} {activeTrade.stopMovedToBE ? "(BE)" : ""}
                </span>
              </div>

              <div>
                <span className="text-[9px] text-neutral-500 block uppercase">Take Profit</span>
                <span className="text-neutral-200 font-bold block mt-0.5">${activeTrade.tp.toFixed(2)}</span>
              </div>

              <div>
                <span className="text-[9px] text-neutral-500 block uppercase">Unrealized P&L</span>
                <span className={`text-sm font-black block mt-0.5 ${activeTrade.unrealizedPl >= 0 ? "text-green-450" : "text-red-400"}`}>
                  {activeTrade.unrealizedPl >= 0 ? "+" : ""}${activeTrade.unrealizedPl.toFixed(2)}
                </span>
              </div>
            </div>

            {/* Micro details or warning banner */}
            <div className="mt-3 pt-2 border-t border-neutral-900/60 flex flex-wrap items-center justify-between gap-2 text-[9.5px]">
              <div className="text-neutral-400">
                <span className="text-neutral-500 font-bold uppercase tracking-wider">Acquired time:</span>{" "}
                {new Date(activeTrade.entryTime).toLocaleTimeString("en-US", { timeZone: "Asia/Colombo" })} (SLST)
              </div>
              <div className="text-neutral-500 italic">
                {activeTrade.isPartialClosed ? "✅ Partial take profit reached (50% closed). Stop-loss protected at break-even!" : "⏳ Spot price actively tracked. Dynamic exit targets calibrated live."}
              </div>
            </div>
          </motion.div>
        )}

        {totalTradesCount === 0 ? (
          <div className="text-center py-12 text-neutral-500 text-xs font-mono">
            No completed positions recorded. Start the simulation speed slider or force a manual trade entry above!
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-neutral-800 text-neutral-400 font-mono text-[9px] uppercase tracking-widest pb-2">
                  <th className="py-3 px-4 font-bold">TYPE / ID</th>
                  <th className="py-3 px-4 font-bold">SIZE</th>
                  <th className="py-3 px-4 font-bold">ENTRY PRICE</th>
                  <th className="py-3 px-4 font-bold">EXIT PRICE</th>
                  <th className="py-3 px-4 font-bold font-mono">EXECUTION TIME</th>
                  <th className="py-3 px-4 font-bold">EXIT LOG REASON</th>
                  <th className="py-3 px-4 font-bold text-right">NET PROFIT (USD)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-800/50 font-sans">
                {tradesLog.map((trade) => {
                  const isWin = trade.profit >= 0;
                  return (
                    <motion.tr
                      key={trade.id}
                      layout="position"
                      initial={{ opacity: 0, y: 10, scale: 0.99 }}
                      animate={{ opacity: 1, y: 0, scale: 1 }}
                      transition={{ type: "spring", stiffness: 350, damping: 25 }}
                      className="hover:bg-neutral-900/40 transition-colors border-b border-neutral-800/25"
                    >
                      <td className="py-3 px-4 flex items-center gap-2">
                        <span
                          className={`text-[9px] font-mono font-black py-0.5 px-2.5 rounded shrink-0 ${trade.type === "BUY" ? "bg-green-950/40 text-green-400 border border-green-900/60" : "bg-red-950/40 text-red-400 border border-red-900/60"}`}
                        >
                          {trade.type}
                        </span>
                        <span className="text-neutral-500 font-mono text-[10px] select-all truncate max-w-[80px]" title={trade.id}>
                          {trade.id.replace("trade_", "")}
                        </span>
                      </td>
                      <td className="py-3 px-4 font-mono text-neutral-300">{trade.qty} Lots</td>
                      <td className="py-3 px-4 font-mono text-neutral-300">${trade.entryPrice.toFixed(2)}</td>
                      <td className="py-3 px-4 font-mono text-neutral-300">${trade.exitPrice.toFixed(2)}</td>
                      <td className="py-3 px-4 text-neutral-500 font-mono text-[10px]" title="Sri Lanka Standard Time (SLST)">{new Date(trade.exitTime).toLocaleTimeString("en-US", { timeZone: "Asia/Colombo" })}</td>
                      <td className="py-3 px-4">
                        <span className="text-[10px] font-mono text-neutral-300 bg-neutral-900 border border-neutral-800/80 rounded px-1.5 py-0.5">
                          {trade.exitReason} {trade.isPartialClosed ? "• PARTIAL TARGET" : ""}
                        </span>
                      </td>
                      <td className={`py-3 px-4 text-right font-mono font-bold text-sm ${isWin ? "text-green-400" : "text-red-400"}`}>
                        {isWin ? "+" : ""}${trade.profit.toLocaleString("en-US", { minimumFractionDigits: 2 })}
                      </td>
                    </motion.tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
