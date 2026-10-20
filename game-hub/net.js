/* EBLAN BOX — игра по сети: WebRTC (PeerJS), комната = код из 4 символов.
   Ник настраивается один раз и хранится на устройстве. */
const PEER_CDN = 'https://unpkg.com/peerjs@1.5.4/dist/peerjs.min.js';
const ABC = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
let peerLib = null;

function loadPeer() {
  if (window.Peer) return Promise.resolve(window.Peer);
  if (!peerLib) peerLib = new Promise((res, rej) => {
    const s = document.createElement('script');
    s.src = PEER_CDN; s.async = true;
    s.onload = () => (window.Peer ? res(window.Peer) : rej(new Error('peerjs не встал')));
    s.onerror = () => rej(new Error('нет связи с CDN PeerJS'));
    document.head.appendChild(s);
  });
  return peerLib;
}
const newCode = () => Array.from({ length: 4 }, () => ABC[Math.floor(Math.random() * ABC.length)]).join('');
const normCode = c => (c || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 4);

function makeSession(side, code, game, peer, cb) {
  let conn = null;
  const handlers = new Set();
  const sess = {
    side, code, game,
    peerNick: '',
    get connected() { return !!conn && conn.open; },
    send(o) { if (conn && conn.open) conn.send(JSON.stringify(o)); },
    onMsg(fn) { handlers.add(fn); return () => handlers.delete(fn); },
    close() { try { conn && conn.close(); peer.destroy(); } catch {} },
    attach(c) {
      conn = c;
      c.on('open', () => c.send(JSON.stringify({ t: 'hi', nick: Net.nick(), game })));
      c.on('data', d => {
        let m; try { m = JSON.parse(d); } catch { return; }
        if (m.t === 'hi') {
          if (m.game !== game) { cb({ st: 'err', msg: 'у соперника другая игра' }); sess.close(); return; }
          sess.peerNick = m.nick || 'соперник';
          cb({ st: 'ok', nick: sess.peerNick });
          return;
        }
        handlers.forEach(fn => fn(m));
      });
      c.on('close', () => cb({ st: 'bye' }));
      c.on('error', () => cb({ st: 'bye' }));
    },
  };
  return sess;
}

export const Net = {
  nick: () => { try { return localStorage.getItem('net_nick') || ''; } catch { return ''; } },
  setNick(n) { try { localStorage.setItem('net_nick', n); } catch {} },

  /* создать комнату; cb({st:'wait',code} | {st:'ok',nick} | {st:'err',msg} | {st:'bye'}) */
  async host(game, cb) {
    const Peer = await loadPeer();
    const code = newCode();
    const peer = new Peer('eblanbox-' + code);
    const sess = makeSession('host', code, game, peer, cb);
    peer.on('open', () => cb({ st: 'wait', code }));
    peer.on('connection', c => sess.attach(c));
    peer.on('disconnected', () => { try { peer.reconnect(); } catch {} });
    peer.on('error', e => cb({ st: 'err', msg: String(e && e.type || e) }));
    return sess;
  },

  /* войти по коду */
  async join(game, rawCode, cb) {
    const Peer = await loadPeer();
    const code = normCode(rawCode);
    if (code.length < 4) throw new Error('код из 4 символов');
    const peer = new Peer();
    const sess = makeSession('guest', code, game, peer, cb);
    peer.on('open', () => {
      const c = peer.connect('eblanbox-' + code, { reliable: true });
      sess.attach(c);
      setTimeout(() => { if (!sess.connected) cb({ st: 'err', msg: 'комната не найдена' }); }, 9000);
    });
    peer.on('error', e => cb({ st: 'err', msg: String(e && e.type || e) }));
    return sess;
  },
};
