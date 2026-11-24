"""Serve the site locally: python tools/serve.py [port] [bind address]

Like `python -m http.server`, but with a longer listen queue: the standard one holds 5
waiting connections, and a browser loading the site's modules opens more than that at
once, which Windows answers with refused connections.
"""
import functools
import http.server
import os
import sys

port = int(sys.argv[1]) if len(sys.argv) > 1 else 8000
bind = sys.argv[2] if len(sys.argv) > 2 else '127.0.0.1'
root = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..')


class Server(http.server.ThreadingHTTPServer):
    request_queue_size = 128


class Handler(http.server.SimpleHTTPRequestHandler):
    # Without a Cache-Control header browsers guess how long to keep files and may run an old module after an
    # edit; no-cache makes them ask every time (an unchanged file is a quick 304).
    def end_headers(self):
        self.send_header('Cache-Control', 'no-cache')
        super().end_headers()


handler = functools.partial(Handler, directory=root)
with Server((bind, port), handler) as httpd:
    print(f'Serving {os.path.abspath(root)} at http://{bind}:{port}/', flush=True)
    httpd.serve_forever()
