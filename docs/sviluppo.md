# Sviluppo e rilascio

## Avvio in locale

Servono solo Python (o qualunque server statico). Non c'è nulla da installare.

```bash
python3 -m http.server 8080     # poi apri http://localhost:8080
# oppure
npx serve .
```

Su Windows: `start.bat`. In Claude Code il server di anteprima è definito in `.claude/launch.json` (porta 8080).

**Non aprire `index.html` come file:** il service worker e la cache dei modelli richiedono `http://localhost` o HTTPS.

Per provare in un altro browser o dispositivo della rete, usa l'indirizzo IP del computer; WebGPU richiede però un contesto sicuro (HTTPS o `localhost`).

## Modificare l'app

Tutto è in `index.html`. Prima di cambiare qualcosa leggi l'[architettura](architettura.md). Punti a cui stare attenti:

1. **Prompt delle operazioni:** `SYSTEM`, `TONES`, `PLATFORMS`, `buildPrompt`, `OPS` (tetti di token) devono restare identici a quelli del notebook. Se li cambi, aggiorna `notebook/` e riaddestra.
2. **Nuova operazione sul testo:** aggiungi la voce a `OPS` e il ramo in `buildPrompt`. Compare da sola nel popover ⚡.
3. **Nuovo modello WebLLM:** aggiungi una parola chiave a `DESIRED` (il modello deve essere nel catalogo della versione di WebLLM in uso) e, se serve, i parametri consigliati in `models.js`; oppure un modello personalizzato.
4. **Nuova libreria da CDN:** se è su un host nuovo, aggiungilo a `LIB_HOSTS` in `sw.js`, altrimenti non sarà in cache offline.
6. **Nuova chiave `localStorage`:** usa il prefisso `neo-` e documentala in [Privacy](privacy.md).

## Controlli prima di una modifica

Non ci sono test automatici né linter. Controlla a mano:

- La console del browser non mostra errori all'avvio.
- Caricamento di un modello piccolo (per esempio SmolLM2-360M) e una risposta in streaming.
- **■** interrompe prima e durante la risposta.
- Un'operazione ⚡ e un allegato di testo.
- Cambio modello ed **⏏ Espelli** senza perdere le chat.
- Con WebGPU disattivato (`chrome://flags` o una VM) l'app mostra l'avviso con i passi per attivarlo.
- Tema chiaro e scuro, e larghezza da telefono.

Per la sintassi del service worker: `node --check sw.js`.

## Deploy

Il progetto è su **Vercel** come sito statico, senza build: ogni push su un ramo crea un'anteprima, e il ramo principale va in produzione. `.vercelignore` esclude dal deploy `dataset/`, `notebook/`, `.claude/`, `start.bat`, `MODEL.md` e `.cache/`. (`docs/` non è esclusa: se non vuoi pubblicarla, aggiungila a `.vercelignore`.)

Qualunque hosting statico va bene, purché serva i file in **HTTPS**. Non servono intestazioni speciali.

## Rilascio

1. Verifica con i controlli sopra.
2. Se hai cambiato `index.html`, `logo.svg` o `manifest.webmanifest` e vuoi forzare l'aggiornamento della cache offline, aumenta `VERSION` in `sw.js`. Online l'app prende comunque i file nuovi (rete prima), quindi è necessario soprattutto per ripulire le cache vecchie.
3. Apri una pull request: Vercel pubblica l'anteprima.
4. Prova l'anteprima, anche offline (apri online, carica un modello, spegni la rete, ricarica).
5. Unisci nel ramo principale.

## Risoluzione dei problemi (sviluppo)

| Problema | Causa e rimedio |
|---|---|
| Il service worker mostra una versione vecchia | in DevTools → Application → Service Workers, «Update on reload» o «Unregister»; poi svuota `neo-shell-*` |
| Offline la pagina non parte | il service worker non era ancora attivo alla prima visita: ricarica una volta online |
| WebLLM: «compatible GPU» | il worker non ha accesso alla GPU: NEO riprova sul thread principale; altrimenti attiva l'accelerazione hardware |
| Un modello importato dal disco non parte | manca `mlc-chat-config.json` o il `.wasm`: vedi [Modelli](modelli.md) |
| Spazio che non si libera | usa 🧹 → Elimina tutto |
| La ricerca web dice «Serper ha risposto 401/429» | chiave non valida o limite raggiunto: NEO ripiega su Wikipedia |

## Rinomina Leo → Neo

Il progetto si chiamava Leo. Restano alcune tracce volute, per non rompere i dati esistenti: la migrazione delle chiavi `leo-*` → `neo-*`, l'indirizzo finto `https://leo.local/` delle cartelle importate, il nome `leo_dataset.jsonl` e il vecchio id agente `leo`.
