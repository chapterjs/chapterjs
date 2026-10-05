# Refonte de la documentation (proposition)

Ce dossier `drafts/` est ignoré par Mintlify (`.mintignore`) : rien ici n'est publié. Il contient cette proposition, le `docs.json` cible et trois pages écrites dans le nouveau format, pour juger sur pièces avant de tout réécrire.

- `docs.json` : la navigation cible, avec les redirections depuis les URL actuelles.
- `setup/project-structure.mdx` : une page de guide nouvelle (structure d'un projet).
- `reference/interaction.mdx` : la page de référence qui manque aujourd'hui.
- `run/troubleshooting.mdx` : une page nouvelle « message → quoi faire ».

## 1. Diagnostic

Le ton est bon (voix de CLAUDE.md : mots simples, « ce qui s'est passé puis quoi faire ») et presque chaque méthode des structures est documentée. Les problèmes sont ailleurs : structure, trous, et deux pages pas dans la voix de la maison.

### Structure

- **Trois groupes à plat** (« Getting Started », « Essentials », « Reference ») sans onglets. « Essentials » mélange trois commandes CLI (`dev`, `build`, `start`), deux fonctionnalités (`commands`, `events`) et un concept (`memory`). La référence, quinze pages, partage la même barre latérale que les guides.
- **Le même mécanisme expliqué deux fois** : les fichiers `_` et les dossiers `(group)` sont expliqués dans `commands.mdx` et dans `events.mdx` ; `where: 'guild' | 'dm' | 'both'` est expliqué dans les deux ; la note « en dev, seulement votre serveur de test » revient quatre fois. Un mécanisme du loader doit avoir une page, et les fonctionnalités y renvoient.
- **Des pages trop longues pour être scannées** : `reference/channels.mdx` (531 lignes, sept classes) et `commands.mdx` (341 lignes).
- **Pas de page pour ce qui précède le code** : créer l'application Discord, le token, l'invitation, les intents privilégiés. Le quickstart suppose que l'application existe ; les messages de `chapterjs dev` y renvoient pourtant.
- **Pas de page « mettre en ligne »** : l'hébergement est enterré en bas de `build.mdx`.

### Trous (vérifiés contre `packages/chapterjs/src`)

- **`Interaction` n'a pas de page.** `index.ts` exporte `Interaction`, `CommandInteraction`, `GuildCommandInteraction`, `DmCommandInteraction`, `PrivateCommandInteraction`, `InteractionReply`, `InteractionReplyOptions` : aucun n'apparaît dans les docs. `commands.mdx` cite `reply`, `defer`, `edit`, `followUp`, `delete`, mais jamais `user`, `guildId`, `channelId`, `answered`, `deferred`, `commandName`, `id`, `createdAt`, ni `toJSON()` (qui cache le token).
- **33 noms exportés n'apparaissent nulle part** : les 17 types de `command()` (`CommandConfig`, `CommandContext`, `OptionValuesOf`, `StringOption`…), les 8 types d'`event()` (`ContextOf`, `EventContexts`, `EventName`…), les 7 d'`Interaction`, et `PermissionFlags`. Ce sont justement les types dont un utilisateur a besoin pour typer une fonction partagée (`function log(ctx: ContextOf<'memberJoin'>)`).
- **Les composants sont un piège.** `reference/sending-messages.mdx` montre comment envoyer des boutons, mais le routeur ignore tout ce qui n'est pas une slash command (`commands/router.ts:60`) : un clic donne « This interaction failed » à l'utilisateur, sans un mot dans les docs. Modals, autocomplétion, menus contextuels, tâches, présence : rien ne dit que ce n'est pas encore là.
- **La page d'accueil promet trop** : « Events, command options, components, modals and config are all typed ». Les modals n'existent pas. CLAUDE.md demande que ses promesses restent justes.
- **La CLI n'a pas de référence** : `sync` n'est cité qu'au passage, `--version`, `NO_COLOR`, les codes de sortie (`1`, `78`) ne sont nulle part.
- `Webhook.toJSON()` (qui cache le token) n'a pas de ligne.

### Voix et exactitude

- `reference/options.mdx` et `reference/data.mdx` sont collés depuis la doc Discord : « Guild name », « Base64 1024x1024 png/jpeg/gif image for the guild icon (can be animated gif when the server has the `ANIMATED_ICON` feature) », « Defaults to... DEFAULT! », des noms en `snake_case` (`rate_limit_per_user`, `MANAGE_THREADS`) dans les descriptions, un champ `region` marqué « deprecated » proposé aux utilisateurs. Le reste des docs parle une autre langue.
- Trois tables dupliquées : `ImageOptions` (dans `user.mdx` et `helpers.mdx`), `BanOptions` (dans `guild.mdx` et `member.mdx`), `ForumTag` (dans `options.mdx` et `data.mdx`).
- `Invite` a deux fois la ligne `inviter`.
- `AGENTS.md` est encore le gabarit vierge de Mintlify (« First-time setup: Customize this file ») et `README.md` le boilerplate du starter : l'IA et les contributeurs n'ont pas le guide de style du site.
- `docs.json` n'a ni onglets, ni icônes, ni `redirects`, ni `seo`, ni `search`.

## 2. Principes de la refonte

1. **Deux onglets, deux lectures.** « Guide » se lit dans l'ordre et apprend ; « Reference » se consulte et liste tout. Un guide n'énumère jamais une API, une référence n'explique jamais un concept : ils se renvoient l'un à l'autre.
2. **Un mécanisme, une page.** Les conventions de fichiers (`_`, `(group)`, imports sans extension, `.chapterjs/`) ont leur page ; `where` est expliqué une fois pour les messages et une fois pour les commandes, avec le même tableau.
3. **La référence est le JSDoc.** Chaque description vient du JSDoc de la source (règle de CLAUDE.md) ; ce que la source ne documente pas est un trou à combler dans la source, pas dans la page. Les descriptions collées depuis Discord sont réécrites dans la voix du projet, en camelCase, avec un seul lien vers la page Discord par table.
4. **Dire ce qui n'existe pas.** Une page « Not yet in ChapterJS » liste ce qui manque et comment le reconnaître (« This interaction failed »), et la page des messages prévient avant de montrer un bouton.
5. **Vérifié par des tests, comme le reste du dépôt.** Les exports sans page, les méthodes documentées qui n'existent plus et les exemples qui ne compilent plus doivent faire échouer `pnpm test`.
6. **Pages courtes, scannables.** Une page par classe de salon, par type d'option, par étape de la CLI. Les propriétés et les champs d'options passent en `<ResponseField>` (nom, type, badge « required »/« deprecated », description longue possible) au lieu de tables à trois colonnes ; chaque méthode garde son titre `###` (une ancre) et son bloc de signature.
7. **On reste sur Mintlify, thème `mint`**, page d'accueil `mode: custom` conservée (ses promesses corrigées). Les commandes restent montrées pour pnpm, npm, yarn, bun dans cet ordre. La langue des docs reste l'anglais.

## 3. Navigation cible

Le fichier complet est `drafts/docs.json`. En résumé :

```
Guide (onglet)
├── Get started
│   ├── index                      Accueil (custom), promesses corrigées
│   ├── quickstart                 Inchangé dans l'esprit, renvoie aux deux pages suivantes
│   ├── setup/discord-application  NOUVEAU : créer l'app, le bot, le token, l'invitation, les intents privilégiés
│   └── setup/project-structure    NOUVEAU : src/, _ et (group), imports, .chapterjs/, .env, scripts, tsconfig
├── Commands
│   ├── commands/index             Un fichier = une commande ; le chemin est le nom ; ce que run reçoit ; qui peut l'utiliser et où
│   ├── commands/options           Déclarer, types, choices, limites
│   ├── commands/answering         reply / defer / ephemeral / followUp / edit / delete ; quand run échoue
│   └── commands/translations      locales
├── Events
│   ├── events/index               Le dossier est l'événement ; plusieurs fichiers ; ce qui ne manque jamais ; quand ça échoue
│   └── events/messages            where, bots, Message Content, ce qui a été supprimé
├── Messages and memory
│   ├── messages                   Envoyer : texte, embeds, fichiers, mentions, sondages ; composants (avec l'avertissement)
│   └── memory                     Inchangé, titre « What your bot remembers »
├── Run your bot
│   ├── run/dev                    ex-/dev
│   ├── run/build                  ex-/build, sans la partie hébergement
│   ├── run/start                  ex-/start
│   ├── run/deploy                 NOUVEAU : installer, builder, démarrer chez un hébergeur ; BOT_TOKEN et DEV_GUILD_ID en prod ; --processes
│   └── run/troubleshooting        NOUVEAU : chaque message de la CLI et de Discord → quoi faire
└── More
    ├── not-yet                    NOUVEAU : composants, modals, autocomplétion, menus contextuels, tâches, présence, plusieurs machines
    └── from-discord-js            NOUVEAU (phase 3) : table de correspondance pour qui vient de discord.js

Reference (onglet)
├── reference/index                ex-overview : les trois règles, camelCase, Maps, ids, reason, limites, logging
├── Your files
│   ├── reference/command          command() : chaque champ de CommandConfig, les types d'options, CommandContext et ses variantes, OptionValuesOf, les limites
│   ├── reference/event            event() : EventOptions, ContextOf, EventContexts, EventName
│   └── reference/events           Un bloc par événement : intents, options, remembers, ce que reçoit la fonction (type exact)
├── Structures
│   ├── reference/guild
│   ├── reference/member
│   ├── reference/user
│   ├── reference/role
│   ├── Channels (groupe)
│   │   ├── reference/channels/index      Quel genre ? ; Channel ; ce que partagent les salons avec messages
│   │   ├── reference/channels/text
│   │   ├── reference/channels/voice
│   │   ├── reference/channels/category
│   │   ├── reference/channels/forum
│   │   ├── reference/channels/thread
│   │   └── reference/channels/dm
│   ├── reference/message
│   ├── reference/interaction         NOUVEAU (échantillon dans drafts/)
│   ├── reference/emoji
│   ├── reference/invite
│   └── reference/webhook
├── Types
│   ├── reference/message-options     MessageOptions, FileInput, Embed, AllowedMentions, PollInput, MessageEditOptions, InteractionReplyOptions, WebhookMessageOptions
│   ├── reference/options             Ce qu'acceptent edit() et create…(), réécrit
│   ├── reference/data                Les objets simples, réécrit
│   ├── reference/permissions
│   ├── reference/enums               ex-values
│   ├── reference/helpers             mentions, dates, ids, images (ImageOptions vit ici seulement)
│   └── reference/errors
└── CLI
    └── reference/cli                 chapterjs dev / build / start --processes / sync, --version, .env et variables (BOT_TOKEN, DEV_GUILD_ID, NODE_OPTIONS, NO_COLOR), codes de sortie, les symboles
```

41 pages contre 23. Chaque ancienne URL est redirigée (`redirects` dans `docs.json`) ; `/commands` et `/events` ne bougent pas puisqu'un `index.mdx` garde l'URL du dossier.

Ce qui n'est **pas** documenté, volontairement : `CHAPTERJS_API_URL`, `CHAPTERJS_IDENTIFY_INTERVAL`, `CHAPTERJS_PROCESS`, `CHAPTERJS_COLORS` (internes, pour les tests et les workers ; CLAUDE.md le dit déjà).

## 4. Gabarits de page

### Page de guide

1. `description` : la promesse en une ligne, à la deuxième personne.
2. Le premier bloc de code tient dans le premier écran, et marche tel quel (un fichier complet avec son chemin en titre : ```` ```ts src/commands/ping.ts ````).
3. Puis « That is all », et seulement ensuite les variantes.
4. Les messages que l'utilisateur verra sont cités tels quels dans un bloc `text`, avec leur symbole.
5. Une note `<Note>` renvoie à la page de référence ; la page ne liste jamais une API complète.
6. Elle finit par deux `<Card>` « Next » au plus.

### Page de référence d'une structure

```
---
title: 'GuildMember'
description: 'A user as a member of one server: nickname, roles, permissions and moderation'
---

Une phrase, puis un exemple de 8 lignes au plus (typé avec `import type`).

## Properties            → <ResponseField name="displayName" type="string"> … </ResponseField>
## Helpers               → ### name() + bloc de signature + description (JSDoc) ; « never send a request »
## Reading from Discord  → ### fetch…()
## Actions               → ### kick() … avec le lien Discord sous la description
## Types                 → seulement ce qui n'a pas de page ailleurs ; sinon un lien
```

Règles : la description est le JSDoc, mot pour mot ; une ligne `[Discord documentation](…)` par méthode qui envoie une requête ; les types d'options partagés (`BanOptions`, `ImageOptions`, `ForumTag`) vivent sur une seule page et sont liés partout ailleurs ; un `?` n'est plus écrit dans le nom, c'est le badge `required` qui parle.

### Page d'événement (dans `reference/events`)

Un `##` par événement, avec un petit tableau fixe : *When* / *Intents* / *Options* / *Remembers*, puis un `<ResponseField>` par champ du contexte avec son type exact (`MemberMessage`, `GuildTextBasedChannel`, `Role` « as it was »…). C'est la seule page où l'on voit, pour `messageDelete`, que `message` est `GuildMessage | null` en serveur et `DmMessage | null` en privé.

### Composants Mintlify utilisés

- `<Tree>` (`Tree.Folder` / `Tree.File`, `highlight`) pour les arborescences, à la place des blocs `text` dessinés à la main.
- `<ResponseField>` pour les propriétés et les champs ; `<Expandable>` pour un objet imbriqué (`colors` d'un rôle, `footer` d'un embed).
- `<Steps>`, `<Accordion>` (une entrée par message dans le dépannage), `<CodeGroup>` (pnpm, npm, yarn, bun), `<Tabs>` quand deux variantes d'un même fichier se comparent (`where: 'dm'` / `'both'`).
- Blocs de code avec `highlight={…}` pour pointer la ligne qui change, `expandable` pour les longs.
- À essayer, sans compter dessus : `twoslash`, qui montrerait au survol que `options.target` est un `User` (il faut que Mintlify résolve le paquet `chapterjs` ; à vérifier sur une page).

## 5. Ce qui change en dehors de `apps/docs`

Parce que « la référence est le JSDoc », la refonte touche la source, sans changer de comportement :

- **JSDoc manquants à ajouter** : `IdStructure.id`, `PermissionOverwrite.type`, `StringOption.minLength` / `maxLength`, les champs `null` de `PrivateMessage` et `PrivateCommandInteraction`, et les types exportés sans commentaire (`FetchMessagesOptions`, `GuildChannelEditOptions`, `InviteCreateOptions`, `ThreadCreateOptions`, `ThreadEditOptions`, `ForumPostOptions`, `ForumTag`, `ThreadMember`, `GuildEditOptions`, `ChannelCreateOptions`, `RoleCreateOptions`, `RoleEditOptions`, `AuditLog`, `ScheduledEvent`, `AutoModerationRule`, `Sticker`, `MessageFlagName`, `Attachment`, `Reaction`, `BanOptions`, `MemberEditOptions`, `MessageOptions`, `UserFlagName`, `WebhookMessageOptions`, `InteractionReplyOptions`).
- **`apps/docs/AGENTS.md` réécrit** : terminologie (« server » jamais « guild » en prose, « private message » jamais « DM », « person » pour qui utilise le bot, « test server » pour `DEV_GUILD_ID`, « the bot » jamais « the client »), les gabarits ci-dessus, les composants à utiliser, l'ordre des gestionnaires de paquets, ce qu'on ne documente pas, et la règle « description = JSDoc ».
- **`apps/docs/README.md`** : remplacé par trois lignes (comment lancer `mint dev`, où est le guide de style).
- **CLAUDE.md** : la section `apps/docs` décrit la nouvelle structure (onglets, `drafts/`, les tests ci-dessous).

### Tests (nouveaux, dans `packages/chapterjs/test/docs.test.ts`)

1. **Aucun export sans page** : chaque nom exporté par `src/index.ts` et `src/main.ts` apparaît en code dans `apps/docs/**/*.mdx`. Aujourd'hui, 33 échecs.
2. **Aucune méthode fantôme** : chaque `### name()` d'une page de `reference/` existe sur le prototype de la classe de la page (et chaque getter public de la classe a sa `<ResponseField>`). Attrape une méthode renommée.
3. **Les exemples compilent** : chaque bloc ```` ```ts ```` dont le titre est un chemin `src/…` est écrit dans un projet de test (`project()` de `test/dev-helpers.ts`), les autres dans `src/lib/`, puis `tsc -b` doit passer. C'est la règle « Samples must compile against the current API » de CLAUDE.md, enfin vérifiée, y compris pour `event` typé par dossier.
4. En option, dans la CI du site : `mint broken-links`.

## 6. Phasage

| Phase | Contenu | Pages touchées |
| --- | --- | --- |
| 1. Structure | `docs.json` (onglets, icônes, redirections, seo), déplacements et découpages, les 9 pages nouvelles (`discord-application`, `project-structure`, `deploy`, `troubleshooting`, `not-yet`, `interaction`, `events`, `command`, `event`, `cli`), `AGENTS.md`, accueil corrigé, avertissement sur les composants | ~25 |
| 2. Référence | `options`, `data`, `message-options` réécrits dans la voix du projet ; `<ResponseField>` partout ; salons découpés en 7 pages ; doublons supprimés ; JSDoc ajoutés dans la source ; les trois tests | ~20 |
| 3. Adoption | `from-discord-js`, essai `twoslash`, `search.prompt`, pied de page | 2 |

Chaque phase passe `pnpm test` et `pnpm check-types`, et met CLAUDE.md à jour dans le même changement.

## 7. Ce que je n'ai pas tranché

- **Nom de l'onglet de guide** : « Guide » ou « Documentation ». Je propose « Guide », plus court à côté de « Reference ».
- **Découper `commands` en quatre pages** ou garder une longue page avec un sommaire. Je propose quatre : « answering » et « translations » sont des sujets qu'on cherche seuls.
- **Bibliothèque d'icônes** : rester sur Font Awesome (la page d'accueil en dépend : `folder-tree`, `wand-magic-sparkles`…) plutôt que passer à Lucide.
