#!/usr/bin/env bash
set -euo pipefail
cd "$GITHUB_WORKSPACE"
rm -f /tmp/shiftmate-freeze /tmp/shiftmate-end
adb wait-for-device
adb shell wm size 941x1672
adb shell wm density 350
adb shell settings put system font_scale 1.0
adb shell settings put system time_12_24 24
adb install -r frontend/android/app/build/outputs/apk/debug/app-debug.apk
adb shell pm clear com.shiftmate.app || true
adb reverse tcp:8081 tcp:8081
(
  cd frontend
  CI=1 EXPO_NO_TELEMETRY=1 pnpm exec expo start --port 8081 > "$GITHUB_WORKSPACE/.live/metro.log" 2>&1
) &
METRO_PID=$!
for _ in $(seq 1 90); do
  if curl -fsS http://127.0.0.1:8081/status 2>/dev/null | grep -q running; then break; fi
  sleep 1
done
adb shell run-as com.shiftmate.app mkdir -p files/SQLite
adb shell run-as com.shiftmate.app rm -f files/SQLite/shiftmate.db files/SQLite/shiftmate.db-wal files/SQLite/shiftmate.db-shm
adb push frontend/preview-seed.db /data/local/tmp/preview-seed.db >/dev/null
adb shell chmod 644 /data/local/tmp/preview-seed.db
adb shell run-as com.shiftmate.app cp /data/local/tmp/preview-seed.db files/SQLite/shiftmate.db
adb shell am start -W -S -n com.shiftmate.app/.MainActivity
sleep 8
GITHUB_TOKEN="$GITHUB_TOKEN" LIVE_EMULATOR_PORT=8090 python3 .live/emulator_server.py > .live/server.log 2>&1 &
SERVER_PID=$!
for _ in $(seq 1 30); do curl -fsS http://127.0.0.1:8090/state >/dev/null 2>&1 && break; sleep 1; done
curl -L --fail --retry 3 -o /tmp/cloudflared https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64
chmod +x /tmp/cloudflared
/tmp/cloudflared tunnel --no-autoupdate --url http://127.0.0.1:8090 > .live/cloudflared.log 2>&1 &
TUNNEL_PID=$!
URL=''
for _ in $(seq 1 90); do
  URL=$(grep -Eo 'https://[-a-z0-9]+\.trycloudflare\.com' .live/cloudflared.log | head -n1 || true)
  [ -n "$URL" ] && break
  sleep 1
done
[ -n "$URL" ]
python3 - "$URL" <<'PY'
import base64,json,os,sys,urllib.request,time
repo=os.environ['GITHUB_REPOSITORY'];branch=os.environ.get('GITHUB_REF_NAME','shiftmate-clean');token=os.environ['GITHUB_TOKEN'];path='.live/LIVE_URL';url=sys.argv[1]+'/'
api=f'https://api.github.com/repos/{repo}/contents/{path}'
h={'Authorization':f'Bearer {token}','Accept':'application/vnd.github+json','X-GitHub-Api-Version':'2022-11-28','User-Agent':'shiftmate-live'}
for _ in range(4):
    try:
        with urllib.request.urlopen(urllib.request.Request(api+'?ref='+branch,headers=h),timeout=10) as r:cur=json.load(r)
        body={'message':'live emulator: publish session','content':base64.b64encode((url+'\n').encode()).decode(),'sha':cur['sha'],'branch':branch}
        req=urllib.request.Request(api,data=json.dumps(body).encode(),headers={**h,'Content-Type':'application/json'},method='PUT')
        urllib.request.urlopen(req,timeout=10).read();break
    except Exception:
        time.sleep(1)
PY
(
  while [ ! -f /tmp/shiftmate-end ]; do
    if [ ! -f /tmp/shiftmate-freeze ]; then
      git fetch --quiet origin shiftmate-clean || true
      REMOTE=$(git rev-parse origin/shiftmate-clean 2>/dev/null || true)
      LOCAL=$(git rev-parse HEAD 2>/dev/null || true)
      if [ -n "$REMOTE" ] && [ "$REMOTE" != "$LOCAL" ]; then
        git reset --hard origin/shiftmate-clean >/dev/null || true
      fi
    fi
    sleep 2
  done
) &
SYNC_PID=$!
for _ in $(seq 1 10800); do
  [ -f /tmp/shiftmate-end ] && break
  kill -0 "$TUNNEL_PID" 2>/dev/null || break
  sleep 1
done
kill "$SYNC_PID" "$TUNNEL_PID" "$SERVER_PID" "$METRO_PID" 2>/dev/null || true
