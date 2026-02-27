import type {ClientMiddleware} from "./types.js";

/**
 * Creates a ClientMiddleware function.
 * @param middleware
 */
export function makeClientMiddleware(middleware: ClientMiddleware) {
	return middleware;
}
