'use strict';

// Maps NODE_V8_COVERAGE output to line-level executed/not-executed for
// public_html/main.js: a line counts as covered only when the innermost V8
// range containing its start offset has count > 0 (block-level attribution).

const fs = require('node:fs');
const path = require('node:path');

const covDir = process.argv[2] || '/tmp/ilx-cov';
const sut = path.resolve(__dirname, '..', 'public_html', 'main.js');
const src = fs.readFileSync(sut, 'utf8');
const lines = src.split('\n');
const lineStarts = [0];
for (let i = 0; i < src.length; i++) if (src[i] === '\n') lineStarts.push(i + 1);
const total = lines.length;

const covered = new Array(total + 1).fill(false);
let found = 0;
for (const f of fs.readdirSync(covDir)) {
    if (!f.endsWith('.json')) continue;
    const data = JSON.parse(fs.readFileSync(path.join(covDir, f), 'utf8'));
    for (const s of data.result || []) {
        if (s.url !== 'file://' + sut) continue;
        found++;
        for (const b of s.functions) {
            const ranges = b.ranges.map(r => ({ s: r.startOffset, e: r.endOffset, c: r.count }));
            ranges.sort((a, z) => (a.e - a.s) - (z.e - z.s)); // narrowest first
            for (let l = 1; l <= total; l++) {
                if (covered[l]) continue;
                const off = lineStarts[l - 1];
                const inner = ranges.find(rr => rr.s <= off && off < rr.e);
                if (inner && inner.c > 0) covered[l] = true;
            }
        }
    }
}

if (!found) { console.error('no coverage entries found for main.js'); process.exitCode = 1; }

const codeUncovered = [];
for (let l = 1; l <= total; l++) {
    const text = lines[l - 1].trim();
    if (!text || text === '}' || text === '{' || text === ');' || text.startsWith('//')) continue;
    if (!covered[l]) codeUncovered.push(l);
}

console.log(`main.js: ${total} lines; uncovered code lines: ${codeUncovered.length}`);
for (const l of codeUncovered) {
    console.log(`${l}: ${lines[l - 1].trim()}`);
}
