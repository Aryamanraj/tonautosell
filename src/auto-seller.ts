import { Address, TonClient, WalletContractV4, WalletContractV5R1, internal, toNano, SendMode } from "@ton/ton";
import { mnemonicToPrivateKey, KeyPair } from "@ton/crypto";
import { setupDeDustSwap } from "./core/index";
import { getJettonBalance } from "./core/wallet";
import { JettonRoot, JettonWallet, VaultJetton } from "@dedust/sdk";
import { sleep } from "./config";
import dotenv from "dotenv";

dotenv.config();

// Environment configuration
const {
    WATCH_WALLET_MNEMONIC,
    JETTON_ADDRESS,
    WALLET_A,
    WALLET_B,
    TON_RPC_ENDPOINT = "https://toncenter.com/api/v2/jsonRPC",
    TON_API_KEY,
    POLL_INTERVAL_MS = "5000"
} = process.env;

if (!WATCH_WALLET_MNEMONIC || !JETTON_ADDRESS || !WALLET_A || !WALLET_B) {
    console.error("❌ Missing environment variables in .env:");
    console.error("WATCH_WALLET_MNEMONIC, JETTON_ADDRESS, WALLET_A, WALLET_B");
    process.exit(1);
}

class JettonAutoSeller {
    private tonClient: TonClient;
    private watchWallet: WalletContractV5R1;
    private keyPair: KeyPair;
    private jettonAddress: Address;
    private walletA: Address;
    private walletB: Address;
    private lastBalance: string = "0";
    private isProcessing: boolean = false;
    private pollInterval: number;

    constructor() {
        this.tonClient = new TonClient({
            endpoint: TON_RPC_ENDPOINT,
            apiKey: TON_API_KEY
        });

        this.jettonAddress = Address.parse(JETTON_ADDRESS!);
        this.walletA = Address.parse(WALLET_A!);
        this.walletB = Address.parse(WALLET_B!);
        this.pollInterval = parseInt(POLL_INTERVAL_MS!);
    }

    async initialize() {
        try {
            // Create wallet from mnemonic
            const mnemonic = WATCH_WALLET_MNEMONIC!.split(' ');
            this.keyPair = await mnemonicToPrivateKey(mnemonic);

            this.watchWallet = WalletContractV5R1.create({
                workchain: 0,
                publicKey: this.keyPair.publicKey
            });

            console.log("✅ Wallet initialized:", this.watchWallet.address.toString());

            // Get initial balance
            try {
                this.lastBalance = await getJettonBalance(
                    this.jettonAddress,
                    this.watchWallet.address,
                    this.tonClient
                );
                console.log(`📊 Initial jetton balance: ${this.lastBalance}`);
            } catch (error) {
                console.log("📊 Initial jetton balance: 0");
            }

        } catch (error) {
            console.error("❌ Error during initialization:", error);
            throw error;
        }
    }

    async start() {
        await this.initialize();

        console.log("🤖 Auto detector started!");
        console.log(`📍 Monitoring wallet: ${this.watchWallet.address.toString()}`);
        console.log(`🪙 Target token: ${this.jettonAddress.toString()}`);
        console.log(`💰 Distribution: 70% → ${this.walletA.toString()}`);
        console.log(`💰 Distribution: 30% → ${this.walletB.toString()}`);
        console.log(`⏱️  Interval: ${this.pollInterval}ms`);
        console.log("🔍 Waiting for jettons...");

        this.monitorLoop();
    }

    private async monitorLoop() {
        while (true) {
            try {
                if (!this.isProcessing) {
                    await this.checkForNewJettons();
                }
                await sleep(this.pollInterval / 1000);
            } catch (error) {
                console.error("❌ Error in monitoring:", error);
                await sleep(5);
            }
        }
    }

    private async checkForNewJettons() {
        try {
            const currentBalance = await getJettonBalance(
                this.jettonAddress,
                this.watchWallet.address,
                this.tonClient
            );

            const currentBalanceBigInt = BigInt(currentBalance);
            const lastBalanceBigInt = BigInt(this.lastBalance);

            if (currentBalanceBigInt > lastBalanceBigInt) {
                const receivedAmount = currentBalanceBigInt - lastBalanceBigInt;
                console.log(`\n ===============================================`);
                console.log(`\n🎉 JETTON DETECTED!`);
                console.log(`📊 Received amount: ${receivedAmount.toString()}`);
                console.log(`📊 Total balance: ${currentBalanceBigInt.toString()}`);

                this.isProcessing = true;
                await this.processAutoSale(currentBalanceBigInt);
                this.lastBalance = "0"; // Reset after sale
                this.isProcessing = false;
            }

        } catch (error) {
            console.error("❌ Error checking balance:", error);
        }
    }

    private async processAutoSale(jettonAmount: bigint) {
        try {
            console.log("\n ------------------- SELL ------------------");
            console.log("🚀 Starting automatic sale...");

            // 1. Setup DeDust
            const { pool, jettonVault, nativeVault } = await setupDeDustSwap(
                this.tonClient,
                this.jettonAddress.toString()
            );

            // 2. TON balance before
            const tonBalanceBefore = await this.tonClient.getBalance(this.watchWallet.address);
            console.log(`💰 TON balance before: ${Number(tonBalanceBefore) / 1e9} TON`);

            // 3. Sell jetton
            await this.sellAllJettons(jettonAmount, pool, jettonVault);

            // 4. Wait for processing
            console.log("⏳ Processing sale...");
            await sleep(20);

            // 5. Check received TON
            const tonBalanceAfter = await this.tonClient.getBalance(this.watchWallet.address);
            const tonReceived = tonBalanceAfter - tonBalanceBefore;

            console.log(`💰 TON balance after: ${Number(tonBalanceAfter) / 1e9} TON`);
            console.log(`💸 TON obtained: ${Number(tonReceived) / 1e9} TON`);

            if (tonReceived > BigInt(0)) {
                // 6. Distribute
                await this.distributeTons(tonReceived);
            } else {
                console.log("⚠️ No additional TON detected");
            }

            console.log("✅ Process completed!\n");

        } catch (error) {
            console.error("❌ Error in automatic sale:", error);
        }
    }

    private async sellAllJettons(amount: bigint, pool: any, jettonVault: any) {
        try {
            console.log(`🏪 Selling ${amount.toString()} jettons...`);

            // 1. Use CORRECT jetton address (this.jettonAddress), not the vault!
            const jettonRoot = this.tonClient.open(JettonRoot.createFromAddress(this.jettonAddress));

            // 2. Get the jetton wallet address
            const jettonWalletAddress = await jettonRoot.getWalletAddress(this.watchWallet.address);

            // 3. Open the jetton wallet
            const jettonWallet = this.tonClient.open(JettonWallet.createFromAddress(jettonWalletAddress));

            // 4. Create sender from main wallet
            const sender = this.tonClient.open(this.watchWallet).sender(this.keyPair.secretKey);

            // 5. Send jetton transfer to vault with swap payload
            await jettonWallet.sendTransfer(
                sender,
                toNano("0.3"),
                {
                    amount: amount,
                    destination: jettonVault.address,
                    responseAddress: this.watchWallet.address,
                    forwardAmount: toNano("0.25"),
                    forwardPayload: VaultJetton.createSwapPayload({
                        poolAddress: pool.address,
                    }),
                }
            );

            console.log("✅ Sale sent!");
        } catch (error) {
            console.error("❌ Error in sale:", error);
            throw error;
        }
    }

    private async distributeTons(totalAmount: bigint) {
        try {
            console.log("\n ------------------- DISTRIBUTION ------------------");
            console.log(`💰 Distributing ${Number(totalAmount) / 1e9} TON...`);

            // Reserve fee for send transactions (0.1 TON total)
            const feeReserve = toNano("0.1");
            const availableAmount = totalAmount - feeReserve;

            if (availableAmount <= BigInt(0)) {
                console.log("⚠️ Insufficient amount to distribute after fees");
                return;
            }

            // Calculate distribution
            const toWalletA = (availableAmount * BigInt(70)) / BigInt(100);
            const toWalletB = availableAmount - toWalletA;

            console.log(`📤 Sending ${Number(toWalletA) / 1e9} TON to Wallet A`);
            console.log(`📤 Sending ${Number(toWalletB) / 1e9} TON to Wallet B`);

            const wallet = this.tonClient.open(this.watchWallet);
            const seqno = await wallet.getSeqno();
            // Send both transactions
            await wallet.sendTransfer({
                seqno: seqno,
                secretKey: this.keyPair.secretKey,
                sendMode: SendMode.PAY_GAS_SEPARATELY,
                messages: [
                    internal({
                        to: this.walletA,
                        value: toWalletA,
                        bounce: false
                    }),
                    internal({
                        to: this.walletB,
                        value: toWalletB,
                        bounce: false
                    })
                ]
            });

            console.log("✅ Distribution sent!");

        } catch (error) {
            console.error("❌ Error in distribution:", error);
        }
    }
}

async function main() {
    try {
        const seller = new JettonAutoSeller();
        await seller.start();
    } catch (error) {
        console.error("❌ Fatal error:", error);
        process.exit(1);
    }
}

// Handlers for interruption
process.on('SIGINT', () => {
    console.log("\n👋 Detector interrupted");
    process.exit(0);
});

process.on('SIGTERM', () => {
    console.log("\n👋 Detector terminated");
    process.exit(0);
});

if (require.main === module) {
    main().catch(console.error);
}

export { JettonAutoSeller };