/**
 * Utility functions for safe error handling
 */

/**
 * Safely extracts an error message from any error type
 * Handles cases where error.message might be an object
 */
export function getErrorMessage(error: unknown): string {
  if (error === null || error === undefined) {
    return 'Unknown error occurred';
  }

  if (typeof error === 'string') {
    return error;
  }

  if (error instanceof Error) {
    return error.message;
  }

  if (typeof error === 'object') {
    const errorObj = error as Record<string, unknown>;
    
    // Handle API error format { message: string | object }
    if ('message' in errorObj) {
      const message = errorObj.message;
      if (typeof message === 'string') {
        return message;
      }
      if (typeof message === 'object' && message !== null) {
        // If message is an object, try to extract a string from it
        const msgObj = message as Record<string, unknown>;
        if ('message' in msgObj && typeof msgObj.message === 'string') {
          return msgObj.message;
        }
        if ('error' in msgObj && typeof msgObj.error === 'string') {
          return msgObj.error;
        }
        // Last resort: stringify the object
        try {
          return JSON.stringify(message);
        } catch {
          return 'Error occurred';
        }
      }
    }

    // Handle { error: string } format
    if ('error' in errorObj && typeof errorObj.error === 'string') {
      return errorObj.error;
    }

    // Try to stringify the object
    try {
      return JSON.stringify(error);
    } catch {
      return 'Error occurred';
    }
  }

  return String(error);
}

/**
 * Creates a safe error handler for toast notifications
 */
export function toastErrorMessage(error: unknown, fallback = 'An unexpected error occurred'): string {
  const message = getErrorMessage(error);
  return message || fallback;
}
