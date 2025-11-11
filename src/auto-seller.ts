import { Address, TonClient, WalletContractV5R1, internal, toNano, SendMode } from "@ton/ton";
import { mnemonicToPrivateKey, KeyPair } from "@ton/crypto";
import { sleep } from "./config";
import dotenv from "dotenv";

dotenv.config();

// Environment configuration
const {
    WATCH_WALLET_MNEMONIC,
    WALLET_PEP_FEE_COLLECTOR,
    WALLET_CAPSTR_FEE_COLLECTOR,
    WALLET_TEAM,
    TON_RPC_ENDPOINT = "https://toncenter.com/api/v2/jsonRPC",
    TON_API_KEY,
    POLL_INTERVAL_MS = "5000"
} = process.env;

if (!WATCH_WALLET_MNEMONIC || !WALLET_PEP_FEE_COLLECTOR || !WALLET_CAPSTR_FEE_COLLECTOR || !WALLET_TEAM) {
    console.error("❌ Missing environment variables in .env:");
    console.error("Provide WATCH_WALLET_MNEMONIC, WALLET_PEP_FEE_COLLECTOR, WALLET_CAPSTR_FEE_COLLECTOR, WALLET_TEAM");
    process.exit(1);
}

class JettonAutoSeller {
    private tonClient: TonClient;
    private watchWallet: WalletContractV5R1;
    private keyPair: KeyPair;
    private walletPepeCollector: Address;
    private walletCapstrCollector: Address;
    private walletTeam: Address;
    private lastTonBalance: bigint = BigInt(0);
    private isProcessing: boolean = false;
    private pollInterval: number;

    constructor() {
        this.tonClient = new TonClient({
            endpoint: TON_RPC_ENDPOINT,
            apiKey: TON_API_KEY
        });

        this.walletPepeCollector = Address.parse(WALLET_PEP_FEE_COLLECTOR!);
        this.walletCapstrCollector = Address.parse(WALLET_CAPSTR_FEE_COLLECTOR!);
        this.walletTeam = Address.parse(WALLET_TEAM!);

        const parsedInterval = Number.parseInt(POLL_INTERVAL_MS!, 10);
        this.pollInterval = Number.isFinite(parsedInterval) && parsedInterval > 0 ? parsedInterval : 5000;
    }

    async initialize() {
        try {
            const mnemonic = WATCH_WALLET_MNEMONIC!.split(" ");
            this.keyPair = await mnemonicToPrivateKey(mnemonic);

            this.watchWallet = WalletContractV5R1.create({
                workchain: 0,
                publicKey: this.keyPair.publicKey
            });

            console.log("✅ Wallet initialized:", this.watchWallet.address.toString());

            this.lastTonBalance = await this.tonClient.getBalance(this.watchWallet.address);
            console.log(`📊 Initial TON balance: ${Number(this.lastTonBalance) / 1e9} TON`);
        } catch (error) {
            console.error("❌ Error during initialization:", error);
            throw error;
        }
    }

    async start() {
        await this.initialize();

        console.log("🤖 TON monitor started!");
        console.log(`📍 Monitoring wallet: ${this.watchWallet.address.toString()}`);
        console.log(`💰 Distribution: 80% → ${this.walletPepeCollector.toString()} (Pepe fee collector)`);
        console.log(`💰 Distribution: 10% → ${this.walletCapstrCollector.toString()} ($CAPSTR fee collector)`);
        console.log(`💰 Distribution: 10% → ${this.walletTeam.toString()} (Team)`);
        console.log(`⏱️  Interval: ${this.pollInterval}ms`);
        console.log("🔍 Waiting for TON deposits...");

        this.monitorLoop();
    }

    private async monitorLoop() {
        while (true) {
            try {
                if (!this.isProcessing) {
                    await this.checkForTonIncrease();
                }
                await sleep(this.pollInterval / 1000);
            } catch (error) {
                console.error("❌ Error in monitoring:", error);
                await sleep(5);
            }
        }
    }

    private async checkForTonIncrease() {
        try {
            const currentBalance = await this.tonClient.getBalance(this.watchWallet.address);

            if (currentBalance > this.lastTonBalance) {
                const delta = currentBalance - this.lastTonBalance;
                console.log(`\n ===============================================`);
                console.log("\n🎉 TON deposit detected!");
                console.log(`📊 Received amount: ${Number(delta) / 1e9} TON`);
                console.log(`📊 Total balance: ${Number(currentBalance) / 1e9} TON`);

                this.isProcessing = true;
                const distributed = await this.distributeTons(currentBalance);
                if (distributed) {
                    this.lastTonBalance = await this.tonClient.getBalance(this.watchWallet.address);
                } else {
                    this.lastTonBalance = currentBalance;
                }
                this.isProcessing = false;
            } else {
                this.lastTonBalance = currentBalance;
            }
        } catch (error) {
            console.error("❌ Error checking TON balance:", error);
            this.isProcessing = false;
        }
    }

    private async distributeTons(currentBalance: bigint): Promise<boolean> {
        try {
            console.log("\n ------------------- DISTRIBUTION ------------------");
            console.log(`💰 Current wallet balance: ${Number(currentBalance) / 1e9} TON`);

            const feeReserve = toNano("0.1");
            const retainReserve = toNano("1");
            const targetReserve = feeReserve + retainReserve;

            if (currentBalance <= targetReserve) {
                console.log("⚠️ Balance at or below reserve threshold; nothing to distribute");
                return false;
            }

            const availableAmount = currentBalance - targetReserve;

            if (availableAmount <= BigInt(0)) {
                console.log("⚠️ Insufficient amount to distribute after keeping 1 TON and covering fees");
                return false;
            }

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
            const messages = recipients
                .map((recipient, index) => {
                    let value: bigint;
                    if (index === recipients.length - 1) {
                        value = availableAmount - distributed;
                    } else {
                        value = (availableAmount * recipient.share) / BigInt(100);
                        distributed += value;
                    }

                    if (value <= BigInt(0)) {
                        console.log(`⚠️ Calculated share for ${recipient.label} is zero; skipping distribution`);
                        return null;
                    }

                    console.log(`📤 Sending ${Number(value) / 1e9} TON to ${recipient.label}`);
                    return internal({
                        to: recipient.address,
                        value,
                        bounce: false
                    });
                })
                .filter((message): message is ReturnType<typeof internal> => message !== null);

            if (messages.length === 0) {
                console.log("⚠️ No positive distributions calculated; skipping transfer");
                return false;
            }

            const wallet = this.tonClient.open(this.watchWallet);
            const seqno = await wallet.getSeqno();

            await wallet.sendTransfer({
                seqno,
                secretKey: this.keyPair.secretKey,
                sendMode: SendMode.PAY_GAS_SEPARATELY,
                messages,
                timeout: Math.floor(Date.now() / 1000) + 300 // keep message valid for 5 minutes
            });

            console.log("✅ Distribution sent!");
            return true;
        } catch (error) {
            console.error("❌ Error in distribution:", error);
            return false;
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