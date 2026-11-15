import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';

const root = path.resolve('dist');
async function list(dir) {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  const files = await Promise.all(entries.map(e => e.isDirectory() ? list(path.join(dir, e.name)) : path.join(dir, e.name)));
  return files.flat();
}
// Expo's single-page export uses root asset paths. Relative paths work both at
// GitHub Pages /athkar-offline/ and another host/subdirectory without rebuilding.
for (const file of await list(root)) {
  if (!/\.(html|js|css)$/.test(file)) continue;
  let text = await fs.readFile(file, 'utf8');
  text = text.replace(/(["'`(])\/(assets|_expo)\//g, '$1./$2/');
  await fs.writeFile(file, text);
}
const files = (await list(root)).filter(file => !/\.(map)$/.test(file) && !/[/\\](sw\.js|metadata\.json|\.nojekyll)$/.test(file)).sort();
const hash = createHash('sha256');
for (const file of files) { hash.update(path.relative(root, file)); hash.update(await fs.readFile(file)); }
const template = await fs.readFile('scripts/service-worker.template.js', 'utf8');
hash.update(template);
const version = hash.digest('hex').slice(0, 16);
const relativeFiles = files.map(file => './' + path.relative(root, file).replaceAll('\\', '/'));
const worker = template.replace("'__BUILD_VERSION__'", JSON.stringify(version)).replace('__PRECACHE_FILES__', JSON.stringify(relativeFiles));
await fs.writeFile(path.join(root, 'sw.js'), worker);
await fs.writeFile(path.join(root, '.nojekyll'), '');
console.log(`Offline build ${version}: ${relativeFiles.length} files cached, including fonts and icons.`);
