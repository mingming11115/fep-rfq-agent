from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler
from pathlib import Path
from urllib.parse import urlsplit, parse_qs, unquote, quote
from datetime import datetime
import json
import uuid

SITE = Path(__file__).resolve().parent / 'site'
EXPORTS = SITE / 'exports'
EXPORTS.mkdir(exist_ok=True)

class Handler(SimpleHTTPRequestHandler):
    extensions_map = {**SimpleHTTPRequestHandler.extensions_map, '.wasm':'application/wasm', '.js':'text/javascript', '.mjs':'text/javascript'}
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(SITE), **kwargs)
    def end_headers(self):
        self.send_header('Cache-Control', 'no-cache')
        super().end_headers()
    def do_GET(self):
        if urlsplit(self.path).path == '/':
            self.send_response(302)
            self.send_header('Location', '/classic.html?app=word')
            self.end_headers()
            return
        super().do_GET()
    def do_POST(self):
        parsed=urlsplit(self.path)
        if parsed.path!='/api/save':
            self.send_error(404);return
        if self.headers.get('Origin')!='http://127.0.0.1:18771':
            self.send_error(403);return
        app=parse_qs(parsed.query).get('app',[''])[0]
        try:
            length=int(self.headers.get('Content-Length','0'))
        except ValueError:
            self.send_error(400);return
        if app not in ('word','pdf') or not 0<length<=50*1024*1024:
            self.send_error(400);return
        name=Path(unquote(self.headers.get('X-Demo-Filename','review.docx'))).name
        if not name or name in ('.', '..') or len(name)>160:
            self.send_error(400);return
        data=self.rfile.read(length)
        if len(data)!=length:
            self.send_error(400);return
        folder=EXPORTS/uuid.uuid4().hex
        folder.mkdir()
        (folder/name).write_bytes(data)
        result={'url':'/exports/'+folder.name+'/'+quote(name),'name':name,'time':datetime.now().strftime('%H:%M:%S'),'bytes':length}
        body=json.dumps(result,ensure_ascii=False).encode()
        self.send_response(200)
        self.send_header('Content-Type','application/json; charset=utf-8')
        self.send_header('Content-Length',str(len(body)))
        self.end_headers()
        self.wfile.write(body)

if __name__=='__main__':
    print('Word-style review demo: http://127.0.0.1:18771/classic.html?app=word', flush=True)
    print('Serving persistent files from: '+str(SITE), flush=True)
    ThreadingHTTPServer(('127.0.0.1',18771),Handler).serve_forever()
