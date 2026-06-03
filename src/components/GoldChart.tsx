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

  const width = 850;
  const height = 400;
  const paddingLeft = 30;
  const paddingRight = 135; // widened for TradingView tags on the right
  const paddingTop = 30;
  const paddingBottom = 40;

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

  // Generate grid values (6 lines across)
  const gridCount = 6;
  const gridLines = Array.from({ length: gridCount }).map((_, i) => {
    return minPrice + (i / (gridCount - 1)) * priceRange;
  });

  const maxVolume = Math.max(...visibleCandles.map((c) => c.volume), 1000) || 1000;

  // Selected or active tick data
  const latestCandle = visibleCandles[visibleCandles.length - 1];
  const activeCandleIndex = hoverIdx !== null ? hoverIdx : visibleCandles.length - 1;
  const highlightedCandle = visibleCandles[activeCandleIndex];
  const isUp = highlightedCandle ? highlightedCandle.close >= highlightedCandle.open : true;

  // Change calculations (relative to previous candle)
  const prevCandle = activeCandleIndex > 0 ? visibleCandles[activeCandleIndex - 1] : highlightedCandle;
  const changeValue = highlightedCandle.close - prevCandle.close;
  const percentChange = prevCandle.close !== 0 ? (changeValue / prevCandle.close) * 100 : 0;

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

  // Graceful fallback levels aligned with real market values
  const dynSupportSR = supportsBelow.length > 0 ? supportsBelow[0] : price - 3.80;
  const dynResistanceSR = resistancesAbove.length > 0 ? resistancesAbove[0] : price + 3.80;

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
    <div className="bg-[#131722] p-4 sm:p-5 rounded-2xl border border-neutral-800 shadow-2xl relative overflow-hidden select-none hover:border-neutral-700/80 transition-all duration-300">
      {/* Background radial gradient */}
      <div className="absolute inset-0 bg-radial-gradient from-transparent to-[#0e1017] pointer-events-none opacity-40" />

      {/* TradingView Top Controller & Information Bar */}
      <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-3 border-b border-neutral-800/80 pb-4 mb-4 relative z-10">
        <div className="flex flex-wrap items-center gap-2 sm:gap-3">
          {/* Order Block Buttons (Mock TradingView Quick Actions) */}
          <div className="flex items-center rounded overflow-hidden shadow-md">
            <button className="bg-[#f23645] hover:bg-[#d92c3a] text-white px-2.5 py-1 text-[11px] font-mono font-bold flex flex-col items-center leading-tight min-w-[70px]">
              <span className="text-[9px] opacity-75 font-sans font-normal">SELL</span>
              <span>${(price - 0.1).toFixed(2)}</span>
            </button>
            <div className="bg-[#1c2030] text-neutral-400 border-x border-[#131722] px-2 py-1 text-[10px] font-mono font-semibold">
              20
            </div>
            <button className="bg-[#089981] hover:bg-[#07856f] text-white px-2.5 py-1 text-[11px] font-mono font-bold flex flex-col items-center leading-tight min-w-[70px]">
              <span className="text-[9px] opacity-75 font-sans font-normal">BUY</span>
              <span>${(price + 0.1).toFixed(2)}</span>
            </button>
          </div>

          <div className="h-6 w-[1px] bg-neutral-800 hidden sm:block" />

          {/* Symbol Title & Index Info */}
          <div>
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className="font-sans font-extrabold text-neutral-100 text-sm tracking-wide">GOLD / U.S. DOLLAR</span>
              <span className="text-[9px] font-mono font-bold px-1.5 py-0.5 rounded bg-neutral-800 text-neutral-400 border border-neutral-700/50">5 INDEX</span>
            </div>
            {/* Labeled OHLC values exact matches to hover */}
            {highlightedCandle && (
              <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] font-mono mt-0.5">
                <span className="text-neutral-500 font-sans">O</span>
                <span className="text-neutral-300">${highlightedCandle.open.toFixed(2)}</span>
                <span className="text-neutral-500 font-sans">H</span>
                <span className="text-neutral-300">${highlightedCandle.high.toFixed(2)}</span>
                <span className="text-neutral-500 font-sans">L</span>
                <span className="text-neutral-300">${highlightedCandle.low.toFixed(2)}</span>
                <span className="text-neutral-500 font-sans">C</span>
                <span className={isUp ? "text-[#089981]" : "text-[#f23645]"}>${highlightedCandle.close.toFixed(2)}</span>
                
                {/* Plus (+) and minus (-) colored offsets */}
                <span className={changeValue >= 0 ? "text-[#089981] font-bold ml-1" : "text-[#f23645] font-bold ml-1"}>
                  {changeValue >= 0 ? "+" : ""}{changeValue.toFixed(2)} ({changeValue >= 0 ? "+" : ""}{percentChange.toFixed(2)}%)
                </span>
              </div>
            )}
          </div>
        </div>

        {/* Legend Panel */}
        <div className="flex flex-wrap items-center gap-x-3.5 gap-y-1 text-[10px] font-semibold font-mono text-neutral-400">
          <div className="flex items-center gap-1">
            <span className="w-1.5 h-1.5 rounded-full bg-[#06b6d4]" />
            <span>EMA 9: <span className="text-neutral-200">${latestCandle.ema9?.toFixed(2) || "—"}</span></span>
          </div>
          <div className="flex items-center gap-1">
            <span className="w-1.5 h-1.5 rounded-full bg-[#ec4899]" />
            <span>EMA 21: <span className="text-neutral-200">${latestCandle.ema21?.toFixed(2) || "—"}</span></span>
          </div>
          <div className="flex items-center gap-1">
            <span className="w-1.5 h-1.5 rounded bg-amber-500/10 border border-[#ea580c]/45" />
            <span>BOLLINGER: <span className="text-neutral-200">${latestCandle.bollingerMiddle?.toFixed(1) || "—"}</span></span>
          </div>
        </div>
      </div>

      {/* main SVG Graph Canvas area */}
      <div className="relative">
        <svg
          viewBox={`0 0 ${width} ${height}`}
          className="w-full h-auto overflow-visible select-none cursor-crosshair z-10 relative"
          onMouseMove={handleMouseMove}
          onMouseLeave={handleMouseLeave}
        >
          {/* DEFINITIONS FOR GRADIENTS AND PATTERNS */}
          <defs>
            <linearGradient id="supportGradient" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#089981" stopOpacity="0.10" />
              <stop offset="100%" stopColor="#089981" stopOpacity="0.0" />
            </linearGradient>
            <linearGradient id="resistanceGradient" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#f23645" stopOpacity="0.0" />
              <stop offset="100%" stopColor="#f23645" stopOpacity="0.10" />
            </linearGradient>
          </defs>

          {/* DYNAMIC WATERMARK TEXT IN CENTER BACKGROUND */}
          <text
            x={(width - paddingRight) / 2 + paddingLeft / 2}
            y={height / 2 + 15}
            textAnchor="middle"
            fill="rgba(255, 255, 255, 0.02)"
            fontSize={90}
            fontFamily="var(--font-sans)"
            fontWeight="900"
            letterSpacing={6}
            className="pointer-events-none select-none select-all"
          >
            XAUUSD
          </text>

          {/* Bollinger Band Channel Shaded Fill */}
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
            fill="rgba(212,175,55,0.01)"
            stroke="rgba(212,175,55,0.04)"
            strokeWidth={0.6}
            strokeDasharray="1,2"
          />

          {/* Dotted Grid Helper Lines (Inside Plot Area Only to keep numbers pristine) */}
          {gridLines.map((val, i) => (
            <line
              key={`hgrid-line-${i}`}
              x1={paddingLeft}
              y1={getY(val)}
              x2={width - paddingRight}
              y2={getY(val)}
              stroke="rgba(148, 163, 184, 0.08)"
              strokeWidth={0.8}
              strokeDasharray="3,3"
            />
          ))}

          {/* Vertical grid dates alignment */}
          {visibleCandles.map((c, i) => {
            if (i % 5 !== 0) return null;
            const x = getX(i);
            return (
              <g key={`vgrid-${i}`}>
                <line
                  x1={x}
                  y1={paddingTop}
                  x2={x}
                  y2={height - paddingBottom}
                  stroke="rgba(148, 163, 184, 0.08)"
                  strokeWidth={0.8}
                  strokeDasharray="3,3"
                />
                <text
                  x={x}
                  y={height - paddingBottom + 14}
                  fill="#64748b"
                  fontSize={8.5}
                  fontFamily="var(--font-mono)"
                  textAnchor="middle"
                  className="select-none pointer-events-none font-bold"
                >
                  {new Date(c.time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', timeZone: "Asia/Colombo" })}
                </text>
              </g>
            );
          })}

          {/* Bollinger Middle Band (Rendered in background) */}
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
            strokeWidth={1.2}
            strokeDasharray="2,2"
            className="opacity-60"
          />

          {/* EMA Fast (Ribbon 9) */}
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
            strokeWidth={1.8}
            className="opacity-90"
          />

          {/* EMA Slow (Ribbon 21) */}
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
            strokeWidth={1.8}
            className="opacity-90"
          />

          {/* DYNAMIC SHADING FOR SUPPORT & RESISTANCE (Inside plot only) */}
          <g>
            {/* Shading upward */}
            <rect
              x={paddingLeft}
              y={paddingTop}
              width={chartWidth}
              height={Math.max(1, getY(dynResistanceSR) - paddingTop)}
              fill="url(#resistanceGradient)"
              className="pointer-events-none"
            />
            {/* Solid Resistance line across plot */}
            <line
              x1={paddingLeft}
              y1={getY(dynResistanceSR)}
              x2={width - paddingRight}
              y2={getY(dynResistanceSR)}
              stroke="#f23645"
              strokeWidth={1.5}
            />
          </g>

          <g>
            {/* Shading downward */}
            <rect
              x={paddingLeft}
              y={getY(dynSupportSR)}
              width={chartWidth}
              height={Math.max(1, height - paddingBottom - getY(dynSupportSR))}
              fill="url(#supportGradient)"
              className="pointer-events-none"
            />
            {/* Solid Support line across plot */}
            <line
              x1={paddingLeft}
              y1={getY(dynSupportSR)}
              x2={width - paddingRight}
              y2={getY(dynSupportSR)}
              stroke="#089981"
              strokeWidth={1.5}
            />
          </g>

          {/* TRADINGVIEW VOLUME BARS LOWER OVERLAY */}
          {visibleCandles.map((c, i) => {
            const x = getX(i);
            const volHeight = (c.volume / maxVolume) * (chartHeight * 0.12);
            const yVol = height - paddingBottom - volHeight;
            const isBullGroup = c.close >= c.open;
            const fillCol = isBullGroup ? "rgba(8,153,129,0.12)" : "rgba(242,54,69,0.12)";
            const strokeCol = isBullGroup ? "rgba(8,153,129,0.22)" : "rgba(242,54,69,0.22)";
            return (
              <rect
                key={`volbar-${i}`}
                x={x - 2.5}
                y={yVol}
                width={5}
                height={volHeight}
                fill={fillCol}
                stroke={strokeCol}
                strokeWidth={0.4}
              />
            );
          })}

          {/* HIGH-FIDELITY CANDLESTICK TILES */}
          {visibleCandles.map((c, i) => {
            const x = getX(i);
            const yOpen = getY(c.open);
            const yClose = getY(c.close);
            const yHigh = getY(c.high);
            const yLow = getY(c.low);

            const isBullish = c.close >= c.open;
            // High visibility candle scheme matching TV
            const strokeColor = isBullish ? "#089981" : "#f23645";
            const bodyColor = isBullish ? "#089981" : "#f23645";
            const bodyWidth = 6;

            return (
              <g key={`candle-${i}`}>
                {/* High/Low Shadow Wick */}
                <line
                  x1={x}
                  y1={yHigh}
                  x2={x}
                  y2={yLow}
                  stroke={strokeColor}
                  strokeWidth={1.2}
                />
                {/* Body Column */}
                <rect
                  x={x - bodyWidth / 2}
                  y={Math.min(yOpen, yClose)}
                  width={bodyWidth}
                  height={Math.max(1.5, Math.abs(yOpen - yClose))}
                  fill={bodyColor}
                  stroke={strokeColor}
                  strokeWidth={0.5}
                />
              </g>
            );
          })}

          {/* ACTIVE POSITION TRIGGER ROUTES FOR ONGOING ORDERS (Lines across plot) */}
          {activeTrade && (
            <g>
              {/* Target profitability shading */}
              <rect
                x={paddingLeft}
                y={Math.min(getY(activeTrade.entryPrice), getY(price))}
                width={chartWidth}
                height={Math.max(1, Math.abs(getY(activeTrade.entryPrice) - getY(price)))}
                fill={activeTrade.unrealizedPl >= 0 ? "rgba(8,153,129,0.03)" : "rgba(242,54,69,0.03)"}
              />

              {/* Entry level dashed path */}
              <line
                x1={paddingLeft}
                y1={getY(activeTrade.entryPrice)}
                x2={width - paddingRight}
                y2={getY(activeTrade.entryPrice)}
                stroke="#38bdf8"
                strokeWidth={1.0}
                strokeDasharray="4,2"
              />

              {/* Stop Loss (SL) visual mark */}
              <line
                x1={paddingLeft}
                y1={getY(activeTrade.sl)}
                x2={width - paddingRight}
                y2={getY(activeTrade.sl)}
                stroke="#ef4444"
                strokeWidth={1.0}
                strokeDasharray="3,3"
              />

              {/* Take Profit (TP) visual mark */}
              <line
                x1={paddingLeft}
                y1={getY(activeTrade.tp)}
                x2={width - paddingRight}
                y2={getY(activeTrade.tp)}
                stroke="#10b981"
                strokeWidth={1.0}
                strokeDasharray="3,3"
              />

              {/* Glowing entry marker on the corresponding candlestick */}
              {visibleCandles.map((c, i) => {
                const isEntryCandle = Math.abs(c.time - activeTrade.entryTime) < 5 * 60 * 1000;
                if (!isEntryCandle) return null;
                const x = getX(i);
                const y = getY(activeTrade.entryPrice);
                const isBuy = activeTrade.type === "BUY";
                return (
                  <g key={`entry-marker-${i}`} className="animate-bounce">
                    <circle cx={x} cy={y} r={14} fill={isBuy ? "rgba(16,185,129,0.22)" : "rgba(244,63,94,0.22)"} stroke={isBuy ? "#10b981" : "#f43f5e"} strokeWidth={0.5} />
                    <circle cx={x} cy={y} r={5} fill={isBuy ? "#10b981" : "#f43f5e"} />
                    <polygon
                      points={isBuy ? `${x},${y - 12} ${x - 5},${y - 5} ${x + 5},${y - 5}` : `${x},${y + 12} ${x - 5},${y + 5} ${x + 5},${y + 5}`}
                      fill={isBuy ? "#10b981" : "#f43f5e"}
                    />
                  </g>
                );
              })}
            </g>
          )}

          {/* DOTTED CURRENT LIVE PRICE LINE (Across Plot Only) */}
          <line
            x1={paddingLeft}
            y1={getY(price)}
            x2={width - paddingRight}
            y2={getY(price)}
            stroke="#00bcd4"
            strokeWidth={1.2}
            strokeDasharray="3,2"
          />

          {/* SOLID SIDEBAR Y-AXIS PANELS BLOCK OVERLAY (TradingView Style)
              This creates a solid column to stop moving curves, EMA wicks, and indicators from muddling or overlapping numbers */}
          <rect
            x={width - paddingRight}
            y={paddingTop}
            width={paddingRight}
            height={chartHeight}
            fill="#121622"
            stroke="none"
          />

          {/* Sidebar vertical axis separator line */}
          <line
            x1={width - paddingRight}
            y1={paddingTop}
            x2={width - paddingRight}
            y2={height - paddingBottom}
            stroke="rgba(148, 163, 184, 0.18)"
            strokeWidth={1.2}
          />

          {/* Stable Sidebar Tick values and Price Numbers */}
          {gridLines.map((val, i) => (
            <g key={`hgrid-txt-${i}`}>
              <line
                x1={width - paddingRight}
                y1={getY(val)}
                x2={width - paddingRight + 5}
                y2={getY(val)}
                stroke="rgba(148, 163, 184, 0.3)"
                strokeWidth={1}
              />
              <text
                x={width - paddingRight + 12}
                y={getY(val) + 3}
                fill="#cbd5e1"
                fontSize={10}
                fontFamily="var(--font-mono)"
                fontWeight="bold"
                className="select-none pointer-events-none"
              >
                {val.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </text>
            </g>
          ))}

          {/* Resistance right axis label tag: "RESISTANCE (SELL) 4,495.30" */}
          <g>
            <rect
              x={width - paddingRight + 2}
              y={getY(dynResistanceSR) - 9}
              width={130}
              height={18}
              rx={3}
              fill="#f23645"
            />
            <text
              x={width - paddingRight + 67}
              y={getY(dynResistanceSR) + 3.5}
              fill="#ffffff"
              fontFamily="var(--font-sans)"
              fontSize={8}
              fontWeight="900"
              textAnchor="middle"
              className="select-none pointer-events-none tracking-tight"
            >
              RESISTANCE (SELL) {dynResistanceSR.toFixed(2)}
            </text>
          </g>

          {/* Support right axis label tag: "SUPPORT (BUY) 4,487.30" */}
          <g>
            <rect
              x={width - paddingRight + 2}
              y={getY(dynSupportSR) - 9}
              width={130}
              height={18}
              rx={3}
              fill="#089981"
            />
            <text
              x={width - paddingRight + 67}
              y={getY(dynSupportSR) + 3.5}
              fill="#ffffff"
              fontFamily="var(--font-sans)"
              fontSize={8}
              fontWeight="900"
              textAnchor="middle"
              className="select-none pointer-events-none tracking-tight"
            >
              SUPPORT (BUY) {dynSupportSR.toFixed(2)}
            </text>
          </g>

          {/* Current price label tag on axis strip */}
          <g>
            <rect
              x={width - paddingRight + 2}
              y={getY(price) - 9}
              width={130}
              height={18}
              rx={3}
              fill="#00bcd4"
              className="animate-pulse"
            />
            <text
              x={width - paddingRight + 67}
              y={getY(price) + 3.5}
              fill="#071217"
              fontFamily="var(--font-sans)"
              fontSize={8.5}
              fontWeight="900"
              textAnchor="middle"
              className="select-none pointer-events-none tracking-tight"
            >
              GOLD SPOT ${price.toFixed(2)}
            </text>
          </g>

          {/* Active Order Target Tags on Axis (if active trade exists) */}
          {activeTrade && (
            <g>
              {/* ENTRY tag */}
              <rect
                x={width - paddingRight + 2}
                y={getY(activeTrade.entryPrice) - 8}
                width={130}
                height={16}
                rx={2.5}
                fill="#0284c7"
              />
              <text
                x={width - paddingRight + 67}
                y={getY(activeTrade.entryPrice) + 3}
                fill="#ffffff"
                fontFamily="var(--font-sans)"
                fontSize={7.5}
                fontWeight="900"
                textAnchor="middle"
                className="select-none pointer-events-none"
              >
                ENTRY ${activeTrade.entryPrice.toFixed(2)}
              </text>

              {/* SL tag */}
              <rect
                x={width - paddingRight + 2}
                y={getY(activeTrade.sl) - 8}
                width={130}
                height={16}
                rx={2.5}
                fill="#b91c1c"
              />
              <text
                x={width - paddingRight + 67}
                y={getY(activeTrade.sl) + 3}
                fill="#ffffff"
                fontFamily="var(--font-sans)"
                fontSize={7.5}
                fontWeight="900"
                textAnchor="middle"
                className="select-none pointer-events-none"
              >
                {activeTrade.stopMovedToBE ? "BE STOP LOSS" : `SL $${activeTrade.sl.toFixed(2)}`}
              </text>

              {/* TP tag */}
              <rect
                x={width - paddingRight + 2}
                y={getY(activeTrade.tp) - 8}
                width={130}
                height={16}
                rx={2.5}
                fill="#047857"
              />
              <text
                x={width - paddingRight + 67}
                y={getY(activeTrade.tp) + 3}
                fill="#ffffff"
                fontFamily="var(--font-sans)"
                fontSize={7.5}
                fontWeight="900"
                textAnchor="middle"
                className="select-none pointer-events-none"
              >
                TAKE PROFIT ${activeTrade.tp.toFixed(2)}
              </text>
            </g>
          )}

          {/* BOUNDARY DIVIDING LINES (AXIS FRAME) */}
          <line
            x1={width - paddingRight}
            y1={paddingTop}
            x2={width - paddingRight}
            y2={height - paddingBottom}
            stroke="#94a3b8"
            strokeWidth={0.8}
            className="opacity-[0.2]"
          />
          <line
            x1={paddingLeft}
            y1={height - paddingBottom}
            x2={width - paddingRight}
            y2={height - paddingBottom}
            stroke="#94a3b8"
            strokeWidth={0.8}
            className="opacity-[0.2]"
          />

          {/* ACTIVE POSITION TRIGGER ROUTES FOR ONGOING ORDERS */}
          {activeTrade && (
            <g>
              {/* Target profitability shading */}
              <rect
                x={paddingLeft}
                y={Math.min(getY(activeTrade.entryPrice), getY(price))}
                width={chartWidth}
                height={Math.max(1, Math.abs(getY(activeTrade.entryPrice) - getY(price)))}
                fill={activeTrade.unrealizedPl >= 0 ? "rgba(8,153,129,0.03)" : "rgba(242,54,69,0.03)"}
              />

              {/* Entry level dashed path */}
              <line
                x1={paddingLeft}
                y1={getY(activeTrade.entryPrice)}
                x2={width - paddingRight}
                y2={getY(activeTrade.entryPrice)}
                stroke="#38bdf8"
                strokeWidth={1.0}
                strokeDasharray="4,2"
              />
              <rect
                x={paddingLeft + 6}
                y={getY(activeTrade.entryPrice) - 13}
                width={85}
                height={13}
                rx={1}
                fill="#0369a1"
                opacity={0.9}
              />
              <text
                x={paddingLeft + 48.5}
                y={getY(activeTrade.entryPrice) - 4}
                fill="#ffffff"
                fontFamily="var(--font-mono)"
                fontSize={8}
                fontWeight="bold"
                textAnchor="middle"
              >
                ENTRY ${activeTrade.entryPrice.toFixed(2)}
              </text>

              {/* Stop Loss (SL) visual mark */}
              <line
                x1={paddingLeft}
                y1={getY(activeTrade.sl)}
                x2={width - paddingRight}
                y2={getY(activeTrade.sl)}
                stroke="#ef4444"
                strokeWidth={1.0}
                strokeDasharray="3,3"
              />
              <rect
                x={paddingLeft + 6}
                y={getY(activeTrade.sl) - 13}
                width={105}
                height={13}
                rx={1}
                fill="#991b1b"
                opacity={0.9}
              />
              <text
                x={paddingLeft + 58.5}
                y={getY(activeTrade.sl) - 4}
                fill="#ffffff"
                fontFamily="var(--font-mono)"
                fontSize={8}
                fontWeight="bold"
                textAnchor="middle"
              >
                {activeTrade.stopMovedToBE ? "BREAKEVEN SL" : `STOP LOSS $${activeTrade.sl.toFixed(2)}`}
              </text>

              {/* Take Profit (TP) visual mark */}
              <line
                x1={paddingLeft}
                y1={getY(activeTrade.tp)}
                x2={width - paddingRight}
                y2={getY(activeTrade.tp)}
                stroke="#10b981"
                strokeWidth={1.0}
                strokeDasharray="3,3"
              />
              <rect
                x={paddingLeft + 6}
                y={getY(activeTrade.tp) - 13}
                width={105}
                height={13}
                rx={1}
                fill="#065f46"
                opacity={0.9}
              />
              <text
                x={paddingLeft + 58.5}
                y={getY(activeTrade.tp) - 4}
                fill="#ffffff"
                fontFamily="var(--font-mono)"
                fontSize={8}
                fontWeight="bold"
                textAnchor="middle"
              >
                TAKE PROFIT ${activeTrade.tp.toFixed(2)}
              </text>

              {/* Glowing entry marker on the corresponding candlestick */}
              {visibleCandles.map((c, i) => {
                const isEntryCandle = Math.abs(c.time - activeTrade.entryTime) < 5 * 60 * 1000;
                if (!isEntryCandle) return null;
                const x = getX(i);
                const y = getY(activeTrade.entryPrice);
                const isBuy = activeTrade.type === "BUY";
                return (
                  <g key={`entry-marker-${i}`} className="animate-bounce">
                    <circle cx={x} cy={y} r={14} fill={isBuy ? "rgba(16,185,129,0.22)" : "rgba(244,63,94,0.22)"} stroke={isBuy ? "#10b981" : "#f43f5e"} strokeWidth={0.5} />
                    <circle cx={x} cy={y} r={5} fill={isBuy ? "#10b981" : "#f43f5e"} />
                    <polygon
                      points={isBuy ? `${x},${y - 12} ${x - 5},${y - 5} ${x + 5},${y - 5}` : `${x},${y + 12} ${x - 5},${y + 5} ${x + 5},${y + 5}`}
                      fill={isBuy ? "#10b981" : "#f43f5e"}
                    />
                    <text
                      x={x}
                      y={isBuy ? y - 18 : y + 22}
                      fill={isBuy ? "#10b981" : "#f43f5e"}
                      fontSize={8}
                      fontWeight="black"
                      fontFamily="var(--font-mono)"
                      textAnchor="middle"
                    >
                      {activeTrade.type} ENTRY
                    </text>
                  </g>
                );
              })}
            </g>
          )}

          {/* TRADINGVIEW CROSSHAIR DOTS */}
          {hoverCoords && hoverIdx !== null && (
            <g>
              {/* Horiz line trace */}
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
              {/* Vert line trace */}
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

              {/* Crosshair timeline badge (bottom x-axis) */}
              <rect
                x={getX(hoverIdx) - 30}
                y={height - paddingBottom}
                width={60}
                height={15}
                rx={1.5}
                fill="#1e293b"
                stroke="#475569"
                strokeWidth={0.8}
              />
              <text
                x={getX(hoverIdx)}
                y={height - paddingBottom + 11}
                fill="#38bdf8"
                fontFamily="var(--font-mono)"
                fontSize={8.5}
                fontWeight="extrabold"
                textAnchor="middle"
              >
                {new Date(visibleCandles[hoverIdx].time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', timeZone: "Asia/Colombo" })}
              </text>

              {/* Crosshair price badge (right Y-axis overlay) */}
              <rect
                x={width - paddingRight + 4}
                y={hoverCoords.y - 8}
                width={75}
                height={16}
                rx={1.5}
                fill="#1e293b"
                stroke="#475569"
                strokeWidth={0.8}
              />
              <text
                x={width - paddingRight + 41.5}
                y={hoverCoords.y + 4}
                fill="#38bdf8"
                fontFamily="var(--font-mono)"
                fontSize={8.5}
                fontWeight="extrabold"
                textAnchor="middle"
              >
                ${(maxPrice - ((hoverCoords.y - paddingTop) / chartHeight) * priceRange).toFixed(2)}
              </text>
            </g>
          )}

          {/* UTC Clock bottom right marker */}
          <text
            x={width - paddingRight - 5}
            y={height - paddingBottom + 26}
            fill="#565f6e"
            fontFamily="var(--font-mono)"
            fontSize={9}
            fontWeight="bold"
            textAnchor="end"
            className="select-none pointer-events-none"
          >
            {new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit', timeZone: "Asia/Colombo" })} (SLST)
          </text>
        </svg>

        {/* Floating Order overlay indicators */}
        {activeTrade && (
          <div className="absolute top-16 left-4 bg-[#1e222d]/95 backdrop-blur-md border border-neutral-800/80 text-[11px] py-1.5 px-3 rounded-xl shadow-2xl flex items-center gap-3 font-mono z-20">
            <span className="flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-pulse" />
              <span className="text-neutral-400">POSITION:</span>
              <span className={activeTrade.type === "BUY" ? "text-green-400 font-extrabold" : "text-red-400 font-extrabold"}>
                {activeTrade.type} {activeTrade.qty.toFixed(2)} LOTS
              </span>
            </span>
            <span className="text-neutral-700">|</span>
            <span className="flex items-center gap-1">
              <span className="text-neutral-400">UNREALIZED P&L:</span>
              <span className={activeTrade.unrealizedPl >= 0 ? "text-[#089981] font-bold" : "text-[#f23645] font-bold"}>
                {activeTrade.unrealizedPl >= 0 ? "+" : ""}${activeTrade.unrealizedPl.toFixed(2)}
              </span>
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
