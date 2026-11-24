JAPANESE FLUENCY 1000 · Gemini TTS v4

적용 방법
1. ZIP 압축을 풉니다.
2. GitHub 저장소에서 기존 파일을 모두 새 파일로 교체합니다.
   - index.html
   - app.js
   - lessons.js
   - lessons-data.js
   - lesson.html
   - day01.html ~ day04.html
   - 새 파일 tts.js
3. Commit changes 후 GitHub Pages가 갱신될 때까지 기다립니다.
4. 아이폰 Safari에서 홈페이지를 열고 설정 > 일본어 음성 테스트를 누릅니다.
5. 각 DAY 수업의 일본어 문장 옆 '듣기' 버튼으로 음성을 재생합니다.

음성 설정
- Gemini TTS 모델: gemini-3.8-flash-lite-tts
- Voice preset: Charon
- 언어: 일본어 표준어(ja-JP)
- 화자 스타일: 차분한 성인 남성, 자연스러운 일상 회화
- 속도: 보통
- Gemini AI 튜터용 모델 및 API Key 설정은 기존 값을 그대로 사용합니다.
- GitHub Gist 백업/복원 구조와 데이터 파일은 변경하지 않았습니다.

참고
- TTS는 기존에 저장한 Gemini API Key를 재사용하며, 키는 HTML/JS/Gist에 기록하지 않습니다.
- 생성 음성은 현재 페이지 메모리에 최대 30개까지 임시 캐시됩니다. 페이지를 닫으면 캐시는 사라집니다.
- TTS 모델 사용 가능 여부와 무료 등급/할당량은 Google AI Studio 계정 설정에 따릅니다.
- 기존 DAY 01~04의 브라우저 TTS 호출도 Gemini TTS로 전환했습니다.
