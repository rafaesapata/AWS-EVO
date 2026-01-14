/**
 * @deprecated Use CloudPermissionError instead
 * This file is kept for backward compatibility
 */
import { CloudPermissionError } from "./CloudPermissionError";

// Re-export CloudPermissionError as AWSPermissionError for backward compatibility
export { CloudPermissionError as AWSPermissionError };

// Also export the CloudPermissionError for new code
export { CloudPermissionError };
