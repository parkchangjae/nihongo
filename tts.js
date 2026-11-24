/* JAPANESE FLUENCY 1000 · Gemini TTS
   Uses the existing Gemini API key stored by app.js. No key is written to files or Gist. */
(function(){
  'use strict';
  const API_KEY_NAME='jp1000_gemini_key';
  const MODEL='gemini-3.8-flash-lite-tts';
  const VOICE='Charon'; // calm, informative masculine voice preset
  const STYLE='Speak in natural standard Japanese (Tokyo Japanese). Use a calm, clear adult male voice, like a friendly Japanese man speaking in an everyday conversation. Normal conversational speed, natural pauses, no exaggerated anime acting, no announcer delivery. Pronounce the Japanese transcript accurately.';
  const cache=new Map();
  let activeSource=null, activeContext=null, activeButton=null;
  const clean=s=>(s||'').replace(/\s+/g,' ').trim();
  function getKey(){try{return localStorage.getItem(API_KEY_NAME)||''}catch(e){return ''}}
  function japaneseText(el){
    const clone=el.cloneNode(true);
    clone.querySelectorAll('.gemini-tts-button,button,script,style').forEach(x=>x.remove());
    clone.querySelectorAll('ruby').forEach(r=>{const rt=r.querySelector('rt');const spoken=rt?rt.textContent:r.textContent;r.replaceWith(document.createTextNode(spoken));});
    return clean(clone.textContent);
  }
  function setButtonState(btn,state){
    if(!btn)return;
    btn.dataset.state=state;
    btn.textContent=state==='loading'?'생성 중…':state==='playing'?'■ 정지':'🔊 듣기';
    btn.setAttribute('aria-label',state==='playing'?'음성 정지':'Gemini 일본어 음성 듣기');
  }
  function stop(){
    if(activeSource){try{activeSource.stop()}catch(e){} activeSource=null;}
    if(activeButton){setButtonState(activeButton,'idle');activeButton=null;}
  }
  async function playText(text,button){
    text=clean(text);
    if(!text){alert('재생할 일본어 문장을 찾지 못했습니다.');return}
    if(button&&button.dataset.state==='playing'){stop();return}
    stop();
    const key=getKey();
    if(!key){alert('홈페이지 설정에서 Gemini API Key를 먼저 저장해 주세요.');return}
    setButtonState(button,'loading');activeButton=button;
    try{
      const AudioCtx=window.AudioContext||window.webkitAudioContext;
      if(!AudioCtx)throw new Error('이 브라우저는 오디오 재생을 지원하지 않습니다.');
      if(!activeContext)activeContext=new AudioCtx();
      await activeContext.resume();
      let buffer=cache.get(text);
      if(!buffer){
        const endpoint='https://generativelanguage.googleapis.com/v1beta/models/'+MODEL+':generateContent?key='+encodeURIComponent(key);
        const body={contents:[{role:'user',parts:[{text:STYLE+'\n\nTranscript:\n'+text}]}],generationConfig:{responseModalities:['AUDIO'],speechConfig:{voiceConfig:{prebuiltVoiceConfig:{voiceName:VOICE}}}}};
        const response=await fetch(endpoint,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
        const data=await response.json();
        if(!response.ok)throw new Error(data.error?.message||('Gemini TTS 오류 '+response.status));
        const part=(data.candidates?.[0]?.content?.parts||[]).find(p=>p.inlineData?.data);
        if(!part)throw new Error('Gemini가 음성 데이터를 반환하지 않았습니다. TTS 모델 사용 가능 여부와 API 할당량을 확인해 주세요.');
        const binary=atob(part.inlineData.data),bytes=new Uint8Array(binary.length);
        for(let i=0;i<binary.length;i++)bytes[i]=binary.charCodeAt(i);
        buffer=await activeContext.decodeAudioData(bytes.buffer);
        if(cache.size>=30)cache.delete(cache.keys().next().value);
        cache.set(text,buffer);
      }
      const source=activeContext.createBufferSource();source.buffer=buffer;source.connect(activeContext.destination);activeSource=source;
      source.onended=()=>{if(activeSource===source){activeSource=null;if(activeButton){setButtonState(activeButton,'idle');activeButton=null;}}};
      setButtonState(button,'playing');source.start(0);
    }catch(error){setButtonState(button,'idle');activeButton=null;alert('Gemini 음성 생성 실패\n'+error.message);}
  }
  function addButton(target,text){
    if(target.querySelector(':scope > .gemini-tts-button'))return;
    const btn=document.createElement('button');btn.type='button';btn.className='gemini-tts-button';btn.textContent='🔊 듣기';btn.dataset.state='idle';
    btn.addEventListener('click',e=>{e.preventDefault();e.stopPropagation();playText(text,btn)});
    target.appendChild(btn);
  }
  function decorate(){
    document.querySelectorAll('.jp').forEach(el=>{
      const text=japaneseText(el);if(text)addButton(el,text);
    });
    document.querySelectorAll('.word b').forEach(el=>{
      const text=japaneseText(el);if(text)addButton(el.parentElement,text);
    });
    // Japanese dialogue and Japanese-only text lines on the newer generated lesson template.
    document.querySelectorAll('#dialogue').forEach(el=>{
      const lines=(el.textContent||'').split('\n').map(x=>x.replace(/^[^:：]{1,12}[:：]\s*/,'' )).filter(Boolean);
      if(lines.length){const btn=document.createElement('button');btn.type='button';btn.className='gemini-tts-button dialogue-tts';btn.textContent='🔊 회화 듣기';btn.addEventListener('click',()=>playText(lines.join('\n'),btn));el.insertAdjacentElement('afterend',btn);}
    });
  }
  // Existing DAY 01–04 inline say(...) buttons now use Gemini instead of browser TTS.
  window.say=function(text){playText(text,null)};
  window.geminiSpeak=(text,button)=>playText(text,button);
  document.addEventListener('DOMContentLoaded',decorate);
  if(document.readyState!=='loading')decorate();
  const test=document.getElementById('testTTS');
  if(test)test.addEventListener('click',async()=>{
    const key=getKey();if(!key){alert('Gemini API Key를 먼저 저장해 주세요.');return;}
    await playText('こんにちは。今日はいい天気ですね。',test);
  });
})();
