# Guida utente

## Requisiti

- **Browser:** Chrome o Edge 113+, Firefox 139+. Per i modelli su GPU serve WebGPU; per i modelli GGUF su CPU no.
- **Memoria:** da circa 200 MB a 2 GB di RAM libera, secondo il modello.
- **Connessione:** serve per il primo scaricamento dell'app e del modello. Dopo, vedi [Offline](offline.md).

## Avvio

- **Sito deployato:** apri l'indirizzo, è già pronto.
- **In locale:** esegui `start.bat` (Windows) oppure `python3 -m http.server 8080` nella cartella del progetto, poi apri `http://localhost:8080`. Aprendo `index.html` come file (`file://`) alcune funzioni, come la cache dei modelli e l'uso offline, non funzionano in modo affidabile.

## Primo avvio: scelta del modello

Alla prima apertura compare **Scegli un modello**. L'elenco mostra, in questo ordine:

1. i tuoi modelli personalizzati (segnati con ★),
2. i modelli WebGPU compatibili del catalogo WebLLM (precisione `f16` o `f32` secondo la tua scheda grafica),
3. le build community, in fondo e mai preselezionate,
4. la sezione **GGUF · wllama**, per la CPU.

Il primo modello della lista è già selezionato. Premi **Inizia**: il modello viene scaricato (con barra di avanzamento) e poi si apre la chat. Se la variante `f16` non parte, NEO prova da solo la `f32`, e viceversa.

Tasto destro su un modello personalizzato: lo rimuove dalla lista.

**Senza WebGPU** (accelerazione hardware spenta, driver, macchina virtuale) compare un avviso, i modelli WebLLM vengono attenuati e NEO preseleziona un modello GGUF su CPU.

I dettagli sui modelli sono in [Modelli](modelli.md).

## La chat

- Scrivi nella casella e premi **Invio** (Maiusc+Invio va a capo) o il pulsante ↑.
- **■** interrompe la risposta in qualunque momento, anche prima del primo carattere.
- Le risposte appaiono mentre vengono generate, con formattazione di base (grassetto, corsivo, codice, paragrafi). Ogni risposta ha un pulsante per **copiarla**.
- Il titolo di una chat nuova è preso dal primo messaggio.
- La cronologia inviata al modello è tagliata a circa 6000 caratteri (i messaggi più recenti), perché i modelli piccoli hanno un contesto ridotto.

### Conversazioni (barra laterale)

- **+** crea una nuova chat; ✕ accanto a una chat la elimina (con conferma).
- Sotto il titolo compare l'**argomento** della chat, assegnato in locale da Gist (vedi [Privacy](privacy.md)).
- Le chat si salvano da sole. Su schermi stretti la barra laterale si apre con ☰.
- **◐** cambia tema chiaro/scuro; di default segue quello del sistema.

## Operazioni sul testo (⚡)

Scrivi o incolla un testo nella casella, poi premi **⚡** e scegli un'operazione. Ogni operazione è senza memoria: usa solo quel testo, con un prompt fisso, temperatura bassa (0,3) e un tetto di token proprio.

| Operazione | Cosa fa | Token max |
|---|---|---|
| Riepilogo | un paragrafo breve o al massimo 5 punti | 220 |
| Spiegazione | spiega in parole semplici | 320 |
| Parafrasi | stesso significato, parole diverse | 350 |
| Migliora | corregge errori e refusi, stile più chiaro | 380 |
| Tono professionale / casual / entusiasta / informativo / creativo | riscrive con il tono scelto | 380 |
| Accorcia | solo l'essenziale | 420 |
| Allunga | più sviluppato, senza fatti nuovi | 420 |
| Citazione | una o due frasi memorabili | 90 |
| Post LinkedIn | tono professionale, 3-5 frasi, max 3 hashtag | 200 |
| Post X | max 280 caratteri, max 2 hashtag | 200 |
| Didascalia Instagram | emoji e 5-8 hashtag | 200 |
| Post Facebook | amichevole, 2-4 frasi | 200 |
| Traduzione EN | traduce in inglese (non presente nel dataset di addestramento) | 400 |

Il risultato resta nella chat con l'etichetta dell'operazione.

## Allegati (📎)

Premi **📎** e scegli uno o più file (max 20 MB l'uno). L'estrazione avviene nel browser:

- **Testo e codice:** `.txt .md .csv .tsv .json .xml .html .css .js .ts .jsx .tsx .py .java .c .cpp .h .go .rs .sh .sql .yaml .toml .ini .log`
- **PDF:** letti con PDF.js.
- **Immagini:** riconoscimento del testo (OCR) con Tesseract.js, in italiano e inglese.

I file compaiono come etichette sopra la casella (✕ per toglierli). Se il testo è lungo, NEO sceglie i **brani più pertinenti alla domanda** (circa 5000 caratteri in tutto, divisi tra i file) e li passa al modello. Se allegati un file senza scrivere nulla, la richiesta predefinita è «Riassumi il contenuto». Il modello è istruito a rispondere solo con il materiale fornito e a dire se non basta.

## Ricerca web (🌐)

Il pulsante **🌐** attiva o disattiva la ricerca. Quando è attiva, a ogni domanda:

1. la domanda viene ripulita dai dati personali, in locale (Redact), e troncata a 300 caratteri. Se Redact non si carica, la ricerca **non parte** e ricevi un messaggio;
2. i risultati vengono dati al modello come «Fonti web», con l'istruzione di citarle come `[n]`;
3. sotto il tuo messaggio compare l'elenco delle fonti.

**Provider:**
- **Wikipedia italiana**, senza chiave.
- **Google tramite [Serper](https://serper.dev)**, con una chiave gratuita (2500 ricerche). La chiave si inserisce al primo clic su 🌐 (vuoto = solo Wikipedia) e si cambia con **Maiusc+clic**. Se Serper risponde con un errore o non è raggiungibile, NEO ripiega su Wikipedia e te lo dice.

Altri servizi (Tavily, Brave, Exa) non accettano chiamate dal browser, e DuckDuckGo blocca i server Vercel, per questo non sono usati.

## Agenti

Un agente è un **system prompt** con parametri facoltativi. Si sceglie dal menu in cima alla barra laterale.

- **⚙** modifica l'agente: nome, prompt, temperatura, top-p, max token (vuoto = valori del modello).
- **+** ne crea uno nuovo. **Elimina** rimuove quello corrente (ne resta sempre almeno uno).
- **⬇** installa una *skill*: incolla un URL GitHub o `owner/repo/percorso` (es. `vercel-labs/agent-skills/skills/react-best-practices`); Neo scarica il `SKILL.md` e lo aggiunge come agente (il corpo diventa il system prompt). Funziona solo con repo pubblici; skill lunghe possono saturare il contesto dei modelli piccoli.
- L'agente predefinito è *Neo*: «Sei Neo, assistente AI. Rispondi sempre in italiano, in modo breve e diretto. Se non sai la risposta, dillo.»
- Ogni chat ricorda il proprio agente. Le operazioni ⚡ ignorano l'agente e usano sempre i loro parametri fissi.

Valori predefiniti della chat: temperatura 0,5, top-p 0,9, 512 token, penalità di frequenza 0,3. Alcuni modelli (MiniCPM5) hanno valori consigliati propri.

## Cambiare modello, espellere, liberare spazio

Nel piè della barra laterale:

- **Nome del modello / ⇄ Cambia:** torna alla scelta del modello senza perdere le chat (**← Torna alla chat** per annullare). Non si può cambiare mentre sta rispondendo.
- **⏏ Espelli:** scarica il modello dalla RAM e dalla GPU e torna alla scelta. Le chat restano.
- **🧹 Spazio e memoria:** elenca i modelli scaricati nel browser (WebLLM, GGUF, cartelle importate) con la dimensione, e permette di eliminarli uno a uno o **tutti**. Mostra anche lo spazio usato dal sito sul totale disponibile. Le chat non vengono toccate.

## Problemi comuni

| Sintomo | Causa probabile | Cosa fare |
|---|---|---|
| «WebGPU non disponibile» | accelerazione hardware spenta o driver | attiva l'accelerazione in `chrome://settings/system`, controlla `chrome://gpu`, aggiorna i driver; su Brave abilita `brave://flags/#enable-unsafe-webgpu`; oppure usa un modello GGUF |
| Errore di memoria con un GGUF | modello troppo grande per WebAssembly (oltre circa 1 GB è rischioso) | prova MiniCPM5-1B o Minerva-350M |
| Il modello non risponde bene alle istruzioni | i modelli **Minerva** sono *base*, non addestrati a seguire istruzioni | usa un modello instruct (Qwen, Llama, Gemma, MiniCPM5) |
| «Ricerca web non eseguita» | Redact non si è caricato (offline o rete bloccata) | riprova con la rete attiva; la query non viene mai inviata senza filtro |
| Le chat spariscono | `localStorage` pieno (circa 5 MB) o dati del sito cancellati | elimina chat vecchie; il salvataggio è silenzioso |
| Risposta troppo corta | tetto di token dell'agente o dell'operazione | alza «Max token» nell'agente |
