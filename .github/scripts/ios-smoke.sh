#!/usr/bin/env bash
# Boots an iPhone simulator, installs the Release simulator build, launches it and records
# screenshots and the app's log. Fails if the app is not running after launch.
set -u
APP="$1"; OUT="$2"; BUNDLE=com.roadshieldai.app
mkdir -p "$OUT"
UDID=$(xcrun simctl list devices available -j | python3 -c "
import sys, json
d = json.load(sys.stdin)['devices']
phones = [(rt, dev) for rt, devs in d.items() if 'iOS' in rt for dev in devs if dev['name'].startswith('iPhone')]
phones.sort(key=lambda x: x[0])
print(phones[-1][1]['udid'])")
echo "simulator $UDID"
xcrun simctl boot "$UDID" || true
xcrun simctl bootstatus "$UDID" -b
xcrun simctl install "$UDID" "$APP"
xcrun simctl spawn "$UDID" log stream --style compact --predicate 'process == "RoadShieldAI"' > "$OUT/app-log.txt" 2>&1 &
LOGPID=$!
xcrun simctl launch "$UDID" "$BUNDLE" | tee "$OUT/launch.txt"
sleep 30
xcrun simctl io "$UDID" screenshot "$OUT/01-launch.png"
sleep 10
xcrun simctl io "$UDID" screenshot "$OUT/02-after-40s.png"
kill $LOGPID 2>/dev/null || true
RUNNING=$(xcrun simctl spawn "$UDID" launchctl list | grep -c "$BUNDLE" || true)
echo "running_entries=$RUNNING" | tee "$OUT/process.txt"
grep -iE "fatal|exception|crash|error" "$OUT/app-log.txt" | head -100 > "$OUT/app-errors.txt" || true
tail -c 1500000 "$OUT/app-log.txt" > "$OUT/app-log-tail.txt"; rm -f "$OUT/app-log.txt"
[ "$RUNNING" -gt 0 ] || { echo "App is not running"; exit 1; }
