const VAULT_PROOF = 'drivea-vault-check-v1'
const PBKDF2_ITERATIONS = 310_000

function toBase64(bytes: Uint8Array) {
    let binary = ''
    for (const byte of bytes) binary += String.fromCharCode(byte)
    return btoa(binary)
}

function fromBase64(value: string) {
    const binary = atob(value)
    return Uint8Array.from(binary, (character) => character.charCodeAt(0))
}

async function deriveKey(pin: string, salt: Uint8Array) {
    const material = await crypto.subtle.importKey('raw', new TextEncoder().encode(pin), 'PBKDF2', false, ['deriveKey'])
    const saltBuffer = salt.buffer.slice(salt.byteOffset, salt.byteOffset + salt.byteLength) as ArrayBuffer
    return crypto.subtle.deriveKey(
        { name: 'PBKDF2', salt: saltBuffer, iterations: PBKDF2_ITERATIONS, hash: 'SHA-256' },
        material,
        { name: 'AES-GCM', length: 256 },
        false,
        ['encrypt', 'decrypt'],
    )
}

async function encryptText(value: string, key: CryptoKey) {
    const iv = crypto.getRandomValues(new Uint8Array(12))
    const ciphertext = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, new TextEncoder().encode(value))
    const combined = new Uint8Array(iv.length + ciphertext.byteLength)
    combined.set(iv)
    combined.set(new Uint8Array(ciphertext), iv.length)
    return toBase64(combined)
}

export async function createVaultMaterial(pin: string) {
    if (pin.length < 8) throw new Error('Choose a PIN or password with at least 8 characters.')
    const salt = crypto.getRandomValues(new Uint8Array(16))
    const key = await deriveKey(pin, salt)
    return { key, salt: toBase64(salt), check: await encryptText(VAULT_PROOF, key) }
}

export async function unlockVaultKey(pin: string, salt: string, check: string) {
    const key = await deriveKey(pin, fromBase64(salt))
    const encrypted = fromBase64(check)
    try {
        const plaintext = await crypto.subtle.decrypt(
            { name: 'AES-GCM', iv: encrypted.slice(0, 12) },
            key,
            encrypted.slice(12),
        )
        if (new TextDecoder().decode(plaintext) !== VAULT_PROOF) throw new Error('Incorrect Vault PIN or password.')
        return key
    } catch {
        throw new Error('Incorrect Vault PIN or password.')
    }
}

export async function encryptVaultFile(file: File, key: CryptoKey) {
    const iv = crypto.getRandomValues(new Uint8Array(12))
    const ciphertext = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, await file.arrayBuffer())
    const payload = new Uint8Array(iv.length + ciphertext.byteLength)
    payload.set(iv)
    payload.set(new Uint8Array(ciphertext), iv.length)
    return new Blob([payload], { type: 'application/octet-stream' })
}

export async function encryptVaultChunk(chunk: Blob, key: CryptoKey) {
    const iv = crypto.getRandomValues(new Uint8Array(12))
    const ciphertext = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, await chunk.arrayBuffer())
    const payload = new Uint8Array(iv.length + ciphertext.byteLength)
    payload.set(iv)
    payload.set(new Uint8Array(ciphertext), iv.length)
    return new Blob([payload], { type: 'application/octet-stream' })
}

export async function decryptVaultBlob(payload: Blob, key: CryptoKey, mimeType: string, originalSize?: number, chunkSize?: number) {
    if (chunkSize && originalSize !== undefined) {
        const plaintextChunks: BlobPart[] = []
        let encryptedOffset = 0
        let plaintextOffset = 0
        while (plaintextOffset < originalSize) {
            const plaintextLength = Math.min(chunkSize, originalSize - plaintextOffset)
            const recordLength = 12 + plaintextLength + 16
            const record = new Uint8Array(await payload.slice(encryptedOffset, encryptedOffset + recordLength).arrayBuffer())
            if (record.length !== recordLength) throw new Error('Encrypted Vault file is incomplete.')
            const plaintext = await crypto.subtle.decrypt(
                { name: 'AES-GCM', iv: record.slice(0, 12) },
                key,
                record.slice(12),
            )
            plaintextChunks.push(plaintext)
            encryptedOffset += recordLength
            plaintextOffset += plaintextLength
        }
        if (encryptedOffset !== payload.size) throw new Error('Encrypted Vault file contains unexpected data.')
        return new Blob(plaintextChunks, { type: mimeType || 'application/octet-stream' })
    }

    const encrypted = new Uint8Array(await payload.arrayBuffer())
    if (encrypted.length <= 12) throw new Error('Encrypted Vault file is incomplete.')
    const plaintext = await crypto.subtle.decrypt(
        { name: 'AES-GCM', iv: encrypted.slice(0, 12) },
        key,
        encrypted.slice(12),
    )
    return new Blob([plaintext], { type: mimeType || 'application/octet-stream' })
}