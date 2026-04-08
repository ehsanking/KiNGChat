export type BackupResult = {
  storageKey: string;
  outputPath: string;
  createdAt: string;
  sizeBytes: number;
  encrypted: boolean;
  metadata: Record<string, unknown>;
};

export interface BackupStrategy {
  name: string;
  run(): Promise<{ filePath: string; metadata: Record<string, unknown> }>;
}
