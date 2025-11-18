import mongoose, { Schema, Document } from 'mongoose';

export interface ITrade extends Document {
  trader: string;
  follower: string;
  marketId: string;
  outcome: 'YES' | 'NO';
  side: 'BUY' | 'SELL';
  sizeUsd: number;
  price: number;
  executedAt: Date;
  transactionHash?: string;
  status: 'pending' | 'success' | 'failed';
  errorMessage?: string;
}

const TradeSchema = new Schema<ITrade>(
  {
    trader: { type: String, required: true, index: true },
    follower: { type: String, required: true, index: true },
    marketId: { type: String, required: true, index: true },
    outcome: { type: String, enum: ['YES', 'NO'], required: true },
    side: { type: String, enum: ['BUY', 'SELL'], required: true },
    sizeUsd: { type: Number, required: true },
    price: { type: Number, required: true },
    executedAt: { type: Date, default: Date.now, index: true },
    transactionHash: { type: String, sparse: true, index: true },
    status: { type: String, enum: ['pending', 'success', 'failed'], default: 'pending', index: true },
    errorMessage: { type: String },
  },
  {
    timestamps: true,
  },
);

// Compound index for querying
TradeSchema.index({ trader: 1, executedAt: -1 });
TradeSchema.index({ follower: 1, marketId: 1, executedAt: -1 });

export const TradeModel = mongoose.model<ITrade>('Trade', TradeSchema);
