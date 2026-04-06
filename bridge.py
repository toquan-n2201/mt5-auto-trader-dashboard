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
BACKEND_URL = "https://mt5-auto-trader-dashboard-6v68.vercel.app" 
POLL_INTERVAL = 1.0 

def execute_command(cmd):
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
            print(f"❌ Lỗi đặt lệnh {action}: {result.comment}")
        else:
            print(f"✅ Đặt lệnh {action} {symbol} thành công!")

def start_bridge():
    print("\n" + "🚀" * 20)
    print("--- MT5 TO WEB BRIDGE IS RUNNING ---")
    print(f"Target Web: {BACKEND_URL}")
    print("🚀" * 20 + "\n")
    
    if not mt5.initialize():
        print("❌ LỖI: Không thể khởi động MT5. Hãy chắc chắn Boss đã mở phần mềm MT5!")
        return

    print("✅ Bước 1: Đã kết nối với phần mềm MT5.")
    
    while True:
        try:
            # 1. Kiểm tra tài khoản MT5
            acc = mt5.account_info()
            if acc is None:
                print("⏳ Bước 2: Đang đợi Boss ĐĂNG NHẬP tài khoản vào MT5...")
                time.sleep(2)
                continue

            # 2. Gửi dữ liệu lên Web
            payload = {
                "login": acc.login,
                "balance": acc.balance,
                "equity": acc.equity,
                "server": acc.server,
                "currency": acc.currency,
                "leverage": acc.leverage,
                "connected": True
            }
            
            print(f"📡 Bước 3: Đang gửi dữ liệu TK {acc.login} lên Web App...")
            
            try:
                r = requests.post(f"{BACKEND_URL}/api/bridge/sync", json=payload, timeout=5)
                if r.status_code == 200:
                    print(f"🟢 KẾT NỐI THÀNH CÔNG! App trên Web sẽ sáng đèn ngay bây giờ.")
                else:
                    print(f"❌ Lỗi Server ({r.status_code}): Kiểm tra lại URL Backend.")
            except Exception as e:
                print(f"❌ Lỗi mạng: Không thể gửi dữ liệu lên Web. (Chi tiết: {e})")

            # 3. Đồng bộ Positions
            positions = mt5.positions_get()
            pos_list = []
            if positions:
                for p in positions:
                    pos_list.append({
                        "ticket": p.ticket, "symbol": p.symbol, "volume": p.volume,
                        "type": "BUY" if p.type == 0 else "SELL",
                        "price_open": p.price_open, "price_current": p.price_current,
                        "profit": p.profit, "sl": p.sl, "tp": p.tp
                    })
            
            try:
                requests.post(f"{BACKEND_URL}/api/bridge/positions", json={"positions": pos_list}, timeout=2)
            except:
                pass

            # 4. Kiểm tra lệnh từ Web
            try:
                response = requests.get(f"{BACKEND_URL}/api/bridge/commands", timeout=2)
                if response.status_code == 200:
                    commands = response.json()
                    for cmd in commands:
                        execute_command(cmd)
            except:
                pass

            time.sleep(POLL_INTERVAL)
        except Exception as e:
            print(f"⚠️ Lỗi hệ thống: {e}")
            time.sleep(5)

if __name__ == "__main__":
    start_bridge()
