// Downloads the models that ship with the app into models/, checking each file's SHA-256.
// The large model is not fetched here; the app downloads it when someone picks it.
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const { ModelStore } = await import('../src/main/models.ts');
const { DETECTORS } = await import('../src/shared/detectors.ts');

const store = new ModelStore(join(root, 'models'), join(root, 'models'));

for (const info of Object.values(DETECTORS).filter((d) => d.bundled)) {
  if ((await store.state(info.id)).status === 'ready') {
    console.log(`${info.name} model already in models/${info.id}`);
    continue;
  }
  process.stdout.write(`Downloading the ${info.name} model`);
  let shown = -1;
  await store.download(info.id, (received, total) => {
    const percent = Math.floor((received / total) * 100);
    if (percent >= shown + 10) {
      shown = percent;
      process.stdout.write(` ${percent}%`);
    }
  });
  console.log(`\nSaved to models/${info.id}`);
}
