import {build} from 'esbuild';
await build({entryPoints: ['src/extension.js', 'src/worker.js'], outdir: 'dist', bundle: true, platform: 'node', target: 'node20', format: 'cjs', external: ['vscode'], minify: true, legalComments: 'inline', logLevel: 'info'});
