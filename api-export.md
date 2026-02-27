# Típus- és OpenAPI Dokumentáció Generálása

> **Státusz: tervezett — jövőbeli verzió**

## 1. Probléma

A Tango API definíciója teljes TypeScript típusinformációt hordoz, de ez a tudás jelenleg nem hasznosítható automatikusan:
- A frontend projekteknek manuálisan kell ismerniük az API szignatúráját
- Nincs automatikus OpenAPI/Swagger dokumentáció
- A szerver és kliens típusok szinkronban tartása manuális feladat

## 2. Megközelítés: Single Source of Truth

Az `implementation` függvény visszatérési típusa az egyetlen igazságforrás a válasz típusára vonatkozóan. Nincs külön `zodResponseSchema` — a build-szkript közvetlenül a TypeScript forráskódból nyeri ki a típusinformációt.

```typescript
export const getProfile = t.zod({ userId: z.string() }).query(
  async (args, ctx) => {
    return await db.findUser(args.userId);
    // ↑ ennek a visszatérési típusa generálódik automatikusan
  }
);
```

## 3. Generálási Folyamat

A build-szkript (`scripts/generate-exports.ts`) **`ts-morph`** alapon dolgozik — nem a lefordított JS-t, hanem a TS forráskódot elemzi:

1. Beolvassa a TypeScript projektet (`new Project()`)
2. Megkeresi az összes API végpont definíciót
3. Minden végpontnál:
   - **Bemenet:** `zodSchema` → `zod-to-ts` konverzió
   - **Kimenet:** `implementation` visszatérési típus → `ts-morph` `getReturnType()`
4. A gyűjtött információkból generálja a kimeneti fájlokat

## 4. Generált Kimenetek

### `.d.ts` — Kliens típusdefiníció

```typescript
// tango-client.d.ts — automatikusan generált, ne szerkeszd!

type GetProfileArgs = { userId: string };
type GetProfileResponse = Promise<{ id: string; name: string; email: string }>;

export interface TangoClient {
  users: {
    getProfile: {
      $query: (args: GetProfileArgs) => GetProfileResponse;
    };
  };
}
```

A frontend projekt ezt importálja a `createClient<TangoClient>()` híváshoz — teljes típusbiztonság, manuális karbantartás nélkül.

### `openapi.json` — OpenAPI 3.0 Specifikáció

A TypeScript típusból JSON Schema generálás **`ts-json-schema-generator`** segítségével:

- Request body / query paraméterek: `zodSchema` → `zod-to-openapi`
- Response séma: `implementation` visszatérési típus → JSON Schema → OpenAPI `200 OK`

Az elkészült specifikáció közvetlenül használható Swagger UI-jal, Redoc-cal, vagy kliens SDK generátorral.

## 5. Előnyök

- **Nulla duplikáció:** a szerver kód változásakor a kliens típusok és a dokumentáció automatikusan frissülnek
- **Biztonságos refaktorálás:** ha az `implementation` visszatérési típusa változik, a build azonnal jelzi a kliens-oldali inkompatibilitást
- **Ökoszisztéma-kompatibilitás:** az OpenAPI specifikáció révén a Tango API integrálható marad külső eszközökkel

## 6. Kapcsolódás a Flattening Architektúrához

A generátor a `flattenApiDefinition` logikájához hasonlóan járja be a definíció fát, de build-time TypeScript elemzéssel. Az egyező kulcskonvenció (kebab-case, pont-szeparátor) lehetővé teszi, hogy a generált `.d.ts` az URL-ekkel is konzisztens legyen.
