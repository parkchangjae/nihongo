(function(){
  'use strict';
  const $ = id => document.getElementById(id);
  const KEYS={gemini:'jp1000_gemini_key',model:'jp1000_gemini_model',token:'jp1000_github_token',gist:'jp1000_gist_id',cloudTts:'jp1000_cloud_tts_key',ttsEngine:'jp1000_tts_engine',extra:'jp1000_learning_data'};
  const modal=$('settingsModal'), messages=$('aiMessages');
  function read(k){try{return localStorage.getItem(k)||''}catch(e){return ''}}
  function write(k,v){try{localStorage.setItem(k,v);return true}catch(e){return false}}
  function settings(){return {key:read(KEYS.gemini),model:read(KEYS.model)||'gemini-3.5-flash-lite',token:read(KEYS.token),gist:read(KEYS.gist),cloudTts:read(KEYS.cloudTts),ttsEngine:read(KEYS.ttsEngine)||'gemini'}}
  function setStatus(msg){$('aiStatus').textContent=msg}
  function showModal(){const s=settings();$('geminiKey').value=s.key;$('geminiModel').value=s.model;$('githubToken').value=s.token;$('gistId').value=s.gist;$('cloudTtsKey').value=s.cloudTts;$('ttsEngine').value=s.ttsEngine;modal.classList.add('open')}
  function hideModal(){modal.classList.remove('open')}
  function save(){const ok=[write(KEYS.gemini,$('geminiKey').value.trim()),write(KEYS.model,$('geminiModel').value.trim()||'gemini-3.5-flash-lite'),write(KEYS.token,$('githubToken').value.trim()),write(KEYS.gist,$('gistId').value.trim()),write(KEYS.cloudTts,$('cloudTtsKey').value.trim()),write(KEYS.ttsEngine,$('ttsEngine').value)].every(Boolean);setStatus(ok?'설정이 이 기기에 저장되었습니다.':'브라우저 저장 공간을 확인해 주세요.');return ok}
  function bubble(text,who){const d=document.createElement('div');d.className='bubble '+who;d.textContent=text;messages.appendChild(d);messages.scrollTop=messages.scrollHeight;return d}
  function getStudyData(){let completed=[];try{completed=JSON.parse(localStorage.getItem('japanese-study-completed-days')||'[]')}catch(e){}let extra={};try{extra=JSON.parse(read(KEYS.extra)||'{}')}catch(e){}return {schema:1,updatedAt:new Date().toISOString(),completedDays:completed,extra}}
  function setStudyData(data){if(Array.isArray(data.completedDays))write('japanese-study-completed-days',JSON.stringify(data.completedDays));if(data.extra&&typeof data.extra==='object')write(KEYS.extra,JSON.stringify(data.extra));}
  async function gemini(prompt){const s=settings();if(!s.key)throw new Error('설정에서 Gemini API 키를 먼저 저장해 주세요.');const url='https://generativelanguage.googleapis.com/v1beta/models/'+encodeURIComponent(s.model)+':generateContent?key='+encodeURIComponent(s.key);const body={systemInstruction:{parts:[{text:'당신은 한국인 학습자를 위한 전문 일본어 교사입니다. 완전 초보부터 고급 회화까지 단계적으로 가르칩니다. 설명은 한국어로 하되 일본어 예문에는 정확한 한자와 후리가나(가능하면 漢字（かんじ） 형식)를 제공하세요. 실제 일본인이 쓰는 자연스러운 표현과 교과서 표현의 차이를 설명하고, 불확실한 발음·악센트는 단정하지 마세요. 학습자가 답하면 틀린 부분을 부드럽게 교정하고 더 자연스러운 대안을 제시하세요.'}]},contents:[{role:'user',parts:[{text:prompt}]}],generationConfig:{temperature:0.65,maxOutputTokens:1200}};
    const res=await fetch(url,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});const data=await res.json();if(!res.ok)throw new Error(data.error?.message||('Gemini API 오류 '+res.status));return (data.candidates?.[0]?.content?.parts||[]).map(x=>x.text||'').join('\n').trim()||'응답을 받지 못했습니다.';
  }
  $('openSettings').addEventListener('click',showModal);$('closeSettings').addEventListener('click',hideModal);$('saveSettings').addEventListener('click',()=>{if(save())bubble('설정을 저장했습니다. API 키와 토큰은 Gist 백업에 포함하지 않습니다.','ai')});
  modal.addEventListener('click',e=>{if(e.target===modal)hideModal()});
  $('aiForm').addEventListener('submit',async e=>{e.preventDefault();const prompt=$('aiInput').value.trim();if(!prompt)return;$('aiInput').value='';bubble(prompt,'user');const waiting=bubble('답변을 작성하고 있어요…','ai');$('aiSend').disabled=true;try{const answer=await gemini(prompt);waiting.textContent=answer;setStatus('Gemini 연결됨 · '+settings().model)}catch(err){waiting.textContent='오류: '+err.message;setStatus('Gemini 연결을 확인해 주세요.')}finally{$('aiSend').disabled=false;messages.scrollTop=messages.scrollHeight}});
  $('testGemini').addEventListener('click',async()=>{save();setStatus('Gemini 연결 확인 중…');try{const r=await gemini('일본어로 「안녕하세요」는 무엇인가요? 한 문장으로 답하세요.');setStatus('Gemini 연결 성공: '+r)}catch(e){setStatus('Gemini 연결 실패: '+e.message)}});
  async function githubRequest(method,url,body){const token=settings().token;if(!token)throw new Error('GitHub 토큰을 입력해 주세요.');const res=await fetch(url,{method,headers:{'Accept':'application/vnd.github+json','Authorization':'Bearer '+token,'X-GitHub-Api-Version':'2022-11-28','Content-Type':'application/json'},body:body?JSON.stringify(body):undefined});let data={};try{data=await res.json()}catch(e){}if(!res.ok)throw new Error(data.message||('GitHub API 오류 '+res.status));return data}
  $('testGist').addEventListener('click',async()=>{save();try{const id=settings().gist;if(!id)throw new Error('Gist ID를 입력해 주세요.');const g=await githubRequest('GET','https://api.github.com/gists/'+encodeURIComponent(id));setStatus('Gist 연결 성공: '+(g.description||g.id))}catch(e){setStatus('Gist 연결 실패: '+e.message)}});
  $('syncNow').addEventListener('click',async()=>{save();try{if(!window.JPStudySync)throw new Error('동기화 모듈을 불러오지 못했습니다.');await window.JPStudySync.backup();}catch(e){setStatus('백업 실패: '+e.message)}});
  $('restoreGist').addEventListener('click',async()=>{save();try{if(!window.JPStudySync)throw new Error('동기화 모듈을 불러오지 못했습니다.');await window.JPStudySync.restore();setStatus('Gist 복원 완료 · 화면을 새로고침해 주세요.')}catch(e){setStatus('복원 실패: '+e.message)}});
  document.addEventListener('jp-sync-status',e=>setStatus(e.detail));
  if(settings().key)setStatus('Gemini API 키가 저장되어 있습니다. 질문을 시작하세요.');
})();
