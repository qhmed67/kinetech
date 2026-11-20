// Re-export the native module. On web, it will be resolved to KinetechSecurityModule.web.ts
// and on native platforms to KinetechSecurityModule.ts
export { default } from './src/KinetechSecurityModule';
export * from './src/KinetechSecurity.types';
