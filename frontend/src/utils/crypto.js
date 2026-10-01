// crypto.js - Frontend E2EE Utility using Web Crypto API
//
// Scheme
//  - Every user has an RSA-OAEP 2048 / SHA-256 key pair. Only the public key is readable by others.
//  - The private key is stored on the server encrypted with AES-256-GCM, using a key derived from
//    the user's password with PBKDF2-SHA256 (600,000 iterations, random 16-byte salt).
//  - In the browser the private key lives in IndexedDB as a NON-extractable CryptoKey (see keyStore.js),
//    so page scripts can use it but can never read it out.
//  - Every message gets a fresh AES-256-GCM key. Text and image bytes are encrypted with it (each with
//    its own random 12-byte IV) and the AES key is wrapped with RSA-OAEP for every recipient.

export const PBKDF2_ITERATIONS = 600000;
const LEGACY_PBKDF2_ITERATIONS = 10000; // keys created before the upgrade (no "iter" field)

const subtle = () => {
    if (!window.isSecureContext || !window.crypto?.subtle) {
        throw new Error("End-to-end encryption needs a secure (HTTPS) connection.");
    }
    return window.crypto.subtle;
};

const RSA_PARAMS = { name: "RSA-OAEP", hash: "SHA-256" };

// ============================
// RSA KEYPAIR GENERATION
// ============================
export const generateRSAKeyPair = async () => {
    const keyPair = await subtle().generateKey(
        {
            ...RSA_PARAMS,
            modulusLength: 2048,
            publicExponent: new Uint8Array([1, 0, 1]),
        },
        true,
        ["encrypt", "decrypt", "wrapKey", "unwrapKey"]
    );

    // Export keys to string formats
    const publicKeyBuffer = await subtle().exportKey("spki", keyPair.publicKey);
    const privateKeyBuffer = await subtle().exportKey("pkcs8", keyPair.privateKey);

    return {
        publicKeyStr: arrayBufferToBase64(publicKeyBuffer),
        privateKeyStr: arrayBufferToBase64(privateKeyBuffer),
    };
};

export const importRSAPublicKey = async (base64Str) => {
    return await subtle().importKey(
        "spki",
        base64ToArrayBuffer(base64Str),
        RSA_PARAMS,
        false,
        ["encrypt", "wrapKey"]
    );
};

// Imported as non-extractable: it can decrypt but can never be exported again.
export const importRSAPrivateKey = async (base64Str) => {
    return await subtle().importKey(
        "pkcs8",
        base64ToArrayBuffer(base64Str),
        RSA_PARAMS,
        false,
        ["decrypt", "unwrapKey"]
    );
};

// ============================
// PBKDF2 PASSWORD KEY DERIVATION
// ============================
const deriveKeyFromPassword = async (password, salt, iterations) => {
    const keyMaterial = await subtle().importKey(
        "raw",
        new TextEncoder().encode(password),
        { name: "PBKDF2" },
        false,
        ["deriveKey"]
    );

    return await subtle().deriveKey(
        { name: "PBKDF2", salt, iterations, hash: "SHA-256" },
        keyMaterial,
        { name: "AES-GCM", length: 256 },
        false,
        ["encrypt", "decrypt"]
    );
};

const parsePrivateKeyPayload = (encryptedPayloadBase64) => JSON.parse(atob(encryptedPayloadBase64));

// ============================
// ENCRYPT/DECRYPT PRIVATE KEY
// ============================
// Returns base64 payload containing kdf params, salt, iv, and ciphertext
export const encryptPrivateKeyWithPassword = async (privateKeyStr, password) => {
    const iv = window.crypto.getRandomValues(new Uint8Array(12));
    const salt = window.crypto.getRandomValues(new Uint8Array(16));
    const key = await deriveKeyFromPassword(password, salt, PBKDF2_ITERATIONS);

    const ciphertextBuffer = await subtle().encrypt(
        { name: "AES-GCM", iv },
        key,
        new TextEncoder().encode(privateKeyStr)
    );

    const payload = {
        v: 2,
        kdf: "PBKDF2-SHA256",
        iter: PBKDF2_ITERATIONS,
        salt: arrayBufferToBase64(salt),
        iv: arrayBufferToBase64(iv),
        ciphertext: arrayBufferToBase64(ciphertextBuffer)
    };

    return btoa(JSON.stringify(payload));
};

export const decryptPrivateKeyWithPassword = async (encryptedPayloadBase64, password) => {
    const payload = parsePrivateKeyPayload(encryptedPayloadBase64);
    const iterations = payload.iter || LEGACY_PBKDF2_ITERATIONS;

    const key = await deriveKeyFromPassword(
        password,
        new Uint8Array(base64ToArrayBuffer(payload.salt)),
        iterations
    );

    const decryptedBuffer = await subtle().decrypt(
        { name: "AES-GCM", iv: new Uint8Array(base64ToArrayBuffer(payload.iv)) },
        key,
        base64ToArrayBuffer(payload.ciphertext)
    );

    return new TextDecoder().decode(decryptedBuffer);
};

// True when the stored private key uses the old, weak KDF settings and should be re-encrypted
export const needsPrivateKeyUpgrade = (encryptedPayloadBase64) => {
    try {
        const payload = parsePrivateKeyPayload(encryptedPayloadBase64);
        return (payload.iter || LEGACY_PBKDF2_ITERATIONS) < PBKDF2_ITERATIONS;
    } catch {
        return false;
    }
};

// ============================
// AES MESSAGE ENCRYPTION
// ============================
export const generateAESKey = async () => {
    // Extractable only so it can be wrapped for each recipient
    return await subtle().generateKey(
        { name: "AES-GCM", length: 256 },
        true,
        ["encrypt", "decrypt"]
    );
};

export const encryptAESMessage = async (plaintext, aesKey) => {
    const { ciphertext, ivStr } = await encryptAESBytes(new TextEncoder().encode(plaintext), aesKey);
    return { ciphertextStr: arrayBufferToBase64(ciphertext), ivStr };
};

export const decryptAESMessage = async (ciphertextStr, ivStr, aesKey) => {
    const decryptedBuffer = await decryptAESBytes(base64ToArrayBuffer(ciphertextStr), ivStr, aesKey);
    return new TextDecoder().decode(decryptedBuffer);
};

// Binary data (images)
export const encryptAESBytes = async (data, aesKey) => {
    const iv = window.crypto.getRandomValues(new Uint8Array(12));
    const ciphertext = await subtle().encrypt({ name: "AES-GCM", iv }, aesKey, data);
    return { ciphertext, ivStr: arrayBufferToBase64(iv) };
};

export const decryptAESBytes = async (data, ivStr, aesKey) => {
    return await subtle().decrypt(
        { name: "AES-GCM", iv: new Uint8Array(base64ToArrayBuffer(ivStr)) },
        aesKey,
        data
    );
};

// ============================
// RSA-OAEP KEY WRAPPING
// ============================
export const encryptAESKeyWithRSA = async (aesKey, rsaPublicKey) => {
    const wrapped = await subtle().wrapKey("raw", aesKey, rsaPublicKey, { name: "RSA-OAEP" });
    return arrayBufferToBase64(wrapped);
};

// Same wire format as before (RSA-OAEP over the raw AES key), but the unwrapped
// AES key is non-extractable and can only decrypt.
export const decryptAESKeyWithRSA = async (encryptedAESKeyStr, rsaPrivateKey) => {
    return await subtle().unwrapKey(
        "raw",
        base64ToArrayBuffer(encryptedAESKeyStr),
        rsaPrivateKey,
        { name: "RSA-OAEP" },
        { name: "AES-GCM" },
        false,
        ["decrypt"]
    );
};


// ============================
// HELPERS
// ============================
function arrayBufferToBase64(buffer) {
    const bytes = new Uint8Array(buffer);
    let binary = "";
    const CHUNK = 0x8000;
    for (let i = 0; i < bytes.length; i += CHUNK) {
        binary += String.fromCharCode.apply(null, bytes.subarray(i, i + CHUNK));
    }
    return btoa(binary);
}

function base64ToArrayBuffer(base64) {
    const binary_string = atob(base64);
    const len = binary_string.length;
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i++) {
        bytes[i] = binary_string.charCodeAt(i);
    }
    return bytes.buffer;
}
