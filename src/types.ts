export interface BotParams {
  riskPercent: number;
  b1Threshold: number;
  b2Floor: number;
  trailingStopMultiplier: number;
  partialCloseAtrRatio: number;
  lockoutMaxDailyLossPercent: number;
  lockoutMaxWeeklyLossPercent: number;
  newsLockoutWindowMinutes: number;
  adxTrendThreshold: number;
  tickVelocityThreshold: number;
  telegramBotToken: string;
  telegramChatId: string;
  isTelegramEnabled: boolean;
  isSessionLockoutEnabled: boolean;
}

export interface Candlestick {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  ema9?: number;
  ema21?: number;
  rsi?: number;
  bollingerUpper?: number;
  bollingerMiddle?: number;
  bollingerLower?: number;
  atr?: number;
  adx?: number;
}

export interface ActiveTrade {
  id: string;
  type: "BUY" | "SELL";
  entryPrice: number;
  qty: number;
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

export interface CompletedTrade {
  id: string;
  type: "BUY" | "SELL";
  entryPrice: number;
  exitPrice: number;
  qty: number;
  entryTime: number;
  exitTime: number;
  profit: number;
  exitReason: string;
  isPartialClosed: boolean;
  highestPriceSeen?: number;
  lowestPriceSeen?: number;
}

export interface BrainDecision {
  b0_velocity: number;
  b1_xgboost: number;
  b2_confluence: number;
  b3_gemini: { action: "BUY" | "SELL" | "HOLD"; veto: boolean; reason: string };
  b4_news_lockout: boolean;
  b4_upcoming_news: string;
}

export interface GateStatus {
  id: string;
  name: string;
  passed: boolean;
  detail: string;
}

export interface NewsEvent {
  id: string;
  time: number;
  title: string;
  impact: "HIGH" | "MEDIUM";
  triggered: boolean;
}

export interface AuditLog {
  time: number;
  type: "SYSTEM" | "TRADE" | "BRAIN" | "RISK";
  message: string;
}

export interface BotState {
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
  newsEvents: NewsEvent[];
  auditLogs: AuditLog[];
  unrealizedPnL: number;
  hasGeminiKey: boolean;
  hasTwelveDataKey: boolean;
  lastGeminiCoaching: string;
}
