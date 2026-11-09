// Tipos de scripts/update-manifest.mjs, para usarlo desde las pruebas en TypeScript.
export type BuiltManifest = { version: number; url: string; sha256: string; apkMinima: number; huellaNativa: string };
export declare const RELEASES: string;
export declare function nativeFingerprint(root?: string): string;
export declare function buildManifest(options: {
  version: number;
  zipSha256: string;
  fingerprint: string;
  previous: unknown;
}): BuiltManifest;
