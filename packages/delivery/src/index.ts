export const deliveryReady = (): string => "delivery";
import { GetObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

export interface ExportStorage {
  put(input: { body: string | Uint8Array; contentType: string; key: string }): Promise<void>;
  signedDownloadUrl(key: string, expiresInSeconds: number): Promise<string>;
}
export interface R2ExportConfig {
  accessKeyId: string;
  accountId: string;
  bucket: string;
  secretAccessKey: string;
}
/** R2 stays private. The caller receives a short-lived signed GET URL, never a public object URL. */
export const createR2ExportStorage = (config: R2ExportConfig): ExportStorage => {
  const client = new S3Client({
    credentials: { accessKeyId: config.accessKeyId, secretAccessKey: config.secretAccessKey },
    endpoint: `https://${config.accountId}.r2.cloudflarestorage.com`,
    region: "auto"
  });
  return {
    put: async ({ body, contentType, key }) => {
      await client.send(
        new PutObjectCommand({
          Body: body,
          Bucket: config.bucket,
          ContentType: contentType,
          Key: key
        })
      );
    },
    signedDownloadUrl: (key, expiresInSeconds) =>
      getSignedUrl(client, new GetObjectCommand({ Bucket: config.bucket, Key: key }), {
        expiresIn: expiresInSeconds
      })
  };
};

export interface ArtifactStorage {
  get(key: string): Promise<string | null>;
  put(input: { body: string; contentType: string; key: string }): Promise<void>;
}

/** Artifacts are served inline through our own endpoint, so this reads content back, unlike ExportStorage's signed-URL redirect. */
export const createR2ArtifactStorage = (config: R2ExportConfig): ArtifactStorage => {
  const client = new S3Client({
    credentials: { accessKeyId: config.accessKeyId, secretAccessKey: config.secretAccessKey },
    endpoint: `https://${config.accountId}.r2.cloudflarestorage.com`,
    region: "auto"
  });
  return {
    get: async (key) => {
      try {
        const result = await client.send(new GetObjectCommand({ Bucket: config.bucket, Key: key }));
        return (await result.Body?.transformToString()) ?? null;
      } catch (error) {
        if (
          typeof error === "object" &&
          error !== null &&
          "name" in error &&
          error.name === "NoSuchKey"
        )
          return null;
        throw error;
      }
    },
    put: async ({ body, contentType, key }) => {
      await client.send(
        new PutObjectCommand({
          Body: body,
          Bucket: config.bucket,
          ContentType: contentType,
          Key: key
        })
      );
    }
  };
};

export class MemoryArtifactStorage implements ArtifactStorage {
  readonly objects = new Map<string, { body: string; contentType: string }>();
  get(key: string): Promise<string | null> {
    return Promise.resolve(this.objects.get(key)?.body ?? null);
  }
  put(input: { body: string; contentType: string; key: string }): Promise<void> {
    this.objects.set(input.key, { body: input.body, contentType: input.contentType });
    return Promise.resolve();
  }
}

export class MemoryExportStorage implements ExportStorage {
  readonly objects = new Map<string, { body: string | Uint8Array; contentType: string }>();
  put(input: { body: string | Uint8Array; contentType: string; key: string }): Promise<void> {
    this.objects.set(input.key, { body: input.body, contentType: input.contentType });
    return Promise.resolve();
  }
  signedDownloadUrl(key: string, expiresInSeconds: number): Promise<string> {
    return Promise.resolve(
      `https://exports.test/${encodeURIComponent(key)}?expires=${String(expiresInSeconds)}`
    );
  }
}
