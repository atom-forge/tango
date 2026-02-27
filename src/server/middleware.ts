import type {ServerContext} from "./server-context.js";
import type {ServerMiddleware} from "./types.js";

const MIDDLEWARE = Symbol("MIDDLEWARE");

/**
 * Retrieves the middleware functions associated with the given target.
 * @internal
 */
export function getMiddlewares<T = any>(target: any): T[] {
	return target[MIDDLEWARE] || [];
}

/**
 * Adds ServerMiddleware to the given target. When the target is an array, it adds the middlewares to all targets.
 * @param target
 * @param middleware
 * @internal
 */
export function addMiddleware<TARGET>(
	target: TARGET,
	middleware: ServerMiddleware | ServerMiddleware[],
): TARGET {
	if (Array.isArray(target)) {
		target.forEach((item) => addMiddleware(item, middleware));
	} else {
		if (!Array.isArray(middleware)) middleware = [middleware];
		const t = target as any;
		if (!Array.isArray(t[MIDDLEWARE])) t[MIDDLEWARE] = [];
		t[MIDDLEWARE].push(...middleware);
	}
	return target;
}

/**
 * Creates a ServerMiddleware function.
 * @param middleware
 * @param accessors
 */
export function makeServerMiddleware<
	ACCESSORS extends { [key: string]: (ctx: ServerContext) => any },
>(
	middleware: ServerMiddleware,
	accessors?: ACCESSORS,
): ServerMiddleware & ACCESSORS {
	const handler = middleware as any;
	if (accessors) Object.assign(handler, accessors);
	return handler;
}
