const http = require('node:http');
const fs = require('node:fs/promises');
const path = require('node:path');
const { randomBytes, randomInt, randomUUID, createHash, timingSafeEqual } = require('node:crypto');
const { MAX_AUDIO } = require('./transcription-service.cjs');

const secret = () => randomBytes(32).toString('base64url');
const digest = value => createHash('sha256').update(typeof value === 'string' ? value : '').digest();
const matches = (value, expected) => !!expected && timingSafeEqual(digest(value), digest(expected));
const fail = (message, status = 400) => Object.assign(new Error(message), { status });

class PhonePairing {
  constructor({ now = Date.now, onChange = () => {}, onRevoke = () => {}, store } = {}) {
    this.now = now; this.onChange = onChange; this.onRevoke = onRevoke; this.store = store;
    this.invite = null; this.claim = null; const saved = store?.load();
    this.device = saved ? { ...saved, hash: digest(saved.token), expires: null } : null;
  }
  offer() {
    if (this.device) throw fail('Disconnect the current phone before pairing another.');
    this.invite = { token: secret(), code: randomBytes(5).toString('hex').toUpperCase(), expires: this.now() + 300000 };
    this.claim = null; this.onChange();
    return this.invite;
  }
  request(token, name, nonce) {
    const normalizedCode = typeof token === 'string' ? token.replace(/[-\s]/g, '').toUpperCase() : '';
    if (!this.invite || this.invite.expires <= this.now() || (!matches(token, this.invite.token) && !matches(normalizedCode, this.invite.code))) throw fail('This pairing link or code expired. Create a new one on your desktop.', 401);
    if (typeof nonce !== 'string' || !/^[a-zA-Z0-9_-]{16,80}$/.test(nonce)) throw fail('Invalid pairing request.');
    if (this.claim) {
      if (this.claim.nonce === nonce && this.claim.status === 'pending') return this.claim;
      throw fail('This link has already been scanned. Create a new link on your desktop.', 409);
    }
    this.claim = { id: randomUUID(), ticket: secret(), code: String(randomInt(100000, 1000000)), nonce,
      name: typeof name === 'string' ? name.replace(/[\x00-\x1f]/g, '').slice(0, 40) || 'My phone' : 'My phone',
      status: 'pending', expires: this.invite.expires };
    this.onChange();
    return this.claim;
  }
  decide(id, allow) {
    if (!this.claim || this.claim.id !== id || this.claim.status !== 'pending' || this.claim.expires <= this.now()) throw fail('That pairing request is no longer waiting.');
    if (allow) {
      const token = secret();
      const registration = { id: randomUUID(), name: this.claim.name, token, registeredAt: this.now() };
      this.store?.save(registration);
      this.device = { ...registration, hash: digest(token), expires: null };
      this.claim.session = token; this.claim.status = 'approved';
    } else this.claim.status = 'rejected';
    this.invite = null; this.claim.expires = this.now() + 120000; this.onChange();
  }
  result(ticket) {
    if (!this.claim || this.claim.expires <= this.now() || !matches(ticket, this.claim.ticket)) throw fail('Pairing expired. Scan a new desktop link.', 401);
    return { status: this.claim.status, token: this.claim.session, code: this.claim.code };
  }
  authorize(token) {
    if (!this.device || typeof token !== 'string' || !timingSafeEqual(digest(token), this.device.hash)) throw fail('Phone disconnected. Pair again from your desktop.', 401);
    return this.device;
  }
  revoke() {
    this.store?.save(null);
    this.invite = null; this.claim = null; this.device = null;
    this.onRevoke(); this.onChange();
  }
  dispose() { this.invite = null; this.claim = null; this.device = null; this.onRevoke(); }
  reconnectToken() { return this.device?.token || ''; }
  desktopStatus() {
    return {
      invite: this.invite && this.invite.expires > this.now() ? this.invite : null,
      request: this.claim?.status === 'pending' && this.claim.expires > this.now() ? { id: this.claim.id, code: this.claim.code, name: this.claim.name } : null,
      device: this.device ? { id: this.device.id, name: this.device.name, expires: this.device.expires } : null,
    };
  }
}

async function readJSON(req) {
  if (!/^application\/json\b/i.test(req.headers['content-type'] || '')) throw fail('Send JSON.', 415);
  let size = 0; const chunks = [];
  for await (const chunk of req) { size += chunk.length; if (size > 16384) throw fail('Request too large.', 413); chunks.push(chunk); }
  try {
    const body = JSON.parse(Buffer.concat(chunks).toString('utf8'));
    if (!body || typeof body !== 'object' || Array.isArray(body)) throw Error('Expected an object');
    return body;
  } catch { throw fail('Invalid request.'); }
}

async function createPhoneServer({ root, getState, getSpeech, getTranscript, onControl, onChange, onRevoke, store, port = 0, now = Date.now }) {
  const origins = new Set(); const receipts = new Map(), stopReceipts = new Map();
  let pendingStop = null;
  const pairing = new PhonePairing({ onChange, store, now, onRevoke: () => { receipts.clear(); stopReceipts.clear(); pendingStop = null; onRevoke?.(); } });
  let attempts = 0, attemptWindow = Date.now();
  const server = http.createServer(async (req, res) => {
    const headers = { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', 'X-Frame-Options': 'DENY',
      'Referrer-Policy': 'no-referrer', 'Permissions-Policy': 'microphone=(self), camera=(), geolocation=()',
      'Content-Security-Policy': "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; media-src 'self' blob:; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'" };
    const json = (status, data) => { if (!res.destroyed) { res.writeHead(status, { ...headers, 'Content-Type': 'application/json' }); res.end(JSON.stringify(data)); } };
    try {
      const url = new URL(req.url, 'http://localhost');
      const bearer = (req.headers.authorization || '').replace(/^Bearer /, '');
      if (!origins.has(`http://${req.headers.host}`) && !origins.has(`https://${req.headers.host}`)) throw fail('Unknown host.', 403);
      if (req.headers.origin && !origins.has(req.headers.origin)) throw fail('Unknown origin.', 403);
      if (req.headers['sec-fetch-site'] === 'cross-site') throw fail('Cross-site requests are not allowed.', 403);
      if (url.pathname.startsWith('/api/')) {
        if (req.method === 'POST' && !origins.has(req.headers.origin)) throw fail('A same-origin request is required.', 403);
        if (url.pathname === '/api/pair' && req.method === 'POST') {
          if (Date.now() - attemptWindow > 60000) { attempts = 0; attemptWindow = Date.now(); }
          if (++attempts > 12) throw fail('Too many pairing attempts. Wait a minute.', 429);
          const body = await readJSON(req); const claim = pairing.request(body.token, body.name, body.nonce);
          return json(200, { ticket: claim.ticket, code: claim.code });
        }
        if (url.pathname === '/api/pair-status' && req.method === 'GET') return json(200, pairing.result(bearer));
        const device = pairing.authorize(bearer);
        if (url.pathname === '/api/state' && req.method === 'GET') return json(200, { ...getState(), sessionExpires: device.expires });
        if (url.pathname === '/api/transcribe' && req.method === 'POST') {
          if (!getTranscript) throw fail('Enhanced transcription is unavailable.', 503);
          const mime=req.headers['content-type']||'',language=req.headers['x-bebo-language']||'en';
          if(!/^audio\/(webm|mp4|mpeg|wav|x-wav|ogg)(;|$)/i.test(mime)||!['en','ar'].includes(language))throw fail('Unsupported voice recording.',415);
          if(Number(req.headers['content-length'])>MAX_AUDIO)throw fail('Recording too large.',413);
          const chunks=[];let size=0;for await(const chunk of req){size+=chunk.length;if(size>MAX_AUDIO)throw fail('Recording too large.',413);chunks.push(chunk);}
          pairing.authorize(bearer);
          const controller=new AbortController();const closed=()=>{if(!res.writableEnded)controller.abort();};res.on('close',closed);
          try{const text=await getTranscript(Buffer.concat(chunks),mime,language,controller.signal);pairing.authorize(bearer);return json(200,{text});}
          catch(error){throw error.status?error:fail(error.message||'Transcription failed.',409);}
          finally{res.off('close',closed);}
        }
        if (url.pathname === '/api/voice' && req.method === 'POST') {
          const body = await readJSON(req);
          if (!getSpeech || typeof body?.stepId !== 'string' || body.stepId.length > 80 || !['am_puck', 'af_heart', 'bm_george'].includes(body.voice)) throw fail('Invalid voice request.');
          const audio = await getSpeech(body.stepId, body.voice);
          pairing.authorize(bearer);
          if (!res.destroyed) { res.writeHead(200, { ...headers, 'Content-Type': 'audio/wav' }); res.end(audio); }
          return;
        }
        if (url.pathname === '/api/control' && req.method === 'POST') {
          const body = await readJSON(req);
          if (!body || !['request', 'approve', 'answer', 'stop'].includes(body.op) || typeof body.id !== 'string' || !/^[a-zA-Z0-9_-]{16,80}$/.test(body.id)) throw fail('Invalid command.');
          if (body.op === 'request' && (typeof body.text !== 'string' || !body.text.trim() || body.text.length > 4000)) throw fail('Enter a request under 4,000 characters.');
          if (['approve','answer'].includes(body.op) && (typeof body.stepId !== 'string' || !body.stepId || body.stepId.length > 80)) throw fail('Invalid step.');
          if (body.op === 'answer' && (typeof body.text !== 'string' || !body.text.trim() || body.text.length > 2000)) throw fail('Enter an answer under 2,000 characters.');
          for (const cache of [receipts, stopReceipts]) for (const [key, receipt] of cache) if (receipt.expires < now()) cache.delete(key);
          const key = `${device.id}:${body.id}`;
          const cache = body.op === 'stop' ? stopReceipts : receipts;
          let existing = receipts.get(key) || stopReceipts.get(key);
          if (!existing) {
            if (body.op === 'stop') {
              // Stop has its own bounded cache; it cannot evict the receipt for
              // a file/desktop operation and make an old request executable again.
              if (pendingStop) { const response = await pendingStop.promise; return json(response.status, response.value); }
              if (stopReceipts.size >= 32) stopReceipts.delete(stopReceipts.keys().next().value);
            } else if (receipts.size >= 128) throw fail('Too many requests. Try again later.', 429);
            const receipt = { expires: Infinity, pending: true, body: JSON.stringify(body) };
            receipt.promise = Promise.resolve().then(() => {
              pairing.authorize(bearer); // Revocation also invalidates queued work.
              return onControl(body);
            }).then(() => ({ status: 200, value: { accepted: true } }), error => ({ status: error?.status || 409, value: { error: error?.message || 'The desktop could not complete this step.' } })).finally(() => {
              receipt.pending = false;
              // The retry window begins when work finishes, not when it starts.
              receipt.expires = now() + 30 * 60000;
              if (pendingStop === receipt) pendingStop = null;
            });
            if (body.op === 'stop') pendingStop = receipt;
            cache.set(key, receipt); existing = receipt;
          } else if (existing.body !== JSON.stringify(body)) throw fail('A request ID cannot be reused for a different command.', 409);
          const response = await existing.promise;
          return json(response.status, response.value);
        }
        throw fail('Not found.', 404);
      }
      if (!['GET', 'HEAD'].includes(req.method)) throw fail('Not allowed.', 405);
      let name = url.pathname;
      if (name === '/') name = '/index.html';
      if (!['/index.html', '/bebo.svg', '/bebo-touch.png', '/phone.webmanifest'].includes(name) && !/^\/assets\/[a-zA-Z0-9_.-]+\.(js|css|png|svg|woff2)$/.test(name)) throw fail('Not found.', 404);
      const contents = await fs.readFile(path.join(root, name));
      const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.woff2': 'font/woff2', '.webmanifest': 'application/manifest+json' };
      res.writeHead(200, { ...headers, 'Content-Type': types[path.extname(name)] || 'application/octet-stream' });
      res.end(req.method === 'HEAD' ? undefined : contents);
    } catch (error) { json(error.code === 'ENOENT' ? 404 : error.status || 500, { error: error.status ? error.message : 'Bebo could not handle that request.' }); }
  });
  server.requestTimeout = 10000; server.headersTimeout = 10000;
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(port, '127.0.0.1', resolve); });
  const localOrigin = `http://127.0.0.1:${server.address().port}`; origins.add(localOrigin);
  return { pairing, localOrigin, setPublicOrigin(value) { const url = new URL(value); if (url.protocol !== 'https:') throw fail('Phone links must use HTTPS.'); origins.add(url.origin); },
    close() { pairing.dispose(); server.closeAllConnections(); return new Promise(resolve => server.close(resolve)); } };
}
module.exports = { PhonePairing, createPhoneServer };
