/**
 * Build info injected by Vercel / build command.
 * VITE_BUILD_SHA is set by: VITE_BUILD_SHA=$VERCEL_GIT_COMMIT_SHA npm run build
 */
export const BUILD_SHA = (import.meta.env?.VITE_BUILD_SHA ?? 'dev').toString()
