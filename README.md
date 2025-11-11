# 🤖 TON Distribution Monitor

An automated system that watches a TON wallet, detects balance increases, and distributes the fresh TON across three configured fee collectors while keeping a safety reserve in the source wallet.

## 🎯 Core Features

1. **Continuous Monitoring**: Checks every few seconds (configurable) for increases in TON balance
2. **Automatic Distribution**: Leaves 1.1 TON in the watch wallet (1 TON float + 0.1 TON gas) and sends the remainder (80% / 10% / 10%)
3. **Triple Payouts**: Supports Pepe fee collector, $CAPSTR fee collector, and team destinations
4. **Error Handling**: Robust logging and automatic retry on failures
5. **Transaction Batching**: Sends all payouts in one batched transfer to save fees

## ⚙️ Setup

### 1. Environment Configuration

Copy `.env.example` to `.env` and configure:

```bash
cp .env.example .env
```

**Required Variables:**

```env
# Monitored wallet credentials - provide the 24-word mnemonic for the watch wallet
WATCH_WALLET_MNEMONIC=word1 word2 word3 ... word24

# Distribution wallets (used for TON payouts)
WALLET_PEP_FEE_COLLECTOR=EQxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx   # Receives 80%
WALLET_CAPSTR_FEE_COLLECTOR=EQxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx  # Receives 10%
WALLET_TEAM=EQxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx  # Receives 10%
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

### Quick Demo Transfer (Testnet)

Use the demo script to send a small TON transfer after initializing the wallet with the same credentials:

```bash
npx tsx src/demo.ts
# or
yarn tsx src/demo.ts
```

Set `TESTNET_DEMO_DEST` (and optionally `DEMO_TRANSFER_AMOUNT`) in `.env` and point `TON_RPC_ENDPOINT` to a testnet endpoint before running.

### Stop the Bot

Press `Ctrl+C` in the terminal. The bot will gracefully finish any ongoing operations before stopping.

## 📊 Operation Flow

```mermaid
graph TD
   A[Monitor Wallet] -->|Every poll interval| B{TON balance increased?}
   B -->|No| A
   B -->|Yes| C[Log deposit details]
   C --> D[Calculate available after 1.1 TON reserve]
   D --> E[Prepare 80/10/10 payouts]
   E --> F[Send batched transfers]
   F --> G[Log completion]
   G --> A

### Smart Detection
- Compares current and previous TON balances
- Processes only when the balance grows
- Locks processing to prevent duplicate runs

### Safe Distribution
- Reserves 1 TON in the watch wallet plus 0.1 TON for transaction fees
- Sends all three distributions in a single batched transaction
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
📊 Initial TON balance: 1.10 TON
🤖 TON monitor started!
📍 Monitoring wallet: EQAbc...123
💰 Distribution: 80% → EQGhi...789 (Pepe fee collector)
💰 Distribution: 10% → EQJkl...012 ($CAPSTR fee collector)
💰 Distribution: 10% → EQMno...345 (Team)
⏱️  Interval: 5000ms
🔍 Waiting for TON deposits...

🎉 TON deposit detected!
📊 Received amount: 0.80 TON
📊 Total balance: 1.90 TON

 ------------------- DISTRIBUTION ------------------
💰 Current wallet balance: 1.9 TON
🏦 Retaining 1 TON in the watch wallet
� Reserving 0.1 TON for future fees
📤 Sending 0.64 TON to Pepe fee collector
📤 Sending 0.08 TON to $CAPSTR fee collector
📤 Sending 0.08 TON to Team
✅ Distribution sent!

🔍 Waiting for TON deposits...
```

## ⚠️ Important Considerations

### Security
- **NEVER** share your mnemonic phrase
- Use dedicated wallets for bot operations
- Test thoroughly on testnet before mainnet
- Keep your `.env` file secure and excluded from version control

### Liquidity / Swaps
- Swapping is handled on-chain outside of this bot
- Ensure upstream contracts reliably deliver TON to the watch wallet
- Pause the bot while deploying or modifying swap logic

### Transaction Fees
- Each distribution batch consumes ~0.05-0.15 TON in network fees
- Maintain at least 1.1 TON in the watch wallet to cover reserve + gas
- The script automatically withholds 1 TON (float) + 0.1 TON (gas buffer)

### Timing Considerations
- Poll interval is configurable via `POLL_INTERVAL_MS`
- Choose an interval that balances responsiveness and RPC usage
- On each poll the script re-checks the reserve balance before distributing

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

## 🛠️ Troubleshooting

### "Missing environment variables"
**Cause:** Required `.env` variables not set  
**Solution:** Ensure `WATCH_WALLET_MNEMONIC`, `WALLET_PEP_FEE_COLLECTOR`, `WALLET_CAPSTR_FEE_COLLECTOR`, and `WALLET_TEAM` are configured

### "Insufficient amount to distribute after fees"
**Cause:** Deposit amount smaller than the 1.1 TON reserve threshold  
**Solution:** Ensure upstream swaps deliver more than 1.1 TON to the watch wallet

### "Error opening wallet" or "Error querying balance"
**Cause:** Invalid mnemonic, wrong workchain, or RPC connectivity issues  
**Solution:** Re-check the 24-word mnemonic, verify RPC endpoint/API key, and confirm the wallet exists on-chain

### No distributions occurring
**Cause:** Wallet already at reserve level or deposits routed elsewhere  
**Solution:** Confirm recent deposits on TonScan and ensure the watch wallet is the swap payout destination

### Process Seems Stuck
**Cause:** No new TON since the previous poll  
**Solution:** Verify upstream swaps are executing, lower the poll interval, or restart the bot after confirming RPC health

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

- ✅ Successful operations (wallet initialization, distributions)
- 🎉 Event detection (new TON received)
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
   - Never commit mnemonics to version control
   - Rotate credentials immediately if exposed

3. **Testing**
   - Test on TON testnet first
   - Start with small amounts
   - Verify distribution wallets are correct

4. **Monitoring**
   - Check logs regularly for errors
   - Monitor wallet balances
   - Set up alerts for failures (optional)

## ⚙️ Performance Characteristics

- **Detection Latency**: 0-5 seconds (configurable)
- **Distribution**: ~2-3 seconds for the batched transfer
- **Reserve Check**: Executed on every poll before sending
- **Total Cycle**: Typically under 10 seconds from deposit to payout

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
- [ ] Add your wallet mnemonic (24 words)
- [ ] Configure payout wallets (`WALLET_PEP_FEE_COLLECTOR`, `WALLET_CAPSTR_FEE_COLLECTOR`, `WALLET_TEAM`)
- [ ] Run `npm install` or `yarn install`
- [ ] Ensure monitored wallet maintains at least 1.1 TON reserve
- [ ] Run `npm start` or `yarn start`
- [ ] Monitor console output for detection
- [ ] Test with small amount first

---

**Built with TON blockchain and DeDust Protocol** 🚀
- Erros e recovery