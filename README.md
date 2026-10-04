<img src="logo.svg" alt="Neo" width="64" align="right">

# NEO - AI nel Browser

Assistente AI che gira **interamente nel tuo browser** via WebGPU, ispirato a Brave Leo.  
Nessun server, nessun dato inviato — privacy totale.

## Caratteristiche

- 🧠 **Modelli AI nel browser** — SmolLM2, Qwen2.5, Llama 3.2, Phi 3.5, Gemma 2
- 💬 **Chat libera** — Conversa liberamente come con ChatGPT
- ✨ **Operazioni testo** — Riepilogo, parafrasi, traduzione, post social e altro
- 🔒 **Privacy totale** — Tutto gira in locale, zero dati al cloud
- 📱 **Responsive** — Funziona su desktop e mobile
- ⚡ **WebGPU** — Accelerazione hardware per inferenza veloce
- 🎨 **Design premium** — UI dark elegante ispirata a Brave Leo

## Come Usare

### Server locale (consigliato)
NEO usa moduli ES, un service worker e i worker dei modelli: servono `http://localhost` o `https`, non `file://`.
```bash
# Python
python3 -m http.server 8080

# Node.js
npx serve .

# Windows: start.bat
```
Poi apri http://localhost:8080 (Chrome 113+, Edge 113+, Firefox 139+).

### Deploy
È un sito statico: basta pubblicare la cartella (ad esempio su Vercel).

## Documentazione

Guida completa in **[docs/](docs/README.md)**: [guida utente](docs/utente.md), [modelli](docs/modelli.md), [privacy e dati](docs/privacy.md), [uso offline](docs/offline.md), [architettura](docs/architettura.md), [sviluppo e rilascio](docs/sviluppo.md), [fine-tuning](docs/finetuning.md), [crediti](docs/crediti.md).

## Requisiti

- Browser con supporto **WebGPU** (Chrome 113+, Edge 113+, Firefox 139+)
- ~200MB-2GB di RAM libera (dipende dal modello scelto)
- GPU consigliata per prestazioni migliori

## Modelli Disponibili

| Modello | Dimensione | Caratteristiche |
|---------|-----------|-----------------|
| SmolLM2-360M | ~200MB | Velocissimo, funziona ovunque |
| Qwen2.5-0.5B | ~350MB | Multilingua, buon compromesso |
| SmolLM2-1.7B | ~1GB | Qualità bilanciata |
| Llama 3.2-1B | ~700MB | Versatile, buon inglese |
| Qwen2.5-1.5B | ~900MB | Alta qualità multilingua |
| Gemma 2-2B | ~1.3GB | Google, buone prestazioni |
| Phi 3.5 Mini | ~2GB | Ragionamento avanzato |

### Modelli personalizzati

Dalla schermata di scelta modello, **+ Modello personalizzato**:

- **MLC (WebGPU):** URL dei pesi + `.wasm` (oppure `@modello-del-catalogo` per riusarne uno), o una cartella MLC dal disco.
- **Senza WebGPU** (accelerazione hardware spenta, driver, VM): i modelli non partono e NEO lo segnala con i passi per attivarla.

### Ricerca web (🌐)

Senza chiave usa **Wikipedia** (italiana). Con una chiave gratuita di **[Serper](https://serper.dev)** (risultati Google, 2500 ricerche gratis) usa Google: si inserisce al primo clic su 🌐, e si cambia con **Maiusc+clic**. La query viene prima ripulita dai dati personali (Redact, in locale). Altri provider (Tavily, Brave, Exa) non accettano chiamate dal browser e DuckDuckGo blocca i server Vercel.

### Memoria e spazio

- **⏏ Espelli** (piè della sidebar): scarica il modello da RAM/GPU e torna alla scelta; le chat restano.
- **🧹 Spazio e memoria**: elenca i modelli scaricati nel browser (WebLLM, cartelle importate), con la dimensione, e permette di eliminarli uno a uno o tutti.

### Uso offline (PWA)

Un service worker (`sw.js`) tiene in cache l'app e le librerie da CDN. Apri NEO una volta online da `https` o `localhost` (non da `file://`), scarica il modello, e dopo funziona senza rete; si può anche installare come app dal browser. La ricerca web 🌐 richiede internet. Ad ogni rilascio che cambia i file, aumenta `VERSION` in `sw.js`.

## Struttura e test

- `index.html` (markup), `style.css`, `app.js` (logica, modulo ES), `ops.js` (prompt delle operazioni sul testo), `format.js` (formattazione dei messaggi), `skills.js` (installazione skill da GitHub), `sw.js` (service worker offline).
- `node test/smoke.mjs` avvia l'app in Chromium headless con WebLLM simulato e controlla che parta senza errori (serve `playwright`).

## Tech Stack

- [WebLLM](https://webllm.mlc.ai/) — Inferenza LLM nel browser via WebGPU
- [MLC-AI](https://mlc.ai/) — Compilazione modelli per il browser
- Vanilla HTML/CSS/JS — Nessun framework né build; le librerie arrivano da CDN con versioni fissate (vedi `index.html`)

## Crediti

Sviluppato da **[scobru](https://github.com/scobru)** — codice sorgente: [github.com/scobru/neo](https://github.com/scobru/neo).

Costruito sopra [WebLLM](https://webllm.mlc.ai/), [MLC-AI](https://mlc.ai/), [Redact e Gist](https://github.com/desert-ant-labs) di Desert Ant Labs, [PDF.js](https://mozilla.github.io/pdf.js/) e [Tesseract.js](https://tesseract.projectnaptha.com/). I modelli appartengono ai rispettivi autori (Hugging Face, Alibaba, Meta, Microsoft, Google, Sapienza NLP, OpenBMB).

## Licenza

MIT © scobru
