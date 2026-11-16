import { create } from 'zustand';
import { deriveKeyAndChecker } from '../crypto/kdf.js';
import { base64ToBytes, bytesToBase64, normalizeEncodedBytes, randomSalt } from '../crypto/aes.js';
import { indexMetaRepo } from '../db/indexMetaRepo.js';
import { assertWritable } from './accessStore';

interface CryptoStore {
  key: Uint8Array | null;
  checker: string | null;
  salt: string | null;
  unlocked: boolean;
  unlock: (password: string) => Promise<boolean>;
  lock: () => void;
  setEncryptionParams: (checker: string, salt: string) => void;
  setActiveKey: (key: Uint8Array, checker: string, salt: string) => void;
}

export const cryptoStore = create<CryptoStore>((set, get) => ({
  key: null,
  checker: null,
  salt: null,
  unlocked: false,

  unlock: async (password: string): Promise<boolean> => {
    const meta = await indexMetaRepo.forDisplay();

    if (!meta?.checker || !meta?.salt) {
      assertWritable();
      // First-time setup: derive fresh key + checker + salt
      const salt = randomSalt();
      const { key, checker } = await deriveKeyAndChecker(password, salt);
      const checkerB64 = bytesToBase64(checker);
      const saltB64 = bytesToBase64(salt);

      assertWritable();
      await indexMetaRepo.set({
        ...meta!,
        key: 'current',
        checker: checkerB64,
        salt: saltB64,
      });

      set({ key, checker: checkerB64, salt: saltB64, unlocked: true });
        return true;
    }

    // Existing setup: derive and compare checkers
    const saltBytes = base64ToBytes(meta.salt);
    const { key, checker } = await deriveKeyAndChecker(password, saltBytes);
    const checkerB64 = bytesToBase64(checker);

    if (checkerB64 !== normalizeEncodedBytes(meta.checker)) {
      return false;
    }

    set({ key, checker: checkerB64, salt: bytesToBase64(saltBytes), unlocked: true });
    return true;
  },

  lock: () => {
    const { key } = get();
    if (key) {
      key.fill(0);
    }
    set({ key: null, checker: null, salt: null, unlocked: false });
  },

  setEncryptionParams: (checker: string, salt: string) => {
    set({ checker, salt });
  },

  setActiveKey: (key: Uint8Array, checker: string, salt: string) => {
    set({ key, checker, salt, unlocked: true });
  },
}));
