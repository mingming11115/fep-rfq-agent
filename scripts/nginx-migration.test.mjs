import test from 'node:test';
import assert from 'node:assert/strict';
test('HTTP migration preserves domain, port, unrelated routes and is idempotent',async()=>{
 const {migrate}=await import('../deploy/web/migrate-nginx.mjs');
 const source='server { listen 80; server_name rfq.example; root /srv/rfq/web; location / { try_files $uri /index.html; } location ~* \\.(js|wasm)$ { expires 7d; } location /jaeger/ { proxy_pass http://localhost:16686; } }';
 const output=migrate(source,48080,'/etc/nginx/rfq.conf');
 assert.match(output,/listen 80;/);assert.match(output,/server_name rfq.example;/);
 assert.match(output,/127.0.0.1:48080/);assert.match(output,/localhost:16686/);
 assert.doesNotMatch(output,/expires 7d|try_files/);assert.equal(migrate(output,48080,'/etc/nginx/rfq.conf'),output);
 assert.equal(migrate('server {listen 80; root /srv/other;}',48080,'/etc/nginx/other.conf'),null);
 assert.equal(migrate('server {listen 443 ssl; root /srv/rfq;}',48080,'/etc/nginx/rfq.conf'),null);
 const mixed=source+'\nserver { listen 80; server_name shop.example; root /srv/shop; location / { try_files $uri /index.html; } }';
 const result=migrate(mixed,48080,'/etc/nginx/rfq.conf');
 assert.ok(result.endsWith('server { listen 80; server_name shop.example; root /srv/shop; location / { try_files $uri /index.html; } }'));
});

test('legacy naura-ai site is migrated even with a generic config filename',async()=>{
 const {migrate}=await import('../deploy/web/migrate-nginx.mjs');
 const source='server { listen 80; server_name example.test; root /data/naura-ai; location = /index.html { try_files $uri =404; } location / { try_files $uri /index.html; } }';
 const output=migrate(source,48080,'/usr/local/nginx/conf/nginx.conf');
 assert.ok(output,'known old deployment must be recognized');
 assert.doesNotMatch(output,/try_files/);assert.match(output,/proxy_pass http:\/\/127.0.0.1:48080/);
});
