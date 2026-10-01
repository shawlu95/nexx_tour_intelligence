// Re-export the native module. On web, it will be resolved to LookAroundModule.web.ts
// and on native platforms to LookAroundModule.ts
export { default } from './src/LookAroundModule';
export * from './src/LookAround.types';
