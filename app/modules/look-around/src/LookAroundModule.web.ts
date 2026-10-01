import type { SnapshotSource } from './LookAround.types';

// Look Around exists only on Apple platforms.
const LookAroundModule: { snapshot: (...args: unknown[]) => Promise<SnapshotSource | null> } | null = null;

export default LookAroundModule;
