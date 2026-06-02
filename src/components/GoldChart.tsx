import React from "react";
import { Candlestick, ActiveTrade } from "../types";

interface GoldChartProps {
  candles: Candlestick[];
  price: number;
  activeTrade: ActiveTrade | null;
}

export function GoldChart({ candles, price, activeTrade }: GoldChartProps) {
  const [hoverIdx, setHoverIdx] = React.useState<number | null>(null);
  const [hoverCoords, setHoverCoords] = React.useState<{ x: number; y: number } | null>(null);

  if (!candles || candles.length === 0) {
    return (
      <div className="h-96 w-full bg-[#131722] rounded-xl flex items-center justify-center border border-neutral-800">
        <span className="text-neutral-500 animate-pulse text-sm font-mono uppercase tracking-widest">Streaming Aegis gold market feed...</span>
      </div>
    );
  }

  // Slice last 35 candles to fit neatly into the view
  const visibleCandles = candles.slice(-35);

  // Auto-scale prices with comfortable margins for indicators/levels
  const prices = visibleCandles.flatMap((c) => [
    c.high,
    c.low,
    c.bollingerUpper || c.high,
    c.bollingerLower || c.low,
    ...(activeTrade ? [activeTrade.sl, activeTrade.tp, activeTrade.entryPrice] : []),
  ]);

  const maxPrice = Math.max(...prices, price) + 1.5;
  const minPrice = Math.min(...prices, price) - 1.5;
  const priceRange = maxPrice - minPrice || 5;

  const width = 800;
  const height = 360;
  const paddingLeft = 15;
  const paddingRight = 75; // wider right for price scale markers
  const paddingTop = 30;
  const paddingBottom = 30;

  const chartWidth = width - paddingLeft - paddingRight;
  const chartHeight = height - paddingTop - paddingBottom;

  // Coordinate mapping functions
  const getX = (index: number) => {
    return paddingLeft + (index / (visibleCandles.length - 1)) * chartWidth;
  };

  const getY = (p: number) => {
    const ratio = (maxPrice - p) / priceRange;
    return paddingTop + ratio * chartHeight;
  };

  // Generate grid values
  const gridCount = 6;
  const gridLines = Array.from({ length: gridCount }).map((_, i) => {
    return minPrice + (i / (gridCount - 1)) * priceRange;
  });

  // Calculate volume scaling parameters
  const maxVolume = Math.max(...visibleCandles.map((c) => c.volume), 1000) || 1000;

  // Active or highlighted candle
  const activeCandleIndex = hoverIdx !== null ? hoverIdx : visibleCandles.length - 1;
  const highlightedCandle = visibleCandles[activeCandleIndex];
  const isUp = highlightedCandle ? highlightedCandle.close >= highlightedCandle.open : true;

  // DYNAMIC SUPPORT & RESISTANCE (PIVOT POINTS ALGORITHM)
  // Window parameter: 2 candles to each side (5-candle cluster check)
  const leftWindow = 2;
  const rightWindow = 2;
  const supCandidates: number[] = [];
  const resCandidates: number[] = [];

  for (let i = leftWindow; i < visibleCandles.length - rightWindow; i++) {
    const currentLow = visibleCandles[i].low;
    const currentHigh = visibleCandles[i].high;

    // Check low peak
    let isMin = true;
    for (let j = i - leftWindow; j <= i + rightWindow; j++) {
      if (j !== i && visibleCandles[j].low < currentLow) {
        isMin = false;
        break;
      }
    }

    // Check high peak
    let isMax = true;
    for (let j = i - leftWindow; j <= i + rightWindow; j++) {
      if (j !== i && visibleCandles[j].high > currentHigh) {
        isMax = false;
        break;
      }
    }

    if (isMin) supCandidates.push(currentLow);
    if (isMax) resCandidates.push(currentHigh);
  }

  // Pick top closest support and resistance lines around the price
  const supportsBelow = supCandidates.filter((p) => p < price).sort((a, b) => b - a); // descending order
  const resistancesAbove = resCandidates.filter((p) => p > price).sort((a, b) => a - b); // ascending order

  const dynSupportSR = supportsBelow.length > 0 ? supportsBelow[0] : price - 3.20;
  const dynResistanceSR = resistancesAbove.length > 0 ? resistancesAbove[0] : price + 3.20;

  // Interactive mouse pointer tracker mapping coordinates
  const handleMouseMove = (e: React.MouseEvent<SVGSVGElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const svgX = ((e.clientX - rect.left) / rect.width) * width;
    const svgY = ((e.clientY - rect.top) / rect.height) * height;

    let idx = Math.round(((svgX - paddingLeft) / chartWidth) * (visibleCandles.length - 1));
    idx = Math.max(0, Math.min(visibleCandles.length - 1, idx));

    setHoverIdx(idx);
    setHoverCoords({ x: svgX, y: svgY });
  };

  const handleMouseLeave = () => {
    setHoverIdx(null);
    setHoverCoords(null);
  };

  return (
    <div className="bg-[#131722] p-5 rounded-2xl border border-neutral-800/80 shadow-2xl relative overflow-hidden select-none hover:border-neutral-700/80 transition-all duration-300">
      {/* Background Grid Pattern Overlay */}
      <div className="absolute inset-0 bg-radial-gradient from-transparent to-[#0e1017] pointer-events-none opacity-40" />

      {/* TradingView Header Panel */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center border-b border-neutral-800/60 pb-3 mb-4 gap-3 relative z-10">
        <div className="flex items-center gap-3">
          <div className="relative">
            <span className="w-2 h-2 rounded-full bg-amber-500 absolute -top-0.5 -left-0.5 animate-ping" />
            <span className="w-2.5 h-2.5 rounded-full bg-amber-500 block border-2 border-[#131722]" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="font-sans font-bold text-neutral-100 text-sm tracking-tight">XAU/USD GOLD</h3>
              <span className="text-[10px] font-mono font-semibold px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-500 border border-amber-500/20">M1 INTRADAY</span>
            </div>
            <p className="text-[10px] text-neutral-500 font-mono">GOLD SPOT / U.S. DOLLAR • PROFESSIONAL TERMINAL</p>
          </div>
        </div>

        {/* Indicator Color Legend Keys */}
        <div className="flex flex-wrap gap-x-4 gap-y-1 text-[10px] font-mono text-neutral-400">
          <div className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-[#1de9b6]" />
            <span>EMA 9 <span className="text-neutral-500">(${highlightedCandle?.ema9?.toFixed(2) || "—"})</span></span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-[#f472b6]" />
            <span>EMA 21 <span className="text-neutral-500">(${highlightedCandle?.ema21?.toFixed(2) || "—"})</span></span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-2.5 h-1.5 bg-yellow-500/10 rounded border border-dashed border-yellow-500/30" />
            <span>Bollinger Bands <span className="text-neutral-500">(${highlightedCandle?.bollingerMiddle?.toFixed(1) || "—"})</span></span>
          </div>
        </div>
      </div>

      {/* TradingView Instant HUD Parameter Overlay */}
      {highlightedCandle && (
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 bg-neutral-900/40 p-2.5 rounded-lg border border-neutral-800/40 text-[11px] font-mono mb-3 relative z-10">
          <span className="text-neutral-400 select-none">
            {hoverIdx !== null ? "📊 HOVERED PLOT:" : "🔔 LATEST TICK:"}
          </span>
          <span className="text-neutral-500 select-none">TIME:</span>
          <span className="text-[#e2e8f0]">
            {new Date(highlightedCandle.time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
          </span>
          
          <span className="text-neutral-500 select-none">O:</span>
          <span className={isUp ? "text-green-400 font-bold" : "text-red-400 font-bold"}>
            ${highlightedCandle.open.toFixed(2)}
          </span>

          <span className="text-neutral-500 select-none">H:</span>
          <span className="text-green-400 font-semibold">${highlightedCandle.high.toFixed(2)}</span>

          <span className="text-neutral-500 select-none">L:</span>
          <span className="text-red-400 font-semibold">${highlightedCandle.low.toFixed(2)}</span>

          <span className="text-neutral-500 select-none">C:</span>
          <span className={isUp ? "text-green-400 font-bold" : "text-red-400 font-bold"}>
            ${highlightedCandle.close.toFixed(2)}
          </span>

          <span className="text-neutral-500 select-none">VOL:</span>
          <span className="text-blue-400 font-medium">{highlightedCandle.volume}</span>

          {highlightedCandle.rsi && (
            <>
              <span className="text-neutral-500 select-none">RSI(14):</span>
              <span className={highlightedCandle.rsi > 70 ? "text-amber-500 font-bold animate-pulse" : highlightedCandle.rsi < 30 ? "text-sky-400 font-bold animate-pulse" : "text-neutral-300 font-medium"}>
                {highlightedCandle.rsi.toFixed(1)}
              </span>
            </>
          )}

          {highlightedCandle.adx !== undefined && (
            <>
              <span className="text-neutral-500 select-none">ADX:</span>
              <span className="text-purple-400 font-medium">
                {highlightedCandle.adx.toFixed(1)}
              </span>
            </>
          )}
        </div>
      )}

      {/* SVG Canvas Area */}
      <div className="relative">
        <svg
          viewBox={`0 0 ${width} ${height}`}
          className="w-full h-auto overflow-visible select-none cursor-crosshair z-10 relative"
          onMouseMove={handleMouseMove}
          onMouseLeave={handleMouseLeave}
        >
          {/* Bollinger Band Outer Shade Channel */}
          <path
            d={visibleCandles
              .map((c, i) => {
                const x = getX(i);
                const y = getY(c.bollingerUpper || c.high);
                return `${i === 0 ? "M" : "L"} ${x} ${y}`;
              })
              .concat(
                visibleCandles
                  .slice()
                  .reverse()
                  .map((c, i) => {
                    const idx = visibleCandles.length - 1 - i;
                    const x = getX(idx);
                    const y = getY(c.bollingerLower || c.low);
                    return `L ${x} ${y}`;
                  })
              )
              .join(" ") + " Z"}
            fill="rgba(212,175,55,0.015)"
            stroke="rgba(212,175,55,0.06)"
            strokeWidth={0.8}
            strokeDasharray="2,2"
          />

          {/* DUAL DIRECTION TECHNICAL GRID */}
          {/* Horizontal Grid lines */}
          {gridLines.map((val, i) => (
            <g key={`hgrid-${i}`} className="opacity-[0.14]">
              <line
                x1={paddingLeft}
                y1={getY(val)}
                x2={width - paddingRight}
                y2={getY(val)}
                stroke="#475569"
                strokeWidth={0.5}
              />
              <text
                x={width - paddingRight + 8}
                y={getY(val) + 3}
                fill="#94a3b8"
                fontSize={8.5}
                fontFamily="var(--font-mono)"
                fontWeight="semibold"
                className="text-right select-none pointer-events-none"
              >
                ${val.toFixed(2)}
              </text>
            </g>
          ))}

          {/* Vertical Grid lines for every 4th candle index */}
          {visibleCandles.map((c, i) => {
            if (i % 4 !== 0) return null;
            const x = getX(i);
            return (
              <g key={`vgrid-${i}`} className="opacity-[0.11]">
                <line
                  x1={x}
                  y1={paddingTop}
                  x2={x}
                  y2={height - paddingBottom}
                  stroke="#475569"
                  strokeWidth={0.5}
                />
                {/* Minor label along X axis bottom */}
                <text
                  x={x}
                  y={height - paddingBottom + 13}
                  fill="#94a3b8"
                  fontSize={8}
                  fontFamily="var(--font-mono)"
                  textAnchor="middle"
                  className="select-none pointer-events-none"
                >
                  {new Date(c.time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </text>
              </g>
            );
          })}

          {/* DYNAMIC TRUE SUPPORT AND RESISTANCE PILLARS */}
          {/* 🛡️ True Support Pillar */}
          <g>
            <line
              x1={paddingLeft}
              y1={getY(dynSupportSR)}
              x2={width - paddingRight}
              y2={getY(dynSupportSR)}
              stroke="#22c55e"
              strokeWidth={0.8}
              strokeDasharray="4,4"
              className="opacity-40"
            />
            <rect
              x={paddingLeft + 5}
              y={getY(dynSupportSR) - 7}
              width={105}
              height={14}
              rx={2}
              fill="#14532d"
              stroke="#22c55e"
              strokeWidth={0.5}
              className="opacity-75"
            />
            <text
              x={paddingLeft + 57}
              y={getY(dynSupportSR) + 3}
              fill="#4ade80"
              fontFamily="var(--font-mono)"
              fontSize={8}
              fontWeight="bold"
              textAnchor="middle"
            >
              SUPPORT: ${dynSupportSR.toFixed(2)}
            </text>
          </g>

          {/* 🎯 True Resistance Pillar */}
          <g>
            <line
              x1={paddingLeft}
              y1={getY(dynResistanceSR)}
              x2={width - paddingRight}
              y2={getY(dynResistanceSR)}
              stroke="#ef4444"
              strokeWidth={0.8}
              strokeDasharray="4,4"
              className="opacity-40"
            />
            <rect
              x={paddingLeft + 5}
              y={getY(dynResistanceSR) - 7}
              width={115}
              height={14}
              rx={2}
              fill="#7f1d1d"
              stroke="#ef4444"
              strokeWidth={0.5}
              className="opacity-75"
            />
            <text
              x={paddingLeft + 62}
              y={getY(dynResistanceSR) + 3}
              fill="#faca9c"
              fontFamily="var(--font-mono)"
              fontSize={8}
              fontWeight="bold"
              textAnchor="middle"
            >
              RESISTANCE: ${dynResistanceSR.toFixed(2)}
            </text>
          </g>

          {/* TRADINGVIEW VOLUME HISTOGRAM AT LOWER OVERLAY */}
          {visibleCandles.map((c, i) => {
            const x = getX(i);
            const volHeight = (c.volume / maxVolume) * (chartHeight * 0.15); // maximum 15% of grid height
            const yVol = height - paddingBottom - volHeight;
            const isBullGroup = c.close >= c.open;
            const fillCol = isBullGroup ? "rgba(34,197,94,0.14)" : "rgba(239,68,68,0.14)";
            const strokeCol = isBullGroup ? "rgba(34,197,94,0.22)" : "rgba(239,68,68,0.22)";
            return (
              <rect
                key={`volbar-${i}`}
                x={x - 4}
                y={yVol}
                width={8}
                height={volHeight}
                fill={fillCol}
                stroke={strokeCol}
                strokeWidth={0.5}
              />
            );
          })}

          {/* Bollinger Middle Band (Orange SMA-20 Line) */}
          <path
            d={visibleCandles
              .map((c, i) => {
                const x = getX(i);
                const y = getY(c.bollingerMiddle || (c.bollingerUpper && c.bollingerLower ? (c.bollingerUpper + c.bollingerLower) / 2 : c.close));
                return `${i === 0 ? "M" : "L"} ${x} ${y}`;
              })
              .join(" ")}
            fill="none"
            stroke="#ea580c"
            strokeWidth={0.8}
            strokeDasharray="2,2"
            className="opacity-60"
          />

          {/* EMA 9 (Teal Ribbon) */}
          <path
            d={visibleCandles
              .map((c, i) => {
                const x = getX(i);
                const y = getY(c.ema9 || c.close);
                return `${i === 0 ? "M" : "L"} ${x} ${y}`;
              })
              .join(" ")}
            fill="none"
            stroke="#06b6d4"
            strokeWidth={1.5}
            className="opacity-90"
          />

          {/* EMA 21 (Pink Ribbon) */}
          <path
            d={visibleCandles
              .map((c, i) => {
                const x = getX(i);
                const y = getY(c.ema21 || c.close);
                return `${i === 0 ? "M" : "L"} ${x} ${y}`;
              })
              .join(" ")}
            fill="none"
            stroke="#ec4899"
            strokeWidth={1.5}
            className="opacity-95"
          />

          {/* HIGH-FIDELITY CANDLESTICK TILES */}
          {visibleCandles.map((c, i) => {
            const x = getX(i);
            const yOpen = getY(c.open);
            const yClose = getY(c.close);
            const yHigh = getY(c.high);
            const yLow = getY(c.low);

            const isBullish = c.close >= c.open;
            // Precise design colors for Tradingview look
            const strokeColor = isBullish ? "#089981" : "#f23645";
            const bodyColor = isBullish ? "#089981" : "#f23645";
            const bodyWidth = 7;

            return (
              <g key={`candle-${i}`}>
                {/* Wick shadow */}
                <line x1={x} y1={yHigh} x2={x} y2={yLow} stroke={strokeColor} strokeWidth={1.2} />
                {/* Full body */}
                <rect
                  x={x - bodyWidth / 2}
                  y={Math.min(yOpen, yClose)}
                  width={bodyWidth}
                  height={Math.max(1.5, Math.abs(yOpen - yClose))}
                  fill={bodyColor}
                  stroke={strokeColor}
                  strokeWidth={0.5}
                  rx={0.5}
                />
              </g>
            );
          })}

          {/* LIVE GOLD WATERMARK PRICE LINE */}
          <g>
            <line
              x1={paddingLeft}
              y1={getY(price)}
              x2={width - paddingRight}
              y2={getY(price)}
              stroke="#ffb000"
              strokeWidth={1.2}
              strokeDasharray="3,1"
              className="animate-pulse"
            />
            {/* Price badge right axis */}
            <rect
              x={width - paddingRight + 4}
              y={getY(price) - 8}
              width={70}
              height={16}
              rx={2}
              fill="#ea580c"
              className="animate-pulse"
            />
            <text
              x={width - paddingRight + 39}
              y={getY(price) + 4}
              fill="#fff"
              fontFamily="var(--font-mono)"
              fontSize={8.5}
              fontWeight="bold"
              textAnchor="middle"
            >
              ${price.toFixed(2)}
            </text>
          </g>

          {/* ACTIVE POSITION TRIGGER LEVELS AND TRADING PATHWAYS */}
          {activeTrade && (
            <g>
              {/* Position shading (Green band for profit, red band for loss) */}
              <rect
                x={paddingLeft}
                y={Math.min(getY(activeTrade.entryPrice), getY(price))}
                width={chartWidth}
                height={Math.max(1, Math.abs(getY(activeTrade.entryPrice) - getY(price)))}
                fill={activeTrade.unrealizedPl >= 0 ? "rgba(34,197,94,0.025)" : "rgba(239,68,68,0.025)"}
                className="transition-all duration-300"
              />

              {/* ENTRY LEVEL AT TARGET */}
              <line
                x1={paddingLeft}
                y1={getY(activeTrade.entryPrice)}
                x2={width - paddingRight}
                y2={getY(activeTrade.entryPrice)}
                stroke="#06b6d4"
                strokeWidth={1.2}
                strokeDasharray="4,2"
              />
              <rect
                x={paddingLeft + 4}
                y={getY(activeTrade.entryPrice) - 15}
                width={80}
                height={12}
                rx={1}
                fill="#0e7490"
                opacity={0.85}
              />
              <text
                x={paddingLeft + 44}
                y={getY(activeTrade.entryPrice) - 6}
                fill="#fff"
                fontFamily="var(--font-mono)"
                fontSize={7.5}
                fontWeight="bold"
                textAnchor="middle"
              >
                ENTRY ${activeTrade.entryPrice.toFixed(2)}
              </text>

              {/* STOP LOSS CHANNELS */}
              <line
                x1={paddingLeft}
                y1={getY(activeTrade.sl)}
                x2={width - paddingRight}
                y2={getY(activeTrade.sl)}
                stroke="#ef4444"
                strokeWidth={1.2}
                strokeDasharray="4,4"
              />
              <rect
                x={paddingLeft + 4}
                y={getY(activeTrade.sl) - 15}
                width={105}
                height={12}
                rx={1}
                fill="#991b1b"
                opacity={0.85}
              />
              <text
                x={paddingLeft + 56}
                y={getY(activeTrade.sl) - 6}
                fill="#fff"
                fontFamily="var(--font-mono)"
                fontSize={7.5}
                fontWeight="bold"
                textAnchor="middle"
              >
                {activeTrade.stopMovedToBE ? "BREAKEVEN SL" : `STOP LOSS $${activeTrade.sl.toFixed(2)}`}
              </text>

              {/* TAKE PROFIT CHANNELS */}
              <line
                x1={paddingLeft}
                y1={getY(activeTrade.tp)}
                x2={width - paddingRight}
                y2={getY(activeTrade.tp)}
                stroke="#22c55e"
                strokeWidth={1.2}
                strokeDasharray="4,4"
              />
              <rect
                x={paddingLeft + 4}
                y={getY(activeTrade.tp) - 15}
                width={105}
                height={12}
                rx={1}
                fill="#166534"
                opacity={0.85}
              />
              <text
                x={paddingLeft + 56}
                y={getY(activeTrade.tp) - 6}
                fill="#fff"
                fontFamily="var(--font-mono)"
                fontSize={7.5}
                fontWeight="bold"
                textAnchor="middle"
              >
                TAKE PROFIT $XAU {activeTrade.tp.toFixed(2)}
              </text>
            </g>
          )}

          {/* INTERACTIVE TRADINGVIEW RESPONSIVE CROSSHAIR */}
          {hoverCoords && hoverIdx !== null && (
            <g>
              {/* Horizontal crosshair dashed trace */}
              <line
                x1={paddingLeft}
                y1={hoverCoords.y}
                x2={width - paddingRight}
                y2={hoverCoords.y}
                stroke="#64748b"
                strokeWidth={0.8}
                strokeDasharray="4,4"
                className="opacity-70"
              />
              {/* Vertical crosshair dashed trace */}
              <line
                x1={getX(hoverIdx)}
                y1={paddingTop}
                x2={getX(hoverIdx)}
                y2={height - paddingBottom}
                stroke="#64748b"
                strokeWidth={0.8}
                strokeDasharray="4,4"
                className="opacity-70"
              />

              {/* Hover coordinate horizontal price axis panel */}
              <rect
                x={width - paddingRight + 4}
                y={hoverCoords.y - 8}
                width={70}
                height={16}
                rx={2}
                fill="#1e293b"
                stroke="#475569"
                strokeWidth={0.8}
              />
              {/* Hover price calculated value */}
              <text
                x={width - paddingRight + 39}
                y={hoverCoords.y + 4}
                fill="#38bdf8"
                fontFamily="var(--font-mono)"
                fontSize={8.5}
                fontWeight="bold"
                textAnchor="middle"
              >
                ${(maxPrice - ((hoverCoords.y - paddingTop) / chartHeight) * priceRange).toFixed(2)}
              </text>

              {/* Hover coordinate vertical timeline bottom panel */}
              <rect
                x={getX(hoverIdx) - 28}
                y={height - paddingBottom}
                width={56}
                height={14}
                rx={2}
                fill="#1e293b"
                stroke="#475569"
                strokeWidth={0.8}
              />
              <text
                x={getX(hoverIdx)}
                y={height - paddingBottom + 10}
                fill="#38bdf8"
                fontFamily="var(--font-mono)"
                fontSize={8}
                fontWeight="bold"
                textAnchor="middle"
              >
                {new Date(visibleCandles[hoverIdx].time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
              </text>
            </g>
          )}
        </svg>

        {/* Legend overlays for direct fast visual indicators */}
        {activeTrade && (
          <div className="absolute top-16 left-4 bg-[#1e222d]/95 backdrop-blur-md border border-neutral-800/80 text-[11px] py-1.5 px-3 rounded-xl shadow-2xl flex items-center gap-3 font-mono z-20">
            <span className="flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-pulse" />
              <span className="text-neutral-400 uppercase">POSITION:</span>
              <span className={activeTrade.type === "BUY" ? "text-green-400 font-extrabold" : "text-red-400 font-extrabold"}>
                {activeTrade.type} {activeTrade.qty.toFixed(2)} LOTS
              </span>
            </span>
            <span className="text-neutral-700">|</span>
            <span className="flex items-center gap-1">
              <span className="text-neutral-400">UNREALIZED P&L:</span>
              <span className={activeTrade.unrealizedPl >= 0 ? "text-green-400 font-bold" : "text-red-400 font-bold"}>
                {activeTrade.unrealizedPl >= 0 ? "+" : ""}${activeTrade.unrealizedPl.toFixed(2)}
              </span>
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
