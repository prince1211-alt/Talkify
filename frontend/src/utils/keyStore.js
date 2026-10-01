// Keeps the user's private key in IndexedDB as a non-extractable CryptoKey.
// Before this, the raw private key was stored in localStorage where any script
// (or anyone with access to the browser profile) could copy it.

import { importRSAPrivateKey } from "./crypto";

const DB_NAME = "talkify-e2ee";
const STORE = "keys";

let memoryKey = { userId: null, key: null };

const openDb = () =>
    new Promise((resolve, reject) => {
        if (!window.indexedDB) {
            reject(new Error("IndexedDB not available"));
            return;
        }
        const request = window.indexedDB.open(DB_NAME, 1);
        request.onupgradeneeded = () => request.result.createObjectStore(STORE);
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    });

const withStore = async (mode, action) => {
    const db = await openDb();
    try {
        return await new Promise((resolve, reject) => {
            const tx = db.transaction(STORE, mode);
            const request = action(tx.objectStore(STORE));
            tx.oncomplete = () => resolve(request?.result);
            tx.onerror = () => reject(tx.error);
            tx.onabort = () => reject(tx.error);
        });
    } finally {
        db.close();
    }
};

// Imports the PKCS8 key string as a non-extractable key and remembers it for this browser
export const setSessionPrivateKey = async (userId, privateKeyStr) => {
    const key = await importRSAPrivateKey(privateKeyStr);
    memoryKey = { userId: String(userId), key };
    try {
        await withStore("readwrite", (store) => store.put(key, `private:${userId}`));
    } catch (err) {
        // Private browsing etc.: the key still works until the page is reloaded
        console.warn("Could not persist encryption key:", err);
    }
    return key;
};

export const getSessionPrivateKey = async (userId) => {
    if (!userId) return null;
    if (memoryKey.userId === String(userId) && memoryKey.key) return memoryKey.key;
    try {
        const key = await withStore("readonly", (store) => store.get(`private:${userId}`));
        if (key) memoryKey = { userId: String(userId), key };
        return key || null;
    } catch {
        return null;
    }
};

export const clearSessionKeys = async () => {
    memoryKey = { userId: null, key: null };
    try {
        await withStore("readwrite", (store) => store.clear());
    } catch {
        // nothing stored
    }
};
