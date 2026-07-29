/* ============================================================
   엽서 앞/뒤 → JPG + 레이어 PSD 를 만든다.

       cd print
       npm install          (처음 한 번만)
       node build.js

   결과물 : postcard-front.jpg / .psd , postcard-back.jpg / .psd

   동작 방식
     1) Chrome 을 headless 로 띄워 postcard-*.html 을 1252x1819 로 캡처한다.
        ?only=레이어 로 한 겹씩 따로 찍고(배경 투명), 합본도 한 장 찍는다.
     2) 합본을 300DPI JPG 로 저장한다.
     3) 따로 찍은 겹들을 ag-psd 로 쌓아 레이어 PSD 로 저장한다.
   ============================================================ */
'use strict';

const fs   = require('fs');
const path = require('path');
const { execFileSync, execSync } = require('child_process');
const { PNG }      = require('pngjs');
const { writePsd } = require('ag-psd');

const DPI = 300;

const HERE = __dirname;
const TMP  = path.join(HERE, '.build');

const GUIDE = { key:'guide', name:'가이드(재단·안전·접는선) — 인쇄 전 삭제', hidden:true };

/* 시트별 크기와 레이어. 레이어는 아래에서 위로 쌓이는 순서로 적는다.
     엽서    : 106x154mm(도련 포함) = 1252x1819
     반접지  : 216x146mm(도련 포함) = 2551x1724 */
const SHEETS = {
  'postcard-front': { w:1252, h:1819, layers:[
    { key:'bg', name:'배경' }, { key:'ribbon', name:'코너 리본' },
    { key:'photo', name:'사진' }, { key:'text', name:'글자' }, GUIDE ] },

  'postcard-back':  { w:1252, h:1819, layers:[
    { key:'bg', name:'배경' }, { key:'ribbon', name:'코너 리본' },
    { key:'text', name:'글자' }, GUIDE ] },

  'fold-outside':   { w:2551, h:1724, layers:[
    { key:'bg', name:'배경' }, { key:'ribbon', name:'코너 리본' },
    { key:'text', name:'글자' }, GUIDE ] },

  'fold-inside':    { w:2551, h:1724, layers:[
    { key:'bg', name:'배경' }, { key:'ribbon', name:'코너 리본' },
    { key:'text', name:'글자' }, GUIDE ] },
};

/* ── Chrome 찾기 ── */
function findChrome(){
  const candidates = [
    path.join(process.env['ProgramFiles']       || '', 'Google/Chrome/Application/chrome.exe'),
    path.join(process.env['ProgramFiles(x86)']  || '', 'Google/Chrome/Application/chrome.exe'),
    path.join(process.env['LOCALAPPDATA']       || '', 'Google/Chrome/Application/chrome.exe'),
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/usr/bin/google-chrome',
  ];
  const hit = candidates.find(p => p && fs.existsSync(p));
  if(!hit) throw new Error('Chrome 을 찾지 못했습니다. 위 candidates 에 경로를 추가해 주세요.');
  return hit;
}
const CHROME = findChrome();

/* ── 캡처 ──
   ※ 로컬 파일을 넘길 때는 반드시 file:/// URL 로 만들어야 한다.
     그냥 경로를 주면 "...html?only=bg" 를 파일 이름으로 찾다가 빈 이미지가 나온다 */
function shoot(sheet, size, only, out){
  const url = 'file:///' + path.join(HERE, `${sheet}.html`).replace(/\\/g, '/')
            + (only ? `?only=${only}` : '');
  const args = [
    '--headless=new', '--disable-gpu', '--hide-scrollbars',
    '--force-device-scale-factor=1',
    `--window-size=${size.w},${size.h}`,
    '--virtual-time-budget=12000',      /* 구글 폰트·사진이 도착하기 전에 찍히지 않게 */
    `--screenshot=${out}`,
  ];
  if(only) args.push('--default-background-color=00000000');   /* 겹은 배경 투명으로 */
  args.push(url);
  execFileSync(CHROME, args, { stdio:'ignore' });
  if(!fs.existsSync(out)) throw new Error(`캡처 실패: ${sheet} / ${only || '합본'}`);
}

/* ── PNG → ag-psd 가 쓰는 imageData ── */
function readLayer(file){
  const png = PNG.sync.read(fs.readFileSync(file));
  return { width:png.width, height:png.height, data:new Uint8ClampedArray(png.data) };
}

/* ── PNG → 300DPI JPG (Windows 는 .NET, 그 외는 sips/ImageMagick) ── */
function toJpeg(src, dst){
  if(process.platform === 'win32'){
    const ps = `
Add-Type -AssemblyName System.Drawing
$img = [System.Drawing.Image]::FromFile('${src}')
$bmp = New-Object System.Drawing.Bitmap($img.Width, $img.Height)
$bmp.SetResolution(${DPI}, ${DPI})
$g = [System.Drawing.Graphics]::FromImage($bmp)
$g.Clear([System.Drawing.Color]::White)
$g.DrawImage($img, 0, 0, $img.Width, $img.Height)
$codec = [System.Drawing.Imaging.ImageCodecInfo]::GetImageEncoders() | Where-Object { $_.MimeType -eq 'image/jpeg' }
$p = New-Object System.Drawing.Imaging.EncoderParameters(1)
$p.Param[0] = New-Object System.Drawing.Imaging.EncoderParameter([System.Drawing.Imaging.Encoder]::Quality, 95L)
$bmp.Save('${dst}', $codec, $p)
$g.Dispose(); $bmp.Dispose(); $img.Dispose()
`.trim();
    execSync(`powershell -NoProfile -NonInteractive -Command "${ps.replace(/"/g, '\\"').replace(/\n/g, '; ')}"`, { stdio:'ignore' });
  }else{
    execSync(`magick "${src}" -density ${DPI} -units PixelsPerInch -quality 95 "${dst}"`, { stdio:'ignore' });
  }
}

/* ── 실행 ── */
fs.mkdirSync(TMP, { recursive:true });

for(const [sheet, spec] of Object.entries(SHEETS)){
  console.log(`\n[${sheet}]  ${spec.w}x${spec.h}`);

  /* 1) 합본 → JPG */
  const flatPng = path.join(TMP, `${sheet}-flat.png`);
  shoot(sheet, spec, null, flatPng);
  const jpg = path.join(HERE, `${sheet}.jpg`);
  toJpeg(flatPng, jpg);
  console.log(`  JPG  ${path.basename(jpg)}`);

  /* 2) 레이어 → PSD */
  const children = spec.layers.map(L => {
    const f = path.join(TMP, `${sheet}-${L.key}.png`);
    shoot(sheet, spec, L.key, f);
    console.log(`  레이어  ${L.name}`);
    return { name:L.name, top:0, left:0, hidden:!!L.hidden, imageData:readLayer(f) };
  });

  const psd = {
    width:spec.w, height:spec.h,
    imageData: readLayer(flatPng),        /* 합성본 — 포토샵 밖에서도 미리보기가 뜨도록 */
    children,
    imageResources:{
      resolutionInfo:{
        horizontalResolution:DPI, horizontalResolutionUnit:'PPI', widthUnit:'Millimeters',
        verticalResolution:DPI,   verticalResolutionUnit:'PPI',   heightUnit:'Millimeters',
      },
    },
  };
  const out = path.join(HERE, `${sheet}.psd`);
  fs.writeFileSync(out, Buffer.from(writePsd(psd, { generateThumbnail:false })));
  console.log(`  PSD  ${path.basename(out)}`);
}

fs.rmSync(TMP, { recursive:true, force:true });
console.log('\n완료. 인쇄 전 README.md 의 주의사항(특히 CMYK 변환)을 확인하세요.');
