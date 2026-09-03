export const AppAlert = {
  alert: (
    title: string,
    message?: string,
    buttons?: Array<{ text: string; style?: string; onPress?: () => void | Promise<void> }>,
    _options?: any
  ) => {
    const fullMessage = message ? `${title}\n\n${message}` : title;

    if (!buttons || buttons.length === 0) {
      window.alert(fullMessage);
      return;
    }

    if (buttons.length === 1) {
      window.alert(fullMessage);
      buttons[0].onPress?.();
      return;
    }

    // 2+ bottoni: usa confirm (OK = non-cancel, Cancel = cancel)
    const cancelBtn = buttons.find((b) => b.style === 'cancel');
    const confirmBtn = buttons.find((b) => b.style !== 'cancel') ?? buttons[buttons.length - 1];

    const confirmed = window.confirm(fullMessage);
    if (confirmed) {
      confirmBtn?.onPress?.();
    } else {
      cancelBtn?.onPress?.();
    }
  },
};
