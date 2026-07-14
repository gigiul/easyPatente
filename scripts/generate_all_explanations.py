#!/usr/bin/env python3
"""
Genera spiegazioni per tutte le domande che non hanno ancora un'Explanation.
Chiama l'Edge Function explain-question per ogni domanda.
"""
import json
import os
import sys
import urllib.request
import time

SUPABASE_URL = os.environ.get("SUPABASE_URL", "https://mvkxafzywzuohnbqjqmo.supabase.co")
SUPABASE_KEY = os.environ.get("SUPABASE_KEY", "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im12a3hhZnp5d3p1b2huYnFqcW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MzU4ODgzMiwiZXhwIjoyMDg5MTY0ODMyfQ.Cz8AncuuZnSKdec5COxhNHGaNm5KR_Hh8aGRU261RiA")
EDGE_FUNCTION_URL = f"{SUPABASE_URL}/functions/v1/explain-question"


def supabase_get(table, select="*", filters=""):
    url = f"{SUPABASE_URL}/rest/v1/{table}?select={select}"
    if filters:
        url += f"&{filters}"
    req = urllib.request.Request(url, headers={
        "apikey": SUPABASE_KEY,
        "Authorization": f"Bearer {SUPABASE_KEY}",
    })
    with urllib.request.urlopen(req, timeout=30) as resp:
        return json.loads(resp.read())


def call_edge_function(question_id, question_text, lang_code="it"):
    payload = json.dumps({
        "question_id": question_id,
        "question_text": question_text,
        "lang_code": lang_code,
    }).encode()

    req = urllib.request.Request(
        EDGE_FUNCTION_URL,
        data=payload,
        headers={
            "Content-Type": "application/json",
            "Authorization": f"Bearer {SUPABASE_KEY}",
        },
    )

    try:
        with urllib.request.urlopen(req, timeout=120) as resp:
            return json.loads(resp.read())
    except urllib.error.HTTPError as e:
        error_body = e.read().decode()
        print(f"  HTTP Error {e.code}: {error_body[:200]}")
        return None
    except Exception as e:
        print(f"  Error: {e}")
        return None


def main():
    if not SUPABASE_KEY:
        print("ERROR: Set SUPABASE_KEY")
        sys.exit(1)

    print("Fetching questions without explanation...\n")

    # Get questions that need explanation
    questions = supabase_get(
        "questions",
        "id, code",
        "limit=1000"
    )

    # Get existing explanations
    translations = supabase_get(
        "question_translations",
        "question_id, explanation",
        "lang_code=eq.it&explanation=not.is.null"
    )

    explained_ids = {t["question_id"] for t in translations}
    to_explain = [q for q in questions if q["id"] not in explained_ids]

    print(f"Total questions: {len(questions)}")
    print(f"Already explained: {len(explained_ids)}")
    print(f"To explain: {len(to_explain)}\n")

    if not to_explain:
        print("All questions already have explanations!")
        return

    # Process in batches
    success = 0
    failed = 0

    for i, q in enumerate(to_explain):
        question_id = q["id"]
        code = q["code"]

        # Get question text from translations
        try:
            trans = supabase_get(
                "question_translations",
                "text",
                f"question_id=eq.{question_id}&lang_code=eq.it&limit=1"
            )
            question_text = trans[0]["text"] if trans else code
        except:
            question_text = code

        print(f"[{i+1}/{len(to_explain)}] {code}: {question_text[:50]}...")

        result = call_edge_function(question_id, question_text, "it")

        if result and "explanation" in result:
            print(f"  OK: {result['explanation'][:80]}...")
            success += 1
        else:
            print(f"  FAILED")
            failed += 1

        # Rate limit
        time.sleep(1)

    print(f"\nDone: {success} explained, {failed} failed")


if __name__ == "__main__":
    main()
