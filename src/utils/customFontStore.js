// customFontStore.js
// Tiny IndexedDB wrapper for user-uploaded font files. We persist the raw
// blob so the user doesn't have to re-pick the font on every visit.
//
// Schema:
//   DB:    'film-cutting-fonts'
//   Store: 'fonts' — { id (PK), label, blob }
//
// Public API (all return Promises):
//   listCustomFonts()       → [{ id, label }]   // metadata only, no blob
//   getCustomFontBlob(id)   → Blob | null
//   putCustomFont({id, label, blob})
//   deleteCustomFont(id)

const DB_NAME = 'film-cutting-fonts';
const STORE = 'fonts';
const VERSION = 1;

// Cached open promise — IndexedDB connections are cheap to keep open and
// reusing avoids the upgrade-needed handshake on every call.
let dbPromise = null;

function openDB() {
    if (dbPromise) return dbPromise;
    dbPromise = new Promise((resolve, reject) => {
        const req = indexedDB.open(DB_NAME, VERSION);
        req.onupgradeneeded = () => {
            const db = req.result;
            if (!db.objectStoreNames.contains(STORE)) {
                db.createObjectStore(STORE, { keyPath: 'id' });
            }
        };
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
    });
    return dbPromise;
}

function tx(mode) {
    return openDB().then((db) => db.transaction(STORE, mode).objectStore(STORE));
}

export async function listCustomFonts() {
    const store = await tx('readonly');
    return new Promise((resolve, reject) => {
        const req = store.openCursor();
        const out = [];
        req.onsuccess = () => {
            const cursor = req.result;
            if (!cursor) return resolve(out);
            const { id, label } = cursor.value;
            out.push({ id, label });
            cursor.continue();
        };
        req.onerror = () => reject(req.error);
    });
}

export async function getCustomFontBlob(id) {
    const store = await tx('readonly');
    return new Promise((resolve, reject) => {
        const req = store.get(id);
        req.onsuccess = () => resolve(req.result ? req.result.blob : null);
        req.onerror = () => reject(req.error);
    });
}

export async function putCustomFont({ id, label, blob }) {
    const store = await tx('readwrite');
    return new Promise((resolve, reject) => {
        const req = store.put({ id, label, blob });
        req.onsuccess = () => resolve();
        req.onerror = () => reject(req.error);
    });
}

export async function deleteCustomFont(id) {
    const store = await tx('readwrite');
    return new Promise((resolve, reject) => {
        const req = store.delete(id);
        req.onsuccess = () => resolve();
        req.onerror = () => reject(req.error);
    });
}
