import type {RequestEvent} from "@sveltejs/kit";
import {Packr} from "msgpackr";
import {z} from "zod";
import {pipeline} from "../util/pipeline.js";
import {getMiddlewares} from "./middleware.js";
import {ServerContext} from "./server-context.js";
import type {ApiDefinition, RpcMethodImplementationDescriptor, ServerMiddleware,} from "./types.js";

const packr = new Packr({structuredClone: true, useRecords: true});
const acceptedRequests = ["GET.query", "GET.get", "POST.command"];
const acceptedMethods = ["GET", "POST"];

/**
 * Creates a handler function for processing API requests based on the given API definition.
 *
 * @param {ApiDefinition<any>} apiDefinition - The API definition which describes the methods, their types,
 *                                             and middlewares for handling the request.
 * @param options
 * @param middlewares
 * @return {function(RequestEvent): Promise<Response>} An async function that handles incoming requests
 *                                                     and returns appropriate HTTP responses.
 */
export function createHandler<
	SERVER_CONTEXT extends ServerContext = ServerContext,
	DEF extends ApiDefinition<any> = ApiDefinition<any>,
>(
	apiDefinition: DEF,
	options?: {
		createServerContext?: (args: any, event: RequestEvent) => SERVER_CONTEXT;
	},
): [(arg0: RequestEvent) => Promise<Response>, DEF] {
	const createServerContext =
		options?.createServerContext ||
		((args: any, event: RequestEvent) =>
			new ServerContext(args, event) as SERVER_CONTEXT);
	const handler = async function handler(
		event: RequestEvent,
	): Promise<Response> {
		const params = event.params;
		const request = event.request;

		if (!acceptedMethods.includes(request.method))
			return new Response("Method not allowed", {status: 405});
		if (!params.path)
			return new Response("RPC method not found", {status: 404});

		const [descriptor, middlewares] = findRpcMethodDescriptor(
			params.path.split("/"),
			apiDefinition,
		);
		if (!descriptor)
			return new Response("RPC method not found", {status: 404});

		const {rpcType, implementation, zodSchema} = descriptor;
		if (!acceptedRequests.includes(request.method + "." + rpcType))
			return new Response(
				`RPC type ${rpcType} not allowed for ${request.method} requests`,
				{status: 405},
			);

		let args: any;

		try {
			switch (rpcType) {
				case "get":
					args = parseGet(new URL(request.url));
					break;
				case "query":
					args = parseQuery(new URL(request.url));
					break;
				case "command":
					const requestContentType = request.headers.get("Content-Type") || "";
					if (requestContentType.includes("multipart/form-data")) {
						args = await parseCommandMultipartFormData(request);
					} else if (requestContentType.includes("application/json")) {
						args = await parseCommandJson(request);
					} else {
						args = await parseCommandMsgpackr(request);
					}
					break;
			}
		} catch (e) {
			if (e instanceof ParseError)
				return new Response(e.message, {status: 400});
			console.error("[tango] Unexpected error during request parsing:", e);
			return new Response("Internal server error", {status: 500});
		}

		let result: any;

		const ctx = createServerContext(args, event);

		try {
			result = await pipeline(ctx, ...middlewares, (ctx) => {
				let args = ctx.getArgs();
				if (zodSchema) args = zodSchema.parse(args);
				return (
					implementation as (args: any, ctx: SERVER_CONTEXT) => Promise<any>
				)(args, ctx);
			});
			return makeResponse(result, ctx);
		} catch (e) {
			if (e instanceof z.ZodError) {
				ctx.headers.response.set("X-Tango-Validation-Error", "true");
				ctx.cache.set(0);
				ctx.status.set(422);
				return makeResponse(e.issues, ctx);
			}
			//TODO: Log error
			console.error("[tango] Unhandled error in RPC handler:", e);
			return new Response(`Internal server error`, {status: 500});
		}
	};
	return [handler, apiDefinition];
}

/**
 * Creates an HTTP response with the appropriate body format and headers based on the given context.
 *
 * @param {any} result - The data to include as the response body.
 * @param {ServerContext} ctx - The server context containing request and response details, headers, and other relevant metadata.
 * @return {Response} The constructed HTTP response.
 */
function makeResponse(result: any, ctx: ServerContext): Response {
	const prefersJson = ctx.event.request.headers
		.get("Accept")
		?.includes("application/json");
	ctx.headers.response.set("X-Tango-Execution-Time", `${ctx.elapsedTime}`);
	ctx.headers.response.set(
		"Content-Type",
		prefersJson ? "application/json" : "application/msgpack",
	);
	if (ctx.event.request.method === "GET" && ctx.cache.get()) {
		ctx.headers.response.set(
			"Cache-Control",
			`public, max-age=${ctx.cache.get()}`,
		);
	}

	let body: string | Uint8Array;
	if (prefersJson) {
		body = JSON.stringify(result);
	} else {
		body = new Uint8Array(packr.pack(result));
	}
	return new Response(body as BodyInit, {
		headers: ctx.headers.response,
		status: ctx.status.get(),
	});
}

/**
 * Parses the query parameters from a given URL object and returns them as a key-value pair object.
 *
 * @param {URL} url - The URL object from which query parameters will be extracted.
 * @return {Record<string, any>} An object containing the query parameters as key-value pairs.
 */
function parseGet(url: URL): Record<string, any> {
	let args: Record<string, any> = {};
	url.searchParams.forEach((value, key) => (args[key] = value));
	return args;
}

/**
 * Parses a query string from the given URL and decodes the "args" parameter if present.
 *
 * @param {URL} url - The URL object containing the query string to parse.
 * @return {Record<string, any>} A record containing the parsed and unpacked arguments from the "args" parameter.
 * @throws {ParseError} If the "args" parameter cannot be unpacked due to an invalid msgpackr body.
 */
function parseQuery(url: URL): Record<string, any> {
	let args: Record<string, any> = {};
	try {
		const argsParam = url.searchParams.get("args");
		if (argsParam)
			args = packr.unpack(Buffer.from(argsParam, "base64url")) as Record<
				string,
				any
			>;
	} catch (e) {
		throw new ParseError("Invalid msgpackr body");
	}
	return args;
}

/**
 * Parses the request body as MessagePack using the msgpackr library.
 *
 * @param {Request} request - The HTTP request object containing the MessagePack payload.
 * @return {Promise<Record<string, any>>} A promise that resolves to an object parsed from the MessagePack data.
 * @throws {ParseError} If the request body cannot be parsed as valid MessagePack.
 */
async function parseCommandMsgpackr(
	request: Request,
): Promise<Record<string, any>> {
	let args: Record<string, any> = {};
	try {
		const buffer = new Uint8Array(await request.arrayBuffer());
		if (buffer.length > 0) args = packr.unpack(buffer) || {};
	} catch (e) {
		throw new ParseError("Invalid msgpackr body");
	}
	return args;
}

/**
 * Parses the JSON body of a request and converts it into a JavaScript object.
 *
 * @param {Request} request The incoming HTTP request contains the JSON body to parse.
 * @return {Promise<Record<string, any>>} A promise that resolves to an object representing the parsed JSON.
 * @throws {ParseError} If the JSON body is invalid or cannot be parsed.
 */
async function parseCommandJson(
	request: Request,
): Promise<Record<string, any>> {
	let args: Record<string, any> = {};
	try {
		const text = await request.text();
		if (text) args = JSON.parse(text) || {};
	} catch (e) {
		throw new ParseError("Invalid JSON body");
	}
	return args;
}

/**
 * Parses multipart form data from an HTTP request and extracts the command arguments.
 * Supports different data formats such as JSON and MessagePack for the "args" field.
 * Also processes other form fields, handling arrays and single values.
 *
 * @param {Request} request - The HTTP request containing the multipart form data.
 * @return {Promise<Record<string, any>>} A promise that resolves to an object containing
 *                                        the extracted and parsed arguments.
 * @throws {ParseError} If the "args" field is in an unsupported format or contains invalid data.
 */
async function parseCommandMultipartFormData(
	request: Request,
): Promise<Record<string, any>> {
	let args: Record<string, any> = {};
	const formData = await request.formData();
	const argsBlob = formData.get("args");
	if (argsBlob instanceof Blob) {
		const buffer = new Uint8Array(await argsBlob.arrayBuffer());
		switch (argsBlob.type) {
			case "application/json":
				try {
					args = JSON.parse(new TextDecoder().decode(buffer)) || {};
				} catch (e) {
					throw new ParseError("Invalid JSON in args blob");
				}
				break;
			case "application/msgpack":
				try {
					args = packr.unpack(buffer) || {};
				} catch (e) {
					throw new ParseError("Invalid msgpack in args blob");
				}
				break;
			default:
				throw new ParseError(`Unsupported args type: ${argsBlob.type}`);
		}
	}

	const keys = new Set<string>();
	formData.forEach((_, key) => keys.add(key));
	for (const key of keys) {
		if (key === "args") continue;
		if (key.endsWith("[]")) {
			args[key.substring(0, key.length - 2)] = formData.getAll(key);
		} else {
			args[key] = formData.get(key);
		}
	}
	return args;
}

/**
 * Finds the RPC method descriptor and associated server middleware for a specified path in the API definition.
 *
 * @param pathSegments An array of strings representing the segments of the path being searched.
 * @param apiDefinition The API definition object containing RPC method implementations and middleware.
 * @return A tuple where the first element is the found RPC method descriptor or undefined if no matching method is found,
 *         and the second element is an array of server middleware associated with the path.
 */
function findRpcMethodDescriptor(
	pathSegments: string[],
	apiDefinition: ApiDefinition<any>,
): [
		RpcMethodImplementationDescriptor<any, any, any> | undefined,
	ServerMiddleware[],
] {
	let current: any = apiDefinition;
	const middlewares: ServerMiddleware[] = [...getMiddlewares(apiDefinition)];

	for (let i = 0; i < pathSegments.length; i++) {
		const segment = pathSegments[i];

		if (current && typeof current === "object" && segment in current) {
			current = current[segment];
			middlewares.push(...getMiddlewares(current));
			if (i === pathSegments.length - 1) {
				return current && typeof current === "object" && "rpcType" in current
					? [
						current as RpcMethodImplementationDescriptor<any, any, any>,
						middlewares,
					]
					: [undefined, []];
			}
		} else return [undefined, []];
	}
	return [undefined, []];
}

/**
 * Represents an error that occurs during parsing operations.
 *
 * This class extends the built-in Error object to provide additional
 * context or differentiation for errors specifically related to parsing.
 *
 * Can be used to signal that a parsing operation has failed due to
 * invalid input, unexpected structure, or other parsing-related issues.
 */
class ParseError extends Error {}
