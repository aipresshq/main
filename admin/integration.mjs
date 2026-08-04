import { renderAdminPage } from './ui.mjs';
import { handleAdminApiRequest } from './api-handlers.mjs';

function readRequestBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', (chunk) => chunks.push(chunk));
    req.on('end', () => {
      if (chunks.length === 0) {
        resolve(undefined);
        return;
      }
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString('utf-8')));
      } catch (error) {
        reject(error);
      }
    });
    req.on('error', reject);
  });
}

export default function adminPanel() {
  return {
    name: 'local-admin-panel',
    hooks: {
      'astro:server:setup': ({ server, logger }) => {
        server.middlewares.use(async (req, res, next) => {
          if (!req.url || !req.url.startsWith('/admin')) {
            next();
            return;
          }

          try {
            if (req.url.startsWith('/admin/api/')) {
              const body = ['POST', 'PUT'].includes(req.method ?? '')
                ? await readRequestBody(req)
                : undefined;
              const { status, json } = await handleAdminApiRequest({
                method: req.method ?? 'GET',
                url: req.url,
                body,
              });
              res.statusCode = status;
              res.setHeader('Content-Type', 'application/json');
              res.end(JSON.stringify(json));
              return;
            }

            res.statusCode = 200;
            res.setHeader('Content-Type', 'text/html');
            res.end(renderAdminPage());
          } catch (error) {
            logger.error(String(error));
            res.statusCode = 500;
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({ error: 'Internal error' }));
          }
        });
      },
    },
  };
}
