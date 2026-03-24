export default function handler(req, res) {
  const commit =
    process.env.VERCEL_GIT_COMMIT_SHA ||
    process.env.VERCEL_GITHUB_COMMIT_SHA ||
    process.env.GITHUB_SHA ||
    'unknown';

  const buildTime = process.env.VITE_BUILD_TIME || 'unknown';
  const mode = process.env.NODE_ENV || 'unknown';

  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.status(200).json({ ok: true, commit, buildTime, mode });
}
