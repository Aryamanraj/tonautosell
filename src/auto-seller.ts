import { Address, TonClient, WalletContractV5R1, internal, toNano, SendMode } from "@ton/ton";
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
    WALLET_PEP_FEE_COLLECTOR,
    WALLET_CAPSTR_FEE_COLLECTOR,
    WALLET_TEAM,
    TON_RPC_ENDPOINT = "https://toncenter.com/api/v2/jsonRPC",
    TON_API_KEY,
    POLL_INTERVAL_MS = "5000"
} = process.env;

if (!WATCH_WALLET_MNEMONIC || !JETTON_ADDRESS || !WALLET_PEP_FEE_COLLECTOR || !WALLET_CAPSTR_FEE_COLLECTOR || !WALLET_TEAM) {
    console.error("❌ Missing environment variables in .env:");
    console.error("Provide WATCH_WALLET_MNEMONIC, JETTON_ADDRESS, WALLET_PEP_FEE_COLLECTOR, WALLET_CAPSTR_FEE_COLLECTOR, WALLET_TEAM");
    process.exit(1);
}

class JettonAutoSeller {
    private tonClient: TonClient;
    private watchWallet: WalletContractV5R1;
    private keyPair: KeyPair;
    private jettonAddress: Address;
    private walletPepeCollector: Address;
    private walletCapstrCollector: Address;
    private walletTeam: Address;
    private lastBalance: string = "0";
    private isProcessing: boolean = false;
    private pollInterval: number;

    constructor() {
        this.tonClient = new TonClient({
            endpoint: TON_RPC_ENDPOINT,
            apiKey: TON_API_KEY
        });

        this.jettonAddress = Address.parse(JETTON_ADDRESS!);
        this.walletPepeCollector = Address.parse(WALLET_PEP_FEE_COLLECTOR!);
        this.walletCapstrCollector = Address.parse(WALLET_CAPSTR_FEE_COLLECTOR!);
        this.walletTeam = Address.parse(WALLET_TEAM!);
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
    console.log(`💰 Distribution: 80% → ${this.walletPepeCollector.toString()} (Pepe fee collector)`);
    console.log(`💰 Distribution: 10% → ${this.walletCapstrCollector.toString()} ($CAPSTR fee collector)`);
    console.log(`💰 Distribution: 10% → ${this.walletTeam.toString()} (Team)`);
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
            const { pool, jettonVault } = await setupDeDustSwap(
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

            if (tonBalanceAfter > BigInt(0)) {
                // 6. Distribute keeping watch wallet reserve intact
                await this.distributeTons(tonBalanceAfter);
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

    private async distributeTons(currentBalance: bigint) {
        try {
            console.log("\n ------------------- DISTRIBUTION ------------------");
            console.log(`💰 Current wallet balance: ${Number(currentBalance) / 1e9} TON`);

            const feeReserve = toNano("0.1");
            const retainReserve = toNano("1");
            const targetReserve = feeReserve + retainReserve;

            if (currentBalance <= targetReserve) {
                console.log("⚠️ Balance at or below reserve threshold; nothing to distribute");
                return;
            }

            const availableAmount = currentBalance - targetReserve;

            if (availableAmount <= BigInt(0)) {
                console.log("⚠️ Insufficient amount to distribute after keeping 1 TON and covering fees");
                return;
            }

            // Calculate distribution
            console.log("🏦 Retaining 1 TON in the watch wallet");
            console.log("💸 Reserving 0.1 TON for future fees");

            const recipients = [
                {
                    label: "Pepe fee collector",
                    share: BigInt(80),
                    address: this.walletPepeCollector
                },
                {
                    label: "$CAPSTR fee collector",
                    share: BigInt(10),
                    address: this.walletCapstrCollector
                },
                {
                    label: "Team",
                    share: BigInt(10),
                    address: this.walletTeam
                }
            ];

            let distributed = BigInt(0);
            const distributions = recipients.map((recipient, index) => {
                let value: bigint;
                if (index === recipients.length - 1) {
                    value = availableAmount - distributed;
                } else {
                    value = (availableAmount * recipient.share) / BigInt(100);
                    distributed += value;
                }
                console.log(`📤 Sending ${Number(value) / 1e9} TON to ${recipient.label}`);
                return internal({
                    to: recipient.address,
                    value,
                    bounce: false
                });
            });

            const wallet = this.tonClient.open(this.watchWallet);
            const seqno = await wallet.getSeqno();

            await wallet.sendTransfer({
                seqno: seqno,
                secretKey: this.keyPair.secretKey,
                sendMode: SendMode.PAY_GAS_SEPARATELY,
                messages: distributions
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