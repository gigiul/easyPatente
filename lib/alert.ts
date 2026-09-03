import { Alert } from 'react-native';

export const AppAlert = {
  alert: (
    title: string,
    message?: string,
    buttons?: Array<{ text: string; style?: string; onPress?: () => void }>,
    options?: any
  ) => Alert.alert(title, message, buttons as any, options),
};
