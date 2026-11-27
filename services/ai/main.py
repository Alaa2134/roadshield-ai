"""Vercel FastAPI autodetected entrypoint.

Route paths are handled by FastAPI itself, not rewritten to a fixed destination.
The imported module downloads and verifies the published ONNX model on cold start.
"""
from api.index import app  # noqa: F401
