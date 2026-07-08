## Publish packages

```bash
cd packages/crumbun
bun test
npm pack --dry-run
npm publish

cd ../create-crumbun
npm pack --dry-run
npm publish
```
