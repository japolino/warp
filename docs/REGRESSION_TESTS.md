# Builder upgrades and classifier setup

These regressions can be tested outside Lumiverse. The tests use saved JSON fixtures and a fake Spindle host. They do not read production drafts, use real credentials, or contact model providers.

From the repository root:

```powershell
bun install --frozen-lockfile
bun test src/backend/builder-recovery.test.ts src/backend/classifier-config.test.ts
bun run verify
bun run build
```

The focused suite checks:

| Regression | Expected behavior |
| --- | --- |
| A draft saved before quests and NPC conditions/memories were added | The current engine rebuilds the preview. YAML, answers, additions and the saved connection remain intact. |
| A stale preview with a current saved-format version | Preview data is rebuilt from YAML regardless of that version. |
| Old questions missing optional display fields | Defaults allow the questions to render and answers remain available. |
| Broken authored YAML | The section, checker error and Redo control remain visible. |
| Malformed sections, another character's draft, or an unsupported newer format | Loading fails before overwriting the stored draft. |
| A builder rendering exception | A recovery message renders so the drawer can still switch tabs. |
| Jev configured as an OpenAI chat model | A local setup error explains the required typed format. No provider request is made. |
| A decisions URL pasted into the chat-format setting | Warp rejects the mismatch instead of appending `/chat/completions`. |
| A chat URL pasted into the typed-format setting | Warp explains the mismatch before sending. |
| The Jev on OpenRouter preset | The exact decisions endpoint receives `model`, `state` and `questions`. Existing helper settings stay intact. |
| An ordinary text classifier | OpenAI-compatible chat requests continue to work. |

After installing the rebuilt extension in a disposable Lumiverse instance, reopen an old review draft and switch between Ruleset and Settings. The preview should render without discarding the draft. In Settings, select an incompatible Jev/chat combination to see the setup message, then use **Jev on OpenRouter** to set the typed format, endpoint and model together. The preset leaves the encrypted key unchanged; the endpoint requires an OpenRouter credential.

The builder/helper connection-selection and reported 401 authentication issues are outside this change.
