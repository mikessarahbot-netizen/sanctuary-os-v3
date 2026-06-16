export const blockedAiContextFields = [
  "phoneNumbers",
  "homeAddresses",
  "prayerNotes",
  "counselingNotes",
  "individualGivingData",
  "childSensitiveRecords",
  "authTokens",
  "vendorSecrets"
] as const;

export type BlockedAiContextField = (typeof blockedAiContextFields)[number];
