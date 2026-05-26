# Remaining Tasks

## 1. `useState` without a setter in `ReaderPage`

[src/pages/ReaderPage.tsx](src/pages/ReaderPage.tsx#L233-L234):

```ts
const [file] = useState<File | null>(() => locationState?.file ?? null);
const [bookId] = useState<string | null>(() => locationState?.bookId ?? null);
```

Neither setter is used. Replace with plain `const` — the values are
immutable for the page's lifetime.

## 2. Move page-estimation helpers to `src/services/pageEstimation.ts`

[src/pages/ReaderPage.tsx](src/pages/ReaderPage.tsx) contains
`estimateCharsPerPage` and `getPlainTextLength`. Move both to
`src/services/pageEstimation.ts` so the page component stays focused on
composition.

## 3. Narrow `any` casts in `bookExtractor.ts` to per-line disables

[src/services/bookExtractor.ts](src/services/bookExtractor.ts#L70-L117)
uses a file-wide `/* eslint-disable @typescript-eslint/no-explicit-any */`
block. Replace with a per-line `// eslint-disable-next-line` comment on
each of the six casts so the rest of the file is fully type-checked.
