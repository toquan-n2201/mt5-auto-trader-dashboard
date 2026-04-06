import express from "express";
import cors from "cors";
import path from "path";
import { fileURLToPath } from "url";
import { createServer as createViteServer } from "vite";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(cors());
  app.use(express.json());

  // Simulated MT5 State
  let mt5Account: any = null;
  let positions: any[] = [];
  let history: any[] = [];

  // MT5 Terminal Bridge Logic
  // In a real scenario, this would communicate with MT5 via:
  // 1. ZeroMQ (ZMQ)
  // 2. Named Pipes
  // 3. HTTP Bridge (Python/C++ EA)
  
  const MT5_TERMINAL = {
    connected: false,
    async sendCommand(cmd: string, params: any) {
      console.log(`[MT5 BRIDGE] Sending command: ${cmd}`, params);
      // Simulate network latency to MT5 Terminal
      await new Promise(r => setTimeout(r, 100));
      return { success: true, data: params };
    }
  };

  // API Routes
  app.post("/api/mt5/link", async (req, res) => {
    const { login, password, server } = req.body;
    
    console.log(`[BACKEND] Linking MT5 Account: ${login} via Terminal...`);
    
    // Simulate MT5 Terminal Connection to Broker
    const result = await MT5_TERMINAL.sendCommand("LINK_ACCOUNT", { login, server });
    
    if (result.success) {
      mt5Account = {
        login,
        server,
        balance: 10000.00,
        equity: 10000.00,
        margin: 0,
        freeMargin: 10000.00,
        currency: "USD",
        leverage: 100
      };
      res.json({ success: true, data: mt5Account });
    } else {
      res.status(400).json({ success: false, message: "MT5 Terminal Connection Failed" });
    }
  });

  let pendingCommands: any[] = [];

  app.get("/api/bridge/commands", (req, res) => {
    const commands = [...pendingCommands];
    pendingCommands = [];
    res.json(commands);
  });

  app.post("/api/bridge/sync", (req, res) => {
    const data = req.body;
    // console.log(`[BRIDGE] Syncing data from local MT5:`, data);
    
    if (data.login) {
      mt5Account = {
        ...mt5Account,
        ...data,
        connected: true,
        lastSync: Date.now()
      };
      res.json({ success: true });
    } else {
      res.status(400).json({ success: false });
    }
  });

  app.post("/api/bridge/positions", (req, res) => {
    const { positions: bridgePositions } = req.body;
    if (Array.isArray(bridgePositions)) {
      // Map bridge positions to internal format if needed
      positions = bridgePositions.map(p => ({
        id: p.ticket.toString(),
        symbol: p.symbol,
        side: p.type,
        volume: p.volume,
        entry: p.price_open,
        current: p.price_current,
        profit: p.profit,
        sl: p.sl,
        tp: p.tp,
        timestamp: Date.now()
      }));
      res.json({ success: true });
    } else {
      res.status(400).json({ success: false });
    }
  });

  app.get("/api/mt5/account", (req, res) => {
    if (mt5Account) {
      res.json({ success: true, data: mt5Account });
    } else {
      res.status(401).json({ success: false, message: "Not linked" });
    }
  });

  app.get("/api/market/prices", (req, res) => {
    // Simulate market data coming from MT5 Terminal -> Broker
    const prices: Record<string, number> = {
      'XAUUSD': 2350 + (Math.random() - 0.5) * 2,
      'BTCUSD': 65000 + (Math.random() - 0.5) * 100,
      'EURUSD': 1.0850 + (Math.random() - 0.5) * 0.001
    };
    res.json(prices);
  });

  app.post("/api/mt5/trade", async (req, res) => {
    const { symbol, side, volume, price, tp, sl, reason } = req.body;
    
    console.log(`[BACKEND] Executing ${side} order on MT5 Terminal...`);
    const result = await MT5_TERMINAL.sendCommand("OPEN_ORDER", { symbol, side, volume });

    pendingCommands.push({
      action: side, // 'BUY' or 'SELL'
      symbol,
      volume,
      tp,
      sl
    });

    const newPosition = {
      id: Math.random().toString(36).substr(2, 9),
      symbol,
      side,
      volume,
      entry: price,
      current: price,
      tp,
      sl,
      profit: 0,
      timestamp: Date.now(),
      reason
    };

    positions.push(newPosition);
    res.json({ success: true, data: newPosition });
  });

  app.get("/api/mt5/positions", (req, res) => {
    res.json({ success: true, data: positions });
  });

  app.post("/api/mt5/close-position", (req, res) => {
    const { id, profit } = req.body;
    const positionIndex = positions.findIndex(p => p.id === id);
    
    if (positionIndex !== -1) {
      const closed = positions.splice(positionIndex, 1)[0];
      
      pendingCommands.push({
        action: "CLOSE",
        id: closed.id,
        symbol: closed.symbol,
        ticket: closed.ticket // Assuming we store MT5 ticket
      });

      const historyItem = {
        ...closed,
        profit,
        closeTime: Date.now()
      };
      history.unshift(historyItem);
      res.json({ success: true, data: historyItem });
    } else {
      res.status(404).json({ success: false, message: "Position not found" });
    }
  });

  app.get("/api/mt5/history", (req, res) => {
    res.json({ success: true, data: history });
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
