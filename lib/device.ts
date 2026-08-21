import { storage } from './storage';

const DEVICE_ID_KEY = '@installation_id';

/**
 * Restituisce l'identificativo univoco di installazione del dispositivo.
 * L'ID viene generato la prima volta e persistito in AsyncStorage.
 * Viene cancellato solo con la disinstallazione dell'app.
 */
export async function getDeviceId(): Promise<string> {
  const existing = await storage.get(DEVICE_ID_KEY);
  if (existing) return existing;

  const random = Math.random().toString(36).substring(2, 15)
    + Math.random().toString(36).substring(2, 15);
  const deviceId = `dev_${random}`;

  await storage.set(DEVICE_ID_KEY, deviceId);
  return deviceId;
}
