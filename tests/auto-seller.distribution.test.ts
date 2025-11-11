import { describe, it, expect, beforeEach, vi } from "vitest";
import { JettonAutoSeller } from "../src/auto-seller";
import { Address, toNano, WalletContractV5R1 } from "@ton/ton";

const TEST_MNEMONIC = new Array(24).fill("abandon").join(" ");

describe("JettonAutoSeller distributeTons", () => {
    let seller: JettonAutoSeller;
    let fakeWallet: { getSeqno: ReturnType<typeof vi.fn>; sendTransfer: ReturnType<typeof vi.fn> };
    let fakeTonClient: { open: ReturnType<typeof vi.fn> };
    let walletPepeAddress: string;
    let walletCapstrAddress: string;
    let walletTeamAddress: string;

    beforeEach(() => {
        vi.resetModules();
        const watchWallet = WalletContractV5R1.create({
            workchain: 0,
            publicKey: Buffer.alloc(32, 5)
        });
        const walletPepe = WalletContractV5R1.create({
            workchain: 0,
            publicKey: Buffer.alloc(32, 7)
        });
        const walletCapstr = WalletContractV5R1.create({
            workchain: 0,
            publicKey: Buffer.alloc(32, 8)
        });
        const walletTeam = WalletContractV5R1.create({
            workchain: 0,
            publicKey: Buffer.alloc(32, 9)
        });

        walletPepeAddress = walletPepe.address.toString();
        walletCapstrAddress = walletCapstr.address.toString();
        walletTeamAddress = walletTeam.address.toString();

    process.env.WATCH_WALLET_MNEMONIC = TEST_MNEMONIC;
        process.env.WALLET_PEP_FEE_COLLECTOR = walletPepeAddress;
        process.env.WALLET_CAPSTR_FEE_COLLECTOR = walletCapstrAddress;
        process.env.WALLET_TEAM = walletTeamAddress;

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
        (seller as any).walletPepeCollector = Address.parse(walletPepeAddress);
        (seller as any).walletCapstrCollector = Address.parse(walletCapstrAddress);
        (seller as any).walletTeam = Address.parse(walletTeamAddress);
        (seller as any).keyPair = { secretKey: Buffer.alloc(64) };
    });

    it("reserves 1.1 TON and distributes the rest 80/10/10", async () => {
        const totalBalance = toNano("5");

    const result = await (seller as any).distributeTons(totalBalance);

    expect(result).toBe(true);

        expect(fakeTonClient.open).toHaveBeenCalledWith((seller as any).watchWallet);
        expect(fakeWallet.getSeqno).toHaveBeenCalledTimes(1);
        expect(fakeWallet.sendTransfer).toHaveBeenCalledTimes(1);

        const transferArgs = fakeWallet.sendTransfer.mock.calls[0][0];
        expect(transferArgs.secretKey).toBe((seller as any).keyPair.secretKey);
        expect(transferArgs.messages).toHaveLength(3);

        const [firstMessage, secondMessage, thirdMessage] = transferArgs.messages;

        expect(firstMessage.info?.dest?.toString()).toBe(Address.parse(walletPepeAddress).toString());
        expect(secondMessage.info?.dest?.toString()).toBe(Address.parse(walletCapstrAddress).toString());
        expect(thirdMessage.info?.dest?.toString()).toBe(Address.parse(walletTeamAddress).toString());
        expect(firstMessage.info?.value.coins).toBe(toNano("3.12"));
        expect(secondMessage.info?.value.coins).toBe(toNano("0.39"));
        expect(thirdMessage.info?.value.coins).toBe(toNano("0.39"));
    });

    it("skips distribution when balance is at or below reserve", async () => {
        const belowReserve = toNano("1.05");

    const result = await (seller as any).distributeTons(belowReserve);

    expect(result).toBe(false);
        expect(fakeWallet.sendTransfer).not.toHaveBeenCalled();
    });
});
