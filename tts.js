/* JAPANESE FLUENCY 1000 · Kokoro Japanese TTS
   Browser-local synthesis. No API key, account, or usage billing.
   First use downloads the Kokoro model and Open JTalk Japanese dictionary. */
(function () {
  'use strict';

  const CDN = 'https://cdn.jsdelivr.net/npm/kokoro-js-jp@0.2.0/dist/kokoro-jp.web.js';
  const VOICE = 'jm_kumo';
  const DB_NAME = 'jp1000-kokoro-audio-v1';
  const STORE = 'clips';
  const MAX_CACHE_BYTES = 35 * 1024 * 1024;
  const memoryCache = new Map();
  let kokoroPromise = null;
  let audioContext = null;
  let activeSource = null;
  let activeButton = null;
  let loadMessage = '';

  const clean = value => String(value || '').replace(/\s+/g, ' ').trim();

  function setButtonState(button, state) {
    if (!button) return;
    button.dataset.state = state;
    button.textContent = state === 'loading' ? 'Kokoro 준비 중…' : state === 'playing' ? '■ 정지' : '🔊 듣기';
    button.setAttribute('aria-label', state === 'playing' ? '음성 정지' : 'Kokoro 일본어 음성 듣기');
  }

  function stop() {
    if (activeSource) {
      try { activeSource.stop(); } catch (_) {}
      activeSource = null;
    }
    if (activeButton) setButtonState(activeButton, 'idle');
    activeButton = null;
  }

  function openDB() {
    return new Promise((resolve, reject) => {
      if (!('indexedDB' in window)) return resolve(null);
      const request = indexedDB.open(DB_NAME, 1);
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE, { keyPath: 'text' });
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => resolve(null);
    });
  }

  async function readCachedBlob(text) {
    if (memoryCache.has(text)) return memoryCache.get(text);
    const db = await openDB();
    if (!db) return null;
    return new Promise(resolve => {
      try {
        const tx = db.transaction(STORE, 'readonly');
        const req = tx.objectStore(STORE).get(text);
        req.onsuccess = () => {
          const item = req.result;
          if (item && item.blob) {
            item.usedAt = Date.now();
            memoryCache.set(text, item.blob);
            resolve(item.blob);
          } else resolve(null);
        };
        req.onerror = () => resolve(null);
      } catch (_) { resolve(null); }
    });
  }

  async function writeCachedBlob(text, blob) {
    memoryCache.set(text, blob);
    if (memoryCache.size > 20) memoryCache.delete(memoryCache.keys().next().value);
    const db = await openDB();
    if (!db) return;
    await new Promise(resolve => {
      try {
        const tx = db.transaction(STORE, 'readwrite');
        tx.objectStore(STORE).put({ text, blob, bytes: blob.size, usedAt: Date.now() });
        tx.oncomplete = resolve;
        tx.onerror = resolve;
        tx.onabort = resolve;
      } catch (_) { resolve(); }
    });
    // Keep the persistent audio cache bounded so repeated practice cannot grow it indefinitely.
    try {
      const tx = db.transaction(STORE, 'readwrite');
      const store = tx.objectStore(STORE);
      const all = store.getAll();
      all.onsuccess = () => {
        const rows = (all.result || []).sort((a, b) => (a.usedAt || 0) - (b.usedAt || 0));
        let total = rows.reduce((sum, row) => sum + (row.bytes || row.blob?.size || 0), 0);
        for (const row of rows) {
          if (total <= MAX_CACHE_BYTES) break;
          store.delete(row.text);
          total -= row.bytes || row.blob?.size || 0;
          memoryCache.delete(row.text);
        }
      };
    } catch (_) {}
  }

  async function getKokoro() {
    if (!kokoroPromise) {
      kokoroPromise = (async () => {
        loadMessage = '음성 엔진을 불러오는 중…';
        const module = await import(CDN);
        loadMessage = 'Kokoro 음성 모델을 준비하는 중…';
        return await module.KokoroJP.load();
      })().catch(error => {
        kokoroPromise = null;
        throw error;
      });
    }
    return kokoroPromise;
  }

  async function playText(rawText, button) {
    const text = clean(rawText);
    if (!text) { alert('재생할 일본어 문장을 찾지 못했습니다.'); return; }
    if (button && button.dataset.state === 'playing') { stop(); return; }
    stop();

    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) { alert('이 브라우저는 오디오 재생을 지원하지 않습니다.'); return; }
    if (!audioContext) audioContext = new AudioCtx();
    try { await audioContext.resume(); } catch (_) {}

    activeButton = button;
    setButtonState(button, 'loading');
    try {
      let blob = await readCachedBlob(text);
      if (!blob) {
        const tts = await getKokoro();
        const result = await tts.speak(text, VOICE);
        blob = result.toBlob();
        if (!(blob instanceof Blob) || !blob.size) throw new Error('Kokoro가 음성 파일을 만들지 못했습니다.');
        await writeCachedBlob(text, blob);
      }
      const bytes = await blob.arrayBuffer();
      const buffer = await audioContext.decodeAudioData(bytes.slice(0));
      const source = audioContext.createBufferSource();
      source.buffer = buffer;
      source.connect(audioContext.destination);
      activeSource = source;
      source.onended = () => {
        if (activeSource === source) activeSource = null;
        if (activeButton === button) { setButtonState(button, 'idle'); activeButton = null; }
      };
      setButtonState(button, 'playing');
      source.start(0);
    } catch (error) {
      setButtonState(button, 'idle');
      activeButton = null;
      const message = error && error.message ? error.message : String(error);
      alert('Kokoro 음성 생성 실패\n' + message + '\n\n인터넷 연결과 Safari 최신 버전을 확인해 주세요.');
    }
  }

  function japaneseText(element) {
    const clone = element.cloneNode(true);
    clone.querySelectorAll('.gemini-tts-button, .kokoro-tts-button, button, script, style').forEach(node => node.remove());
    clone.querySelectorAll('ruby').forEach(ruby => {
      const rt = ruby.querySelector('rt');
      ruby.replaceWith(document.createTextNode(rt ? rt.textContent : ruby.textContent));
    });
    return clean(clone.textContent);
  }

  function addButton(target, text) {
    if (!target || target.querySelector(':scope > .gemini-tts-button')) return;
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'gemini-tts-button kokoro-tts-button'; // Reuse v8 button styling.
    button.textContent = '🔊 듣기';
    button.dataset.state = 'idle';
    button.addEventListener('click', event => {
      event.preventDefault();
      event.stopPropagation();
      playText(text, button);
    });
    target.appendChild(button);
  }

  function decorate() {
    document.querySelectorAll('.jp').forEach(element => {
      const text = japaneseText(element);
      if (text) addButton(element, text);
    });
    document.querySelectorAll('.word b').forEach(element => {
      const text = japaneseText(element);
      if (text) addButton(element.parentElement, text);
    });
    document.querySelectorAll('#dialogue').forEach(element => {
      if (element.dataset.kokoroButtonAdded === '1') return;
      const lines = (element.textContent || '').split('\n')
        .map(line => line.replace(/^[^:：]{1,12}[:：]\s*/, '').trim())
        .filter(Boolean);
      if (!lines.length) return;
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'gemini-tts-button dialogue-tts kokoro-tts-button';
      button.textContent = '🔊 회화 듣기';
      button.addEventListener('click', () => playText(lines.join('\n'), button));
      element.insertAdjacentElement('afterend', button);
      element.dataset.kokoroButtonAdded = '1';
    });
  }

  // Existing inline say(...) lesson controls now use Kokoro.
  window.say = function (text) { playText(text, null); };
  window.geminiSpeak = function (text, button) { playText(text, button); };
  window.kokoroSpeak = function (text, button) { playText(text, button); };

  document.addEventListener('DOMContentLoaded', decorate);
  if (document.readyState !== 'loading') decorate();

  const testButton = document.getElementById('testTTS');
  if (testButton) {
    testButton.textContent = 'Kokoro 일본어 음성 테스트';
    testButton.addEventListener('click', () => {
      playText('こんにちは。今日はいい天気ですね。', testButton);
    });
  }
})();
