/**
 * Converts a camelCase string to kebab-case.
 * Handles acronyms correctly: getUserID → get-user-id
 * @internal
 */
export function camelToKebabCase(str: string): string {
	return str
		.replace(/([a-z0-9])([A-Z])/g, "$1-$2")
		.replace(/([A-Z]+)([A-Z][a-z])/g, "$1-$2")
		.toLowerCase();
}
