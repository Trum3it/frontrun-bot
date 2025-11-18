import mongoose from 'mongoose';
import type { Logger } from '../utils/logger.util';

export type DatabaseConfig = {
  mongoUri?: string;
  logger: Logger;
};

export class Database {
  private config: DatabaseConfig;
  private isConnected: boolean = false;

  constructor(config: DatabaseConfig) {
    this.config = config;
  }

  async connect(): Promise<boolean> {
    if (!this.config.mongoUri) {
      this.config.logger.warn('MongoDB URI not provided. Position tracking will be disabled.');
      return false;
    }

    if (this.isConnected) {
      return true;
    }

    try {
      await mongoose.connect(this.config.mongoUri, {
        serverSelectionTimeoutMS: 5000,
        socketTimeoutMS: 45000,
      });

      this.isConnected = true;
      this.config.logger.info('Connected to MongoDB');

      // Handle connection events
      mongoose.connection.on('error', (err) => {
        this.config.logger.error('MongoDB connection error', err);
      });

      mongoose.connection.on('disconnected', () => {
        this.config.logger.warn('MongoDB disconnected');
        this.isConnected = false;
      });

      return true;
    } catch (err) {
      this.config.logger.error('Failed to connect to MongoDB', err as Error);
      return false;
    }
  }

  async disconnect(): Promise<void> {
    if (this.isConnected) {
      await mongoose.disconnect();
      this.isConnected = false;
      this.config.logger.info('Disconnected from MongoDB');
    }
  }

  isActive(): boolean {
    return this.isConnected;
  }
}
