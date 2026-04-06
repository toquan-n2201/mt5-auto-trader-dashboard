import sys

# TỰ ĐỘNG KIỂM TRA THƯ VIỆN
try:
    import MetaTrader5 as mt5
    import requests
    import json
    import time
except ImportError as e:
    print("\n" + "="*50)
    print("THIẾU THƯ VIỆN! HÃY CHẠY LỆNH SAU TRÊN TERMINAL:")
    print(f"pip install requests MetaTrader5")
    print("="*50 + "\n")
    sys.exit(1)

# CONFIGURATION
# Đảm bảo URL này khớp với URL App của Boss
BACKEND_URL = "https://mt5-auto-trader-dashboard-6v68.vercel.app" 
POLL_INTERVAL = 1.0 # Giây

def execute_command(cmd):
    """Thực thi lệnh từ Web App xuống MT5"""
    action = cmd.get('action')
    symbol = cmd.get('symbol')
    volume = float(cmd.get('volume', 0.01))
    
    if action == 'BUY' or action == 'SELL':
        order_type = mt5.ORDER_TYPE_BUY if action == 'BUY' else mt5.ORDER_TYPE_SELL
        price = mt5.symbol_info_tick(symbol).ask if action == 'BUY' else mt5.symbol_info_tick(symbol).bid
        
        request = {
            "action": mt5.TRADE_ACTION_DEAL,
            "symbol": symbol,
            "volume": volume,
            "type": order_type,
            "price": price,
            "magic": 234000,
            "comment": "Web AutoTrader",
            "type_time": mt5.ORDER_TIME_GTC,
            "type_filling": mt5.ORDER_FILLING_IOC,
        }
        
        result = mt5.order_send(request)
        if result.retcode != mt5.TRADE_RETCODE_DONE:
            print(f"Lỗi đặt lệnh {action}: {result.comment}")
        else:
            print(f"Đặt lệnh {action} {symbol} thành công!")
            
    elif action == 'CLOSE':
        ticket = int(cmd.get('ticket', 0))
        if ticket > 0:
            positions = mt5.positions_get(ticket=ticket)
            if positions:
                pos = positions[0]
                tick = mt5.symbol_info_tick(pos.symbol)
                type_close = mt5.ORDER_TYPE_SELL if pos.type == mt5.POSITION_TYPE_BUY else mt5.ORDER_TYPE_BUY
                price_close = tick.bid if pos.type == mt5.POSITION_TYPE_BUY else tick.ask
                
                request = {
                    "action": mt5.TRADE_ACTION_DEAL,
                    "symbol": pos.symbol,
                    "volume": pos.volume,
                    "type": type_close,
                    "position": pos.ticket,
                    "price": price_close,
                    "magic": 234000,
                    "comment": "Close from Web",
                    "type_time": mt5.ORDER_TIME_GTC,
                    "type_filling": mt5.ORDER_FILLING_IOC,
                }
                mt5.order_send(request)
                print(f"Đã đóng lệnh #{ticket}")
            
    elif action == 'CLOSE_ALL':
        positions = mt5.positions_get(symbol=symbol)
        if positions:
            for pos in positions:
                tick = mt5.symbol_info_tick(pos.symbol)
                type_close = mt5.ORDER_TYPE_SELL if pos.type == mt5.POSITION_TYPE_BUY else mt5.ORDER_TYPE_BUY
                price_close = tick.bid if pos.type == mt5.POSITION_TYPE_BUY else tick.ask
                
                request = {
                    "action": mt5.TRADE_ACTION_DEAL,
                    "symbol": pos.symbol,
                    "volume": pos.volume,
                    "type": type_close,
                    "position": pos.ticket,
                    "price": price_close,
                    "magic": 234000,
                    "comment": "Close from Web",
                    "type_time": mt5.ORDER_TIME_GTC,
                    "type_filling": mt5.ORDER_FILLING_IOC,
                }
                mt5.order_send(request)
            print(f"Đã đóng toàn bộ lệnh {symbol}")

def start_bridge():
    print("\n" + "🚀" * 20)
    print("--- MT5 TO WEB BRIDGE IS RUNNING ---")
    print(f"Backend: {BACKEND_URL}")
    print("🚀" * 20 + "\n")
    
    if not mt5.initialize():
        print("❌ MT5 Initialization failed. Hãy mở phần mềm MT5 lên trước!")
        return

    print("✅ Đã kết nối với MT5 Terminal.")
    
    while True:
        try:
            # 1. Đồng bộ thông tin tài khoản
            acc = mt5.account_info()
            if acc:
                payload = {
                    "login": acc.login,
                    "balance": acc.balance,
                    "equity": acc.equity,
                    "server": acc.server,
                    "currency": acc.currency,
                    "leverage": acc.leverage,
                    "connected": True
                }
                try:
                    requests.post(f"{BACKEND_URL}/api/bridge/sync", json=payload, timeout=2)
                except:
                    pass

            # 2. Đồng bộ các lệnh đang chạy (Positions)
            positions = mt5.positions_get()
            pos_list = []
            if positions:
                for p in positions:
                    pos_list.append({
                        "ticket": p.ticket,
                        "symbol": p.symbol,
                        "volume": p.volume,
                        "type": "BUY" if p.type == 0 else "SELL",
                        "price_open": p.price_open,
                        "price_current": p.price_current,
                        "profit": p.profit,
                        "sl": p.sl,
                        "tp": p.tp
                    })
            
            try:
                requests.post(f"{BACKEND_URL}/api/bridge/positions", json={"positions": pos_list}, timeout=2)
            except:
                pass

            # 3. Kiểm tra lệnh từ Web App
            try:
                response = requests.get(f"{BACKEND_URL}/api/bridge/commands", timeout=2)
                if response.status_code == 200:
                    commands = response.json()
                    for cmd in commands:
                        execute_command(cmd)
            except Exception as e:
                pass

            time.sleep(POLL_INTERVAL)
        except Exception as e:
            print(f"⚠️ Lỗi hệ thống: {e}")
            time.sleep(5)

if __name__ == "__main__":
    start_bridge()
