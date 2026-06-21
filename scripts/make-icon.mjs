/*
 * M2_LOG
 * Copyright (c) 2026 OA Hsiao
 * SPDX-License-Identifier: MIT
 *
 * This source code is licensed under the MIT License found in the
 * LICENSE file in the root directory of this source tree.
 */

// Generate the M2_LOG app icon: the yellow M2 badge (the same SVG used as the
// brand logo + favicon) on a dark rounded tile, rendered to PNG with zero
// external dependencies (a tiny SVG-path rasterizer + PNG encoder).
//
// Run: node scripts/make-icon.mjs

import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');

// The M2 badge path (viewBox 0 0 1024 1024, even-odd fill).
const M2_PATH =
  'M474.500 5.091 C 369.720 13.291,269.833 53.534,190.500 119.511 C 164.616 141.037,141.773 163.914,121.904 188.211 C 46.367 280.576,6.980 391.590,7.025 512.000 C 7.071 633.721,52.941 752.327,135.677 844.650 C 179.034 893.031,229.632 931.814,286.500 960.256 C 367.991 1001.013,456.545 1018.990,546.170 1012.970 C 646.559 1006.228,740.144 970.848,821.000 909.073 C 903.470 846.063,968.149 753.678,997.474 657.000 C 1012.996 605.829,1018.990 565.277,1018.997 511.395 C 1019.000 481.311,1018.159 466.844,1014.934 441.500 C 995.771 290.911,906.460 155.598,773.500 75.706 C 711.963 38.730,644.372 15.731,571.500 6.970 C 557.228 5.255,546.562 4.739,520.000 4.479 C 501.575 4.299,481.100 4.575,474.500 5.091 M553.000 92.045 C 622.278 98.285,693.122 124.222,751.779 164.820 C 778.194 183.102,807.986 209.567,828.612 233.070 C 874.497 285.356,907.232 350.199,922.475 419.000 C 935.933 479.742,935.737 546.581,921.934 603.104 C 898.062 700.867,843.346 784.061,763.277 844.336 C 705.991 887.461,634.151 916.559,563.000 925.454 C 400.593 945.760,237.673 864.755,152.797 721.500 C 122.057 669.616,101.064 605.170,96.065 547.339 C 94.676 531.267,94.638 489.693,95.998 474.000 C 102.282 401.519,128.084 329.349,168.658 270.765 C 198.517 227.653,236.961 189.944,281.000 160.570 C 298.844 148.668,307.730 143.541,328.142 133.370 C 372.979 111.026,426.624 96.097,476.500 92.082 C 484.200 91.462,492.525 90.785,495.000 90.577 C 502.349 89.959,540.596 90.927,553.000 92.045 M254.667 238.667 C 254.300 239.033,254.000 358.508,254.000 504.167 L 254.000 769.000 297.497 769.000 L 340.995 769.000 341.247 577.250 L 341.500 385.500 425.500 469.203 C 471.700 515.239,509.801 553.039,510.170 553.203 C 510.538 553.366,569.157 495.475,640.435 424.555 L 770.030 295.611 769.765 267.055 L 769.500 238.500 741.000 238.379 L 712.500 238.258 612.000 338.218 L 511.500 438.178 411.967 338.089 L 312.434 238.000 283.884 238.000 C 268.181 238.000,255.033 238.300,254.667 238.667 M640.020 475.903 L 510.539 604.791 465.551 560.645 C 440.807 536.365,409.861 505.967,396.781 493.094 L 373.000 469.687 373.097 531.094 L 373.194 592.500 393.244 611.500 C 404.271 621.950,435.315 651.823,462.229 677.885 L 511.164 725.269 516.332 720.311 C 535.862 701.573,603.741 635.446,640.827 599.028 C 665.208 575.088,685.570 555.350,686.077 555.167 C 686.637 554.964,687.000 596.948,687.000 661.917 L 687.000 769.000 728.500 769.000 L 770.000 769.000 770.000 558.000 C 770.000 441.950,769.888 347.003,769.750 347.008 C 769.612 347.012,711.234 405.015,640.020 475.903 ';

const S = 512; // canvas size
const TILE = [31, 39, 51]; // dark slate #1f2733
const YEL = [250, 204, 21]; // #facc15
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

// --- SVG path -> polylines (M/L/C/Z, absolute) ---
function flattenCubic(out, x0, y0, x1, y1, x2, y2, x3, y3, n) {
  for (let i = 1; i <= n; i++) {
    const t = i / n;
    const u = 1 - t;
    const a = u * u * u;
    const b = 3 * u * u * t;
    const c = 3 * u * t * t;
    const e = t * t * t;
    out.push([a * x0 + b * x1 + c * x2 + e * x3, a * y0 + b * y1 + c * y2 + e * y3]);
  }
}
function parsePath(d) {
  const subpaths = [];
  let cur = null;
  let sx = 0;
  let sy = 0;
  let px = 0;
  let py = 0;
  const re = /([MLCZ])([^MLCZ]*)/gi;
  let m;
  while ((m = re.exec(d))) {
    const cmd = m[1].toUpperCase();
    const nums = (m[2].match(/-?\d*\.?\d+(?:e[-+]?\d+)?/gi) || []).map(Number);
    if (cmd === 'M') {
      if (cur) subpaths.push(cur);
      px = nums[0];
      py = nums[1];
      sx = px;
      sy = py;
      cur = [[px, py]];
      for (let i = 2; i + 1 < nums.length; i += 2) {
        px = nums[i];
        py = nums[i + 1];
        cur.push([px, py]);
      }
    } else if (cmd === 'L') {
      for (let i = 0; i + 1 < nums.length; i += 2) {
        px = nums[i];
        py = nums[i + 1];
        cur.push([px, py]);
      }
    } else if (cmd === 'C') {
      for (let i = 0; i + 5 < nums.length; i += 6) {
        flattenCubic(cur, px, py, nums[i], nums[i + 1], nums[i + 2], nums[i + 3], nums[i + 4], nums[i + 5], 18);
        px = nums[i + 4];
        py = nums[i + 5];
      }
    } else if (cmd === 'Z') {
      if (cur) {
        cur.push([sx, sy]);
        subpaths.push(cur);
        cur = null;
      }
    }
  }
  if (cur) subpaths.push(cur);
  return subpaths;
}

// Build device-space edges (auto-closing each subpath) for even-odd scanline fill.
function buildEdges(subpaths, scale, ox, oy) {
  const edges = [];
  for (const sp of subpaths) {
    for (let i = 0; i < sp.length; i++) {
      const a = sp[i];
      const b = sp[(i + 1) % sp.length];
      const ay = oy + a[1] * scale;
      const by = oy + b[1] * scale;
      if (ay !== by) edges.push([ox + a[0] * scale, ay, ox + b[0] * scale, by]);
    }
  }
  return edges;
}

function addSpan(cov, row, xa, xb, w) {
  xa = clamp(xa, 0, S);
  xb = clamp(xb, 0, S);
  if (xb <= xa) return;
  let ix = Math.floor(xa);
  while (ix < xb) {
    const x0 = Math.max(xa, ix);
    const x1 = Math.min(xb, ix + 1);
    cov[row * S + ix] += w * (x1 - x0);
    ix++;
  }
}

function rasterizeEvenOdd(edges) {
  const cov = new Float32Array(S * S);
  const SUB = 4;
  const w = 1 / SUB;
  for (let row = 0; row < S; row++) {
    for (let k = 0; k < SUB; k++) {
      const sy = row + (k + 0.5) / SUB;
      const xs = [];
      for (const e of edges) {
        const ay = e[1];
        const by = e[3];
        if ((ay <= sy && by > sy) || (by <= sy && ay > sy)) {
          const t = (sy - ay) / (by - ay);
          xs.push(e[0] + t * (e[2] - e[0]));
        }
      }
      xs.sort((a, b) => a - b);
      for (let i = 0; i + 1 < xs.length; i += 2) addSpan(cov, row, xs[i], xs[i + 1], w);
    }
  }
  return cov;
}

function sdRoundRect(px, py, cx, cy, hx, hy, r) {
  const qx = Math.abs(px - cx) - (hx - r);
  const qy = Math.abs(py - cy) - (hy - r);
  return Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0) - r;
}

// Straight-alpha "source over". Colors are [r,g,b] 0-255; alpha 0-1.
function over(dst, color, a) {
  const da = dst[3];
  const oa = a + da * (1 - a);
  if (oa <= 0) return [0, 0, 0, 0];
  return [
    (color[0] * a + dst[0] * da * (1 - a)) / oa,
    (color[1] * a + dst[1] * da * (1 - a)) / oa,
    (color[2] * a + dst[2] * da * (1 - a)) / oa,
    oa,
  ];
}

// Fit the 1024 viewBox into ~76% of the tile, centered.
const draw = S * 0.76;
const cov = rasterizeEvenOdd(buildEdges(parsePath(M2_PATH), draw / 1024, (S - draw) / 2, (S - draw) / 2));
const tileR = 112;

const buf = Buffer.alloc(S * S * 4);
for (let y = 0; y < S; y++) {
  for (let x = 0; x < S; x++) {
    const px = x + 0.5;
    const py = y + 0.5;
    let col = [0, 0, 0, 0];

    // dark rounded tile
    const sdT = sdRoundRect(px, py, S / 2, S / 2, S / 2, S / 2, tileR);
    const covT = clamp(0.5 - sdT, 0, 1);
    if (covT > 0) col = over(col, TILE, covT);

    // yellow M2 badge
    const cy = clamp(cov[y * S + x], 0, 1);
    if (cy > 0) col = over(col, YEL, cy);

    const i = (y * S + x) * 4;
    buf[i] = Math.round(col[0]);
    buf[i + 1] = Math.round(col[1]);
    buf[i + 2] = Math.round(col[2]);
    buf[i + 3] = Math.round(col[3] * 255);
  }
}

// --- Minimal PNG encoder (RGBA, 8-bit) ---
const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();
function crc32(buf2) {
  let c = 0xffffffff;
  for (let i = 0; i < buf2.length; i++) c = CRC_TABLE[(c ^ buf2[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const typeBuf = Buffer.from(type, 'ascii');
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0);
  return Buffer.concat([len, typeBuf, data, crc]);
}
function encodePng(rgba, w, h) {
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // color type RGBA
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;
  const raw = Buffer.alloc(h * (w * 4 + 1));
  for (let y = 0; y < h; y++) {
    raw[y * (w * 4 + 1)] = 0; // filter: none
    rgba.copy(raw, y * (w * 4 + 1) + 1, y * w * 4, (y + 1) * w * 4);
  }
  const idat = zlib.deflateSync(raw, { level: 9 });
  return Buffer.concat([sig, chunk('IHDR', ihdr), chunk('IDAT', idat), chunk('IEND', Buffer.alloc(0))]);
}

const png = encodePng(buf, S, S);
const targets = [path.join(ROOT, 'src', 'assets', 'icon.png'), path.join(ROOT, 'build', 'icon.png')];
for (const t of targets) {
  fs.mkdirSync(path.dirname(t), { recursive: true });
  fs.writeFileSync(t, png);
  console.log('wrote', path.relative(ROOT, t), `(${png.length} bytes)`);
}
