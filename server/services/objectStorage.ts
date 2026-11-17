import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { getServerConfig, hasNeonObjectStorage } from '../config/env.js';

export interface PrivateObjectPayload {
  buffer: Buffer;
  contentType: string;
  contentLength: number;
}

export interface ObjectStorageAdapter {
  putObject(params: {
    key: string;
    body: Buffer;
    contentType: string;
    metadata?: Record<string, string>;
  }): Promise<void>;
  getObject(key: string): Promise<PrivateObjectPayload>;
  deleteObject(key: string): Promise<void>;
  headObject(key: string): Promise<boolean>;
}

let testAdapter: ObjectStorageAdapter | null = null;

export function setObjectStorageTestAdapter(adapter: ObjectStorageAdapter | null): void {
  testAdapter = adapter;
}

export function isObjectStorageAvailable(): boolean {
  return Boolean(testAdapter) || hasNeonObjectStorage();
}

let cachedS3Client: S3Client | null = null;
let cachedS3Fingerprint = '';

function getS3Client(): S3Client {
  const accessKeyId = (process.env.AWS_ACCESS_KEY_ID || '').trim();
  const secretAccessKey = (process.env.AWS_SECRET_ACCESS_KEY || '').trim();
  const endpoint = (process.env.AWS_ENDPOINT_URL_S3 || '').trim();
  const region = (process.env.AWS_REGION || '').trim();

  if (!accessKeyId || !secretAccessKey || !endpoint || !region) {
    throw new Error(
      'OBJECT_STORAGE_UNAVAILABLE: Neon Object Storage credentials (AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY, AWS_ENDPOINT_URL_S3, AWS_REGION) are not configured.'
    );
  }

  const fp = `${endpoint}|${region}|${accessKeyId}`;
  if (cachedS3Client && cachedS3Fingerprint === fp) {
    return cachedS3Client;
  }

  cachedS3Client = new S3Client({
    region,
    endpoint,
    forcePathStyle: true,
    credentials: {
      accessKeyId,
      secretAccessKey,
    },
  });
  cachedS3Fingerprint = fp;
  return cachedS3Client;
}

function getBucketName(): string {
  return getServerConfig().neonObjectStorageBucket || 'assets';
}

export async function putPrivateObject(params: {
  key: string;
  body: Buffer;
  contentType: string;
  metadata?: Record<string, string>;
}): Promise<{ bucket: string; key: string }> {
  const bucket = getBucketName();
  if (testAdapter) {
    await testAdapter.putObject(params);
    return { bucket, key: params.key };
  }

  const s3 = getS3Client();
  await s3.send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: params.key,
      Body: params.body,
      ContentType: params.contentType,
      Metadata: params.metadata,
    })
  );
  return { bucket, key: params.key };
}

export async function getPrivateObject(key: string): Promise<PrivateObjectPayload> {
  if (testAdapter) {
    return testAdapter.getObject(key);
  }

  const s3 = getS3Client();
  const bucket = getBucketName();
  const res = await s3.send(
    new GetObjectCommand({
      Bucket: bucket,
      Key: key,
    })
  );

  const bytes = await res.Body?.transformToByteArray();
  if (!bytes) {
    throw new Error('Object body was empty or unreadable.');
  }

  const buffer = Buffer.from(bytes);
  return {
    buffer,
    contentType: res.ContentType || 'application/octet-stream',
    contentLength: res.ContentLength ?? buffer.byteLength,
  };
}

export async function deletePrivateObject(key: string): Promise<void> {
  if (testAdapter) {
    await testAdapter.deleteObject(key);
    return;
  }

  const s3 = getS3Client();
  const bucket = getBucketName();
  await s3.send(
    new DeleteObjectCommand({
      Bucket: bucket,
      Key: key,
    })
  );
}

export async function headPrivateObject(key: string): Promise<boolean> {
  if (testAdapter) {
    return testAdapter.headObject(key);
  }

  const s3 = getS3Client();
  const bucket = getBucketName();
  try {
    await s3.send(
      new HeadObjectCommand({
        Bucket: bucket,
        Key: key,
      })
    );
    return true;
  } catch (err: any) {
    if (err?.$metadata?.httpStatusCode === 404 || err?.name === 'NotFound') {
      return false;
    }
    throw err;
  }
}
