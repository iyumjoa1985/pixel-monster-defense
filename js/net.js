// ============================================================
// 친구 연결 모듈 (PeerJS 사용)
// - 방장: Net.host(code, handlers)  → 친구가 들어오길 기다림
// - 친구: Net.join(code, handlers)  → 방장에게 연결
// - 보내기: Net.send(obj)   받기: handlers.onData(obj)
// 두 브라우저가 직접 연결(WebRTC)되고, 처음 소개만 무료 공개 서버(0.peerjs.com)가 해줍니다.
// ============================================================

const Net = (() => {
  const PREFIX = 'pmd-';                     // 다른 앱과 방 코드가 겹치지 않게 붙이는 접두어
  const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // 헷갈리는 0/O, 1/I 는 뺌
  let peer = null, conn = null, role = 'solo', code = '', handlers = {}, connected = false;

  function makeCode() {
    let s = '';
    for (let i = 0; i < 4; i++) s += CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)];
    return s;
  }
  function normalizeCode(s) {
    return String(s || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 4);
  }
  const available = () => typeof Peer !== 'undefined';

  function errorMessage(err) {
    const type = err && err.type;
    if (type === 'peer-unavailable') return '그 코드의 방을 찾을 수 없어요. 코드를 다시 확인해 주세요.';
    if (type === 'unavailable-id') return '이미 쓰고 있는 코드예요. 다시 만들어 볼게요.';
    if (type === 'network' || type === 'server-error' || type === 'socket-error' || type === 'socket-closed') return '연결 서버에 닿을 수 없어요. 인터넷을 확인해 주세요.';
    if (type === 'browser-incompatible') return '이 브라우저는 친구 연결을 지원하지 않아요.';
    return '연결 중 문제가 생겼어요: ' + (err && err.message ? err.message : err);
  }

  function cleanup() {
    connected = false;
    if (conn) { try { conn.close(); } catch (e) { /* 무시 */ } conn = null; }
    if (peer) { try { peer.destroy(); } catch (e) { /* 무시 */ } peer = null; }
  }

  function wireConn(c) {
    conn = c;
    c.on('open', () => {
      connected = true;
      if (handlers.onConnected) handlers.onConnected();
    });
    c.on('data', (data) => {
      if (handlers.onData) handlers.onData(data);
    });
    c.on('close', () => {
      const was = connected;
      connected = false;
      conn = null;
      if (was && handlers.onDisconnected) handlers.onDisconnected();
    });
    c.on('error', (err) => {
      if (handlers.onError) handlers.onError(errorMessage(err));
    });
  }

  // 방 만들기 (방장)
  function host(h, wantedCode) {
    if (!available()) { if (h.onError) h.onError('연결 도구를 불러오지 못했어요. 인터넷을 확인해 주세요.'); return null; }
    cleanup();
    handlers = h;
    role = 'host';
    code = wantedCode || makeCode();
    peer = new Peer(PREFIX + code, { debug: 0 });
    peer.on('open', () => { if (handlers.onReady) handlers.onReady(code); });
    peer.on('connection', (c) => {
      if (conn && connected) { try { c.close(); } catch (e) { /* 자리 없음 */ } return; } // 2명만
      wireConn(c);
    });
    peer.on('error', (err) => {
      if (err && err.type === 'unavailable-id') { host(h); return; } // 코드가 겹치면 새 코드로
      if (handlers.onError) handlers.onError(errorMessage(err));
    });
    peer.on('disconnected', () => { try { peer.reconnect(); } catch (e) { /* 무시 */ } });
    return code;
  }

  // 방 들어가기 (친구)
  function join(h, inputCode) {
    if (!available()) { if (h.onError) h.onError('연결 도구를 불러오지 못했어요. 인터넷을 확인해 주세요.'); return null; }
    const c = normalizeCode(inputCode);
    if (c.length !== 4) { if (h.onError) h.onError('방 코드는 영문·숫자 4글자예요.'); return null; }
    cleanup();
    handlers = h;
    role = 'guest';
    code = c;
    peer = new Peer({ debug: 0 });
    peer.on('open', () => {
      const dc = peer.connect(PREFIX + c, { reliable: true, serialization: 'json' });
      wireConn(dc);
    });
    peer.on('error', (err) => { if (handlers.onError) handlers.onError(errorMessage(err)); });
    return c;
  }

  function send(obj) {
    if (conn && connected) { try { conn.send(obj); } catch (e) { /* 무시 */ } }
  }
  function leave() {
    cleanup();
    role = 'solo';
    code = '';
  }

  return {
    host, join, send, leave, available, normalizeCode,
    getRole: () => role, getCode: () => code, isConnected: () => connected,
  };
})();
