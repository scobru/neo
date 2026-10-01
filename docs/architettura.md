# Architettura

NEO è **un solo file**: `index.html` contiene markup, CSS e un blocco `<script type="module">` di circa 1300 righe. Non c'è build, bundler né `package.json`. Le librerie si importano da CDN a runtime. Un secondo `<script>` in fondo registra il service worker.

## Schema generale

```
┌──────────────────────────── index.html ─────────────────────────────┐
│ UI (barra laterale, scelta modello, chat, dialog)                   │
│                                                                     │
│ stato ──► conversations / agents / customModels  ── localStorage    │
│                                                                     │
│ generate() ──► engine.chat.completions.create({messages, stream})   │
│                    │                                                │
│        ┌───────────┴───────────┐                                    │
│   WebLLM (GPU, worker)    loadGguf() → wllama (CPU)                 │
│   esm.run/@mlc-ai/web-llm      cdn.jsdelivr.net/@wllama/wllama      │
│                                                                     │
│ extra (caricati a richiesta): Redact, Gist, PDF.js, Tesseract       │
└─────────────────────────────────────────────────────────────────────┘
 sw.js: cache dell'app e delle librerie (offline)
```

L'idea chiave è che **entrambi i motori espongono la stessa interfaccia**, quella di WebLLM: `chat.completions.create({messages, stream: true, …})` che restituisce un iteratore asincrono di `choices[0].delta.content`, più `interruptGenerate()` e `unload()`. `loadGguf()` costruisce un oggetto con questa forma sopra wllama, quindi il resto dell'app non sa quale motore sta usando.

## Mappa del codice (`index.html`)

| Sezione | Cosa fa |
|---|---|
| Import WebLLM | `import * as webllm from 'https://esm.run/@mlc-ai/web-llm'` |
| Migrazione `leo-` → `neo-` | copia le vecchie chiavi `localStorage` del progetto rinominato |
| Tema | `toggleTheme`, `initTheme` (classe `dark` su `<html>`, segue `prefers-color-scheme`) |
| Stato | `engine`, `worker`, `isGenerating`, `conversations`, `activeConvId`; `saveConvs()` |
| Operazioni sul testo | `SYSTEM`, `TONES`, `PLATFORMS`, `buildPrompt()`, `OPS` |
| Agenti | `agents`, `renderAgents`, `setAgent`, `editAgent`, `newAgent`, `saveAgent`, `delAgent` |
| Ricerca web | `safeQuery` (Redact), `webSearch` (Serper / Wikipedia), `webContext`, `toggleWeb`, `askSerperKey` |
| Allegati | `extractText`, `pdfText`, `ocrText`, `pickChunks`, chip dei file |
| Gist | `tagConv` |
| Cronologia | `trimHistory` |
| Utility UI | `ask()` (dialog al posto di `confirm`/`prompt`), `toast()` |
| Modelli personalizzati | `libUrl`, `saveCustom`, `addCustom`, `addGguf`, `importLocal`, `purgeLocal` |
| Catalogo GGUF e community | `GGUF_CATALOG`, `COMMUNITY_MLC`, `ggufModels`, `curRec`, `noThink` |
| Prompt GGUF | `basePrompt` (modelli base), `chatmlPrompt` (ChatML) |
| Motore GGUF | `loadGguf`, `startGguf` |
| Scelta del modello | `detectGpu`, `initModelPicker` |
| Caricamento | `startModel`, `unloadEngine`, `changeModel`, `backToChat`, `ejectModel`, `enterChat` |
| Spazio e memoria | `storageItems`, `renderStorage`, `openStorage`, `clearAllStorage` |
| Conversazioni | `newConversation`, `renderConvList`, `deleteConv`, `switchConv`, `renderMessages` |
| Chat | `sendMessage`, `runOp`, `generate`, `stopGen` |
| Helper DOM | `appendMsgEl`, `addCopyBtn`, `fmtMsg`, `escHtml`, `scrollBottom` |
| Input, popover ⚡, barra laterale | listener e `toggleCommands`, `toggleSidebar` |

Le funzioni usate negli `onclick` del markup sono assegnate a `window.*` perché lo script è un modulo.

## Flussi principali

### Caricamento del modello (`startModel`)

1. Scarica l'eventuale motore precedente (`unloadEngine`).
2. Se l'id è un GGUF, passa a `startGguf` → `loadGguf` (scarica da URL con barra di avanzamento).
3. Altrimenti prova l'id scelto e poi la variante di precisione opposta (`q4f16` ↔ `q4f32`) se esiste.
4. Crea il motore **in un Web Worker** (un modulo creato da un blob che importa WebLLM e istanzia `WebWorkerMLCEngineHandler`), così l'interfaccia non si blocca.
5. Se il worker non ha accesso alla GPU («compatible GPU»), riprova **sul thread principale**.
6. Se riesce, `enterChat` mostra la chat e riprende l'ultima conversazione.

### Invio di un messaggio (`sendMessage` → `generate`)

1. Se ci sono allegati, `pickChunks` sceglie i brani più rilevanti (budget ~5000 caratteri diviso per file).
2. Se 🌐 è attiva, `webContext`: `safeQuery` → `webSearch` → blocco «Fonti web».
3. Si costruisce il messaggio utente: testo + materiale + istruzione di usare solo quello (e di citare `[n]`). Il campo `shown` conserva ciò che l'utente vede; `content` ciò che va al modello.
4. `tagConv` avvia in background l'etichetta di argomento.
5. `generate` costruisce i messaggi: prompt di sistema dell'agente, cronologia tagliata (`trimHistory`, 6000 caratteri) e chiama il motore in streaming.

### Operazioni sul testo (`runOp`)

Stessa `generate`, ma **senza stato**: solo l'ultimo messaggio, prompt di sistema fisso `SYSTEM`, temperatura 0,3 e `max_tokens` dell'operazione (`OPS[...][5]`). Il prompt viene da `buildPrompt()`.

> I prompt (`SYSTEM`, `TONES`, `PLATFORMS`, `buildPrompt`) e i tetti di token **devono restare identici** a quelli del notebook di fine-tuning. Se ne cambi uno, cambialo in entrambi i posti e riaddestra il modello.

### Interruzione

`stopGen` libera subito l'interfaccia (`currentStop`) e invia `interruptGenerate()` ogni 500 ms per circa 10 secondi, perché WebLLM scarta un'interruzione che arriva prima dell'inizio della decodifica. La ripetizione si ferma appena parte una nuova generazione (`genId`), così non può annullare la risposta successiva. In `generate` ogni attesa è messa in `Promise.race` con la promessa di stop.

### Parametri di campionamento

- Operazioni: temperatura **0,3**.
- Chat: temperatura dell'agente → valore del modello (`sampling`) → **0,5**; top-p dell'agente → del modello → **0,9**; max token dell'agente → **512**; `frequency_penalty` **0,3**.
- Modelli con `noThink`: viene passato `extra_body: { enable_thinking: false }`.

## Formato dei dati

### Conversazione (`neo-convs`)

```json
{
  "id": "m1x4k9",
  "title": "Riepilogo: testo di esempio",
  "agentId": "neo",
  "topic": "Lavoro",
  "messages": [
    { "role": "user", "content": "<prompt completo>", "shown": "<testo mostrato>", "opLabel": "Riepilogo" },
    { "role": "assistant", "content": "…" }
  ]
}
```

Sono salvate solo le chat con almeno un messaggio. `shown` e `opLabel` sono facoltativi.

### Agente (`neo-agents`)

```json
{ "id": "neo", "name": "Neo", "prompt": "…", "temperature": 0.5, "top_p": 0.9, "max_tokens": 512 }
```

I tre parametri sono facoltativi (assenti = valori del modello).

### Modello personalizzato (`neo-custom`)

```json
{ "model_id": "…", "model": "<URL pesi>", "model_lib": "<URL .wasm>",
  "vram_required_MB": 1500, "overrides": { "context_window_size": 4096 },
  "required_features": ["shader-f16"] }
```

Per un GGUF: `{ "model_id": "…", "gguf": "<URL>", "n_ctx": 2048 }`. Le voci del catalogo GGUF possono avere anche `format: "chatml"`, `bos`, `noThink`, `sampling`, `note`, `it`, `size`.

## Convenzioni

- **Una sola origine di verità** per i prompt, condivisa con il notebook.
- **Fallire in modo sicuro**: la ricerca web non parte se Redact non si carica; Gist fallisce in silenzio.
- **Caricamento pigro** delle librerie pesanti (Redact, Gist, PDF.js, Tesseract), con la promessa messa in cache (`redactP`, `gistP`, `pdfjsP`) e azzerata in caso di errore, per riprovare.
- **Niente `confirm`/`alert`/`prompt` nativi**: `ask()` usa un `<dialog>` perché i browser incorporati e alcune impostazioni li sopprimono.
- **Sicurezza dell'HTML**: i messaggi passano da `fmtMsg`, che prima esegue l'escape di `& < >`. I titoli e gli argomenti usano `escHtml`.
- **Stile**: variabili CSS in `:root` (palette crema/terracotta, tema scuro con la classe `dark`), font Inter e Source Serif 4.
- **Commenti `ponytail:`**: segnano scelte consapevoli e limiti noti (per esempio il `localStorage` riscritto per intero a ogni salvataggio).

## Limiti noti

- Il `localStorage` (~5 MB) è l'unico archivio delle chat.
- wllama usa solo la CPU e, di norma, un thread.
- Il contesto è piccolo (circa 4000 token): per questo la cronologia e gli allegati sono tagliati.
- I Minerva sono modelli base e non seguono le istruzioni.
- Il rendering Markdown è minimale (niente elenchi, tabelle o link).
