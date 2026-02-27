# Tango

Tango is a full-stack RPC (Remote Procedure Call) framework for TypeScript projects. It simplifies the communication between the client and the server by providing a type-safe API.

## Installation

```bash
npm install @atom-forge/tango-rpc
pnpm add @atom-forge/tango-rpc
yarn add @atom-forge/tango-rpc
bun add @atom-forge/tango-rpc
```

## Core Concept: End-to-End Type Safety

Tango's main feature is providing end-to-end type safety between your server and client. You define your API on the server, and then share the type of that definition with the client. This gives you autocompletion and type checking for your API calls.

**1. Define your API and create a handler on the server:**

```typescript
// src/hooks.server.ts (or your server's entry point)
import { createHandler, tango } from '@atom-forge/tango-rpc';

const api = {
  posts: {
    list: tango.query(async ({ page }: { page: number }, ctx) => {
      // ... fetch posts
      return { posts: [{ id: 1, title: 'Hello' }] };
    }),
    create: tango.command(async ({ title }: { title: string }) => {
      // ... create post
      return { success: true };
    }),
  },
};

// The handler and the definition are created here.
// The definition is what we'll use on the client.
export const [handler, definition] = createHandler(api);
```

**2. Use the type on the client:**

```typescript
// src/lib/client/tango.ts
import { createClient } from '@atom-forge/tango-rpc';
import { definition } from '../../hooks.server'; // Import the definition object

const [api, cfg] = createClient<typeof definition>('/api/tango');

// Autocompletion and type checking for arguments and return types!
const result = await api.posts.list.$query({ page: 1 });
// result is typed as { posts: { id: number, title: string }[] }

await api.posts.create.$command({ title: 'My New Post' });

export default api;
```

## Communication Protocol

Tango uses **MessagePack** as its primary communication protocol for efficiency and performance. For clients that do not support MessagePack, it can fall back to **JSON**.

- **`$command`**: Sends data in the request body, encoded with MessagePack (`application/msgpack`). Plain JSON (`application/json`) is also accepted by the server.
- **`$query`**: Sends data in the URL's query string, encoded with MessagePack and Base64. This is the recommended method for queries.
- **`$get`**: Sends data as plain text in the URL's query string. This is useful for clients that do not support MessagePack, or for simple, non-complex queries.

The server will automatically detect the client's `Accept` header and respond with either MessagePack or JSON.

### Response Headers

Every response includes the following headers:

| Header | Description |
|---|---|
| `X-Tango-Execution-Time` | Server-side execution time in milliseconds. |
| `X-Tango-Validation-Error` | Set to `"true"` when a Zod validation error occurs (status 422). |

## Client-side Usage

### `createClient`

The `createClient` function is used to create a new API client. The way you call an endpoint on the client (`$query` or `$get`) must match how it was defined on the server (`tango.query` or `tango.get`).

```typescript
import { createClient } from '@atom-forge/tango-rpc';
import { definition } from '../../hooks.server'; // Import the definition object from your server

const [api, cfg] = createClient<typeof definition>('/api/tango');

// If the server endpoint is defined with tango.query:
const result = await api.posts.list.$query({ page: 1 });

// Example of calling a command
await api.posts.create.$command({ title: 'Hello World' });
```

You can also enable debug logging for all calls made through the client:

```typescript
const [api, cfg] = createClient<typeof definition>('/api/tango', { debug: true });
```

### Call Options

Every RPC method (`$command`, `$query`, `$get`) accepts an optional second argument with per-call options:

```typescript
const result = await api.posts.list.$query({ page: 1 }, {
  // Abort the request using an AbortController
  abortSignal: controller.signal,

  // Track upload/download progress (uses XHR internally)
  onProgress: ({ loaded, total, percent, phase }) => {
    console.log(`${phase}: ${percent}%`);
  },

  // Add custom request headers for this call only
  headers: new Headers({ 'X-Custom-Header': 'value' }),

  // Enable per-call debug logging
  debug: true,
});
```

### Accessing the Full Context (`_ctx` variants)

Each RPC method has a `_ctx` counterpart that returns the full `ClientContext` instead of just the result. This is useful when you need access to the response object or other context metadata.

```typescript
const ctx = await api.posts.list.$query_ctx({ page: 1 });
console.log(ctx.result);           // the typed result
console.log(ctx.response?.status); // the raw Response
console.log(ctx.elapsedTime);      // client-side elapsed time in ms
```

The available `_ctx` variants are: **`$command_ctx`**, **`$query_ctx`**, **`$get_ctx`**.

### File Uploads

`$command` endpoints automatically detect `File` or `File[]` values in the arguments and switch to a `multipart/form-data` request. You can combine file uploads with regular arguments and track progress.

```typescript
// Server-side
const api = {
  posts: {
    create: tango.command(async ({ title, cover }: { title: string; cover: File }) => {
      // cover is a File object
    }),
  },
};

// Client-side
const coverFile = document.querySelector('input[type=file]').files[0];

await api.posts.create.$command(
  { title: 'Hello', cover: coverFile },
  {
    onProgress: ({ percent, phase }) => console.log(`${phase}: ${percent}%`),
  }
);
```

For multiple files, use an array and suffix the key with `[]`:

```typescript
// Server-side
const api = {
  media: {
    upload: tango.command(async ({ files }: { files: File[] }) => { ... }),
  },
};

// Client-side
await api.media.upload.$command({ 'files[]': selectedFiles });
```

### `makeClientMiddleware`

The `makeClientMiddleware` function is used to create a client-side middleware.

> ⚠️ **Always `return await next()`** in your middleware. If you call `next()` without returning its result, the response will be lost and the caller will receive `undefined`.

```typescript
import { makeClientMiddleware } from '@atom-forge/tango-rpc';

const loggerMiddleware = makeClientMiddleware(async (ctx, next) => {
  console.log('Request:', ctx.path, ctx.getArgs());
  const result = await next(); // ✅ always return the result of next()
  console.log('Response:', ctx.result);
  return result;
});

// Apply middleware to all routes
cfg.$ = loggerMiddleware;
```

## Server-side Usage

### `createHandler`

The `createHandler` function creates a request handler for your server and returns the handler and a typed API definition.

```typescript
import { createHandler, tango } from '@atom-forge/tango-rpc';

const api = {
  posts: {
    // This endpoint expects a $query call from the client
    list: tango.query(async ({ page }, ctx) => {
      ctx.cache.set(60);
      return { posts: [] };
    }),
    // This endpoint expects a $get call from the client
    getById: tango.get(async ({ id }, ctx) => {
      return { id, title: 'Example Post' };
    }),
    // This endpoint expects a $command call from the client
    create: tango.command(async ({ title }) => {
      // create a new post
    }),
  },
};

export const [handler, definition] = createHandler(api);
```

#### Custom Server Context

You can provide a custom server context factory to inject your own properties (e.g. authenticated user) into every handler:

```typescript
import { createHandler, ServerContext } from '@atom-forge/tango-rpc';

class AppContext extends ServerContext {
  get user() {
    return this.event.locals.user;
  }
}

export const [handler, definition] = createHandler(api, {
  createServerContext: (args, event) => new AppContext(args, event),
});
```

### `tango` object

The `tango` object provides methods for defining your API endpoints. The method you use on the server determines how the client must call the endpoint.

*   `tango.query`: Defines a query endpoint that expects arguments encoded with MessagePack. The client must use **`$query`**.
*   `tango.get`: Defines a query endpoint that expects arguments as plain text in the URL. The client must use **`$get`**.
*   `tango.command`: Defines a command endpoint. The client must use **`$command`**.

#### `tangoFactory`

If you use a custom server context (see above), use `tangoFactory` to create a typed `tango` instance so that `ctx` is properly typed in your handlers:

```typescript
import { tangoFactory } from '@atom-forge/tango-rpc';

const tango = tangoFactory<AppContext>();

const api = {
  posts: {
    list: tango.query(async ({ page }, ctx) => {
      // ctx is typed as AppContext
      const user = ctx.user;
      return { posts: [] };
    }),
  },
};
```

### Server Context (`ctx`)

Every handler and server-side middleware receives a `ctx` object with the following members:

| Member | Description |
|---|---|
| `ctx.event` | The raw SvelteKit `RequestEvent`. |
| `ctx.getArgs()` | Returns all arguments as a plain object. |
| `ctx.args` | The arguments as a `Map<string, any>`. |
| `ctx.cookies` | Shorthand for `ctx.event.cookies`. |
| `ctx.headers.request` | The incoming request headers. |
| `ctx.headers.response` | The mutable response headers. |
| `ctx.cache.set(seconds)` | Sets the `Cache-Control` max-age for GET responses. |
| `ctx.cache.get()` | Returns the current cache duration. |
| `ctx.status.set(code)` | Sets the HTTP response status code. |
| `ctx.status.notFound()` | Shorthand for common HTTP codes (see below). |
| `ctx.env` | A `Map<string\|symbol, any>` for passing data between middlewares. |
| `ctx.elapsedTime` | Server-side elapsed time in milliseconds. |

**Status shortcuts:** `ok`, `created`, `accepted`, `noContent`, `badRequest`, `unauthorized`, `forbidden`, `notFound`, `methodNotAllowed`, `conflict`, `tooManyRequests`, `serverError`, `serviceUnavailable`, and more.

### Caching

Tango supports server-side caching for `GET` requests (both `tango.query` and `tango.get`). You can set the cache duration in seconds using the `ctx.cache.set()` method within your endpoint implementation.

```typescript
const api = {
  posts: {
    list: tango.query(async ({ page }, ctx) => {
      ctx.cache.set(60); // Cache the response for 60 seconds
      return { posts: [] };
    }),
  },
};
```

### Error Handling

To send an error from the server, you can set the HTTP status code using `ctx.status` and return a value with the error details.

```typescript
const api = {
  posts: {
    get: tango.query(async ({ id }, ctx) => {
      const post = await db.getPost(id);
      if (!post) {
        ctx.status.notFound(); // Sets the status to 404
        return { error: 'Post not found' };
      }
      return post;
    }),
  },
};
```

### `zod` integration

Tango has built-in support for `zod` for input validation. The package re-exports zod's `z` under the name **`tz`** ("tango-zod") to avoid potential version conflicts when your project uses a different version of zod.

```typescript
import { tz } from '@atom-forge/tango-rpc';
// tz is the same as z from zod, but guaranteed to be the version tango was built with
```

If a validation fails, Tango will automatically return a `422 Unprocessable Entity` response with the `X-Tango-Validation-Error: true` header. The body of the response will contain an array of `ZodIssue` objects.

```typescript
// Server-side
import { tango, tz } from '@atom-forge/tango-rpc';

const api = {
  posts: {
    create: tango.zod({
      title: tz.string().min(3, "Title must be at least 3 characters long."),
      content: tz.string().min(10),
    }).command(async ({ title, content }) => {
      // This code only runs if validation passes
    }),
  },
};
```

`tango.zod` also works with `query` and `get`:

```typescript
tango.zod({ id: tz.number() }).query(async ({ id }, ctx) => { ... })
tango.zod({ id: tz.number() }).get(async ({ id }, ctx) => { ... })
```

You can catch and handle these validation errors on the client.

```typescript
// Client-side
try {
  await api.posts.create.$command({ title: 'Hi' });
} catch (error: any) {
  if (error.response?.status === 422) {
    const validationErrors = await error.response.json();
    // validationErrors is an array of ZodIssue objects
    console.log(validationErrors); 
  }
}
```

### `makeServerMiddleware`

The `makeServerMiddleware` function is used to create a server-side middleware. An optional second argument lets you attach accessor functions to the middleware, which is useful for creating reusable, self-contained middleware with helpers.

> ⚠️ **Always `return await next()`** in your middleware. If you call `next()` without returning its result, the handler's return value will be lost and the client will receive `undefined`.

```typescript
import { makeServerMiddleware } from '@atom-forge/tango-rpc';

const authMiddleware = makeServerMiddleware(
  async (ctx, next) => {
    if (!ctx.event.locals.user) {
      ctx.status.unauthorized();
      return { error: 'Unauthorized' }; // ✅ early return, no next() call needed
    }
    return await next(); // ✅ always return the result of next()
  },
  // Optional accessors attached to the middleware function itself
  {
    admin: (ctx) => ctx.event.locals.user?.role === 'admin',
  }
);
```

### Applying Middleware with `tango.middleware`

Use `tango.middleware()` to attach one or more server middlewares to an endpoint:

```typescript
import { tango, tz } from '@atom-forge/tango-rpc';

// Apply middleware to a specific endpoint
const api = {
  posts: {
    create: tango.middleware(authMiddleware).command(async ({ title }) => {
      // ...
    }),
    // Combine middleware with zod validation
    update: tango.middleware(authMiddleware).zod({
      id: tz.number(),
      title: tz.string(),
    }).command(async ({ id, title }) => {
      // ...
    }),
  },
};
```

You can also attach middleware to any existing object with `.on()`:

```typescript
const postsApi = {
  list: tango.query(async () => { ... }),
  create: tango.command(async () => { ... }),
};

// Attach authMiddleware to the whole postsApi group
tango.middleware(authMiddleware).on(postsApi);

const api = { posts: postsApi };
```
