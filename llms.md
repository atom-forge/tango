# Tango — LLM Reference

Tango is a full-stack TypeScript RPC framework for SvelteKit. It provides end-to-end type safety between server and client using MessagePack as the primary transport protocol.

## Package

```bash
npm install @atom-forge/tango-rpc
pnpm add @atom-forge/tango-rpc
yarn add @atom-forge/tango-rpc
bun add @atom-forge/tango-rpc
```

## Exports

```typescript
import { createClient, makeClientMiddleware }    from '@atom-forge/tango-rpc'; // client
import { createHandler, tango, tangoFactory, makeServerMiddleware, tz } from '@atom-forge/tango-rpc'; // server
```

- `tz` is zod's `z` re-exported under this name to avoid version conflicts. Use `tz` instead of importing `z` from `zod` directly when working with tango schemas.

---

## Server

### Defining endpoints

Use the `tango` singleton (or a typed instance from `tangoFactory<CTX>()`) to define endpoints:

```typescript
tango.query(async (args, ctx) => result)    // GET /path?args=<msgpack+base64>
tango.get(async (args, ctx) => result)      // GET /path?key=value (plain strings)
tango.command(async (args, ctx) => result)  // POST /path (body: msgpack or JSON)
```

Add Zod validation (`tz` is zod's `z`, re-exported from `@atom-forge/tango-rpc`):

```typescript
import { tango, tz } from '@atom-forge/tango-rpc';

tango.zod({ id: tz.number(), name: tz.string() }).query(...)
tango.zod({ ... }).command(...)
tango.zod({ ... }).get(...)
```

Add server middleware:

```typescript
tango.middleware(mw).query(...)
tango.middleware(mw).command(...)
tango.middleware(mw).zod({ ... }).command(...)
tango.middleware(mw).on(existingObject)  // attach to any object
```

### `createHandler`

```typescript
const [handler, definition] = createHandler(apiObject, {
  createServerContext?: (args, event: RequestEvent) => ServerContext
});
```

- `handler`: `(event: RequestEvent) => Promise<Response>` — wire this to your SvelteKit route.
- `definition`: the same `apiObject`, typed. Export this and import its `typeof` on the client.
- Accepted HTTP methods: `GET` for `query`/`get`, `POST` for `command`.
- Accepted `Content-Type` for POST: `application/msgpack` (default), `application/json`, `multipart/form-data`.

### `tangoFactory`

Creates a typed `tango` instance bound to a custom context type:

```typescript
const tango = tangoFactory<AppContext>();
```

### `makeServerMiddleware`

> ⚠️ Always `return await next()` — omitting the `return` silently drops the handler's result.

```typescript
const mw = makeServerMiddleware(
  async (ctx, next) => {
    // early exit without calling next() is valid:
    // ctx.status.unauthorized(); return { error: '...' };
    return await next(); // ✅ must return
  },
  { optionalAccessor: (ctx) => someValue }  // attached to the function object
);
```

### `ServerContext` — `ctx` properties

| Property | Type | Description |
|---|---|---|
| `ctx.event` | `RequestEvent` | Raw SvelteKit event |
| `ctx.args` | `Map<string, any>` | Parsed request arguments |
| `ctx.getArgs()` | `() => Record<string, any>` | Args as plain object |
| `ctx.cookies` | `Cookies` | Shorthand for `ctx.event.cookies` |
| `ctx.headers.request` | `Headers` | Incoming request headers |
| `ctx.headers.response` | `Headers` | Mutable outgoing response headers |
| `ctx.cache.set(n)` | `(seconds: number) => void` | Set `Cache-Control` max-age (GET only) |
| `ctx.cache.get()` | `() => number` | Get current cache value |
| `ctx.status.set(n)` | `(code: number) => void` | Set response status code |
| `ctx.status.<shortcut>()` | `() => void` | e.g. `notFound()`, `unauthorized()`, `created()` |
| `ctx.env` | `Map<string\|symbol, any>` | Shared state across middlewares |
| `ctx.elapsedTime` | `number` | ms since context was created |

**All status shortcuts:** `continue`, `switchingProtocols`, `processing`, `ok`, `created`, `accepted`, `noContent`, `resetContent`, `partialContent`, `multipleChoices`, `movedPermanently`, `found`, `seeOther`, `notModified`, `temporaryRedirect`, `permanentRedirect`, `badRequest`, `unauthorized`, `paymentRequired`, `forbidden`, `notFound`, `methodNotAllowed`, `notAcceptable`, `conflict`, `gone`, `lengthRequired`, `preconditionFailed`, `payloadTooLarge`, `uriTooLong`, `badContent`, `rangeNotSatisfiable`, `expectationFailed`, `tooManyRequests`, `serverError`, `notImplemented`, `badGateway`, `serviceUnavailable`, `gatewayTimeout`, `httpVersionNotSupported`.

### Response headers sent by the server

| Header | When |
|---|---|
| `X-Tango-Execution-Time` | Always — server-side execution time in ms |
| `X-Tango-Validation-Error` | On Zod failure — value `"true"`, status 422 |
| `Content-Type` | `application/msgpack` or `application/json` (based on `Accept` header) |
| `Cache-Control` | Only on GET when `ctx.cache.set(n)` was called |

### Zod validation errors

- Status: `422`
- Body: `ZodIssue[]` (msgpack or JSON depending on `Accept`)
- Header: `X-Tango-Validation-Error: true`

---

## Client

### `createClient`

```typescript
const [api, cfg] = createClient<typeof definition>(
  baseUrl: string = '/api',
  options?: { debug?: boolean }
);
```

- `api`: recursive proxy matching the server API shape.
- `cfg`: middleware configuration proxy.

### Calling endpoints

```typescript
// Returns just the result
const result = await api.posts.list.$query(args, options?)
const result = await api.posts.create.$command(args, options?)
const result = await api.posts.getById.$get(args, options?)

// Returns the full ClientContext
const ctx = await api.posts.list.$query_ctx(args, options?)
const ctx = await api.posts.create.$command_ctx(args, options?)
const ctx = await api.posts.getById.$get_ctx(args, options?)
```

### `CallOptions`

```typescript
type CallOptions = {
  abortSignal?: AbortSignal;
  onProgress?: (p: { loaded: number; total: number; percent: number; phase: 'upload' | 'download' }) => void;
  headers?: Headers;
  debug?: boolean;
}
```

- When `onProgress` is provided, the request uses **XHR** instead of `fetch`.

### File uploads

Pass `File` or `File[]` as an argument value in a `$command` call. Tango automatically switches to `multipart/form-data`. For arrays, suffix the key with `[]`:

```typescript
await api.media.upload.$command({ 'files[]': fileArray });
```

### `ClientContext` properties

| Property | Type | Description |
|---|---|---|
| `ctx.result` | `T \| undefined` | The typed result |
| `ctx.response` | `Response \| undefined` | The raw Response object |
| `ctx.path` | `string[]` | Request path segments |
| `ctx.args` | `Map<string, any>` | Arguments map |
| `ctx.getArgs()` | `() => Record<string, any>` | Args as plain object |
| `ctx.rpcType` | `'query' \| 'command' \| 'get'` | RPC method type |
| `ctx.elapsedTime` | `number` | ms since context was created |
| `ctx.env` | `Map<string\|symbol, any>` | Shared state across middlewares |
| `ctx.abortSignal` | `AbortSignal \| undefined` | The abort signal if provided |
| `ctx.onProgress` | `OnProgress \| undefined` | The progress callback if provided |
| `ctx.request.headers` | `Headers` | Outgoing request headers |

### Applying client middleware

```typescript
cfg.$ = mw                   // global (all routes)
cfg.posts.$ = mw             // all endpoints under /posts
cfg.posts.create = mw        // single endpoint /posts/create
cfg.posts.create = [mw1, mw2] // multiple middlewares
```

### `makeClientMiddleware`

> ⚠️ Always `return await next()` — omitting the `return` silently drops the response.

```typescript
const mw = makeClientMiddleware(async (ctx, next) => {
  // before request
  const result = await next(); // ✅ must return
  // after request — ctx.result is available
  return result;
});
```

---

## Protocol details

| RPC type | HTTP method | Args encoding | Body |
|---|---|---|---|
| `get` | GET | `?key=value` (plain strings) | — |
| `query` | GET | `?args=<base64url(msgpack(args))>` | — |
| `command` (no files) | POST | — | `msgpack(args)` or `JSON(args)` |
| `command` (with files) | POST | — | `multipart/form-data` (args blob + file parts) |

Response body is `msgpack` by default. Send `Accept: application/json` to get JSON instead.

---

## SvelteKit wiring example

```typescript
// src/routes/api/tango/[...path]/+server.ts
import { handler } from '$lib/server/tango';
export const GET = handler;
export const POST = handler;
```

