# Modelli

NEO usa solo [WebLLM](https://webllm.mlc.ai/) (MLC): i modelli girano sulla **GPU** via WebGPU, in un Web Worker, quindi l'interfaccia non si blocca. Formato: pesi MLC + libreria `.wasm` WebGPU.

## Catalogo WebGPU (WebLLM)

L'elenco viene dal catalogo di WebLLM, filtrato a famiglie piccole: SmolLM, Qwen2.5 (0.5B, 1.5B, 3B), Qwen3, Llama 3.2 (1B, 3B), Phi 3.5 Mini, Phi 3.5 Vision, Phi 4 Mini, Gemma 2 2B, Gemma 3 1B, TinyLlama. Restano esclusi i modelli che richiedono più di 4000 MB di VRAM.

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

## Modelli personalizzati

**Scegli un modello → + Modello personalizzato.** I modelli aggiunti compaiono per primi nell'elenco e vengono salvati nel browser (`neo-custom`).

### MLC da URL

- **Nome (id)**, per esempio `neo-1b-q4f16_1-MLC`.
- **URL pesi:** la cartella MLC (per esempio un repo Hugging Face). WebLLM aggiunge `resolve/main/` se l'URL non lo contiene già. Sono ammessi anche percorsi relativi, serviti dalla stessa origine.
- **URL libreria `.wasm`**, oppure `@nome-del-modello-del-catalogo` per **riusare il `.wasm`** di un modello del catalogo (stessa architettura, quantizzazione e contesto; per Qwen2.5 non serve compilare nulla).
- Facoltativi: **contesto** (token), **VRAM richiesta** (MB), casella **richiede shader-f16**.

### Cartella MLC dal disco

Scegli una cartella che contenga `mlc-chat-config.json` (e il `.wasm`, nella cartella o come file separato; altrimenti `@modello` nel campo libreria). WebLLM conosce solo gli URL, quindi NEO **copia i file nella stessa cache del browser** che WebLLM usa per i download, sotto l'indirizzo finto `https://leo.local/<nome>/resolve/main/`: così il modello risulta «già scaricato». Il nome `leo.local` è un residuo del vecchio nome del progetto ed è stato mantenuto per non invalidare i modelli già importati. NEO chiede al browser di non eliminare questi pesi (`storage.persist`).

Rimuovendo un modello dal disco con tasto destro, o da **🧹 Spazio e memoria**, i file copiati vengono cancellati.

## Micro-Neo, il modello di NEO

Micro-Neo è un modello da 1,5 miliardi di parametri, basato su Qwen2.5-1.5B-Instruct e rifinito con LoRA per le operazioni di scrittura in italiano e inglese. Si usa in NEO come modello personalizzato dopo la conversione in MLC. Scheda completa in [MODEL.md](../MODEL.md); addestramento ed esportazione in [Fine-tuning](finetuning.md).
