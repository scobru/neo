# Micro-Neo 1.5B (Writing Assistant)

**Micro-Neo** è un modello linguistico leggero da **1.5 miliardi di parametri** ottimizzato specificamente per agire come **assistente di scrittura locale**. Il modello si basa sull'architettura di `Qwen/Qwen2.5-1.5B-Instruct` ed è stato rifinito tramite fine-tuning con adattatori LoRA su un dataset bilanciato in italiano e inglese, focalizzato su azioni di riscrittura, sintesi ed editing del testo.

Il modello è ideale per scenari di esecuzione offline (dispositivi mobile, PC locali o server leggeri) grazie alle conversioni quantizzate in formato **GGUF**.

## 🚀 Caratteristiche Principali & Azioni Supportate
Il modello è stato addestrato per eseguire con precisione le seguenti istruzioni di scrittura, mantenendo sempre la lingua dell'input (italiano o inglese) salvo diversa indicazione:

1. **`summary` (Riepilogo):** Riassume testi lunghi in forme brevi o in punti elenco concisi.
2. **`explain` (Spiegazione):** Semplifica concetti complessi o termini tecnici per renderli comprensibili a chiunque.
3. **`paraphrase` (Parafrasi):** Riformula il testo originale cambiandone le parole ma preservandone lunghezza e significato.
4. **`improve` (Miglioramento):** Corregge refusi, errori grammaticali e migliora la fluidità dello stile (addestrato inserendo rumore artificiale negli input).
5. **`tone` (Cambio di tono):** Riscrive il testo adottando diversi registri stilistici:
   - *Professional* (Professionale)
   - *Casual* (Colloquiale/Informale)
   - *Enthusiastic* (Entusiasta)
   - *Informative* (Neutro/Informativo)
   - *Creative* (Vivace/Creativo)
6. **`length` (Cambio di lunghezza):** Accorcia (`shorter`) o espande (`longer`) il testo di partenza.
7. **`quote` (Citazione):** Estrae frasi brevi e memorabili che catturano l'essenza del testo.
8. **`social` (Creazione Post):** Genera post pronti all'uso per specifiche piattaforme social rispetandone le regole:
   - *LinkedIn* (Tono professionale, 3-5 frasi, max 3 hashtag)
   - *X / Twitter* (Massimo 280 caratteri, max 2 hashtag)
   - *Facebook* (Tono amichevole, 2-4 frasi)
   - *Instagram* (Tono coinvolgente, emoji, 5-8 hashtag)

---

## 🛠️ Come è stato costruito (Pipeline di Addestramento)

L'intero processo di sviluppo è avvenuto all'interno di un ambiente Google Colab utilizzando una GPU NVIDIA T4:

1. **Generazione del Dataset (Distillazione):**
   - Abbiamo utilizzato un modello "Teacher" più grande (`Qwen2.5-3B-Instruct` quantizzato a 4-bit via `bitsandbytes`) per generare gli output di riferimento a partire da testi sorgente reali (estratti da Wikipedia IT/EN) e da testi sintetici scritti in vari generi e stili.
   - Abbiamo collezionato un dataset finale di circa **560 esempi di alta qualità**.
2. **Fine-Tuning (LoRA):**
   - Il modello "Studente" (`Qwen2.5-1.5B-Instruct`) è stato addestrato in precisione mista (`bfloat16`/`float16`) utilizzando la libreria `peft`.
   - Configurazione LoRA: `r=32`, `lora_alpha=32`, `target_modules="all-linear"`.
   - **Loss mirata:** Il calcolo della perdita è stato applicato **esclusivamente sulla risposta** dell'assistente, mascherando i token del prompt di istruzioni (label `-100`), per evitare che il modello memorizzasse la struttura delle domande anziché lo stile di risposta.
3. **Export GGUF:**
   - I pesi LoRA sono stati fusi con il modello base (`merge_and_unload`).
   - Il modello unito è stato convertito in formato GGUF tramite `llama.cpp` e quantizzato nei seguenti formati:
     - `micro-neo-f16.gguf` (2.9 GB) - Precisione originale senza degradazione.
     - `micro-neo-q8_0.gguf` (1.6 GB) - Consigliato per mantenere la massima aderenza alle risposte del teacher.
     - `micro-neo-q4_k_m.gguf` (941 MB) - Estremamente leggero, ideale per dispositivi con risorse minime.

---

## 📊 Risultati della Valutazione (Zero-Shot vs Fine-Tuned)

Prima del fine-tuning, il modello a 0.5B/1.5B mostrava forti incoerenze grammaticali in lingua italiana e faticava a rispettare i vincoli imposti.

Dopo sole 3 epoche di addestramento, la valutazione automatica su un set di test separato ha registrato metriche eccellenti:
* **Nessun vuoto (100%)** e **Nessun leak (100%):** Il modello non confonde mai l'input con l'output.
* **Senza preambolo (100%):** Il modello risponde direttamente senza premesse inutili del tipo "Ecco la riscrittura...".
* **Coerenza linguistica (98%):** Rispetta rigidamente la lingua d'origine del testo inserito.
* **Nessuna copia pigra:** La similarità media tra l'input e l'output per compiti di spiegazione e parafrasi è inferiore a **0.15**, dimostrando che il modello elabora ed esegue una reale riscrittura anziché copiare parti del testo sorgente.

---

## 💻 Uso in Locale

Per garantire il corretto funzionamento del chat template e la disattivazione del meccanismo di thinking interno, si consiglia di avviare il modello quantizzato tramite `llama-server` di `llama.cpp`:

```bash
# Avvia il server locale con il file GGUF
llama-server -m micro-neo-q8_0.gguf --jinja --port 8081 -c 2048

# Esegui le chiamate API impostando i parametri richiesti
CHAT_KWARGS='{"enable_thinking": false}' BASE_URL=http://localhost:8081/v1 MODEL=local python3 leo_local.py
```
