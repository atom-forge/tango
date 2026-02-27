/**
 * Represents a middleware function.
 *
 * @template T - The type of the state object.
 * @param state - The state object to pass through the middleware.
 * @param next - The next middleware function in the pipeline.
 * @returns A promise that resolves after executing the middleware.
 *
 * @internal
 */
export type Middleware<STATE = any, RESULT = any> = (
	state: STATE,
	next: () => Promise<RESULT>,
) => Promise<RESULT>;

/**
 * Executes a pipeline of middlewares in a specific order.
 *
 * @param {STATE} state - The state object to pass through the pipeline.
 * @param {Array<Middleware<STATE, RESULT>>} middlewares - The middlewares to execute in the pipeline.
 * @returns {Promise<any>} A promise that resolves after executing all middlewares in the pipeline.
 * @template STATE - The type of the state object.
 * @template RESULT - The type of the result object.
 *
 * @internal
 */
export async function pipeline<STATE = any, RESULT = any>(
	state: STATE,
	...middlewares: Array<Middleware<STATE, RESULT>>
): Promise<RESULT> {
	return await execute(state, middlewares, 0);
}

async function execute<STATE = any, RESULT = any>(
	state: STATE,
	middlewares: Array<Middleware<STATE, RESULT>>,
	index: number,
): Promise<RESULT> {
	const middleware = middlewares[index];
	if (!middleware) {
		throw new Error(
			"Pipeline exhausted. Make sure the last middleware in the chain returns a result without calling next().",
		);
	}
	const next = () => execute(state, middlewares, index + 1);
	return await middleware(state, next);
}
