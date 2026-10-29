"""Conservative official USS monthly-source monitor.
Does not infer individual vehicle prices from aggregate data.
"""
import hashlib
import json
import re
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

URL = "https://www.ussnet.co.jp/ir/library/monthly/index.html"
OUT = Path("data/uss_source_status.json")

def main():
    req = urllib.request.Request(URL, headers={"User-Agent": "MDMarketResearch/1.0 (public IR monthly source check)"})
    with urllib.request.urlopen(req, timeout=25) as response:
        final_url = response.geturl()
        content = response.read(2_000_001)
        content_type = response.headers.get("Content-Type", "")
    if len(content) > 2_000_000:
        raise RuntimeError("Source page unexpectedly large")
    if not final_url.startswith(("https://www.ussnet.co.jp/", "https://qtwcca163.secure.jp/")):
        raise RuntimeError("Unexpected redirect: " + final_url)
    if "html" not in content_type.lower():
        raise RuntimeError("Expected HTML, got: " + content_type)
    html = content.decode("utf-8", errors="replace")
    if not all(x in html for x in ("出品", "成約")):
        raise RuntimeError("Source format changed: cannot verify monthly table")
    status = {
        "source": "USS official investor relations monthly data",
        "source_url": final_url,
        "checked_at_utc": datetime.now(timezone.utc).isoformat(),
        "source_sha256": hashlib.sha256(content).hexdigest(),
        "status": "source_reachable_not_yet_parsed",
        "warning": "Aggregate market data only; individual vehicle sale prices are not available from this source.",
    }
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(status, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print("Verified official source reachability; no market figures invented.")

if __name__ == "__main__":
    main()
