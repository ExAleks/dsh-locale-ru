/**
 * Host half of the Russian language pack.
 *
 * The locale catalog and dictionaries live in the browser half (`./client`); the
 * Host row exists so the bundle is a plugin the profile can load, select and
 * unload. It registers nothing Host-facing, so `apply` is intentionally empty.
 */
export function apply() {}
