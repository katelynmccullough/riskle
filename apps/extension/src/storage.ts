import type { SupportedStorage } from "@supabase/supabase-js";
export const authStorage: SupportedStorage = {
  async getItem(key) {
    const result = await chrome.storage.local.get(key);
    return typeof result[key] === "string" ? result[key] : null;
  },
  async setItem(key, value) {
    await chrome.storage.local.set({ [key]: value });
  },
  async removeItem(key) {
    await chrome.storage.local.remove(key);
  },
};
