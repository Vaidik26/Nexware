import { toast as hotToast, ToastOptions } from 'react-hot-toast';

export const toast = {
  success: (message: string, options?: ToastOptions) => 
    hotToast.success(message, {
      style: { background: '#f8f9ff', color: '#0b1c30', border: '1px solid #bfc9c3' },
      iconTheme: { primary: '#006c49', secondary: '#ffffff' },
      ...options,
    }),
  error: (message: string, options?: ToastOptions) =>
    hotToast.error(message, {
      style: { background: '#f8f9ff', color: '#0b1c30', border: '1px solid #bfc9c3' },
      iconTheme: { primary: '#ba1a1a', secondary: '#ffffff' },
      ...options,
    }),
  loading: (message: string, options?: ToastOptions) =>
    hotToast.loading(message, {
      style: { background: '#f8f9ff', color: '#0b1c30', border: '1px solid #bfc9c3' },
      ...options,
    }),
  dismiss: (toastId?: string) => hotToast.dismiss(toastId),
};
