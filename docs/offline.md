# Offline e installazione

NEO può funzionare **senza rete**, dopo la prima visita online.

## Cosa serve

1. Aprire NEO da **HTTPS o `localhost`**, non da `file://` (i service worker e la cache dei modelli non funzionano da file).
2. **Una volta online**: aprire l'app e **caricare almeno un modello**, così i pesi restano nella cache del browser.
3. Dopo, l'app si apre anche senza rete.

## Come funziona

Il service worker `sw.js` si registra al caricamento della pagina (`index.html`, ultimo `<script>`).

| Richiesta | Strategia |
|---|---|
| Stessa origine (`index.html`, `logo.svg`, `manifest.webmanifest`…) | **rete prima, cache come ripiego**: online vedi sempre la versione nuova, offline quella salvata |
| Librerie e font (`esm.run`, `esm.sh`, `cdn.jsdelivr.net`, `fonts.googleapis.com`, `fonts.gstatic.com`) | **cache subito, aggiornamento in sottofondo** |
| Tutto il resto (Hugging Face, Serper, Wikipedia…) | **direttamente in rete**, nessuna cache |

Il service worker mette in cache solo il codice. I **pesi dei modelli non passano da lui**: li gestisce WebLLM (CacheStorage), così non si duplicano file da gigabyte. Nome della cache: `neo-shell-v1`; non interferisce con **🧹 Spazio e memoria**, che conosce solo le cache dei modelli.

## Cosa funziona offline

| Funzione | Offline |
|---|---|
| Chat e operazioni sul testo con un modello già scaricato | sì |
| Chat salvate, agenti, tema | sì |
| Allegati di testo | sì |
| Allegati PDF o immagini | solo se PDF.js / Tesseract sono già stati usati online almeno una volta |
| Etichette di argomento (Gist) | solo se già caricato online una volta |
| Ricerca web 🌐 | **no** (e Redact, che serve a proteggerla, potrebbe non essere disponibile) |
| Scaricare un modello nuovo | no |

## Installare come app (PWA)

Il file `manifest.webmanifest` rende NEO installabile: nel browser compare «Installa app» (Chrome, Edge) o «Aggiungi a schermata Home» (mobile). L'app si apre in una finestra propria, con l'icona `logo.svg`.

## Aggiornamenti

Online l'app prende sempre i file nuovi (rete prima). Per forzare l'eliminazione della vecchia cache a un rilascio, aumenta `VERSION` in `sw.js` (per esempio `neo-shell-v2`): all'attivazione le cache `neo-shell-*` più vecchie vengono eliminate.

## Limiti noti

- **Prima visita senza rete:** non c'è niente in cache, quindi non parte.
- **Cache delle CDN:** si salva solo ciò che hai già caricato una volta. Se una CDN cambia versione, serve di nuovo la rete.
- **Worker di WebLLM:** il motore gira in un worker creato da un blob che importa WebLLM da `esm.run`. Il comportamento di quella richiesta con il service worker va verificato offline sul deploy; se non parte, la soluzione è includere WebLLM nel repo.
- **Indipendenza completa dalle CDN:** richiede di copiare le librerie nel repo e cambiare gli `import`; non è fatto.
- **Persistenza:** il browser può eliminare le cache se manca spazio. Per le cartelle importate dal disco NEO chiede la protezione (`storage.persist`).
