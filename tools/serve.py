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


handler = functools.partial(http.server.SimpleHTTPRequestHandler, directory=root)
with Server((bind, port), handler) as httpd:
    print(f'Serving {os.path.abspath(root)} at http://{bind}:{port}/', flush=True)
    httpd.serve_forever()
