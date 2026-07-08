# create-fstug

Create a tiny Bun fullstack app using `fstug` and Pug.

## Use

```bash
bunx create-fstug my-app
cd my-app
bun install
bun run dev
```

The generated app uses:

- `src/api/**/page.ts` file routes
- `[id]` dynamic params
- Pug views in `src/views`
- static files in `public`
