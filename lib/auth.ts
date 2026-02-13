import { SignJWT, jwtVerify } from 'jose';

export const AUTH_COOKIE = 'vic_auth';
const AUTH_ISSUER = 'vic-duty-roster';
const AUTH_AUDIENCE = 'vic-admin';

const getAuthSecret = () => {
  const secret = process.env.AUTH_SECRET;
  if (!secret) {
    throw new Error('AUTH_SECRET is not configured');
  }
  return new TextEncoder().encode(secret);
};

export const createAuthToken = async () => {
  const secret = getAuthSecret();
  return new SignJWT({ role: 'admin' })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setIssuer(AUTH_ISSUER)
    .setAudience(AUTH_AUDIENCE)
    .setExpirationTime('7d')
    .sign(secret);
};

export const verifyAuthToken = async (token: string) => {
  try {
    await jwtVerify(token, getAuthSecret(), {
      issuer: AUTH_ISSUER,
      audience: AUTH_AUDIENCE
    });
    return true;
  } catch {
    return false;
  }
};
