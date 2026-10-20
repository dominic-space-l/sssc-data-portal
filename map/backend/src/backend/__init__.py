from flask import Flask

# 5001 rather than Flask's default 5000, which macOS AirPlay Receiver occupies.
# Must match the proxy target in map/frontend/proxy.conf.json.
PORT = 5001


def create_app() -> Flask:
    app = Flask(__name__)

    @app.get("/api/health")
    def health():
        return {"status": "ok"}

    return app


def main() -> None:
    create_app().run(host="127.0.0.1", port=PORT, debug=True)
