import fs from 'node:fs';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
const manifest = JSON.parse(fs.readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
if (!manifest.publisher || manifest.publisher === 'local-preview') {
  console.error('Set package.json publisher to your registered Marketplace publisher ID first. See PUBLISHING.md.');
  process.exit(1);
}
const cli = new URL('../node_modules/@vscode/vsce/vsce', import.meta.url);
const result = spawnSync(process.execPath, [fileURLToPath(cli), 'publish', '--no-dependencies', '--allow-missing-repository', ...process.argv.slice(2)], {stdio: 'inherit'});
process.exit(result.status ?? 1);
