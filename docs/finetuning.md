# Fine-tuning: Micro-Neo

Micro-Neo è un modello piccolo per le operazioni di scrittura di NEO. Questa pagina riassume come si addestra e si porta nel browser. La scheda del modello è in [MODEL.md](../MODEL.md).

## Materiale nel repository

| File | Cos'è |
|---|---|
| `dataset/leo_dataset.jsonl` | 563 esempi (una riga JSON ciascuno) |
| `notebook/neo_finetune_v5.ipynb` | notebook Colab attuale (consigliato) |
| `notebook/neo_finetune_v4.ipynb` | versione precedente (esperimento con MiniCPM5-1B) |
| `MODEL.md` | scheda del modello e risultati |

### Formato del dataset

```json
{"sid": 0, "action": "summary", "param": "", "input": "<testo>", "output": "<risposta del teacher>"}
```

- `sid`: identificatore del testo sorgente (serve a non mettere lo stesso testo in addestramento e in valutazione).
- `action`: `summary`, `explain`, `paraphrase`, `improve`, `tone`, `length`, `quote`, `social`, `translate`.
- `param`: per `tone` (professional, casual, enthusiastic, informative, creative), `length` (shorter, longer), `social` (linkedin, x, instagram, facebook); vuoto per le altre.

Distribuzione attuale: improve 103, length 91, social 89, tone 85, summary 79, quote 46, explain 43, paraphrase 27. Il dataset non contiene ancora esempi `translate`: la v5 li genera.

## Pipeline (v5)

1. **Dataset esistente + deficit:** se `neo_dataset.jsonl` (o il vecchio `leo_dataset.jsonl`) è nella cartella di Colab, viene ri-filtrato con controlli severi. Il teacher genera **solo ciò che manca** per arrivare a `TARGET_PER_COMBO` esempi (predefinito 120) per ognuna delle 17 combinazioni azione/parametro (~2000 totali).
2. **Teacher:** Qwen2.5-3B-Instruct in 4 bit (`qwen3b`, veloce) oppure 7B (`qwen7b`, migliore, circa il doppio più lento).
3. **Testi sorgente:** paragrafi di Wikipedia (IT/EN, 250-1100 caratteri) più testi sintetici di vari generi. Quota di italiano 70%, di Wikipedia 55%. Per l'azione `improve` si inserisce rumore (refusi) nel 80% dei casi.
4. **Filtri:** niente output troncati, ripetizioni degenerate o quasi-copie dell'input; vincoli per piattaforma (X ≤ 280 caratteri e ≤ 2 hashtag, LinkedIn ≤ 3, Instagram 5-8 con emoji, niente liste di soli hashtag). Il notebook stampa perché scarta gli esempi.
5. **Studente + LoRA:** `r=32`, `lora_alpha=32`, `target_modules="all-linear"`. Preset: `qwen05` (0.5B, 6 epoche), `qwen15` (1.5B, 3 epoche, consigliato), `gemma1b`.
6. **Training:** la **loss è calcolata solo sulla risposta** (etichette `-100` sul prompt). Gli esempi più lunghi di `MAX_SEQ` (1280 token) vengono **scartati, mai troncati**: un troncamento taglierebbe il token di fine e insegnerebbe al modello a non fermarsi. La divisione addestramento/valutazione è per testo sorgente.
7. **Valutazione:** gli stessi controlli automatici sul modello base (adapter spento) e sul modello addestrato, su 120 esempi tenuti fuori. Misurano la **forma** (nessun vuoto, nessuna perdita dell'input, nessun preambolo, lingua coerente, vincoli social), non la qualità dell'italiano: leggi anche gli esempi a confronto.
8. **Export:** adapter LoRA, modello unito (`merge_and_unload`), GGUF e MLC.

Runtime indicativo: GPU T4; circa 1-1,5 ore di generazione per ~2000 esempi partendo da zero.

## Regola fondamentale: prompt identici

Il notebook (cella «Prompt condivisi») e `index.html` (`SYSTEM`, `TONES`, `PLATFORMS`, `buildPrompt`, tetti di token) devono coincidere **carattere per carattere**. Il notebook salva anche `neo_prompts_reference.json` per verificarlo. Se cambi un prompt, cambialo in entrambi e riaddestra.

## Esportazione

### GGUF (per llama.cpp)

Il notebook converte in f16 e quantizza:

| File | Dimensione indicativa | Quando |
|---|---|---|
| `micro-neo-f16.gguf` | ~2,9 GB | precisione originale |
| `micro-neo-q8_0.gguf` | ~1,6 GB | il più fedele al teacher |
| `micro-neo-q4_k_m.gguf` | ~940 MB | il più leggero |

Uso locale con llama.cpp: `llama-server -m micro-neo-q8_0.gguf --jinja --port 8081 -c 2048`. NEO non legge i GGUF: per usarlo nel browser serve il formato MLC (vedi sotto).

### MLC (per la GPU in NEO)

WebLLM non legge i GGUF: serve il formato MLC. Per Qwen2.5 si **riusa il `.wasm` del catalogo**:

```bash
mlc_llm convert_weight micro_neo_merged --quantization q4f16_1 -o micro-neo-q4f16_1-MLC
mlc_llm gen_config micro_neo_merged --quantization q4f16_1 --conv-template qwen2 \
  --context-window-size 4096 --prefill-chunk-size 1024 -o micro-neo-q4f16_1-MLC
```

(I comandi seguono la documentazione MLC-LLM e nel notebook sono segnalati come non eseguiti: se `pip` non trova le wheel per la versione di Python di Colab, usa Linux o WSL con Python 3.11/3.12.) Poi carica la cartella su Hugging Face e in NEO, **+ Modello personalizzato**:

| Campo | Valore |
|---|---|
| Nome | `micro-neo-q4f16_1-MLC` |
| URL pesi | il tuo repo Hugging Face, oppure una cartella servita dalla stessa origine |
| Libreria | `@Qwen2.5-1.5B-Instruct-q4f16_1-MLC` (per `qwen05`: `@Qwen2.5-0.5B-Instruct-q4f16_1-MLC`) |
| Contesto | `4096` (deve corrispondere al `.wasm`) |
| shader-f16 | spuntato |

In alternativa **Importa cartella dal disco** (vedi [Modelli](modelli.md)). Funziona solo per Qwen2.5; per Gemma serve compilare un `.wasm` proprio.

**Verifica finale:** prendi 3-4 input degli esempi a confronto, lanciali in NEO con la stessa azione e confronta. Il modello quantizzato (q4) perde qualità: rifai la valutazione su quello.

## Sicurezza

Il token Hugging Face va nei *Secrets* di Colab (`HF_TOKEN`), mai scritto nel notebook.
