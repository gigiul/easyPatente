#!/usr/bin/env python3
"""Local OpenAI-compatible embedding adapter for the loaded EmbeddingGemma GGUF.

The llama.cpp GGUF contains the transformer and mean-pooling output only. The
official EmbeddingGemma sentence-transformers pipeline also applies two dense
projections (768 -> 3072 -> 768) and L2 normalization. This adapter calls the
already-running llama.cpp server with the raw text and applies those two dense
layers from the corresponding sentence-transformers model before returning the
768-dimension vector.

It is a local development helper: it reads an optional upstream API key from a
file and never writes credentials or corpus data to stdout.
"""
import argparse
import json
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import sys
import urllib.error
import urllib.request

import torch
from huggingface_hub import hf_hub_download
from safetensors.torch import load_file


def load_dense(model_id):
    w2 = load_file(hf_hub_download(model_id, "2_Dense/model.safetensors"))["linear.weight"].float()
    w3 = load_file(hf_hub_download(model_id, "3_Dense/model.safetensors"))["linear.weight"].float()
    if tuple(w2.shape) != (3072, 768) or tuple(w3.shape) != (768, 3072):
        raise ValueError(f"Unexpected dense shapes: {tuple(w2.shape)} {tuple(w3.shape)}")
    return w2, w3


def project(vectors, w2, w3):
    x = torch.tensor(vectors, dtype=torch.float32)
    if x.ndim != 2 or x.shape[1] != 768:
        raise ValueError(f"Unexpected upstream shape: {tuple(x.shape)}")
    x = torch.nn.functional.normalize((x @ w2.T) @ w3.T, p=2, dim=1)
    if not torch.isfinite(x).all():
        raise ValueError("Non-finite projected embedding")
    return x.tolist()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--host", default="127.0.0.1")
    parser.add_argument("--port", type=int, default=8890)
    parser.add_argument("--upstream", default="http://127.0.0.1:62167/v1")
    parser.add_argument("--upstream-model", default="unsloth/embeddinggemma-300m-GGUF")
    parser.add_argument("--api-key-file", default="")
    parser.add_argument("--dense-model", default="unsloth/embeddinggemma-300m")
    args = parser.parse_args()

    api_key = ""
    if args.api_key_file:
        with open(args.api_key_file) as fh:
            api_key = fh.read().strip()
    w2, w3 = load_dense(args.dense_model)
    upstream = args.upstream.rstrip("/")
    if not upstream.endswith("/embeddings"):
        upstream += "/embeddings"

    class Handler(BaseHTTPRequestHandler):
        def _json(self, status, payload):
            body = json.dumps(payload, ensure_ascii=False).encode()
            self.send_response(status)
            self.send_header("Content-Type", "application/json")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)

        def do_GET(self):
            if self.path in ("/health", "/v1/health"):
                self._json(200, {"status": "ok"})
            elif self.path in ("/v1/models", "/models"):
                self._json(200, {"object": "list", "data": [{"id": args.upstream_model, "object": "model"}]})
            else:
                self._json(404, {"error": "not found"})

        def do_POST(self):
            if self.path not in ("/v1/embeddings", "/embeddings"):
                self._json(404, {"error": "not found"})
                return
            try:
                length = int(self.headers.get("Content-Length", "0"))
                request = json.loads(self.rfile.read(length) or b"{}")
                inputs = request.get("input", [])
                if isinstance(inputs, str):
                    inputs = [inputs]
                if not isinstance(inputs, list) or not inputs:
                    raise ValueError("input must be a non-empty string or list")
                headers = {"Content-Type": "application/json"}
                if api_key:
                    headers["Authorization"] = "Bearer " + api_key
                upstream_request = urllib.request.Request(
                    upstream,
                    data=json.dumps({"model": args.upstream_model, "input": inputs}, ensure_ascii=False).encode(),
                    headers=headers,
                    method="POST",
                )
                with urllib.request.urlopen(upstream_request, timeout=120) as response:
                    body = json.load(response)
                data = body.get("data", [])
                vectors = [item.get("embedding") if isinstance(item, dict) else item for item in data]
                if len(vectors) != len(inputs):
                    raise ValueError(f"Upstream returned {len(vectors)} vectors for {len(inputs)} inputs")
                projected = project(vectors, w2, w3)
                self._json(200, {
                    "object": "list",
                    "model": args.upstream_model,
                    "data": [{"object": "embedding", "index": i, "embedding": v} for i, v in enumerate(projected)],
                    "usage": {"prompt_tokens": sum(len(str(t).split()) for t in inputs), "total_tokens": sum(len(str(t).split()) for t in inputs)},
                })
            except urllib.error.HTTPError as exc:
                self._json(502, {"error": f"upstream HTTP {exc.code}"})
            except Exception as exc:
                self._json(400, {"error": str(exc)})

        def log_message(self, fmt, *args):
            pass

    server = ThreadingHTTPServer((args.host, args.port), Handler)
    print(f"Local embedding adapter listening on http://{args.host}:{args.port}/v1; upstream={upstream}; model={args.upstream_model}", flush=True)
    server.serve_forever()


if __name__ == "__main__":
    main()
