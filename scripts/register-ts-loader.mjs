// `node --import ./scripts/register-ts-loader.mjs ...` — registra o mesmo
// loader do scripts/run-ts.mjs (alias `@/` + imports sem extensão) pra rodar
// os testes (`npm test`, node:test) em Node puro, sem tsx/esbuild (binário
// nativo bloqueado nesta máquina). Node 22.6+ remove os tipos sozinho.
import { register } from "node:module";

register("./bundler-resolve-loader.mjs", import.meta.url);
