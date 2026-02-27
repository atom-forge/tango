# Tango Framework-Agnosztikussá Tétele Adapterek Segítségével

> **Státusz: tervezett — jövőbeli verzió**

## 1. Probléma

A Tango szerveroldali implementációja (`createHandler`) jelenleg szorosan kötődik a SvelteKit keretrendszerhez: a `RequestEvent` objektumot közvetlenül használja, ami megakadályozza a más keretrendszerekben (Express, Hono, Next.js, Fastify, vanilla Node.js) való alkalmazást.

## 2. Megoldás: Adapter Architektúra

A cél a Tango magjának leválasztása a SvelteKit-specifikus kódtól. A megközelítés a webes szabványokra (`Request`, `Response`) épít — sem saját belső interfészek, sem keretrendszer-import a core-ban.

### Adatfolyam

```
Framework-specifikus kérés
        ↓
    Adapter
  (framework → Request)
        ↓
  Tango Core (coreHandler)
  (Request + routeInfo + adapterContext)
        ↓
  szabványos Response
        ↓
    Adapter
  (Response → framework)
```

### Core Handler Interfésze

```typescript
function createCoreHandler(endpointMap) {
  return async (
    request: Request,
    routeInfo: { path: string },
    adapterContext?: any
  ): Promise<Response>
}
```

- `request` — szabványos Web API `Request`
- `routeInfo.path` — az RPC útvonal (pl. `users.get-profile`)
- `adapterContext` — keretrendszer-specifikus adatok (pl. `cookies`, `req`, `res`) a middleware-ek számára, a core típus-ismerete nélkül

### SvelteKit Adapter (vékony réteg)

SvelteKit már eleve szabványos `Request`/`Response` objektumokat használ, így az adapter minimális:

```typescript
export function createSvelteKitAdapter(apiDefinition) {
  const coreHandler = createCoreHandler(flattenApiDefinition(apiDefinition));

  return async (event: RequestEvent): Promise<Response> =>
    coreHandler(event.request, { path: event.params.path }, { event });
}
```

### Express Adapter

```typescript
export function createExpressAdapter(apiDefinition) {
  const coreHandler = createCoreHandler(flattenApiDefinition(apiDefinition));

  return async (req: ExpressRequest, res: ExpressResponse) => {
    const request = new Request(`${req.protocol}://${req.get("host")}${req.originalUrl}`, {
      method: req.method,
      headers: new Headers(req.headers as Record<string, string>),
      body: req.body ? JSON.stringify(req.body) : null,
    });

    const response = await coreHandler(request, { path: req.params.path }, { req, res });

    res.status(response.status);
    response.headers.forEach((value, key) => res.setHeader(key, value));
    res.send(Buffer.from(await response.arrayBuffer()));
  };
}
```

## 3. Migráció SvelteKit-ről

A jelenlegi `createHandler` visszatérési értéke `[handler, apiDefinition]`. Az adapter architektúra bevezetésekor a `createHandler` wrapper maradhat kompatibilis, belsőleg az adaptert hívva — a breaking change minimalizálható.

## 4. Előnyök

- A Tango core nem importál semmit a `@sveltejs/kit`-ből
- Új keretrendszer támogatása egyetlen adapter fájl megírásával elvégezhető
- A `coreHandler` szabványos `Request` objektumokkal önállóan tesztelhető
- A flattening architektúra (v0.2.0) közvetlen alapja az adapter-kompatibilis core-nak
