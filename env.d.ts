/// <reference types="vite/client" />

// Prohlížeč nedostává žádné proměnné prostředí. Klíče k modelu a Googlu čte jen server
// (server/config.ts, src/llm/config.ts), aby se nedostaly do sestavené aplikace.
