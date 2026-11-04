import {build} from 'esbuild';
import {writeNotices} from './notices.mjs';
const result = await build({entryPoints: ['src/extension.js', 'src/worker.js'], outdir: 'dist', bundle: true, platform: 'node', target: 'node20', format: 'cjs', external: ['vscode'], minify: true, legalComments: 'inline', logLevel: 'info', metafile: true});
await writeNotices(result.metafile);
