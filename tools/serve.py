"""Local preview server that never lets the browser cache files, so edits to
the JavaScript modules always show up on reload.

    python tools/serve.py          (then open http://localhost:5173)
"""
import functools
import http.server
import os

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


class NoCacheHandler(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header("Cache-Control", "no-store, must-revalidate")
        super().end_headers()

    def log_message(self, *args):
        pass


if __name__ == "__main__":
    handler = functools.partial(NoCacheHandler, directory=ROOT)
    with http.server.ThreadingHTTPServer(("127.0.0.1", 5173), handler) as httpd:
        print("Serving", ROOT, "at http://localhost:5173")
        httpd.serve_forever()
