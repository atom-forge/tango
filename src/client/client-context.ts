import type {CallOptions, OnProgress} from "./types.js";

/**
 * Represents the context for a client-side operation, holding metadata and options related to the operation.
 * @internal
 */
export class ClientContext<RESULT = any> {
	/** A Map of custom environment variables relevant to the client context. */
	public readonly env: Map<string | symbol, any> = new Map();
	/** An object with methods to set and get cache duration. */
	public readonly abortSignal?: AbortSignal;
	/** An object with methods to set and get cache duration. */
	public readonly onProgress?: OnProgress;
	/** A Map object representing arguments passed to the server */
	public readonly args: Map<string, any>;
	/** The request path segments */
	public readonly path: string[];

	protected _headers: Headers;
	protected _response?: Response;

	/** The result of the operation */
	public result?: RESULT;
	/** The response */
	public get response(): Response | undefined {
		return this._response;
	}
	/** The request */
	public readonly request: { headers: Headers };
	/** The RPC type */
	public readonly rpcType: "command" | "query" | "get";

	private readonly start: number;

	/** Indicates the time elapsed since the creation of the ClientContext instance */
	get elapsedTime() {
		return performance.now() - this.start;
	}

	/**
	 * Creates a new ClientContext instance.
	 * @param path - The path segments of the RPC method.
	 * @param args - The arguments to be passed to the RPC method.
	 * @param rpcType - The type of the RPC call (command, query, or get).
	 * @param options - Optional configuration for the call.
	 */
	constructor(
		path: string[],
		args: Record<string, any> | undefined,
		rpcType: "command" | "query" | "get",
		options: CallOptions = {},
	) {
		this.start = performance.now();
		this.rpcType = rpcType;
		this.path = path;
		this.args = new Map(Object.entries(args || {}));
		const _headers = options.headers ? options.headers : new Headers();
		_headers.set("accept", "application/msgpack");
		this.request = {
			get headers() {
				return _headers;
			},
		};
		this._headers = _headers;
		this.abortSignal = options.abortSignal;
		this.onProgress = options.onProgress;
	}

	getArgs() {
		const obj: Record<string, any> = {};
		for (const [key, value] of this.args) obj[key] = value;
		return obj;
	}
}

/** @internal */
export class WritableClientContext extends ClientContext {
	declare _response: Response | undefined;
}
