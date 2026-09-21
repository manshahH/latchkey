export const deliveryReady = (): string => "delivery";
import { GetObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

export interface ExportStorage {
  put(input: { body: string; contentType: string; key: string }): Promise<void>;
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

export class MemoryExportStorage implements ExportStorage {
  readonly objects = new Map<string, { body: string; contentType: string }>();
  put(input: { body: string; contentType: string; key: string }): Promise<void> {
    this.objects.set(input.key, { body: input.body, contentType: input.contentType });
    return Promise.resolve();
  }
  signedDownloadUrl(key: string, expiresInSeconds: number): Promise<string> {
    return Promise.resolve(
      `https://exports.test/${encodeURIComponent(key)}?expires=${String(expiresInSeconds)}`
    );
  }
}
