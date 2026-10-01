# Privacy e dati

NEO non ha un server proprio e non ha account. **Le tue chat, gli agenti e le impostazioni non lasciano mai il dispositivo.** Quello che segue è l'elenco completo di cosa viene salvato in locale e di quali richieste di rete fa l'app.

## Cosa resta sul dispositivo

| Dato | Dove | Chiave / nome |
|---|---|---|
| Conversazioni (messaggi, titolo, agente, argomento) | `localStorage` | `neo-convs` |
| Agenti (nome, prompt, parametri) | `localStorage` | `neo-agents`, `neo-agent` (agente corrente) |
| Modelli personalizzati | `localStorage` | `neo-custom` |
| Tema chiaro/scuro | `localStorage` | `neo-theme` |
| Chiave Serper (se la inserisci) | `localStorage`, **in chiaro** | `neo-serper` |
| Pesi dei modelli WebLLM e cartelle importate | CacheStorage | `webllm/config`, `webllm/model`, `webllm/wasm` |
| Modelli GGUF | OPFS (storage privato del sito), gestito da wllama | cartella `cache` |
| App e librerie per l'uso offline | CacheStorage | `neo-shell-v1` |

Note:

- Le chiavi con prefisso `leo-` (`theme`, `convs`, `agents`, `agent`, `custom`) erano del vecchio nome del progetto. All'avvio NEO le copia nelle chiavi `neo-` se queste non esistono ancora.
- Il `localStorage` ha un limite di circa 5 MB. Se si riempie, il salvataggio delle chat fallisce in silenzio.
- La chiave Serper è accessibile a qualsiasi script che gira nella stessa origine. Usa una chiave dedicata, con limiti, e non riutilizzare quella di altri servizi.
- Per cancellare tutto: elimina le chat dalla barra laterale, usa **🧹 Spazio e memoria → Elimina tutto** per i modelli, oppure cancella i dati del sito dalle impostazioni del browser.

## Cosa esce dal dispositivo

| Quando | Verso | Cosa viene inviato |
|---|---|---|
| Apertura dell'app | `esm.run` (jsDelivr), `esm.sh`, `cdn.jsdelivr.net`, `fonts.googleapis.com` / `fonts.gstatic.com` | richieste per scaricare le librerie e i font; nessun dato tuo, ma questi servizi vedono il tuo indirizzo IP |
| Scelta di un modello | `huggingface.co` (o l'URL che indichi) | richiesta dei file del modello |
| Allegato PDF o immagine (prima volta) | `cdn.jsdelivr.net` | download di PDF.js o Tesseract.js (e dei dati lingua di Tesseract) |
| Ricerca 🌐 attiva, senza chiave | `it.wikipedia.org` | la domanda **già ripulita dai dati personali**, troncata a 300 caratteri |
| Ricerca 🌐 attiva, con chiave | `google.serper.dev` | la stessa domanda ripulita, più la tua chiave |

**Non** viene mai inviato: il testo delle chat al di fuori della domanda di ricerca, i file allegati, il contenuto delle risposte, gli agenti. Non ci sono analytics né telemetria.

## Come viene protetta la ricerca web

1. **Redact** (Desert Ant Labs) gira nel browser e sostituisce i dati personali con segnaposto (del tipo `[TIPO_1]`).
2. NEO elimina i segnaposto e comprime gli spazi.
3. Il risultato è troncato a 300 caratteri.
4. **Fail closed:** se Redact non si carica (rete assente o bloccata), la ricerca **non viene eseguita** e la domanda non parte. Vedi il messaggio «Ricerca web non eseguita (query non inviata)».

La ricerca è **opt-in**: è spenta all'avvio e va attivata a ogni sessione con il pulsante 🌐. Al primo uso NEO ti avvisa che le query escono dal dispositivo.

## Classificazione degli argomenti

**Gist** (Desert Ant Labs) assegna un'etichetta di argomento a ogni chat, usando i primi 500 caratteri del primo messaggio. Gira in locale, in background, **una sola volta per chat**. Se non si carica, la chat resta senza etichetta e basta.

## Rischi da conoscere

- **Librerie da CDN.** Il codice di WebLLM, wllama, Redact, Gist, PDF.js e Tesseract viene caricato da CDN pubbliche e gira nella pagina. È lo stesso rischio di qualunque sito che usa una CDN. Per ridurlo si possono includere le librerie nel repo (non è fatto oggi).
- **Build community e modelli personalizzati.** Il `.wasm` di un modello gira nel tuo browser: usalo solo se ti fidi dell'autore.
- **Backup.** I dati sono solo nel browser: se li cancelli, spariscono. Non c'è sincronizzazione tra dispositivi.
