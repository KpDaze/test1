#!/usr/bin/env python3
import base64, json, os, subprocess, time, urllib.request
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

PORT=int(os.environ.get('LIVE_EMULATOR_PORT','8090'))
REPO=os.environ.get('GITHUB_REPOSITORY','KpDaze/test1')
BRANCH=os.environ.get('GITHUB_REF_NAME','shiftmate-clean')
TOKEN=os.environ.get('GITHUB_TOKEN','')
CONTROL='.live/control.json'
FREEZE='/tmp/shiftmate-freeze'
END='/tmp/shiftmate-end'

HTML=r'''<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no"><title>ShiftMate Live Emulator</title><style>
*{box-sizing:border-box}body{margin:0;background:#06161b;color:#edf7f7;font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif}.bar{position:sticky;top:0;z-index:9;background:#0b2229;border-bottom:1px solid #21434a;padding:10px}.row{display:flex;gap:8px;align-items:center;flex-wrap:wrap}.title{font-weight:800;margin-right:auto}.pill{font-size:12px;color:#8fcfc8}.phone{max-width:430px;margin:12px auto;background:#000;border-radius:26px;padding:7px;touch-action:none}.phone img{width:100%;display:block;border-radius:20px;background:#fff;user-select:none;-webkit-user-drag:none}.controls{max-width:700px;margin:0 auto 14px;padding:0 12px;display:grid;gap:8px}.buttons{display:flex;gap:8px;flex-wrap:wrap}button,input{font:inherit;border-radius:10px;border:1px solid #2c555d;padding:10px 12px}button{background:#173941;color:#fff;font-weight:750}button.stop{background:#9f2929;border-color:#b83b3b}button.resume{background:#17624f;border-color:#24816a}button.end{background:#3e4548}input{flex:1;min-width:180px;background:#0f2a31;color:#fff}.msg{font-size:12px;color:#9db7bc;min-height:18px}.frozen{color:#ffb0b0;font-weight:800}
</style></head><body><div class="bar"><div class="row"><div class="title">ShiftMate live emulator</div><div id="state" class="pill">connecting…</div></div></div><div class="phone"><img id="screen" src="/screen" draggable="false"></div><div class="controls"><div class="buttons"><button onclick="key(4)">Back</button><button onclick="key(3)">Home</button><button onclick="key(187)">Recents</button><button class="stop" onclick="control(true,'STOP')">STOP WORK</button><button class="resume" onclick="control(false,'')">Resume</button><button class="end" onclick="endSession()">End session</button></div><div class="row"><input id="direction" placeholder="Direction for the next change"><button onclick="sendDirection()">Send direction</button></div><div id="msg" class="msg">Tap or swipe directly on the phone screen.</div></div><script>
const img=document.getElementById('screen');let down=null;let busy=false;
function xy(e){const r=img.getBoundingClientRect();return [Math.round((e.clientX-r.left)/r.width*img.naturalWidth),Math.round((e.clientY-r.top)/r.height*img.naturalHeight)]}
img.onpointerdown=e=>{down=xy(e);img.setPointerCapture(e.pointerId)};img.onpointerup=e=>{if(!down)return;const up=xy(e),dx=up[0]-down[0],dy=up[1]-down[1],d=Math.hypot(dx,dy);post('/input',d<12?{action:'tap',x:up[0],y:up[1]}:{action:'swipe',x1:down[0],y1:down[1],x2:up[0],y2:up[1],ms:Math.min(800,Math.max(120,Math.round(d))) });down=null};
async function post(u,b){try{const r=await fetch(u,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(b)});const j=await r.json();document.getElementById('msg').textContent=j.message||'OK'}catch(e){document.getElementById('msg').textContent='Control error: '+e}}
function key(code){post('/input',{action:'key',code})}function control(stop,direction){post('/control',{stop,direction})}function sendDirection(){const v=document.getElementById('direction').value.trim();if(v)post('/control',{direction:v});document.getElementById('direction').value=''}function endSession(){if(confirm('End this live emulator session?'))post('/end',{}) }
async function state(){try{const r=await fetch('/state?t='+Date.now());const s=await r.json();const el=document.getElementById('state');el.textContent=(s.frozen?'STOPPED · ':'LIVE · ')+(s.sha||'').slice(0,8);el.className='pill'+(s.frozen?' frozen':'')}catch(e){}}
function refresh(){if(!down&&!busy){busy=true;const n=new Image();n.onload=()=>{img.src=n.src;busy=false};n.onerror=()=>busy=false;n.src='/screen?t='+Date.now()}setTimeout(refresh,650)}refresh();setInterval(state,1500);state();
</script></body></html>'''

def adb(*args, output=False):
    cmd=['adb',*map(str,args)]
    if output:return subprocess.check_output(cmd,stderr=subprocess.DEVNULL)
    return subprocess.run(cmd,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL).returncode

def publish_control(stop=None,direction=None):
    if not TOKEN:return
    data={'stop':os.path.exists(FREEZE),'direction':'','updated_by':'live-emulator','updated_at':int(time.time())}
    if stop is not None:data['stop']=bool(stop)
    if direction is not None:data['direction']=str(direction)
    api=f'https://api.github.com/repos/{REPO}/contents/{CONTROL}'
    headers={'Authorization':f'Bearer {TOKEN}','Accept':'application/vnd.github+json','X-GitHub-Api-Version':'2022-11-28','User-Agent':'shiftmate-live'}
    for _ in range(2):
        try:
            q=urllib.request.Request(api+'?ref='+BRANCH,headers=headers)
            with urllib.request.urlopen(q,timeout=10) as r:cur=json.load(r)
            body={'message':'live emulator: control update','content':base64.b64encode((json.dumps(data,separators=(',',':'))+'\n').encode()).decode(),'sha':cur['sha'],'branch':BRANCH}
            req=urllib.request.Request(api,data=json.dumps(body).encode(),headers={**headers,'Content-Type':'application/json'},method='PUT')
            with urllib.request.urlopen(req,timeout=10):pass
            return
        except Exception:
            time.sleep(.5)

class H(BaseHTTPRequestHandler):
    def log_message(self,*a):pass
    def send_bytes(self,b,ctype='application/octet-stream',code=200):
        self.send_response(code);self.send_header('Content-Type',ctype);self.send_header('Cache-Control','no-store');self.send_header('Content-Length',str(len(b)));self.end_headers();self.wfile.write(b)
    def json(self,obj,code=200):self.send_bytes(json.dumps(obj).encode(),'application/json',code)
    def read_json(self):
        try:return json.loads(self.rfile.read(int(self.headers.get('content-length','0') or 0)) or b'{}')
        except Exception:return {}
    def do_GET(self):
        p=self.path.split('?',1)[0]
        if p=='/':return self.send_bytes(HTML.encode(),'text/html; charset=utf-8')
        if p=='/screen':
            try:return self.send_bytes(adb('exec-out','screencap','-p',output=True),'image/png')
            except Exception:return self.send_bytes(b'', 'image/png',503)
        if p=='/state':
            try:sha=subprocess.check_output(['git','rev-parse','HEAD'],text=True).strip()
            except Exception:sha=''
            return self.json({'sha':sha,'frozen':os.path.exists(FREEZE)})
        self.send_error(404)
    def do_POST(self):
        p=self.path.split('?',1)[0];d=self.read_json()
        if p=='/input':
            a=d.get('action')
            if a=='tap':adb('shell','input','tap',int(d['x']),int(d['y']))
            elif a=='swipe':adb('shell','input','swipe',int(d['x1']),int(d['y1']),int(d['x2']),int(d['y2']),int(d.get('ms',250)))
            elif a=='key':adb('shell','input','keyevent',int(d['code']))
            else:return self.json({'message':'Unknown input'},400)
            return self.json({'message':'Input sent'})
        if p=='/control':
            stop=d.get('stop',None);direction=d.get('direction',None)
            if stop is True:open(FREEZE,'w').close()
            elif stop is False:
                try:os.unlink(FREEZE)
                except FileNotFoundError:pass
            publish_control(stop,direction)
            return self.json({'message':'Work frozen' if os.path.exists(FREEZE) else ('Direction saved' if direction else 'Work resumed')})
        if p=='/end':
            open(END,'w').close();return self.json({'message':'Session ending'})
        self.send_error(404)

ThreadingHTTPServer(('0.0.0.0',PORT),H).serve_forever()
