import { NativeModule, requireOptionalNativeModule } from 'expo';
import type { SnapshotSource } from './LookAround.types';

declare class LookAroundModule extends NativeModule<Record<string, never>> {
  /** Writes a JPEG to `path` (file:// URI). Returns where the image came from, or null. */
  snapshot(latitude: number, longitude: number, width: number, height: number, path: string): Promise<SnapshotSource | null>;
}

// Null where the native module isn't built in (Android, or an app binary built before it existed).
export default requireOptionalNativeModule<LookAroundModule>('LookAround');
