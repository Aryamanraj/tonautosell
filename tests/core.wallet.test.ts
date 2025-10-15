import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { Address, WalletContractV5R1 } from "@ton/ton";
import { getJettonBalance } from "../src/core/wallet";

type Behaviour = {
    balance: bigint;
    balanceError?: any;
    rootError?: any;
    walletAddress: Address;
};

const behaviour: Behaviour = {
    balance: BigInt(0),
    walletAddress: WalletContractV5R1.create({
        workchain: 0,
        publicKey: Buffer.alloc(32, 20)
    }).address
};

vi.mock("@dedust/sdk", () => {
    return {
        JettonRoot: {
            createFromAddress: vi.fn(() => {
                if (behaviour.rootError) {
                    throw behaviour.rootError;
                }

                return {
                    getWalletAddress: vi.fn(async () => behaviour.walletAddress)
                };
            })
        },
        JettonWallet: {
            createFromAddress: vi.fn(() => ({
                getBalance: vi.fn(async () => {
                    if (behaviour.balanceError) {
                        throw behaviour.balanceError;
                    }
                    return behaviour.balance;
                })
            }))
        },
        VaultJetton: {}
    };
});

describe("getJettonBalance", () => {
    const jettonMaster = WalletContractV5R1.create({
        workchain: 0,
        publicKey: Buffer.alloc(32, 21)
    }).address;
    const walletAddress = WalletContractV5R1.create({
        workchain: 0,
        publicKey: Buffer.alloc(32, 22)
    }).address;

    const openMock = vi.fn((contract) => contract);
    const tonClient = {
        open: openMock
    } as any;

    let consoleErrorSpy: ReturnType<typeof vi.spyOn>;

    beforeEach(() => {
        behaviour.balance = BigInt(123456789);
        behaviour.balanceError = undefined;
        behaviour.rootError = undefined;
        behaviour.walletAddress = WalletContractV5R1.create({
            workchain: 0,
            publicKey: Buffer.alloc(32, 23)
        }).address;
        openMock.mockClear();
        consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    });

    afterEach(() => {
        consoleErrorSpy.mockRestore();
    });

    it("returns the jetton balance when the wallet is initialized", async () => {
        const result = await getJettonBalance(jettonMaster, walletAddress, tonClient);
        expect(result).toBe("123456789");
        expect(openMock).toHaveBeenCalledTimes(2);
        expect(consoleErrorSpy).not.toHaveBeenCalled();
    });

    it("returns zero without logging for uninitialized wallet errors", async () => {
        behaviour.balanceError = new Error("contract not initialized");

        const result = await getJettonBalance(jettonMaster, walletAddress, tonClient);
        expect(result).toBe("0");
        expect(consoleErrorSpy).not.toHaveBeenCalled();
    });

    it("logs and returns zero for unexpected balance errors", async () => {
        behaviour.balanceError = new Error("unexpected failure");

        const result = await getJettonBalance(jettonMaster, walletAddress, tonClient);
        expect(result).toBe("0");
        expect(consoleErrorSpy).toHaveBeenCalledTimes(1);
    });

    it("handles errors while opening jetton wallet", async () => {
        behaviour.rootError = new Error("creation failed");

        const result = await getJettonBalance(jettonMaster, walletAddress, tonClient);
        expect(result).toBe("0");
        expect(consoleErrorSpy).toHaveBeenCalledTimes(1);
    });
});
