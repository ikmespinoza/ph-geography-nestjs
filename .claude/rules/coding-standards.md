# Coding Standards

- Keep every file under **1500 lines**. As a file approaches the limit, split it into focused modules (a feature module + dedicated providers/controllers), never a grab-bag `utils` file.
- **No pyramid of doom.** Use guard clauses and early returns instead of nested conditionals; more than two levels of nesting is a refactor signal.
- Functions have a single responsibility and stay under ~50 lines. Extract complex logic into well-named helpers.
- Minimal comments: only for hidden control flow or genuinely non-obvious code. Never restate what the code does.
- **TypeScript strict, no `any`** — use `unknown` and narrow, or a precise type. Types/interfaces for every DTO, config shape, and data model.
- Interfaces/types used in decorated signatures (controllers, providers, handlers) must use `import type` — `isolatedModules` + `emitDecoratorMetadata` fails the build otherwise. **DTO classes stay value imports** (the `ValidationPipe` + `ClassSerializerInterceptor` need them at runtime).
- **Validate every input** with DTOs + the global `ValidationPipe` (`whitelist`, `forbidNonWhitelisted`, `transform`); **shape every response** with DTOs + `ClassSerializerInterceptor`. Wire fields are snake_case (`name_tl`, `alt_name`, `full_name`, `is_capital`); never leak Prisma internals (ids / FKs / timestamps).
- **Errors**: throw Nest `HttpException` subclasses from services; a global exception filter renders the agreed shape with correct status codes (404 for missing — never 200). No stack traces to clients.
- Match the existing style: kebab-case filenames (`regions.controller.ts`, `region-detail.dto.ts`), PascalCase classes, camelCase members. Prettier + ESLint are the arbiters — `pnpm lint` must be clean.
