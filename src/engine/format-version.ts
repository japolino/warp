/**
 * The ruleset format this engine reads. Legacy (before the core cut) = 1. Warp Studio checks it at build time
 * and through \`warp-state-v1\` at run time; raise it whenever a key's meaning changes. A leaf module, so the
 * frontend can send it without bundling the engine.
 */
export const RULESET_FORMAT = 2;
