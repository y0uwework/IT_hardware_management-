export declare const DEFAULT_DATABASE: string;

export declare function loadEnvFiles(cwd?: string): void;

export declare function buildDbConfig(overrides?: { database?: string; user?: string; password?: string }): {
  driver: "tedious" | "msnodesqlv8";
  database: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  config: any;
};
