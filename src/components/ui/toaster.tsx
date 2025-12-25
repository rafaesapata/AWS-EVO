import { useToast } from "@/hooks/use-toast";
import { Toast, ToastClose, ToastDescription, ToastProvider, ToastTitle, ToastViewport } from "@/components/ui/toast";

/**
 * Safely converts any value to a renderable string
 * Handles cases where description might be an object (e.g., { message: "error" })
 */
function safeRenderDescription(description: unknown): string | null {
  if (description === null || description === undefined) {
    return null;
  }
  
  if (typeof description === 'string') {
    return description;
  }
  
  if (typeof description === 'number' || typeof description === 'boolean') {
    return String(description);
  }
  
  if (typeof description === 'object') {
    // Handle { message: string } format
    const obj = description as Record<string, unknown>;
    if ('message' in obj) {
      if (typeof obj.message === 'string') {
        return obj.message;
      }
      if (typeof obj.message === 'object' && obj.message !== null) {
        const nested = obj.message as Record<string, unknown>;
        if ('message' in nested && typeof nested.message === 'string') {
          return nested.message;
        }
      }
    }
    // Handle { error: string } format
    if ('error' in obj && typeof obj.error === 'string') {
      return obj.error;
    }
    // Fallback: stringify
    try {
      return JSON.stringify(description);
    } catch {
      return 'An error occurred';
    }
  }
  
  return String(description);
}

export function Toaster() {
  const { toasts } = useToast();

  return (
    <ToastProvider>
      {toasts.map(function ({ id, title, description, action, ...props }) {
        const safeDescription = safeRenderDescription(description);
        return (
          <Toast key={id} {...props}>
            <div className="grid gap-1">
              {title && <ToastTitle>{title}</ToastTitle>}
              {safeDescription && <ToastDescription>{safeDescription}</ToastDescription>}
            </div>
            {action}
            <ToastClose />
          </Toast>
        );
      })}
      <ToastViewport />
    </ToastProvider>
  );
}
