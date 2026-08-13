import { describe, expect, it } from "vitest";
import * as hegel from "@hegeldev/hegel";
import * as gs from "@hegeldev/hegel/generators";
import { encodeAbiParameters, encodeEventTopics, getAddress } from "viem";
import { ponsCurveAbi } from "./abis.js";
import { verifyCurveBuyReceipt, type ReceiptLike } from "./receipts.js";

const MAX_AMOUNT = 10n ** 24n;
const HEGEL_SETTINGS = {
  testCases: 500,
  derandomize: true,
  database: hegel.Database.disabled,
} as const;
const curve = getAddress("0x2222222222222222222222222222222222222222");
const account = getAddress("0x1111111111111111111111111111111111111111");

describe("Pons receipt properties", () => {
  it("rejects every curve buy whose actual spend exceeds its reviewed offer", () => {
    hegel.test((tc) => {
      const quoteOffered = tc.draw(gs.bigIntegers({ minValue: 1n, maxValue: MAX_AMOUNT }));
      const excess = tc.draw(gs.bigIntegers({ minValue: 1n, maxValue: MAX_AMOUNT }));
      const quoteIn = quoteOffered + excess;
      const tokensOut = quoteIn * 2n;
      const minTokensOut = quoteOffered * 2n;
      const receipt: ReceiptLike = {
        status: "success",
        logs: [{
          address: curve,
          topics: encodeEventTopics({
            abi: ponsCurveAbi,
            eventName: "CurveBuy",
            args: { buyer: account, recipient: account },
          }),
          data: encodeAbiParameters(
            [
              { name: "quoteIn", type: "uint256" },
              { name: "tokensOut", type: "uint256" },
              { name: "fee", type: "uint256" },
              { name: "tax", type: "uint256" },
            ],
            [quoteIn, tokensOut, 0n, 0n],
          ),
        }],
      };

      // This deliberately satisfies the partial-fill price equation; only the
      // independently reviewed spend ceiling can reject the evidence.
      expect(quoteIn * minTokensOut).toBe(quoteOffered * tokensOut);
      expect(() => verifyCurveBuyReceipt(receipt, curve, {
        buyer: account,
        recipient: account,
        minTokensOut,
        quoteOffered,
      })).toThrow(/quoteIn mismatch/);
    }, HEGEL_SETTINGS);
  });
});
