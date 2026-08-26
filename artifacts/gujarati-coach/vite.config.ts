import path from 'path';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig, type PluginOption } from 'vite';

import runtimeErrorOverlay from '@replit/vite-plugin-runtime-error-modal';

const rawPort = process.env.PORT;

if (!rawPort) {
  throw new Error(
    'PORT environment variable is required but was not provided.',
  );
}

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

const basePath = process.env.BASE_PATH;

if (!basePath) {
  throw new Error(
    'BASE_PATH environment variable is required but was not provided.',
  );
}

/**
 * Serve the Apple App Site Association file as application/json.
 *
 * Apple's documentation asks for `application/json` on
 * /.well-known/apple-app-site-association. It arrives as `text/plain`, and the
 * cause is mechanical rather than a mistake: `vite preview` types static files
 * by EXTENSION, and this file deliberately has none because Apple requires it
 * that way. So no amount of config on the file itself can fix it; the header
 * has to be forced.
 *
 * FORCED BY WRAPPING setHeader, NOT BY SETTING IT FIRST. The static handler
 * (sirv) sets its own Content-Type when it serves the file, which would
 * overwrite a header set ahead of it. Patching the one response's setHeader
 * means whatever sirv decides, JSON is what goes out. Scoped to a single
 * request and to the Content-Type header alone.
 *
 * WHETHER THIS WAS BREAKING ANYTHING IS UNPROVEN. Recent iOS is widely
 * reported to accept text/plain here, and Universal Links may well have been
 * working. It is a one-line class of fix and it only matters once a build
 * carrying associatedDomains is in front of real users, which is now.
 */
const AASA_PATH = "/.well-known/apple-app-site-association";

function appleSiteAssociationJson(): PluginOption {
  const middleware = (
    req: { url?: string },
    res: { setHeader: (name: string, value: unknown) => unknown },
    next: () => void,
  ) => {
    const pathname = (req.url ?? "").split("?")[0];
    // Suffix match rather than equality: a non-root `base` would prefix the
    // URL, and Apple still requires the file at the domain root.
    if (pathname.endsWith(AASA_PATH)) {
      const original = res.setHeader.bind(res);
      res.setHeader = (name: string, value: unknown) =>
        String(name).toLowerCase() === "content-type"
          ? original(name, "application/json")
          : original(name, value);
    }
    next();
  };
  return {
    name: "apple-app-site-association-json",
    // Both hooks: preview is what serves production, and dev is included so a
    // local check of this header tells the truth rather than only the deploy.
    configureServer(server) {
      server.middlewares.use(middleware);
    },
    configurePreviewServer(server) {
      server.middlewares.use(middleware);
    },
  };
}

export default defineConfig({
  base: basePath,
  plugins: [
    react(),
    tailwindcss({ optimize: false }),
    runtimeErrorOverlay(),
    appleSiteAssociationJson(),
    ...(process.env.NODE_ENV !== 'production' &&
    process.env.REPL_ID !== undefined
      ? [
          await import('@replit/vite-plugin-cartographer').then((m) =>
            m.cartographer({
              root: path.resolve(import.meta.dirname, '..'),
            }),
          ),
          await import('@replit/vite-plugin-dev-banner').then((m) =>
            m.devBanner(),
          ),
        ]
      : []),
  ],
  resolve: {
    alias: {
      '@': path.resolve(import.meta.dirname, 'src'),
      '@assets': path.resolve(
        import.meta.dirname,
        '..',
        '..',
        'attached_assets',
      ),
    },
    dedupe: ['react', 'react-dom'],
  },
  root: path.resolve(import.meta.dirname),
  build: {
    outDir: path.resolve(import.meta.dirname, 'dist/public'),
    emptyOutDir: true,
  },
  server: {
    port,
    strictPort: true,
    host: '0.0.0.0',
    allowedHosts: true,
    fs: {
      strict: true,
    },
    // Local development only. On Replit the client and the API sat behind one
    // origin, so the generated client's "/api" base just worked and this config
    // never needed a proxy. On a laptop they are two processes on two ports, and
    // without this every request 404s against the vite server.
    //
    // Env-gated so it is INERT anywhere API_PROXY_TARGET is unset, which is
    // every deployed environment.
    ...(process.env.API_PROXY_TARGET
      ? {
          proxy: {
            '/api': {
              target: process.env.API_PROXY_TARGET,
              changeOrigin: true,
            },
          },
        }
      : {}),
  },
  preview: {
    port,
    host: '0.0.0.0',
    allowedHosts: true,
  },
});
