// crypto.js - Frontend E2EE Utility using Web Crypto API

// ============================
// RSA KEYPAIR GENERATION
// ============================
export const generateRSAKeyPair = async () => {
    const keyPair = await window.crypto.subtle.generateKey(
        {
            name: "RSA-OAEP",
            modulusLength: 2048,
            publicExponent: new Uint8Array([1, 0, 1]),
            hash: "SHA-256",
        },
        true,
        ["encrypt", "decrypt"]
    );

    // Export keys to string formats
    const publicKeyBuffer = await window.crypto.subtle.exportKey("spki", keyPair.publicKey);
    const privateKeyBuffer = await window.crypto.subtle.exportKey("pkcs8", keyPair.privateKey);

    return {
        publicKeyStr: arrayBufferToBase64(publicKeyBuffer),
        privateKeyStr: arrayBufferToBase64(privateKeyBuffer),
        publicKey: keyPair.publicKey,
        privateKey: keyPair.privateKey
    };
};

export const importRSAPublicKey = async (base64Str) => {
    const buffer = base64ToArrayBuffer(base64Str);
    return await window.crypto.subtle.importKey(
        "spki",
        buffer,
        { name: "RSA-OAEP", hash: "SHA-256" },
        true,
        ["encrypt"]
    );
};

export const importRSAPrivateKey = async (base64Str) => {
    const buffer = base64ToArrayBuffer(base64Str);
    return await window.crypto.subtle.importKey(
        "pkcs8",
        buffer,
        { name: "RSA-OAEP", hash: "SHA-256" },
        true,
        ["decrypt"]
    );
};

// ============================
// PBKDF2 PASSWORD KEY DERIVATION
// ============================
export const deriveKeyFromPassword = async (password, saltBuffer = new Uint8Array(16)) => {
    const enc = new TextEncoder();

    // Create a KeyMaterial from password
    const keyMaterial = await window.crypto.subtle.importKey(
        "raw",
        enc.encode(password),
        { name: "PBKDF2" },
        false,
        ["deriveKey"]
    );

    // Derive AES-GCM key
    const key = await window.crypto.subtle.deriveKey(
        {
            name: "PBKDF2",
            salt: saltBuffer,
            iterations: 100000,
            hash: "SHA-256"
        },
        keyMaterial,
        { name: "AES-GCM", length: 256 },
        true,
        ["encrypt", "decrypt"]
    );

    return { key, saltStr: arrayBufferToBase64(saltBuffer) };
};

// ============================
// ENCRYPT/DECRYPT PRIVATE KEY
// ============================
// Returns base64 payload containing salt, iv, and ciphertext
export const encryptPrivateKeyWithPassword = async (privateKeyStr, password) => {
    const iv = window.crypto.getRandomValues(new Uint8Array(12));
    const salt = window.crypto.getRandomValues(new Uint8Array(16));

    const { key } = await deriveKeyFromPassword(password, salt);

    const enc = new TextEncoder();
    const ciphertextBuffer = await window.crypto.subtle.encrypt(
        { name: "AES-GCM", iv: iv },
        key,
        enc.encode(privateKeyStr)
    );

    const payload = {
        salt: arrayBufferToBase64(salt),
        iv: arrayBufferToBase64(iv),
        ciphertext: arrayBufferToBase64(ciphertextBuffer)
    };

    return btoa(JSON.stringify(payload));
};

export const decryptPrivateKeyWithPassword = async (encryptedPayloadBase64, password) => {
    const payloadStr = atob(encryptedPayloadBase64);
    const payload = JSON.parse(payloadStr);

    const saltArr = base64ToArrayBuffer(payload.salt);
    const ivArr = base64ToArrayBuffer(payload.iv);
    const cipherArr = base64ToArrayBuffer(payload.ciphertext);

    const { key } = await deriveKeyFromPassword(password, new Uint8Array(saltArr));

    const decryptedBuffer = await window.crypto.subtle.decrypt(
        { name: "AES-GCM", iv: new Uint8Array(ivArr) },
        key,
        cipherArr
    );

    const dec = new TextDecoder();
    return dec.decode(decryptedBuffer);
};

// ============================
// AES MESSAGE ENCRYPTION
// ============================
export const generateAESKey = async () => {
    return await window.crypto.subtle.generateKey(
        { name: "AES-GCM", length: 256 },
        true,
        ["encrypt", "decrypt"]
    );
};

export const exportAESKey = async (aesKey) => {
    const buffer = await window.crypto.subtle.exportKey("raw", aesKey);
    return arrayBufferToBase64(buffer);
};

export const importAESKey = async (base64Str) => {
    const buffer = base64ToArrayBuffer(base64Str);
    return await window.crypto.subtle.importKey(
        "raw",
        buffer,
        { name: "AES-GCM" },
        true,
        ["encrypt", "decrypt"]
    );
};

export const encryptAESMessage = async (plaintext, aesKey) => {
    const iv = window.crypto.getRandomValues(new Uint8Array(12));
    const enc = new TextEncoder();

    const ciphertextBuffer = await window.crypto.subtle.encrypt(
        { name: "AES-GCM", iv: iv },
        aesKey,
        enc.encode(plaintext)
    );

    return {
        ciphertextStr: arrayBufferToBase64(ciphertextBuffer),
        ivStr: arrayBufferToBase64(iv)
    };
};

export const decryptAESMessage = async (ciphertextStr, ivStr, aesKey) => {
    const cipherArr = base64ToArrayBuffer(ciphertextStr);
    const ivArr = base64ToArrayBuffer(ivStr);

    const decryptedBuffer = await window.crypto.subtle.decrypt(
        { name: "AES-GCM", iv: new Uint8Array(ivArr) },
        aesKey,
        cipherArr
    );

    const dec = new TextDecoder();
    return dec.decode(decryptedBuffer);
};

// ============================
// RSA-OAEP KEY ENCRYPTION (WRAP AES KEY)
// ============================
export const encryptAESKeyWithRSA = async (aesKey, rsaPublicKey) => {
    // We need to export AES key to raw then encrypt it using RSA
    const rawAesKeyBuffer = await window.crypto.subtle.exportKey("raw", aesKey);

    const encryptedKeyBuffer = await window.crypto.subtle.encrypt(
        { name: "RSA-OAEP" },
        rsaPublicKey,
        rawAesKeyBuffer
    );

    return arrayBufferToBase64(encryptedKeyBuffer);
};

export const decryptAESKeyWithRSA = async (encryptedAESKeyStr, rsaPrivateKey) => {
    const encryptedKeyBuffer = base64ToArrayBuffer(encryptedAESKeyStr);

    const rawAesKeyBuffer = await window.crypto.subtle.decrypt(
        { name: "RSA-OAEP" },
        rsaPrivateKey,
        encryptedKeyBuffer
    );

    return await window.crypto.subtle.importKey(
        "raw",
        rawAesKeyBuffer,
        { name: "AES-GCM" },
        true,
        ["encrypt", "decrypt"]
    );
};


// ============================
// HELPERS
// ============================
function arrayBufferToBase64(buffer) {
    let binary = "";
    const bytes = new Uint8Array(buffer);
    for (let i = 0; i < bytes.byteLength; i++) {
        binary += String.fromCharCode(bytes[i]);
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
