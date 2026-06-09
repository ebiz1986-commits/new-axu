import dotenv from "dotenv";
dotenv.config();

import express from "express";
import path from "path";
import fs from "fs";
import { GoogleGenAI, Type } from "@google/genai";
import { createServer as createViteServer } from "vite";

// Initialize Gemini Client safely
const isGeminiEnabled = !!process.env.GEMINI_API_KEY;
let ai: any = null;
if (isGeminiEnabled) {
  ai = new GoogleGenAI({
    apiKey: process.env.GEMINI_API_KEY,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

// Initialize Twelve Data configuration
const isTwelveDataEnabled = !!process.env.TWELVE_DATA_API_KEY;

// Rate limiting and rate-exhausted cooling for Gemini calls to protect free quota
let lastSuccessfulGeminiCallTime = 0;
let geminiTemporarilyDisabledUntil = 0;
let lastCachedGeminiDecision: { action: "BUY" | "SELL" | "HOLD"; veto: boolean; reason: string } | null = null;

let lastTwelveDataPriceFetchTime = 0;
let targetTwelveDataPrice: number | null = null;

async function fetchTwelveDataPrice(): Promise<number | null> {
  const apiKey = process.env.TWELVE_DATA_API_KEY;
  if (!apiKey) return null;
  try {
    const url = `https://api.twelvedata.com/price?symbol=XAU/USD&apikey=${apiKey}`;
    const res = await fetch(url);
    if (!res.ok) return null;
    const data = await res.json();
    if (data && data.price) {
      return parseFloat(data.price);
    }
    if (data && data.status === "error") {
      console.warn("Twelve Data Price query service error limit:", data.message);
    }
  } catch (err) {
    console.error("Twelve Data Price query exception error:", err);
  }
  return null;
}

async function fetchTwelveDataCandles(): Promise<Candlestick[] | null> {
  const apiKey = process.env.TWELVE_DATA_API_KEY;
  if (!apiKey) return null;
  try {
    const url = `https://api.twelvedata.com/time_series?symbol=XAU/USD&interval=1min&outputsize=45&apikey=${apiKey}`;
    const res = await fetch(url);
    if (!res.ok) return null;
    const data = await res.json();
    if (data && (data.status === "error" || !data.values)) {
      console.warn("Twelve Data Candles query service error limit:", data.message || data);
      return null;
    }
    const list: Candlestick[] = data.values.reverse().map((item: any) => ({
      time: new Date(item.datetime).getTime(),
      open: parseFloat(item.open),
      high: parseFloat(item.high),
      low: parseFloat(item.low),
      close: parseFloat(item.close),
      volume: parseInt(item.volume || "1000")
    }));
    return list;
  } catch (err) {
    console.error("Twelve Data Candles query exception error:", err);
  }
  return null;
}

async function fetchBinancePrice(): Promise<number | null> {
  try {
    const res = await fetch("https://api.binance.com/api/v3/ticker/price?symbol=PAXGUSDT");
    if (!res.ok) return null;
    const data = await res.json();
    if (data && data.price) {
      return parseFloat(data.price);
    }
  } catch (err) {
    console.warn("Binance Price fetch exception:", err);
  }
  return null;
}

async function fetchBinanceCandles(): Promise<Candlestick[] | null> {
  try {
    const res = await fetch("https://api.binance.com/api/v3/klines?symbol=PAXGUSDT&interval=1m&limit=45");
    if (!res.ok) return null;
    const data = await res.json();
    if (Array.isArray(data)) {
      const list: Candlestick[] = data.map((item: any) => ({
        time: parseInt(item[0], 10),
        open: parseFloat(item[1]),
        high: parseFloat(item[2]),
        low: parseFloat(item[3]),
        close: parseFloat(item[4]),
        volume: parseFloat(item[5]) || 1000
      }));
      return list;
    }
  } catch (err) {
    console.warn("Binance Candles fetch exception:", err);
  }
  return null;
}

async function fetchRealActiveGoldPrice(): Promise<number | null> {
  if (isTwelveDataEnabled) {
    const price = await fetchTwelveDataPrice();
    if (price !== null) return price;
  }
  return await fetchBinancePrice();
}

async function fetchRealActiveGoldCandles(): Promise<Candlestick[] | null> {
  if (isTwelveDataEnabled) {
    const candles = await fetchTwelveDataCandles();
    if (candles && candles.length > 0) return candles;
  }
  return await fetchBinanceCandles();
}

const app = express();
app.use(express.json());

const PORT = 3000;
const DB_FILE = path.join(process.cwd(), "db.json");

// System parameters with sensible defaults
interface BotParams {
  riskPercent: number;        // e.g. 1.0% per trade
  b1Threshold: number;       // XGBoost score threshold (e.g. 0.65 check up, 0.35 check down)
  b2Floor: number;           // Confluence score floor (e.g. 6.0)
  trailingStopMultiplier: number; // e.g. 1.5x ATR
  partialCloseAtrRatio: number;   // e.g. 0.6x ATR to trigger partial profit taking
  lockoutMaxDailyLossPercent: number; // e.g. 2.0% daily loss limit
  lockoutMaxWeeklyLossPercent: number; // e.g. 5.0% weekly loss limit
  newsLockoutWindowMinutes: number; // e.g. 2 minutes before/after news
  adxTrendThreshold: number; // e.g. 22 for trend confirmation
  tickVelocityThreshold: number; // e.g. 3.0 points per 5 secs
  telegramBotToken: string;
  telegramChatId: string;
  isTelegramEnabled: boolean;
  isSessionLockoutEnabled: boolean;
}

const defaultParams: BotParams = {
  riskPercent: 1.5,
  b1Threshold: 0.65,
  b2Floor: 7.5,
  trailingStopMultiplier: 1.8,
  partialCloseAtrRatio: 1.5,
  lockoutMaxDailyLossPercent: 2.0,
  lockoutMaxWeeklyLossPercent: 5.0,
  newsLockoutWindowMinutes: 2,
  adxTrendThreshold: 22,
  tickVelocityThreshold: 2.5,
  telegramBotToken: "",
  telegramChatId: "",
  isTelegramEnabled: false,
  isSessionLockoutEnabled: false,
};

// Types
interface Candlestick {
  time: number; // ms timestamp
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  // indicators
  ema9?: number;
  ema21?: number;
  ema20?: number;
  ema50?: number;
  rsi?: number;
  bollingerUpper?: number;
  bollingerMiddle?: number;
  bollingerLower?: number;
  atr?: number;
  adx?: number;
}

interface ActiveTrade {
  id: string;
  type: "BUY" | "SELL";
  entryPrice: number;
  qty: number; // size in lots or ounces (mocked)
  sl: number;
  tp: number;
  initialSl: number;
  initialTp: number;
  entryTime: number;
  isPartialClosed: boolean;
  stopMovedToBE: boolean;
  trailingStopPrice: number;
  unrealizedPl: number;
  highestPriceSeen: number;
  lowestPriceSeen: number;
}

interface CompletedTrade {
  id: string;
  type: "BUY" | "SELL";
  entryPrice: number;
  exitPrice: number;
  qty: number;
  entryTime: number;
  exitTime: number;
  profit: number;
  exitReason: string; // "SL" | "TP" | "TrailingStop" | "TimeExit" | "Manual" | "Stale"
  isPartialClosed: boolean;
  highestPriceSeen?: number;
  lowestPriceSeen?: number;
}

interface BrainDecision {
  b0_velocity: number;
  b1_xgboost: number;
  b2_confluence: number;
  b3_gemini: { action: "BUY" | "SELL" | "HOLD"; veto: boolean; reason: string };
  b4_news_lockout: boolean;
  b4_upcoming_news: string;
}

interface GateStatus {
  id: string;
  name: string;
  passed: boolean;
  detail: string;
}

interface SystemState {
  balance: number;
  startBalance: number;
  dailyStartingBalance: number;
  weeklyStartingBalance: number;
  equity: number;
  goldPrice: number;
  tickHistory: { time: number; price: number }[];
  candles: Candlestick[];
  activeTrade: ActiveTrade | null;
  tradesLog: CompletedTrade[];
  params: BotParams;
  simulationMode: "LIVE" | "TREND_UP" | "TREND_DOWN" | "CHOP" | "NEWS_SPIKE" | "TWELVE_DATA";
  simulationSpeed: "REALTIME" | "FAST" | "ULTRA";
  lastSignalCheck: {
    time: number;
    decision: "BUY" | "SELL" | "NO_SIGNAL";
    gates: GateStatus[];
    brains: BrainDecision;
    notes?: string;
  } | null;
  newsEvents: { id: string; time: number; title: string; impact: "HIGH" | "MEDIUM"; triggered: boolean }[];
  auditLogs: { time: number; type: "SYSTEM" | "TRADE" | "BRAIN" | "RISK"; message: string }[];
  lastGeminiCoaching: string;
}

// Initial State Database Load
let state: SystemState = {
  balance: 50,
  startBalance: 50,
  dailyStartingBalance: 50,
  weeklyStartingBalance: 50,
  equity: 50,
  goldPrice: 2345.50,
  tickHistory: [],
  candles: [],
  activeTrade: null,
  tradesLog: [],
  params: { ...defaultParams },
  simulationMode: "LIVE",
  simulationSpeed: "FAST",
  lastSignalCheck: null,
  newsEvents: [
    { id: "news_1", time: Date.now() + 120000, title: "USD CPI Core (YoY)", impact: "HIGH", triggered: false },
    { id: "news_2", time: Date.now() + 300000, title: "USD Non-Farm Payrolls", impact: "HIGH", triggered: false },
    { id: "news_3", time: Date.now() + 480000, title: "USD FOMC Interest Rate Decision", impact: "HIGH", triggered: false },
  ],
  auditLogs: [
    { time: Date.now(), type: "SYSTEM", message: "Gold Bot Initialized. Running in Autonomous Cockpit mode." }
  ],
  lastGeminiCoaching: "Awaiting candle close metrics to analyze XAU/USD gold structure and optimize trade entry sizes."
};

// Seed initial candles (XAU/USD Gold data mock starters)
function generateInitialCandles() {
  const list: Candlestick[] = [];
  let basePrice = 2335.00;
  const now = Date.now();
  const timeStep = 5 * 60 * 1000; // 5 min interval scale

  for (let i = 40; i >= 1; i--) {
    const time = now - i * timeStep;
    const change = (Math.random() - 0.49) * 4.5;
    const open = basePrice;
    const close = basePrice + change;
    const high = Math.max(open, close) + Math.random() * 2.0;
    const low = Math.min(open, close) - Math.random() * 2.0;
    const volume = Math.floor(Math.random() * 5000) + 1000;
    basePrice = close;

    list.push({ time, open, high, low, close, volume });
  }
  state.candles = list;
  state.goldPrice = basePrice;
  recalculateIndicators();
}

generateInitialCandles();

// Helper to save state if wanted
function loadState() {
  try {
    if (fs.existsSync(DB_FILE)) {
      const saved = JSON.parse(fs.readFileSync(DB_FILE, "utf-8"));
      // Restore dynamic items
      state.balance = saved.balance ?? 50;
      state.startBalance = saved.startBalance ?? 50;
      state.dailyStartingBalance = saved.dailyStartingBalance ?? 50;
      state.weeklyStartingBalance = saved.weeklyStartingBalance ?? 50;
      state.tradesLog = saved.tradesLog ?? [];
      state.params = { ...defaultParams, ...saved.params };
      state.newsEvents = saved.newsEvents ?? state.newsEvents;
      if (saved.candles && saved.candles.length > 0) {
        state.candles = saved.candles;
        state.goldPrice = saved.goldPrice ?? state.goldPrice;
      }
      state.auditLogs.push({ time: Date.now(), type: "SYSTEM", message: "Restored bot state from database configuration." });
    }
  } catch (err) {
    console.warn("Failed to load db.json, using defaults:", err);
  }
}

function saveState() {
  try {
    fs.writeFileSync(DB_FILE, JSON.stringify({
      balance: state.balance,
      startBalance: state.startBalance,
      dailyStartingBalance: state.dailyStartingBalance,
      weeklyStartingBalance: state.weeklyStartingBalance,
      tradesLog: state.tradesLog,
      params: state.params,
      candles: state.candles.slice(-100), // persist last 100
      goldPrice: state.goldPrice,
      newsEvents: state.newsEvents
    }, null, 2), "utf-8");
  } catch (err) {
    console.error("Save state failed:", err);
  }
}

loadState();

async function bootstrapRealGoldData() {
  state.auditLogs.unshift({
    time: Date.now(),
    type: "SYSTEM",
    message: "Initiating live market synchronization. Fetching real historical XAU/USD gold candles..."
  });
  
  let realCandles = null;
  let sourceName = "";

  if (isTwelveDataEnabled) {
    realCandles = await fetchTwelveDataCandles();
    sourceName = "Twelve Data";
  }

  if (!realCandles || realCandles.length === 0) {
    realCandles = await fetchBinanceCandles();
    sourceName = "Binance PAXG/USDT Spot Index";
  }
  
  if (realCandles && realCandles.length > 0) {
    state.candles = realCandles;
    state.goldPrice = realCandles[realCandles.length - 1].close;
    recalculateIndicators();
    state.auditLogs.unshift({
      time: Date.now(),
      type: "SYSTEM",
      message: `✅ Market successfully synced! Loaded ${realCandles.length} real historical market candles from ${sourceName}. Current Gold Spot Price: $${state.goldPrice.toFixed(2)}`
    });
  } else {
    state.auditLogs.unshift({
      time: Date.now(),
      type: "RISK",
      message: "⚠️ Real-time data feed sync failed. Falling back to high-fidelity localized gold market price feeds."
    });
  }
  saveState();
}

bootstrapRealGoldData();

// Programmatic indicators engine
function recalculateIndicators() {
  const candles = state.candles;
  if (candles.length === 0) return;

  // 1. EMA 9
  let ema9 = candles[0].close;
  const k9 = 2 / (9 + 1);
  candles[0].ema9 = ema9;
  for (let i = 1; i < candles.length; i++) {
    ema9 = candles[i].close * k9 + ema9 * (1 - k9);
    candles[i].ema9 = ema9;
  }

  // 2. EMA 21
  let ema21 = candles[0].close;
  const k21 = 2 / (21 + 1);
  candles[0].ema21 = ema21;
  for (let i = 1; i < candles.length; i++) {
    ema21 = candles[i].close * k21 + ema21 * (1 - k21);
    candles[i].ema21 = ema21;
  }

  // 2b. EMA 20
  let ema20 = candles[0].close;
  const k20 = 2 / (20 + 1);
  candles[0].ema20 = ema20;
  for (let i = 1; i < candles.length; i++) {
    ema20 = candles[i].close * k20 + ema20 * (1 - k20);
    candles[i].ema20 = ema20;
  }

  // 2c. EMA 50
  let ema50 = candles[0].close;
  const k50 = 2 / (50 + 1);
  candles[0].ema50 = ema50;
  for (let i = 1; i < candles.length; i++) {
    ema50 = candles[i].close * k50 + ema50 * (1 - k50);
    candles[i].ema50 = ema50;
  }

  // 3. RSI 14
  if (candles.length >= 15) {
    let gains = 0;
    let losses = 0;
    // initial SMA elements of gains/losses
    for (let i = 1; i <= 14; i++) {
      const diff = candles[i].close - candles[i - 1].close;
      if (diff > 0) gains += diff;
      else losses -= diff;
    }
    let avgGain = gains / 14;
    let avgLoss = losses / 14;
    candles[14].rsi = avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss);

    for (let i = 15; i < candles.length; i++) {
      const diff = candles[i].close - candles[i - 1].close;
      avgGain = (avgGain * 13 + (diff > 0 ? diff : 0)) / 14;
      avgLoss = (avgLoss * 13 + (diff < 0 ? -diff : 0)) / 14;
      candles[i].rsi = avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss);
    }
  } else {
    // defaults
    candles.forEach(c => c.rsi = 50);
  }

  // 4. Bollinger Bands (20 periods, 2 stddev)
  const windowSize = 20;
  for (let i = 0; i < candles.length; i++) {
    if (i >= windowSize - 1) {
      const slice = candles.slice(i - windowSize + 1, i + 1);
      const sum = slice.reduce((a, b) => a + b.close, 0);
      const mean = sum / windowSize;
      const squaredDiffSum = slice.reduce((a, b) => a + Math.pow(b.close - mean, 2), 0);
      const stdDev = Math.sqrt(squaredDiffSum / windowSize);

      candles[i].bollingerMiddle = mean;
      candles[i].bollingerUpper = mean + 2 * stdDev;
      candles[i].bollingerLower = mean - 2 * stdDev;
    } else {
      candles[i].bollingerMiddle = candles[i].close;
      candles[i].bollingerUpper = candles[i].close + 4;
      candles[i].bollingerLower = candles[i].close - 4;
    }
  }

  // 5. ATR 14 (Average True Range)
  for (let i = 0; i < candles.length; i++) {
    if (i === 0) {
      candles[0].atr = candles[0].high - candles[0].low;
    } else {
      const tr1 = candles[i].high - candles[i].low;
      const tr2 = Math.abs(candles[i].high - candles[i - 1].close);
      const tr3 = Math.abs(candles[i].low - candles[i - 1].close);
      const tr = Math.max(tr1, tr2, tr3);

      if (i >= 14) {
        const slice = candles.slice(i - 13, i);
        const atrSum = slice.reduce((sum, c) => sum + (c.atr || 1.5), 0);
        candles[i].atr = (atrSum + tr) / 14;
      } else {
        candles[i].atr = (candles[i - 1].atr! * i + tr) / (i + 1);
      }
    }
  }

  // 6. Simplified ADX (Trend Strength Tracker)
  // Scores dynamic strength using absolute distance of RSI from middle line, EMA distance, and recent true range moves
  for (let i = 0; i < candles.length; i++) {
    const atr = candles[i].atr || 1.5;
    const emaDiff = Math.abs((candles[i].ema9 || candles[i].close) - (candles[i].ema21 || candles[i].close));
    const normalizedTrendStrength = (emaDiff / atr) * 20; // scales up trend strength
    candles[i].adx = Math.min(65, Math.max(10, normalizedTrendStrength + 12));
  }

  // Model scenario-based indicator alignment overrides
  if (state.simulationMode === "TREND_UP") {
    const len = candles.length;
    for (let i = Math.max(0, len - 10); i < len; i++) {
      const base = candles[i].close;
      const atr = candles[i].atr || 1.5;
      candles[i].ema9 = base + 1.2;
      candles[i].ema21 = base + 0.3;
      candles[i].ema20 = base - 0.2;
      candles[i].ema50 = base - 1.8;
      candles[i].rsi = 62;
      candles[i].adx = Math.max(candles[i].adx || 20, 24);
      candles[i].bollingerMiddle = base;
      candles[i].bollingerUpper = base + 2.5 * atr;
      candles[i].bollingerLower = base - 2.5 * atr;
    }
  } else if (state.simulationMode === "TREND_DOWN") {
    const len = candles.length;
    for (let i = Math.max(0, len - 10); i < len; i++) {
      const base = candles[i].close;
      const atr = candles[i].atr || 1.5;
      candles[i].ema9 = base - 1.2;
      candles[i].ema21 = base - 0.3;
      candles[i].ema20 = base + 0.2;
      candles[i].ema50 = base + 1.8;
      candles[i].rsi = 38;
      candles[i].adx = Math.max(candles[i].adx || 20, 24);
      candles[i].bollingerMiddle = base;
      candles[i].bollingerUpper = base + 2.5 * atr;
      candles[i].bollingerLower = base - 2.5 * atr;
    }
  }
}

// Global log utility
function logBotEvent(type: "SYSTEM" | "TRADE" | "BRAIN" | "RISK", message: string) {
  const item = { time: Date.now(), type, message };
  state.auditLogs.unshift(item);
  if (state.auditLogs.length > 150) state.auditLogs.pop();
  console.log(`[${type}] ${message}`);
}

// Mock economic news release triggers
function handleNewsCheck() {
  const now = Date.now();
  state.newsEvents.forEach(evt => {
    if (now >= evt.time && !evt.triggered) {
      evt.triggered = true;

      // ONLY trigger visual alerts, market spikes, and future schedules
      // if this news event actually occurred within 45 seconds of NOW (current session run)
      const isCurrentSessionEvent = (now - evt.time) < 45 * 1000;
      if (isCurrentSessionEvent) {
        logBotEvent("RISK", `⚠️ NEWS FLASH: High impact ${evt.title} has been released!`);

        // Trigger actual market tick spike!
        const direction = Math.random() > 0.5 ? 1 : -1;
        const spikeAmt = direction * (Math.random() * 18.0 + 8.0);
        state.goldPrice += spikeAmt;
        state.tickHistory.push({ time: Date.now(), price: state.goldPrice });
        logBotEvent("SYSTEM", `Economic volatility spike triggered. XAU/USD price moved by ${spikeAmt > 0 ? "+" : ""}${spikeAmt.toFixed(2)} USD.`);

        // Push a new calendar event for the future to keep simulation running
        setTimeout(() => {
          state.newsEvents.push({
            id: `news_${Date.now()}`,
            time: Date.now() + (Math.random() * 300000 + 180000), // next news in 3-8 mins
            title: ["USD Fed Chairman Powell Speech", "USD CPI (MoM)", "USD Retail Sales", "USD Unemployment Rate", "XAU/USD Reserve Index"][Math.floor(Math.random() * 5)],
            impact: Math.random() > 0.35 ? "HIGH" : "MEDIUM",
            triggered: false
          });
          saveState();
        }, 5000);
      } else {
        console.log(`Bypassed stale news event activation on server reload: ${evt.title}`);
      }
    }
  });

  // Keep newsEvents list bounded (e.g., keep only the last 20 events) to prevent infinite accumulation
  if (state.newsEvents.length > 20) {
    state.newsEvents.sort((a, b) => b.time - a.time);
    state.newsEvents = state.newsEvents.slice(0, 20);
  }
}

// Telegram messaging simulated and optionally executed in reality
async function sendTelegramAlert(message: string) {
  const slstTime = new Date().toLocaleTimeString("en-US", { timeZone: "Asia/Colombo", hour: '2-digit', minute: '2-digit', second: '2-digit' }) + " (SLST)";
  const formattedMessage = `${message}\n\n🕒 *Sri Lanka Time:* ${slstTime}`;

  if (state.params.isTelegramEnabled && state.params.telegramBotToken && state.params.telegramChatId) {
    try {
      const url = `https://api.telegram.org/bot${state.params.telegramBotToken}/sendMessage`;
      await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chat_id: state.params.telegramChatId, text: formattedMessage, parse_mode: "Markdown" })
      });
      logBotEvent("SYSTEM", "Telegram alerts successfully dispatched.");
    } catch (err) {
      logBotEvent("SYSTEM", `Telegram alert failed to deliver: ${String(err)}`);
    }
  } else {
    // Simulated print
    console.log(`[Simulated Telegram Feed] 👉 ${formattedMessage}`);
  }
}

// Track execution guide stage triggers and dispatch automatically to Telegram
let lastSentTelegramStageValue = 0;
let lastSentTelegramDirectionValue = "";

function checkTimelineTelegramNotifications() {
  if (!state.params.isTelegramEnabled || !state.params.telegramBotToken || !state.params.telegramChatId) {
    return;
  }

  const activeTrade = state.activeTrade;
  const lastDecision = state.lastSignalCheck?.decision;
  const brains = state.lastSignalCheck?.brains;
  const tradesLog = state.tradesLog;
  const lastTrade = tradesLog.length > 0 ? tradesLog[0] : null;

  let currentStage = 1;
  let highlightedDirection: "BUY" | "SELL" | "NONE" = "NONE";

  // Check XGBoost for setup prep
  const b1 = brains?.b1_xgboost ?? 0.5;
  const isPrepBuy = b1 >= 0.60;
  const isPrepSell = b1 <= 0.40;

  if (activeTrade) {
    if (activeTrade.isPartialClosed || activeTrade.stopMovedToBE) {
      currentStage = 4;
      highlightedDirection = activeTrade.type;
    } else {
      currentStage = 3;
      highlightedDirection = activeTrade.type;
    }
  } else if (lastDecision === "BUY" || lastDecision === "SELL") {
    currentStage = 2;
    highlightedDirection = lastDecision;
  } else {
    const justClosed = lastTrade && (Date.now() - lastTrade.exitTime < 15000);
    if (justClosed) {
      currentStage = 5;
      highlightedDirection = lastTrade.type;
    } else {
      currentStage = 1;
      if (isPrepBuy) {
        highlightedDirection = "BUY";
      } else if (isPrepSell) {
        highlightedDirection = "SELL";
      }
    }
  }

  // Check if state changed
  if (currentStage !== lastSentTelegramStageValue || highlightedDirection !== lastSentTelegramDirectionValue) {
    lastSentTelegramStageValue = currentStage;
    lastSentTelegramDirectionValue = highlightedDirection;

    let message = "";
    if (currentStage === 1) {
      if (highlightedDirection === "BUY") {
        message = `⚠️ *[STAGE 1: PREPARE SETUP]*\n📈 *PREPARE BUY IS COMING!*\n\nMomentum is building Upward. Confluence indicators are assembling candidate Buy patterns near support. Prepare to enter Buy positions!`;
      } else if (highlightedDirection === "SELL") {
        message = `⚠️ *[STAGE 1: PREPARE SETUP]*\n📉 *PREPARE SELL IS COMING!*\n\nVolatility is expanding Downward. Alignment channels are brewing potential Sell configurations under resistance. Prepare to enter Sell positions!`;
      }
    } else if (currentStage === 2) {
      message = `🚀 *[STAGE 2: EXECUTION]*\n🟢 *ENTER IN THE ${highlightedDirection}!*\n\nAll 10 risk gates and validation engines have passed! Firing automated ${highlightedDirection} market order now (0.01 Lot).`;
    } else if (currentStage === 3) {
      message = `🛡️ *[STAGE 3: HOLD THE ENTRY]*\n🟢 *HOLDING THE ${highlightedDirection} ENTRY!*\n\nPosition running smoothly. Track performance on the Gold interface.\n• Lot Size: 0.01 Lots\n• Entry Price: $${activeTrade?.entryPrice.toFixed(2)}`;
    } else if (currentStage === 4) {
      message = `🎯 *[STAGE 4: PREPARE FOR EXIT]*\n🟠 *PREPARE FOR EXIT!*\n\nPartial target secured! Banked 50% profit of the ${highlightedDirection} position. Remaining lot is trailing with Stop Loss secured at entry break-even.`;
    } else if (currentStage === 5 && lastTrade) {
      message = `🏁 *[STAGE 5: TAKE PROFIT]*\n🏆 *TAKE PROFIT / CYCLE COMPLETE!*\n\n${lastTrade.type} position exit finalized via *${lastTrade.exitReason}*. Realized profit booked successfully.`;
    }

    if (message) {
      sendTelegramAlert(message);
    }
  }
}

// DECISION BRAINS CALCULATION (M5 closes or on demand analysis)
async function evaluateBrains(currentPrice: number): Promise<BrainDecision> {
  const candles = state.candles;
  const lastCandle: Candlestick = candles[candles.length - 1] || {
    time: Date.now(),
    open: currentPrice,
    high: currentPrice,
    low: currentPrice,
    close: currentPrice,
    volume: 100,
    ema9: currentPrice,
    ema21: currentPrice,
    rsi: 50,
    bollingerMiddle: currentPrice,
    bollingerUpper: currentPrice + 4,
    bollingerLower: currentPrice - 4,
    atr: 1.5,
    adx: 20
  };

  // 1. B0: Tick Velocity Calculation (derivative of last 10 ticks)
  let b0_velocity = 0;
  if (state.tickHistory.length >= 10) {
    const lastTicks = state.tickHistory.slice(-10);
    const startPrice = lastTicks[0].price;
    const endPrice = lastTicks[lastTicks.length - 1].price;
    b0_velocity = endPrice - startPrice; // point velocity in last seconds
  }

  // 2. B1: XGBoost Model Probability (0.0 to 1.0)
  // Fakes a high quality ML forecast mapped on trend momentum, RSI, and random weights
  const emaFast = lastCandle.ema9 || lastCandle.close;
  const emaSlow = lastCandle.ema21 || lastCandle.close;
  const directionFactor = emaFast > emaSlow ? 0.58 : 0.42;
  const rsiFactor = ((lastCandle.rsi || 50) - 50) / 100; // positive for buy, negative for sell
  let b1_xgboost = directionFactor + rsiFactor + (Math.random() - 0.5) * 0.15;
  b1_xgboost = Math.max(0, Math.min(1, b1_xgboost));

  // 3. B2: Confluence Multi-Indicator Scoring (0 to 10 points)
  let b2_confluence = 0;
  const rsi = lastCandle.rsi || 50;
  // Rule 1: RSI check
  if (rsi > 55) b2_confluence += 2; // Bullish momentum
  if (rsi < 45) b2_confluence += 2; // Bearish momentum (confluence works in both directions, we categorize later)
  // Rule 2: EMA Crossover (strictly directional)
  const isBullishTrend = b1_xgboost >= 0.5;
  if (isBullishTrend && emaFast > emaSlow) b2_confluence += 2; // uptrend alignment
  else if (!isBullishTrend && emaFast < emaSlow) b2_confluence += 2; // downtrend alignment
  // Rule 3: Bollinger Breakout/Expansion
  const mid = lastCandle.bollingerMiddle || lastCandle.close;
  const upper = lastCandle.bollingerUpper || (mid + 4);
  const lower = lastCandle.bollingerLower || (mid - 4);
  const bw = (upper - lower) / mid;
  if (bw > 0.003) b2_confluence += 2; // high volatility expansion
  // Rule 4: Volume confirmation
  const avgVolume = 2500;
  if ((lastCandle.volume || 2000) > avgVolume) b2_confluence += 2;
  // Rule 5: Pure price velocity support (consistent multi-bar directions)
  if (candles.length >= 3) {
    const c1 = candles[candles.length - 1];
    const c2 = candles[candles.length - 2];
    const c3 = candles[candles.length - 3];
    if ((c1.close > c1.open && c2.close > c2.open) || (c1.close < c1.open && c2.close < c2.open)) {
      b2_confluence += 2; // consecutive momentum
    }
  }

  // 4. B4: News Calendar Gate Assessment
  let b4_news_lockout = false;
  let b4_upcoming_news = "Clear calendar";
  const now = Date.now();
  const lockoutWindow = state.params.newsLockoutWindowMinutes * 60 * 1000;
  
  if (lockoutWindow > 0) {
    for (const news of state.newsEvents) {
      const diff = Math.abs(news.time - now);
      if (diff < lockoutWindow) {
        b4_news_lockout = true;
        b4_upcoming_news = `${news.title} (${news.impact} impact) within ${Math.ceil(diff / 1000)}s!`;
        break;
      } else if (news.time > now && diff < 300000) {
        b4_upcoming_news = `${news.title} in ${Math.round(diff / 60000)}m`;
      }
    }
  }

  // 5. B3: Gemini AI Analyst (coaching vetoes or strategic hold prompts)
  let b3_gemini: { action: "BUY" | "SELL" | "HOLD"; veto: boolean; reason: string } = {
    action: "HOLD",
    veto: false,
    reason: "Local AI Coach: No strong trend structure found. Consolidating volume."
  };

  if (isGeminiEnabled && ai) {
    const now = Date.now();
    // Skip calling Gemini API under FAST/ULTRA speed simulation, if quota is cooling down, or within 6-minute throttle window
    const isFastSpeed = state.simulationSpeed === "FAST" || state.simulationSpeed === "ULTRA";
    const runLiveApi = !isFastSpeed && (now >= geminiTemporarilyDisabledUntil) && (now - lastSuccessfulGeminiCallTime >= 6 * 60 * 1000);

    if (runLiveApi) {
      try {
        // Feed actual market metrics to the LLM
        const briefData = {
          goldPrice: currentPrice,
          lastCandles: candles.slice(-5).map(c => ({
            time: new Date(c.time).toLocaleTimeString(),
            o: c.open.toFixed(2),
            h: c.high.toFixed(2),
            l: c.low.toFixed(2),
            c: c.close.toFixed(2),
            rsi: c.rsi?.toFixed(1)
          })),
          rsi: rsi.toFixed(2),
          ema9: emaFast.toFixed(2),
          ema21: emaSlow.toFixed(2),
          atr: (lastCandle.atr || 1.5).toFixed(2),
          adx: (lastCandle.adx || 20).toFixed(1),
          newsAlert: b4_upcoming_news,
          currentLockout: b4_news_lockout
        };

        const prompt = `Perform quantitative gold (XAU/USD) order block / sentiment checks.
        Market metrics: ${JSON.stringify(briefData)}.
        Provide an elegant buy/sell/hold tactical action (MUST agree with confluence if direction matches, or veto true to lock risk). Return response EXACTLY in JSON formats.`;

        const response = await ai.models.generateContent({
          model: "gemini-3.5-flash",
          contents: prompt,
          config: {
            responseMimeType: "application/json",
            responseSchema: {
              type: Type.OBJECT,
              properties: {
                action: { type: Type.STRING, description: "Must be BUY, SELL, or HOLD" },
                veto: { type: Type.BOOLEAN, description: "Whether to force risk veto lockout" },
                reason: { type: Type.STRING, description: "Short 1-2 sentence pro review" }
              },
              required: ["action", "veto", "reason"]
            },
            systemInstruction: "You are an Elite Quant Executive trading gold (XAU/USD) with robust algorithmic filters. Your decisions must be logical, risk-clamped, and explain indicators perfectly. Avoid any fluff."
          }
        });

        const parsed = JSON.parse(response.text || "{}");
        b3_gemini = {
          action: (parsed.action === "BUY" || parsed.action === "SELL") ? parsed.action : "HOLD",
          veto: !!parsed.veto,
          reason: parsed.reason ? `Live AI Model: ${parsed.reason}` : "Undergoing quantitative market review."
        };
        state.lastGeminiCoaching = b3_gemini.reason;
        lastSuccessfulGeminiCallTime = now;
        lastCachedGeminiDecision = b3_gemini;
      } catch (err: any) {
        console.warn("Gemini B3 analytical query error:", err);
        const errStr = String(err).toLowerCase();
        
        // If we hit 429 rate limit or quota exceeded, trigger a 15-minute automatic cooldown pause
        if (errStr.includes("429") || errStr.includes("quota") || errStr.includes("exhausted") || errStr.includes("limit")) {
          geminiTemporarilyDisabledUntil = now + 15 * 60 * 1000;
          console.log(`[SYSTEM] Gemini quota exhausted detection: Cool-off period enabled for 15 minutes.`);
        }

        if (lastCachedGeminiDecision) {
          b3_gemini = {
            ...lastCachedGeminiDecision,
            reason: `Local Reserve: ${lastCachedGeminiDecision.reason} (Preserving API Quota)`
          };
        } else {
          let reason = "Technical review: Volume is consolidating. Avoid entries.";
          let action: "BUY" | "SELL" | "HOLD" = "HOLD";
          if (rsi > 65 && emaFast > emaSlow) {
            reason = "Bullish structure. Price riding EMAs with solid volume support.";
            action = "BUY";
          } else if (rsi < 35 && emaFast < emaSlow) {
            reason = "Bearish distribution block. High downside acceleration potential.";
            action = "SELL";
          }
          b3_gemini = { action, veto: false, reason: `Local Reserve: ${reason}` };
        }
      }
    } else {
      // Switched to Local Reserve or Cached Decision to protect free API limits
      if (lastCachedGeminiDecision) {
        b3_gemini = {
          ...lastCachedGeminiDecision,
          reason: lastCachedGeminiDecision.reason.startsWith("Local Reserve") || lastCachedGeminiDecision.reason.startsWith("Live AI Model")
            ? lastCachedGeminiDecision.reason
            : `Local Reserve: ${lastCachedGeminiDecision.reason}`
        };
      } else {
        let reason = "Local quantitative overlay: Oscillating session. Awaiting high momentum session.";
        let action: "BUY" | "SELL" | "HOLD" = "HOLD";
        if (rsi > 60 && emaFast > emaSlow) {
          reason = "Local quantitative overlay: Strong momentum detected above 9-period EMA.";
          action = "BUY";
        } else if (rsi < 40 && emaFast < emaSlow) {
          reason = "Local quantitative overlay: Bearish distribution below 21-period EMA.";
          action = "SELL";
        }
        b3_gemini = { action, veto: false, reason: `Local Reserve: ${reason}` };
      }
    }
  } else {
    // Local AI coach heuristic when Gemini Key is absent
    let reason = "Local Engine: Volume is flat. Oscillating candles. Wait for liquidity breakout.";
    let action: "BUY" | "SELL" | "HOLD" = "HOLD";
    if (rsi > 60 && emaFast > emaSlow) {
      reason = "Local quantitative overlay: Strong momentum detected above 9-period EMA.";
      action = "BUY";
    } else if (rsi < 40 && emaFast < emaSlow) {
      reason = "Local quantitative overlay: Bearish distribution below 21-period EMA.";
      action = "SELL";
    }
    b3_gemini = { action, veto: false, reason };
  }

  let final_b1 = b1_xgboost;
  let final_b2 = b2_confluence;

  if (state.simulationMode === "TREND_UP") {
    final_b1 = Math.max(b1_xgboost, state.params.b1Threshold + 0.05);
    final_b2 = Math.max(b2_confluence, state.params.b2Floor + 1.0);
    b3_gemini = { action: "BUY", veto: false, reason: "Trend Up active. Dynamic order structure is highly bullish." };
  } else if (state.simulationMode === "TREND_DOWN") {
    final_b1 = Math.min(b1_xgboost, 1 - state.params.b1Threshold - 0.05);
    final_b2 = Math.max(b2_confluence, state.params.b2Floor + 1.0);
    b3_gemini = { action: "SELL", veto: false, reason: "Trend Down active. Technical order block is bearish." };
  }

  return {
    b0_velocity,
    b1_xgboost: final_b1,
    b2_confluence: final_b2,
    b3_gemini,
    b4_news_lockout,
    b4_upcoming_news
  };
}

function findStructureLevels() {
  const candles = state.candles;
  const leftWindow = 2;
  const rightWindow = 2;
  const supports: number[] = [];
  const resistances: number[] = [];

  for (let i = leftWindow; i < candles.length - rightWindow; i++) {
    const currentLow = candles[i].low;
    const currentHigh = candles[i].high;

    // Check low peak
    let isMin = true;
    for (let j = i - leftWindow; j <= i + rightWindow; j++) {
      if (j !== i && candles[j].low < currentLow) {
        isMin = false;
        break;
      }
    }

    // Check high peak
    let isMax = true;
    for (let j = i - leftWindow; j <= i + rightWindow; j++) {
      if (j !== i && candles[j].high > currentHigh) {
        isMax = false;
        break;
      }
    }

    if (isMin) supports.push(currentLow);
    if (isMax) resistances.push(currentHigh);
  }
  return { supports, resistances };
}

// DECISION SIGNAL FUSION ENGINE - CHECK 10 GOLD GATES
async function processSignalFusion() {
  const candles = state.candles;
  if (candles.length < 5) return;

  const currentPrice = state.goldPrice;
  const brains = await evaluateBrains(currentPrice);
  const lastCandle = candles[candles.length - 1];
  const last2 = candles[candles.length - 2];

  // Prepare gates container
  const gates: GateStatus[] = [];

  // Determine intended direction to verify gates against
  let intendedDirection: "BUY" | "SELL" | "NONE" = "NONE";
  const xgboostThreshold = state.params.b1Threshold; // e.g. 0.65
  const xgboostSellLimit = 1 - xgboostThreshold;     // e.g. 0.35

  if (brains.b1_xgboost >= xgboostThreshold && 
      brains.b2_confluence >= state.params.b2Floor && 
      lastCandle.ema9! > lastCandle.ema21! &&
      lastCandle.ema20! > lastCandle.ema50!) {
    intendedDirection = "BUY";
  } else if (brains.b1_xgboost <= xgboostSellLimit && 
             brains.b2_confluence >= state.params.b2Floor && 
             lastCandle.ema9! < lastCandle.ema21! &&
             lastCandle.ema20! < lastCandle.ema50!) {
    intendedDirection = "SELL";
  }

  // Gate 1: Directional Fusion Agreement Check
  const g1_passed = intendedDirection !== "NONE";
  gates.push({
    id: "g1",
    name: "Brain Directional Fusion",
    passed: g1_passed,
    detail: g1_passed
      ? `Agreed on ${intendedDirection}! XGBoost score: ${brains.b1_xgboost.toFixed(2)}, Confluence technical score: ${brains.b2_confluence}/10.`
      : `No clear directional alignment. XGBoost forecast was ${brains.b1_xgboost.toFixed(2)} (requires >=${xgboostThreshold} for BUY or <=${xgboostSellLimit.toFixed(2)} for SELL) and Confluence score is ${brains.b2_confluence}/10 (requires >=${state.params.b2Floor}).`
  });

  // Gate 2: Flip-flop Direction Recency Guard
  let g2_passed = true;
  let g2_detail = "Clear of sudden directional change locks.";
  if (g1_passed && state.tradesLog.length > 0) {
    const lastTrade = state.tradesLog[0]; // sorted reverse
    const candlesSinceLastTrade = Math.floor((Date.now() - lastTrade.exitTime) / (30000)); // fast mode helper ticks
    if (lastTrade.type !== intendedDirection && candlesSinceLastTrade < 3) {
      g2_passed = false;
      g2_detail = `Direction reversal banned! Attempted counter-trade of previous ${lastTrade.type} too quickly. Minimum spacing: 3 candle cycles required.`;
    }
  }
  gates.push({ id: "g2", name: "Flip-flop Reversal Guard", passed: g2_passed, detail: g2_detail });

  // Gate 3: State Double Entry Prevention
  const g3_passed = state.activeTrade === null;
  gates.push({
    id: "g3",
    name: "Trade-State Availability Check",
    passed: g3_passed,
    detail: g3_passed ? "No open positions. Ready to allocate risk." : "An active gold position is already running."
  });

  // Gate 4: High Timeframe (H4) Trend Confirmation Filter
  // Mocked as larger period SMA alignment
  let h4_trend_bias = "BULLISH";
  // If price is below 100-period smooth MA, trend is bearish
  const smoothPeriod = 30;
  const recentCandlesSlice = candles.slice(-smoothPeriod);
  const avgSmooth = recentCandlesSlice.reduce((s, c) => s + c.close, 0) / recentCandlesSlice.length;
  if (currentPrice < avgSmooth) {
    h4_trend_bias = "BEARISH";
  }

  // Override H4 trend bias under TREND_UP / TREND_DOWN simulation modes
  if (state.simulationMode === "TREND_UP") {
    h4_trend_bias = "BULLISH";
  } else if (state.simulationMode === "TREND_DOWN") {
    h4_trend_bias = "BEARISH";
  }

  let g4_passed = true;
  if (intendedDirection === "BUY" && h4_trend_bias !== "BULLISH") {
    g4_passed = false;
  } else if (intendedDirection === "SELL" && h4_trend_bias !== "BEARISH") {
    g4_passed = false;
  }
  gates.push({
    id: "g4",
    name: "H4 Framework Trend Lock",
    passed: g4_passed,
    detail: g4_passed
      ? `Aligned with H4 trend bias (${h4_trend_bias})!`
      : `Blocked! Attempting ${intendedDirection} against H4 micro bias: ${h4_trend_bias} (Average: $${avgSmooth.toFixed(2)}).`
  });

  // Gate 5: Core Session Clock Restrictions
  // London NY Hour filter (Asian low-liquidity lockout helper rules)
  // Let's mock a daily hour timeline. We increment a simulated hour of day.
  const simHour = new Date().getUTCHours();
  // Asian times: 22 - 7 UTC
  const isAsia = simHour >= 22 || simHour < 7;
  const g5_passed = !state.params.isSessionLockoutEnabled || !isAsia;
  gates.push({
    id: "g5",
    name: "Active Session High-Liquidity Timer",
    passed: g5_passed,
    detail: g5_passed
      ? (isAsia ? `London / New York clock restrictions by-passed (Session lock is disabled). Current time: ${simHour}:00 UTC.` : "London / New York high liquidity session active.")
      : `Blocked! Trading paused during low-liquidity Tokyo/Sydney Hours (Hour: ${simHour} UTC) to avoid wide spread risks.`
  });

  // Gate 6: Daily/Weekly Risk Limits Lockout check
  const last24hTrades = state.tradesLog.filter(t => Date.now() - t.exitTime < 24 * 60 * 60 * 1000);
  const dailyPnL = last24hTrades.reduce((sum, t) => sum + t.profit, 0);
  const dailyLossLimitDollars = (state.dailyStartingBalance * state.params.lockoutMaxDailyLossPercent) / 100;
  const g6_passed = dailyPnL > -dailyLossLimitDollars;
  gates.push({
    id: "g6",
    name: "Cumulative Loss-Gate Protector",
    passed: g6_passed,
    detail: g6_passed
      ? `Risk limits healthy. Daily P&L is $${dailyPnL.toFixed(2)} (Safe limits: -$${dailyLossLimitDollars.toFixed(2)}).`
      : `BLOCKED! Daily Loss Lockout active. P&L is $${dailyPnL.toFixed(2)} which exceeded the Max Daily Limit ($${dailyLossLimitDollars.toFixed(2)}).`
  });

  // Gate 7: Consolidation Squeeze / Chop & RSI Exhaustion Filter
  const atr = lastCandle.atr || 1.5;
  const bbUpper = lastCandle.bollingerUpper || currentPrice + 4;
  const bbLower = lastCandle.bollingerLower || currentPrice - 4;
  const bbSqueezeRatio = (bbUpper - bbLower) / currentPrice;
  const isChopMarket = bbSqueezeRatio < 0.0018 || (lastCandle.rsi! >= 47 && lastCandle.rsi! <= 53);
  
  let rsiExhausted = false;
  let rsiDetail = "";
  if (intendedDirection === "BUY" && lastCandle.rsi! > 70) {
    rsiExhausted = true;
    rsiDetail = `RSI is Overbought (${lastCandle.rsi!.toFixed(1)} > 70). Entering BUY at exhaustion is blocked.`;
  } else if (intendedDirection === "SELL" && lastCandle.rsi! < 30) {
    rsiExhausted = true;
    rsiDetail = `RSI is Oversold (${lastCandle.rsi!.toFixed(1)} < 30). Entering SELL at exhaustion is blocked.`;
  }

  const g7_passed = !isChopMarket && !rsiExhausted;
  gates.push({
    id: "g7",
    name: "Chop, Sideways & RSI Exhaustion Filter",
    passed: g7_passed,
    detail: !g7_passed
      ? (rsiExhausted ? `Blocked! ${rsiDetail}` : `Blocked! Chop filter triggered. XAU/USD in sideways squeeze. Wait for volatility breakout.`)
      : `Band expansion ratio (${(bbSqueezeRatio * 100).toFixed(3)}%) is tradeable. RSI is healthy (${lastCandle.rsi!.toFixed(1)}).`
  });

  // Gate 8: EMA20 Price Over-Extension Guard
  const distanceToEMA20 = Math.abs(currentPrice - (lastCandle.ema20 || lastCandle.close));
  const maxAllowedExtension = 2.5 * atr; // MAX_EXTENSION_ATR = 2.5
  const isOverExtended = distanceToEMA20 > maxAllowedExtension;
  const g8_passed = !isOverExtended;
  gates.push({
    id: "g8",
    name: "EMA20 Price Over-Extension Guard",
    passed: g8_passed,
    detail: g8_passed
      ? `Price spot correlation to EMA20 is healthy (Distance: $${distanceToEMA20.toFixed(2)} vs Max Limit: $${maxAllowedExtension.toFixed(2)}).`
      : `Blocked! Price is over-extended from M5 EMA20 (Distance: $${distanceToEMA20.toFixed(2)} > Max allowed: $${maxAllowedExtension.toFixed(2)}).`
  });

  // Gate 9: Volatility Momentum & Entry Quality Structure Gate
  const adx = lastCandle.adx || 20;
  const velocityScore = Math.abs(brains.b0_velocity);
  const momentumPassed = adx >= state.params.adxTrendThreshold || velocityScore > state.params.tickVelocityThreshold;

  // Structure detection
  const { supports, resistances } = findStructureLevels();
  let nearStructure = false;
  let nearestLevel = 0;
  const thresholdDistance = 1.0 * atr;

  if (intendedDirection === "BUY") {
    const validSupports = supports.filter(s => s <= currentPrice);
    if (validSupports.length > 0) {
      const closestSupport = Math.max(...validSupports);
      nearestLevel = closestSupport;
      if (currentPrice - closestSupport <= thresholdDistance) {
        nearStructure = true;
      }
    }
  } else if (intendedDirection === "SELL") {
    const validResistances = resistances.filter(r => r >= currentPrice);
    if (validResistances.length > 0) {
      const closestResistance = Math.min(...validResistances);
      nearestLevel = closestResistance;
      if (closestResistance - currentPrice <= thresholdDistance) {
        nearStructure = true;
      }
    }
  }

  // Quality Constraint: Require structure proximity OR premium B2 (score >= 8.5)
  const strongB2Floor = 8.5;
  const isHighQualityEntry = nearStructure || brains.b2_confluence >= strongB2Floor;
  const g9_passed = momentumPassed && isHighQualityEntry;
  
  let gate9Detail = "";
  if (!momentumPassed) {
    gate9Detail = `Blocked! Stale market momentum. ADX: ${adx.toFixed(1)} limits (requires >=${state.params.adxTrendThreshold} or Tick Velocity).`;
  } else if (!isHighQualityEntry) {
    gate9Detail = `Blocked! Entry quality failure. Spot price not near key market pivot (nearest: $${nearestLevel.toFixed(2)}, distance: $${Math.abs(currentPrice - nearestLevel).toFixed(2)}) and B2 score (${brains.b2_confluence}/10) below premium threshold (${strongB2Floor}/10).`;
  } else {
    gate9Detail = `Momentum verified! Quality confirmed via ${nearStructure ? `proximity to pivot support/resistance ($${nearestLevel.toFixed(2)})` : `premium technical confluence score (${brains.b2_confluence}/10)`}.`;
  }

  gates.push({
    id: "g9",
    name: "Momentum & Market Structure Quality Gateway",
    passed: g9_passed,
    detail: gate9Detail
  });

  // Gate 10: Soft Checks and Sizing Modulation
  // Gemini AI Veto check, economic news buffers, and final size calculations
  let g10_passed = !brains.b3_gemini.veto && !brains.b4_news_lockout;
  let sizingFactor = 1.0;
  let sizeDetail = "";

  if (brains.b4_news_lockout) sizeDetail += "Locked out by High impact economic calendar NFP/CPI constraints! ";
  if (brains.b3_gemini.veto) sizeDetail += "Gemini Analyst: Veto active. Risk structure too messy! ";

  // Volatility sizing multiplier: High ATR = lower size to balance dollars at risk
  const normalizedATRRatio = 2.0 / atr; // normalized size around 2.0 points move
  sizingFactor *= Math.min(1.5, Math.max(0.4, normalizedATRRatio));

  gates.push({
    id: "g10",
    name: "Dynamic Brain Veto & Sizing Regulator",
    passed: g10_passed,
    detail: g10_passed
      ? `Clear of any AI Veto or News warnings. Calculated lot size multiplier: ${sizingFactor.toFixed(2)}x. Gemini: "${brains.b3_gemini.reason}"`
      : `Blocked! ${sizeDetail}`
  });

  // Overall engine summary evaluation
  const allPassed = gates.every(g => g.passed);
  const finalDecision = allPassed ? intendedDirection : "NO_SIGNAL";

  state.lastSignalCheck = {
    time: Date.now(),
    decision: finalDecision as any,
    gates,
    brains,
    notes: !allPassed
       ? `Gate [${gates.find(g => !g.passed)?.name}] rejected trade execution.`
       : `ALGO FUSION SUCCESS: Fired automated high-precision market entry order.`
  };

  // If ALL gates passed, enter trade!
  if (allPassed && intendedDirection !== "NONE") {
    executeTrade(intendedDirection, currentPrice, atr, sizingFactor);
  }
  checkTimelineTelegramNotifications();
}

// EXECUTE TRADE ORDER
function executeTrade(type: "BUY" | "SELL", price: number, atr: number, sizeMultiplier: number) {
  const atrVal = atr || 1.8;
  const slOffset = atrVal * 1.5; // ATR Stop Loss multiplier
  const tpOffset = atrVal * 3.0; // Dynamic 2:1 RR Take Profit multiplier

  const slPrice = type === "BUY" ? price - slOffset : price + slOffset;
  const tpPrice = type === "BUY" ? price + tpOffset : price - tpOffset;

  // Sizing formula: Risk balance based on stop loss distance
  const stopDistancePoints = slOffset;
  const balanceToRisk = state.balance * (state.params.riskPercent / 100);
  // Gold pricing: $10.00 point change = $1,000 on standard 100oz contract (1 lot)
  // So size = balanceToRisk / (stopDistancePoints * 100)
  let baseQtyLots = balanceToRisk / (stopDistancePoints * 10.0);
  baseQtyLots = Math.max(0.01, Math.min(5.0, baseQtyLots * sizeMultiplier)); // Lot clamping

  const trade: ActiveTrade = {
    id: `trade_${Date.now()}`,
    type,
    entryPrice: price,
    qty: parseFloat(baseQtyLots.toFixed(2)),
    sl: parseFloat(slPrice.toFixed(2)),
    tp: parseFloat(tpPrice.toFixed(2)),
    initialSl: parseFloat(slPrice.toFixed(2)),
    initialTp: parseFloat(tpPrice.toFixed(2)),
    entryTime: Date.now(),
    isPartialClosed: false,
    stopMovedToBE: false,
    trailingStopPrice: parseFloat(slPrice.toFixed(2)),
    unrealizedPl: 0,
    highestPriceSeen: price,
    lowestPriceSeen: price
  };

  state.activeTrade = trade;
  logBotEvent("TRADE", `🚀 EXECUTED AUTONOMOUS ${type} ORDER: Size: ${trade.qty} lots @ $${price.toFixed(2)}. SL: $${trade.sl.toFixed(2)}, TP: $${trade.tp.toFixed(2)}.`);
  sendTelegramAlert(`🔔 *Autonomous Gold Bot Entry* 🔔\n\n*Type:* ${type}\n*Entry Price:* $${price.toFixed(2)}\n*Size:* ${trade.qty} Lots\n*Stop Loss:* $${trade.sl.toFixed(2)} (1.5x ATR)\n*Take Profit:* $${trade.tp.toFixed(2)} (3.0x ATR)\n\n_All 10 decision fusion gate checks passed!_`);
}

// MANUALLY TRIGGER POSITION FOR INTERACTIVE TESTING
export function forceManualTrade(type: "BUY" | "SELL") {
  if (state.activeTrade) {
    logBotEvent("RISK", "Execution rejected. There is already an active trade position running.");
    return false;
  }
  const currentPrice = state.goldPrice;
  const candles = state.candles;
  const lastCandle = candles[candles.length - 1] || { atr: 1.5 };
  const atr = lastCandle.atr || 1.5;

  executeTrade(type, currentPrice, atr, 1.0);
  return true;
}

// REALTIME TICK TRACKER & TRADE EXIT STATE CONTROLLER
function handleMarketTick() {
  const currentPrice = state.goldPrice;
  const now = Date.now();

  // Update tick records
  state.tickHistory.push({ time: now, price: currentPrice });
  if (state.tickHistory.length > 100) state.tickHistory.shift();

  // Evaluate active trades exit loops
  if (state.activeTrade) {
    const trade = state.activeTrade;

    // Calcul P&L (Gold point value multiplier: $100 per full point per standard lot)
    const pointsMove = currentPrice - trade.entryPrice;
    const plMultiplier = 100.0 * trade.qty;
    trade.unrealizedPl = trade.type === "BUY" ? pointsMove * plMultiplier : -pointsMove * plMultiplier;

    // Track highest/lowest price limits for Trailing Stop
    if (currentPrice > trade.highestPriceSeen) trade.highestPriceSeen = currentPrice;
    if (currentPrice < trade.lowestPriceSeen) trade.lowestPriceSeen = currentPrice;

    // Get ATR from main metrics
    const lastCandle = state.candles[state.candles.length - 1] || { atr: 1.5 };
    const atr = lastCandle.atr || 1.5;

    // Check Trigger SL (Stop Loss)
    const isSlHit = trade.type === "BUY" ? currentPrice <= trade.sl : currentPrice >= trade.sl;
    if (isSlHit) {
      exitOpenPosition("Stop Loss (SL) triggered", trade.sl);
      return;
    }

    // Check Trigger TP (Take Profit)
    const isTpHit = trade.type === "BUY" ? currentPrice >= trade.tp : currentPrice <= trade.tp;
    if (isTpHit) {
      exitOpenPosition("Take Profit (TP) reached", trade.tp);
      return;
    }

    // Check Partial Profit Taking Rule (+0.6 ATR Points move)
    const partialClosePointsOffset = atr * state.params.partialCloseAtrRatio;
    const pointsInProfit = trade.type === "BUY" ? (currentPrice - trade.entryPrice) : (trade.entryPrice - currentPrice);

    if (pointsInProfit >= partialClosePointsOffset && !trade.isPartialClosed) {
      trade.isPartialClosed = true;
      const originalQty = trade.qty;
      const partialPnLDollars = pointsInProfit * 100.0 * (originalQty / 2.0);
      state.balance += partialPnLDollars; // banking half the profit instantly

      // Half the quantity, clamp at minimum 0.01 lots
      trade.qty = parseFloat(Math.max(0.01, originalQty / 2.0).toFixed(2));

      // Move Stop Loss to Break Even (BE)
      trade.sl = trade.entryPrice;
      trade.stopMovedToBE = true;

      logBotEvent("TRADE", `🎯 PARTIAL TARGET REACHED (+${partialClosePointsOffset.toFixed(2)} pts). Secured 50% ($${partialPnLDollars.toFixed(2)}) and secured Breakeven Stop on runners.`);
      sendTelegramAlert(`🎯 *Partial Close Target Banked!*\n\n*Secured:* $${partialPnLDollars.toFixed(2)} Profit\n*Status:* Moved remaining Stop Loss to Break Even (${trade.entryPrice.toFixed(2)}) to remove all risk!`);
    }

    // Check Trailing Stop logic
    // Long trail trailing: once in profit, trail stop ~ ATR multiplier below highest price seen
    if (trade.stopMovedToBE && pointsInProfit > atr * 1.5) {
      const trailMult = state.params.trailingStopMultiplier;
      const newSl = trade.type === "BUY"
        ? parseFloat((trade.highestPriceSeen - atr * trailMult).toFixed(2))
        : parseFloat((trade.lowestPriceSeen + atr * trailMult).toFixed(2));

      // Only move Stop in the favorable direction!
      if (trade.type === "BUY" && newSl > trade.sl) {
        trade.sl = newSl;
        trade.trailingStopPrice = newSl;
      } else if (trade.type === "SELL" && newSl < trade.sl) {
        trade.sl = newSl;
        trade.trailingStopPrice = newSl;
      }
    }

    // Check Time-based limit Exit (stale position check, e.g. closes after ~2 hours / ~60 fast ticks)
    const elapsedMinutes = (Date.now() - trade.entryTime) / 60000;
    const isStale = state.simulationSpeed === "FAST"
       ? elapsedMinutes > 10.0 // fast mode limits
       : elapsedMinutes > 120.0; // live timing

    if (isStale) {
      exitOpenPosition("Time Exit (Stale position clean-up)", currentPrice);
    }
  }
  checkTimelineTelegramNotifications();
}

// EXIT OPEN POSITION ENGINE WRITE-OUT
function exitOpenPosition(reason: string, exitPrice: number) {
  if (!state.activeTrade) return;

  const trade = state.activeTrade;
  const pointsMove = exitPrice - trade.entryPrice;
  const plMultiplier = 100.0 * trade.qty;
  const finalProfit = trade.type === "BUY" ? pointsMove * plMultiplier : -pointsMove * plMultiplier;

  state.balance += finalProfit;
  state.equity = state.balance;

  const completed: CompletedTrade = {
    id: trade.id,
    type: trade.type,
    entryPrice: trade.entryPrice,
    exitPrice: parseFloat(exitPrice.toFixed(2)),
    qty: trade.qty,
    entryTime: trade.entryTime,
    exitTime: Date.now(),
    profit: parseFloat(finalProfit.toFixed(2)),
    exitReason: reason.includes("Stop Loss") ? "SL" : reason.includes("Take Profit") ? "TP" : reason.includes("Time") ? "TimeExit" : "Manual",
    isPartialClosed: trade.isPartialClosed,
    highestPriceSeen: trade.highestPriceSeen,
    lowestPriceSeen: trade.lowestPriceSeen
  };

  state.tradesLog.unshift(completed);
  if (state.tradesLog.length > 50) state.tradesLog.pop();

  state.activeTrade = null;

  logBotEvent("TRADE", `❌ CLOSED POSITION: ${reason} @ $${exitPrice.toFixed(2)}. Net profit: ${finalProfit >= 0 ? "+" : ""}$${finalProfit.toFixed(2)} USD.`);
  sendTelegramAlert(`🚨 *Gold Position Closed* 🚨\n\n*Type:* ${trade.type}\n*Reason:* ${reason}\n*Exit Price:* $${exitPrice.toFixed(2)}\n*Net Profit:* ${finalProfit >= 0 ? "+" : ""}$${finalProfit.toFixed(2)} USD`);

  saveState();
}

// SIMULATE NEXT MARKET BAR (CANDLE AGGREGATION)
function closeCandleAndTriggerFusion() {
  const candles = state.candles;
  const price = state.goldPrice;

  // Build new candlestick from ticks
  const prevClose = candles.length > 0 ? candles[candles.length - 1].close : price - 2;
  const o = prevClose;
  const c = price;
  const h = Math.max(o, c) + Math.random() * 2.2;
  const l = Math.min(o, c) - Math.random() * 2.2;
  const v = Math.floor(Math.random() * 4000) + 1200;

  const newCandle: Candlestick = {
    time: Date.now(),
    open: parseFloat(o.toFixed(2)),
    high: parseFloat(h.toFixed(2)),
    low: parseFloat(l.toFixed(2)),
    close: parseFloat(c.toFixed(2)),
    volume: v
  };

  candles.push(newCandle);
  if (candles.length > 150) candles.shift();

  recalculateIndicators();

  logBotEvent("SYSTEM", `📊 Broadcaster: Candle closed at $${c.toFixed(2)}. ADX: ${newCandle.adx?.toFixed(1)}, ATR: ${newCandle.atr?.toFixed(2)}. Running Algo signals...`);

  // Trigger decision fusion on close!
  processSignalFusion();
  saveState();
}

// DATA FEED - TICK SIMULATION MACHINE
let tickTimer: NodeJS.Timeout | null = null;
let ticksCountdown = 25; // default countdown

function stopTickSimulation() {
  if (tickTimer) clearInterval(tickTimer);
}

function startTickSimulation() {
  stopTickSimulation();

  let tickIntervalMs = 1200;
  if (state.simulationSpeed === "ULTRA") {
    tickIntervalMs = 150;
    ticksCountdown = 15;
  } else if (state.simulationSpeed === "REALTIME") {
    tickIntervalMs = 2500;
    ticksCountdown = 60;
  } else {
    tickIntervalMs = 1200;
    ticksCountdown = 25; // FAST
  }

  tickTimer = setInterval(() => {
    // 1. Generate new price tick based on active scenario mode
    const mode = state.simulationMode;
    let delta = 0;

    if (mode === "LIVE" || mode === "TWELVE_DATA") {
      const now = Date.now();
      const throttleWindow = state.simulationSpeed === "REALTIME" ? 12000 : 25000;
      if (now - lastTwelveDataPriceFetchTime > throttleWindow) {
        lastTwelveDataPriceFetchTime = now;
        fetchRealActiveGoldPrice().then(price => {
          if (price !== null) {
            targetTwelveDataPrice = price;
            logBotEvent("SYSTEM", `🌐 Real-Time Price synced live Gold spot price: $${price.toFixed(2)}`);
          }
        });
      }

      if (targetTwelveDataPrice !== null) {
        const diff = targetTwelveDataPrice - state.goldPrice;
        if (Math.abs(diff) < 0.15) {
          delta = (Math.random() - 0.5) * 0.08; 
        } else {
          delta = diff * 0.15 + (Math.random() - 0.5) * 0.05;
        }
      } else {
        delta = (Math.random() - 0.49) * 0.15;
      }
    } else {
      if (mode === "TREND_UP") {
        delta = (Math.random() - 0.35) * 1.5; // solid upward push
      } else if (mode === "TREND_DOWN") {
        delta = (Math.random() - 0.65) * 1.5; // solid downward waterfall
      } else if (mode === "CHOP") {
        delta = (Math.random() - 0.5) * 0.35;  // very tight sideways
      } else if (mode === "NEWS_SPIKE") {
        delta = (Math.random() - 0.5) * 5.5;  // wide swings
      }
    }

    state.goldPrice = parseFloat((state.goldPrice + delta).toFixed(2));
    handleMarketTick();
    handleNewsCheck();

    // In real-time mode we build candles slower. In fast modes we close of a candle every 30 ticks
    ticksCountdown--;
    if (ticksCountdown <= 0) {
      closeCandleAndTriggerFusion();
      if (state.simulationSpeed === "ULTRA") {
        ticksCountdown = 15;
      } else if (state.simulationSpeed === "REALTIME") {
        ticksCountdown = 60;
      } else {
        ticksCountdown = 25; // FAST
      }
    }

    // Keep equity sync when running active trades
    if (state.activeTrade) {
      state.equity = state.balance + state.activeTrade.unrealizedPl;
    } else {
      state.equity = state.balance;
    }

  }, tickIntervalMs);
}

startTickSimulation();

// API REST routes
app.get("/api/state", (req, res) => {
  res.json({
    ...state,
    equity: state.equity,
    unrealizedPnL: state.activeTrade ? state.activeTrade.unrealizedPl : 0,
    hasGeminiKey: isGeminiEnabled,
    hasTwelveDataKey: isTwelveDataEnabled
  });
});

app.post("/api/settings", (req, res) => {
  const settings = req.body;
  if (settings.params) {
    state.params = { ...state.params, ...settings.params };
  }
  if (settings.simulationMode) {
    state.simulationMode = settings.simulationMode;
    logBotEvent("SYSTEM", `Switched simulation scenario engine to: ${state.simulationMode}`);
  }
  if (settings.simulationSpeed) {
    state.simulationSpeed = settings.simulationSpeed;
    logBotEvent("SYSTEM", `Speed level tweaked to: ${state.simulationSpeed}`);
    startTickSimulation();
  }
  saveState();
  res.json({ success: true, params: state.params, simulationMode: state.simulationMode, simulationSpeed: state.simulationSpeed });
});

app.post("/api/test-telegram", async (req, res) => {
  const { botToken, chatId } = req.body;
  if (!botToken || !chatId) {
    return res.status(400).json({ error: "Missing botToken or chatId to perform integration test." });
  }

  try {
    const url = `https://api.telegram.org/bot${botToken}/sendMessage`;
    const slstTime = new Date().toLocaleTimeString("en-US", { timeZone: "Asia/Colombo", hour: '2-digit', minute: '2-digit', second: '2-digit' }) + " (SLST)";
    const message = `📡 *XAU/USD Gold Bot Pipeline:* Integration test successful! Your Execution Guide Timeline status updates are now connected.\n\n🕒 *Sri Lanka Time:* ${slstTime}`;
    
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: chatId, text: message, parse_mode: "Markdown" })
    });

    const data = await response.json();
    if (data.ok) {
      logBotEvent("SYSTEM", `Telegram broadcast integration tested successfully.`);
      res.json({ success: true, detail: "Test message delivered successfully to Telegram!" });
    } else {
      res.status(400).json({ error: data.description || "Failed to deliver. Check Bot Token or Chat ID." });
    }
  } catch (err) {
    res.status(500).json({ error: `Connection failed: ${String(err)}` });
  }
});

app.post("/api/manual-trigger", (req, res) => {
  const { type } = req.body;
  if (type === "BUY" || type === "SELL") {
    const ok = forceManualTrade(type);
    res.json({ success: ok, message: ok ? `Successfully opened manual ${type} trade.` : "Rejected. Trade already running." });
  } else {
    res.status(400).json({ error: "Invalid direction" });
  }
});

app.post("/api/recheck", async (req, res) => {
  try {
    recalculateIndicators();
    await processSignalFusion();
    saveState();
    res.json({
      success: true,
      message: "Sequential gate check triggered successfully against latest market tick.",
      lastSignalCheck: state.lastSignalCheck
    });
  } catch (err) {
    res.status(500).json({ error: `Manual gate recheck failed: ${String(err)}` });
  }
});

app.post("/api/trigger-news", (req, res) => {
  const upcoming = {
    id: `man_news_${Date.now()}`,
    time: Date.now() + 5000, // triggers in 5 seconds
    title: req.body.title || "USD FOMC Rate Press Conference",
    impact: (req.body.impact || "HIGH") as any,
    triggered: false
  };
  state.newsEvents.unshift(upcoming);
  logBotEvent("RISK", `Added manual scheduled news flash: ${upcoming.title} (${upcoming.impact} impact)`);
  res.json({ success: true, event: upcoming });
});

app.post("/api/reset", (req, res) => {
  state.balance = 50;
  state.startBalance = 50;
  state.dailyStartingBalance = 50;
  state.weeklyStartingBalance = 50;
  state.equity = 50;
  state.activeTrade = null;
  state.tradesLog = [];
  state.auditLogs = [{ time: Date.now(), type: "SYSTEM", message: "Bot data log wiped. Account balance reset to $50.00." }];
  state.lastSignalCheck = null;
  state.lastGeminiCoaching = "Awaiting candle close metrics to analyze XAU/USD gold structure and optimize trade entry sizes.";
  generateInitialCandles();
  saveState();
  res.json({ success: true });
});

// Asking Gemini for custom coaching advice based on current data
app.post("/api/mentor", async (req, res) => {
  if (!isGeminiEnabled || !ai) {
    return res.json({
      coaching: "Mentor Insight: Keep an eye on the EMA 9 & 21 crossovers. Gold performs best during explosive London-New York trends when volume remains above its 20-period moving average. Clamping your losses protects capital in choppy conditions."
    });
  }

  try {
    const recentTrades = state.tradesLog.slice(0, 5);
    const textPrompt = `You are a certified professional futures trading coach. Write a customized, elite, and ultra-short 3-sentence trading tip for our user. Mention current Gold value ($${state.goldPrice}), recent win status from these trades: ${JSON.stringify(recentTrades)}, and outline how to master the 10-gate signal checklist. Be highly specific, motivating, and focus on volatility-based risks.`;

    const response = await ai.models.generateContent({
      model: "gemini-3.5-flash",
      contents: textPrompt
    });

    res.json({ coaching: response.text });
  } catch (err: any) {
    console.warn("Gemini Mentor API error:", err);
    let errorStr = String(err).toLowerCase();
    
    // Check if it is a rate limit or resource exhaustion limit
    if (errorStr.includes("429") || errorStr.includes("quota") || errorStr.includes("exhausted") || errorStr.includes("limit")) {
      return res.json({
        coaching: "💡 API Quota Warning: The daily free-tier Gemini API quota (limit 20 requests/day) has been temporarily reached. The Gold Bot remains fully operational using high-fidelity local quant heuristics! Adjust your 10-gate technical requirements to maximize your edge."
      });
    }
    
    res.json({
      coaching: "Mentor Insight: Avoid trading news blocks. The ATR stop-loss helps filter dynamic slippages. Sticking to high-momentum London sessions keeps your risk-reward above 2:1 cleanly."
    });
  }
});

// Start express custom dev / production middleware setup
async function startApp() {
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Backend server with autonomous simulator booted successfully on http://0.0.0.0:${PORT}`);
  });
}

startApp();
