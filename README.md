# Polymarket Copy Trading Bot

Production-ready automated copy trading bot for Polymarket Prediction Markets. Monitors selected traders and automatically mirrors their positions with proportional sizing, comprehensive risk management, and real-time monitoring.

## ✨ Features

### Core Trading
- **Multi-Trader Monitoring** - Track multiple traders simultaneously
- **Proportional Position Sizing** - Automatically calculates trade sizes based on balance ratios
- **Real-Time Trade Detection** - Polls Polymarket API with configurable intervals
- **Automatic Order Execution** - Fill-or-Kill orders with order book aggregation
- **Slippage Protection** - Configurable max slippage percentage (default: 2%)

### Risk Management
- **Environment Validation** - Validates all config before startup
- **Retry Logic** - Exponential backoff for API failures
- **Circuit Breaker** - Prevents cascading failures
- **Price Protection** - Rejects trades exceeding slippage tolerance

### Observability
- **Structured Logging** - Timestamped logs with context
- **Metrics Tracking** - Success rate, volume, error counts
- **Health Check Endpoint** - HTTP server for monitoring (default: port 3000)
- **Position Tracking** - MongoDB integration for trade history and PnL

### Performance
- **Parallel Fetching** - Fetches all traders concurrently
- **Memory Management** - Automatic cache cleanup prevents memory leaks
- **Graceful Shutdown** - Handles SIGTERM/SIGINT properly

## 🚀 Quick Start

```bash
# Install dependencies
npm install

# Configure environment
cp .env.example .env
# Edit .env with your wallet and trader addresses

# Run tests
npm test

# Build and start
npm run build && npm start
```

## ⚙️ Configuration

### Required Variables

```env
USER_ADDRESSES=0xabc...,0xdef...    # Traders to copy (comma-separated)
PROXY_WALLET=0xyour_wallet          # Your Polygon wallet
PRIVATE_KEY=your_private_key        # Without 0x prefix
RPC_URL=https://polygon-mainnet...  # Polygon RPC endpoint
```

### Optional Variables

```env
# Trading Configuration
FETCH_INTERVAL=1                    # Polling interval (seconds, default: 1)
TRADE_MULTIPLIER=1.0                # Position size multiplier (default: 1.0)
MAX_SLIPPAGE_PERCENT=2.0            # Max slippage tolerance (default: 2.0%)
RETRY_LIMIT=3                       # Max retry attempts (default: 3)

# Blockchain
USDC_CONTRACT_ADDRESS=0x2791...     # USDC contract (default: Polygon mainnet)

# Monitoring
HEALTH_CHECK_PORT=3000              # Health check server port (default: 3000)
DEBUG=false                         # Enable debug logging (default: false)

# Database (Optional)
MONGO_URI=mongodb://...             # MongoDB for position tracking

# Advanced
TRADE_AGGREGATION_ENABLED=false     # Enable trade aggregation
TRADE_AGGREGATION_WINDOW_SECONDS=300 # Aggregation window (default: 300s)
```

## 📊 Monitoring

### Health Check Endpoints

```bash
# Check service health
curl http://localhost:3000/health

# View metrics
curl http://localhost:3000/metrics
```

Response format:
```json
{
  "status": "healthy",
  "uptime": 3600,
  "timestamp": "2025-01-18T12:00:00.000Z",
  "database": "connected",
  "tradesExecuted": 42,
  "tradesFailed": 2,
  "successRate": "95.45%",
  "totalVolume": "$12,500.00"
}
```

## 🧪 Testing

```bash
# Run all tests
npm test

# Run tests in watch mode
npm run test:watch

# Generate coverage report
npm run test:coverage
```

## 📦 Requirements

- **Node.js** 18+ (LTS recommended)
- **Polygon wallet** with USDC balance
- **POL/MATIC** for gas fees
- **MongoDB** (optional, for position tracking)

## 🛠️ Available Scripts

```bash
npm run dev                 # Development mode with ts-node
npm run build               # Compile TypeScript to dist/
npm start                   # Production mode (requires build)
npm test                    # Run test suite
npm run test:coverage       # Run tests with coverage report
npm run lint                # Check code quality
npm run lint:fix            # Auto-fix linting issues
npm run format              # Format code with Prettier

# Utility Commands
npm run check-allowance     # Check USDC token allowances
npm run verify-allowance    # Verify token allowances
npm run set-token-allowance # Set USDC allowance
npm run manual-sell         # Manual position exit
npm run simulate            # Run simulations (experimental)
```

## 🏗️ Architecture

```
src/
├── app/                    # Application entry point
├── cli/                    # CLI utility commands
├── config/                 # Configuration and strategy
├── domain/                 # Domain types and models
├── infrastructure/         # External dependencies (DB, HTTP)
├── services/               # Core business logic
│   ├── trade-monitor.service.ts    # Detects trades
│   ├── trade-executor.service.ts   # Executes trades
│   └── position-tracker.service.ts # Tracks positions
└── utils/                  # Utility functions
```

## 📈 Position Tracking

When MongoDB is configured, the bot tracks:
- **Trade History** - All executed trades with timestamps
- **Positions** - Current holdings per market
- **PnL Tracking** - Realized and unrealized profit/loss
- **Success Metrics** - Win rate, volume, error rates

## 🔒 Security

- **Private Key Validation** - Validates key format on startup
- **Address Validation** - Verifies all Ethereum addresses
- **Environment Validation** - Comprehensive config checks
- **No Secret Commits** - `.env` in `.gitignore`

## 📚 Documentation

- [GUIDE.md](./docs/GUIDE.md) - Comprehensive setup guide
- [API Documentation](https://docs.polymarket.com) - Polymarket docs
- [CLOB Client](https://github.com/Polymarket/clob-client) - Official SDK

## 🐛 Troubleshooting

### Common Issues

**"Missing required env var"**
- Ensure all required variables are set in `.env`

**"Invalid address"**
- Verify addresses are valid Ethereum format (0x...)

**"Slippage protection triggered"**
- Increase `MAX_SLIPPAGE_PERCENT` or wait for better prices

**"Circuit breaker is OPEN"**
- Wait for cooldown period or check API status

### Debug Mode

Enable detailed logging:
```bash
DEBUG=true npm start
```

## 📝 License

Apache-2.0

## ⚠️ Disclaimer

This software is provided as-is for educational purposes. Trading involves substantial financial risk. You are solely responsible for any trading decisions and losses. The developers assume no liability for financial losses incurred through use of this software. Use at your own risk.

## 🤝 Contributing

Contributions welcome! Please:
1. Fork the repository
2. Create a feature branch
3. Add tests for new features
4. Ensure all tests pass
5. Submit a pull request

## 📧 Support

- **Email**: piter.jb0817@gmail.com
- **Telegram**: @kinexbt
- **Twitter**: @kinexbt

## 🌟 Changelog

### v1.1.0 (Latest)
- ✅ Added comprehensive test coverage
- ✅ Fixed memory leak in transaction hash cache
- ✅ Added environment validation
- ✅ Implemented MongoDB position tracking
- ✅ Added structured logging and metrics
- ✅ Implemented retry logic and circuit breaker
- ✅ Added slippage protection
- ✅ Parallelized trader fetching
- ✅ Added graceful shutdown handling
- ✅ Added health check endpoints

### v1.0.0
- Initial release
- Basic copy trading functionality
- Proportional position sizing
