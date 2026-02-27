import {z} from "zod";
import {addMiddleware} from "./middleware.js";
import type {ServerContext} from "./server-context.js";
import type {RpcMethodImplementationDescriptor, ServerMiddleware} from "./types.js";

type RpcType = "query" | "command" | "get";

export function tangoFactory<
	SERVER_CONTEXT extends ServerContext = ServerContext,
>() {
	function makeDescriptor<Type extends RpcType, ARGS, RET>(
		rpcType: Type,
		implementation: (args: ARGS, ctx: SERVER_CONTEXT) => RET | Promise<RET>,
		zodSchema?: z.ZodSchema<ARGS>,
		middleware?: ServerMiddleware | ServerMiddleware[],
	): RpcMethodImplementationDescriptor<ARGS, RET, Type> {
		const descriptor: RpcMethodImplementationDescriptor<ARGS, RET, Type> = {
			rpcType,
			implementation: implementation as (args: ARGS) => RET | Promise<RET>,
			...(zodSchema && {zodSchema}),
		};
		return middleware ? addMiddleware(descriptor, middleware) : descriptor;
	}

	function makeZodMethodSet<TArgsSchema extends Record<string, z.ZodTypeAny>>(
		schemaDef: TArgsSchema,
		middleware?: ServerMiddleware | ServerMiddleware[],
	) {
		const schema = z.object(schemaDef);
		type InferredArgs = z.infer<typeof schema>;
		return {
			query: <TRet>(impl: (args: InferredArgs, ctx: SERVER_CONTEXT) => TRet | Promise<TRet>) =>
				makeDescriptor<"query", InferredArgs, TRet>("query", impl, schema, middleware),
			command: <TRet>(impl: (args: InferredArgs, ctx: SERVER_CONTEXT) => TRet | Promise<TRet>) =>
				makeDescriptor<"command", InferredArgs, TRet>("command", impl, schema, middleware),
			get: <TRet>(impl: (args: InferredArgs, ctx: SERVER_CONTEXT) => TRet | Promise<TRet>) =>
				makeDescriptor<"get", InferredArgs, TRet>("get", impl, schema, middleware),
		};
	}

	return {
		query: <ARGS, RET>(impl: (args: ARGS, ctx: SERVER_CONTEXT) => RET | Promise<RET>) =>
			makeDescriptor("query", impl),
		command: <ARGS, RET>(impl: (args: ARGS, ctx: SERVER_CONTEXT) => RET | Promise<RET>) =>
			makeDescriptor("command", impl),
		get: <ARGS, RET>(impl: (args: ARGS, ctx: SERVER_CONTEXT) => RET | Promise<RET>) =>
			makeDescriptor("get", impl),

		middleware(mw: ServerMiddleware | ServerMiddleware[]) {
			return {
				on<TARGET>(target: TARGET) {
					addMiddleware(target, mw);
					return target;
				},
				query: <ARGS, RET>(impl: (args: ARGS, ctx: SERVER_CONTEXT) => RET | Promise<RET>) =>
					makeDescriptor("query", impl, undefined, mw),
				command: <ARGS, RET>(impl: (args: ARGS, ctx: SERVER_CONTEXT) => RET | Promise<RET>) =>
					makeDescriptor("command", impl, undefined, mw),
				get: <ARGS, RET>(impl: (args: ARGS, ctx: SERVER_CONTEXT) => RET | Promise<RET>) =>
					makeDescriptor("get", impl, undefined, mw),
				zod: <TArgsSchema extends Record<string, z.ZodTypeAny>>(schemaDef: TArgsSchema) =>
					makeZodMethodSet(schemaDef, mw),
			};
		},

		zod: <TArgsSchema extends Record<string, z.ZodTypeAny>>(schemaDef: TArgsSchema) =>
			makeZodMethodSet(schemaDef),
	};
}

export const tango = tangoFactory();
