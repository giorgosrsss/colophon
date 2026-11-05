// Builds release/Colophon-win32-x64/Colophon.exe and a zip of it for publishing. The app's
// own code is bundled into dist/; the only module shipped as-is is ONNX Runtime, whose native
// binaries can't be bundled, and only its Windows x64 build. The standard model rides along
// as a resource.
import { execFileSync } from 'node:child_process';
import { copyFile, readdir, readFile, rm } from 'node:fs/promises';
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

await copyFile(join(root, 'build', 'THIRD-PARTY-NOTICES.txt'), join(out, 'THIRD-PARTY-NOTICES.txt'));
console.log(`Packaged ${join(out, 'Colophon.exe')}`);

// Windows' own tar (bsdtar) writes zip files. The app's files sit at the top of the archive,
// so "Extract All" gives a folder named after the zip.
const { version } = JSON.parse(await readFile(join(root, 'package.json'), 'utf8'));
const zip = join(root, 'release', `Colophon-${version}-win-x64.zip`);
await rm(zip, { force: true });
const tar = join(process.env.SystemRoot ?? 'C:\\Windows', 'System32', 'tar.exe');
execFileSync(tar, ['-a', '-c', '-f', zip, '-C', out, ...(await readdir(out))]);
console.log(`Zipped ${zip}`);
