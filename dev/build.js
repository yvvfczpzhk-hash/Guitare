'use strict';
// Assemble ACCORD en une seule page (index.html) à partir de dev/src : styles, modules purs (testables sous Node),
// puis audio, stockage et interface. Usage : node dev/build.js
const fs = require('fs'), path = require('path'), zlib = require('zlib');
const SRC = path.join(__dirname, 'src'), OUT = path.join(__dirname, '..', 'index.html');
const VERSION = '1.0';

/* ---------- icône (PNG dessiné ici : rosace orange, cordes) */
function png(w, h, rgba) {
  const crcT = new Int32Array(256).map((_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c; });
  const crc = b => { let c = -1; for (const x of b) c = crcT[(c ^ x) & 255] ^ (c >>> 8); return (c ^ -1) >>> 0; };
  const chunk = (type, data) => { const len = Buffer.alloc(4); len.writeUInt32BE(data.length); const td = Buffer.concat([Buffer.from(type), data]); const c = Buffer.alloc(4); c.writeUInt32BE(crc(td)); return Buffer.concat([len, td, c]); };
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  const raw = Buffer.alloc((w * 4 + 1) * h);
  for (let y = 0; y < h; y++) { raw[y * (w * 4 + 1)] = 0; rgba.copy(raw, y * (w * 4 + 1) + 1, y * w * 4, (y + 1) * w * 4); }
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw, { level: 9 })), chunk('IEND', Buffer.alloc(0))]);
}
function icon(N) {
  const buf = Buffer.alloc(N * N * 4), SS = 4;
  const bg = [16, 14, 12], acc = [240, 160, 75], hole = [29, 18, 6], str = [244, 238, 229];
  const c = N / 2, R1 = N * 0.33, R0 = N * 0.2;
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    let r = 0, g = 0, b = 0;
    for (let sy = 0; sy < SS; sy++) for (let sx = 0; sx < SS; sx++) {
      const px = x + (sx + 0.5) / SS, py = y + (sy + 0.5) / SS, d = Math.hypot(px - c, py - c);
      let col = bg;
      if (d < R1) col = acc;
      if (d < R1 - N * 0.035 && d > R1 - N * 0.06) col = [214, 132, 52];
      if (d < R0) col = hole;
      for (let k = 0; k < 6; k++) { const xs = c + (k - 2.5) * N * 0.052; if (Math.abs(px - xs) < N * (0.006 + 0.0016 * (5 - k)) && py > N * 0.1 && py < N * 0.9) col = str; }
      r += col[0]; g += col[1]; b += col[2];
    }
    const i = (y * N + x) * 4, n = SS * SS;
    buf[i] = Math.round(r / n); buf[i + 1] = Math.round(g / n); buf[i + 2] = Math.round(b / n); buf[i + 3] = 255;
  }
  return png(N, N, buf).toString('base64');
}

const read = f => fs.readFileSync(path.join(SRC, f), 'utf8').replace(/\s+$/, '');
const PURE = ['theory.js', 'dsp.js', 'gsynth.js', 'model.js', 'srs.js', 'catalog.js', 'state.js', 'planner.js'];
const UI = ['audio.js', 'ui-core.js', 'ui-session.js', 'ui-screens.js'];
const ico180 = icon(180), ico512 = icon(512);
const manifest = { name: 'ACCORD', short_name: 'ACCORD', start_url: '.', display: 'standalone', background_color: '#100e0c', theme_color: '#100e0c', icons: [{ src: 'data:image/png;base64,' + ico512, sizes: '512x512', type: 'image/png' }] };
const html = `<!doctype html>
<html lang="fr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="theme-color" content="#100e0c">
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">
<meta name="apple-mobile-web-app-title" content="ACCORD">
<meta name="description" content="ACCORD — guitare acoustique : s'accompagner en chantant et composer. Accords, changements et rythme mesurés au micro, programme de 16 semaines.">
<title>ACCORD</title>
<link rel="apple-touch-icon" href="data:image/png;base64,${ico180}">
<link rel="icon" href="data:image/png;base64,${ico180}">
<link rel="manifest" href="data:application/manifest+json,${encodeURIComponent(JSON.stringify(manifest))}">
<style>
${read('style.css')}
</style>
</head>
<body>
<div id="app"><p style="padding:40px 20px;color:#ab9f90">Chargement…</p></div>
<noscript><p style="padding:20px">ACCORD a besoin de JavaScript.</p></noscript>
<script>
/* ACCORD ${VERSION} — une seule page, rien ne quitte le téléphone. Les modules jusqu'à « audio.js » sont purs
   (sans navigateur) : tests/load.js les charge tels quels sous Node. */
(globalThis.AC = globalThis.AC || {}).VERSION = '${VERSION}';
${PURE.map(read).join('\n\n')}

${UI.map(read).join('\n\n')}
</script>
</body>
</html>
`;
if (html.indexOf('/* ==== audio.js ==== */') < 0) throw new Error('marqueur audio.js absent');
fs.writeFileSync(OUT, html);
console.log('index.html : ' + (html.length / 1024).toFixed(0) + ' Ko, ' + html.split('\n').length + ' lignes');
