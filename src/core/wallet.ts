import { Address, TonClient, fromNano } from "@ton/ton";
import { JettonRoot, JettonWallet } from "@dedust/sdk";

/**
 * Get the jetton balance of a wallet
 * @param jettonMaster - Master contract address of the jetton
 * @param walletAddress - Wallet address
 * @param client - TON Client
 * @returns Jetton balance as string
 */
export async function getJettonBalance(
    jettonMaster: Address,
    walletAddress: Address,
    client: TonClient
): Promise<string> {
    try {
        const jettonRoot = client.open(JettonRoot.createFromAddress(jettonMaster));
        const jettonWalletAddress = await jettonRoot.getWalletAddress(walletAddress);
        const jettonWallet = client.open(JettonWallet.createFromAddress(jettonWalletAddress));
        
        try {
            // Try getBalance
            const balance = await jettonWallet.getBalance();
            return balance.toString();
        } catch (innerErr: any) {
            // If error is uninitialized contract, return 0
            if (innerErr?.message?.includes("contract not initialized") || innerErr?.message?.includes("Exit code: -256")) {
                return "0";
            }
            // Log other errors
            console.error('[JettonBalance] Error querying balance:', {
                tokenAddress: jettonMaster?.toString?.() || jettonMaster,
                walletAddress: walletAddress?.toString?.() || walletAddress,
                error: innerErr?.message || innerErr
            });
            return "0";
        }
    } catch (err: any) {
        // Error mounting or opening wallet
        console.error('[JettonBalance] Error opening wallet:', {
            tokenAddress: jettonMaster?.toString?.() || jettonMaster,
            walletAddress: walletAddress?.toString?.() || walletAddress,
            error: err?.message || err
        });
        return "0";
    }
}

/**
 * Get the TON balance of a wallet
 * @param address - Wallet address
 * @param client - TON Client
 * @returns Balance in TON formatted
 */
export async function getTonBalance(address: Address, client: TonClient): Promise<string> {
    try {
        const balance = await client.getBalance(address);
        return fromNano(balance);
    } catch (error) {
        console.error("Error getting TON balance:", error);
        return "0";
    }
}