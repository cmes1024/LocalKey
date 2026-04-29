/**
 * 安全加密工具类 - AES-GCM 256
 */
const CryptoUtils = {
    // 生成随机盐值
    generateSalt: () => window.crypto.getRandomValues(new Uint8Array(16)),

    // 派生密钥 (PBKDF2)
    deriveKey: async (password, salt) => {
        const enc = new TextEncoder();
        const baseKey = await window.crypto.subtle.importKey(
            "raw", enc.encode(password), "PBKDF2", false, ["deriveKey"]
        );
        return window.crypto.subtle.deriveKey(
            { name: "PBKDF2", salt: salt, iterations: 100000, hash: "SHA-256" },
            baseKey,
            { name: "AES-GCM", length: 256 },
            false,
            ["encrypt", "decrypt"]
        );
    },

    // 加密
    encrypt: async (text, key) => {
        const iv = window.crypto.getRandomValues(new Uint8Array(12));
        const encoded = new TextEncoder().encode(text);
        const ciphertext = await window.crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, encoded);
        return {
            cipher: btoa(String.fromCharCode(...new Uint8Array(ciphertext))),
            iv: btoa(String.fromCharCode(...iv))
        };
    },

    // 解密
    decrypt: async (cipher, iv, key) => {
        const binaryCipher = new Uint8Array(atob(cipher).split('').map(c => c.charCodeAt(0)));
        const binaryIv = new Uint8Array(atob(iv).split('').map(c => c.charCodeAt(0)));
        const decrypted = await window.crypto.subtle.decrypt({ name: "AES-GCM", iv: binaryIv }, key, binaryCipher);
        return new TextDecoder().decode(decrypted);
    }
};
