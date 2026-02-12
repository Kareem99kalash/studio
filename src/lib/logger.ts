import { addDoc, collection } from 'firebase/firestore'; 
import { db } from '@/firebase'; // Ensure this points to your firebase config

/**
 * Standardized System Logger
 * Replaces console.log/error/warn with a controlled stream.
 */
const LOG_LEVELS = {
  INFO: 'info',
  WARN: 'warn',
  ERROR: 'error',
} as const;

class Logger {
  private isDev = process.env.NODE_ENV === 'development';

  private print(level: keyof typeof LOG_LEVELS, context: string, message: any, data?: any) {
    if (this.isDev) {
      const timestamp = new Date().toLocaleTimeString();
      const style = level === 'ERROR' ? 'color: red; font-weight: bold;' : 
                    level === 'WARN' ? 'color: orange; font-weight: bold;' : 
                    'color: blue; font-weight: bold;';
      
      console.groupCollapsed(`%c[${level}] ${context} @ ${timestamp}`, style);
      console.log(message);
      if (data) console.log(data);
      console.groupEnd();
    } else {
      // 🟢 PRODUCTION: Here is where you would send logs to Sentry, Datadog, etc.
      // For now, we only log CRITICAL errors to the browser console in production so you can debug if needed.
      if (level === 'ERROR') {
        console.error(`[${context}]`, message);
      }
    }
  }

  info(context: string, message: string, data?: any) {
    this.print('INFO', context, message, data);
  }

  warn(context: string, message: string, data?: any) {
    this.print('WARN', context, message, data);
  }

  error(context: string, error: any, additionalData?: any) {
    this.print('ERROR', context, error, additionalData);
  }
}

export const logger = new Logger();

/**
 * Logs business actions to Firebase for audit trails.
 */
export async function logActivity(username: string, action: string, details: string) {
  try {
    // 1. Log to System (Dev console)
    logger.info('Audit', `Activity: ${action} by ${username}`);

    // 2. Write to Firebase
    await addDoc(collection(db, 'system_logs'), {
      username,
      action,
      details,
      timestamp: new Date().toISOString()
    });
  } catch (e) {
    logger.error('Audit', 'Failed to save activity log', e);
  }
}
