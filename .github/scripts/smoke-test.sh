#!/usr/bin/env bash
# Installs the APK on the running emulator, launches it, and records screenshots + crash logs.
set -u
APK="$1"; OUT="$2"; PKG=com.roadshieldai.app
mkdir -p "$OUT"
adb wait-for-device
adb shell 'while [ "$(getprop sys.boot_completed)" != "1" ]; do sleep 2; done'
adb logcat -c
adb install -r -g "$APK" > "$OUT/install.txt" 2>&1; echo "install exit $?" >> "$OUT/install.txt"
adb shell monkey -p "$PKG" -c android.intent.category.LAUNCHER 1 > /dev/null 2>&1
sleep 25
adb exec-out screencap -p > "$OUT/01-launch.png"
PID=$(adb shell pidof "$PKG" | tr -d '\r')
# Tap through onboarding: the primary button sits near the bottom centre.
W=$(adb shell wm size | grep -oE '[0-9]+x[0-9]+' | head -1 | cut -dx -f1); H=$(adb shell wm size | grep -oE '[0-9]+x[0-9]+' | head -1 | cut -dx -f2)
for i in 2 3 4 5; do adb shell input tap $((W/2)) $((H*92/100)); sleep 4; adb exec-out screencap -p > "$OUT/0$i-step.png"; done
sleep 6
adb exec-out screencap -p > "$OUT/06-after-onboarding.png"
PID_AFTER=$(adb shell pidof "$PKG" | tr -d '\r')
adb logcat -d > "$OUT/logcat-full.txt"
grep -E "FATAL EXCEPTION|AndroidRuntime: |ReactNativeJS|E ReactNative|libc  *: Fatal" "$OUT/logcat-full.txt" | head -300 > "$OUT/logcat-errors.txt"
grep -E "ReactNativeJS" "$OUT/logcat-full.txt" | tail -200 > "$OUT/logcat-js.txt"
tail -c 2000000 "$OUT/logcat-full.txt" > "$OUT/logcat-tail.txt"; rm "$OUT/logcat-full.txt"
{ echo "pid_after_launch=$PID"; echo "pid_after_onboarding=$PID_AFTER"; } > "$OUT/process.txt"
cat "$OUT/install.txt" "$OUT/process.txt"
if [ -z "$PID_AFTER" ]; then echo "App is not running (crashed?)"; exit 1; fi
