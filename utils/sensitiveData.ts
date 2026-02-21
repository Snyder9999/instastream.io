
/**
 * Redacts sensitive information from a string, such as credentials in URLs.
 * Replaces the userinfo part of a URL (username:password) with "***:***".
 *
 * Example:
 * Input: "ffmpeg -i https://user:pass@example.com/video.mp4"
 * Output: "ffmpeg -i https://***:***@example.com/video.mp4"
 *
 * @param text The input string to redact.
 * @returns The redacted string.
 */
export function redactSensitiveInfo(text: string): string {
  // Regex to match protocol://userinfo@host
  // Group 1: Protocol (e.g., https://)
  // Group 2: Userinfo (e.g., user:pass). We ensure it doesn't contain @, /, or whitespace.
  // Group 3: The @ symbol
  const urlCredentialsRegex = /([a-zA-Z][a-zA-Z0-9+.-]*:\/\/)([^@\/\s]+)(@)/g;

  return text.replace(urlCredentialsRegex, (_match, protocol, _userinfo, separator) => {
    return `${protocol}***:***${separator}`;
  });
}
