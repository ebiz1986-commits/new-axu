import React from "react";
import { CompletedTrade } from "../types";
import { ShieldCheck, TrendingUp, TrendingDown, DollarSign, PieChart, Activity } from "lucide-react";

interface MetricsPanelProps {
  balance: number;
  equity: number;
  unrealizedPnL: number;
  tradesLog: CompletedTrade[];
}

export function MetricsPanel({ balance, equity, unrealizedPnL, tradesLog }: MetricsPanelProps) {
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
          <div className="text-[10px] text-neutral-500 mt-1">Starting size: $10,000</div>
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
                    <tr key={trade.id} className="hover:bg-neutral-900/40 transition-colors">
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
                      <td className="py-3 px-4 text-neutral-500 font-mono text-[10px]">{new Date(trade.exitTime).toLocaleTimeString()}</td>
                      <td className="py-3 px-4">
                        <span className="text-[10px] font-mono text-neutral-300 bg-neutral-900 border border-neutral-800/80 rounded px-1.5 py-0.5">
                          {trade.exitReason} {trade.isPartialClosed ? "• PARTIAL TARGET" : ""}
                        </span>
                      </td>
                      <td className={`py-3 px-4 text-right font-mono font-bold text-sm ${isWin ? "text-green-400" : "text-red-400"}`}>
                        {isWin ? "+" : ""}${trade.profit.toLocaleString("en-US", { minimumFractionDigits: 2 })}
                      </td>
                    </tr>
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
