import * as ScreenOrientation from 'expo-screen-orientation';
import { useEffect } from 'react';

export function useLockOrientation(
  orientation: ScreenOrientation.OrientationLock
) {
  useEffect(() => {
    ScreenOrientation.lockAsync(orientation);
    return () => {
      ScreenOrientation.unlockAsync();
    };
  }, [orientation]);
}
