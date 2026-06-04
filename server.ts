import dotenv from "dotenv";
dotenv.config();

import express from "express";
import path from "path";
import fs from "fs";
import { GoogleGenAI, Type } from "@google/genai";
import { createServer as createViteServer } from "vite";
import Groq from "groq-sdk";
import Parser from "rss-parser";

import { 
  BotParams, 
  Candlestick, 
  ActiveTrade, 
  CompletedTrade, 
  BrainDecision, 
  GateStatus, 
  NewsEvent, 
  LiveNewsEvent, 
  AuditLog, 
  Analytics, 
  BotState, 
  SmartMoneyStatus 
} from "./src/types";

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

// Initialize Groq Client safely
const isGroqEnabled = !!process.env.GROQ_API_KEY;
let groq: Groq | null = null;
if (isGroqEnabled) {
  groq = new Groq({
    apiKey: process.env.GROQ_API_KEY
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

const defaultAnalytics: Analytics = {
  totalTrades: 0,
  wins: 0,
  losses: 0,
  winRate: 0,
  profitFactor: 0,
  totalGrossProfit: 0,
  totalGrossLoss: 0,
  dailyPnL: 0,
  weeklyPnL: 0,
  consecutiveLosses: 0,
  consecutiveWins: 0,
  maxDrawdown: 0,
  dailyLocked: false,
  weeklyLocked: false,
  tradesThisDay: 0,
  maxDailyTrades: 6,
  cooldownUntil: 0,
  lastResetDate: new Date().toISOString().split('T')[0],
  lastWeeklyResetDate: new Date().toISOString().split('T')[0]
};

// Initial State database load
let state: BotState = {
  balance: 2000,
  equity: 2000,
  goldPrice: 2345.50,
  tickHistory: [],
  candles: [],
  h1Candles: [],
  h4Candles: [],
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
  liveNewsEvents: [],
  auditLogs: [
    { time: Date.now(), type: "SYSTEM", message: "Gold Bot Initialized. Running in Autonomous Cockpit mode." }
  ],
  unrealizedPnL: 0,
  hasGeminiKey: isGeminiEnabled,
  hasTwelveDataKey: isTwelveDataEnabled,
  hasGroqKey: isGroqEnabled,
  lastGeminiCoaching: "Awaiting candle close metrics to analyze XAU/USD gold structure and optimize trade entry sizes.",
  analytics: { ...defaultAnalytics },
  startBalance: 2000,
  dailyStartingBalance: 2000,
  weeklyStartingBalance: 2000
};

// Rss Parser configuration for news feed
const rssParser = new Parser({
  customFields: {
    item: ['ff_impact', 'impact', 'ff_country', 'country']
  }
});

async function fetchForexFactoryNews() {
  try {
    const feed = await rssParser.parseURL("https://nfs.faireconomy.media/ff_calendar_thisweek.xml");
    const list: LiveNewsEvent[] = [];
    const now = Date.now();
    for (const item of feed.items) {
      if (!item.isoDate && !item.pubDate) continue;
      const eventTime = new Date(item.isoDate || item.pubDate!).getTime();
      if (isNaN(eventTime)) continue;
      
      let impact: "High" | "Medium" | "Low" = "Low";
      const rawImpact = ((item as any).ff_impact || (item as any).impact || "").trim().toLowerCase();
      if (rawImpact.startsWith("h")) impact = "High";
      else if (rawImpact.startsWith("m")) impact = "Medium";
      
      let country = "USD";
      const rawCountry = ((item as any).ff_country || (item as any).country || "").trim().toUpperCase();
      if (rawCountry) {
        country = rawCountry;
      }
      
      const name = item.title || "Economic Event";
      const matchesCurrency = country === "USD" || (impact === "High" && ["EUR", "GBP", "CNY"].includes(country));
      if (matchesCurrency) {
        list.push({ time: eventTime, name, impact, country });
      }
    }
    
    list.sort((a, b) => a.time - b.time);
    state.liveNewsEvents = list;
    console.log(`[NEWS] Live ForexFactory calendar synced: ${list.length} USD/major events loaded.`);
  } catch (err) {
    console.error("[NEWS] Failed to fetch ForexFactory calendar:", err);
  }
}

// Start news polling
fetchForexFactoryNews();
setInterval(fetchForexFactoryNews, 6 * 60 * 60 * 1000); // 6 hours

function getNewsLockoutStatus() {
  const now = Date.now();
  const highWindow = 60 * 60 * 1000;
  const medWindow = 30 * 60 * 1000;
  
  let blocked = false;
  let reduction = 1.0;
  let reason = "Clear calendar";
  let upcoming = "";
  
  for (const event of state.liveNewsEvents || []) {
    const diff = Math.abs(event.time - now);
    if (event.impact === "High" && diff <= highWindow) {
      blocked = true;
      reduction = 0.0;
      reason = `Blocked! High impact news event: ${event.name} (${event.country})`;
      upcoming = `${event.name} (${event.impact} impact) within ${Math.ceil(diff / 60000)}m!`;
      break;
    }
    if (event.impact === "Medium" && diff <= medWindow) {
      reduction = 0.5;
      reason = `Size Reduced! Medium impact news event: ${event.name} (${event.country})`;
      upcoming = `${event.name} (${event.impact} impact) in ${Math.ceil(diff / 60000)}m`;
    }
  }
  
  return { blocked, reduction, reason, upcoming };
}

function getSimulatedNewsLockoutStatus() {
  const now = Date.now();
  const lockoutWindow = state.params.newsLockoutWindowMinutes * 60 * 1000;
  
  let blocked = false;
  let reduction = 1.0;
  let upcoming = "";
  
  for (const news of state.newsEvents) {
    const diff = Math.abs(news.time - now);
    if (diff < lockoutWindow) {
      blocked = true;
      reduction = 0.0;
      upcoming = `${news.title} (${news.impact} impact) within ${Math.ceil(diff / 1000)}s!`;
      break;
    } else if (news.time > now && diff < 300000) {
      upcoming = `${news.title} in ${Math.round(diff / 60000)}m`;
    }
  }
  return { blocked, reduction, upcoming };
}

// Seed initial candles (XAU/USD Gold data mock starters)
function generateInitialCandles() {
  const list: Candlestick[] = [];
  let basePrice = 2335.00;
  const now = Date.now();
  const timeStep = 5 * 60 * 1000;

  for (let i = 100; i >= 1; i--) {
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
  recalculateAnalytics();
}

generateInitialCandles();

function loadState() {
  try {
    if (fs.existsSync(DB_FILE)) {
      const saved = JSON.parse(fs.readFileSync(DB_FILE, "utf-8"));
      state.balance = saved.balance ?? 2000;
      state.equity = saved.equity ?? state.balance;
      state.startBalance = saved.startBalance ?? 2000;
      state.dailyStartingBalance = saved.dailyStartingBalance ?? state.balance;
      state.weeklyStartingBalance = saved.weeklyStartingBalance ?? state.balance;
      state.tradesLog = saved.tradesLog ?? [];
      state.params = { ...defaultParams, ...saved.params };
      state.newsEvents = saved.newsEvents ?? state.newsEvents;
      if (saved.candles && saved.candles.length > 0) {
        state.candles = saved.candles;
        state.goldPrice = saved.goldPrice ?? state.goldPrice;
      }
      state.auditLogs.push({ time: Date.now(), type: "SYSTEM", message: "Restored bot state from database configuration." });
      recalculateIndicators();
      recalculateAnalytics();
    }
  } catch (err) {
    console.warn("Failed to load db.json, using defaults:", err);
  }
}

function saveState() {
  try {
    fs.writeFileSync(DB_FILE, JSON.stringify({
      balance: state.balance,
      equity: state.equity,
      startBalance: state.startBalance,
      dailyStartingBalance: state.dailyStartingBalance,
      weeklyStartingBalance: state.weeklyStartingBalance,
      tradesLog: state.tradesLog,
      params: state.params,
      candles: state.candles.slice(-100),
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
    recalculateAnalytics();
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

// General technical indicators calculator
function computeIndicatorsForArray(candles: Candlestick[]) {
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

  // 5. ATR 14
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

  // 6. ADX
  for (let i = 0; i < candles.length; i++) {
    const atr = candles[i].atr || 1.5;
    const emaDiff = Math.abs((candles[i].ema9 || candles[i].close) - (candles[i].ema21 || candles[i].close));
    const normalizedTrendStrength = (emaDiff / atr) * 20;
    candles[i].adx = Math.min(65, Math.max(10, normalizedTrendStrength + 12));
  }
}

// Recalculate indicators across M5, H1, H4
function recalculateIndicators() {
  computeIndicatorsForArray(state.candles);
  
  if (state.simulationMode === "TREND_UP") {
    const len = state.candles.length;
    for (let i = Math.max(0, len - 20); i < len; i++) {
      const base = state.candles[i].close;
      const atr = state.candles[i].atr || 1.5;
      state.candles[i].ema9 = base + 1.2;
      state.candles[i].ema21 = base + 0.3;
      state.candles[i].ema20 = base - 0.2;
      state.candles[i].ema50 = base - 1.8;
      state.candles[i].rsi = 62;
      state.candles[i].adx = Math.max(state.candles[i].adx || 20, 24);
      state.candles[i].bollingerMiddle = base;
      state.candles[i].bollingerUpper = base + 2.5 * atr;
      state.candles[i].bollingerLower = base - 2.5 * atr;
    }
  } else if (state.simulationMode === "TREND_DOWN") {
    const len = state.candles.length;
    for (let i = Math.max(0, len - 20); i < len; i++) {
      const base = state.candles[i].close;
      const atr = state.candles[i].atr || 1.5;
      state.candles[i].ema9 = base - 1.2;
      state.candles[i].ema21 = base - 0.3;
      state.candles[i].ema20 = base + 0.2;
      state.candles[i].ema50 = base + 1.8;
      state.candles[i].rsi = 38;
      state.candles[i].adx = Math.max(state.candles[i].adx || 20, 24);
      state.candles[i].bollingerMiddle = base;
      state.candles[i].bollingerUpper = base + 2.5 * atr;
      state.candles[i].bollingerLower = base - 2.5 * atr;
    }
  }
  
  aggregateAllCandles();
}

function aggregateAllCandles() {
  const m5Candles = state.candles;
  const h1Candles: Candlestick[] = [];
  const h4Candles: Candlestick[] = [];
  
  const h1Period = 60 * 60 * 1000;
  const h4Period = 4 * 60 * 60 * 1000;
  
  for (const c of m5Candles) {
    const h1Ts = Math.floor(c.time / h1Period) * h1Period;
    let currentH1 = h1Candles[h1Candles.length - 1];
    if (!currentH1 || h1Ts > currentH1.time) {
      h1Candles.push({
        time: h1Ts,
        open: c.open,
        high: c.high,
        low: c.low,
        close: c.close,
        volume: c.volume
      });
    } else {
      if (c.high > currentH1.high) currentH1.high = c.high;
      if (c.low < currentH1.low) currentH1.low = c.low;
      currentH1.close = c.close;
      currentH1.volume += c.volume;
    }
    
    const h4Ts = Math.floor(c.time / h4Period) * h4Period;
    let currentH4 = h4Candles[h4Candles.length - 1];
    if (!currentH4 || h4Ts > currentH4.time) {
      h4Candles.push({
        time: h4Ts,
        open: c.open,
        high: c.high,
        low: c.low,
        close: c.close,
        volume: c.volume
      });
    } else {
      if (c.high > currentH4.high) currentH4.high = c.high;
      if (c.low < currentH4.low) currentH4.low = c.low;
      currentH4.close = c.close;
      currentH4.volume += c.volume;
    }
  }
  
  computeIndicatorsForArray(h1Candles);
  computeIndicatorsForArray(h4Candles);
  
  state.h1Candles = h1Candles;
  state.h4Candles = h4Candles;
}

function recalculateAnalytics() {
  const completed = state.tradesLog;
  const totalTrades = completed.length;
  const wins = completed.filter(t => t.profit > 0).length;
  const losses = completed.filter(t => t.profit <= 0).length;
  
  const winRate = totalTrades > 0 ? parseFloat(((wins / totalTrades) * 100).toFixed(1)) : 0.0;
  
  const grossProfit = completed.filter(t => t.profit > 0).reduce((sum, t) => sum + t.profit, 0);
  const grossLoss = Math.abs(completed.filter(t => t.profit < 0).reduce((sum, t) => sum + t.profit, 0));
  const profitFactor = grossLoss > 0 ? parseFloat((grossProfit / grossLoss).toFixed(2)) : (grossProfit > 0 ? 99.9 : 0.0);
  
  // Calculate consecutive wins and losses
  let consecutiveWins = 0;
  let consecutiveLosses = 0;
  
  let currentStreakWins = 0;
  let currentStreakLosses = 0;
  let streakBroken = false;
  for (let i = 0; i < completed.length; i++) {
    const p = completed[i].profit;
    if (p > 0) {
      if (!streakBroken) {
        currentStreakWins++;
      }
    } else {
      streakBroken = true;
    }
  }
  
  streakBroken = false;
  for (let i = 0; i < completed.length; i++) {
    const p = completed[i].profit;
    if (p <= 0) {
      if (!streakBroken) {
        currentStreakLosses++;
      }
    } else {
      streakBroken = true;
    }
  }
  
  consecutiveWins = currentStreakWins;
  consecutiveLosses = currentStreakLosses;

  // Daily and weekly P&L
  const now = Date.now();
  const dayMs = 24 * 60 * 60 * 1000;
  const weekMs = 7 * dayMs;
  const dailyPnL = completed.filter(t => now - t.exitTime < dayMs).reduce((sum, t) => sum + t.profit, 0);
  const weeklyPnL = completed.filter(t => now - t.exitTime < weekMs).reduce((sum, t) => sum + t.profit, 0);

  const dailyLossLimitPercent = state.params.lockoutMaxDailyLossPercent || 2.0;
  const weeklyLossLimitPercent = state.params.lockoutMaxWeeklyLossPercent || 5.0;

  const dailyStartingBalance = state.dailyStartingBalance || state.balance;
  const weeklyStartingBalance = state.weeklyStartingBalance || state.balance;

  const maxDailyLoss = - (dailyStartingBalance * (dailyLossLimitPercent / 100));
  const maxWeeklyLoss = - (weeklyStartingBalance * (weeklyLossLimitPercent / 100));

  const dailyLocked = dailyPnL <= maxDailyLoss;
  const weeklyLocked = weeklyPnL <= maxWeeklyLoss;

  const tradesThisDay = completed.filter(t => now - t.exitTime < dayMs).length;
  const maxDailyTrades = state.analytics?.maxDailyTrades || 6;

  let maxDrawdown = 0;
  let peak = state.startBalance;
  let currentBalance = state.startBalance;
  const chronoTrades = [...completed].reverse();
  for (const t of chronoTrades) {
    currentBalance += t.profit;
    if (currentBalance > peak) peak = currentBalance;
    const dd = peak > 0 ? ((peak - currentBalance) / peak) * 100 : 0;
    if (dd > maxDrawdown) maxDrawdown = dd;
  }

  state.analytics = {
    totalTrades,
    wins,
    losses,
    winRate,
    profitFactor,
    totalGrossProfit: parseFloat(grossProfit.toFixed(2)),
    totalGrossLoss: parseFloat(grossLoss.toFixed(2)),
    dailyPnL: parseFloat(dailyPnL.toFixed(2)),
    weeklyPnL: parseFloat(weeklyPnL.toFixed(2)),
    consecutiveLosses,
    consecutiveWins,
    maxDrawdown: parseFloat(maxDrawdown.toFixed(2)),
    dailyLocked,
    weeklyLocked,
    tradesThisDay,
    maxDailyTrades,
    cooldownUntil: 0,
    lastResetDate: new Date().toISOString().split('T')[0],
    lastWeeklyResetDate: new Date().toISOString().split('T')[0]
  };
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
      logBotEvent("RISK", `⚠️ NEWS FLASH: High impact ${evt.title} has been released!`);

      const direction = Math.random() > 0.5 ? 1 : -1;
      const spikeAmt = direction * (Math.random() * 18.0 + 8.0);
      state.goldPrice += spikeAmt;
      state.tickHistory.push({ time: Date.now(), price: state.goldPrice });
      logBotEvent("SYSTEM", `Economic volatility spike triggered. XAU/USD price moved by ${spikeAmt > 0 ? "+" : ""}${spikeAmt.toFixed(2)} USD.`);

      setTimeout(() => {
        state.newsEvents.push({
          id: `news_${Date.now()}`,
          time: Date.now() + (Math.random() * 300000 + 180000),
          title: ["USD Fed Chairman Powell Speech", "USD CPI (MoM)", "USD Retail Sales", "USD Unemployment Rate", "XAU/USD Reserve Index"][Math.floor(Math.random() * 5)],
          impact: Math.random() > 0.35 ? "HIGH" : "MEDIUM",
          triggered: false
        });
      }, 5000);
    }
  });
}

// Telegram messaging simulated and executed in reality
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
      message = `🚀 *[STAGE 2: EXECUTION]*\n🟢 *ENTER IN THE ${highlightedDirection}!*\n\nAll 10 risk gates and validation engines have passed! Firing automated ${highlightedDirection} market order now.`;
    } else if (currentStage === 3) {
      message = `🛡️ *[STAGE 3: HOLD THE ENTRY]*\n🟢 *HOLDING THE ${highlightedDirection} ENTRY!*\n\nPosition running smoothly. Track performance on the Gold interface.\n• Entry Price: $${activeTrade?.entryPrice.toFixed(2)}`;
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

// B3 unified analyst
async function evaluateAIBrain(briefData: any): Promise<{ action: "BUY" | "SELL" | "HOLD"; veto: boolean; reason: string; source: "groq" | "gemini" | "local" }> {
  const prompt = `You are a senior quantitative executive trading gold (XAU/USD). Perform sentiment and order block structure checks on the following market metrics:
  ${JSON.stringify(briefData)}
  
  Provide an elegant buy/sell/hold tactical action. The decision must be logical, risk-clamped, and explain indicators. Return response EXACTLY in this JSON format:
  {
    "action": "BUY" | "SELL" | "HOLD",
    "veto": boolean (true if risk structure is too messy or trade should be blocked),
    "reason": "Short 1-2 sentence pro review"
  }`;

  // 1. Try Groq first if enabled
  if (isGroqEnabled && groq) {
    try {
      const chatCompletion = await groq.chat.completions.create({
        messages: [{ role: "user", content: prompt }],
        model: "llama-3.3-70b-versatile",
        temperature: 0,
        max_tokens: 300,
        response_format: { type: "json_object" }
      });

      const text = chatCompletion.choices[0]?.message?.content || "{}";
      const parsed = JSON.parse(text);
      return {
        action: (parsed.action === "BUY" || parsed.action === "SELL") ? parsed.action : "HOLD",
        veto: !!parsed.veto,
        reason: parsed.reason ? `Groq Llama: ${parsed.reason}` : "Undergoing Groq analysis.",
        source: "groq"
      };
    } catch (err) {
      console.warn("Groq B3 query failed, falling back to Gemini:", err);
    }
  }

  // 2. Try Gemini
  if (isGeminiEnabled && ai) {
    try {
      const response = await ai.models.generateContent({
        model: "gemini-2.0-flash",
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
      return {
        action: (parsed.action === "BUY" || parsed.action === "SELL") ? parsed.action : "HOLD",
        veto: !!parsed.veto,
        reason: parsed.reason ? `Gemini Flash: ${parsed.reason}` : "Undergoing Gemini analysis.",
        source: "gemini"
      };
    } catch (err) {
      console.warn("Gemini B3 query failed, falling back to Local Heuristic:", err);
    }
  }

  // 3. Fallback to Local Heuristic
  const rsi = briefData.rsi || 50;
  const ema9 = briefData.ema9 || briefData.goldPrice;
  const ema21 = briefData.ema21 || briefData.goldPrice;
  
  let reason = "Local Engine: Volume is flat. Wait for liquidity breakout.";
  let action: "BUY" | "SELL" | "HOLD" = "HOLD";
  if (rsi > 60 && ema9 > ema21) {
    reason = "Local Engine: Strong momentum detected above 9-period EMA.";
    action = "BUY";
  } else if (rsi < 40 && ema9 < ema21) {
    reason = "Local Engine: Bearish distribution below 21-period EMA.";
    action = "SELL";
  }
  return { action, veto: false, reason: `Local Reserve: ${reason}`, source: "local" };
}

function calculateTickVelocity(): number {
  const history = state.tickHistory;
  if (history.length < 2) return 0;
  const now = Date.now();
  const oneMinuteAgo = now - 60000;
  const relevantTicks = history.filter(t => t.time >= oneMinuteAgo);
  if (relevantTicks.length < 2) return 0;
  return relevantTicks[relevantTicks.length - 1].price - relevantTicks[0].price;
}

function calculateMACDValue(closes: number[]): number {
  if (closes.length < 26) return 0;
  const k12 = 2 / (12 + 1);
  const k26 = 2 / (26 + 1);
  let ema12 = closes[0];
  let ema26 = closes[0];
  for (let i = 1; i < closes.length; i++) {
    ema12 = closes[i] * k12 + ema12 * (1 - k12);
    ema26 = closes[i] * k26 + ema26 * (1 - k26);
  }
  return ema12 - ema26;
}

function calculateBrain1Probability(candles: Candlestick[]): number {
  if (candles.length < 30) return 0.5;
  const lastCandle = candles[candles.length - 1];
  const rsi = lastCandle.rsi || 50;
  const close = lastCandle.close;
  const ema20 = lastCandle.ema20 || close;
  const ema50 = lastCandle.ema50 || close;
  const atr = lastCandle.atr || 1.5;
  const atr_safe = Math.max(atr, 0.01);
  
  const closes = candles.map(c => c.close);
  const macdVal = calculateMACDValue(closes);
  
  const ema20Diff = (close - ema20) / atr_safe;
  const ema50Diff = (close - ema50) / atr_safe;
  
  let score = 0.5;
  const isBullish = close > ema20 && ema20 > ema50 && rsi > 52 && macdVal > 0;
  const isBearish = close < ema20 && ema20 < ema50 && rsi < 48 && macdVal < 0;
  
  if (isBullish) {
    score = 0.55 + 
            (rsi - 52) * 0.006 + 
            Math.min(0.2, ema20Diff * 0.05) + 
            Math.min(0.1, (macdVal / atr_safe) * 0.04);
  } else if (isBearish) {
    const bearishImpact = 0.05 + 
                          (48 - rsi) * 0.006 + 
                          Math.min(0.2, -ema20Diff * 0.05) + 
                          Math.min(0.1, (-macdVal / atr_safe) * 0.04);
    score = 0.45 - bearishImpact;
  }
  return parseFloat(Math.min(0.98, Math.max(0.02, score)).toFixed(3));
}

async function evaluateBrains(currentPrice: number): Promise<BrainDecision> {
  const candles = state.candles;
  const lastCandle = candles[candles.length - 1] || { rsi: 50, atr: 1.5, adx: 20 };
  const rsi = lastCandle.rsi || 50;
  const atr = lastCandle.atr || 1.5;
  const adx = lastCandle.adx || 20;

  const b0_velocity = calculateTickVelocity();
  const b1_xgboost = calculateBrain1Probability(candles);
  const b2 = calculateBrain2Score(candles, currentPrice);
  const smartMoney = detectSmartMoneyStatus(candles, currentPrice);

  const briefData = {
    goldPrice: currentPrice,
    rsi: parseFloat(rsi.toFixed(1)),
    atr: parseFloat(atr.toFixed(2)),
    adx: parseFloat(adx.toFixed(1)),
    ema9: lastCandle.ema9 ? parseFloat(lastCandle.ema9.toFixed(2)) : currentPrice,
    ema21: lastCandle.ema21 ? parseFloat(lastCandle.ema21.toFixed(2)) : currentPrice,
    ema20: lastCandle.ema20 ? parseFloat(lastCandle.ema20.toFixed(2)) : currentPrice,
    ema50: lastCandle.ema50 ? parseFloat(lastCandle.ema50.toFixed(2)) : currentPrice,
    b1_forecast: b1_xgboost,
    b2_confluence: b2.score,
    b2_direction: b2.direction,
    smartMoney: {
      orderBlockFound: smartMoney.orderBlock.found,
      orderBlockDirection: smartMoney.orderBlock.direction,
      fvgFound: smartMoney.fvg.found,
      fvgDirection: smartMoney.fvg.direction,
      liquiditySweep: smartMoney.liquiditySweep.detected,
      mss: smartMoney.mss.detected
    }
  };

  const b3 = await evaluateAIBrain(briefData);

  const isSimulation = state.simulationMode !== "LIVE" && state.simulationMode !== "TWELVE_DATA";
  let newsStatus;
  if (isSimulation) {
    const simNews = getSimulatedNewsLockoutStatus();
    newsStatus = {
      blocked: simNews.blocked,
      reduction: simNews.reduction,
      upcoming: simNews.upcoming,
      reason: simNews.blocked ? "Simulated high-impact news event active." : "Clear calendar"
    };
  } else {
    newsStatus = getNewsLockoutStatus();
  }

  return {
    b0_velocity,
    b1_xgboost,
    b2_confluence: b2.score,
    b2_direction: b2.direction,
    b2_reasons: b2.reasons,
    b3_gemini: { action: b3.action, veto: b3.veto, reason: b3.reason },
    b3_source: b3.source,
    b4_news_lockout: newsStatus.blocked,
    b4_upcoming_news: newsStatus.upcoming || "",
    b4_news_reduction: newsStatus.reduction,
    smartMoney,
    adx,
    atr,
    rsi
  };
}

// Brain 2 Confluence scoring rules
function calculateBrain2Score(candles: Candlestick[], currentPrice: number): {
  score: number;
  direction: "BUY" | "SELL" | "NEUTRAL";
  reasons: string[];
  veto: string | null;
} {
  if (candles.length < 30) {
    return { score: 0, direction: "NEUTRAL", reasons: ["Wait for more data"], veto: null };
  }

  const lastCandle = candles[candles.length - 1];
  const rsi = lastCandle.rsi || 50;
  const ema20 = lastCandle.ema20 || lastCandle.close;
  const ema50 = lastCandle.ema50 || lastCandle.close;
  const atr = lastCandle.atr || 1.5;
  const atr_safe = Math.max(atr, 0.01);
  const adx = lastCandle.adx || 20;

  let score = 0;
  const reasons: string[] = [];
  let buy_signals = 0;
  let sell_signals = 0;

  // 1. RSI (graduated, max 2.0 pts)
  if (rsi >= 60 && rsi <= 78) {
    const rsi_score = parseFloat((2.0 * Math.min(1.0, (rsi - 60) / 18.0)).toFixed(2));
    score += rsi_score;
    reasons.push(`RSI Buy Momentum (${rsi.toFixed(1)}, +${rsi_score}pts)`);
    buy_signals++;
  } else if (rsi <= 40 && rsi >= 22) {
    const rsi_score = parseFloat((2.0 * Math.min(1.0, (40 - rsi) / 18.0)).toFixed(2));
    score += rsi_score;
    reasons.push(`RSI Sell Momentum (${rsi.toFixed(1)}, +${rsi_score}pts)`);
    sell_signals++;
  }

  // 2. EMA Confluence (3.0 pts)
  const bullish_stack = lastCandle.close > ema20 && ema20 > ema50;
  const bearish_stack = lastCandle.close < ema20 && ema20 < ema50;
  if (bullish_stack) {
    score += 3.0;
    reasons.push("Bullish EMA Stack (+3.0)");
    buy_signals++;
  } else if (bearish_stack) {
    score += 3.0;
    reasons.push("Bearish EMA Stack (+3.0)");
    sell_signals++;
  }

  // 3. ATR Volatility (2.0 pts)
  const signed_body = lastCandle.close - lastCandle.open;
  if (Math.abs(signed_body) > atr_safe * 1.2) {
    score += 2.0;
    if (signed_body > 0) {
      reasons.push("Bullish Volatility Expansion (+2.0)");
      buy_signals++;
    } else {
      reasons.push("Bearish Volatility Expansion (+2.0)");
      sell_signals++;
    }
  }

  // 4. Support/Resistance breakout (3.0 pts)
  const lookbackSlice = candles.slice(-21, -1);
  const recentHighs = lookbackSlice.map(c => c.high);
  const recentLows = lookbackSlice.map(c => c.low);
  const recent_high = Math.max(...recentHighs);
  const recent_low = Math.min(...recentLows);
  if (lastCandle.close > recent_high) {
    score += 3.0;
    reasons.push("Local High Breakout (+3.0)");
    buy_signals++;
  } else if (lastCandle.close < recent_low) {
    score += 3.0;
    reasons.push("Local Low Breakout (+3.0)");
    sell_signals++;
  }

  // 5. Bollinger Band Breakout (1.0 pt)
  const bbMiddle = lastCandle.bollingerMiddle || lastCandle.close;
  const bbUpper = lastCandle.bollingerUpper || (bbMiddle + 4);
  const bbLower = lastCandle.bollingerLower || (bbMiddle - 4);
  if (lastCandle.close > bbUpper) {
    score += 1.0;
    reasons.push("BB Upper Breakout (+1.0)");
    buy_signals++;
  } else if (lastCandle.close < bbLower) {
    score += 1.0;
    reasons.push("BB Lower Breakdown (+1.0)");
    sell_signals++;
  }

  // Determine direction
  let direction: "BUY" | "SELL" | "NEUTRAL" = "NEUTRAL";
  if (buy_signals > sell_signals) {
    direction = "BUY";
  } else if (sell_signals > buy_signals) {
    direction = "SELL";
  } else if (buy_signals > 0 && bullish_stack) {
    direction = "BUY";
    reasons.push("Tie broken by bullish EMA stack");
  } else if (sell_signals > 0 && bearish_stack) {
    direction = "SELL";
    reasons.push("Tie broken by bearish EMA stack");
  }

  // H4 Trend alignment penalty (-2.0 if opposes)
  if (direction !== "NEUTRAL" && state.h4Candles && state.h4Candles.length >= 10) {
    const h4 = state.h4Candles[state.h4Candles.length - 1];
    const h4_ema20 = h4.ema20 || h4.close;
    const h4_ema50 = h4.ema50 || h4.close;
    const h4_bullish = h4_ema20 > h4_ema50;
    if (direction === "BUY" && !h4_bullish) {
      score = Math.max(0.0, score - 2.0);
      reasons.push("⚠️ H4 bearish opposes BUY (-2.0)");
    } else if (direction === "SELL" && h4_bullish) {
      score = Math.max(0.0, score - 2.0);
      reasons.push("⚠️ H4 bullish opposes SELL (-2.0)");
    }
  }

  // VETO Filters
  let veto: string | null = null;
  const body = Math.abs(lastCandle.close - lastCandle.open);
  if (body > 0) {
    const upper_wick = lastCandle.high - Math.max(lastCandle.open, lastCandle.close);
    const lower_wick = Math.min(lastCandle.open, lastCandle.close) - lastCandle.low;

    if (direction === "BUY" && upper_wick > 1.5 * body) {
      veto = `Bearish wick rejection (wick=${upper_wick.toFixed(2)} > 1.5x body=${body.toFixed(2)})`;
    } else if (direction === "SELL" && lower_wick > 1.5 * body) {
      veto = `Bullish wick rejection (wick=${lower_wick.toFixed(2)} > 1.5x body=${body.toFixed(2)})`;
    }
  }

  // RSI Divergence Veto
  if (!veto && candles.length >= 8) {
    const prev5Rsi = candles[candles.length - 6].rsi || 50;
    const last8Closes = candles.slice(-8, -1).map(c => c.close);
    if (direction === "BUY") {
      const price_new_high = lastCandle.close > Math.max(...last8Closes);
      const rsi_declining = rsi < prev5Rsi - 3.0;
      if (price_new_high && rsi_declining) {
        veto = `Bearish RSI divergence (price new high but RSI ${rsi.toFixed(1)} < ${prev5Rsi.toFixed(1)})`;
      }
    } else if (direction === "SELL") {
      const price_new_low = lastCandle.close < Math.min(...last8Closes);
      const rsi_rising = rsi > prev5Rsi + 3.0;
      if (price_new_low && rsi_rising) {
        veto = `Bullish RSI divergence (price new low but RSI ${rsi.toFixed(1)} > ${prev5Rsi.toFixed(1)})`;
      }
    }
  }

  // False breakout zone veto
  if (!veto && candles.length >= 8) {
    const tol = Math.max(0.25 * atr, 0.10);
    const last7Candles = candles.slice(-8, -1);
    if (direction === "BUY") {
      for (const c of last7Candles) {
        if (c.high >= lastCandle.close - tol && c.close < lastCandle.close - tol) {
          veto = `False breakout zone: high ${c.high.toFixed(2)} failed to hold`;
          break;
        }
      }
    } else if (direction === "SELL") {
      for (const c of last7Candles) {
        if (c.low <= lastCandle.close + tol && c.close > lastCandle.close + tol) {
          veto = `False breakdown zone: low ${c.low.toFixed(2)} failed to hold`;
          break;
        }
      }
    }
  }

  // Durability bonuses
  let durabilityBonus = 0;
  if (direction !== "NEUTRAL") {
    // 1. ADX trend strength
    if (adx > 35) {
      durabilityBonus += 1.5;
      reasons.push(`Strong Trend ADX=${adx.toFixed(1)} (+1.5)`);
    } else if (adx > 25) {
      durabilityBonus += 0.75;
      reasons.push(`Trending ADX=${adx.toFixed(1)} (+0.75)`);
    }

    // 2. EMA slope
    if (candles.length >= 25) {
      const prevEma20 = candles[candles.length - 4].ema20 || candles[candles.length - 4].close;
      const slope = (ema20 - prevEma20) / atr_safe;
      if (direction === "BUY" && slope > 0.1) {
        durabilityBonus += 0.75;
        reasons.push(`Rising EMA20 slope (+${slope.toFixed(2)} ATR/3bars, +0.75)`);
      } else if (direction === "SELL" && slope < -0.1) {
        durabilityBonus += 0.75;
        reasons.push(`Falling EMA20 slope (${slope.toFixed(2)} ATR/3bars, +0.75)`);
      }
    }

    // 3. Consecutive momentum candles
    const last5 = candles.slice(-5);
    let count = 0;
    for (const c of last5) {
      const b = c.close - c.open;
      if (direction === "BUY" && b > 0.5 * atr) count++;
      if (direction === "SELL" && b < -0.5 * atr) count++;
    }
    if (count >= 3) {
      durabilityBonus += 0.75;
      reasons.push(`${count} consecutive momentum candles (+0.75)`);
    } else if (count >= 2) {
      durabilityBonus += 0.25;
      reasons.push(`${count} momentum candles (+0.25)`);
    }
  }
  score += Math.min(durabilityBonus, 3.0);

  // Pattern bonuses
  let patternBonus = 0;
  if (direction !== "NEUTRAL" && candles.length >= 5) {
    const c_now = candles[candles.length - 1];
    const c_prev = candles[candles.length - 2];
    const now_b = c_now.close - c_now.open;
    const prev_b = c_prev.close - c_prev.open;

    // Engulfing
    if (direction === "BUY" && now_b > 0 && prev_b < 0) {
      if (c_now.open <= c_prev.close && c_now.close >= c_prev.open && Math.abs(now_b) > Math.abs(prev_b) * 0.8) {
        patternBonus += 1.5;
        reasons.push("🕯️ Bullish Engulfing pattern (+1.5)");
      }
    } else if (direction === "SELL" && now_b < 0 && prev_b > 0) {
      if (c_now.open >= c_prev.close && c_now.close <= c_prev.open && Math.abs(now_b) > Math.abs(prev_b) * 0.8) {
        patternBonus += 1.5;
        reasons.push("🕯️ Bearish Engulfing pattern (+1.5)");
      }
    }

    // Pin bar
    const now_b_abs = Math.abs(now_b);
    if (now_b_abs > 0) {
      const upper_wick = c_now.high - Math.max(c_now.open, c_now.close);
      const lower_wick = Math.min(c_now.open, c_now.close) - c_now.low;
      if (direction === "BUY" && lower_wick > 2.0 * now_b_abs) {
        patternBonus += 1.0;
        reasons.push(`📌 Bullish Pin Bar (wick ${lower_wick.toFixed(2)} > 2x body, +1.0)`);
      } else if (direction === "SELL" && upper_wick > 2.0 * now_b_abs) {
        patternBonus += 1.0;
        reasons.push(`📌 Bearish Pin Bar (wick ${upper_wick.toFixed(2)} > 2x body, +1.0)`);
      }
    }

    // Inside bar breakout
    const c_2ago = candles[candles.length - 3];
    if (c_prev.high <= c_2ago.high && c_prev.low >= c_2ago.low) {
      if (direction === "BUY" && c_now.close > c_2ago.high) {
        patternBonus += 1.0;
        reasons.push("📊 Inside Bar Breakout (bullish, +1.0)");
      } else if (direction === "SELL" && c_now.close < c_2ago.low) {
        patternBonus += 1.0;
        reasons.push("📊 Inside Bar Breakout (bearish, +1.0)");
      }
    }

    // Three white soldiers / three black crows
    const last3 = candles.slice(-3);
    if (direction === "BUY") {
      const soldiers = last3.every(c => c.close > c.open && (c.close - c.open) > 0.3 * atr_safe);
      if (soldiers) {
        patternBonus += 0.5;
        reasons.push("⚔️ Three White Soldiers (+0.5)");
      }
    } else if (direction === "SELL") {
      const crows = last3.every(c => c.open > c.close && (c.open - c.close) > 0.3 * atr_safe);
      if (crows) {
        patternBonus += 0.5;
        reasons.push("⚔️ Three Black Crows (+0.5)");
      }
    }
  }
  score += Math.min(patternBonus, 3.0);

  const final_score = parseFloat(Math.min(score, 10.0).toFixed(2));

  return { score: final_score, direction, reasons, veto };
}

// Smart Money Concept detection engines
function detectSmartMoneyStatus(candles: Candlestick[], currentPrice: number): SmartMoneyStatus {
  const obLookback = 20;
  let orderBlock = {
    found: false,
    direction: null as "BUY" | "SELL" | null,
    obHigh: 0,
    obLow: 0,
    priceInOB: false,
    boost: 1.0
  };

  const lastCandle = candles[candles.length - 1];
  const atr = lastCandle?.atr || 1.5;
  const atr_safe = Math.max(atr, 0.01);

  // Search backwards for Order Blocks
  for (let i = candles.length - 2; i > Math.max(candles.length - obLookback - 2, 0); i--) {
    const candle = candles[i];
    const body = candle.close - candle.open;
    const isBearish = body < 0;
    const isBullish = body > 0;

    let moveAfter = 0.0;
    for (let j = i + 1; j < Math.min(i + 4, candles.length); j++) {
      moveAfter = candles[j].close - candle.close;
      if (Math.abs(moveAfter) > atr_safe) {
        break;
      }
    }

    if (isBearish && moveAfter > atr_safe) {
      const obHigh = candle.high;
      const obLow = candle.low;
      const priceInOB = currentPrice >= obLow && currentPrice <= obHigh;
      orderBlock = {
        found: true,
        direction: "BUY",
        obHigh: parseFloat(obHigh.toFixed(2)),
        obLow: parseFloat(obLow.toFixed(2)),
        priceInOB,
        boost: priceInOB ? 1.25 : 1.0
      };
      break;
    } else if (isBullish && moveAfter < -atr_safe) {
      const obHigh = candle.high;
      const obLow = candle.low;
      const priceInOB = currentPrice >= obLow && currentPrice <= obHigh;
      orderBlock = {
        found: true,
        direction: "SELL",
        obHigh: parseFloat(obHigh.toFixed(2)),
        obLow: parseFloat(obLow.toFixed(2)),
        priceInOB,
        boost: priceInOB ? 1.25 : 1.0
      };
      break;
    }
  }

  // FVG detection
  let fvg = {
    found: false,
    direction: null as "BUY" | "SELL" | null,
    gapSize: 0
  };
  if (candles.length >= 3) {
    const c1 = candles[candles.length - 3];
    const c3 = candles[candles.length - 1];
    if (c1.high < c3.low) {
      fvg = { found: true, direction: "BUY", gapSize: parseFloat((c3.low - c1.high).toFixed(2)) };
    } else if (c1.low > c3.high) {
      fvg = { found: true, direction: "SELL", gapSize: parseFloat((c1.low - c3.high).toFixed(2)) };
    }
  }

  // Liquidity Sweep detection
  let liquiditySweep = {
    detected: false,
    direction: null as "BUY" | "SELL" | null,
    level: 0
  };
  if (candles.length >= 25) {
    const current = candles[candles.length - 1];
    const lookback = candles.slice(-25, -1);
    const highs = lookback.map(c => c.high);
    const lows = lookback.map(c => c.low);
    const rangeHigh = Math.max(...highs);
    const rangeLow = Math.min(...lows);

    if (current.low < rangeLow && current.close > rangeLow) {
      liquiditySweep = { detected: true, direction: "BUY", level: parseFloat(rangeLow.toFixed(2)) };
    } else if (current.high > rangeHigh && current.close < rangeHigh) {
      liquiditySweep = { detected: true, direction: "SELL", level: parseFloat(rangeHigh.toFixed(2)) };
    }
  }

  // Market Structure Shift (MSS) detection
  let mss = {
    detected: false,
    direction: null as "BUY" | "SELL" | null,
    brokenLevel: 0
  };
  if (candles.length >= 15) {
    const lb = 3;
    const swingHighs: { level: number, idx: number }[] = [];
    const swingLows: { level: number, idx: number }[] = [];
    for (let i = lb; i < candles.length - lb; i++) {
      const high_i = candles[i].high;
      const low_i = candles[i].low;
      let isSwingHigh = true;
      let isSwingLow = true;
      for (let j = 1; j <= lb; j++) {
        if (candles[i - j].high >= high_i || candles[i + j].high >= high_i) isSwingHigh = false;
        if (candles[i - j].low <= low_i || candles[i + j].low <= low_i) isSwingLow = false;
      }
      if (isSwingHigh) swingHighs.push({ level: high_i, idx: i });
      if (isSwingLow) swingLows.push({ level: low_i, idx: i });
    }

    const currentClose = candles[candles.length - 1].close;
    const totalBars = candles.length;
    const mssFreshness = 12;

    if (swingHighs.length > 0) {
      const lastSH = swingHighs[swingHighs.length - 1];
      const candlesSince = totalBars - 1 - lastSH.idx;
      if (currentClose > lastSH.level && candlesSince <= mssFreshness) {
        mss = { detected: true, direction: "BUY", brokenLevel: parseFloat(lastSH.level.toFixed(2)) };
      }
    }
    if (!mss.detected && swingLows.length > 0) {
      const lastSL = swingLows[swingLows.length - 1];
      const candlesSince = totalBars - 1 - lastSL.idx;
      if (currentClose < lastSL.level && candlesSince <= mssFreshness) {
        mss = { detected: true, direction: "SELL", brokenLevel: parseFloat(lastSL.level.toFixed(2)) };
      }
    }
  }

  return { orderBlock, fvg, liquiditySweep, mss };
}

// DECISION SIGNAL FUSION ENGINE - CHECK 10 GOLD GATES
async function processSignalFusion() {
  const candles = state.candles;
  if (candles.length < 5) return;

  const currentPrice = state.goldPrice;
  const brains = await evaluateBrains(currentPrice);
  const lastCandle = candles[candles.length - 1];
  const atr = lastCandle.atr || 1.5;

  const gates: GateStatus[] = [];

  // Determine intended direction to verify gates against
  let intendedDirection: "BUY" | "SELL" | "NONE" = "NONE";
  const xgboostThreshold = state.params.b1Threshold;
  const xgboostSellLimit = 1 - xgboostThreshold;

  const isBuySignal = brains.b1_xgboost >= xgboostThreshold && 
                      brains.b2_confluence >= state.params.b2Floor && 
                      brains.b2_direction === "BUY";
  const isSellSignal = brains.b1_xgboost <= xgboostSellLimit && 
                       brains.b2_confluence >= state.params.b2Floor && 
                       brains.b2_direction === "SELL";

  if (isBuySignal) {
    intendedDirection = "BUY";
  } else if (isSellSignal) {
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
      : `No clear directional alignment. XGBoost forecast was ${brains.b1_xgboost.toFixed(2)} (requires >=${xgboostThreshold} for BUY or <=${xgboostSellLimit.toFixed(2)} for SELL) and Confluence direction is ${brains.b2_direction} (${brains.b2_confluence}/10, requires >=${state.params.b2Floor}).`
  });

  // Gate 2: Flip-flop Direction Recency Guard
  let g2_passed = true;
  let g2_detail = "Clear of sudden directional change locks.";
  if (g1_passed && state.tradesLog.length > 0) {
    const lastTrade = state.tradesLog[0];
    const candlesSinceLastTrade = Math.floor((Date.now() - lastTrade.exitTime) / 30000);
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
  let h4_trend_bias: "BULLISH" | "BEARISH" = "BULLISH";
  if (state.h4Candles && state.h4Candles.length > 0) {
    const lastH4 = state.h4Candles[state.h4Candles.length - 1];
    const h4_ema20 = lastH4.ema20 || lastH4.close;
    const h4_ema50 = lastH4.ema50 || lastH4.close;
    h4_trend_bias = h4_ema20 > h4_ema50 ? "BULLISH" : "BEARISH";
  } else {
    const smoothPeriod = 30;
    const recentCandlesSlice = candles.slice(-smoothPeriod);
    const avgSmooth = recentCandlesSlice.reduce((s, c) => s + c.close, 0) / recentCandlesSlice.length;
    h4_trend_bias = currentPrice > avgSmooth ? "BULLISH" : "BEARISH";
  }

  if (state.simulationMode === "TREND_UP") {
    h4_trend_bias = "BULLISH";
  } else if (state.simulationMode === "TREND_DOWN") {
    h4_trend_bias = "BEARISH";
  }

  let g4_passed = true;
  if (intendedDirection === "BUY" && h4_trend_bias !== "BULLISH") g4_passed = false;
  if (intendedDirection === "SELL" && h4_trend_bias !== "BEARISH") g4_passed = false;

  gates.push({
    id: "g4",
    name: "H4 Framework Trend Lock",
    passed: g4_passed,
    detail: g4_passed
      ? `Aligned with H4 trend bias (${h4_trend_bias})!`
      : `Blocked! Attempting ${intendedDirection} against H4 trend bias: ${h4_trend_bias}.`
  });

  // Gate 5: Core Session Clock Restrictions
  const simHour = new Date().getUTCHours();
  const isAsia = simHour >= 22 || simHour < 7;
  const g5_passed = !state.params.isSessionLockoutEnabled || !isAsia;
  gates.push({
    id: "g5",
    name: "Active Session High-Liquidity Timer",
    passed: g5_passed,
    detail: g5_passed
      ? (isAsia ? `London / New York clock restrictions by-passed (Session lock is disabled). Current hour: ${simHour}:00 UTC.` : "London / New York high liquidity session active.")
      : `Blocked! Trading paused during low-liquidity Tokyo/Sydney Hours (Hour: ${simHour} UTC) to avoid wide spread risks.`
  });

  // Gate 6: Daily/Weekly Risk Limits Lockout check & Circuit Breaker
  const dailyLocked = state.analytics.dailyLocked;
  const weeklyLocked = state.analytics.weeklyLocked;
  const maxTradesReached = state.analytics.tradesThisDay >= state.analytics.maxDailyTrades;

  let g6_passed = !dailyLocked && !weeklyLocked && !maxTradesReached;
  let g6_detail = "Risk limits healthy. Circuit breakers inactive.";
  if (dailyLocked) {
    g6_detail = `BLOCKED! Daily Loss Lockout active. Daily P&L ($${state.analytics.dailyPnL.toFixed(2)}) hit circuit breaker.`;
  } else if (weeklyLocked) {
    g6_detail = `BLOCKED! Weekly Loss Lockout active. Weekly P&L ($${state.analytics.weeklyPnL.toFixed(2)}) hit circuit breaker.`;
  } else if (maxTradesReached) {
    g6_detail = `BLOCKED! Max daily trades limit (${state.analytics.maxDailyTrades}) reached for today.`;
  }
  gates.push({ id: "g6", name: "Cumulative Loss-Gate Protector", passed: g6_passed, detail: g6_detail });

  // Gate 7: Chop Market & RSI Exhaustion Filter
  const bbUpper = lastCandle.bollingerUpper || currentPrice + 4;
  const bbLower = lastCandle.bollingerLower || currentPrice - 4;
  const bbSqueezeRatio = (bbUpper - bbLower) / currentPrice;
  const isChopMarket = bbSqueezeRatio < 0.0018 || (lastCandle.rsi! >= 47 && lastCandle.rsi! <= 53);

  let rsiExhausted = false;
  let rsiDetail = "";
  if (intendedDirection === "BUY" && lastCandle.rsi! > 70) {
    rsiExhausted = true;
    rsiDetail = `RSI is Overbought (${lastCandle.rsi!.toFixed(1)} > 70). Long entry blocked.`;
  } else if (intendedDirection === "SELL" && lastCandle.rsi! < 30) {
    rsiExhausted = true;
    rsiDetail = `RSI is Oversold (${lastCandle.rsi!.toFixed(1)} < 30). Short entry blocked.`;
  }

  const g7_passed = !isChopMarket && !rsiExhausted;
  gates.push({
    id: "g7",
    name: "Chop, Sideways & RSI Exhaustion Filter",
    passed: g7_passed,
    detail: !g7_passed
      ? (rsiExhausted ? `Blocked! ${rsiDetail}` : `Blocked! Chop filter triggered. XAU/USD in sideways squeeze (ratio: ${(bbSqueezeRatio * 100).toFixed(3)}%).`)
      : `Chop filter passed (ratio: ${(bbSqueezeRatio * 100).toFixed(3)}%). RSI is healthy (${lastCandle.rsi!.toFixed(1)}).`
  });

  // Gate 8: EMA20 Price Over-Extension Guard
  const distanceToEMA20 = Math.abs(currentPrice - (lastCandle.ema20 || lastCandle.close));
  const maxAllowedExtension = (process.env.MAX_EXTENSION_ATR ? parseFloat(process.env.MAX_EXTENSION_ATR) : 2.5) * atr;
  const isOverExtended = distanceToEMA20 > maxAllowedExtension;
  const g8_passed = !isOverExtended;
  gates.push({
    id: "g8",
    name: "EMA20 Price Over-Extension Guard",
    passed: g8_passed,
    detail: g8_passed
      ? `Price correlation to EMA20 is healthy (Distance: $${distanceToEMA20.toFixed(2)} vs Max Limit: $${maxAllowedExtension.toFixed(2)}).`
      : `Blocked! Price is over-extended from M5 EMA20 (Distance: $${distanceToEMA20.toFixed(2)} > Max allowed: $${maxAllowedExtension.toFixed(2)}).`
  });

  // Gate 9: Momentum & Entry Quality Structure Gate
  const adx = lastCandle.adx || 20;
  const velocityScore = Math.abs(brains.b0_velocity);
  const momentumPassed = adx >= state.params.adxTrendThreshold || velocityScore > state.params.tickVelocityThreshold;

  const requireStructure = process.env.REQUIRE_STRUCTURE !== "0";
  const obAligned = brains.smartMoney.orderBlock.found && brains.smartMoney.orderBlock.direction === intendedDirection;
  const fvgAligned = brains.smartMoney.fvg.found && brains.smartMoney.fvg.direction === intendedDirection;
  const sweepAligned = brains.smartMoney.liquiditySweep.detected && brains.smartMoney.liquiditySweep.direction === intendedDirection;
  const premiumB2 = brains.b2_confluence >= 8.5;

  const qualityPassed = !requireStructure || (obAligned || fvgAligned || sweepAligned || premiumB2);

  const g9_passed = momentumPassed && qualityPassed;
  let gate9Detail = "";
  if (!momentumPassed) {
    gate9Detail = `Blocked! Low trend momentum. ADX: ${adx.toFixed(1)} (requires >=${state.params.adxTrendThreshold} or velocity).`;
  } else if (!qualityPassed) {
    gate9Detail = `Blocked! Entry quality failure. No order block, FVG, or Liquidity sweep aligned, and B2 score (${brains.b2_confluence}/10) below premium threshold (8.5/10).`;
  } else {
    gate9Detail = `Momentum verified! Quality confirmed via ${premiumB2 ? "premium technical confluence" : "Smart Money Concept alignment (OB/FVG/Sweep)"}.`;
  }
  gates.push({ id: "g9", name: "Momentum & Market Structure Quality Gateway", passed: g9_passed, detail: gate9Detail });

  // Gate 10: Dynamic Brain Veto & Sizing Regulator
  const g10_passed = !brains.b3_gemini.veto && !brains.b4_news_lockout;
  let sizingFactor = 1.0;
  let sizeDetail = "";

  if (brains.b4_news_lockout) sizeDetail += "Locked out by economic news calendar buffers. ";
  if (brains.b3_gemini.veto) sizeDetail += "AI Analyst Veto active: " + brains.b3_gemini.reason + ". ";

  sizingFactor *= brains.b4_news_reduction;

  let perfMult = 1.0;
  if (state.analytics.consecutiveLosses >= 3) {
    perfMult = 0.5;
  } else if (state.analytics.winRate < 50 && state.analytics.totalTrades >= 5) {
    perfMult = 0.65;
  } else if (state.analytics.winRate >= 60 && state.analytics.totalTrades >= 5) {
    perfMult = 1.25;
  }
  sizingFactor *= perfMult;

  let convictionMult = 1.0;
  if (brains.b2_confluence >= 8.0 && adx > 30) {
    convictionMult = 1.5;
  } else if (brains.b2_confluence < 7.0) {
    convictionMult = 0.5;
  }
  sizingFactor *= convictionMult;

  let isReentry = false;
  if (state.tradesLog.length > 0) {
    const lastTrade = state.tradesLog[0];
    const isWithinReentryWindow = (Date.now() - lastTrade.exitTime) <= 15 * 60 * 1000;
    if (lastTrade.exitReason === "SL" && lastTrade.type === intendedDirection && isWithinReentryWindow) {
      isReentry = true;
      sizingFactor *= 0.5;
    }
  }

  if (obAligned && brains.smartMoney.orderBlock.priceInOB) {
    sizingFactor *= 1.25;
  }

  gates.push({
    id: "g10",
    name: "Dynamic Brain Veto & Sizing Regulator",
    passed: g10_passed,
    detail: g10_passed
      ? `AI & News clear. Performance Mult: ${perfMult.toFixed(2)}x, Conviction: ${convictionMult.toFixed(2)}x, OB Boost: ${obAligned ? "1.25x" : "1.0x"}. Lot multiplier: ${sizingFactor.toFixed(2)}x. Analyst: "${brains.b3_gemini.reason}"`
      : `Blocked! ${sizeDetail}`
  });

  const allPassed = gates.every(g => g.passed);
  const finalDecision = allPassed ? intendedDirection : "NO_SIGNAL";

  state.lastSignalCheck = {
    time: Date.now(),
    decision: finalDecision as any,
    gates,
    brains,
    notes: allPassed 
      ? `ALGO FUSION SUCCESS: Fired automated high-precision market entry order.`
      : `Gate [${gates.find(g => !g.passed)?.name}] rejected trade execution.`
  };

  if (allPassed && intendedDirection !== "NONE") {
    executeTrade(intendedDirection, currentPrice, atr, sizingFactor);
  }
  checkTimelineTelegramNotifications();
}

// EXECUTE TRADE ORDER
function executeTrade(type: "BUY" | "SELL", price: number, atr: number, sizeMultiplier: number) {
  const atrVal = atr || 1.8;
  const slOffset = atrVal * 1.5;
  const tpOffset = atrVal * 3.0;

  const slPrice = type === "BUY" ? price - slOffset : price + slOffset;
  const tpPrice = type === "BUY" ? price + tpOffset : price - tpOffset;

  const envRiskPerTrade = process.env.RISK_PER_TRADE ? parseFloat(process.env.RISK_PER_TRADE) : 50;
  
  const stopDistancePoints = slOffset;
  let baseQtyLots = envRiskPerTrade / (stopDistancePoints * 100.0);
  baseQtyLots = baseQtyLots * sizeMultiplier;
  
  baseQtyLots = Math.max(0.001, Math.min(5.0, baseQtyLots));

  const trade: ActiveTrade = {
    id: `trade_${Date.now()}`,
    type,
    entryPrice: price,
    qty: parseFloat(baseQtyLots.toFixed(3)),
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
    lowestPriceSeen: price,
    adaptiveMultiplier: parseFloat(sizeMultiplier.toFixed(2)),
    lotSize: parseFloat(baseQtyLots.toFixed(3))
  };

  state.activeTrade = trade;
  logBotEvent("TRADE", `🚀 EXECUTED AUTONOMOUS ${type} ORDER: Size: ${trade.qty} lots @ $${price.toFixed(2)}. SL: $${trade.sl.toFixed(2)}, TP: $${trade.tp.toFixed(2)}.`);
  
  const alertStr = `🔔 *Autonomous Gold Bot Entry* 🔔\n\n*Type:* ${type}\n*Entry Price:* $${price.toFixed(2)}\n*Size:* ${trade.qty} Lots\n*Stop Loss:* $${trade.sl.toFixed(2)} (1.5x ATR)\n*Take Profit:* $${trade.tp.toFixed(2)} (3.0x ATR)\n*Confluence Score:* ${state.lastSignalCheck?.brains.b2_confluence}/10\n\n_All 10 decision fusion gate checks passed!_`;
  sendTelegramAlert(alertStr);
  
  saveState();
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

  state.tickHistory.push({ time: now, price: currentPrice });
  if (state.tickHistory.length > 100) state.tickHistory.shift();

  if (state.activeTrade) {
    const trade = state.activeTrade;

    const pointsMove = currentPrice - trade.entryPrice;
    const plMultiplier = 100.0 * trade.qty;
    trade.unrealizedPl = trade.type === "BUY" ? pointsMove * plMultiplier : -pointsMove * plMultiplier;

    if (currentPrice > trade.highestPriceSeen) trade.highestPriceSeen = currentPrice;
    if (currentPrice < trade.lowestPriceSeen) trade.lowestPriceSeen = currentPrice;

    const lastCandle = state.candles[state.candles.length - 1] || { atr: 1.5 };
    const atr = lastCandle.atr || 1.5;

    const isSlHit = trade.type === "BUY" ? currentPrice <= trade.sl : currentPrice >= trade.sl;
    if (isSlHit) {
      exitOpenPosition("Stop Loss (SL) triggered", trade.sl);
      return;
    }

    const isTpHit = trade.type === "BUY" ? currentPrice >= trade.tp : currentPrice <= trade.tp;
    if (isTpHit) {
      exitOpenPosition("Take Profit (TP) reached", trade.tp);
      return;
    }

    const partialCloseRatio = state.params.partialCloseAtrRatio || 1.5;
    const partialClosePointsOffset = atr * partialCloseRatio;
    const pointsInProfit = trade.type === "BUY" ? (currentPrice - trade.entryPrice) : (trade.entryPrice - currentPrice);

    if (pointsInProfit >= partialClosePointsOffset && !trade.isPartialClosed) {
      trade.isPartialClosed = true;

      const originalQty = trade.qty;
      const partialPnLDollars = partialClosePointsOffset * 100.0 * originalQty * 0.5;
      state.balance += partialPnLDollars;

      trade.qty = parseFloat(Math.max(0.001, originalQty / 2.0).toFixed(3));

      trade.sl = trade.entryPrice;
      trade.stopMovedToBE = true;

      logBotEvent("TRADE", `🎯 PARTIAL TARGET REACHED (+${partialClosePointsOffset.toFixed(2)} pts). Secured 50% ($${partialPnLDollars.toFixed(2)}) and secured Breakeven Stop on runners.`);
      sendTelegramAlert(`🎯 *Partial Close Target Banked!*\n\n*Secured:* $${partialPnLDollars.toFixed(2)} Profit\n*Status:* Moved remaining Stop Loss to Break Even (${trade.entryPrice.toFixed(2)}) to remove all risk!`);
    }

    if (trade.stopMovedToBE && pointsInProfit > atr * 1.5) {
      const trailMult = state.params.trailingStopMultiplier || 1.8;
      const newSl = trade.type === "BUY"
        ? parseFloat((trade.highestPriceSeen - atr * trailMult).toFixed(2))
        : parseFloat((trade.lowestPriceSeen + atr * trailMult).toFixed(2));

      if (trade.type === "BUY" && newSl > trade.sl) {
        trade.sl = newSl;
        trade.trailingStopPrice = newSl;
      } else if (trade.type === "SELL" && newSl < trade.sl) {
        trade.sl = newSl;
        trade.trailingStopPrice = newSl;
      }
    }

    const elapsedMinutes = (Date.now() - trade.entryTime) / 60000;
    const isStale = state.simulationSpeed === "ULTRA"
       ? elapsedMinutes > 2.0
       : state.simulationSpeed === "FAST"
       ? elapsedMinutes > 10.0
       : elapsedMinutes > 120.0;

    if (isStale) {
      exitOpenPosition("Time Exit (Stale position clean-up)", currentPrice);
    }
  }

  if (state.activeTrade) {
    state.equity = state.balance + state.activeTrade.unrealizedPl;
  } else {
    state.equity = state.balance;
  }
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
    b2Score: state.lastSignalCheck?.brains.b2_confluence || 0,
    smcTags: [
      state.lastSignalCheck?.brains.smartMoney.orderBlock.found ? "OB" : "",
      state.lastSignalCheck?.brains.smartMoney.fvg.found ? "FVG" : "",
      state.lastSignalCheck?.brains.smartMoney.liquiditySweep.detected ? "Sweep" : ""
    ].filter(Boolean)
  };

  state.tradesLog.unshift(completed);
  if (state.tradesLog.length > 50) state.tradesLog.pop();

  state.activeTrade = null;

  logBotEvent("TRADE", `❌ CLOSED POSITION: ${reason} @ $${exitPrice.toFixed(2)}. Net profit: ${finalProfit >= 0 ? "+" : ""}$${finalProfit.toFixed(2)} USD.`);
  sendTelegramAlert(`🚨 *Gold Position Closed* 🚨\n\n*Type:* ${trade.type}\n*Reason:* ${reason}\n*Exit Price:* $${exitPrice.toFixed(2)}\n*Net Profit:* ${finalProfit >= 0 ? "+" : ""}$${finalProfit.toFixed(2)} USD`);

  recalculateAnalytics();
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

  processSignalFusion();
  saveState();
}

// DATA FEED - TICK SIMULATION MACHINE
let tickTimer: NodeJS.Timeout | null = null;
let ticksCountdown = 25;

function stopTickSimulation() {
  if (tickTimer) clearInterval(tickTimer);
}

function startTickSimulation() {
  stopTickSimulation();

  let tickIntervalMs = 1200;
  if (state.simulationSpeed === "ULTRA") tickIntervalMs = 150;
  else if (state.simulationSpeed === "REALTIME") tickIntervalMs = 2500;

  tickTimer = setInterval(() => {
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
        delta = (Math.random() - 0.35) * 1.5;
      } else if (mode === "TREND_DOWN") {
        delta = (Math.random() - 0.65) * 1.5;
      } else if (mode === "CHOP") {
        delta = (Math.random() - 0.5) * 0.35;
      } else if (mode === "NEWS_SPIKE") {
        delta = (Math.random() - 0.5) * 5.5;
      }
    }

    state.goldPrice = parseFloat((state.goldPrice + delta).toFixed(2));
    handleMarketTick();
    handleNewsCheck();

    ticksCountdown--;
    if (ticksCountdown <= 0) {
      closeCandleAndTriggerFusion();
      if (state.simulationSpeed === "ULTRA") ticksCountdown = 15;
      else if (state.simulationSpeed === "FAST") ticksCountdown = 25;
      else ticksCountdown = 60;
    }

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
    hasTwelveDataKey: isTwelveDataEnabled,
    hasGroqKey: isGroqEnabled
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
    time: Date.now() + 5000,
    title: req.body.title || "USD FOMC Rate Press Conference",
    impact: (req.body.impact || "HIGH") as any,
    triggered: false
  };
  state.newsEvents.unshift(upcoming);
  logBotEvent("RISK", `Added manual scheduled news flash: ${upcoming.title} (${upcoming.impact} impact)`);
  res.json({ success: true, event: upcoming });
});

app.post("/api/reset", (req, res) => {
  state.balance = 2000;
  state.startBalance = 2000;
  state.dailyStartingBalance = 2000;
  state.weeklyStartingBalance = 2000;
  state.equity = 2000;
  state.activeTrade = null;
  state.tradesLog = [];
  state.auditLogs = [{ time: Date.now(), type: "SYSTEM", message: "Bot data log wiped. Account balance reset to $2000.00." }];
  state.lastSignalCheck = null;
  state.lastGeminiCoaching = "Awaiting candle close metrics to analyze XAU/USD gold structure and optimize trade entry sizes.";
  lastCachedGeminiDecision = null;
  generateInitialCandles();
  saveState();
  res.json({ success: true });
});

// Asking Gemini/Groq for custom coaching advice based on current data
app.post("/api/mentor", async (req, res) => {
  const recentTrades = state.tradesLog.slice(0, 5);
  const textPrompt = `You are a certified professional futures trading coach. Write a customized, elite, and ultra-short 3-sentence trading tip for our user. Mention current Gold value ($${state.goldPrice}), recent win status from these trades: ${JSON.stringify(recentTrades)}, and outline how to master the 10-gate signal checklist. Be highly specific, motivating, and focus on volatility-based risks.`;

  // 1. Try Groq first if enabled
  if (isGroqEnabled && groq) {
    try {
      const chatCompletion = await groq.chat.completions.create({
        messages: [{ role: "user", content: textPrompt }],
        model: "llama-3.3-70b-versatile",
        temperature: 0.7,
        max_tokens: 150
      });
      const text = chatCompletion.choices[0]?.message?.content || "";
      if (text) {
        return res.json({ coaching: text });
      }
    } catch (err) {
      console.warn("Groq Mentor query failed:", err);
    }
  }

  // 2. Try Gemini
  if (isGeminiEnabled && ai) {
    try {
      const response = await ai.models.generateContent({
        model: "gemini-2.0-flash",
        contents: textPrompt
      });
      if (response.text) {
        return res.json({ coaching: response.text });
      }
    } catch (err: any) {
      console.warn("Gemini Mentor API error:", err);
      let errorStr = String(err).toLowerCase();
      if (errorStr.includes("429") || errorStr.includes("quota") || errorStr.includes("exhausted") || errorStr.includes("limit")) {
        return res.json({
          coaching: "💡 API Quota Warning: The daily free-tier Gemini API quota (limit 20 requests/day) has been temporarily reached. The Gold Bot remains fully operational using high-fidelity local quant heuristics! Adjust your 10-gate technical requirements to maximize your edge."
        });
      }
    }
  }

  // 3. Fallback advice
  res.json({
    coaching: "Mentor Insight: Avoid trading news blocks. The ATR stop-loss helps filter dynamic slippages. Sticking to high-momentum London sessions keeps your risk-reward above 2:1 cleanly."
  });
});

// Start express dev / production middleware setup
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
