const workspaceModules = new Map([
  ['@rds/core', './dist/packages/core/src/index.js'],
  ['@rds/shared', './dist/packages/shared/src/index.js'],
]);

export async function resolve(specifier, context, nextResolve) {
  const target = workspaceModules.get(specifier);
  if (target) return { url: new URL(target, import.meta.url).href, shortCircuit: true };
  return nextResolve(specifier, context);
}
