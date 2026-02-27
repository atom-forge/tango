import {z} from "zod";
import {addMiddleware} from "./middleware.js";
import type {ServerContext} from "./server-context.js";

import type {RpcMethodImplementationDescriptor, ServerMiddleware,} from "./types.js";

export function tangoFactory<
	SERVER_CONTEXT extends ServerContext = ServerContext,
>() {
	return {
		query: <ARGS, RET>(
			implementation: (args: ARGS, ctx: SERVER_CONTEXT) => RET | Promise<RET>,
		): RpcMethodImplementationDescriptor<ARGS, RET, "query"> => ({
			rpcType: "query",
			implementation: implementation as (args: ARGS) => RET | Promise<RET>,
		}),
		command: <ARGS, RET>(
			implementation: (args: ARGS, ctx: SERVER_CONTEXT) => RET | Promise<RET>,
		): RpcMethodImplementationDescriptor<ARGS, RET, "command"> => ({
			rpcType: "command",
			implementation: implementation as (args: ARGS) => RET | Promise<RET>,
		}),
		get: <ARGS, RET>(
			implementation: (args: ARGS, ctx: SERVER_CONTEXT) => RET | Promise<RET>,
		): RpcMethodImplementationDescriptor<ARGS, RET, "get"> => ({
			rpcType: "get",
			implementation: implementation as (args: ARGS) => RET | Promise<RET>,
		}),

		middleware(middleware: ServerMiddleware | ServerMiddleware[]) {
			return {
				on<TARGET>(target: TARGET) {
					addMiddleware(target, middleware);
					return target;
				},
				get: <ARGS, RET>(
					implementation: (
						args: ARGS,
						ctx: SERVER_CONTEXT,
					) => RET | Promise<RET>,
				): RpcMethodImplementationDescriptor<ARGS, RET, "get"> =>
					addMiddleware(
						{
							rpcType: "get",
							implementation: implementation as (
								args: ARGS,
							) => RET | Promise<RET>,
						},
						middleware,
					),
				query: <ARGS, RET>(
					implementation: (
						args: ARGS,
						ctx: SERVER_CONTEXT,
					) => RET | Promise<RET>,
				): RpcMethodImplementationDescriptor<ARGS, RET, "query"> =>
					addMiddleware(
						{
							rpcType: "query",
							implementation: implementation as (
								args: ARGS,
							) => RET | Promise<RET>,
						},
						middleware,
					),
				command: <ARGS, RET>(
					implementation: (
						args: ARGS,
						ctx: SERVER_CONTEXT,
					) => RET | Promise<RET>,
				): RpcMethodImplementationDescriptor<ARGS, RET, "command"> =>
					addMiddleware(
						{
							rpcType: "command",
							implementation: implementation as (
								args: ARGS,
							) => RET | Promise<RET>,
						},
						middleware,
					),
				zod: <TArgsSchema extends Record<string, z.ZodTypeAny>>(
					schemaDefinition: TArgsSchema,
				) => {
					const schema = z.object(schemaDefinition);
					type InferredArgs = z.infer<typeof schema>;

					return {
						get: <TRet>(
							implementation: (
								args: InferredArgs,
								ctx: SERVER_CONTEXT,
							) => TRet | Promise<TRet>,
						): RpcMethodImplementationDescriptor<InferredArgs, TRet, "get"> =>
							addMiddleware(
								{
									rpcType: "get",
									zodSchema: schema,
									implementation: implementation as (
										args: InferredArgs,
									) => TRet | Promise<TRet>,
								},
								middleware,
							),
						query: <TRet>(
							implementation: (
								args: InferredArgs,
								ctx: SERVER_CONTEXT,
							) => TRet | Promise<TRet>,
						): RpcMethodImplementationDescriptor<InferredArgs, TRet, "query"> =>
							addMiddleware(
								{
									rpcType: "query",
									zodSchema: schema,
									implementation: implementation as (
										args: InferredArgs,
									) => TRet | Promise<TRet>,
								},
								middleware,
							),
						command: <TRet>(
							implementation: (
								args: InferredArgs,
								ctx: SERVER_CONTEXT,
							) => TRet | Promise<TRet>,
						): RpcMethodImplementationDescriptor<
							InferredArgs,
							TRet,
							"command"
						> =>
							addMiddleware(
								{
									rpcType: "command",
									zodSchema: schema,
									implementation: implementation as (
										args: InferredArgs,
									) => TRet | Promise<TRet>,
								},
								middleware,
							),
					};
				},
			};
		},

		zod: <TArgsSchema extends Record<string, z.ZodTypeAny>>(
			schemaDefinition: TArgsSchema,
		) => {
			const schema = z.object(schemaDefinition);
			type InferredArgs = z.infer<typeof schema>;

			return {
				query: <TRet>(
					implementation: (
						args: InferredArgs,
						ctx: SERVER_CONTEXT,
					) => TRet | Promise<TRet>,
				): RpcMethodImplementationDescriptor<InferredArgs, TRet, "query"> => ({
					rpcType: "query",
					zodSchema: schema,
					implementation: implementation as (
						args: InferredArgs,
					) => TRet | Promise<TRet>,
				}),
				command: <TRet>(
					implementation: (
						args: InferredArgs,
						ctx: SERVER_CONTEXT,
					) => TRet | Promise<TRet>,
				): RpcMethodImplementationDescriptor<
					InferredArgs,
					TRet,
					"command"
				> => ({
					rpcType: "command",
					zodSchema: schema,
					implementation: implementation as (
						args: InferredArgs,
					) => TRet | Promise<TRet>,
				}),
				get: <TRet>(
					implementation: (
						args: InferredArgs,
						ctx: SERVER_CONTEXT,
					) => TRet | Promise<TRet>,
				): RpcMethodImplementationDescriptor<InferredArgs, TRet, "get"> => ({
					rpcType: "get",
					zodSchema: schema,
					implementation: implementation as (
						args: InferredArgs,
					) => TRet | Promise<TRet>,
				}),
			};
		},
	};
}

export const tango = tangoFactory();
