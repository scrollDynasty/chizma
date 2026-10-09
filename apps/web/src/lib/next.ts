const NEXT_KEY = "chizma.next";

/** Only same-app paths are allowed as post-login destinations (no open redirects). */
export function safeNext(value: string | null | undefined): string {
  if (value?.startsWith("/") && !value.startsWith("//") && !value.includes("\\")) return value;
  return "/new";
}

export function rememberNext(path: string): void {
  try {
    sessionStorage.setItem(NEXT_KEY, safeNext(path));
  } catch {
    // ignore: falls back to the default destination
  }
}

export function takeNext(): string {
  try {
    const value = sessionStorage.getItem(NEXT_KEY);
    sessionStorage.removeItem(NEXT_KEY);
    return safeNext(value);
  } catch {
    return safeNext(null);
  }
}
