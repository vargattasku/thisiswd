/* ============================================================
   og-card.html → image/og-card.png (카카오톡·SNS 미리보기 카드)

       node og-shot.js

   크롬을 --screenshot 인자로 띄우는 방법은 이미 떠 있는 크롬과 프로필이
   부딪혀 간헐적으로 아무것도 만들지 않고 끝난다(print/shot.js 에도 같은 메모).
   그래서 print/ 에 설치된 puppeteer-core 로 붙는다.

   ※ 카카오톡은 한 번 읽은 미리보기를 캐시한다. 이미지를 바꾼 뒤에는
     https://developers.kakao.com/tool/debugger/sharing 에서 캐시를 지워야 반영된다.
   ============================================================ */
'use strict';

const fs   = require('fs');
const path = require('path');
const url  = require('url');

const HERE = __dirname;
const SRC  = path.join(HERE, 'og-card.html');
const OUT  = path.join(HERE, 'image', 'og-card.png');

/* og:image:width / height 는 index.html 에 2400x1260 으로 적혀 있다.
   1200x630 을 deviceScaleFactor 2 로 찍은 값이므로 둘을 함께 고쳐야 한다 */
const W = 1200, H = 630, SCALE = 2;

function findChrome(){
  const candidates = [
    path.join(process.env['ProgramFiles']      || '', 'Google/Chrome/Application/chrome.exe'),
    path.join(process.env['ProgramFiles(x86)'] || '', 'Google/Chrome/Application/chrome.exe'),
    path.join(process.env['LOCALAPPDATA']      || '', 'Google/Chrome/Application/chrome.exe'),
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/usr/bin/google-chrome',
  ];
  const hit = candidates.find(p => p && fs.existsSync(p));
  if(!hit) throw new Error('Chrome 을 찾지 못했습니다. 위 candidates 에 경로를 추가해 주세요.');
  return hit;
}

/* puppeteer-core 는 print/ 아래에만 설치돼 있다 */
const PUPPETEER = path.join(HERE, 'print', 'node_modules', 'puppeteer-core', 'lib', 'puppeteer', 'puppeteer-core.js');

(async function(){
  if(!fs.existsSync(PUPPETEER)){
    throw new Error('puppeteer-core 가 없습니다. print 폴더에서 npm install 을 먼저 실행해 주세요.');
  }
  const puppeteer = await import(url.pathToFileURL(PUPPETEER).href);
  const browser = await puppeteer.launch({
    executablePath: findChrome(),
    headless: true,
    args: ['--no-sandbox', '--hide-scrollbars'],
  });
  try{
    const page = await browser.newPage();
    await page.setViewport({ width:W, height:H, deviceScaleFactor:SCALE });
    await page.goto(url.pathToFileURL(SRC).href, { waitUntil:'networkidle0', timeout:180000 });
    await page.evaluateHandle('document.fonts.ready');   /* 글꼴이 도착하기 전에 찍히지 않게 */
    await page.screenshot({ path:OUT, type:'png' });
    console.log(`완료  image/og-card.png  ${W * SCALE}x${H * SCALE}`);
  }finally{
    await browser.close();
  }
})().catch(err => { console.error(err); process.exit(1); });
