export interface MT5Account {
  login: string;
  server: string;
  balance: number;
  name: string;
  connected: boolean;
}

export interface PricePoint {
  time: number;
  price: number;
  open: number;
  high: number;
  low: number;
  close: number;
  sma5?: number;
  sma20?: number;
  rsi?: number;
}

export interface Position {
  id: string;
  symbol: string;
  side: 'BUY' | 'SELL';
  entryPrice: number;
  volume: number;
  sl: number;
  tp: number;
  openTime: number;
  currentPrice: number;
  profit: number;
}

export interface TradeHistory {
  id: string;
  symbol: string;
  side: 'BUY' | 'SELL';
  entryPrice: number;
  exitPrice: number;
  volume: number;
  profit: number;
  openTime: number;
  closeTime: number;
  reason: 'TP' | 'SL' | 'MANUAL';
}

export interface BotLog {
  id: string;
  timestamp: number;
  message: string;
  type: 'info' | 'success' | 'warning' | 'error';
}
