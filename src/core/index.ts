import { Address, internal, toNano, TonClient } from "@ton/ton";
import { removeDecimal } from "./utils";
import { VaultJetton, Factory, MAINNET_FACTORY_ADDR, PoolType, Asset } from "@dedust/sdk";
import { BUY_TRADING_LIMIT, LAMPORTS_PER_TON, SELL_TRADING_LIMIT, sleep, TON_AVERAGE_FEE } from "../config";
import { getJettonBalance } from "./wallet";

export async function sendTon(senderWallet: any, senderWalletPrvKey: any, address: any, value: number) {
    try {
        // Input validation
        if (!senderWallet || !senderWalletPrvKey || !address) {
            throw new Error("Required parameters missing");
        }

        if (typeof value !== 'number' || isNaN(value) || value <= 0) {
            throw new Error(`Invalid value: ${value}`);
        }

        // Wait a bit before getting seqno to avoid conflicts
        await new Promise(resolve => setTimeout(resolve, 100));
        
        let seqno = await senderWallet.getSeqno();
        
        // Ensure address is Address
        let toAddress = address;
        if (typeof address === 'string') {
            try {
                toAddress = Address.parse(address);
            } catch (e) {
                console.error('Invalid address for sending:', address);
                throw e;
            }
        }
        
        // Use toNano for safer conversion
        const valueNano = toNano(value.toString());
        console.log(`📤 Sending ${value} TON to: ${toAddress.toString()} | Seqno: ${seqno}`);
        
        const message = internal({
            value: valueNano,
            to: toAddress,
            bounce: false,
        });

        // Send the transaction
        await senderWallet.sendTransfer({
            seqno,
            secretKey: senderWalletPrvKey,
            messages: [message],
        });

        console.log(`✅ Transaction sent! Transaction hash will be confirmed on blockchain`);
        
        // Wait a bit for the transaction to be processed
        await new Promise(resolve => setTimeout(resolve, 1000));
        
        return true;
        
    } catch (error) {
        console.error("❌ Error in sendTon:", error);
        throw error;
    }
}

export async function start(
    tonClient: any,
    wallets: string | any[],
    pool: any,
    jettonVault: any,
    scaleVault: any,
    nativeVault: any,
    tokenAddress: any
) {
    const min = { buy: 10, sell: 70 };
    const max = { buy: 30, sell: 100 };
    const buyRate = Math.floor(Math.random() * (max.buy - min.buy + 1)) + min.buy;
    const sellRate =
        Math.floor(Math.random() * (max.sell - min.sell + 1)) + min.sell;
    
    for (let i = 0; i < wallets.length; i++) {
        const wal = wallets[i];
        
        // --------- Buy ------------
        const buy_balance = await wal.wallet.getBalance();
        const buy_amount = Math.random() * (0.009 - 0.001) + 0.001;
        console.log(`💰 Buying on Wallet #${i} 
Wallet: ${wal.wallet.address.toString()}
TON balance in Wallet= ${buy_balance}
buying rate = ${buyRate}%
TON amount for buying = ${buy_amount / parseInt(LAMPORTS_PER_TON.toString())} TON`);

        if (buy_balance > toNano(BUY_TRADING_LIMIT)) {
            const sender = wal.wallet.sender(wal._account_prv);
            await swapNativeToJetton(sender, buy_amount, pool, nativeVault);
        }
        await sleep(5);

        // ----------- Sell -------------
        let sell_balance = "0";
        try {
            sell_balance = await getJettonBalance(
                Address.parse(tokenAddress),
                wal.wallet.address,
                tonClient
            );
        } catch (err) {
            console.error(`Error fetching Jetton balance for Wallet #${i}:`, err, {
                tokenAddress: tokenAddress,
                walletAddress: wal.wallet.address?.toString?.() || wal.wallet.address
            });
        }
        const ton_balance = await wal.wallet.getBalance();

        const sell_amount =
            (parseInt(sell_balance) * sellRate) / 100 / parseInt(LAMPORTS_PER_TON.toString());
        console.log(`🏪 Selling on Wallet #${i}:
                    Token balance in Wallet= ${sell_balance} 
                    TON balance in Wallet = ${ton_balance}
                    selling rate = ${sellRate}%
                    token amount to sell = ${sell_amount}`);
        
        if (ton_balance > toNano(SELL_TRADING_LIMIT)) {
            const sender = wal.wallet.sender(wal._account_prv);
            await swapJettonToNative(
                sender,
                tonClient,
                sell_amount,
                wal.wallet.address,
                pool,
                jettonVault,
                scaleVault
            );
            await sleep(15);
        }
    }
}

async function swapNativeToJetton(
    sender: any, 
    amount: string | number | bigint, 
    pool: { address: any; }, 
    nativeVault: { sendSwap: (arg0: any, arg1: { poolAddress: any; amount: bigint; limit: number; gasAmount: bigint; }) => any; }
) {
    try {
        const amountIn = toNano(amount);
        console.log(`🔄 Swapping ${amount} TON to Jetton...`);
        
        // Swap TON to Jetton
        await nativeVault.sendSwap(sender, {
            poolAddress: pool.address,
            amount: amountIn,
            limit: 0,
            gasAmount: toNano(TON_AVERAGE_FEE.toString()),
        });
        
        console.log(`✅ Native to Jetton swap initiated`);
    } catch (error) {
        console.error("❌ Erro no swap Native to Jetton:", error);
        throw error;
    }
}

export async function swapJettonToNative(
    sender: any,
    tonClient: { open: (arg0: any) => any; },
    amount: any,
    senderAddress: any,
    pool: { address: any; },
    jettonVault: { getWallet: (arg0: any) => any; },
    scaleVault: { address: any; }
) {
    try {
        const scaleWallet = tonClient.open(
            await jettonVault.getWallet(senderAddress)
        );
        const amountIn = toNano(`${removeDecimal(amount, 4)}`);
        
        console.log(`🔄 Swapping ${amount} Jetton to TON...`);
        
        await scaleWallet.sendTransfer(sender, toNano("0.3"), {
            amount: amountIn,
            destination: scaleVault.address,
            responseAddress: senderAddress, // return gas to user
            forwardAmount: toNano("0.25"),
            forwardPayload: VaultJetton.createSwapPayload({
                poolAddress: pool.address,
            }),
        });
        
        console.log(`✅ Jetton to Native swap initiated`);
    } catch (err) {
        console.error("❌ Swap Jetton to Native failed:", err);
        throw err;
    }
}

// Utility function to create pools and vaults
export async function setupDeDustSwap(tonClient: TonClient, tokenAddress: string) {
    try {
        const factory = tonClient.open(Factory.createFromAddress(MAINNET_FACTORY_ADDR));
        
        // Create pool
        const pool = tonClient.open(await factory.getPool(
            PoolType.VOLATILE,
            [
                Asset.native(),
                Asset.jetton(Address.parse(tokenAddress))
            ]
        ));
        
        // Create vaults
        const nativeVault = tonClient.open(await factory.getNativeVault());
        const jettonVault = tonClient.open(await factory.getJettonVault(Address.parse(tokenAddress)));
        
        return {
            pool,
            nativeVault,
            jettonVault,
            scaleVault: jettonVault // For compatibility with existing code
        };
    } catch (error) {
        console.error("❌ Error configuring DeDust:", error);
        throw error;
    }
}
