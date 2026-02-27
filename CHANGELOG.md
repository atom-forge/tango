# Changelog

## [0.2.0] - 2026-02-27

### Breaking Changes

- **URL formátum megváltozott.** A kliensoldali hívások mostantól pont-szeparátoros, teljes egészében `kebab-case` URL-t generálnak.
  - Régi: `/api/users/getProfile`
  - Új: `/api/users.get-profile`
- **SvelteKit routing:** a `src/routes/api/[...path]/+server.ts` fájlt ajánlott `[path]`-ra cserélni, hogy a régi formátumú kérések ne kerüljenek részleges feldolgozásra.

### Added

- **`flattenApiDefinition`** — a szerver indulásakor az API definícióból egy lapos `Map<string, { rpcType, handler }>` épül fel. Minden `handler` egy előre összerakott pipeline closure (middleware-ek + Zod-validáció + implementation), így kérésenként csak egy `Map.get()` és egy függvényhívás szükséges.
- **`camelToKebabCase`** utility (`src/util/string.ts`) — megosztott segédfüggvény a kliens és szerver között, akronimákat helyesen kezelő regex-szel (`getUserID` → `get-user-id`).
- **415 Unsupported Media Type** válasz ismeretlen `Content-Type` esetén `command` kéréseknél (korábban szótlanul msgpackr-rel próbálkozott).

### Changed

- **`tango.ts` refaktor** — a `query`/`command`/`get` hármas és a Zod-kezelés duplikációja megszűnt. Két belső helper (`makeDescriptor`, `makeZodMethodSet`) váltja ki a korábbi ~195 soros, triplikált logikát (~76 sorra csökkentve).
- **`endpointMap`** — a korábbi félrevezető `flatMap` név helyett.
- **Kliens debug logging** — `isDebug` konstans (korábban kétszer kiértékelt feltétel); hiba esetén az error a konzolcsoporton belül jelenik meg, a csoport mindig bezárul (korábban pipeline-hiba esetén nyitva maradt).
- **Kliens `middlewareMap` kulcsok** — az új URL-konvencióval konzisztens formátumra frissítve (`.` szeparátor, kebab-case).

### Fixed

- **Heterogén File tömb feltöltés** — a feltöltési logika mostantól az összes tömbelemre ellenőrzi, hogy `File`-e (`every()`), nem csak az elsőre.
- **`abortSignal` / `onProgress`** — felesleges ternary operátor eltávolítva a `ClientContext` konstruktorában.

---

## [0.1.7] - 2025-xx-xx

Függőség-frissítések, Zod re-export `tz` névvel, kódstílus-egységesítés.

## [0.1.0] - 2025-xx-xx

Kezdeti implementáció: RPC keretrendszer middleware támogatással.
