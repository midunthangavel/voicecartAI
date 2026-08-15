import { WebSocketServer, WebSocket } from 'ws';
import { URL } from 'url';
import { handleDashboardConnection } from './dashboardWsHandler.js';
import { handleTwilioStream } from './mediaStreamHandler.js';
import { handleWebStream } from './webStreamHandler.js';
import { handleExotelStream } from './exotelStreamHandler.js';
import { verifyToken } from '../services/auth.service.js';
import { consumeWsTicket } from '../services/wsTicketService.js';
import { logger } from '../utils/logger.js';

// In-memory active session store
export const sessions = new Map();

/**
 * Initializes and binds WebSocket handlers to the HTTP server with multi-stream upgrade authentication
 */
export function createWebSocketCoordinator(httpServer) {
  const wss = new WebSocketServer({
    noServer: true,
    maxPayload: 512 * 1024, // 512kb maximum payload limit
  });

  httpServer.on('upgrade', async (request, socket, head) => {
    try {
      const url = new URL(request.url, `http://${request.headers.host}`);
      const pathname = url.pathname;

      if (!['/media-stream', '/web-stream', '/dashboard-ws', '/exotel-stream'].includes(pathname)) {
        socket.write('HTTP/1.1 404 Not Found\r\n\r\n');
        socket.destroy();
        return;
      }

      // ── 1. Dashboard WebSocket Upgrade Authentication (Single-Use Ticket / Bearer Token) ──
      if (pathname === '/dashboard-ws') {
        const ticket = url.searchParams.get('ticket');
        const token = url.searchParams.get('access_token') || url.searchParams.get('token') ||
          (request.headers.authorization?.startsWith('Bearer ') ? request.headers.authorization.substring(7) : null);

        let user = null;

        if (ticket) {
          user = consumeWsTicket(ticket);
        }

        if (!user && token) {
          try {
            user = await verifyToken(token);
          } catch {}
        }

        if (user) {
          if (!['ADMIN', 'RESTAURANT_MANAGER', 'STAFF', 'KITCHEN'].includes(user.role)) {
            socket.write('HTTP/1.1 403 Forbidden\r\n\r\n');
            socket.destroy();
            return;
          }
          request.auth = user;
        } else if (process.env.NODE_ENV === 'production') {
          socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
          socket.destroy();
          return;
        } else {
          // Dev fallback
          request.auth = {
            userId: 'dev_staff',
            tenantId: 't_annapoorna',
            restaurantId: 'r_coimbatore_01',
            role: 'ADMIN',
          };
        }
      }

      // ── 2. Browser Voice Web-Stream Authentication ──
      if (pathname === '/web-stream') {
        const ticket = url.searchParams.get('ticket') || url.searchParams.get('voice_token');
        const token = url.searchParams.get('token') ||
          (request.headers.authorization?.startsWith('Bearer ') ? request.headers.authorization.substring(7) : null);

        let voiceAuth = null;
        if (ticket) {
          voiceAuth = consumeWsTicket(ticket);
        }
        if (!voiceAuth && token) {
          try {
            voiceAuth = await verifyToken(token);
          } catch {}
        }

        // Allow public demo callers in dev if explicitly unauthenticated, but require ticket in prod
        if (voiceAuth) {
          request.auth = voiceAuth;
        } else if (process.env.NODE_ENV === 'production' && !url.searchParams.get('demo')) {
          socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
          socket.destroy();
          return;
        }
      }

      // ── 3. Complete Upgrade ──
      wss.handleUpgrade(request, socket, head, (ws) => {
        wss.emit('connection', ws, request);
      });
    } catch (err) {
      logger.error('[WS Upgrade] Error handling upgrade request:', err);
      socket.write('HTTP/1.1 500 Internal Server Error\r\n\r\n');
      socket.destroy();
    }
  });

  wss.on('connection', (ws, request) => {
    const url = new URL(request.url, `http://${request.headers.host}`);
    const pathname = url.pathname;

    ws.auth = request.auth || null;
    ws.isAlive = true;
    ws.on('pong', () => { ws.isAlive = true; });

    if (pathname === '/dashboard-ws') {
      handleDashboardConnection(ws, request);
    } else if (pathname === '/media-stream') {
      handleTwilioStream(ws, request);
    } else if (pathname === '/web-stream') {
      handleWebStream(ws, request);
    } else if (pathname === '/exotel-stream') {
      handleExotelStream(ws, request);
    }
  });

  // Heartbeat liveness check (every 30s)
  const pingInterval = setInterval(() => {
    wss.clients.forEach((ws) => {
      if (!ws.isAlive) return ws.terminate();
      ws.isAlive = false;
      ws.ping();
    });
  }, 30000);

  wss.on('close', () => clearInterval(pingInterval));

  return wss;
}
