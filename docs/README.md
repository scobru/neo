# Documentazione di NEO

NEO è un assistente AI che gira **interamente nel browser** (WebGPU o CPU), senza server e senza account. È un unico file `index.html` in HTML, CSS e JavaScript, senza build né dipendenze da installare.

| Documento | Per chi | Contenuto |
|---|---|---|
| [Guida utente](utente.md) | chi usa NEO | primo avvio, chat, operazioni sul testo, allegati, ricerca web, agenti, memoria e spazio |
| [Modelli](modelli.md) | chi sceglie o aggiunge modelli | catalogo, WebGPU e GGUF, modelli personalizzati, cartelle dal disco, Micro-Neo |
| [Privacy e dati](privacy.md) | tutti | cosa resta sul dispositivo, cosa esce, dove sono salvati i dati |
| [Offline e installazione](offline.md) | chi vuole usare NEO senza rete | service worker, PWA, cosa funziona offline |
| [Architettura](architettura.md) | chi sviluppa | struttura del codice, flussi, convenzioni, formato dei dati |
| [Sviluppo e rilascio](sviluppo.md) | chi sviluppa | avvio in locale, deploy, rilascio, risoluzione dei problemi |
| [Fine-tuning](finetuning.md) | chi vuole addestrare il modello | dataset, notebook, esportazione in GGUF e MLC |
| [Crediti e licenza](crediti.md) | tutti | sviluppatore, librerie, autori dei modelli, licenza |

## In breve

- **Nessun server.** Le chat, gli agenti e le impostazioni stanno nel `localStorage` del browser. I modelli stanno nella cache del browser.
- **Due motori.** [WebLLM](https://webllm.mlc.ai/) per i modelli su GPU (WebGPU) e [wllama](https://github.com/ngxson/wllama) (llama.cpp in WebAssembly) per i modelli GGUF su CPU.
- **Chat libera e operazioni sul testo.** Riepilogo, parafrasi, tono, traduzione, post social e altre, con prompt identici a quelli del fine-tuning.
- **Allegati in locale.** Testo, codice, PDF e immagini (OCR) vengono letti nel browser.
- **Ricerca web opzionale.** Prima di uscire dal dispositivo, la domanda viene ripulita dai dati personali.
- **Usabile offline** dopo la prima visita online, anche come app installata.

## Struttura del repository

```
index.html              l'intera applicazione (HTML + CSS + JS)
sw.js                   service worker (cache dell'app e delle librerie)
manifest.webmanifest    manifesto PWA
logo.svg                logo e icona
start.bat               avvio rapido su Windows (server locale su :8080)
dataset/                dataset di addestramento (leo_dataset.jsonl)
notebook/               notebook Colab di fine-tuning (v4 e v5)
MODEL.md                scheda del modello Micro-Neo
docs/                   questa documentazione
LICENSE                 MIT
.claude/launch.json     configurazione del server di anteprima (Claude Code)
.vercelignore           file esclusi dal deploy su Vercel
```
