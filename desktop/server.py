"""Private packaged service. No system Python, npm or public port is needed."""

import json
import os
import socket
import sys
import threading

import uvicorn


def main():
    from backend.app import app

    parent = int(os.environ.get("C3D_READER_PARENT_PID", "0"))
    listener = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    listener.bind(("127.0.0.1", 0))
    listener.listen(128)
    port = listener.getsockname()[1]

    class DesktopServer(uvicorn.Server):
        async def startup(self, sockets=None):
            await super().startup(sockets=sockets)
            if self.started:
                print(json.dumps({"ready": True, "port": port}), flush=True)

    server = DesktopServer(
        uvicorn.Config(
            app,
            loop="asyncio",
            http="h11",
            ws="none",
            access_log=False,
            log_level="warning",
            log_config=None,
        )
    )

    def watch_parent():
        while not server.should_exit and parent:
            try:
                os.kill(parent, 0)
            except OSError:
                server.should_exit = True
                return
            threading.Event().wait(1)

    threading.Thread(target=watch_parent, daemon=True).start()
    try:
        server.run(sockets=[listener])
    finally:
        listener.close()


if __name__ == "__main__":
    # Ensure import roots also work when executed as a source script.
    if not getattr(sys, "frozen", False):
        from pathlib import Path

        sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
    main()
