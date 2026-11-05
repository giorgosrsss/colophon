// Renders build/icon.svg at the sizes Windows asks for and packs them into build/icon.ico.
// Run with: npm run icon
const fs = require('node:fs');
const path = require('node:path');
const { app, BrowserWindow } = require('electron');

const root = path.join(__dirname, '..');
const SIZES = [256, 64, 48, 40, 32, 24, 20, 16];
const CANVAS = 1024;

function packIco(images) {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(images.length, 4);

  let offset = header.length + images.length * 16;
  const entries = images.map(({ size, png }) => {
    const entry = Buffer.alloc(16);
    entry.writeUInt8(size >= 256 ? 0 : size, 0);
    entry.writeUInt8(size >= 256 ? 0 : size, 1);
    entry.writeUInt16LE(1, 4);
    entry.writeUInt16LE(32, 6);
    entry.writeUInt32LE(png.length, 8);
    entry.writeUInt32LE(offset, 12);
    offset += png.length;
    return entry;
  });

  return Buffer.concat([header, ...entries, ...images.map(({ png }) => png)]);
}

app.disableHardwareAcceleration();

app.whenReady().then(async () => {
  const svg = fs.readFileSync(path.join(root, 'build', 'icon.svg'), 'utf8');
  const page = `<style>html,body{margin:0;background:transparent}svg{display:block;width:${CANVAS}px;height:${CANVAS}px}</style>${svg}`;

  const win = new BrowserWindow({
    width: CANVAS,
    height: CANVAS,
    show: false,
    frame: false,
    transparent: true,
    webPreferences: { offscreen: true },
  });
  await win.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(page)}`);
  await new Promise((resolve) => setTimeout(resolve, 300));

  const capture = await win.webContents.capturePage();
  const images = SIZES.map((size) => ({ size, png: capture.resize({ width: size, height: size, quality: 'best' }).toPNG() }));

  fs.writeFileSync(path.join(root, 'build', 'icon.ico'), packIco(images));
  fs.writeFileSync(path.join(root, 'build', 'icon.png'), images[0].png);
  console.log(`Wrote build/icon.ico (${SIZES.join(', ')} px)`);
  app.quit();
});
