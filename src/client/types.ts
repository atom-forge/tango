import {z} from "zod";
import type {Middleware} from "../util/pipeline.js";
import type {UnwrappedPromise} from "../util/types.js";
import type {ClientContext} from "./client-context.js";

/**
 * Represents a middleware function that operates on the client context during
 * the execution cycle. This middleware type is used to manipulate or process
 * the client context or the result during the middleware chain.
 * @internal
 */
export type ClientMiddleware<RET = any> = Middleware<ClientContext, RET>;

/**
 * A callback type representing a handler for monitoring the progress of a data transfer operation.
 *
 * This type is used to track the progress of an upload or download process by providing
 * periodic updates about the amount of data transferred, the total data size, the percentage
 * completed, and the current phase of the operation (upload or download).
 *
 * @callback OnProgress
 * @param {Object} progress - The progress information of the operation.
 * @param {number} progress.loaded - The amount of data that has been transferred so far.
 * @param {number} progress.total - The total size of the data to be transferred.
 * @param {number} progress.percent - The percentage of the data transfer that has been completed.
 * @param {'upload' | 'download'} progress.phase - The current phase of the data transfer operation, either "upload" or "download".
 * @internal
 */
export type OnProgress = (progress: {
	loaded: number;
	total: number;
	percent: number;
	phase: "upload" | "download";
}) => void;

/**
 * Represents options that can be used to customize the behavior of a call or request.
 * @internal
 */
export type CallOptions = {
	/**
	 * A callback function that gets invoked to report the progress of an ongoing operation.
	 *
	 * This optional property can be used to track and handle progress updates during a process.
	 * The function typically receives information related to the current state or percentage
	 * of completion of the operation.
	 */
	onProgress?: OnProgress;
	/**
	 * An optional AbortSignal object that allows you to communicate with, or to monitor, a cancellation or abort request.
	 * Can be used to terminate an ongoing operation if the associated signal is triggered.
	 */
	abortSignal?: AbortSignal;
	/**
	 * Optional `headers` parameter that represents the HTTP headers
	 * to be sent with the request. It can include custom headers
	 * and standard headers to define how the request should be processed.
	 */
	headers?: Headers;
	debug?: boolean;
};

/** A type that can be either a single middleware or an array of them. */
type MiddlewareAssignable = ClientMiddleware | ClientMiddleware[];

/**
 * This type recursively transforms the structure of ApiClientDefinition<T>
 * into the structure needed for the middleware configuration.
 * Each branch node (group) will have a '$' property for its own middlewares,
 * and each leaf node (endpoint) will be directly assignable.
 */
type MiddlewareConfigFromApi<T> = {
	[K in keyof T]: T[K] extends | { $command: any }
		| { $query: any }
		| { $get: any } // If it's an RPC endpoint (leaf node)
		? MiddlewareAssignable // It can be assigned a middleware or array of middlewares
		: T[K] extends object // If it's a nested object (group/branch node)
			? { $?: MiddlewareAssignable } & MiddlewareConfigFromApi<T[K]> // It can have its own '$' and further nested config
			: never; // Should not happen if T is already ApiClientDefinition<OriginalT>
};

/**
 * The main middleware configuration type. It combines the global '$' with this transformed structure.
 * @internal
 */
export type MiddlewareConfig<T> = {
	$?: MiddlewareAssignable; // Global middleware assignment
} & MiddlewareConfigFromApi<ApiClientDefinition<T>>;

/**
 * Base interface for all RPC method descriptors.
 * @internal
 */
export interface RpcMethodDescriptor {
	rpcType: "query" | "command" | "get";
	zodSchema?: z.ZodSchema<any>;
}

/**
 *The properties are transformed to the target type, or to `never` if they need to be filtered out.
 */
type MappedApi<T> = {
	[K in keyof T]: T[K] extends RpcMethodDescriptor
		? // RPC metódus -> átalakítjuk hívható metódussá
		CallableRpcMethod<GetArgs<T[K]>, GetRet<T[K]>, GetRpcType<T[K]>>
		: T[K] extends object
			? T[K] extends Function | RpcMethodDescriptor
				? never
				: keyof ApiClientDefinition<T[K]> extends never // Itt a módosítás: ellenőrizzük, hogy az eredmény üres-e
					? never // Ha üres, akkor a kulcsot (pl. 'beta') is kiszűrjük
					: ApiClientDefinition<T[K]> // Ha nem üres, megtartjuk
			: never;
};

/**
 * We collect the keys whose values are not `never`.
 */
type FilteredKeys<T> = {
	[K in keyof T]: T[K] extends never ? never : K;
}[keyof T];

/**
 * The final type only contains filtered and transformed properties.
 * @internal
 */
export type ApiClientDefinition<T> = Pick<
	MappedApi<T>,
	FilteredKeys<MappedApi<T>>
>;

/**
 *Extract the ARGS type from the zod schema or the implementation function.
 */
type GetArgs<T> = T extends { zodSchema: z.ZodSchema<infer ZodArgs> }
	? ZodArgs
	: T extends { implementation: (args: infer ARGS) => any }
		? ARGS
		: never;

/**
 *  Extract the RET type from the return value of the implementation function.
 */
type GetRet<T> = T extends { implementation: (args: any) => infer R }
	? UnwrappedPromise<R>
	: never;

/**
 *  Extract the RPC type ('query', 'command', 'get').
 */
type GetRpcType<T> = T extends RpcMethodDescriptor ? T["rpcType"] : never;

/**
 *  Describes the callable method that the proxy returns.
 */
type CallableRpcMethod<
	ARGS,
	RET,
	Type extends "query" | "command" | "get",
> = Type extends "command"
	? {
		$command: (args: ARGS, options?: CallOptions) => Promise<RET>;
		$command_ctx: (
			args: ARGS,
			options?: CallOptions,
		) => Promise<ClientContext<RET>>;
	}
	: Type extends "query"
		? {
			$query: (args: ARGS, options?: CallOptions) => Promise<RET>;
			$query_ctx: (
				args: ARGS,
				options?: CallOptions,
			) => Promise<ClientContext<RET>>;
		}
		: Type extends "get"
			? {
				$get: (args: ARGS, options?: CallOptions) => Promise<RET>;
				$get_ctx: (
					args: ARGS,
					options?: CallOptions,
				) => Promise<ClientContext<RET>>;
			}
			: never;
