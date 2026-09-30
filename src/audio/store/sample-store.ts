import { openDB, type DBSchema, type IDBPDatabase } from 'idb';
import type { LoadedSample, SampleChunk, SampleMeta } from '../domain/types';

interface SamplerDb extends DBSchema {
  samples: {
    key: string;
    value: SampleMeta;
  };
  chunks: {
    key: [string, number];
    value: SampleChunk;
    indexes: { 'by-sample': string };
  };
}

const DB_NAME = 'tab-sampler';
const DB_VERSION = 1;

let databasePromise: Promise<IDBPDatabase<SamplerDb>> | undefined;

function database(): Promise<IDBPDatabase<SamplerDb>> {
  databasePromise ??= openDB<SamplerDb>(DB_NAME, DB_VERSION, {
    upgrade(db) {
      if (!db.objectStoreNames.contains('samples')) {
        db.createObjectStore('samples', { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains('chunks')) {
        const store = db.createObjectStore('chunks', {
          keyPath: ['sampleId', 'index'],
        });
        store.createIndex('by-sample', 'sampleId');
      }
    },
  });
  return databasePromise;
}

export async function putSampleMeta(meta: SampleMeta): Promise<void> {
  const db = await database();
  await db.put('samples', meta);
}

export async function putSampleChunk(chunk: SampleChunk): Promise<void> {
  const db = await database();
  await db.put('chunks', chunk);
}

export async function getSampleMeta(id: string): Promise<SampleMeta | undefined> {
  const db = await database();
  return db.get('samples', id);
}

export async function getLatestSampleMeta(): Promise<SampleMeta | undefined> {
  const db = await database();
  const all = await db.getAll('samples');
  return all.sort((a, b) => b.createdAt - a.createdAt)[0];
}

export async function loadSample(id: string): Promise<LoadedSample> {
  const db = await database();
  const meta = await db.get('samples', id);
  if (!meta) throw new Error(`Sample ${id} was not found`);
  if (meta.channels <= 0 || meta.frames <= 0) throw new Error('Captured sample is empty');

  const chunks = await db.getAllFromIndex('chunks', 'by-sample', id);
  chunks.sort((a, b) => a.index - b.index);

  const channelData = Array.from(
    { length: meta.channels },
    () => new Float32Array(meta.frames),
  );

  let offset = 0;
  for (const chunk of chunks) {
    for (let channelIndex = 0; channelIndex < meta.channels; channelIndex += 1) {
      const sourceBuffer = chunk.channels[channelIndex];
      const target = channelData[channelIndex];
      if (!sourceBuffer || !target) continue;
      target.set(new Float32Array(sourceBuffer), offset);
    }
    offset += chunk.frames;
  }

  return { meta, channelData };
}

export async function deleteSample(id: string): Promise<void> {
  const db = await database();
  const tx = db.transaction(['samples', 'chunks'], 'readwrite');
  await tx.objectStore('samples').delete(id);

  const index = tx.objectStore('chunks').index('by-sample');
  let cursor = await index.openCursor(id);
  while (cursor) {
    await cursor.delete();
    cursor = await cursor.continue();
  }
  await tx.done;
}

export async function clearSamples(): Promise<void> {
  const db = await database();
  const tx = db.transaction(['samples', 'chunks'], 'readwrite');
  await tx.objectStore('samples').clear();
  await tx.objectStore('chunks').clear();
  await tx.done;
}
