import { test } from 'node:test';
import assert from 'node:assert/strict';
import { aciColor, cleanText, detectType, importCad } from '../src/services/cadImport.js';

// A small, valid DXF built from [group code, value] pairs.
function dxf() {
  const g = [];
  const add = (c, v) => g.push([c, v]);
  const sec = (name, fn) => { add(0, 'SECTION'); add(2, name); fn(); add(0, 'ENDSEC'); };
  sec('HEADER', () => { add(9, '$INSUNITS'); add(70, 6); });
  sec('TABLES', () => {
    add(0, 'TABLE'); add(2, 'LAYER'); add(70, 3);
    for (const [name, flags, color] of [['ROAD', 0, 3], ['TXT', 0, 7], ['OFF', 1, 1]]) { add(0, 'LAYER'); add(2, name); add(70, flags); add(62, color); add(6, 'CONTINUOUS'); }
    add(0, 'ENDTAB');
  });
  sec('BLOCKS', () => {
    add(0, 'BLOCK'); add(8, '0'); add(2, 'TICK'); add(70, 0); add(10, 0); add(20, 0); add(30, 0);
    add(0, 'LINE'); add(8, '0'); add(10, 0); add(20, 0); add(30, 0); add(11, 0); add(21, 5); add(31, 0);
    add(0, 'ENDBLK'); add(8, '0');
  });
  sec('ENTITIES', () => {
    add(0, 'LINE'); add(8, 'ROAD'); add(10, 100000); add(20, 200000); add(30, 0); add(11, 100400); add(21, 200000); add(31, 0);
    add(0, 'LWPOLYLINE'); add(8, 'ROAD'); add(90, 3); add(70, 0); add(10, 100000); add(20, 200100); add(10, 100100); add(20, 200100); add(42, 0.5); add(10, 100200); add(20, 200150);
    add(0, 'ARC'); add(8, 'ROAD'); add(10, 100500); add(20, 200500); add(30, 0); add(40, 50); add(50, 0); add(51, 90);
    add(0, 'CIRCLE'); add(8, 'ROAD'); add(10, 100600); add(20, 200600); add(30, 0); add(40, 10);
    add(0, 'TEXT'); add(8, 'TXT'); add(10, 100150); add(20, 200150); add(30, 0); add(40, 4); add(1, 'Hello %%d'); add(50, 30);
    add(0, 'MTEXT'); add(8, 'TXT'); add(10, 100160); add(20, 200160); add(30, 0); add(40, 3); add(1, '{\\fArial|b0;Line one}\\Pline two');
    add(0, 'INSERT'); add(8, 'ROAD'); add(2, 'TICK'); add(10, 100200); add(20, 200000); add(30, 0); add(41, 2); add(42, 2); add(50, 90);
    add(0, 'LINE'); add(8, 'OFF'); add(10, 100000); add(20, 200000); add(30, 0); add(11, 100050); add(21, 200050); add(31, 0);
  });
  add(0, 'EOF');
  return Buffer.from(g.map(([c, v]) => `${c}\n${v}`).join('\n') + '\n');
}

test('file type is detected from the content, not only the name', () => {
  assert.equal(detectType(Buffer.from('AC1032\0\0\0\0\0'), 'x.bin'), 'dwg');
  assert.equal(detectType(dxf(), 'whatever'), 'dxf');
  assert.equal(detectType(Buffer.from('hello world'), 'notes.txt'), null);
});

test('AutoCAD index colours', () => {
  assert.equal(aciColor(1), '#ff0000');
  assert.equal(aciColor(3), '#00ff00');
  assert.equal(aciColor(7), '#ffffff');
  assert.equal(aciColor(10), '#ff0000');
  assert.match(aciColor(150), /^#[0-9a-f]{6}$/);
  assert.equal(aciColor(999), '#ffffff');
});

test('text codes are cleaned', () => {
  assert.equal(cleanText('{\\fArial|b0;Line one}\\Pline two'), 'Line one\nline two');
  assert.equal(cleanText('45%%d'), '45°');
  assert.equal(cleanText('%%ULEGEND:'), 'LEGEND:');
  assert.equal(cleanText('\\C1;RED'), 'RED');
  assert.equal(cleanText(null), '');
});

test('a DXF is converted: layers, shapes, blocks, text', async () => {
  const { type, geometry, summary } = await importCad(dxf(), 'plan.dxf');
  assert.equal(type, 'dxf');
  assert.equal(geometry.units, 'metres');
  const road = geometry.layers.find((l) => l.name === 'ROAD');
  const txt = geometry.layers.find((l) => l.name === 'TXT');
  const off = geometry.layers.find((l) => l.name === 'OFF');
  assert.ok(road && txt && off);
  assert.equal(off.hidden, true, 'a frozen layer is hidden by default');
  assert.equal(road.hidden, false);
  assert.equal(road.circles.length, 1);
  assert.equal(road.circles[0][2], 10);
  assert.equal(txt.texts.length, 2);
  assert.ok(txt.texts.some((t) => t[4] === 'Hello °'));
  assert.ok(txt.texts.some((t) => t[4] === 'Line one\nline two'));
  // line + bulged polyline + arc + the block's tick line
  assert.ok(road.polys.length >= 4, `polys ${road.polys.length}`);
  assert.ok(summary.stats.drawn.insert === 1);
});

test('the block insert is moved, scaled and rotated (tick: 5 long, x2, turned 90 degrees)', async () => {
  const { geometry } = await importCad(dxf(), 'plan.dxf');
  const [ox, oy] = geometry.origin;
  const road = geometry.layers.find((l) => l.name === 'ROAD');
  const tick = road.polys.find((p) => p.length === 5 && Math.abs(p[1] + ox - 100200) < 0.01 && Math.abs(p[2] + oy - 200000) < 0.01);
  assert.ok(tick, 'tick line starts at the insert point');
  // block line goes (0,0) -> (0,5); scale 2 -> length 10; rotated 90 deg -> points along -x
  assert.ok(Math.abs(tick[3] + ox - 100190) < 0.01 && Math.abs(tick[4] + oy - 200000) < 0.01, `end ${tick[3] + ox}, ${tick[4] + oy}`);
});

test('coordinates are stored relative to an origin so big map coordinates stay small', async () => {
  const { geometry } = await importCad(dxf(), 'plan.dxf');
  const all = geometry.layers.flatMap((l) => l.polys.flatMap((p) => p.slice(1)));
  assert.ok(all.every((v) => Math.abs(v) < 5000), 'no raw 100000-sized numbers left');
  assert.ok(geometry.origin[0] > 90000);
  assert.ok(geometry.bounds.x2 > geometry.bounds.x1 && geometry.bounds.y2 > geometry.bounds.y1);
});

test('bad uploads are refused with a readable error', async () => {
  await assert.rejects(importCad(Buffer.from('just some text'), 'a.txt'), /DWG or DXF/);
  await assert.rejects(importCad(Buffer.from('0\nSECTION\n2\nENTITIES\n0\nLINE\n'), 'broken.dxf'), (err) => err.code === 'UNREADABLE' || /read|drawing/i.test(err.message));
});
