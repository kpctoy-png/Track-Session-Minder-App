// Builds the web version of the app into one self-contained HTML file, so it
// can be shared as a link and opened in a phone's browser.
// Usage: node scripts/build-preview.mjs <output.html>

import { execSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';

const out = process.argv[2] ?? 'dist/preview.html';
execSync('npx expo export --platform web --clear', { stdio: 'inherit', env: { ...process.env, CI: '1' } });

const html = readFileSync('dist/index.html', 'utf8');
const scripts = [...html.matchAll(/<script src="([^"]+)" defer><\/script>/g)].map((m) => m[1]);
const code = scripts.map((src) => readFileSync(`dist${src}`, 'utf8').replaceAll('</script', '<\\/script')).join('\n');

const style = html.match(/<style id="expo-reset">[\s\S]*?<\/style>/)[0];
writeFileSync(
  out,
  `<title>Track Session Minder</title>
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
${style}
<style>html, body { background: #0B0B0F; color-scheme: dark; }</style>
<div id="root"></div>
<script>
  // The router reads the address bar; start every preview on the Now screen.
  try { history.replaceState(null, '', '/'); } catch (e) {}
</script>
<script>
${code}
</script>
`,
);
console.log(`Wrote ${out} (${Math.round(code.length / 1024)} KB)`);
