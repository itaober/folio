interface ImportMetaEnv {
  readonly VITE_FOLIO_BUILD_CHANNEL?: string;
}

declare const process: {
  env: Record<string, string | undefined>;
};
