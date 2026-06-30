// Tarot shared client helpers: stable per-browser identity + card metadata.

// A stable token identifying this browser as a participant/host across reloads.
// (roomId, key) is unique server-side, so one uid is reused for every room.
export function getTarotUid(): string {
  const KEY = "jcb_tarot_uid";
  let uid = localStorage.getItem(KEY);
  if (!uid) {
    uid =
      typeof crypto !== "undefined" && "randomUUID" in crypto
        ? crypto.randomUUID()
        : `u-${Date.now()}-${Math.floor(Math.random() * 1e9)}`;
    localStorage.setItem(KEY, uid);
  }
  return uid;
}

export const SPECIAL_CARDS = ["?", "coffee"];

export function isSpecialCard(v: string): boolean {
  return SPECIAL_CARDS.includes(v);
}

// Label + tooltip for special cards (meanings from the product spec).
export const CARD_META: Record<string, { label: string; title: string; tip: string }> = {
  "?": {
    label: "?",
    title: "Information unclear",
    tip:
      "Informasi kurang jelas / butuh diskusi lebih lanjut. Pilih kartu ini bila deskripsi " +
      "user story masih samar dan PO/Scrum Master perlu menjelaskan ulang sebelum estimasi.",
  },
  coffee: {
    label: "☕",
    title: "Need a break",
    tip:
      "Butuh istirahat — tim mulai lelah / sesi sudah terlalu lama. Sinyal untuk jeda singkat " +
      "menyegarkan pikiran sebelum melanjutkan estimasi.",
  },
};

export function cardDisplay(v: string): string {
  return CARD_META[v]?.label ?? v;
}
