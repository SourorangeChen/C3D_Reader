import { createRequire } from "node:module";

const runtime = createRequire(import.meta.url)("../scripts/python-runtime.cjs");
export const resolvePython: () => string = runtime.resolvePython;
