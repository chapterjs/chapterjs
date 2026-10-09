# `voice/`: the bot in a voice channel, playing

Joining, moving and leaving go through the main gateway (Voice State Update, op 4, on the shard of the server); the rest is a session with a voice server. Public types: `VoiceConnection`, `JoinOptions`, `AudioSource`. Structures: `VoiceChannel.join(options)`, `guild.voice` (the connection of the bot in a server, or `null`), `member.voiceChannel` (from the voice states of the server). Not written yet: receiving audio (recording), volume (it needs decoding).

The only source of truth is the official documentation (voice connections, voice gateway v8, DAVE); comments link the section used.

## Encryption

- `transport.ts`: the RTP header and the two transport encryption modes Discord still accepts, on `node:crypto`: `aead_aes256_gcm_rtpsize` (preferred) and `aead_xchacha20_poly1305_rtpsize` (HChaCha20 written here, ChaCha20-Poly1305 from Node, tested against the vectors of the IETF draft); the 32-bit counter appended to each packet is the nonce.
- `dave.ts`: end-to-end encryption. `loadDave()` loads `vendor/dave` once (its logs silenced). `DaveSession` follows the voice gateway through DAVE (opcodes 21 to 31: key package, external sender, proposals answered with a commit, announced commits and welcomes, transitions prepared, readied and executed, recovery with op 31 and a new key package, users of the call from op 11/13) and encrypts frames with libdave's `Encryptor` in its memory. Frames are only sent once the bot has its key (`canSend`): alone in a channel there is no group, nothing is heard, and nothing is sent.
- `vendor/dave/`: Discord's libdave compiled to WebAssembly, which Node runs itself. Shipped in the package (`files`), loaded only when a bot joins voice, rebuilt only by `scripts/build-dave.sh` (`pnpm --filter chapterjs build:dave`: Docker, libdave and Emscripten at fixed versions, exceptions compiled in, licenses gathered). The one exception in form, not in kind, to "no dependency at runtime".

## Audio

- `opus.ts`: Opus packets out of Ogg and WebM/Matroska (every lacing), streamed, without decoding; `opusSamples()` reads how long a packet plays from its TOC byte.
- `source.ts`: `openAudio()` turns what `play()` takes (`AudioSource`: an `asset()`, an `Attachment` sent on Discord, or an `https://` link) into packets: a file, or a download (`fetch`, streamed), whose first bytes say Ogg Opus or WebM Opus is read as is, anything else is converted by `ffmpeg` (spawned, 48 kHz stereo 20 ms frames into Ogg), with a plain error when it is not installed or refuses. ffmpeg, when installed on the machine, is used to play what is not Opus; nothing needs it.

## The session and the connection

- `session.ts`: `VoiceSession`, one session with a voice server: WebSocket v8 with `seq_ack`, binary messages, heartbeats whose missing ACK resumes, Resume with growing delays, IP Discovery over UDP, Select Protocol, Session Description, Speaking, five frames of silence before stopping, a socket closed only once its last packets left. How it ends is a `SessionEnd`: `ended` (4014, 4021, 4022), `lost` (4006, 4009, 4011: a new session is asked to the gateway), `refused` (the codes that mean something to fix, with a sentence). The end of the socket comes from `util/websocket.ts`.
- `connection.ts`:
  - `VoiceConnection`, what users hold (one per server, the same object across moves and renewed sessions: `guild`, `channel`, `connected`, `playing`, `paused`, `play()` paced on `performance.now()` by the duration of each packet, `pause()`, `resume()`, `stop()`, `leave()`); what only the manager does goes through module-level `internals`, so the class shows nothing else.
  - `VoiceManager` (`ctx.voice`, created by `createBot`): `join()` checks Connect, a full channel (unless Move Members) and waits for the bot's own Voice State Update and the Voice Server Update (`core/bot.ts` routes them), with a sentence about the intent when only the server came; moves by `join()` or by someone, a disconnection, a lost session; on a stage, Modify Current User Voice State (`suppress: false`, else a request to speak and a `⚠`). Warnings reach the developer as the `voiceWarning` bot event (`⚠ Voice: ...`).
- `usage.ts`: whether a project joins voice, from its code (`.join()` or `.join({`). Discord only sends the bot its own voice state with `GUILD_VOICE_STATES`, so `cli/project.ts` adds that intent when `sourcesJoinVoice()` finds it in `src/` (dev, at every load) or when `build.json` says so (`voice`, written by `build`, read by `start`).
- Tests run against `fakeVoice()` of `@chapterjs/test-utils`; `CHAPTERJS_API_URL` set to an `http://` URL makes voice servers be reached without TLS.
