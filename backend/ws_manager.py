import asyncio
from fastapi import WebSocket
from typing import List
import json
import logging

logger = logging.getLogger(__name__)

#: How long the whole fan-out is allowed to take. A socket that has gone away
#: without a FIN (phone on a dead cell, laptop asleep with the dashboard open)
#: does not fail fast — the write sits in the kernel buffer until TCP gives up,
#: which can be minutes. Broadcasts are advisory, so a slow client must never be
#: able to hold up the request that triggered the broadcast.
BROADCAST_TIMEOUT_SECONDS = 2.0


class ConnectionManager:
    def __init__(self):
        self.active_connections: List[WebSocket] = []

    async def connect(self, websocket: WebSocket):
        await websocket.accept()
        self.active_connections.append(websocket)
        logger.info(f"WebSocket connected. Total: {len(self.active_connections)}")

    def disconnect(self, websocket: WebSocket):
        if websocket in self.active_connections:
            self.active_connections.remove(websocket)
            logger.info(f"WebSocket disconnected. Total: {len(self.active_connections)}")

    async def broadcast(self, message: dict):
        """
        Push a message to every connected client.

        Sends run concurrently and under a shared deadline. The previous version
        awaited each ``send_text`` in turn, so total latency was the sum of every
        client's — and a single stalled socket delayed everyone behind it.

        Never raises: a broadcast is a notification, not part of the caller's
        unit of work.
        """
        connections = list(self.active_connections)
        if not connections:
            return

        text = json.dumps(message)

        async def send(connection: WebSocket):
            await connection.send_text(text)

        try:
            results = await asyncio.wait_for(
                asyncio.gather(
                    *(send(c) for c in connections),
                    return_exceptions=True,
                ),
                timeout=BROADCAST_TIMEOUT_SECONDS,
            )
        except asyncio.TimeoutError:
            # Deadline hit. Individual outcomes are unavailable, so keep every
            # connection: dropping them here would disconnect healthy clients
            # that merely lost a race. A genuinely dead one fails on the next
            # broadcast and is pruned then.
            logger.warning(
                "WebSocket broadcast timed out after %.1fs with %d connection(s)",
                BROADCAST_TIMEOUT_SECONDS,
                len(connections),
            )
            return

        dead_connections = [
            connection
            for connection, result in zip(connections, results)
            if isinstance(result, Exception)
        ]
        for dead in dead_connections:
            self.disconnect(dead)


manager = ConnectionManager()
