const DB_NAME = 'project-journal-cache-v2';
const DB_VERSION = 1;

function openDb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains('records')) db.createObjectStore('records', { keyPath: 'path' });
      if (!db.objectStoreNames.contains('settings')) db.createObjectStore('settings', { keyPath: 'key' });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function txDone(tx) {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error || new Error('IndexedDB transaction aborted'));
  });
}

export async function replaceCache(records) {
  const db = await openDb();
  const tx = db.transaction('records', 'readwrite');
  const store = tx.objectStore('records');
  store.clear();
  records.forEach(r => store.put(r));
  await txDone(tx);
  db.close();
}

export async function putCache(record) {
  const db = await openDb();
  const tx = db.transaction('records', 'readwrite');
  tx.objectStore('records').put(record);
  await txDone(tx);
  db.close();
}

export async function deleteCache(path) {
  const db = await openDb();
  const tx = db.transaction('records', 'readwrite');
  tx.objectStore('records').delete(path);
  await txDone(tx);
  db.close();
}

export async function listCache() {
  const db = await openDb();
  const tx = db.transaction('records', 'readonly');
  const req = tx.objectStore('records').getAll();
  const rows = await new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result || []);
    req.onerror = () => reject(req.error);
  });
  await txDone(tx);
  db.close();
  return rows;
}

export async function clearCache() {
  const db = await openDb();
  const tx = db.transaction(['records', 'settings'], 'readwrite');
  tx.objectStore('records').clear();
  tx.objectStore('settings').clear();
  await txDone(tx);
  db.close();
}
