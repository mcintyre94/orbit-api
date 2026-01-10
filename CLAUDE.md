# Orbit API

Vercel serverless API for fetching Solana token holdings using the Jupiter API.

## Commands

- `pnpm vercel dev` - Run local dev server
- `pnpm build` - Compile TypeScript to dist/
- `pnpm check` - Run Biome linter
- `pnpm format:fix` - Auto-fix formatting with Biome

## Project Structure

- `api/` - Vercel serverless functions (TypeScript)
- `dist/` - Compiled output (gitignored)

## Environment Variables

- `JUPITER_API_KEY` - Required for Jupiter API requests
