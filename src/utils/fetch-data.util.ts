import axios, { AxiosRequestConfig, AxiosError } from 'axios';
import { retryWithBackoff } from './retry.util';

/**
 * Determines if an error is retryable
 */
function isRetryableError(error: unknown): boolean {
  if (axios.isAxiosError(error)) {
    const axiosError = error as AxiosError;
    // Retry on network errors or 5xx server errors or rate limits
    return (
      !axiosError.response ||
      axiosError.response.status >= 500 ||
      axiosError.response.status === 429
    );
  }
  return false;
}

export async function httpGet<T = unknown>(
  url: string,
  config?: AxiosRequestConfig,
  retryEnabled: boolean = true,
) {
  const operation = async () => {
    try {
      const res = await axios.get<T>(url, config);
      return res.data;
    } catch (error) {
      // Only throw if it's retryable or retry is disabled
      if (!retryEnabled || !isRetryableError(error)) {
        throw error;
      }
      throw error;
    }
  };

  if (retryEnabled) {
    return retryWithBackoff(operation, {
      maxRetries: 3,
      initialDelayMs: 1000,
      backoffMultiplier: 2,
      operationName: `HTTP GET ${url}`,
    });
  }

  return operation();
}

export async function httpPost<T = unknown>(
  url: string,
  body?: unknown,
  config?: AxiosRequestConfig,
  retryEnabled: boolean = false, // POST usually shouldn't retry by default
) {
  const operation = async () => {
    try {
      const res = await axios.post<T>(url, body, config);
      return res.data;
    } catch (error) {
      if (!retryEnabled || !isRetryableError(error)) {
        throw error;
      }
      throw error;
    }
  };

  if (retryEnabled) {
    return retryWithBackoff(operation, {
      maxRetries: 2,
      initialDelayMs: 1000,
      backoffMultiplier: 2,
      operationName: `HTTP POST ${url}`,
    });
  }

  return operation();
}

