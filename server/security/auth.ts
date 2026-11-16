import crypto from 'crypto';
import type { NextFunction, Request, Response } from 'express';
import { getServerConfig } from '../config/env.js';
import { db } from '../db/database.js';

export interface AuthenticatedUser {
  uid: string;
  email: string;
  full_name: string;
  role: 'user' | 'admin';
  email_verified: boolean;
}

declare global {
  namespace Express {
    interface Request {
      user?: AuthenticatedUser;
    }
  }
}

interface CertCache {
  certs: Record<string, string>;
  expiresAt: number;
}

let certCache: CertCache | null = null;
const GOOGLE_CERTS_URL =
  'https://www.googleapis.com/robot/v1/metadata/x509/securetoken@system.gserviceaccount.com';

async function getGooglePublicCerts(): Promise<Record<string, string>> {
  if (certCache && Date.now() < certCache.expiresAt) {
    return certCache.certs;
  }

  const resp = await fetch(GOOGLE_CERTS_URL);
  if (!resp.ok) {
    throw new Error(`Unable to fetch Google public certificates (HTTP ${resp.status}).`);
  }

  const cacheControl = resp.headers.get('cache-control') || '';
  const maxAgeMatch = cacheControl.match(/max-age=(\d+)/i);
  const maxAgeSec = maxAgeMatch ? Number(maxAgeMatch[1]) : 3600;
  const certs = (await resp.json()) as Record<string, string>;

  certCache = {
    certs,
    expiresAt: Date.now() + Math.max(60, maxAgeSec) * 1000,
  };
  return certs;
}

function decodeBase64Url(input: string): Buffer {
  const padded = input.replace(/-/g, '+').replace(/_/g, '/');
  const padLen = (4 - (padded.length % 4)) % 4;
  return Buffer.from(padded + '='.repeat(padLen), 'base64');
}

export async function verifyFirebaseIdToken(idToken: string): Promise<AuthenticatedUser> {
  const parts = idToken.split('.');
  if (parts.length !== 3) {
    throw new Error('Malformed Firebase ID token.');
  }

  const [headerB64, payloadB64, sigB64] = parts;
  const header = JSON.parse(decodeBase64Url(headerB64).toString('utf8'));
  const payload = JSON.parse(decodeBase64Url(payloadB64).toString('utf8'));

  if (header.alg !== 'RS256' || !header.kid) {
    throw new Error('Unsupported token algorithm or missing key identifier.');
  }

  const certs = await getGooglePublicCerts();
  let certPem = certs[header.kid];
  if (!certPem) {
    // Refresh once on key rotation
    certCache = null;
    const freshCerts = await getGooglePublicCerts();
    certPem = freshCerts[header.kid];
  }
  if (!certPem) {
    throw new Error('Signing certificate not found for Firebase token.');
  }

  const verifier = crypto.createVerify('RSA-SHA256');
  verifier.update(`${headerB64}.${payloadB64}`);
  verifier.end();

  const signatureValid = verifier.verify(certPem, decodeBase64Url(sigB64));
  if (!signatureValid) {
    throw new Error('Invalid Firebase ID token signature.');
  }

  const cfg = getServerConfig();
  const expectedIssuer = `https://securetoken.google.com/${cfg.firebase.projectId}`;
  const nowSec = Math.floor(Date.now() / 1000);

  if (payload.aud !== cfg.firebase.projectId) {
    throw new Error('Firebase token audience mismatch.');
  }
  if (payload.iss !== expectedIssuer) {
    throw new Error('Firebase token issuer mismatch.');
  }
  if (typeof payload.sub !== 'string' || payload.sub.length === 0 || payload.sub.length > 128) {
    throw new Error('Firebase token subject (uid) missing or invalid.');
  }
  if (typeof payload.exp !== 'number' || payload.exp <= nowSec) {
    throw new Error('Firebase session token has expired. Please refresh.');
  }
  if (typeof payload.iat !== 'number' || payload.iat > nowSec + 300) {
    throw new Error('Firebase token issued-at timestamp is invalid.');
  }

  const email = typeof payload.email === 'string' ? payload.email.toLowerCase() : '';
  const emailVerified = Boolean(payload.email_verified);
  const fullName =
    typeof payload.name === 'string' && payload.name.trim().length > 0
      ? payload.name.trim()
      : email.split('@')[0] || 'User';

  const isAdmin = emailVerified && cfg.adminEmails.includes(email);

  return {
    uid: payload.sub,
    email,
    full_name: fullName,
    role: isAdmin ? 'admin' : 'user',
    email_verified: emailVerified,
  };
}

export async function requireAuth(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const authHeader = req.headers.authorization || '';
    if (!authHeader.startsWith('Bearer ')) {
      res.status(401).json({ error: 'Authentication required. Missing Bearer Firebase token.' });
      return;
    }
    const token = authHeader.slice(7).trim();
    if (!token) {
      res.status(401).json({ error: 'Authentication required. Empty Bearer token.' });
      return;
    }
    req.user = await verifyFirebaseIdToken(token);
    next();
  } catch (err) {
    res.status(401).json({ error: (err as Error).message || 'Invalid or expired Firebase authentication token.' });
  }
}

export async function requireAdmin(req: Request, res: Response, next: NextFunction): Promise<void> {
  await requireAuth(req, res, () => {
    if (!req.user) return;
    if (req.user.role !== 'admin') {
      res.status(403).json({ error: 'Administrator privileges required for this resource.' });
      return;
    }
    next();
  });
}

export function logAudit(
  actorUid: string | null,
  action: string,
  targetType: string,
  targetId: string | number = '',
  details = ''
): void {
  try {
    db.prepare(
      `INSERT INTO audit_logs (actor_uid, action, target_type, target_id, details) VALUES (?, ?, ?, ?, ?)`
    ).run(actorUid || '', action, targetType, String(targetId), details.slice(0, 500));
  } catch {
    // Non-blocking audit logging
  }
}
