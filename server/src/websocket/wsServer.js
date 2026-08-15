import { WebSocketServer, WebSocket } from 'ws';
import { URL } from 'url';
import { handleDashboardConnection } from './dashboardWsHandler.js';
import { handleTwilioStream } from './mediaStreamHandler.js';
import { handleWebStream } from './webStreamHandler.js';
import { handleExotelStream } from './exotelStreamHandler.js';
import { verifyToken } from '../services/auth.service.js';
import { logger } from '../utils/logger.js';

// In-memory active session store
export const sessions = new Map();

/**
 * Initializes and binds WebSocket handlers to the HTTP server with upgrade authentication
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

      // ── WebSocket Upgrade Authentication ──
      if (pathname === '/dashboard-ws') {
        const token = url.searchParams.get('access_token') || url.searchParams.get('token') ||
          (request.headers.authorization?.startsWith('Bearer ') ? request.headers.authorization.substring(7) : null);

        if (token) {
          try {
            const user = await verifyToken(token);
            if (!['ADMIN', 'RESTAURANT_MANAGER', 'STAFF', 'KITCHEN'].includes(user.role)) {
              socket.write('HTTP/1.1 403 Forbidden\r\n\r\n');
              socket.destroy();
              return;
            }
            request.auth = user;
          } catch (err) {
            socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
            socket.destroy();
            return;
          }
        } else if (process.env.NODE_ENV === 'production') {
          socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
          socket.destroy();
          return;
        } else {
          // Local dev fallback
          request.auth = {
            userId: 'dev_admin',
            tenantId: 't_annapoorna',
            restaurantId: 'r_coimbatore_01',
            role: 'ADMIN',
          };
        }
      }

      wss.handleUpgrade(request, socket, head, (ws) => {
        wss.emit('connection', ws, request);
      });
    } catch (err) {
      logger.error('[WS] Upgrade error:', err);
      socket.destroy();
    }
  });

  wss.on('connection', async (ws, request) => {
    try {
      const { pathname } = new URL(request.url, `http://${request.headers.host}`);

      if (pathname === '/dashboard-ws') {
        handleDashboardConnection(ws, request);
      } else if (pathname === '/exotel-stream') {
        handleExotelStream(ws, request, sessions);
      } else if (pathname === '/media-stream') {
        handleTwilioStream(ws, sessions);
      } else if (pathname === '/web-stream') {
        handleWebStream(ws, sessions);
      }
    } catch (err) {
      logger.error('[WS] Connection routing error:', err);
    }
  });

  return wss;
}
