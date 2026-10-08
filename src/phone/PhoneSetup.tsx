import { useEffect, useState } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { ArrowUpRight, Check, Copy, Link2, Loader2, RefreshCw, ShieldCheck, Smartphone, Unplug } from 'lucide-react';
import { BeboAvatar } from '../components/BeboAvatar';
import type { PhoneConnection } from './types';
import './phone.css';

export function PhoneSetup({ color }: { color: string }) {
  const [connection, setConnection] = useState<PhoneConnection | null>(null);
  const [error, setError] = useState('');
  const [working, setWorking] = useState(false);
  const [copied, setCopied] = useState(false);
  const [now, setNow] = useState(Date.now());
  const bridge = window.bebo;
  useEffect(() => {
    let mounted = true;
    const refresh = () => { setNow(Date.now()); bridge?.phoneStatus?.().then(value => { if (mounted) setConnection(value); }).catch(() => {}); };
    refresh(); const timer = setInterval(refresh, 2000);
    const unsubscribe = bridge?.onPhoneChanged?.(setConnection);
    return () => { mounted = false; clearInterval(timer); unsubscribe?.(); };
  }, [bridge]);
  async function change(action: () => Promise<unknown> | undefined) {
    setWorking(true); setError('');
    try { await action(); if (bridge?.phoneStatus) setConnection(await bridge.phoneStatus()); }
    catch (e) { setError(String(e).replace(/^Error: /, '')); }
    finally { setWorking(false); }
  }
  const invite = connection?.invite;
  const link = invite && invite.expires > now ? `${connection.url}/?phone=1#pair=${invite.token}` : '';
  return <section className="phone-setup">
    <div className="phone-setup-intro"><span className="eyebrow">YOUR LITTLE POCKET COMPANION</span><h2>Same Bebo.<br /><em>A little closer.</em></h2><p>Hold him on your phone. Speak, then release.<br />Watch your desktop get to work.</p>
      <div className="phone-preview-shell"><div className="phone-preview-island" /><span className="phone-preview-brand">bebo<span>.</span></span><BeboAvatar color={color} mood="idle" label="Bebo phone preview" /><p>Hold. Speak. Release.</p><span className="phone-preview-caption">Phone screen preview</span></div>
      <div className="phone-setup-details"><span><Smartphone size={15} /> iPhone & Android</span><span><Link2 size={15} /> At home or away</span></div>
    </div>
    <div className="phone-setup-steps"><span className="eyebrow">BRING BEBO ALONG</span><h2>Your phone is the remote.</h2><p className="phone-setup-copy">Your laptop does the work. Keep it awake, connected to the internet, and running Bebo.</p>
      {!bridge?.phoneStart ? <div className="phone-setup-empty"><Smartphone size={28} /><h3>Pair from the Windows app</h3><p>Open the latest Bebo desktop app and choose Phone. Your pairing code will appear here.</p><a href="?phone=1">See the phone screen <ArrowUpRight size={14} /></a></div>
      : connection?.request ? <div className="phone-pair-request"><span className="step-count">A LITTLE INTRODUCTION</span><h3>Is this your phone?</h3><p>Check that this number matches the one on your phone.</p><strong className="pair-match-code">{connection.request.code}</strong><span className="pair-device-name">{connection.request.name}</span><button className="primary-button full" disabled={working} onClick={() => change(() => bridge.phoneDecide?.(connection.request!.id, true))}><Check size={17} /> Yes, pair this phone</button><button className="text-button" disabled={working} onClick={() => change(() => bridge.phoneDecide?.(connection.request!.id, false))}>That isn’t my phone</button></div>
      : connection?.device ? <div className="phone-paired"><span className="phone-paired-icon"><Check size={26} /></span><h3>Your phone is remembered.</h3><p>{connection.device.name} can now talk to Bebo and approve desktop steps.</p><span className="phone-session-note">Registered until you forget this phone</span>{connection.enabled && connection.url && <details className="phone-reconnect"><summary>Open on my registered phone</summary><p>Scan to reconnect. No matching-code verification needed. Keep this QR private.</p>{connection.reconnectToken && <div className="phone-qr"><QRCodeSVG value={`${connection.url}/?phone=1#resume=${connection.reconnectToken}`} size={170} level="M" marginSize={2} title="Reconnect your registered phone" /></div>}</details>}<button className="text-button" disabled={working} onClick={() => change(() => bridge.phoneRevoke?.())}><Unplug size={15} /> Forget this phone</button></div>
      : link ? <div className="phone-qr-block"><div className="phone-qr"><QRCodeSVG value={link} size={192} level="M" marginSize={2} title="Scan to pair your phone with Bebo" /></div><p className="phone-manual-code">Or enter <b>{invite!.code.slice(0,5)}-{invite!.code.slice(5)}</b></p><h3>Say hello from your phone.</h3><p>Scan with your camera, open in Safari,<br />then confirm the matching number here.</p><div className="phone-qr-actions"><button className="text-button" onClick={async () => { try { await navigator.clipboard.writeText(link); setCopied(true); setTimeout(() => setCopied(false), 2000); } catch { setError('Clipboard unavailable. Scan the QR code instead.'); } }}>{copied ? <Check size={14} /> : <Copy size={14} />}{copied ? 'Copied' : 'Copy pairing link'}</button><span>Expires in {Math.max(1, Math.ceil((invite!.expires - now) / 60000))} min</span></div></div>
      : <div className="phone-start"><div className="phone-start-icon"><Link2 size={26} /></div><h3>A secure little connection.</h3><p>Create a private pairing invitation, then scan it with your phone.</p><button className="primary-button" disabled={working || connection?.starting} onClick={() => change(() => connection?.enabled ? bridge.phoneRefresh?.() : bridge.phoneStart?.())}>{working || connection?.starting ? <Loader2 size={17} className="phone-spin" /> : connection?.enabled ? <RefreshCw size={17} /> : <Smartphone size={17} />}{working || connection?.starting ? 'Creating secure link…' : connection?.enabled ? 'New pairing code' : 'Create phone link'}</button></div>}
      {(error || connection?.error) && <p className="phone-error" role="alert">{error || connection?.error}</p>}
      {connection?.enabled && <button className="phone-end-link" disabled={working} onClick={() => change(() => bridge?.phoneStop?.())}>Turn off phone access</button>}
      <div className="phone-trust-note"><ShieldCheck size={18} /><p>Only a phone you confirm here can give Bebo requests. Your desktop permission settings apply to phone requests. Turn off access at any time.</p></div>
      <p className="phone-provider-note">Uses an encrypted Cloudflare link. Your phone stays registered. This temporary link changes when Bebo restarts; use the reconnect QR to reopen it without verification. Voice recognition follows the model selected in Bebo Settings.</p>
    </div>
  </section>;
}
