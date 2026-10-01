# Modelli

NEO ha due motori. Il motore dipende dal tipo di modello scelto.

| | WebLLM (MLC) | wllama (GGUF) |
|---|---|---|
| Hardware | **GPU**, via WebGPU | **CPU**, via WebAssembly |
| Formato | MLC (pesi + libreria `.wasm` WebGPU) | GGUF (llama.cpp) |
| Velocità | alta | più lenta |
| Stato | stabile | sperimentale |
| Esecuzione | in un Web Worker, l'interfaccia non si blocca | in un worker di wllama |

## Catalogo WebGPU (WebLLM)

L'elenco viene dal catalogo di WebLLM, filtrato a famiglie piccole: SmolLM, Qwen2.5 (0.5B, 1.5B, 3B), Llama 3.2 (1B, 3B), Phi 3.5 Mini, Phi 4 Mini, Gemma 2 2B, Gemma 3 1B, TinyLlama. Restano esclusi i modelli che richiedono più di 4000 MB di VRAM.

- **Precisione:** se la GPU supporta `shader-f16` si usano le varianti `q4f16`, altrimenti `q4f32`. Se non ce ne sono abbastanza, si mostra qualsiasi precisione.
- **Ordine:** prima i migliori che entrano in memoria (Qwen2.5-1.5B, Llama 3.2-3B, Gemma 2-2B, Llama 3.2-1B, Qwen2.5-3B), poi per dimensione. I modelli minuscoli sono una cattiva scelta predefinita.

| Modello | Dimensione indicativa | Note |
|---|---|---|
| SmolLM2-360M | ~200 MB | velocissimo, funziona ovunque |
| Qwen2.5-0.5B | ~350 MB | multilingua, buon compromesso |
| SmolLM2-1.7B | ~1 GB | qualità bilanciata |
| Llama 3.2-1B | ~700 MB | versatile, buon inglese |
| Qwen2.5-1.5B | ~900 MB | alta qualità multilingua |
| Gemma 2-2B | ~1,3 GB | Google |
| Phi 3.5 Mini | ~2 GB | ragionamento |

## Modelli GGUF (CPU)

Sezione **GGUF · wllama** nell'elenco. I file vengono scaricati da Hugging Face.

| Modello | Dimensione | Tipo | Note |
|---|---|---|---|
| Minerva-350M-base (Q8_0) | ~374 MB | base | italiano/inglese, Sapienza NLP |
| Minerva-1B-base (Q4_K_M) | ~617 MB | base | idem |
| Minerva-3B-base (Q4_K_M) | ~1,7 GB | base | idem; rischia di non entrare in memoria |
| MiniCPM5-1B (Q4_K_M) | ~688 MB | chat | OpenBMB, EN/中文, italiano debole |
| MiniCPM5-2B (Q4_K_M) | ~1,5 GB | chat | idem; rischia di non entrare in memoria |

- I **Minerva** sono modelli *base*: non seguono bene le istruzioni senza fine-tuning. NEO usa per loro un formato semplice «### Utente / ### Assistente» e taglia la risposta al successivo `###`.
- I **MiniCPM5** usano il formato ChatML con un `<s>` iniziale (senza, l'output degenera) e con il ragionamento (`<think>`) disattivato. Parametri consigliati: temperatura 0,7, top-p 0,95.
- Il motore gira **solo su CPU** (`n_gpu_layers: 0`) e, se la pagina non è isolata tra origini diverse, su un solo thread.
- Se wllama si desincronizza («Invalid typed array length»), NEO ricrea l'istanza e riprova una volta: il file è già in cache, quindi è rapido.

## Build community

Una build WebGPU di **MiniCPM5-2B** di un autore terzo (non OpenBMB) è in lista con l'etichetta «community», sempre in fondo. Il suo `.wasm` **gira nel tuo browser**: usala solo se ti fidi dell'autore.

## Modelli personalizzati

**Scegli un modello → + Modello personalizzato.** I modelli aggiunti compaiono per primi nell'elenco e vengono salvati nel browser (`neo-custom`).

### MLC da URL

- **Nome (id)**, per esempio `neo-1b-q4f16_1-MLC`.
- **URL pesi:** la cartella MLC (per esempio un repo Hugging Face). WebLLM aggiunge `resolve/main/` se l'URL non lo contiene già. Sono ammessi anche percorsi relativi, serviti dalla stessa origine.
- **URL libreria `.wasm`**, oppure `@nome-del-modello-del-catalogo` per **riusare il `.wasm`** di un modello del catalogo (stessa architettura, quantizzazione e contesto; per Qwen2.5 non serve compilare nulla).
- Facoltativi: **contesto** (token), **VRAM richiesta** (MB), casella **richiede shader-f16**.

### GGUF da URL

Un URL a un file `.gguf`. Il nome è facoltativo (altrimenti viene dal file) e puoi indicare il contesto (predefinito 2048). Il modello gira con wllama sulla CPU.

### Cartella MLC dal disco

Scegli una cartella che contenga `mlc-chat-config.json` (e il `.wasm`, nella cartella o come file separato; altrimenti `@modello` nel campo libreria). WebLLM conosce solo gli URL, quindi NEO **copia i file nella stessa cache del browser** che WebLLM usa per i download, sotto l'indirizzo finto `https://leo.local/<nome>/resolve/main/`: così il modello risulta «già scaricato». Il nome `leo.local` è un residuo del vecchio nome del progetto ed è stato mantenuto per non invalidare i modelli già importati. NEO chiede al browser di non eliminare questi pesi (`storage.persist`).

Rimuovendo un modello dal disco con tasto destro, o da **🧹 Spazio e memoria**, i file copiati vengono cancellati.

## Micro-Neo, il modello di NEO

Micro-Neo è un modello da 1,5 miliardi di parametri, basato su Qwen2.5-1.5B-Instruct e rifinito con LoRA per le operazioni di scrittura in italiano e inglese. Si usa in NEO come modello personalizzato dopo la conversione in MLC. Scheda completa in [MODEL.md](../MODEL.md); addestramento ed esportazione in [Fine-tuning](finetuning.md).
