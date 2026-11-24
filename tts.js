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
  // iOS Safari keeps media permission per audio element. Reuse ONE element.
  const sharedAudio = new Audio();
  const SILENT_WAV = 'data:audio/wav;base64,UklGRkQDAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YSADAACAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgA==';
  let audioUnlocked = false;
  let activeObjectUrl = null;
  let playbackTimer = null;
  let playbackRunId = 0;
  let statusNode = null;
  let activeButton = null;
  let loadMessage = '';

  const clean = value => String(value || '').replace(/\s+/g, ' ').trim();

  function setButtonState(button, state) {
    if (!button) return;
    button.dataset.state = state;
    button.textContent = state === 'loading' ? 'Kokoro 준비 중…' : state === 'playing' ? '■ 정지' : '🔊 듣기';
    button.setAttribute('aria-label', state === 'playing' ? '음성 정지' : 'Kokoro 일본어 음성 듣기');
  }

  function showStatus(message) {
    if (!statusNode) {
      statusNode = document.createElement('div');
      statusNode.id = 'kokoro-debug-status';
      statusNode.style.cssText = 'position:fixed;z-index:99999;left:12px;right:12px;bottom:12px;padding:12px 14px;border-radius:12px;background:#17202b;color:#fff;font:13px/1.5 -apple-system,BlinkMacSystemFont,sans-serif;box-shadow:0 4px 18px #0005;white-space:pre-wrap;';
      document.body.appendChild(statusNode);
    }
    statusNode.textContent = 'Kokoro 진단: ' + message;
    statusNode.style.display = 'block';
  }

  function stop() {
    playbackRunId++;
    if (playbackTimer) { clearTimeout(playbackTimer); playbackTimer = null; }
    try { sharedAudio.pause(); } catch (_) {}
    sharedAudio.onended = null;
    sharedAudio.onerror = null;
    if (activeObjectUrl) { try { URL.revokeObjectURL(activeObjectUrl); } catch (_) {} activeObjectUrl = null; }
    if (activeButton) setButtonState(activeButton, 'idle');
    activeButton = null;
  }

  // Must be called synchronously from the actual tap handler, before any await.
  function unlockAudioFromGesture() {
    if (audioUnlocked) return;
    try {
      if ('audioSession' in navigator) navigator.audioSession.type = 'playback';
      sharedAudio.src = SILENT_WAV;
      sharedAudio.load();
      const unlock = sharedAudio.play();
      if (unlock && typeof unlock.then === 'function') {
        unlock.then(() => {
          audioUnlocked = true;
          sharedAudio.pause();
          try { sharedAudio.currentTime = 0; } catch (_) {}
          showStatus('오디오 출력 잠금 해제 완료. 음성 모델 준비 중…');
        }).catch(error => showStatus('오디오 잠금 해제 실패: ' + (error.message || error)));
      }
    } catch (error) {
      showStatus('오디오 초기화 실패: ' + (error.message || error));
    }
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

  // Split only at natural Japanese phrase boundaries. The model still speaks
  // each phrase; short gaps are added between phrases to avoid one long run-on.
  function splitConversationalText(text) {
    return (text.match(/[^、。！？\n]+[、。！？]?/g) || [text])
      .map(part => part.trim()).filter(Boolean);
  }

  function pauseAfter(part) {
    if (/[。！？]$/.test(part)) return /[！？]$/.test(part) ? 390 : 320;
    if (/、$/.test(part)) return 135;
    return 0;
  }

  async function playText(rawText, button) {
    const text = clean(rawText);
    if (!text) { showStatus('재생할 일본어 문장을 찾지 못했습니다.'); return; }
    if (button && button.dataset.state === 'playing') { stop(); showStatus('재생을 정지했습니다.'); return; }
    stop();
    // Critical for iPhone Safari: unlock the SAME audio element during the tap,
    // not a newly-created Audio() after model synthesis has awaited.
    unlockAudioFromGesture();

    const runId = playbackRunId;
    activeButton = button;
    setButtonState(button, 'loading');
    showStatus('1/4 버튼 입력 확인 · 자연스러운 문장 단위로 준비 중…');
    try {
      const tts = await getKokoro();
      const phrases = splitConversationalText(text);
      const clips = [];
      for (let i = 0; i < phrases.length; i++) {
        if (runId !== playbackRunId) return;
        const phrase = phrases[i];
        // A versioned key keeps old single-block cache entries separate.
        const cacheKey = 'conversation-v1:' + phrase;
        let blob = await readCachedBlob(cacheKey);
        if (!blob) {
          showStatus(`2/4 음성 생성 중… (${i + 1}/${phrases.length})`);
          const result = await tts.speak(phrase, VOICE);
          blob = result.toBlob();
          if (!(blob instanceof Blob) || !blob.size) throw new Error('Kokoro가 음성 파일을 만들지 못했습니다.');
          await writeCachedBlob(cacheKey, blob);
        }
        clips.push({ blob, pause: pauseAfter(phrase) });
      }
      if (runId !== playbackRunId) return;
      showStatus(`3/4 음성 준비 완료 · ${clips.length}개 의미 단위 · 자연스러운 쉼 적용`);
      setButtonState(button, 'playing');

      let index = 0;
      const playNext = () => {
        if (runId !== playbackRunId) return;
        if (index >= clips.length) {
          if (activeButton === button) { setButtonState(button, 'idle'); activeButton = null; }
          showStatus('재생 완료.');
          return;
        }
        const clip = clips[index++];
        if (activeObjectUrl) { try { URL.revokeObjectURL(activeObjectUrl); } catch (_) {} }
        activeObjectUrl = URL.createObjectURL(clip.blob);
        sharedAudio.pause();
        sharedAudio.src = activeObjectUrl;
        sharedAudio.preload = 'auto';
        sharedAudio.onended = () => {
          if (activeObjectUrl) { try { URL.revokeObjectURL(activeObjectUrl); } catch (_) {} activeObjectUrl = null; }
          if (clip.pause > 0 && index < clips.length) {
            playbackTimer = setTimeout(() => { playbackTimer = null; playNext(); }, clip.pause);
          } else playNext();
        };
        sharedAudio.onerror = () => {
          const mediaError = sharedAudio.error;
          showStatus(`4/4 오디오 디코딩 실패 · 코드 ${mediaError ? mediaError.code : '알 수 없음'} · ${clip.blob.size} bytes`);
          setButtonState(button, 'idle');
          activeButton = null;
        };
        sharedAudio.onloadedmetadata = () => {
          if (index === 1) showStatus(`4/4 재생 준비 완료 · ${clips.length}개 구간 · 자연스러운 쉼 적용`);
        };
        sharedAudio.load();
        const playPromise = sharedAudio.play();
        if (playPromise && typeof playPromise.catch === 'function') {
          playPromise.catch(error => {
            showStatus('재생 오류: ' + (error.message || error));
            setButtonState(button, 'idle');
            activeButton = null;
          });
        }
      };
      playNext();
    } catch (error) {
      setButtonState(button, 'idle');
      activeButton = null;
      const message = error && error.message ? error.message : String(error);
      showStatus('오류: ' + message);
      console.error('[Kokoro TTS]', error);
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
