const MARKDOWN_IMAGE_RE =
  /!\[[^\]]*\]\((?:data:image\/(?:png|jpeg|gif|webp|bmp);base64,[^)]+|attachment:[^)]+)\)/gi;

export function stripMarkdownImages(markdown: string): string {
  return markdown
    .replace(MARKDOWN_IMAGE_RE, "")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
