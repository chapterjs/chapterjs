# `components/`: buttons, select menus, modals and embeds

`export const ban = button({ ... })` / `select({ ... })` / `modal({ ... })` / `embed(...)`, from any file of `src/`. **The name of the export is the `custom_id`** (`ban`; a default export takes the name of its file), so users never write an id, and a `custom_id` written by hand is refused (`components` only accepts branded pieces). A list of components is refused: a list has no export name to give each one. All four functions are typed the same everywhere, so they are normal exports of `index.ts`. What every interaction shares (`interactions/`) and the `Interaction` structures are described in `packages/chapterjs/CLAUDE.md`; the translated texts of components in `src/messages/CLAUDE.md`.

Adding a kind of component is a `ComponentKind`, its user function, its `read`/`render` in the declaration, its branch in the router, its docs page and tests.

## `custom-id.ts`: what a component carries

- A component declares its `data` (`data: { userId: 'string', page: 'number' }`, kinds string/number/boolean). `{ type: 'number', default: 4 }` gives a value a default, which makes it optional at the call: `DataInputOf` types what a message gives, `DataValuesOf` what `run` and the texts receive, where it is always there. A component whose values all have defaults is also used as is, like one without data; what is encoded is the value really carried.
- The values are given where the component is put in a message (`ban({ userId })`) and encoded after the name, separated by `:` (escaped in values). Stateless: survives restarts and processes.
- Over 100 characters is an error at the call site saying how much room the id leaves. `readData` returns `null` when an old message carries data of another shape ("This button is out of date.").

## `declared.ts`, `instance.ts`, `layout.ts`, `render.ts`

- `declared.ts`: what the four functions return is a **function** (called with the data, then a look or options) that the loader recognises (`componentStateOf`), checks and **binds to the name of its export** (`bindComponent`): until then it can make nothing, which refuses a component the framework never loaded (one that is not exported). A button, menu or modal without `data` is also a piece by itself (`pieceFunction`: `components: [confirm]`, `showModal(feedback)`). Hot reload needs no care: a file importing a component and the loader import the same module generation.
- `instance.ts`: pieces (`piece(kind, raw)`, branded with `Symbol.for('chapterjs.component')`, public types `ButtonComponent`, `SelectComponent`, `ModalComponent`, `TextComponent`… behind a `declare const brand: unique symbol` so nothing user-made is assignable), `renderedOf()` which refuses anything else with what to use instead, `emojiOf()`.
- `layout.ts`: the inline helpers (`row`, `linkButton`, `premiumButton`, `text`, `section`, `thumbnail`, `gallery`, `file`, `separator`, `container`), each checked at creation, and `autoRows()` (5 buttons per row, a menu alone; rows and V2 pieces kept).
- `render.ts`: `renderComponents()` for a message: auto-rows, 40 components (nested included), 4000 characters of texts, `v2` when any piece is not a row; `payload.ts` then sets `IsComponentsV2` and refuses `content`/`embeds`/`poll` with it. The `embeds` of a message also take embed files (`resolveEmbeds`); `checkEmbed()` is exported for one embed.

## The user functions

- `button.ts` / `select.ts` / `modal.ts` / `embed.ts`: the user functions, their config and context types (`ButtonContext`, `SelectContext` with `values` and `value` typed from `options` or from the entity `type`, `ModalContext` with `fields` typed per field kind through `FieldValuesOf`), and `renderButton/renderSelect/renderModal` (instance from data + look/options/prefill; a modal's fields are wrapped in Labels, a `note` field is a Text Display).
- `component.ts`: what interactive components share (`where`, `who: 'everyone' | 'author'`, `ephemeral`, `data`) and the place types (`PlaceOf<Where, Interaction>`, `InGuild/InPrivate/InDm`), the same shape as `CommandContext`. Also `DynamicText` and `TextContext`: a text may be a string or `({ t, data }) => string`, run when the message is sent (see `messages/`).
- `options.ts`: the three ways to write options (list, label→value object, `RichOption[]`), used by selects, radio and checkbox groups.

## `declaration.ts` and `router.ts`

- `declaration.ts`: the `Declaration` of components, one for the four kinds. `read` refuses a name an id can't hold (a space, a `:`, too long for the data), validates each kind against Discord's limits with a message saying what to write, validates a static embed, and binds the component to its name. `findDuplicates()` reports two components of one kind with the same name (a button and a menu may share one: what was used tells them apart); the later one (file, then export) is left out.
- `router.ts`: Interaction Create of type 3 and 5 → decode the id → the component of that kind and name (the kind comes from the interaction: a button, a menu, a form; else "This button/menu/form is not available any more.") → `resolvePlace` → `who` (from `message.interaction_metadata.user`) → the context (`values` resolved into structures for entity menus, `fields` read from the Labels of a modal submit with `resolved` users/roles/channels/attachments) → `runInteraction`, deferring a component with `deferUpdate` and a modal with `defer`. A component of a message that is itself ephemeral (`MessageFlags.Ephemeral`) is treated as `ephemeral`, for `t` and for the default of its answers, whatever the file says. Embeds are never routed.
- `who: 'author'` and `where` are enforced by the router before `run`. A click on a button whose file is gone, renamed or changed answers the person plainly and runs nothing.
