const { test } = require('node:test');
const assert = require('node:assert/strict');
const { PhonePairing, createPhoneServer } = require('../electron/phone-server.cjs');
const path = require('node:path');

test('phone transcription requires registration and refuses delivery after revocation',async()=>{
 let release;const server=await createPhoneServer({root:path.resolve('dist'),getState:()=>({}),onControl:async()=>{},getTranscript:()=>new Promise(resolve=>release=resolve)});
 const post=token=>fetch(server.localOrigin+'/api/transcribe',{method:'POST',headers:{Origin:server.localOrigin,'Content-Type':'audio/webm','X-Bebo-Language':'en',Authorization:`Bearer ${token}`},body:new Uint8Array(500)});
 try{
  assert.equal((await post('wrong')).status,401);
  const invite=server.pairing.offer(),claim=server.pairing.request(invite.token,'Phone','transcribe_nonce_1');server.pairing.decide(claim.id,true);const token=server.pairing.result(claim.ticket).token;
  const pending=post(token);while(!release)await new Promise(resolve=>setTimeout(resolve,5));server.pairing.revoke();release('private transcript');const response=await pending;
  assert.equal(response.status,401);assert.equal((await response.json()).text,undefined);
 }finally{await server.close();}
});

test('registration survives server restart and explicit revocation survives restart too', async () => {
  let saved = null;
  const store = { load: () => saved, save: value => { saved = value; } };
  const options = { root: path.resolve('dist'), getState: () => ({ connected: true }), onControl: async () => {}, store };
  let server = await createPhoneServer(options);
  const invite = server.pairing.offer(), claim = server.pairing.request(invite.token, 'My iPhone', 'persistent_nonce_123');
  server.pairing.decide(claim.id, true); const token = server.pairing.result(claim.ticket).token;
  await server.close();
  server = await createPhoneServer(options);
  try {
    assert.equal(server.pairing.authorize(token).name, 'My iPhone');
    assert.equal(server.pairing.reconnectToken(), token);
    assert.equal((await fetch(server.localOrigin + '/api/state', { headers: { Authorization: `Bearer ${token}` } })).status, 200);
    server.pairing.revoke();
    assert.throws(() => new PhonePairing({ store }).authorize(token), /disconnected/);
  } finally { await server.close(); }
});

test('phone pairing needs desktop confirmation, expires, and revokes all credentials', () => {
  let now = 1000, revoked = 0;
  const pairing = new PhonePairing({ now: () => now, onRevoke: () => revoked++ });
  const invitation = pairing.offer();
  assert.throws(() => pairing.request('wrong', 'iPhone', 'valid_nonce_123456'), /expired/);
  const claim = pairing.request(invitation.token, 'My iPhone', 'valid_nonce_123456');
  assert.equal(pairing.request(invitation.token, 'My iPhone', 'valid_nonce_123456').ticket, claim.ticket);
  assert.throws(() => pairing.request(invitation.token, 'Other', 'other_nonce_123456'), /already been scanned/);
  assert.throws(() => pairing.authorize(claim.ticket), /disconnected/);
  assert.equal(pairing.result(claim.ticket).status, 'pending');
  pairing.decide(claim.id, true);
  const token = pairing.result(claim.ticket).token;
  assert.equal(pairing.authorize(token).name, 'My iPhone');
  assert.equal(pairing.desktopStatus().device.token, undefined);
  assert.equal(pairing.desktopStatus().device.hash, undefined);
  assert.throws(() => pairing.offer(), /Disconnect/);
  pairing.revoke();
  assert.equal(revoked, 1); assert.throws(() => pairing.authorize(token), /disconnected/);
  const expired = pairing.offer(); now += 300001;
  assert.throws(() => pairing.request(expired.token, 'iPhone', 'valid_nonce_123456'), /expired/);
});

test('rejected claims cannot control the desktop and registered phones outlive sessions', () => {
  let now = 0;
  const pairing = new PhonePairing({ now: () => now });
  let invite = pairing.offer(), claim = pairing.request(invite.token, 'Phone', 'one_nonce_1234567');
  pairing.decide(claim.id, false);
  assert.deepEqual(pairing.result(claim.ticket).status, 'rejected');
  assert.equal(pairing.result(claim.ticket).token, undefined);
  invite = pairing.offer(); claim = pairing.request(invite.token, 'Phone', 'two_nonce_1234567');
  pairing.decide(claim.id, true); const token = pairing.result(claim.ticket).token;
  now += 365 * 24 * 60 * 60 * 1000;
  assert.equal(pairing.authorize(token).name, 'Phone');
  assert.equal(pairing.desktopStatus().device.expires, null);
});

test('manual Home Screen pairing uses the same expiring desktop-confirmed flow', () => {
  const pairing = new PhonePairing();
  const invite = pairing.offer();
  const code = `${invite.code.slice(0,5)}-${invite.code.slice(5)}`;
  const claim = pairing.request(code, 'Home Screen', 'manual_nonce_12345');
  assert.equal(pairing.result(claim.ticket).status, 'pending');
  assert.throws(() => pairing.authorize(code), /disconnected/);
  pairing.decide(claim.id, true);
  assert.equal(pairing.authorize(pairing.result(claim.ticket).token).name, 'Home Screen');
});

test('HTTP phone boundary blocks unpaired callers, cross-origin access, and private files', async () => {
  let commands = 0;
  const server = await createPhoneServer({ root: path.resolve('dist'), getState: () => ({ connected: false }), onControl: async () => { commands++; } });
  const url = server.localOrigin;
  const post = (route, body, token, origin = url) => fetch(`${url}${route}`, { method: 'POST', headers: { Origin: origin, 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: JSON.stringify(body) });
  try {
    assert.equal((await fetch(`${url}/api/state`)).status, 401);
    assert.equal((await post('/api/control', { op: 'stop', id: 'a_command_1234567' })).status, 401);
    assert.equal((await fetch(`${url}/api/state`, { headers: { Origin: 'https://evil.example' } })).status, 403);
    const hostStatus = await new Promise((resolve, reject) => {
      require('node:http').get(`${url}/api/state`, { headers: { Host: 'evil.example' } }, res => { res.resume(); resolve(res.statusCode); }).on('error', reject);
    });
    assert.equal(hostStatus, 403);
    for (const file of ['/electron/main.cjs', '/package.json', '/.env', '/assets/../../electron/main.cjs']) assert.equal((await fetch(`${url}${file}`)).status, 404);
    const invitation = server.pairing.offer();
    assert.equal((await post('/api/pair', { token: invitation.token, nonce: 'pair_nonce_123456' }, '', 'https://evil.example')).status, 403);
    const response = await post('/api/pair', { token: invitation.token, nonce: 'pair_nonce_123456', name: 'iPhone' });
    const claim = await response.json();
    assert.equal(response.status, 200);
    assert.equal(response.headers.get('cache-control'), 'no-store');
    server.pairing.decide(server.pairing.desktopStatus().request.id, true);
    const token = server.pairing.result(claim.ticket).token;
    const state = await fetch(`${url}/api/state`, { headers: { Authorization: `Bearer ${token}` } });
    assert.equal(state.status, 200); assert.equal((await state.json()).connected, false);
    assert.equal((await post('/api/control', { op: 'shell', id: 'a_command_1234567' }, token)).status, 400);
    assert.equal((await post('/api/control', { op: 'request', id: 'a_command_1234567', text: 'x'.repeat(4001) }, token)).status, 400);
    assert.equal((await post('/api/control', { op: 'request', id: 'a_command_1234567', text: 'x'.repeat(18000) }, token)).status, 413);
    assert.equal(commands, 0);
    server.pairing.revoke();
    assert.equal((await post('/api/control', { op: 'stop', id: 'a_command_1234567' }, token)).status, 401);
  } finally { await server.close(); }
});

test('retries share one operation and request IDs cannot be repurposed', async () => {
  let commands = 0, release;
  const pending = new Promise(resolve => { release = resolve; });
  const server = await createPhoneServer({ root: path.resolve('dist'), getState: () => ({}), onControl: async () => { commands++; await pending; } });
  try {
    const invitation = server.pairing.offer(), claim = server.pairing.request(invitation.token, 'Phone', 'pair_nonce_123456');
    server.pairing.decide(claim.id, true); const token = server.pairing.result(claim.ticket).token;
    const send = body => fetch(`${server.localOrigin}/api/control`, { method: 'POST', headers: { Origin: server.localOrigin, 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify(body) });
    const body = { op: 'request', text: 'Open Calculator', id: 'idempotent_123456' };
    const first = send(body), retry = send(body);
    await new Promise(resolve => setTimeout(resolve, 40)); release();
    assert.equal((await first).status, 200); assert.equal((await retry).status, 200); assert.equal(commands, 1);
    assert.equal((await send({ ...body, text: 'Another command' })).status, 409);
    assert.equal(commands, 1);
  } finally { release(); await server.close(); }
});

test('phone voice requires pairing and rechecks revocation before delivering audio', async () => {
  let release, requests = 0;
  const server = await createPhoneServer({ root: path.resolve('dist'), getState: () => ({}), onControl: async () => {}, getSpeech: async (id, voice) => {
    assert.equal(id, 'reply-id'); assert.equal(voice, 'am_puck'); requests++;
    await new Promise(resolve => { release = resolve; }); return Buffer.from('RIFF');
  } });
  const send = (token, body = { stepId: 'reply-id', voice: 'am_puck' }) => fetch(`${server.localOrigin}/api/voice`, { method: 'POST', headers: { Origin: server.localOrigin, 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify(body) });
  try {
    assert.equal((await send('invalid')).status, 401);
    const invite = server.pairing.offer(); const claim = server.pairing.request(invite.token, 'Phone', 'voice_nonce_123456');
    server.pairing.decide(claim.id, true); const token = server.pairing.result(claim.ticket).token;
    assert.equal((await send(token, { stepId: 'reply-id', voice: '../../secret' })).status, 400);
    const response = send(token);
    while (!requests) await new Promise(resolve => setTimeout(resolve, 5));
    server.pairing.revoke(); release();
    assert.equal((await response).status, 401);
  } finally { release?.(); await server.close(); }
});

test('question answers require pairing, validate bounds, and deduplicate retries', async()=>{
 const {QuestionGate}=require('../electron/policy.cjs');const gate=new QuestionGate();const step=gate.issue({type:'ask',reason:'Which folder?',text:'',x:0,y:0},1);let answers=0;
 const server=await createPhoneServer({root:path.resolve('dist'),getState:()=>({pending:step}),onControl:async command=>{gate.consume(command.stepId,command.text);answers++;}});
 const send=(body,token='')=>fetch(server.localOrigin+'/api/control',{method:'POST',headers:{Origin:server.localOrigin,'Content-Type':'application/json',Authorization:'Bearer '+token},body:JSON.stringify(body)});
 try{const body={op:'answer',id:'answer_command_1234',stepId:step.id,text:'Downloads'};assert.equal((await send(body)).status,401);const invite=server.pairing.offer(),claim=server.pairing.request(invite.token,'Phone','question_nonce_123');server.pairing.decide(claim.id,true);const token=server.pairing.result(claim.ticket).token;
 for(const text of ['',null,'x'.repeat(2001)])assert.equal((await send({...body,text},token)).status,400);
 assert.equal((await send(body,token)).status,200);assert.equal((await send(body,token)).status,200);assert.equal(answers,1);
 assert.notEqual((await send({...body,id:'different_command_123'},token)).status,200);assert.equal(answers,1);
 }finally{await server.close();}
});
