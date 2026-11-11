const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

/** True for a UUID string. Check ids that come from a path before they reach SQL (a bad one would be a database error). */
export function isUuid(value: string): boolean {
  return UUID.test(value);
}

/** Simple email shape check (something@something.tld, no spaces). Length limits are checked by the caller. */
export function isValidEmail(value: string): boolean {
  return EMAIL.test(value);
}
