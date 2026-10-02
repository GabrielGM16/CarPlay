/**
 * Lets `node --test` resolve the extensionless relative imports that Metro
 * resolves for React Native.
 *
 * Source files import `'../lib/format'`, which is idiomatic for a React Native
 * project but not valid ESM. Rather than writing `.ts` extensions through the
 * app just to satisfy the test runner, this registers a synchronous resolve
 * hook that tries `.ts`, `.tsx`, then an `/index` file — the same order Metro
 * uses. Only relative specifiers are touched; bare package names fall through
 * to Node's own resolution.
 *
 * Wired in through the `test` script as `--import ./scripts/ts-resolve.mjs`.
 */
import { registerHooks } from 'node:module';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const CANDIDATE_SUFFIXES = ['.ts', '.tsx', '/index.ts', '/index.tsx'];

registerHooks({
  resolve(specifier, context, nextResolve) {
    const isRelative = specifier.startsWith('./') || specifier.startsWith('../');
    const hasExtension = /\.[cm]?[jt]sx?$|\.json$/.test(specifier);

    if (isRelative && !hasExtension && context.parentURL) {
      for (const suffix of CANDIDATE_SUFFIXES) {
        const candidate = new URL(specifier + suffix, context.parentURL);
        if (existsSync(fileURLToPath(candidate))) {
          // No `format`: Node infers `module-typescript` from the extension
          // and strips the types. Naming `module` here would skip that.
          return { url: candidate.href, shortCircuit: true };
        }
      }
    }

    return nextResolve(specifier, context);
  },
});
