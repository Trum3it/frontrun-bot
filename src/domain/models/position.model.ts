import mongoose, { Schema, Document } from 'mongoose';

export interface IPosition extends Document {
  follower: string;
  marketId: string;
  outcome: 'YES' | 'NO';
  totalSizeUsd: number;
  averagePrice: number;
  currentSize: number;
  realizedPnL: number;
  unrealizedPnL: number;
  lastUpdated: Date;
  isOpen: boolean;
}

const PositionSchema = new Schema<IPosition>(
  {
    follower: { type: String, required: true, index: true },
    marketId: { type: String, required: true, index: true },
    outcome: { type: String, enum: ['YES', 'NO'], required: true },
    totalSizeUsd: { type: Number, default: 0 },
    averagePrice: { type: Number, default: 0 },
    currentSize: { type: Number, default: 0 },
    realizedPnL: { type: Number, default: 0 },
    unrealizedPnL: { type: Number, default: 0 },
    lastUpdated: { type: Date, default: Date.now },
    isOpen: { type: Boolean, default: true, index: true },
  },
  {
    timestamps: true,
  },
);

// Unique position per follower, market, and outcome
PositionSchema.index({ follower: 1, marketId: 1, outcome: 1 }, { unique: true });

export const PositionModel = mongoose.model<IPosition>('Position', PositionSchema);
