# create-crumbun

Create a tiny Bun fullstack app with `crumbun`.

## Use

```bash
bunx create-crumbun@latest my-app
cd my-app
bun install
bun run dev
```

Open `http://localhost:3000`.

Build static files:

```bash
bun run build
```

## What You Get

```txt
my-app/
  public/
  src/
    api/story/[id]/page.ts
    api/story/[id]/getstory.ts
    utils/corpus.js
    views/_layout.pug
    views/_layout.scss
    views/index.pug
    views/story/story.pug
    views/story/story.scss
    export.ts
    server.ts
```

The starter already includes:

- a running Bun server
- file routes under `src/api`
- Pug views under `src/views`
- SCSS view assets served from `/_crumbun`
- an example dynamic route at `/story/:id`
- static export to `dist/`
