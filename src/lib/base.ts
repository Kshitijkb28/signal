/** Base path for GitHub *project* pages (`NEXT_PUBLIC_BASE_PATH="/repo"`); empty for user sites and Vercel. */
export const BASE_PATH = process.env.NEXT_PUBLIC_BASE_PATH ?? "";

/** Prefix a root-relative href (`/file.pdf`) with the base path. next/link and next/image do this themselves; raw hrefs do not. */
export function withBase(href: string): string {
  return href.startsWith("/") && !href.startsWith("//") ? `${BASE_PATH}${href}` : href;
}
