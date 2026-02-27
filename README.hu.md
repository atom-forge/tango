# Tango

A Tango egy teljes stackes RPC (Remote Procedure Call) keretrendszer TypeScript projektekhez. Leegyűsíti a kliens és a szerver közötti kommunikációt egy típusbiztos API biztosításával.

## Telepítés

```bash
npm install @atom-forge/tango-rpc
pnpm add @atom-forge/tango-rpc
yarn add @atom-forge/tango-rpc
bun add @atom-forge/tango-rpc
```

## Alapkoncepció: Végpontok közötti típusbiztonság

A Tango fő funkciója a szerver és a kliens közötti végpontok közötti típusbiztonság biztosítása. Az API-t a szerveren definiálod, majd megosztod a definíció típusát a klienssel. Ez automatikus kiegészítést és típusellenőrzést biztosít az API-hívásokhoz.

**1. Definiáld az API-t és hozd létre a handlert a szerveren:**

```typescript
// src/hooks.server.ts (vagy a szerver belépési pontja)
import { createHandler, tango } from '@atom-forge/tango-rpc';

const api = {
  posts: {
    list: tango.query(async ({ page }: { page: number }, ctx) => {
      // ... bejegyzések lekérése
      return { posts: [{ id: 1, title: 'Helló' }] };
    }),
    create: tango.command(async ({ title }: { title: string }) => {
      // ... bejegyzés létrehozása
      return { success: true };
    }),
  },
};

// A handler és a definíció itt jön létre.
// A definíciót fogjuk majd a kliensen használni.
export const [handler, definition] = createHandler(api);
```

**2. Használd a típust a kliensen:**

```typescript
// src/lib/client/tango.ts
import { createClient } from '@atom-forge/tango-rpc';
import { definition } from '../../hooks.server'; // Importáld a definíció objektumot

const [api, cfg] = createClient<typeof definition>('/api/tango');

// Automatikus kiegészítés és típusellenőrzés az argumentumokhoz és visszatérési típusokhoz!
const result = await api.posts.list.$query({ page: 1 });
// result típusa: { posts: { id: number, title: string }[] }

await api.posts.create.$command({ title: 'Új bejegyzésem' });

export default api;
```

## Kommunikációs protokoll

A Tango elsődlegesen a **MessagePack** protokollt használja a hatékonyság és teljesítmény érdekében. Azon kliensek számára, amelyek nem támogatják a MessagePacket, **JSON** formátumra is visszaeshet.

- **`$command`**: Az adatokat a kérés törzsében küldi, MessagePack kódolással (`application/msgpack`). A szerver az egyszerű JSON-t (`application/json`) is elfogadja.
- **`$query`**: Az adatokat az URL lekérdezési paraméterében küldi, MessagePack és Base64 kódolással. Ez az ajánlott módszer lekérdezésekhez.
- **`$get`**: Az adatokat egyszerű szövegként küldi az URL lekérdezési paraméterében. Hasznos, ha a kliens nem támogatja a MessagePacket, vagy egyszerű, nem összetett lekérdezéseknél.

A szerver automatikusan észleli a kliens `Accept` fejlécét, és vagy MessagePack vagy JSON formátumban válaszol.

### Válasz fejlécek

Minden válasz tartalmazza az alábbi fejléceket:

| Fejléc | Leírás |
|---|---|
| `X-Tango-Execution-Time` | Szerver oldali végrehajtási idő milliszekundumban. |
| `X-Tango-Validation-Error` | `"true"` értékre van állítva, ha Zod validációs hiba történik (422-es státusz). |

## Kliens oldali használat

### `createClient`

A `createClient` függvény új API klienst hoz létre. A kliens oldali hívás módja (`$query` vagy `$get`) meg kell, hogy egyezzen a szerveren definiált módszerrel (`tango.query` vagy `tango.get`).

```typescript
import { createClient } from '@atom-forge/tango-rpc';
import { definition } from '../../hooks.server';

const [api, cfg] = createClient<typeof definition>('/api/tango');

// Ha a szerver oldali endpoint tango.query-vel van definiálva:
const result = await api.posts.list.$query({ page: 1 });

// Command hívás példa
await api.posts.create.$command({ title: 'Hello Világ' });
```

Debug naplózást is engedélyezhetsz az összes híváshoz:

```typescript
const [api, cfg] = createClient<typeof definition>('/api/tango', { debug: true });
```

### Hívási opciók

Minden RPC metódus (`$command`, `$query`, `$get`) egy opcionális második argumentumot fogad el hívás szintű beállításokhoz:

```typescript
const result = await api.posts.list.$query({ page: 1 }, {
  // Kérés megszakítása AbortController segítségével
  abortSignal: controller.signal,

  // Upload/download haladás követése (XHR-t használ belül)
  onProgress: ({ loaded, total, percent, phase }) => {
    console.log(`${phase}: ${percent}%`);
  },

  // Egyedi kérés fejlécek hozzáadása csak ehhez a híváshoz
  headers: new Headers({ 'X-Custom-Header': 'érték' }),

  // Hívás szintű debug naplózás engedélyezése
  debug: true,
});
```

### Teljes kontextus elérése (`_ctx` változatok)

Minden RPC metódusnak van egy `_ctx` párja, amely a teljes `ClientContext` objektumot adja vissza az eredmény helyett. Ez hasznos, ha hozzá kell férned a válasz objektumhoz vagy más kontextus metaadatokhoz.

```typescript
const ctx = await api.posts.list.$query_ctx({ page: 1 });
console.log(ctx.result);           // a típusos eredmény
console.log(ctx.response?.status); // a nyers Response objektum
console.log(ctx.elapsedTime);      // kliens oldali eltelt idő ms-ban
```

Az elérhető `_ctx` változatok: **`$command_ctx`**, **`$query_ctx`**, **`$get_ctx`**.

### Fájlfeltöltés

A `$command` endpointok automatikusan felismerik, ha az argumentumokban `File` vagy `File[]` értékek szerepelnek, és átváltanak `multipart/form-data` kérésre. A fájlfeltöltéseket kombinálhatod normál argumentumokkal, és követheted a haladást.

```typescript
// Szerver oldalon
const api = {
  posts: {
    create: tango.command(async ({ title, cover }: { title: string; cover: File }) => {
      // a cover egy File objektum
    }),
  },
};

// Kliens oldalon
const coverFile = document.querySelector('input[type=file]').files[0];

await api.posts.create.$command(
  { title: 'Helló', cover: coverFile },
  {
    onProgress: ({ percent, phase }) => console.log(`${phase}: ${percent}%`),
  }
);
```

Több fájlhoz használj tömböt és `[]` végzőt a kulcson:

```typescript
// Szerver oldalon
const api = {
  media: {
    upload: tango.command(async ({ files }: { files: File[] }) => { ... }),
  },
};

// Kliens oldalon
await api.media.upload.$command({ 'files[]': selectedFiles });
```

### `makeClientMiddleware`

A `makeClientMiddleware` függvény kliens oldali middleware létrehozására szolgál.

> ⚠️ **Mindig `return await next()`-et használj** a middleware-ben. Ha a `next()` hívás eredményét nem adod vissza, a válasz elvész és a hívó `undefined`-ot kap.

```typescript
import { makeClientMiddleware } from '@atom-forge/tango-rpc';

const loggerMiddleware = makeClientMiddleware(async (ctx, next) => {
  console.log('Kérés:', ctx.path, ctx.getArgs());
  const result = await next(); // ✅ mindig add vissza a next() eredményét
  console.log('Válasz:', ctx.result);
  return result;
});

// Middleware alkalmazása az összes útvonalra
cfg.$ = loggerMiddleware;
```

## Szerver oldali használat

### `createHandler`

A `createHandler` függvény request handlert hoz létre a szerverhez, és visszaadja a handlert és a típusos API definíciót.

```typescript
import { createHandler, tango } from '@atom-forge/tango-rpc';

const api = {
  posts: {
    // Ez az endpoint $query hívást vár a klienstől
    list: tango.query(async ({ page }, ctx) => {
      ctx.cache.set(60);
      return { posts: [] };
    }),
    // Ez az endpoint $get hívást vár a klienstől
    getById: tango.get(async ({ id }, ctx) => {
      return { id, title: 'Példa bejegyzés' };
    }),
    // Ez az endpoint $command hívást vár a klienstől
    create: tango.command(async ({ title }) => {
      // új bejegyzés létrehozása
    }),
  },
};

export const [handler, definition] = createHandler(api);
```

#### Egyedi szerver kontextus

Megadhatsz egyedi szerver kontextus factory-t, hogy saját tulajdonságokat (pl. hitelesített felhasználó) injektálj minden handlerbe:

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

### A `tango` objektum

A `tango` objektum az API endpointok definiálásához nyújt metódusokat. A szerveren használt metódus határozza meg, hogy a kliens hogyan kell meghívja az endpointot.

*   `tango.query`: MessagePack kódolt argumentumokat váró lekérdezési endpointot definiál. A kliensnek **`$query`**-t kell használnia.
*   `tango.get`: Egyszerű szöveges URL argumentumokat váró lekérdezési endpointot definiál. A kliensnek **`$get`**-t kell használnia.
*   `tango.command`: Parancsi endpointot definiál. A kliensnek **`$command`**-t kell használnia.

#### `tangoFactory`

Ha egyedi szerver kontextust használsz (lásd fent), a `tangoFactory` segítségével hozhatsz létre típusos `tango` példányt, hogy a `ctx` megfelelően legyen típusozva a handlerekben:

```typescript
import { tangoFactory } from '@atom-forge/tango-rpc';

const tango = tangoFactory<AppContext>();

const api = {
  posts: {
    list: tango.query(async ({ page }, ctx) => {
      // ctx típusa: AppContext
      const user = ctx.user;
      return { posts: [] };
    }),
  },
};
```

### Szerver kontextus (`ctx`)

Minden handler és szerver oldali middleware kap egy `ctx` objektumot az alábbi tagokkal:

| Tag | Leírás |
|---|---|
| `ctx.event` | A nyers SvelteKit `RequestEvent`. |
| `ctx.getArgs()` | Visszaadja az összes argumentumot egyszerű objektumként. |
| `ctx.args` | Az argumentumok `Map<string, any>` formában. |
| `ctx.cookies` | A `ctx.event.cookies` rövidítése. |
| `ctx.headers.request` | A bejövő kérés fejlécei. |
| `ctx.headers.response` | A módosítható válasz fejlécek. |
| `ctx.cache.set(seconds)` | Beállítja a `Cache-Control` max-age értékét GET válaszoknál. |
| `ctx.cache.get()` | Visszaadja az aktuális cache időtartamát. |
| `ctx.status.set(code)` | Beállítja a HTTP válasz státuszkódját. |
| `ctx.status.notFound()` | Rövidítés a leggyakoribb HTTP kódokhoz (lásd lent). |
| `ctx.env` | `Map<string\|symbol, any>` az adatok middleware-ek közötti átadásához. |
| `ctx.elapsedTime` | Szerver oldali eltelt idő milliszekundumban. |

**Státusz rövidítések:** `ok`, `created`, `accepted`, `noContent`, `badRequest`, `unauthorized`, `forbidden`, `notFound`, `methodNotAllowed`, `conflict`, `tooManyRequests`, `serverError`, `serviceUnavailable`, és még sok más.

### Gyorsítótárazás

A Tango támogatja a szerver oldali gyorsítótárazást `GET` kérésekhez (mind `tango.query`, mind `tango.get` esetén). A cache időtartamát másodpercekben állíthatod be a `ctx.cache.set()` metódussal az endpoint implementációján belül.

```typescript
const api = {
  posts: {
    list: tango.query(async ({ page }, ctx) => {
      ctx.cache.set(60); // Válasz gyorsítótárazása 60 másodpercre
      return { posts: [] };
    }),
  },
};
```

### Hibakezelés

A szerveren lévő hibák küldéséhez állítsd be a HTTP státuszkódot a `ctx.status` segítségével, és adj vissza egy értéket a hiba részleteivel.

```typescript
const api = {
  posts: {
    get: tango.query(async ({ id }, ctx) => {
      const post = await db.getPost(id);
      if (!post) {
        ctx.status.notFound(); // Státusz beállítása 404-re
        return { error: 'A bejegyzés nem található' };
      }
      return post;
    }),
  },
};
```

### `zod` integráció

A Tango beépített `zod` támogatással rendelkezik a bemeneti validációhoz. A csomag a zod `z` objektumát **`tz`** ("tango-zod") névvel re-exportálja, hogy elkerülje az esetleges verziókompatibilitási ütközéseket, ha a projekted más zod verziót használ.

```typescript
import { tz } from '@atom-forge/tango-rpc';
// tz ugyanaz, mint a zod z objektuma, de garantáltan az a verzió, amellyel a tango épült
```

Ha a validáció sikertelen, a Tango automatikusan `422 Unprocessable Entity` választ küld a `X-Tango-Validation-Error: true` fejléccel. A válasz törzse `ZodIssue` objektumok tömbjét fogja tartalmazni.

```typescript
// Szerver oldalon
import { tango, tz } from '@atom-forge/tango-rpc';

const api = {
  posts: {
    create: tango.zod({
      title: tz.string().min(3, "A cím legalább 3 karakter hosszú kell legyen."),
      content: tz.string().min(10),
    }).command(async ({ title, content }) => {
      // Ez a kód csak akkor fut le, ha a validáció sikeres
    }),
  },
};
```

A `tango.zod` `query` és `get` esetén is működik:

```ts
tango.zod({ id: tz.number() }).query(async ({ id }, ctx) => { ... })
tango.zod({ id: tz.number() }).get(async ({ id }, ctx) => { ... })
```

A validációs hibákat a kliensen is elkaphatod és kezelheted.

```typescript
// Kliens oldalon
try {
  await api.posts.create.$command({ title: 'Hi' });
} catch (error: any) {
  if (error.response?.status === 422) {
    const validationErrors = await error.response.json();
    // validationErrors egy ZodIssue objektumokból álló tömb
    console.log(validationErrors);
  }
}
```

### `makeServerMiddleware`

A `makeServerMiddleware` függvény szerver oldali middleware létrehozására szolgál. Egy opcionális második argumentum segítségével accessor függvényeket csatolhatsz a middleware-hez, ami hasznos az újrafelhasználható, önálló middleware-ek és segédprogramok létrehozásához.

> ⚠️ **Mindig `return await next()`-et használj** a middleware-ben. Ha a `next()` hívás eredményét nem adod vissza, a handler visszatérési értéke elvész és a kliens `undefined`-ot kap.

```typescript
import { makeServerMiddleware } from '@atom-forge/tango-rpc';

const authMiddleware = makeServerMiddleware(
  async (ctx, next) => {
    if (!ctx.event.locals.user) {
      ctx.status.unauthorized();
      return { error: 'Nem engedélyezett' }; // ✅ korai visszatérés, next() hívás nem szükséges
    }
    return await next(); // ✅ mindig add vissza a next() eredményét
  },
  // Opcionális accessor-ok, amelyek a middleware függvényhez vannak csatolva
  {
    admin: (ctx) => ctx.event.locals.user?.role === 'admin',
  }
);
```

### Middleware alkalmazása a `tango.middleware` segítségével

Használd a `tango.middleware()` metódust egy vagy több szerver middleware endpoint-hoz csatolásához:

```typescript
import { tango, tz } from '@atom-forge/tango-rpc';

// Middleware alkalmazása egy konkrét endpointra
const api = {
  posts: {
    create: tango.middleware(authMiddleware).command(async ({ title }) => {
      // ...
    }),
    // Middleware kombinálása zod validációval
    update: tango.middleware(authMiddleware).zod({
      id: tz.number(),
      title: tz.string(),
    }).command(async ({ id, title }) => {
      // ...
    }),
  },
};
```

Middleware-t bármilyen meglévő objektumhoz csatolhatsz az `.on()` segítségével:

```typescript
const postsApi = {
  list: tango.query(async () => { ... }),
  create: tango.command(async () => { ... }),
};

// authMiddleware csatolása az egész postsApi csoporthoz
tango.middleware(authMiddleware).on(postsApi);

const api = { posts: postsApi };
```

