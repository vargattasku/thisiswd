/* ============================================================
   mockup*.html → 같은 이름의 .jpg (참고용 목업, 인쇄 파일 아님)

       cd print
       node shot.js                 mockup*.html 전부
       node shot.js mockup-spec     하나만

   캔버스 크기는 파일마다 다르므로 지정하지 않는다 — 불러온 뒤 body 실측값으로
   뷰포트를 다시 잡는다. HTML 쪽에서 크기를 바꿔도 이 파일은 고칠 필요가 없다.

   크롬을 --screenshot 인자로 띄우면 PNG 만 나오고, 이미 떠 있는 크롬과
   프로필이 부딪혀 간헐적으로 빈손으로 끝난다. 그래서 puppeteer 로 붙는다.
   ============================================================ */
'use strict';

const fs   = require('fs');
const path = require('path');

const HERE = __dirname;

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

const targets = process.argv.length > 2
  ? process.argv.slice(2).map(n => n.replace(/\.html$/, ''))
  : fs.readdirSync(HERE).filter(f => /^mockup.*\.html$/.test(f)).map(f => f.replace(/\.html$/, ''));

if(!targets.length) throw new Error('만들 mockup*.html 이 없습니다.');
for(const n of targets){
  if(!fs.existsSync(path.join(HERE, `${n}.html`))) throw new Error(`없는 파일: ${n}.html`);
}

(async function(){
  const puppeteer = await import('puppeteer-core');
  const browser = await puppeteer.launch({
    executablePath: findChrome(),
    headless: true,
    /* 봉투 연출에 backdrop-filter 를 쓰므로 GPU 를 끄면 흐림이 사라진다 */
    args: ['--no-sandbox', '--hide-scrollbars'],
  });
  try{
    for(const name of targets){
      const src = path.join(HERE, `${name}.html`);
      const page = await browser.newPage();
      try{
        await page.setViewport({ width:1200, height:900, deviceScaleFactor:2 });
        await page.goto('file:///' + src.replace(/\\/g, '/'), { waitUntil:'networkidle0', timeout:180000 });
        await page.evaluateHandle('document.fonts.ready');       /* 글꼴이 도착하기 전에 찍히지 않게 */

        /* body 실측값으로 뷰포트를 다시 잡는다 */
        const size = await page.evaluate(() => ({
          w: Math.ceil(document.body.scrollWidth),
          h: Math.ceil(document.body.scrollHeight),
        }));
        await page.setViewport({ width:size.w, height:size.h, deviceScaleFactor:2 });
        await page.evaluateHandle('document.fonts.ready');

        const out = path.join(HERE, `${name}.jpg`);
        await page.screenshot({ path:out, type:'jpeg', quality:92 });
        console.log(`완료  ${path.basename(out)}  ${size.w * 2}x${size.h * 2}`);
      }finally{
        await page.close();
      }
    }
  }finally{
    await browser.close();
  }
})().catch(err => { console.error(err); process.exit(1); });
