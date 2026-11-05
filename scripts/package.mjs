// Builds release/Colophon-win32-x64/Colophon.exe. The app's own code is bundled into dist/;
// the only module shipped as-is is ONNX Runtime, whose native binaries can't be bundled,
// and only its Windows x64 build. The standard model rides along as a resource.
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { packager } from '@electron/packager';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

const KEEP = [
  '/package.json',
  '/dist',
  '/node_modules/onnxruntime-common',
  '/node_modules/onnxruntime-node/package.json',
  '/node_modules/onnxruntime-node/dist',
  '/node_modules/onnxruntime-node/bin/napi-v6/win32/x64',
];

/** Folders on the way to something we keep must be kept too, or the packager never descends into them. */
const ancestors = new Set(
  KEEP.flatMap((path) => path.split('/').slice(1, -1).map((_, i, parts) => `/${parts.slice(0, i + 1).join('/')}`)),
);

const keep = (file) => file === '' || ancestors.has(file) || KEEP.some((path) => file === path || file.startsWith(`${path}/`));

const [out] = await packager({
  dir: root,
  out: join(root, 'release'),
  name: 'Colophon',
  executableName: 'Colophon',
  platform: 'win32',
  arch: 'x64',
  overwrite: true,
  prune: false,
  asar: { unpack: '**/onnxruntime-node/bin/**' },
  icon: join(root, 'build', 'icon.ico'),
  ignore: (file) => !keep(file.replace(/\\/g, '/')),
  extraResource: [join(root, 'models', 'standard')],
  appCopyright: 'Colophon',
  win32metadata: {
    FileDescription: 'Colophon',
    ProductName: 'Colophon',
    CompanyName: 'Colophon',
  },
});

console.log(`Packaged ${join(out, 'Colophon.exe')}`);
