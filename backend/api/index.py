import sys
import os

current_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
if current_dir not in sys.path:
    sys.path.insert(0, current_dir)

from backend.main import app

# Export app for Vercel serverless runtime
__all__ = ["app"]
