/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef, useMemo } from 'react';
import { 
  TrendingUp, 
  TrendingDown, 
  Activity, 
  History, 
  LayoutDashboard, 
  Settings, 
  Play, 
  Square, 
  AlertCircle,
  CheckCircle2,
  Info,
  ChevronRight,
  Wallet,
  Volume2,
  VolumeX,
  Monitor,
  Download,
  Minus,
  Maximize2,
  X,
  Lock,
  User,
  Eye,
  EyeOff,
  ArrowRight,
  RefreshCw
} from 'lucide-react';
import { 
  ComposedChart,
  Bar,
  Cell,
  LineChart, 
  Line, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer,
  ReferenceLine,
  AreaChart,
  Area
} from 'recharts';
import { format } from 'date-fns';
import { cn } from './lib/utils';
import axios from 'axios';
import { Position, TradeHistory, PricePoint, BotLog, MT5Account } from './types';
import { motion, AnimatePresence } from 'motion/react';

// Constants from Python script
const SYMBOLS = ["XAUUSD", "BTCUSD"] as const;
type SymbolType = typeof SYMBOLS[number];

const VOLUME: Record<SymbolType, number> = {
  "XAUUSD": 0.01,
  "BTCUSD": 0.001
};

const ATR_TP = 2.5;
const ATR_SL = 1.5;
const INITIAL_BALANCE = 10000;

// Mock Data Generator
const generateInitialData = (symbol: SymbolType, count: number): PricePoint[] => {
  const basePrice = symbol === "XAUUSD" ? 4678.0 : 66976;
  const volatility = symbol === "XAUUSD" ? 2 : 100;
  const data: PricePoint[] = [];
  let currentPrice = basePrice;
  const now = Date.now();

  for (let i = count; i >= 0; i--) {
    const open = currentPrice;
    const change = (Math.random() - 0.5) * volatility;
    const close = open + change;
    const high = Math.max(open, close) + Math.random() * (volatility / 2);
    const low = Math.min(open, close) - Math.random() * (volatility / 2);
    
    currentPrice = close;
    
    data.push({
      time: now - i * 60000, // 1 minute intervals
      price: close,
      open,
      high,
      low,
      close,
    });
  }
  return data;
};

// Helper to generate unique IDs
const generateId = () => {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
};

const Candlestick = (props: any) => {
  const { x, y, width, height, payload } = props;
  if (!payload) return null;
  
  const { open, close, high, low } = payload;
  const isBullish = close >= open;
  const color = isBullish ? '#22c55e' : '#ef4444';

  const bodyHeight = Math.abs(height);
  const priceDiff = Math.abs(close - open) || 0.0001;
  const pixelPerPrice = bodyHeight / priceDiff;

  const wickTop = y - (high - Math.max(open, close)) * pixelPerPrice;
  const wickBottom = y + bodyHeight + (Math.min(open, close) - low) * pixelPerPrice;

  return (
    <g>
      <line
        x1={x + width / 2}
        y1={wickTop}
        x2={x + width / 2}
        y2={wickBottom}
        stroke={color}
        strokeWidth={1}
      />
      <rect
        x={x}
        y={y}
        width={width}
        height={Math.max(bodyHeight, 1)}
        fill={color}
        fillOpacity={0.8}
      />
    </g>
  );
};

const TitleBar = () => (
  <div className="h-8 bg-[#0a0a0c] border-b border-white/5 flex items-center justify-between px-3 select-none drag-region">
    <div className="flex items-center gap-2">
      <Activity className="w-3.5 h-3.5 text-blue-500" />
      <span className="text-[9px] font-black text-gray-400 uppercase tracking-widest">MT5 AutoTrader</span>
      <div className="flex items-center gap-1.5 ml-2 px-2 py-0.5 bg-blue-500/10 rounded-full border border-blue-500/20">
        <div className="w-1 h-1 rounded-full bg-blue-500 animate-pulse" />
        <span className="text-[7px] text-blue-500 font-black uppercase">Web v2.5.0</span>
      </div>
    </div>
    <div className="flex items-center gap-6">
      <div className="flex items-center gap-1.5">
        <div className="w-1.5 h-1.5 rounded-full bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.5)]" />
        <span className="text-[8px] text-green-500 font-black uppercase tracking-tighter">Live Connection</span>
      </div>
      <div className="flex items-center gap-1 no-drag">
        <button className="w-6 h-6 flex items-center justify-center hover:bg-white/5 rounded transition-colors">
          <Minus className="w-3 h-3 text-gray-600" />
        </button>
        <button className="w-6 h-6 flex items-center justify-center hover:bg-white/5 rounded transition-colors">
          <Maximize2 className="w-3 h-3 text-gray-600" />
        </button>
        <button className="w-6 h-6 flex items-center justify-center hover:bg-red-500 rounded transition-colors group">
          <X className="w-3 h-3 text-gray-600 group-hover:text-white" />
        </button>
      </div>
    </div>
  </div>
);

export default function App() {
  const [mt5Account, setMt5Account] = useState<MT5Account | null>(null);
  const [isConnecting, setIsConnecting] = useState(false);
  const [loginForm, setLoginForm] = useState({ login: '', password: '', server: 'MetaQuotes-Demo' });

  const [isRunning, setIsRunning] = useState(true);
  const [balance, setBalance] = useState(INITIAL_BALANCE);
  const [equity, setEquity] = useState(INITIAL_BALANCE);
  const [activeSymbol, setActiveSymbol] = useState<SymbolType>("XAUUSD");
  
  const [marketData, setMarketData] = useState<Record<SymbolType, PricePoint[]>>({
    "XAUUSD": generateInitialData("XAUUSD", 100),
    "BTCUSD": generateInitialData("BTCUSD", 100),
  });

  const [positions, setPositions] = useState<Position[]>([]);
  const [history, setHistory] = useState<TradeHistory[]>([]);
  const [logs, setLogs] = useState<BotLog[]>([]);
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [showInstallGuide, setShowInstallGuide] = useState(false);
  const [isStandalone, setIsStandalone] = useState(false);
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [adminLoginForm, setAdminLoginForm] = useState({ username: '', password: '' });
  const [showPassword, setShowPassword] = useState(false);
  const [loginError, setLoginError] = useState('');

  const handleAdminLogin = (e: React.FormEvent) => {
    e.preventDefault();
    if (adminLoginForm.username === 'admin' && adminLoginForm.password === 'Adminquanth2000@') {
      setIsLoggedIn(true);
      setLoginError('');
    } else {
      setLoginError('Invalid username or password');
    }
  };

  useEffect(() => {
    const handleBeforeInstallPrompt = (e: any) => {
      e.preventDefault();
      setDeferredPrompt(e);
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);

    const checkStandalone = () => {
      const isStandaloneMode = window.matchMedia('(display-mode: standalone)').matches || (window.navigator as any).standalone === true;
      setIsStandalone(isStandaloneMode);
    };
    checkStandalone();
    window.matchMedia('(display-mode: standalone)').addEventListener('change', checkStandalone);

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    };
  }, []);

  const handleInstallClick = async () => {
    if (deferredPrompt) {
      deferredPrompt.prompt();
      const { outcome } = await deferredPrompt.userChoice;
      if (outcome === 'accepted') {
        setDeferredPrompt(null);
      }
    } else {
      setShowInstallGuide(true);
    }
  };

  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const positionsRef = useRef<Position[]>([]);

  // Sync positions ref
  useEffect(() => {
    positionsRef.current = positions;
  }, [positions]);

  // Keyboard Shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.key === ' ') {
        setIsRunning(prev => !prev);
        addLog(`Bot ${!isRunning ? 'Started' : 'Stopped'} via shortcut`, 'info');
      }
      if (e.key === '1') setActiveSymbol("XAUUSD");
      if (e.key === '2') setActiveSymbol("BTCUSD");
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isRunning]);

  // Sound Alert Helper
  const playAlert = (type: 'success' | 'warning') => {
    if (!soundEnabled) return;
    if (!audioContextRef.current) {
      audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
    }
    const ctx = audioContextRef.current;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    
    osc.type = 'sine';
    osc.frequency.setValueAtTime(type === 'success' ? 880 : 440, ctx.currentTime);
    gain.gain.setValueAtTime(0.1, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.2);
    
    osc.connect(gain);
    gain.connect(ctx.destination);
    
    osc.start();
    osc.stop(ctx.currentTime + 0.2);
  };

  // Add log helper
  const addLog = (message: string, type: BotLog['type'] = 'info') => {
    setLogs(prev => [{
      id: generateId(),
      timestamp: Date.now(),
      message,
      type
    }, ...prev].slice(0, 50));
  };

  // Calculate Indicators (SMA, RSI, ATR)
  const calculateIndicators = (data: PricePoint[]) => {
    if (data.length < 20) return data;

    return data.map((point, i) => {
      const newPoint = { ...point };
      // SMA 5
      if (i >= 4) {
        const slice = data.slice(i - 4, i + 1);
        newPoint.sma5 = slice.reduce((acc, p) => acc + p.price, 0) / 5;
      }
      // SMA 20
      if (i >= 19) {
        const slice = data.slice(i - 19, i + 1);
        newPoint.sma20 = slice.reduce((acc, p) => acc + p.price, 0) / 20;
      }
      // RSI 14 (Simplified)
      if (i >= 14) {
        let gains = 0;
        let losses = 0;
        for (let j = i - 13; j <= i; j++) {
          const diff = data[j].price - data[j - 1].price;
          if (diff >= 0) gains += diff;
          else losses -= diff;
        }
        const rs = gains / (losses || 1);
        newPoint.rsi = 100 - (100 / (1 + rs));
      }
      return newPoint;
    });
  };

  // Simulation Loop (Market Data)
  useEffect(() => {
    if (!isRunning) return;

    timerRef.current = setInterval(async () => {
      let realPrices: Record<string, number> | null = null;
      
      // If connected, try to fetch real prices from the bridge
      if (mt5Account?.connected) {
        try {
          const response = await axios.get('/api/market/prices');
          realPrices = response.data;
        } catch (error) {
          console.error("Failed to fetch real market prices");
        }
      }

      setMarketData(prev => {
        const next = { ...prev };
        SYMBOLS.forEach(symbol => {
          const lastData = prev[symbol];
          const lastPoint = lastData[lastData.length - 1];
          const lastPrice = lastPoint.close;
          
          const volatility = symbol === "XAUUSD" ? 1.5 : 50;
          const open = lastPrice;
          const newPrice = realPrices && realPrices[symbol] 
            ? realPrices[symbol] 
            : lastPrice + (Math.random() - 0.5) * volatility;
          
          const close = newPrice;
          const high = Math.max(open, close) + Math.random() * (volatility / 4);
          const low = Math.min(open, close) - Math.random() * (volatility / 4);

          const newPoint: PricePoint = {
            time: Date.now(),
            price: close,
            open,
            high,
            low,
            close,
          };

          const updatedList = [...lastData.slice(-150), newPoint];
          next[symbol] = calculateIndicators(updatedList);
        });
        return next;
      });
    }, 2000);

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [isRunning, mt5Account?.connected]);

  // Trading Logic (Signal Detection & Position Management)
  useEffect(() => {
    if (!isRunning) return;

    SYMBOLS.forEach(symbol => {
      const data = marketData[symbol];
      if (!data || data.length < 2) return;
      
      const last = data[data.length - 1];
      const prev = data[data.length - 2];

      if (!last || !prev || !last.sma5 || !last.sma20 || !last.rsi) return;

      // Check if already has position using Ref to avoid loop
      const activePos = positionsRef.current.find(p => p.symbol === symbol);
      
      if (activePos) {
        // 1. Update current price and profit
        const profit = activePos.side === 'BUY' 
          ? (last.price - activePos.entryPrice) * activePos.volume * (symbol === 'BTCUSD' ? 1 : 100)
          : (activePos.entryPrice - last.price) * activePos.volume * (symbol === 'BTCUSD' ? 1 : 100);
        
        // 2. Check TP/SL
        let shouldClose = false;
        let reason: TradeHistory['reason'] = 'TP';

        if (activePos.side === 'BUY') {
          if (last.price >= activePos.tp) { shouldClose = true; reason = 'TP'; }
          else if (last.price <= activePos.sl) { shouldClose = true; reason = 'SL'; }
        } else {
          if (last.price <= activePos.tp) { shouldClose = true; reason = 'TP'; }
          else if (last.price >= activePos.sl) { shouldClose = true; reason = 'SL'; }
        }

        if (shouldClose) {
          closePosition(activePos, last.price, reason);
        } else {
          // Only update if price changed significantly to reduce renders
          setPositions(prevPos => prevPos.map(p => 
            p.id === activePos.id ? { ...p, currentPrice: last.price, profit } : p
          ));
        }
      } else {
        // 3. Signal Logic
        const atr = Math.abs(last.price - prev.price) * 10 || (symbol === 'XAUUSD' ? 2 : 100);
        
        if (last.sma5 > last.sma20 && last.rsi < 65) {
          openPosition(symbol, 'BUY', last.price, atr);
        } else if (last.sma5 < last.sma20 && last.rsi > 35) {
          openPosition(symbol, 'SELL', last.price, atr);
        }
      }
    });
  }, [marketData, isRunning]);

  // Update Equity
  useEffect(() => {
    const unrealizedPnL = positions.reduce((acc, p) => acc + p.profit, 0);
    setEquity(balance + unrealizedPnL);
  }, [balance, positions]);

  const openPosition = (symbol: SymbolType, side: 'BUY' | 'SELL', price: number, atr: number) => {
    const sl = side === 'BUY' ? price - atr * ATR_SL : price + atr * ATR_SL;
    const tp = side === 'BUY' ? price + atr * ATR_TP : price - atr * ATR_TP;

    const newPos: Position = {
      id: generateId(),
      symbol,
      side,
      entryPrice: price,
      volume: VOLUME[symbol],
      sl,
      tp,
      openTime: Date.now(),
      currentPrice: price,
      profit: 0
    };

    // GỬI LỆNH THẬT LÊN SERVER (BACKEND -> MT5 TERMINAL)
    axios.post('/api/mt5/trade', { ...newPos, login: mt5Account?.login })
      .then(() => addLog(`Order executed on MT5 Terminal for ${symbol}`, 'success'))
      .catch(() => addLog(`Failed to execute order on MT5`, 'error'));

    setPositions(prev => [...prev, newPos]);
    addLog(`Opened ${side} position on ${symbol} at ${price.toFixed(2)}`, 'success');
    playAlert('success');
  };

  const closePosition = (pos: Position, exitPrice: number, reason: TradeHistory['reason']) => {
    const profit = pos.side === 'BUY' 
      ? (exitPrice - pos.entryPrice) * pos.volume * (pos.symbol === 'BTCUSD' ? 1 : 100)
      : (pos.entryPrice - exitPrice) * pos.volume * (pos.symbol === 'BTCUSD' ? 1 : 100);

    const trade: TradeHistory = {
      ...pos,
      exitPrice,
      profit,
      closeTime: Date.now(),
      reason
    };

    // GỬI LỆNH ĐÓNG LÊN SERVER
    axios.post('/api/mt5/close-position', { id: pos.id, profit, login: mt5Account?.login })
      .then(() => addLog(`Position closed on MT5 Terminal`, 'success'))
      .catch(() => addLog(`Failed to close position on MT5`, 'error'));

    setHistory(prev => [trade, ...prev]);
    setPositions(prev => prev.filter(p => p.id !== pos.id));
    setBalance(prev => prev + profit);
    addLog(`Closed ${pos.symbol} ${pos.side} at ${exitPrice.toFixed(2)} (${reason}) | Profit: $${profit.toFixed(2)}`, profit >= 0 ? 'success' : 'warning');
    playAlert(profit >= 0 ? 'success' : 'warning');
  };

  const currentPrice = marketData[activeSymbol][marketData[activeSymbol].length - 1].price;
  const priceChange = currentPrice - marketData[activeSymbol][0].price;
  const priceChangePct = (priceChange / marketData[activeSymbol][0].price) * 100;

  const [connectionStep, setConnectionStep] = useState('');

  // Periodic Balance Syncing
  useEffect(() => {
    if (!mt5Account || !mt5Account.connected) return;

    const syncInterval = setInterval(async () => {
      try {
        const response = await axios.get('/api/mt5/account');
        if (response.data.success) {
          setBalance(response.data.data.balance);
          setEquity(response.data.data.equity);
        }

        const posRes = await axios.get('/api/mt5/positions');
        if (posRes.data.success) {
          // Map backend positions to frontend format
          const mappedPositions = posRes.data.data.map((p: any) => ({
            id: p.id,
            symbol: p.symbol,
            side: p.side,
            entryPrice: p.entry,
            volume: p.volume,
            sl: p.sl,
            tp: p.tp,
            openTime: p.timestamp,
            currentPrice: p.current,
            profit: p.profit
          }));
          setPositions(mappedPositions);
        }
      } catch (error) {
        console.error("Failed to sync with server");
      }
    }, 5000); // Sync every 5 seconds

    return () => clearInterval(syncInterval);
  }, [mt5Account]);

  const [bridgeStatus, setBridgeStatus] = useState<'offline' | 'online' | 'connecting'>('offline');

  const [isDesktopMode, setIsDesktopMode] = useState(false);

  // TỰ ĐỘNG KÍCH HOẠT CHẾ ĐỘ DESKTOP NẾU CHẠY TRÊN MÁY TÍNH
  useEffect(() => {
    if (window.navigator.userAgent.includes('Electron') || isStandalone) {
      setIsDesktopMode(true);
      addLog("INTEGRATED BRIDGE ACTIVATED: Searching for MT5 Terminal...", "info");
    }
  }, [isStandalone]);

  const checkBridge = async () => {
    try {
      const res = await axios.get('/api/mt5/account');
      if (res.data.success) {
        setBridgeStatus('online');
        if (!mt5Account) {
          const data = res.data.data;
          setMt5Account({ ...data, connected: true });
          setBalance(data.balance);
          setEquity(data.balance);
          addLog(`DIRECT LINK ESTABLISHED: MT5 Account ${data.login}`, 'success');
          playAlert('success');
        }
      }
    } catch (e) {
      setBridgeStatus('offline');
      // NẾU LÀ CHẾ ĐỘ DESKTOP, THỬ TỰ ĐỘNG KẾT NỐI LẠI
      if (isDesktopMode) {
        axios.post('/api/mt5/link', { auto: true }).catch(() => {});
      }
    }
  };

  useEffect(() => {
    checkBridge();
    const interval = setInterval(checkBridge, 2000);
    return () => clearInterval(interval);
  }, [mt5Account, isDesktopMode]);

  const handleConnect = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!loginForm.login || !loginForm.password) return;
    
    setIsConnecting(true);
    setConnectionStep("Connecting to Exness Gateway...");
    
    try {
      // GỌI API THẬT ĐẾN BACKEND BRIDGE
      const response = await axios.post('/api/mt5/link', loginForm);
      const data = response.data.data;

      setMt5Account({ ...data, connected: true });
      setBalance(data.balance);
      setEquity(data.balance);
      
      addLog(`MT5 TERMINAL CONNECTED: ${data.login} | Balance: $${data.balance}`, 'success');
      playAlert('success');
    } catch (error: any) {
      const errorMsg = error.response?.data?.message || "Backend could not reach MT5 Terminal";
      addLog(`Connection Failed: ${errorMsg}`, 'error');
      alert(`FAILED TO CONNECT:\n1. Ensure MT5 Terminal is open.\n2. Ensure "Algo Trading" is enabled in MT5.\n3. Check if your Bridge Script is running.\n\nError: ${errorMsg}`);
    } finally {
      setIsConnecting(false);
    }
  };

  if (!isLoggedIn) {
    return (
      <div className="min-h-screen bg-[#0a0a0c] text-white font-sans flex flex-col items-center justify-center p-6">
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="max-w-md w-full space-y-8 bg-[#121214] p-10 rounded-[32px] border border-white/5 shadow-2xl"
        >
          <div className="w-20 h-20 bg-blue-600 rounded-3xl flex items-center justify-center mx-auto shadow-2xl shadow-blue-600/20">
            <Lock className="w-10 h-10 text-white" />
          </div>
          
          <div className="text-center space-y-2">
            <h1 className="text-3xl font-black tracking-tighter">Admin Login</h1>
            <p className="text-gray-500 text-sm">Please enter your credentials to access the dashboard</p>
          </div>

          <form onSubmit={handleAdminLogin} className="space-y-6">
            <div className="space-y-4">
              <div className="space-y-2">
                <label className="text-xs font-bold text-gray-500 uppercase tracking-widest ml-1">Username</label>
                <div className="relative">
                  <User className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-600" />
                  <input 
                    type="text"
                    value={adminLoginForm.username}
                    onChange={(e) => setAdminLoginForm({...adminLoginForm, username: e.target.value})}
                    className="w-full bg-white/5 border border-white/10 rounded-2xl py-4 pl-12 pr-4 text-sm focus:outline-none focus:border-blue-500/50 transition-colors"
                    placeholder="Enter username"
                    required
                  />
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-xs font-bold text-gray-500 uppercase tracking-widest ml-1">Password</label>
                <div className="relative">
                  <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-600" />
                  <input 
                    type={showPassword ? "text" : "password"}
                    value={adminLoginForm.password}
                    onChange={(e) => setAdminLoginForm({...adminLoginForm, password: e.target.value})}
                    className="w-full bg-white/5 border border-white/10 rounded-2xl py-4 pl-12 pr-12 text-sm focus:outline-none focus:border-blue-500/50 transition-colors"
                    placeholder="Enter password"
                    required
                  />
                  <button 
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-600 hover:text-gray-400 transition-colors"
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>
            </div>

            {loginError && (
              <p className="text-red-500 text-xs font-bold text-center animate-shake">{loginError}</p>
            )}

            <button 
              type="submit"
              className="w-full bg-blue-600 hover:bg-blue-500 text-white font-bold py-4 rounded-2xl transition-all shadow-xl shadow-blue-600/20 flex items-center justify-center gap-2"
            >
              Access Dashboard
              <ArrowRight className="w-4 h-4" />
            </button>
          </form>

          <p className="text-[10px] text-gray-600 text-center uppercase tracking-widest font-bold">Secure Access Protocol v2.5.0</p>
        </motion.div>
      </div>
    );
  }

  if (!mt5Account) {
    return (
      <div className="min-h-screen bg-[#0a0a0c] flex items-center justify-center p-4 font-sans">
        <motion.div 
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          className="w-full max-w-md bg-[#121214] rounded-[32px] border border-white/5 p-10 shadow-2xl text-center"
        >
          <div className="w-20 h-20 bg-blue-600 rounded-3xl flex items-center justify-center mx-auto mb-6 shadow-2xl shadow-blue-600/20">
            <Activity className="w-10 h-10 text-white" />
          </div>
          
          <h1 className="text-3xl font-black text-white tracking-tighter mb-2">MT5 AutoTrader</h1>
          <p className="text-gray-500 text-sm mb-8">
            {isDesktopMode 
              ? "Scanning for local MT5 Terminal... (No setup required)" 
              : "Waiting for connection from your local MT5 Terminal..."}
          </p>

          <div className="space-y-6">
            <div className="flex flex-col items-center gap-3 p-6 bg-white/5 rounded-3xl border border-white/10">
              <div className={cn(
                "w-3 h-3 rounded-full animate-pulse",
                bridgeStatus === 'online' ? "bg-green-500 shadow-[0_0_12px_rgba(34,197,94,0.6)]" : "bg-red-500 shadow-[0_0_12px_rgba(239,68,68,0.6)]"
              )} />
              <span className="text-xs font-black text-gray-400 uppercase tracking-widest">
                {isDesktopMode ? "MT5 AUTO-SCAN: ACTIVE" : `Bridge Status: ${bridgeStatus.toUpperCase()}`}
              </span>
              {bridgeStatus === 'offline' && !isDesktopMode && (
                <p className="text-[10px] text-red-500/70 font-bold uppercase animate-bounce mt-2">Please start bridge.py on your PC</p>
              )}
              {bridgeStatus === 'offline' && isDesktopMode && (
                <p className="text-[10px] text-blue-500/70 font-bold uppercase animate-pulse mt-2">Please ensure MT5 is open</p>
              )}
            </div>

            {isDesktopMode ? (
              <div className="p-6 bg-blue-500/5 rounded-3xl border border-blue-500/10 text-center">
                <Activity className="w-8 h-8 text-blue-500 mx-auto mb-3 animate-pulse" />
                <p className="text-[11px] text-gray-400">
                  The dashboard will open <span className="text-white font-bold underline">automatically</span> as soon as your <span className="text-white font-bold">MetaTrader 5</span> is detected.
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                <div className="flex items-center gap-3 text-left p-4 bg-blue-500/5 rounded-2xl border border-blue-500/10">
                  <div className="w-8 h-8 rounded-full bg-blue-500/20 flex items-center justify-center text-blue-500 font-bold shrink-0">1</div>
                  <p className="text-[11px] text-gray-400">Open <span className="text-white font-bold">MetaTrader 5</span> on your computer.</p>
                </div>
                <div className="flex items-center gap-3 text-left p-4 bg-blue-500/5 rounded-2xl border border-blue-500/10">
                  <div className="w-8 h-8 rounded-full bg-blue-500/20 flex items-center justify-center text-blue-500 font-bold shrink-0">2</div>
                  <p className="text-[11px] text-gray-400">Run the <span className="text-white font-bold">Bridge Script</span> (bridge.py).</p>
                </div>
              </div>
            )}

            {!isDesktopMode && (
              <div className="pt-6 border-t border-white/5 space-y-3">
                <button 
                  onClick={() => {
                    setBridgeStatus('connecting');
                    checkBridge();
                  }}
                  className="w-full flex items-center justify-center gap-3 bg-blue-600 hover:bg-blue-500 text-white font-bold py-4 rounded-2xl transition-all shadow-lg shadow-blue-600/20"
                >
                  <RefreshCw className={cn("w-4 h-4", bridgeStatus === 'connecting' && "animate-spin")} />
                  Manual Connect Now
                </button>
                <a 
                  href="/bridge.py" 
                  download 
                  className="w-full flex items-center justify-center gap-3 bg-white/5 hover:bg-white/10 text-white font-bold py-4 rounded-2xl transition-all border border-white/10"
                >
                  <Download className="w-4 h-4" />
                  Download Bridge Script
                </a>
                <p className="text-[9px] text-gray-600 mt-3 uppercase font-bold tracking-tighter">The app will link automatically once connected</p>
              </div>
            )}
          </div>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0a0a0c] text-gray-200 font-sans selection:bg-blue-500/30 flex flex-col">
      <TitleBar />
      <div className="flex-1 flex overflow-hidden">
        {/* Sidebar */}
        <aside className="w-16 md:w-64 bg-[#121214] border-r border-white/5 z-50 hidden md:flex flex-col">
        <div className="p-6 flex items-center gap-3 border-b border-white/5">
          <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center">
            <Activity className="w-5 h-5 text-white" />
          </div>
          <div>
            <span className="font-bold text-lg tracking-tight hidden md:block">MT5 AutoTrader</span>
            <p className="text-[8px] text-blue-500 font-bold uppercase tracking-widest hidden md:block">Desktop Edition</p>
          </div>
        </div>

        <div className="p-4 border-b border-white/5 hidden md:block">
          <div className="flex items-center gap-3 px-2">
            <div className="w-10 h-10 rounded-full bg-white/5 flex items-center justify-center text-blue-500 font-bold border border-white/10">
              {mt5Account?.login?.slice(-2) || "??"}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-bold truncate">Acc: {mt5Account?.login || "N/A"}</p>
              <p className="text-[10px] text-gray-500 truncate uppercase tracking-tighter">{mt5Account?.server || "Unknown Server"}</p>
            </div>
          </div>
        </div>
        
        <nav className="flex-1 p-4 space-y-2">
          <button className="w-full flex items-center gap-3 px-4 py-3 rounded-xl bg-blue-600/10 text-blue-400 font-medium transition-all">
            <LayoutDashboard className="w-5 h-5" />
            <span className="hidden md:block">Dashboard</span>
          </button>
          <button className="w-full flex items-center gap-3 px-4 py-3 rounded-xl hover:bg-white/5 text-gray-400 font-medium transition-all">
            <History className="w-5 h-5" />
            <span className="hidden md:block">Trade History</span>
          </button>
          <button className="w-full flex items-center gap-3 px-4 py-3 rounded-xl hover:bg-white/5 text-gray-400 font-medium transition-all">
            <Settings className="w-5 h-5" />
            <span className="hidden md:block">Configuration</span>
          </button>
        </nav>

        <div className="p-4 border-t border-white/5">
          <div className="bg-white/5 rounded-2xl p-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs text-gray-500 font-medium uppercase tracking-wider">Bot Status</span>
              <div className={cn("w-2 h-2 rounded-full animate-pulse", isRunning ? "bg-green-500" : "bg-red-500")} />
            </div>
            <button 
              onClick={() => setIsRunning(!isRunning)}
              className={cn(
                "w-full py-2 rounded-xl flex items-center justify-center gap-2 font-semibold transition-all mb-2",
                isRunning ? "bg-red-500/10 text-red-500 hover:bg-red-500/20" : "bg-green-500/10 text-green-500 hover:bg-green-500/20"
              )}
            >
              {isRunning ? <Square className="w-4 h-4" /> : <Play className="w-4 h-4" />}
              {isRunning ? "Stop Bot" : "Start Bot"}
            </button>
            <button 
              onClick={() => setSoundEnabled(!soundEnabled)}
              className="w-full py-2 rounded-xl flex items-center justify-center gap-2 font-semibold bg-white/5 text-gray-400 hover:bg-white/10 transition-all text-xs mb-2"
            >
              {soundEnabled ? <Volume2 className="w-3 h-3" /> : <VolumeX className="w-3 h-3" />}
              {soundEnabled ? "Sound On" : "Sound Muted"}
            </button>
            {!isStandalone && (
              <button 
                onClick={handleInstallClick}
                className="w-full py-3 rounded-xl flex items-center justify-center gap-2 font-bold bg-blue-600 text-white hover:bg-blue-500 transition-all text-xs shadow-lg shadow-blue-600/20"
              >
                <Monitor className="w-4 h-4" />
                Install Desktop App
              </button>
            )}
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 overflow-y-auto p-4 md:p-8 pb-24 relative">
        <AnimatePresence>
          {showInstallGuide && (
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-[100] bg-black/80 backdrop-blur-sm flex items-center justify-center p-4"
              onClick={() => setShowInstallGuide(false)}
            >
              <motion.div 
                initial={{ scale: 0.9, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0.9, opacity: 0 }}
                className="bg-[#121214] border border-white/10 rounded-3xl p-8 max-w-md w-full shadow-2xl"
                onClick={e => e.stopPropagation()}
              >
                <div className="flex items-center justify-between mb-6">
                  <div className="flex items-center gap-3">
                    <div className="p-2 bg-blue-500/10 rounded-xl">
                      <Download className="w-6 h-6 text-blue-500" />
                    </div>
                    <h2 className="text-xl font-bold">Install Desktop App</h2>
                  </div>
                  <button onClick={() => setShowInstallGuide(false)} className="p-2 hover:bg-white/5 rounded-full transition-colors">
                    <X className="w-5 h-5 text-gray-500" />
                  </button>
                </div>
                
                <div className="space-y-6">
                  <div className="flex gap-4">
                    <div className="w-8 h-8 rounded-full bg-white/5 flex items-center justify-center text-xs font-bold shrink-0">1</div>
                    <p className="text-sm text-gray-400">Click the <span className="text-white font-bold">Install</span> icon in your browser's address bar (Chrome/Edge).</p>
                  </div>
                  <div className="flex gap-4">
                    <div className="w-8 h-8 rounded-full bg-white/5 flex items-center justify-center text-xs font-bold shrink-0">2</div>
                    <p className="text-sm text-gray-400">Select <span className="text-white font-bold">Install</span> to add MT5 AutoTrader to your desktop/dock.</p>
                  </div>
                  <div className="flex gap-4">
                    <div className="w-8 h-8 rounded-full bg-white/5 flex items-center justify-center text-xs font-bold shrink-0">3</div>
                    <p className="text-sm text-gray-400">Open it directly from your applications folder for a full-screen, native experience.</p>
                  </div>
                </div>

                <button 
                  onClick={() => setShowInstallGuide(false)}
                  className="w-full bg-blue-600 hover:bg-blue-500 text-white font-bold py-4 rounded-2xl transition-all mt-8"
                >
                  Got it!
                </button>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>
        {/* Header Stats */}
        <header className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
          <div className="bg-[#121214] p-6 rounded-3xl border border-white/5 hover:border-blue-500/30 transition-all group relative overflow-hidden">
            <div className="absolute top-0 right-0 px-2 py-0.5 bg-blue-500/10 text-blue-500 text-[8px] font-bold rounded-bl border-l border-b border-blue-500/20">
              DESKTOP
            </div>
            <div className="flex items-center gap-4 mb-4">
              <div className="p-3 bg-blue-500/10 rounded-2xl group-hover:scale-110 transition-transform">
                <Wallet className="w-6 h-6 text-blue-500" />
              </div>
              <div>
                <p className="text-sm text-gray-500 font-medium">Account Balance</p>
                <h3 className="text-2xl font-bold">${(balance || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}</h3>
              </div>
            </div>
            <div className="h-1 w-full bg-white/5 rounded-full overflow-hidden">
              <motion.div 
                className="h-full bg-blue-500"
                initial={{ width: 0 }}
                animate={{ width: '100%' }}
              />
            </div>
          </div>

          <div className="bg-[#121214] p-6 rounded-3xl border border-white/5 hover:border-purple-500/30 transition-all group">
            <div className="flex items-center gap-4 mb-4">
              <div className="p-3 bg-purple-500/10 rounded-2xl group-hover:scale-110 transition-transform">
                <Activity className="w-6 h-6 text-purple-500" />
              </div>
              <div>
                <p className="text-sm text-gray-500 font-medium">Equity</p>
                <h3 className="text-2xl font-bold">${(equity || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}</h3>
              </div>
            </div>
            <div className="flex items-center gap-2 text-xs font-medium">
              <span className={cn(equity >= balance ? "text-green-500" : "text-red-500")}>
                {equity >= balance ? "+" : ""}{(equity - balance).toFixed(2)}
              </span>
              <span className="text-gray-600">Floating P/L</span>
            </div>
          </div>

          <div className="bg-[#121214] p-6 rounded-3xl border border-white/5 hover:border-green-500/30 transition-all group">
            <div className="flex items-center gap-4 mb-4">
              <div className="p-3 bg-green-500/10 rounded-2xl group-hover:scale-110 transition-transform">
                <TrendingUp className="w-6 h-6 text-green-500" />
              </div>
              <div>
                <p className="text-sm text-gray-500 font-medium">Total Profit</p>
                <h3 className="text-2xl font-bold text-green-500">+${((balance || 0) - INITIAL_BALANCE).toLocaleString(undefined, { minimumFractionDigits: 2 })}</h3>
              </div>
            </div>
            <div className="text-xs text-gray-600 font-medium">
              {(((balance - INITIAL_BALANCE) / INITIAL_BALANCE) * 100).toFixed(2)}% ROI
            </div>
          </div>

          <div className="bg-[#121214] p-6 rounded-3xl border border-white/5 hover:border-orange-500/30 transition-all group">
            <div className="flex items-center gap-4 mb-4">
              <div className="p-3 bg-orange-500/10 rounded-2xl group-hover:scale-110 transition-transform">
                <History className="w-6 h-6 text-orange-500" />
              </div>
              <div>
                <p className="text-sm text-gray-500 font-medium">Total Trades</p>
                <h3 className="text-2xl font-bold">{history.length}</h3>
              </div>
            </div>
            <div className="text-xs text-gray-600 font-medium">
              {history.filter(h => h.profit > 0).length} Wins / {history.filter(h => h.profit <= 0).length} Losses
            </div>
          </div>
        </header>

        {/* Market Selection & Chart */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 mb-8">
          <div className="lg:col-span-2 space-y-6">
            <div className="bg-[#121214] p-6 rounded-3xl border border-white/5 relative overflow-hidden">
              <div className="flex flex-wrap items-center justify-between gap-4 mb-8">
                <div className="flex bg-white/5 p-1 rounded-2xl">
                  {SYMBOLS.map(sym => (
                    <button
                      key={sym}
                      onClick={() => setActiveSymbol(sym)}
                      className={cn(
                        "px-6 py-2 rounded-xl text-sm font-semibold transition-all",
                        activeSymbol === sym ? "bg-blue-600 text-white shadow-lg shadow-blue-600/20" : "text-gray-500 hover:text-gray-300"
                      )}
                    >
                      {sym}
                    </button>
                  ))}
                </div>
                
                <div className="flex items-center gap-6">
                  <div className="text-right">
                    <p className="text-xs text-gray-500 font-medium uppercase tracking-wider">Current Price</p>
                    <div className="flex items-center gap-2">
                      <span className="text-2xl font-bold tabular-nums">{currentPrice.toFixed(2)}</span>
                      <span className={cn(
                        "flex items-center text-xs font-bold px-2 py-0.5 rounded-full",
                        priceChange >= 0 ? "bg-green-500/10 text-green-500" : "bg-red-500/10 text-red-500"
                      )}>
                        {priceChange >= 0 ? <TrendingUp className="w-3 h-3 mr-1" /> : <TrendingDown className="w-3 h-3 mr-1" />}
                        {Math.abs(priceChangePct).toFixed(2)}%
                      </span>
                    </div>
                  </div>
                </div>
              </div>

              <div className="h-[400px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <ComposedChart data={marketData[activeSymbol]}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#ffffff05" vertical={false} />
                    <XAxis 
                      dataKey="time" 
                      hide 
                    />
                    <YAxis 
                      domain={['auto', 'auto']} 
                      orientation="right"
                      stroke="#ffffff20"
                      fontSize={12}
                      tickFormatter={(val) => val.toLocaleString()}
                    />
                    <Tooltip 
                      contentStyle={{ backgroundColor: '#18181b', border: '1px solid #27272a', borderRadius: '12px', fontSize: '12px' }}
                      itemStyle={{ color: '#9ca3af' }}
                      labelFormatter={(label) => format(new Date(label), 'HH:mm:ss')}
                      content={({ active, payload }) => {
                        if (active && payload && payload.length) {
                          const data = payload[0].payload;
                          const isBullish = data.close >= data.open;
                          return (
                            <div className="bg-[#18181b] border border-[#27272a] p-3 rounded-xl shadow-xl">
                              <p className="text-gray-500 text-[10px] mb-1 font-bold uppercase tracking-wider">{format(new Date(data.time), 'HH:mm:ss')}</p>
                              <div className="grid grid-cols-2 gap-x-4 gap-y-1">
                                <span className="text-gray-400">Open:</span>
                                <span className="text-white font-mono text-right">{data.open.toFixed(2)}</span>
                                <span className="text-gray-400">High:</span>
                                <span className="text-white font-mono text-right">{data.high.toFixed(2)}</span>
                                <span className="text-gray-400">Low:</span>
                                <span className="text-white font-mono text-right">{data.low.toFixed(2)}</span>
                                <span className="text-gray-400">Close:</span>
                                <span className={cn("font-mono text-right", isBullish ? "text-green-500" : "text-red-500")}>{data.close.toFixed(2)}</span>
                              </div>
                            </div>
                          );
                        }
                        return null;
                      }}
                    />
                    <Bar 
                      dataKey="close" 
                      shape={<Candlestick />}
                      isAnimationActive={false}
                    />
                    <Line 
                      type="monotone" 
                      dataKey="sma5" 
                      stroke="#3b82f6" 
                      strokeWidth={1.5} 
                      dot={false} 
                      activeDot={false}
                      isAnimationActive={false}
                    />
                    <Line 
                      type="monotone" 
                      dataKey="sma20" 
                      stroke="#8b5cf6" 
                      strokeWidth={1.5} 
                      dot={false} 
                      activeDot={false}
                      isAnimationActive={false}
                    />
                  </ComposedChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* Active Positions */}
            <div className="bg-[#121214] rounded-3xl border border-white/5 overflow-hidden relative">
              <div className="p-6 border-b border-white/5 flex items-center justify-between">
                <h3 className="font-bold text-lg">Active Positions</h3>
                <span className="bg-blue-500/10 text-blue-500 text-xs font-bold px-3 py-1 rounded-full">
                  {positions.length} Running
                </span>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="text-xs text-gray-500 uppercase tracking-wider">
                      <th className="px-6 py-4 font-medium">Symbol</th>
                      <th className="px-6 py-4 font-medium">Side</th>
                      <th className="px-6 py-4 font-medium">Entry</th>
                      <th className="px-6 py-4 font-medium">Current</th>
                      <th className="px-6 py-4 font-medium">TP / SL</th>
                      <th className="px-6 py-4 font-medium text-right">Profit</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/5">
                    <AnimatePresence mode="popLayout">
                      {positions.length === 0 ? (
                        <tr>
                          <td colSpan={6} className="px-6 py-12 text-center text-gray-600 italic">
                            No active positions. The bot is scanning for signals...
                          </td>
                        </tr>
                      ) : (
                        positions.map(pos => (
                          <motion.tr 
                            key={pos.id}
                            initial={{ opacity: 0, y: 10 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, x: -20 }}
                            className="hover:bg-white/5 transition-colors group"
                          >
                            <td className="px-6 py-4 font-bold">{pos.symbol}</td>
                            <td className="px-6 py-4">
                              <span className={cn(
                                "px-2 py-1 rounded-lg text-[10px] font-black uppercase",
                                pos.side === 'BUY' ? "bg-green-500/10 text-green-500" : "bg-red-500/10 text-red-500"
                              )}>
                                {pos.side}
                              </span>
                            </td>
                            <td className="px-6 py-4 font-mono text-sm">{pos.entryPrice.toFixed(2)}</td>
                            <td className="px-6 py-4 font-mono text-sm">{pos.currentPrice.toFixed(2)}</td>
                            <td className="px-6 py-4">
                              <div className="flex flex-col gap-1">
                                <span className="text-[10px] text-green-500/70 font-mono">TP: {pos.tp.toFixed(2)}</span>
                                <span className="text-[10px] text-red-500/70 font-mono">SL: {pos.sl.toFixed(2)}</span>
                              </div>
                            </td>
                            <td className={cn(
                              "px-6 py-4 text-right font-bold tabular-nums",
                              pos.profit >= 0 ? "text-green-500" : "text-red-500"
                            )}>
                              ${pos.profit.toFixed(2)}
                            </td>
                          </motion.tr>
                        ))
                      )}
                    </AnimatePresence>
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          {/* Right Column: Logs & History */}
          <div className="space-y-6">
            <div className="bg-[#121214] rounded-3xl border border-white/5 overflow-hidden flex flex-col h-[400px] relative">
              <div className="p-6 border-b border-white/5 flex items-center justify-between">
                <h3 className="font-bold text-lg">Bot Logs</h3>
                <Activity className="w-4 h-4 text-blue-500" />
              </div>
              <div className="flex-1 overflow-y-auto p-4 space-y-3 scrollbar-hide">
                <AnimatePresence initial={false}>
                  {logs.map(log => (
                    <motion.div 
                      key={log.id}
                      initial={{ opacity: 0, x: 20 }}
                      animate={{ opacity: 1, x: 0 }}
                      className="flex gap-3 text-xs"
                    >
                      <div className="mt-1">
                        {log.type === 'success' && <CheckCircle2 className="w-3 h-3 text-green-500" />}
                        {log.type === 'warning' && <AlertCircle className="w-3 h-3 text-yellow-500" />}
                        {log.type === 'error' && <AlertCircle className="w-3 h-3 text-red-500" />}
                        {log.type === 'info' && <Info className="w-3 h-3 text-blue-500" />}
                      </div>
                      <div className="flex-1">
                        <p className="text-gray-400 leading-relaxed">
                          <span className="text-gray-600 mr-2">{format(log.timestamp, 'HH:mm:ss')}</span>
                          {log.message}
                        </p>
                      </div>
                    </motion.div>
                  ))}
                </AnimatePresence>
              </div>
            </div>

            <div className="bg-[#121214] rounded-3xl border border-white/5 overflow-hidden flex flex-col h-[400px] relative">
              <div className="p-6 border-b border-white/5 flex items-center justify-between">
                <h3 className="font-bold text-lg">Recent History</h3>
                <History className="w-4 h-4 text-orange-500" />
              </div>
              <div className="flex-1 overflow-y-auto p-2 space-y-1">
                {history.slice(0, 10).map(trade => (
                  <div key={trade.id} className="p-3 hover:bg-white/5 rounded-2xl transition-colors flex items-center justify-between group">
                    <div className="flex items-center gap-3">
                      <div className={cn(
                        "w-1 h-8 rounded-full",
                        trade.profit >= 0 ? "bg-green-500" : "bg-red-500"
                      )} />
                      <div>
                        <p className="text-sm font-bold">{trade.symbol}</p>
                        <p className="text-[10px] text-gray-600 font-medium uppercase">{trade.side} • {trade.reason}</p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className={cn("text-sm font-bold tabular-nums", trade.profit >= 0 ? "text-green-500" : "text-red-500")}>
                        {trade.profit >= 0 ? "+" : ""}{trade.profit.toFixed(2)}
                      </p>
                      <p className="text-[10px] text-gray-600">{format(trade.closeTime, 'HH:mm')}</p>
                    </div>
                  </div>
                ))}
                {history.length === 0 && (
                  <div className="h-full flex items-center justify-center text-gray-600 text-sm italic">
                    No trade history yet.
                  </div>
                )}
              </div>
              {history.length > 0 && (
                <button className="p-4 text-xs text-blue-500 font-bold hover:bg-blue-500/5 transition-colors flex items-center justify-center gap-1">
                  View Full History <ChevronRight className="w-3 h-3" />
                </button>
              )}
            </div>
          </div>
        </div>
      </main>
    </div>

    {/* Mobile Navigation */}
      <nav className="fixed bottom-0 left-0 right-0 h-16 bg-[#121214] border-t border-white/5 flex items-center justify-around md:hidden z-50">
        <button className="p-2 text-blue-500"><LayoutDashboard className="w-6 h-6" /></button>
        <button className="p-2 text-gray-600"><TrendingUp className="w-6 h-6" /></button>
        <button className="p-2 text-gray-600"><History className="w-6 h-6" /></button>
        <button className="p-2 text-gray-600"><Settings className="w-6 h-6" /></button>
      </nav>
    </div>
  );
}
