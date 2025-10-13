export const BUY_TRADING_LIMIT = "0.01"; // Minimum TON to buy
export const SELL_TRADING_LIMIT = "0.005"; // Minimum TON to sell
export const LAMPORTS_PER_TON = 1000000000; // 1 TON = 1e9 nanotons
export const TON_AVERAGE_FEE = "0.05"; // Average transaction fee

export const sleep = (seconds: number) => 
    new Promise(resolve => setTimeout(resolve, seconds * 1000));