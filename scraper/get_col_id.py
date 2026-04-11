#!/usr/bin/env python3
from datetime import datetime, timezone, timedelta
JST = timezone(timedelta(hours=9))
now = datetime.now(JST)
slot = 0 if now.hour < 15 else 1
print(f"auto_{now.strftime('%Y%m%d')}_{slot}")
