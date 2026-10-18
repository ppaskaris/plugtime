import { createRemoteJWKSet, jwtVerify, type JWTVerifyGetKey } from 'jose';

type AccessConfiguration = Pick<Env, 'ACCESS_TEAM_DOMAIN' | 'ACCESS_AUDIENCE' | 'ALLOWED_EMAIL'>;
export function accessConfigured(env: AccessConfiguration) {
  return /^https:\/\/[a-z0-9-]+\.cloudflareaccess\.com$/.test(env.ACCESS_TEAM_DOMAIN) &&
    !!env.ACCESS_AUDIENCE && !!env.ALLOWED_EMAIL;
}
export async function verifiedIdentity(request: Request, env: AccessConfiguration, key?: JWTVerifyGetKey) {
  const token = request.headers.get('Cf-Access-Jwt-Assertion');
  if (!accessConfigured(env) || !token) return null;
  try {
    const keys = key ?? createRemoteJWKSet(new URL(`${env.ACCESS_TEAM_DOMAIN}/cdn-cgi/access/certs`));
    const { payload } = await jwtVerify(token, keys, { issuer: env.ACCESS_TEAM_DOMAIN,
      audience: env.ACCESS_AUDIENCE, algorithms: ['RS256'], requiredClaims: ['sub', 'exp', 'email', 'iat'] });
    return typeof payload.email === 'string' && payload.email.toLowerCase() === env.ALLOWED_EMAIL.toLowerCase() ? { email: payload.email } : null;
  } catch { return null; }
}
export async function authorize(request: Request, env: AccessConfiguration, key?: JWTVerifyGetKey) {
  return !!await verifiedIdentity(request, env, key);
}
