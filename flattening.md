# API Útvonal-kezelés Optimalizálása ("Flattening")

> **Státusz: implementálva — v0.2.0**

## 1. Áttekintés

A 0.2.0 verzióban az API definíció "kilapítása" (flattening) kiváltotta a korábbi kérésenként futó, rekurzív `findRpcMethodDescriptor` keresést. A szerver indulásakor egyszer felépül egy lapos `Map`, amely kulcsként az útvonalat, értékként egy előre összerakott pipeline closure-t tartalmaz. Kérésenként egyetlen `Map.get()` hívás és a closure meghívása szükséges.

## 2. URL-konvenció

Minden szinten (névtér és metódusnév) `kebab-case`, elválasztójuk `.`.

| Hívás | URL |
|---|---|
| `api.users.getProfile()` | `/api/users.get-profile` |
| `api.userAccounts.getProfile()` | `/api/user-accounts.get-profile` |
| `api.users.auth.getToken()` | `/api/users.auth.get-token` |

**Régi formátum (0.1.x):** `/api/users/getProfile` — a `/` szeparátor és az eredeti camelCase metódusnév.

## 3. Szerver: `flattenApiDefinition`

A `create-handler.ts`-ben lévő `flattenApiDefinition` rekurzívan bejárja az API definíciót:

1. Minden szinten `camelToKebabCase` konverziót alkalmaz, és ponttal fűzi össze a szinteket.
2. A `Symbol("MIDDLEWARE")` kulcsú middleware tömböket összegyűjti az adott ághoz (szülő objektumokét is beleértve).
3. Levél-csomópontnál (`rpcType` van jelen) az összegyűjtött middleware-ekből, a Zod-validációból és az `implementation`-ből egyetlen `handler` closure-t épít: `(ctx: ServerContext) => Promise<any>`.
4. A `Map`-ben `{ rpcType, handler }` alakban tárolja az eredményt.

A `createHandler` kérés közbeni logikája leegyszerűsödött:
```
map.get(params.path) → rpcType ellenőrzés → args parse → entry.handler(ctx)
```

## 4. Kliens: URL generálás

A `create-client.ts` Proxy-ja a `pathSegments` tömböt az új konvenció szerint fűzi össze:
```typescript
const pathString = ctx.path.map(camelToKebabCase).join(".");
// ['userAccounts', 'getProfile'] → 'user-accounts.get-profile'
```

A `middlewareMap` kulcsai és a debug logging is az új formátumot követik.

## 5. `camelToKebabCase`

Megosztott utility a `src/util/string.ts`-ben. Két regex-lépéssel akronimákat is helyesen kezel:
```typescript
str.replace(/([a-z0-9])([A-Z])/g, "$1-$2")
   .replace(/([A-Z]+)([A-Z][a-z])/g, "$1-$2")
   .toLowerCase()
// getUserID → get-user-id
```

## 6. SvelteKit routing

A `[...path]` rest paraméter helyett `[path]` normál paraméter ajánlott, mivel az új URL-ekben nincs `/` a path részben. Ez megakadályozza, hogy a régi formátumú kérések részlegesen feldolgozásra kerüljenek.

- **Régi:** `src/routes/api/[...path]/+server.ts`
- **Új:** `src/routes/api/[path]/+server.ts`
