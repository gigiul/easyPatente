#!/usr/bin/env python3
"""
Genera spiegazioni localmente chiamando direttamente LM Studio.
Versione PARALLELIZZATA: usa un pool di thread per elaborare piu'
domande contemporaneamente (embedding + chunk retrieval + chiamata LLM
+ salvataggio su Supabase sono tutte operazioni indipendenti per riga).

IMPORTANTE: il parallelismo reale e' limitato da "Max Concurrent
Predictions" nel model loader di LM Studio (default 4). Se quel valore
e' 1, le richieste vengono comunque accodate internamente una alla
volta anche se qui ne mandiamo N insieme: aumenta MAX_WORKERS solo se
hai alzato anche quel valore in LM Studio.

Ripresa dopo interruzione: gia' funziona "out of the box". Ogni riga
viene salvata su Supabase (PATCH) non appena e' pronta, e la lista
"to_explain" viene ricostruita a ogni avvio filtrando solo le domande
con explanation ancora NULL. Fermando lo script (Ctrl+C) e rilanciandolo,
le domande gia' completate non vengono rigenerate.
"""
import json
import os
import sys
import threading
import urllib.request
import urllib.parse
import time
from pathlib import Path
from concurrent.futures import ThreadPoolExecutor, as_completed

SUPABASE_URL = os.environ.get("SUPABASE_URL", "https://mvkxafzywzuohnbqjqmo.supabase.co")
SUPABASE_KEY = os.environ.get("SUPABASE_KEY", "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im12a3hhZnp5d3p1b2huYnFqcW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MzU4ODgzMiwiZXhwIjoyMDg5MTY0ODMyfQ.Cz8AncuuZnSKdec5COxhNHGaNm5KR_Hh8aGRU261RiA")
LLM_ENDPOINT = os.environ.get("LLM_ENDPOINT", "http://localhost:1234")
LLM_MODEL = os.environ.get("LLM_MODEL", "google/gemma-4-26b-a4b-qat")
EMBEDDING_MODEL = os.environ.get("EMBEDDING_MODEL", "text-embedding-embeddinggemma-300m")

# Numero di domande elaborate in parallelo.
# Deve essere <= "Max Concurrent Predictions" impostato nel model loader
# di LM Studio, altrimenti le richieste in eccesso si accodano lato
# server senza guadagno di velocita'.
MAX_WORKERS = int(os.environ.get("MAX_WORKERS", "4"))

# Few-shot examples per immagini
FEW_SHOT_EXAMPLES = [
  {
    "description": "Triangolo con bordo rosso e freccia nera a forma di S che si snoda prima verso destra e poi verso sinistra",
    "sign": "Doppia curva, la prima a destra",
    "question": "Il segnale preannuncia una sola curva pericolosa a destra.",
    "answer": "Falsa"
  },
  {
    "description": "Triangolo con bordo rosso e due figure nere di bambini che corrono",
    "sign": "Bambini",
    "question": "Il segnale si trova nei pressi di scuole o giardini pubblici frequentati da fanciulli.",
    "answer": "Vera"
  },
  {
    "description": "Triangolo con bordo rosso e sagoma nera di un cervo che salta",
    "sign": "Animali selvatici vaganti",
    "question": "Il segnale impone il divieto di transito ai veicoli trainati da animali.",
    "answer": "Falsa"
  },
  {
    "description": "Triangolo con bordo rosso e sagoma nera di un'autovettura che lascia tracce ondulate sulla strada",
    "sign": "Strada sdrucciolevole",
    "question": "Il segnale preannuncia un tratto di strada che può diventare sdrucciolevole per ghiaccio o pioggia.",
    "answer": "Vera"
  },
  {
    "description": "Triangolo con bordo rosso e sagoma nera di un uomo che scava con una vanga",
    "sign": "Lavori",
    "question": "Il segnale indica la presenza di un cantiere stradale temporaneo.",
    "answer": "Vera"
  },
  {
    "description": "Cerchio rosso con barra orizzontale bianca al centro",
    "sign": "Senso vietato",
    "question": "Il segnale vieta l'ingresso a tutti i veicoli sulla strada in cui è posto.",
    "answer": "Vera"
  },
  {
    "description": "Cerchio bianco con bordo rosso",
    "sign": "Divieto di transito",
    "question": "Il segnale vieta la circolazione nei due sensi di marcia a tutti i veicoli.",
    "answer": "Vera"
  },
  {
    "description": "Cerchio blu con bordo rosso e due barre diagonali rosse incrociate a forma di X",
    "sign": "Divieto di fermata",
    "question": "Il segnale vieta la sosta ma consente la fermata breve per far salire o scendere passeggeri.",
    "answer": "Falsa"
  },
  {
    "description": "Cerchio con bordo rosso e due sagome di autovetture affiancate, quella a sinistra rossa e quella a destra nera",
    "sign": "Divieto di sorpasso",
    "question": "Il segnale consente il sorpasso dei veicoli privi di motore, come le biciclette.",
    "answer": "Vera"
  },
  {
    "description": "Cerchio con bordo rosso e sagoma nera di un carro trainato da un cavallo",
    "sign": "Divieto di transito ai veicoli a trazione animale",
    "question": "Il segnale vieta il transito ai quadrupedi da soma e da sella.",
    "answer": "Falsa"
  },
  {
    "description": "Cerchio grigio con numero 50 in nero sbarrato da cinque linee diagonali nere",
    "sign": "Fine del limite massimo di velocità",
    "question": "Il segnale indica la fine del divieto di superare la velocità di 50 km/h.",
    "answer": "Vera"
  },
  {
    "description": "Cerchio blu con freccia bianca rivolta verso destra",
    "sign": "Direzione obbligatoria a destra",
    "question": "Il segnale obbliga i conducenti a svoltare a destra all'incrocio.",
    "answer": "Vera"
  },
  {
    "description": "Cerchio blu con freccia bianca obliqua rivolta verso il basso a destra",
    "sign": "Passaggio obbligatorio a destra",
    "question": "Il segnale impone di svoltare alla prima strada a destra.",
    "answer": "Falsa"
  },
  {
    "description": "Cerchio blu con il disegno bianco di uno pneumatico munito di catene da neve",
    "sign": "Catene per neve obbligatorie",
    "question": "Il segnale consente il transito se il veicolo è equipaggiato con pneumatici invernali.",
    "answer": "Vera"
  },
  {
    "description": "Cerchio blu diviso verticalmente da una linea bianca con a sinistra il simbolo bianco della bicicletta e a destra il simbolo bianco del pedone",
    "sign": "Pista ciclabile contigua al marciapiede",
    "question": "Il segnale indica un percorso unico ad uso promiscuo per pedoni e ciclisti.",
    "answer": "Falsa"
  },
  {
    "description": "Cerchio blu con numero 30 in bianco sbarrato da una linea diagonale rossa",
    "sign": "Fine del limite minimo di velocità",
    "question": "Il segnale indica che è vietato circolare a velocità superiori a 30 km/h.",
    "answer": "Falsa"
  },
  {
    "description": "Cerchio blu con tre frecce bianche ricurve che formano un cerchio in senso antiorario",
    "sign": "Rotatoria",
    "question": "Il segnale indica la presenza di un'intersezione nella quale la circolazione è regolata a rotatoria.",
    "answer": "Vera"
  },
  {
    "description": "Ottagono rosso con bordo bianco e scritta STOP in lettere bianche al centro",
    "sign": "Fermarsi e dare precedenza",
    "question": "Il segnale obbliga a fermarsi e dare la precedenza anche se non sopraggiungono altri veicoli.",
    "answer": "Vera"
  },
  {
    "description": "Triangolo bianco capovolto con bordo rosso",
    "sign": "Dare precedenza",
    "question": "Il segnale impone l'obbligo di arresto immediato del veicolo in ogni caso.",
    "answer": "Falsa"
  },
  {
    "description": "Cerchio rosso con bordo bianco, contenente una freccia rossa rivolta verso l'alto e una freccia nera rivolta verso il basso",
    "sign": "Precedenza nei sensi unici alternati",
    "question": "Il segnale indica che si ha la precedenza rispetto ai veicoli provenienti dal senso opposto.",
    "answer": "Falsa"
  },
  {
    "description": "Rettangolo blu con una linea verticale bianca sormontata da un segmento orizzontale rosso",
    "sign": "Strada senza uscita",
    "question": "Il segnale indica che la strada è chiusa al transito dei soli veicoli a motore.",
    "answer": "Falsa"
  },
  {
    "description": "Rettangolo verde con il disegno bianco di un cavalcavia che scavalca una strada a due carreggiate separate",
    "sign": "Inizio autostrada",
    "question": "Il segnale è posto all'inizio di una strada extraurbana principale.",
    "answer": "Falsa"
  },
  {
    "description": "Rettangolo blu contenente una lettera P bianca di grandi dimensioni",
    "sign": "Parcheggio",
    "question": "Il segnale indica una zona autorizzata per la sosta dei veicoli per un tempo indeterminato, salvo diversa indicazione.",
    "answer": "Vera"
  },
  {
    "description": "Cerchio blu con freccia bianca obliqua verso il basso a destra",
    "sign": "Passaggio obbligatorio a destra",
    "question": "Il segnale indica obbligo di passare a destra di un cantiere stradale",
    "answer": "Vera"
  },
  {
    "description": "Cerchio bianco con linea nera centrale leggermente obliqua",
    "sign": "Via libera",
    "question": "È un segnale di fine prescrizione; indica il punto dove le prescrizioni precedentemente imposte non sono più valide. Può quindi indicare la fine di divieti o di obblighi imposti sul tratto di strada precedente. È sbagliato dire che il segnale indica la fine di un cantiere di lavoro, di un centro abitato o di una strada sdrucciolevole (in quanto questi sono segnali di indicazione e di pericolo).",
    "answer": "Vera"
  },
]

# Lock solo per stampe/counter ordinati in console (non serve per i dati:
# ogni domanda scrive una riga diversa su Supabase, nessuna race condition
# sui dati).
print_lock = threading.Lock()


def log(msg):
    with print_lock:
        print(msg)


def supabase_get(table, select="*", filters=""):
    """Fetch all rows with pagination (Supabase default limit is 1000)."""
    all_rows = []
    offset = 0
    batch_size = 1000

    while True:
        safe_select = urllib.parse.quote(select, safe=",")
        url = f"{SUPABASE_URL}/rest/v1/{table}?select={safe_select}&offset={offset}&limit={batch_size}"
        if filters:
            url += f"&{filters}"
        req = urllib.request.Request(url, headers={
            "apikey": SUPABASE_KEY,
            "Authorization": f"Bearer {SUPABASE_KEY}",
        })
        with urllib.request.urlopen(req, timeout=60) as resp:
            batch = json.loads(resp.read())
            if not batch:
                break
            all_rows.extend(batch)
            print(f"  Fetched {len(all_rows)} rows so far...")
            if len(batch) < batch_size:
                break
            offset += batch_size

    return all_rows


def supabase_patch(table, data, filters):
    body = json.dumps(data).encode()
    req = urllib.request.Request(
        f"{SUPABASE_URL}/rest/v1/{table}?{filters}",
        data=body,
        method="PATCH",
        headers={
            "apikey": SUPABASE_KEY,
            "Authorization": f"Bearer {SUPABASE_KEY}",
            "Content-Type": "application/json",
            "Prefer": "return=minimal",
        },
    )
    with urllib.request.urlopen(req, timeout=30) as resp:
        return resp.status


def generate_embedding(text):
    payload = json.dumps({"model": EMBEDDING_MODEL, "input": text}).encode()
    req = urllib.request.Request(
        f"{LLM_ENDPOINT}/v1/embeddings",
        data=payload,
        headers={"Content-Type": "application/json"},
    )
    with urllib.request.urlopen(req, timeout=30) as resp:
        data = json.loads(resp.read())
        return data["data"][0]["embedding"]


def call_llm(prompt):
    payload = json.dumps({
        "model": LLM_MODEL,
        "messages": [
            {"role": "system", "content": "Sei un istruttore di scuola guida. Rispondi in italiano. NON menzionare il tuo nome o che sei un'AI. Inizia direttamente con la spiegazione."},
            {"role": "user", "content": prompt},
        ],
        "max_tokens": 4096,
        "temperature": 0.7,
    }).encode()

    req = urllib.request.Request(
        f"{LLM_ENDPOINT}/v1/chat/completions",
        data=payload,
        headers={"Content-Type": "application/json"},
    )

    with urllib.request.urlopen(req, timeout=120) as resp:
        data = json.loads(resp.read())
        return data["choices"][0]["message"]["content"].strip()


def call_llm_with_image(question, context, lang, image_base64):
    few_shot_text = "\n".join([
        f'Esempio: Segnale "{ex["description"]}" → {ex["sign"]}. Domanda: "{ex["question"]}" → {ex["answer"]}.'
        for ex in FEW_SHOT_EXAMPLES
    ])

    prompt = f"""Sei un istruttore di scuola guida. Analizza l'immagine e rispondi alla domanda Vero/False.

Regole:
1. Se l'immagine mostra un segnale stradale, identificalo (categoria + obblighi specifici)
2. Se l'immagine NON è un segnale stradale (es. persona, incidente, situazione), NON dire "l'immagine non è un segnale". Rispondi direttamente alla domanda basandoti sul contesto
3. NON descrivere il segnale visivamente (niente "cerchio blu con freccia")
4. Basati sul contesto del manuale
5. Rispondi in MASSIMO 2 frasi
6. Termina con "Per questo la domanda è Vera." o "Per questo la domanda è Falsa."

Esempi:
{few_shot_text}

Contesto dal manuale:
{context}

Domanda (Vero/Falso): {question}

Rispondi in {lang}."""

    content = [
        {"type": "text", "text": prompt},
        {"type": "image_url", "image_url": {"url": image_base64}},
    ]

    payload = json.dumps({
        "model": LLM_MODEL,
        "messages": [
            {"role": "system", "content": f"Rispondi sempre in {lang}. NON menzionare il tuo nome o che sei un'AI. Inizia direttamente con la spiegazione."},
            {"role": "user", "content": content},
        ],
        "max_tokens": 4096,
        "temperature": 0.7,
    }).encode()

    req = urllib.request.Request(
        f"{LLM_ENDPOINT}/v1/chat/completions",
        data=payload,
        headers={"Content-Type": "application/json"},
    )

    with urllib.request.urlopen(req, timeout=120) as resp:
        data = json.loads(resp.read())
        return data["choices"][0]["message"]["content"].strip()


# --- Chunks caricati UNA SOLA VOLTA in RAM (sola lettura -> thread-safe) ---
_ALL_CHUNKS = None
_ALL_CHUNKS_LOCK = threading.Lock()


def load_all_chunks():
    global _ALL_CHUNKS
    if _ALL_CHUNKS is None:
        with _ALL_CHUNKS_LOCK:
            if _ALL_CHUNKS is None:  # doppio controllo dopo aver preso il lock
                chunks_path = Path(__file__).parent.parent.parent / "ragPipeline" / "manualChunker" / "output" / "manual_chunks.json"
                with open(chunks_path) as f:
                    _ALL_CHUNKS = json.load(f)
                log(f"Caricati {len(_ALL_CHUNKS)} chunk in memoria (una sola volta).")
    return _ALL_CHUNKS


def get_chunks(embedding):
    all_chunks = load_all_chunks()

    scored = []
    emb_list = embedding if isinstance(embedding, list) else json.loads(embedding)
    for chunk in all_chunks:
        chunk_emb = chunk.get("embedding")
        if not chunk_emb:
            continue
        dot = sum(a * b for a, b in zip(emb_list, chunk_emb))
        norm_a = sum(a * a for a in emb_list) ** 0.5
        norm_b = sum(b * b for b in chunk_emb) ** 0.5
        if norm_a > 0 and norm_b > 0:
            similarity = dot / (norm_a * norm_b)
            scored.append((similarity, chunk))

    scored.sort(reverse=True)
    return [c for _, c in scored[:5]]


def build_context(chunks):
    parts = []
    for c in chunks:
        meta = []
        if c.get("chapter"):
            meta.append(f"Capitolo: {c['chapter']}")
        if c.get("section"):
            meta.append(f"Sezione: {c['section']}")
        if c.get("article_ref"):
            meta.append(f"Articoli: {', '.join(c['article_ref'])}")
        header = " — ".join(meta)
        text = c.get("text", "")
        parts.append(f"{header}\n{text}" if header else text)
    return "\n\n---\n\n".join(parts)


def text_prompt(question, context, lang):
    return f"""Spiega in MASSIMO 2 frasi perché la risposta è Vera o Falsa.
Basati solo sul contesto fornito. Non inventare. Non elencare tutti i segnali del manuale.

Contesto:
{context}

Domanda (Vero/Falso): {question}

Rispondi in {lang}. Termina con 'Per questo la domanda è Vera.' oppure 'Per questo la domanda è Falsa.'"""


def fetch_image_base64(filename):
    if not filename:
        return None
    storage_url = f"{SUPABASE_URL}/storage/v1/object/public/easypatente/{filename}"
    try:
        req = urllib.request.Request(storage_url)
        with urllib.request.urlopen(req, timeout=15) as resp:
            img_bytes = resp.read()
            import base64
            ext = filename.rsplit(".", 1)[-1].lower()
            mime = "jpeg" if ext == "jpg" else ext
            b64 = base64.b64encode(img_bytes).decode()
            return f"data:image/{mime};base64,{b64}"
    except Exception as e:
        log(f"  Image fetch error: {e}")
        return None


def process_one(q, index, total):
    """Elabora una singola domanda: embedding -> chunk -> LLM -> salvataggio.
    Ritorna (True, msg) o (False, msg)."""
    question_id = q["id"]
    text = q["text"]
    image_filename = q.get("image_filename")
    code = q["code"]

    try:
        embedding = generate_embedding(text)
        chunks = get_chunks(embedding)
        context = build_context(chunks)

        if image_filename:
            image_base64 = fetch_image_base64(image_filename)
            if image_base64:
                explanation = call_llm_with_image(text, context, "it", image_base64)
            else:
                explanation = call_llm(text_prompt(text, context, "it"))
        else:
            explanation = call_llm(text_prompt(text, context, "it"))

        supabase_patch(
            "question_translations",
            {"explanation": explanation},
            f"question_id=eq.{question_id}&lang_code=eq.it"
        )

        log(f"[{index}/{total}] OK {code}: {explanation[:80]}...")
        return True, None

    except Exception as e:
        log(f"[{index}/{total}] ERROR {code}: {e}")
        return False, str(e)


def main():
    if not SUPABASE_KEY:
        print("ERROR: Set SUPABASE_KEY")
        sys.exit(1)

    print(f"LLM: {LLM_ENDPOINT} ({LLM_MODEL})")
    print(f"Embedding: {EMBEDDING_MODEL}")
    print(f"Worker paralleli: {MAX_WORKERS}\n")

    print("Fetching questions...")
    questions = supabase_get("questions", "id,code,image_filename")

    translations = supabase_get(
        "question_translations",
        "question_id,text,explanation",
        "lang_code=eq.it"
    )

    trans_map = {t["question_id"]: t for t in translations}

    to_explain = []
    for q in questions:
        trans = trans_map.get(q["id"])
        if trans and not trans.get("explanation") and trans.get("text"):
            to_explain.append({**q, "text": trans["text"]})

    print(f"\nTotal questions: {len(questions)}")
    print(f"With explanation: {len(questions) - len(to_explain)}")
    print(f"To explain: {len(to_explain)}\n")

    if not to_explain:
        print("All questions already explained!")
        return

    # Precarica i chunk una volta sola, prima di far partire i thread
    load_all_chunks()

    total = len(to_explain)
    success = 0
    failed = 0

    with ThreadPoolExecutor(max_workers=MAX_WORKERS) as executor:
        futures = {
            executor.submit(process_one, q, i + 1, total): q
            for i, q in enumerate(to_explain)
        }

        try:
            for future in as_completed(futures):
                ok, _ = future.result()
                if ok:
                    success += 1
                else:
                    failed += 1
        except KeyboardInterrupt:
            log("\nInterrotto dall'utente. I task già completati sono salvati su Supabase.")
            log("Rilanciando lo script riprenderà solo dalle domande rimaste senza spiegazione.")
            executor.shutdown(wait=False, cancel_futures=True)
            sys.exit(1)

    print(f"\nDone: {success} explained, {failed} failed")


if __name__ == "__main__":
    main()