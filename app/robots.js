import { absoluteUrl } from './lib/site';

export default function robots() {
  return {
    rules: [
      { userAgent: '*', allow: '/', disallow: ['/admin', '/me', '/api/', '/no-access'] },
    ],
    sitemap: absoluteUrl('/sitemap.xml'),
  };
}
