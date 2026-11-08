// Tipos de scripts/android-signing.mjs, para usarlo desde las pruebas en TypeScript.
export declare const SIGNING_PREFIX: string;
export declare const KEY_ALIAS: string;
export declare function encodeSigningCode(key: { keystore: Buffer; password: string }): string;
export declare function decodeSigningCode(text: string | undefined): { keystore: Buffer; password: string };
