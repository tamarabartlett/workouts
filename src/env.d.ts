declare namespace NodeJS {
  interface ProcessEnv {
    readonly ALLOWED_USERNAME: string;
    readonly ALLOWED_PASSWORD_HASH: string;
  }
}

declare const process: {
  env: NodeJS.ProcessEnv;
};
