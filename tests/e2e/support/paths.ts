export const DEBUG_PORT = Number(process.env.BETTER_EDIT_E2E_DEBUG_PORT ?? 9222);
export const CDP_ENDPOINT = process.env.BETTER_EDIT_E2E_CDP_ENDPOINT ?? `http://127.0.0.1:${DEBUG_PORT}`;
export const VAULT_NAME = process.env.BETTER_EDIT_E2E_VAULT_NAME ?? "test_vault";
export const PLUGIN_ID = "better-edit";
