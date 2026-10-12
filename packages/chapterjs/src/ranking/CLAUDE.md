# `ranking/`: a score per member, kept in order

`export const xp = ranking({ scope?, storage?, order? })`, from any file of `src/`. The name of the export is the name of the ranking (a default export takes the name of its file). A store and a ranking can't share a name: they would share a file in `data/` or a key in Redis, so `cli/project.ts` checks their names together (`sameNames` with the kind of each, "There is already a store named xp, in src/a.ts: the name of the export is the name of the ranking…"). `ranking()` is typed the same everywhere, a normal export of `index.ts`. Where the scores are kept is the store's: see `src/store/CLAUDE.md`.

## `ranking.ts`: what the user holds

- `ranking(config)` returns a `Ranking`: `add(id, points)` (from 0, in one go, the new score), `set(id, score)`, `score(id)`, `rankOf(id)` (from 1), `top(count = 10, skip = 0)` (`RankingEntry[]`: `id`, `score`, `rank` from 1), `remove(id)`, `size()`, `clear()` (how many) and `in(guild)` (a `ScopedRanking` for one server).
- An id is a non-empty text, a score a finite number, a count and a skip whole numbers from 0: each refused with a plain message before anything is asked.
- `order` (`RankingOrder`, `'highest'` by default or `'lowest'`) decides which end `top()` and `rankOf()` start from. Equal scores are ordered by the bytes of the id, reversed for the highest first, as Redis sorts a sorted set (`compareRanked`), so every storage gives the same order.
- The scope is the store's (`scopeParts('ranking', …)` and `guildIdOf` of `store/scope.ts`): per server from the function that runs, `in(guild)` otherwise, `scope: 'global'` for one ranking.
- The state behind `Symbol.for('chapterjs.ranking')` (`rankingStateOf`) holds the config and, once bound (`bindRanking`), the `name`, `scope`, `storage` and `order`; an unbound ranking refuses to serve. On each call it asks `rankingsOf(storeBackend(storage, name))` for its backend.

## `declaration.ts`

The `Declaration` of rankings: `read` checks the keys (`scope`, `storage`, `order`), each value, and that the name can name a file, then binds → `LoadedRanking { name, scope, storage, order }`. `cli/project.ts` loads them with the stores (`rankings`, counted in `summary` as "1 ranking", left out with a `NowhereToKeepError` when kept in Redis without `REDIS_URL`), and `redisStores()` names them for the `ℹ … kept in Redis` line.

Not written yet: an expiration (a sorted set expires as a whole in Redis, not member by member), scores per period (weekly rankings), several scores per member.
