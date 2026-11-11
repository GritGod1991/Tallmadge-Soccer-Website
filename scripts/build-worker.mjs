import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import { extname } from 'node:path';

const dist = new URL('../dist/', import.meta.url);
const types = new Map([
  ['.html', 'text/html; charset=utf-8'],
  ['.css', 'text/css; charset=utf-8'],
  ['.js', 'text/javascript; charset=utf-8'],
  ['.jpeg', 'image/jpeg'],
]);
const assets = [];
const files = await readdir(dist, { withFileTypes: true });
for (const file of files.filter((entry) => entry.isFile()).sort((a, b) => a.name.localeCompare(b.name))) {
  const contentType = types.get(extname(file.name));
  if (!contentType) throw new Error(`Unsupported site asset: ${file.name}`);
  const data = await readFile(new URL(file.name, dist));
  const content = contentType === 'image/jpeg' ? { base64: data.toString('base64') } : { text: data.toString('utf8') };
  assets.push([`/${file.name}`, { contentType, ...content }]);
}
const worker = await readFile(new URL('../worker/index.js', import.meta.url), 'utf8');
const auth = await readFile(new URL('../worker/club-auth.js', import.meta.url), 'utf8');
const schedules = await readFile(new URL('../worker/schedules.js', import.meta.url), 'utf8');
const teams = await readFile(new URL('../worker/teams.js', import.meta.url), 'utf8');
const seasons = await readFile(new URL('../worker/seasons.js', import.meta.url), 'utf8');
const rosters = await readFile(new URL('../worker/rosters.js', import.meta.url), 'utf8');
const divisions = await readFile(new URL('../worker/divisions.js', import.meta.url), 'utf8');
const news = await readFile(new URL('../worker/news.js', import.meta.url), 'utf8');
const output = new URL('server/', dist);
await mkdir(output, { recursive: true });
await writeFile(new URL('index.js', output), `const assets = new Map(${JSON.stringify(assets)});\n${auth}\n${schedules}\n${teams}\n${seasons}\n${rosters}\n${divisions}\n${news}\n${worker}`);
