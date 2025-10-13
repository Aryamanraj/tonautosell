import { Address } from "@ton/ton";

/**
 * Remove decimal places from a number
 * @param value - Value to process
 * @param decimals - Number of decimal places to keep
 * @returns String with adjusted value
 */
export function removeDecimal(value: number, decimals: number = 9): string {
    const factor = Math.pow(10, decimals);
    return Math.floor(value * factor).toString();
}

/**
 * Convert address to standardized format
 * @param address - Address to normalize
 * @returns Normalized address
 */
export function normalizeAddress(address: string | Address): string {
    if (typeof address === 'string') {
        try {
            return Address.parse(address).toString();
        } catch {
            return address;
        }
    }
    return address.toString();
}

/**
 * Format nanotons value to TON
 * @param nanotons - Value in nanotons
 * @returns Formatted string in TON
 */
export function formatTon(nanotons: bigint | string): string {
    const value = typeof nanotons === 'string' ? BigInt(nanotons) : nanotons;
    const ton = Number(value) / 1e9;
    return ton.toFixed(4);
}