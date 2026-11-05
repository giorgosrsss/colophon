import { copyFile, mkdir, rm } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as esbuild from 'esbuild';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const dist = join(root, 'dist');
const watch = process.argv.includes('--watch');

const shared = {
  absWorkingDir: root,
  bundle: true,
  sourcemap: watch ? 'inline' : false,
  minify: !watch,
  logLevel: 'info',
  legalComments: 'none',
};

const builds = [
  {
    ...shared,
    entryPoints: { main: 'src/main/main.ts', 'detector-worker': 'src/main/detector-worker.ts' },
    outExtension: { '.js': '.cjs' },
    outdir: 'dist',
    platform: 'node',
    format: 'cjs',
    target: 'node22',
    external: ['electron', 'onnxruntime-node'],
    // Lazy imports of the native runtime become plain require() calls, which load from the asar archive.
    supported: { 'dynamic-import': false },
  },
  {
    ...shared,
    entryPoints: { preload: 'src/main/preload.ts' },
    outExtension: { '.js': '.cjs' },
    outdir: 'dist',
    platform: 'node',
    format: 'cjs',
    target: 'node22',
    external: ['electron', 'onnxruntime-node'],
  },
  {
    ...shared,
    entryPoints: { app: 'src/renderer/main.tsx' },
    outdir: 'dist/renderer',
    platform: 'browser',
    format: 'iife',
    target: 'chrome140',
    jsx: 'automatic',
    loader: { '.woff2': 'file' },
    assetNames: 'assets/[name]-[hash]',
    define: { 'process.env.NODE_ENV': JSON.stringify(watch ? 'development' : 'production') },
    plugins: [
      {
        name: 'page',
        setup(build) {
          build.onEnd(() => copyFile(join(root, 'src/renderer/index.html'), join(dist, 'renderer/index.html')));
        },
      },
    ],
  },
];

await rm(dist, { recursive: true, force: true });
await mkdir(join(dist, 'renderer'), { recursive: true });

if (watch) {
  const contexts = await Promise.all(builds.map((options) => esbuild.context(options)));
  await Promise.all(contexts.map((context) => context.watch()));
} else {
  await Promise.all(builds.map((options) => esbuild.build(options)));
}
