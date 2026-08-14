import { WebSocketServer, WebSocket } from 'ws';
import { URL } from 'url';
import { handleDashboardConnection, broadcastToDashboard } from './dashboardWsHandler.js';
import { handleTwilioStream } from './mediaStreamHandler.js';
import { handleWebStream } from './webStreamHandler.js';
import { handleExotelStream } from './exotelStreamHandler.js';

// In-memory active session store
export const sessions = new Map();

/**
 * Initializes and binds WebSocket handlers to the HTTP server
 */
export function createWebSocketCoordinator(httpServer) {
  const wss = new WebSocketServer({ noServer: true });

  httpServer.on('upgrade', (request, socket, head) => {
    try {
      const { pathname } = new URL(request.url, `http://${request.headers.host}`);

      if (['/media-stream', '/web-stream', '/dashboard-ws', '/exotel-stream'].includes(pathname)) {
        wss.handleUpgrade(request, socket, head, (ws) => {
          wss.emit('connection', ws, request);
        });
      } else {
        socket.destroy();
      }
    } catch (err) {
      console.error('[WS] Upgrade error:', err.message);
      socket.destroy();
    }
  });

  wss.on('connection', async (ws, request) => {
    try {
      const { pathname } = new URL(request.url, `http://${request.headers.host}`);

      if (pathname === '/dashboard-ws') {
        handleDashboardConnection(ws);
      } else if (pathname === '/exotel-stream') {
        handleExotelStream(ws, request, sessions);
      } else if (pathname === '/media-stream') {
        handleTwilioStream(ws, sessions);
      } else if (pathname === '/web-stream') {
        handleWebStream(ws, sessions);
      }
    } catch (err) {
      console.error('[WS] Connection routing error:', err.message);
    }
  });

  return wss;
}
