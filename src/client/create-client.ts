import {Packr} from "msgpackr";
import {pipeline} from "../util/pipeline.js";
import {ClientContext, WritableClientContext} from "./client-context.js";
import type {ApiClientDefinition, CallOptions, ClientMiddleware, MiddlewareConfig, OnProgress,} from "./types.js";
import {camelToKebabCase} from "../util/string.js";

const rpcMethods = ["$command", "$query", "$get"];
const rpcContextMethods = ["$command_ctx", "$query_ctx", "$get_ctx"];
const rpcMethodTypeMap = {
    $command: "command",
    $query: "query",
    $get: "get",
    $command_ctx: "command",
    $query_ctx: "query",
    $get_ctx: "get",
};
const packr = new Packr({structuredClone: true, useRecords: true});

/**
 * Creates an API client and a corresponding middleware configuration object.
 *
 * @template T
 * @param {string} [baseUrl='/api'] - The base URL for the API client.
 * @param options
 * @returns {[ApiClientDefinition<T>, MiddlewareConfig<T>]} A tuple containing the API client and the middleware config object.
 */
export function createClient<T>(
    baseUrl: string = "/api",
    options?: { debug?: boolean },
): [ApiClientDefinition<T>, MiddlewareConfig<T>] {
    const debug = !!options?.debug;
    const middlewareMap = new Map<string, ClientMiddleware[]>();

    function createSetterProxy(path: string[]): any {
        const handler = {
            get(_: any, prop: string) {
                return createSetterProxy([...path, prop]);
            },
            set<T extends ClientMiddleware | ClientMiddleware[]>(
                _: any,
                prop: string,
                value: T,
            ): boolean {
                const keyPath = prop === "$" ? path : [...path, prop];
                const key = keyPath.map(camelToKebabCase).join(".");
                const existing = middlewareMap.get(key) || [];
                const newMiddlewares = Array.isArray(value) ? value : [value];
                middlewareMap.set(key, [...existing, ...newMiddlewares]);
                return true;
            },
        };
        return new Proxy({}, handler);
    }

    function createRecursiveProxy(pathSegments: string[] = []): any {
        return new Proxy(
            {},
            {
                get(_target, prop) {
                    if (typeof prop !== "string") return undefined;

                    const isContextRequested = rpcContextMethods.includes(prop);
                    const isResultRequested = rpcMethods.includes(prop);

                    if (isResultRequested || isContextRequested) {
                        const rpcType = rpcMethodTypeMap[
                            prop as keyof typeof rpcMethodTypeMap
                            ] as "command" | "query" | "get";
                        return async (args: any, options: CallOptions = {}) => {
                            const ctx = new ClientContext(
                                pathSegments,
                                args,
                                rpcType,
                                options,
                            );

                            const isDebug = options.debug || debug;

                            if (isDebug) {
                                console.groupCollapsed(
                                    `🔆 %c${baseUrl}/%c${ctx.path.map(camelToKebabCase).join(".")}`,
                                    "font-weight:200; color:gray",
                                    "font-weight:800;",
                                );
                                console.log("ARG:", ctx.getArgs());
                            }

                            const middlewares: ClientMiddleware[] = [];
                            if (middlewareMap.has(""))
                                middlewares.push(...middlewareMap.get("")!);
                            for (let i = 1; i <= ctx.path.length; i++) {
                                const key = ctx.path.slice(0, i).map(camelToKebabCase).join(".");
                                if (middlewareMap.has(key))
                                    middlewares.push(...middlewareMap.get(key)!);
                            }

                            await pipeline(ctx, ...middlewares, async (ctx) => {
                                let result = await call(baseUrl, ctx);
                                ctx.result = result;
                                return result;
                            }).catch((e) => {
                                if (isDebug) {
                                    console.log("ERR:", e);
                                    console.groupEnd();
                                }
                                throw e;
                            });

                            if (isDebug) {
                                const duration = ctx.elapsedTime.toFixed(2);
                                console.log("RES:", ctx.result);
                                if (ctx.response) {
                                    console.log(
                                        `%c${duration} %cms / %c${parseFloat(ctx.response.headers.get("X-Tango-Execution-Time") || "0").toFixed(2)} %cms`,
                                        "font-weight:800;",
                                        "font-weight:200;",
                                        "font-weight:800;",
                                        "font-weight:200;",
                                    );
                                    console.groupEnd();
                                    let color: string;
                                    if (ctx.response.status < 200) color = "#3498db";
                                    else if (ctx.response.status < 300) color = "#2ecc71";
                                    else if (ctx.response.status < 400) color = "#f1c40f";
                                    else if (ctx.response.status < 500) color = "#e74c3c";
                                    else color = "#9b59b6";
                                    console.log(
                                        `️ ↘ %c${ctx.response.status} %c${ctx.response.statusText}`,
                                        `font-weight:800; color: ${color}`,
                                        `font-weight:200; color: ${color}`,
                                    );
                                } else {
                                    console.log(
                                        `%c${duration} %cms %c(no response object)`,
                                        "font-weight:800;",
                                        "font-weight:200; color:gray",
                                    );
                                    console.groupEnd();
                                }
                            }

                            return isContextRequested ? ctx : ctx.result;
                        };
                    }

                    return createRecursiveProxy([...pathSegments, prop]);
                },
            },
        );
    }

    const api = createRecursiveProxy() as ApiClientDefinition<T>;
    const cfg = createSetterProxy([]) as MiddlewareConfig<T>;

    return [api, cfg];
}

async function call(baseUrl: string, ctx: ClientContext) {
    const args = ctx.args;
    const uploads = new Map<string, File | File[]>();

    const isGet = ctx.rpcType === "get";
    const isQuery = ctx.rpcType === "query";
    const isCommand = ctx.rpcType === "command";

    if (isCommand) {
        args.forEach((value, key) => {
            if (
                value instanceof File ||
                (Array.isArray(value) && value.length > 0 && value.every((v: unknown) => v instanceof File))
            ) {
                uploads.set(key, value);
                args.delete(key);
            }
        });
    }

    const hasUploads = !!uploads.size;
    const pathString = ctx.path.map(camelToKebabCase).join(".");
    const url =
        typeof window !== "undefined" && typeof window.document !== "undefined"
            ? new URL(
                `${baseUrl}/${pathString}`,
                window ? window.location.origin : undefined,
            )
            : new URL(`${baseUrl}/${pathString}`);

    const onProgress = ctx.onProgress;
    const hasProgress = !!onProgress;
    const signal = ctx.abortSignal;
    const headers = ctx.request.headers;
    const requestType: "GET" | "QUERY" | "UPLOAD" | "COMMAND" = isGet
        ? "GET"
        : isQuery
            ? "QUERY"
            : hasUploads
                ? "UPLOAD"
                : "COMMAND";
    const method: "GET" | "POST" = isCommand ? "POST" : "GET";

    let body: BodyInit | null = null;

    switch (requestType) {
        case "GET":
            args.forEach(
                (value, key) =>
                    value !== undefined &&
                    value !== null &&
                    url.searchParams.set(key, String(value)),
            );
            break;
        case "QUERY":
            if (args.size > 0)
                url.searchParams.set(
                    "args",
                    encodeToBase64Url(
                        new Uint8Array(packr.pack(Object.fromEntries(args))),
                    ),
                );
            break;
        case "UPLOAD":
            body = new FormData();
            if (args.size > 0) {
                const argsObj = Object.fromEntries(args);
                body.append(
                    "args",
                    new Blob([new Uint8Array(packr.pack(argsObj))], {
                        type: "application/msgpack",
                    }),
                );
            }
            for (let key of uploads.keys()) {
                const file = uploads.get(key);
                if (Array.isArray(file)) {
                    for (const f of file) {
                        body.append(key.endsWith("[]") ? key : `${key}[]`, f, f.name);
                    }
                } else if (file) {
                    body.append(key, file, file.name);
                }
            }
            break;
        case "COMMAND":
            body = new Uint8Array(packr.pack(Object.fromEntries(args)));
            headers.set("Content-Type", "application/msgpack");
            break;
    }

    const response = hasProgress
        ? await fetchWithXhr(url, method, body, headers, onProgress, signal)
        : await fetch(url, {
            method,
            headers,
            body,
            signal,
            credentials: "include",
            window: null,
        });

    (ctx as WritableClientContext)._response = response;

    const buffer = await response.arrayBuffer();

    // Handle empty responses
    if (buffer.byteLength === 0) {
        if (response.status === 204) return null;
        if (!response.ok) throw new Error(`Server error: ${response.status} ${response.statusText}`);
        throw new Error('Unexpected empty response from server for successful request');
    }

    let unpacked: any;
    try {
        unpacked = packr.unpack(new Uint8Array(buffer));
    } catch (error) {
        throw new Error(`Failed to decode server response: ${(error as Error).message}`);
    }

    if (!response.ok) {
        const err = new Error(`Server error: ${response.status} ${response.statusText}`) as any;
        err.response = response;
        err.data = unpacked;
        throw err;
    }

    return unpacked;
}

/**
 * Fetch with XMLHttpRequest for progress tracking and AbortSignal support
 */
function fetchWithXhr(
    url: URL,
    method: "GET" | "POST",
    body: BodyInit | null,
    headers: Headers,
    onProgress?: OnProgress,
    signal?: AbortSignal,
): Promise<Response> {
    return new Promise((resolve, reject) => {
        const xhr = new XMLHttpRequest();

        // 👇 AbortSignal kezelés - ha már megszakított, throw azonnal
        if (signal?.aborted) {
            reject(new DOMException("Request aborted", "AbortError"));
            return;
        }

        // 👇 Signal listener - ha megszakítják, abort az XHR-t
        const abortHandler = () => {
            xhr.abort();
            reject(new DOMException("Request aborted", "AbortError"));
        };

        signal?.addEventListener("abort", abortHandler);

        if (onProgress) {
            if (method === "POST" && body) {
                xhr.upload.addEventListener("progress", (e) => {
                    if (e.lengthComputable)
                        onProgress({
                            loaded: e.loaded,
                            total: e.total,
                            percent: Math.round((e.loaded / e.total) * 100),
                            phase: "upload",
                        });
                });
            }
            xhr.addEventListener("progress", (e) => {
                if (e.lengthComputable)
                    onProgress({
                        loaded: e.loaded,
                        total: e.total,
                        percent: Math.round((e.loaded / e.total) * 100),
                        phase: "download",
                    });
            });
        }

        xhr.addEventListener("load", () => {
            signal?.removeEventListener("abort", abortHandler);
            const headers = new Headers();
            const headerMap = xhr.getAllResponseHeaders();
            headerMap.trim().split(/[\r\n]+/).forEach(line => {
                const separatorIndex = line.indexOf(':');
                if (separatorIndex > 0) {
                    const key = line.substring(0, separatorIndex).trim();
                    const value = line.substring(separatorIndex + 1).trim();
                    headers.append(key, value);
                }
            });
            resolve(
                new Response(xhr.response, {
                    status: xhr.status,
                    statusText: xhr.statusText,
                    headers,
                }),
            );
        });

        xhr.addEventListener("error", () => {
            signal?.removeEventListener("abort", abortHandler);
            reject(new Error("Network error"));
        });

        xhr.addEventListener("abort", () => {
            signal?.removeEventListener("abort", abortHandler);
            reject(new DOMException("Request aborted", "AbortError"));
        });

        xhr.open(method, url);
        headers.forEach((value, key) => {
            xhr.setRequestHeader(key, value);
        });
        xhr.responseType = "arraybuffer";
        xhr.send(body as XMLHttpRequestBodyInit | null);
    });
}

/**
 * Encodes the given binary data into a Base64 URL-safe string.
 *
 * This method converts the provided binary data into a standard Base64 string,
 * then makes it URL-safe by replacing `+` with `-`, `/` with `_`, and removing
 * any padding characters (`=`) from the end.
 *
 * @param {Uint8Array} data - The input binary data to be encoded as a Base64 URL-safe string.
 * @return {string} The Base64 URL-safe encoded string representation of the input data.
 */
function encodeToBase64Url(data: Uint8Array): string {
    const binStr = Array.from(data)
        .map((b) => String.fromCharCode(b))
        .join("");
    const base64 = btoa(binStr);
    return base64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
