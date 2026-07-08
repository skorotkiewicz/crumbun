# create-crumbun

Create a tiny Bun fullstack app using `crumbun`, Pug, and static export.

## Use

```bash
bunx create-crumbun my-app
cd my-app
bun install
bun run dev
```

Export static pages:

```bash
bun run build
```

The generated app uses:

- `src/api/**/page.ts` file routes
- `[id]` dynamic params
- Pug views in `src/views`
- static files in `public`
- static export to `dist`
