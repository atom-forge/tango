import {z} from "zod";
import type {RpcMethodDescriptor} from "../client/types.js";
import type {Middleware} from "../util/pipeline.js";
import type {ServerContext} from "./server-context.js";

/**
 * Represents middleware for handling server-specific logic within the application lifecycle.
 * @internal
 */
export type ServerMiddleware<RET = any> = Middleware<ServerContext, RET>;

/**
 * Server-side descriptor that contains the actual implementation.
 * @internal
 */
export interface RpcMethodImplementationDescriptor<
	ARGS,
	RET,
	Type extends "query" | "command" | "get",
> extends RpcMethodDescriptor {
	rpcType: Type;
	zodSchema?: z.ZodSchema<ARGS>;
	implementation: (args: ARGS) => RET | Promise<RET>;
}

/**
 * Helper type for extracting the Zod schema
 * @internal
 */
export type GetZodSchema<T> =
	T extends RpcMethodImplementationDescriptor<any, any, any>
		? T["zodSchema"]
		: undefined;

/**
 * This generic type is for the API definition on the server side.
 * @internal
 */
export type ApiDefinition<T> = {
	[K in keyof T]: T[K] extends RpcMethodImplementationDescriptor<any, any, any>
		? T[K]
		: T[K] extends object
			? ApiDefinition<T[K]>
			: T[K];
};
