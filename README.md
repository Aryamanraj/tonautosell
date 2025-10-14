# 🤖 Jetton Auto-Seller for TON Blockchain

An automated system that detects when jettons (tokens) are received in a monitored wallet, executes instant sales on DeDust DEX, and automatically distributes the resulting TON to two predefined wallets.

## 🎯 Core Features

1. **Continuous Monitoring**: Checks every 5 seconds for new jettons received
2. **Automatic Selling**: Instantly sells ALL detected jettons on DeDust DEX
3. **Automatic Distribution**: Leaves 1 TON in the source wallet and sends the remainder (80% to Wallet A, 20% to Wallet B)
4. **Error Handling**: Robust error handling with detailed logging
5. **Transaction Batching**: Sends both distributions in a single transaction for efficiency

## ⚙️ Setup

### 1. Environment Configuration

Copy `.env.example` to `.env` and configure:

```bash
cp .env.example .env
```

**Required Variables:**

```env
# Monitored wallet credentials - supply EITHER mnemonic (24 words) OR raw private key (hex)
# WATCH_WALLET_PRIVATE_KEY takes precedence when both are present
WATCH_WALLET_MNEMONIC=word1 word2 word3 ... word24
WATCH_WALLET_PRIVATE_KEY=abcdef123456...

# Jetton contract address to detect
JETTON_ADDRESS=EQxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx

# Distribution wallets
WALLET_A=EQxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx  # Receives 80%
WALLET_B=EQxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx  # Receives 20%
```

**Optional Variables:**

```env
# Custom RPC endpoint (default: TonCenter mainnet)
TON_RPC_ENDPOINT=https://toncenter.com/api/v2/jsonRPC

# TonCenter API Key (recommended for production)
TON_API_KEY=your_api_key_here

# Polling interval in milliseconds (default: 5000)
POLL_INTERVAL_MS=5000
```

### 2. Install Dependencies

```bash
npm install
# or
yarn install
```

### 3. Build TypeScript (Optional)

```bash
npm run build
# or
yarn build
```

## 🚀 Usage

### Start the Auto-Seller

```bash
npm start
# or
yarn start
```

### Development Mode (with hot reload)

```bash
npm run dev
yarn dev
```

### Stop the Bot

Press `Ctrl+C` in the terminal. The bot will gracefully finish any ongoing operations before stopping.

## 📊 Operation Flow

```mermaid
graph TD
    A[Monitor Wallet] -->|Every 5s| B{New Jettons?}
    B -->|No| A
    B -->|Yes| C[Log: Jettons Detected]
    C --> D[Setup DeDust Pool]
    E --> F[Sell ALL Jettons]
    F --> G[Wait 20s for Confirmation]
    G --> H[Check TON Received]
    H --> I{TON > 0?}
    M --> N[Log: Process Complete]
    N --> A

### Smart Detection
- Compares current balance vs. previous balance
- Detects any increase in jetton balance
- Processes only when new jettons are received
- Prevents duplicate processing with locking mechanism

### Optimized Selling
- Sells 100% of available jettons
- Uses DeDust Protocol for liquidity
- Implements proper swap payload with VaultJetton
- Waits for blockchain confirmation before proceeding

### Safe Distribution
- Reserves 1 TON in the watch wallet plus 0.1 TON for transaction fees
- Sends both distributions in a single batched transaction
- Validates amounts before sending
- Uses non-bounceable addresses for safety

### Error Handling
- Detailed logging for all operations
- Automatic recovery after errors
- Balance and address validation
- Graceful shutdown on interruption

## 📈 Example Output

```
✅ Wallet initialized: EQAbc...123
📊 Initial jetton balance: 0
🤖 Auto detector started!
📍 Monitoring wallet: EQAbc...123
🪙 Target token: EQDef...456
💰 Distribution: 80% → EQGhi...789
💰 Distribution: 20% → EQJkl...012
⏱️  Interval: 5000ms
🔍 Waiting for jettons...

🎉 JETTON DETECTED!
📊 Received amount: 1000000000000
📊 Total balance: 1000000000000
🚀 Starting automatic sale...
💰 TON balance before: 0.5 TON
🏪 Selling 1000000000000 jettons...
✅ Sale sent!
⏳ Processing sale...
💰 TON balance after: 2.3 TON  
💸 TON obtained: 1.8 TON

� Starting TON distribution...
�💰 Distributing 0.7 TON after retaining 1 TON and fees...
🏦 Retaining 1 TON in the watch wallet
📤 Sending 0.56 TON to Wallet A
📤 Sending 0.14 TON to Wallet B
✅ Distribution sent!
✅ Process completed!

🔍 Waiting for jettons...
```

## ⚠️ Important Considerations

### Security
- **NEVER** share your mnemonic phrase or private key
- Use dedicated wallets for bot operations
- Test thoroughly on testnet before mainnet
- Keep your `.env` file secure and excluded from version control

### Liquidity
- Ensure the target token has sufficient liquidity on DeDust
- Low liquidity tokens may result in failed swaps or high slippage
- Verify pool exists before running the bot

### Transaction Fees
- Each operation consumes TON in fees (~0.05-0.15 TON total per cycle)
- Keep minimum 0.3 TON balance in monitored wallet
- Bot reserves 1 TON in the watch wallet and 0.1 TON for future fees

### Timing Considerations
- 20-second wait after sale ensures blockchain confirmation
- May need adjustment for highly volatile tokens
- Polling interval can be customized via `POLL_INTERVAL_MS`

### Network Reliability
- Uses TonCenter RPC by default
- Recommend using API key for production (higher rate limits)
- Can configure custom RPC endpoint if needed

## 🔧 Customization

### Modify Distribution Percentages

Edit `src/auto-seller.ts` around line 225:

```typescript
// Current: 80% / 20% split
// Example: 60% / 40% split
const toWalletA = (availableAmount * BigInt(60)) / BigInt(100);
const toWalletB = availableAmount - toWalletA;
```

### Change Polling Interval

In `.env`:

```env
# Check every 3 seconds instead of 5
POLL_INTERVAL_MS=3000

# Check every 10 seconds
POLL_INTERVAL_MS=10000
```

### Adjust Fee Reserve

### Change Wait Time After Sale
Edit `src/auto-seller.ts` around line 157:

// Current: waits 20 seconds
await sleep(20);

// Example: wait 30 seconds
await sleep(30);
```

## 🛠️ Troubleshooting

### "Missing environment variables"
**Cause:** Required `.env` variables not set  
**Solution:** Ensure `WATCH_WALLET_MNEMONIC` (or `WATCH_WALLET_PRIVATE_KEY`), `JETTON_ADDRESS`, `WALLET_A`, and `WALLET_B` are configured

### "Insufficient amount to distribute after fees"
**Cause:** Not enough TON received or wallet balance too low  
**Solution:** Ensure wallet has minimum 0.3 TON balance and token has good liquidity

### "Error opening wallet" or "Error querying balance"
**Cause:** Invalid jetton address or wallet not initialized  
**Solution:** Verify `JETTON_ADDRESS` is correct and wallet address is valid

### "Unable to execute get method. Got exit_code: 11"
**Cause:** Jetton contract address incorrect or pool doesn't exist  
**Solution:** Double-check jetton address and verify DeDust pool exists for this token

### Pool Not Found
**Cause:** Token doesn't have liquidity on DeDust  
**Solution:** Verify token is listed on DeDust with active liquidity pool

### Transaction Failed
**Cause:** Network issues, insufficient fees, or low liquidity  
**Solution:** 
- Check wallet has enough TON for fees
- Verify network connectivity
- Bot will automatically retry on next detection

### Process Seems Stuck
**Cause:** Blockchain confirmation delay  
**Solution:** Wait for the 20-second processing period to complete. Check TonScan for transaction status.

## 📁 Project Structure

```
script_swap/
├── src/
│   ├── auto-seller.ts       # Main auto-seller logic
│   ├── config.ts            # Configuration constants
│   └── core/
│       ├── index.ts         # DeDust swap setup
│       ├── wallet.ts        # Jetton balance queries
│       └── utils.ts         # Utility functions
├── .env                     # Environment variables (create from .env.example)
├── .env.example             # Environment template
├── package.json             # Dependencies and scripts
├── tsconfig.json            # TypeScript configuration
└── AUTO-SELLER-README.md    # This file
```

## 📝 Detailed Logging

The system provides comprehensive logging:

- ✅ Successful operations (wallet initialization, sales, distributions)
- 🎉 Event detection (new jettons received)
- 💰 Balance changes (before/after, amounts)
- 📤 Transaction details (amounts, destinations, sequence numbers)
- ⚠️ Warnings (insufficient balance, no TON detected)
- ❌ Errors (with detailed context and stack traces)
- 🔍 Status updates (monitoring, processing, waiting)

## 🔐 Security Best Practices

1. **Wallet Security**
   - Use a dedicated wallet for bot operations only
   - Never use your main wallet
   - Keep minimal TON balance (just enough for operations)

2. **Environment Variables**
   - Add `.env` to `.gitignore`
   - Never commit mnemonics or private keys to version control
   - Rotate credentials immediately if exposed

3. **Testing**
   - Test on TON testnet first
   - Start with small amounts
   - Verify distribution wallets are correct

4. **Monitoring**
   - Check logs regularly for errors
   - Monitor wallet balances
   - Set up alerts for failures (optional)

## � Performance Characteristics

- **Detection Latency**: 0-5 seconds (configurable)
- **Sale Execution**: ~3-5 seconds (blockchain dependent)
- **Confirmation Wait**: 20 seconds (configurable)
- **Distribution**: ~2-3 seconds (single transaction)
- **Total Cycle**: ~25-35 seconds from detection to completion

## 🔄 Dependencies

### Core Dependencies
- `@ton/ton` (v15.3.1) - TON blockchain SDK
- `@ton/crypto` (v3.2.0) - Cryptographic operations
- `@dedust/sdk` (v0.8.7) - DeDust DEX integration
- `dotenv` (v16.4.1) - Environment configuration

### Development Dependencies
- `typescript` (v5.3.3) - TypeScript compiler
- `ts-node` - TypeScript execution
- `nodemon` (v3.0.3) - Hot reload for development
- `@types/node` - TypeScript types for Node.js

## 📜 License

ISC License

## 🤝 Support

For issues, questions, or contributions:
1. Check existing issues in the repository
2. Review this documentation thoroughly
3. Enable detailed logging for debugging
4. Provide full error messages and context when reporting issues

## ⚡ Quick Start Checklist

- [ ] Copy `.env.example` to `.env`
- [ ] Add your wallet mnemonic (24 words) or private key (hex)
- [ ] Configure jetton address to monitor
- [ ] Set destination wallets A and B
- [ ] Run `npm install` or `yarn install`
- [ ] Ensure monitored wallet has 0.3+ TON balance
- [ ] Verify jetton has DeDust liquidity pool
- [ ] Run `npm start` or `yarn start`
- [ ] Monitor console output for detection
- [ ] Test with small amount first

---

**Built with TON blockchain and DeDust Protocol** 🚀
- Erros e recovery