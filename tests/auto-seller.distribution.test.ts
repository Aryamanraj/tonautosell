import { describe, it, expect, beforeEach, vi } from "vitest";
import { JettonAutoSeller } from "../src/auto-seller";
import { Address, toNano, WalletContractV5R1 } from "@ton/ton";

const TEST_MNEMONIC = new Array(24).fill("abandon").join(" ");

describe("JettonAutoSeller distributeTons", () => {
    let seller: JettonAutoSeller;
    let fakeWallet: { getSeqno: ReturnType<typeof vi.fn>; sendTransfer: ReturnType<typeof vi.fn> };
    let fakeTonClient: { open: ReturnType<typeof vi.fn> };
    let walletAAddress: string;
    let walletBAddress: string;

    beforeEach(() => {
        vi.resetModules();
        const watchWallet = WalletContractV5R1.create({
            workchain: 0,
            publicKey: Buffer.alloc(32, 5)
        });
        const jettonAddress = WalletContractV5R1.create({
            workchain: 0,
            publicKey: Buffer.alloc(32, 6)
        }).address.toString();
        const walletA = WalletContractV5R1.create({
            workchain: 0,
            publicKey: Buffer.alloc(32, 7)
        });
        const walletB = WalletContractV5R1.create({
            workchain: 0,
            publicKey: Buffer.alloc(32, 8)
        });

        walletAAddress = walletA.address.toString();
        walletBAddress = walletB.address.toString();

        process.env.WATCH_WALLET_MNEMONIC = TEST_MNEMONIC;
        process.env.JETTON_ADDRESS = jettonAddress;
        process.env.WALLET_A = walletAAddress;
        process.env.WALLET_B = walletBAddress;

        seller = new JettonAutoSeller();

        fakeWallet = {
            getSeqno: vi.fn().mockResolvedValue(7),
            sendTransfer: vi.fn().mockResolvedValue(undefined)
        };

        fakeTonClient = {
            open: vi.fn().mockReturnValue(fakeWallet)
        } as any;

        (seller as any).tonClient = fakeTonClient;
        (seller as any).watchWallet = watchWallet;
        (seller as any).walletA = Address.parse(walletAAddress);
        (seller as any).walletB = Address.parse(walletBAddress);
        (seller as any).keyPair = { secretKey: Buffer.alloc(64) };
    });

    it("reserves 1.1 TON and distributes the rest 80/20", async () => {
        const totalBalance = toNano("5");

        await (seller as any).distributeTons(totalBalance);

        expect(fakeTonClient.open).toHaveBeenCalledWith((seller as any).watchWallet);
        expect(fakeWallet.getSeqno).toHaveBeenCalledTimes(1);
        expect(fakeWallet.sendTransfer).toHaveBeenCalledTimes(1);

        const transferArgs = fakeWallet.sendTransfer.mock.calls[0][0];
        expect(transferArgs.secretKey).toBe((seller as any).keyPair.secretKey);
        expect(transferArgs.messages).toHaveLength(2);

    const [firstMessage, secondMessage] = transferArgs.messages;

    expect(firstMessage.info?.dest?.toString()).toBe(Address.parse(walletAAddress).toString());
    expect(secondMessage.info?.dest?.toString()).toBe(Address.parse(walletBAddress).toString());
    expect(firstMessage.info?.value.coins).toBe(toNano("3.12"));
    expect(secondMessage.info?.value.coins).toBe(toNano("0.78"));
    });

    it("skips distribution when balance is at or below reserve", async () => {
        const belowReserve = toNano("1.05");

        await (seller as any).distributeTons(belowReserve);

        expect(fakeWallet.sendTransfer).not.toHaveBeenCalled();
    });
});
