/** ABI revision reviewed against ponsdotdev/ponsfamily commit 836f0f97f9a9569855876570d6778501c163c883. */
export declare const ABI_REVISION = "pons-v2-836f0f97";
export declare const ponsFactoryAbi: readonly [{
    readonly name: "launchConfigCount";
    readonly type: 'function';
    readonly stateMutability: "view";
    readonly inputs: readonly [];
    readonly outputs: readonly [{
        readonly type: "uint256";
    }];
}, {
    readonly name: "getLaunchConfig";
    readonly type: 'function';
    readonly stateMutability: "view";
    readonly inputs: readonly [{
        readonly type: "uint256";
        readonly name: "id";
    }];
    readonly outputs: readonly [{
        readonly type: 'tuple';
        readonly components: readonly [{
            readonly type: "uint256";
            readonly name: "supply";
        }, {
            readonly type: "uint256";
            readonly name: "curveFeeBps";
        }, {
            readonly type: "uint256";
            readonly name: "phantomQuote";
        }, {
            readonly type: "uint256";
            readonly name: "graduationThreshold";
        }, {
            readonly type: "uint24";
            readonly name: "poolFee";
        }, {
            readonly type: "int24";
            readonly name: "tickSpacing";
        }, {
            readonly type: "bool";
            readonly name: "enabled";
        }];
    }];
}, {
    readonly name: "getLaunchedToken";
    readonly type: 'function';
    readonly stateMutability: "view";
    readonly inputs: readonly [{
        readonly type: "address";
        readonly name: "token";
    }];
    readonly outputs: readonly [{
        readonly type: 'tuple';
        readonly components: readonly [{
            readonly type: "address";
            readonly name: "token";
        }, {
            readonly type: "address";
            readonly name: "curve";
        }, {
            readonly type: "address";
            readonly name: "deployer";
        }, {
            readonly type: "address";
            readonly name: "creatorFeeRecipient";
        }, {
            readonly type: "address";
            readonly name: "pairToken";
        }, {
            readonly type: "uint256";
            readonly name: "graduationThreshold";
        }, {
            readonly type: "uint24";
            readonly name: "poolFee";
        }, {
            readonly type: "int24";
            readonly name: "tickSpacing";
        }, {
            readonly type: "uint16";
            readonly name: "creatorTaxBps";
        }, {
            readonly type: "bool";
            readonly name: "buybackEnabled";
        }, {
            readonly type: "uint8";
            readonly name: "phase";
        }, {
            readonly type: "uint256";
            readonly name: "sweptQuote";
        }, {
            readonly type: "uint256";
            readonly name: "sweptTokens";
        }, {
            readonly type: "uint256";
            readonly name: "sweptAt";
        }, {
            readonly type: "bool";
            readonly name: "exists";
        }];
    }];
}, {
    readonly name: "getLaunchFeePolicy";
    readonly type: 'function';
    readonly stateMutability: "view";
    readonly inputs: readonly [{
        readonly type: "address";
        readonly name: "token";
    }];
    readonly outputs: readonly [{
        readonly type: 'tuple';
        readonly components: readonly [{
            readonly type: "address";
            readonly name: "protocolFeeRecipient";
        }, {
            readonly type: "uint16";
            readonly name: "protocolFeeShareBps";
        }, {
            readonly type: "uint16";
            readonly name: "buybackBurnBps";
        }, {
            readonly type: "uint16";
            readonly name: "hookFeeBps";
        }, {
            readonly type: "uint16";
            readonly name: "maxInternalPriceImpactBps";
        }];
    }];
}, {
    readonly name: "launchFee";
    readonly type: 'function';
    readonly stateMutability: "view";
    readonly inputs: readonly [];
    readonly outputs: readonly [{
        readonly type: "uint256";
    }];
}, {
    readonly name: "launchEnabled";
    readonly type: 'function';
    readonly stateMutability: "view";
    readonly inputs: readonly [];
    readonly outputs: readonly [{
        readonly type: "bool";
    }];
}, {
    readonly name: "maxCreatorTaxBps";
    readonly type: 'function';
    readonly stateMutability: "view";
    readonly inputs: readonly [];
    readonly outputs: readonly [{
        readonly type: "uint256";
    }];
}, {
    readonly name: "snipeTaxStartBps";
    readonly type: 'function';
    readonly stateMutability: "view";
    readonly inputs: readonly [];
    readonly outputs: readonly [{
        readonly type: "uint256";
    }];
}, {
    readonly name: "snipeTaxSeconds";
    readonly type: 'function';
    readonly stateMutability: "view";
    readonly inputs: readonly [];
    readonly outputs: readonly [{
        readonly type: "uint256";
    }];
}, {
    readonly name: "canLaunch";
    readonly type: 'function';
    readonly stateMutability: "view";
    readonly inputs: readonly [{
        readonly type: "address";
        readonly name: "launcher";
    }];
    readonly outputs: readonly [{
        readonly type: "bool";
    }];
}, {
    readonly name: "approvedPairTokens";
    readonly type: 'function';
    readonly stateMutability: "view";
    readonly inputs: readonly [{
        readonly type: "address";
        readonly name: "pairToken";
    }];
    readonly outputs: readonly [{
        readonly type: "bool";
    }];
}, {
    readonly name: "previewLaunchEconomics";
    readonly type: 'function';
    readonly stateMutability: "view";
    readonly inputs: readonly [{
        readonly type: "uint256";
        readonly name: "launchConfigId";
    }, {
        readonly type: "address";
        readonly name: "pairToken";
    }];
    readonly outputs: readonly [{
        readonly type: "bytes32";
    }];
}, {
    readonly name: "launchForwarder";
    readonly type: 'function';
    readonly stateMutability: "view";
    readonly inputs: readonly [];
    readonly outputs: readonly [{
        readonly type: "address";
    }];
}, {
    readonly name: "launchDeployer";
    readonly type: 'function';
    readonly stateMutability: "view";
    readonly inputs: readonly [];
    readonly outputs: readonly [{
        readonly type: "address";
    }];
}, {
    readonly name: "graduationExecutor";
    readonly type: 'function';
    readonly stateMutability: "view";
    readonly inputs: readonly [];
    readonly outputs: readonly [{
        readonly type: "address";
    }];
}, {
    readonly name: "graduationGuard";
    readonly type: 'function';
    readonly stateMutability: "view";
    readonly inputs: readonly [];
    readonly outputs: readonly [{
        readonly type: "address";
    }];
}, {
    readonly name: "locker";
    readonly type: 'function';
    readonly stateMutability: "view";
    readonly inputs: readonly [];
    readonly outputs: readonly [{
        readonly type: "address";
    }];
}, {
    readonly name: "memeHook";
    readonly type: 'function';
    readonly stateMutability: "view";
    readonly inputs: readonly [];
    readonly outputs: readonly [{
        readonly type: "address";
    }];
}, {
    readonly name: "feeEscrow";
    readonly type: 'function';
    readonly stateMutability: "view";
    readonly inputs: readonly [];
    readonly outputs: readonly [{
        readonly type: "address";
    }];
}, {
    readonly name: "buybackVault";
    readonly type: 'function';
    readonly stateMutability: "view";
    readonly inputs: readonly [];
    readonly outputs: readonly [{
        readonly type: "address";
    }];
}, {
    readonly name: "poolManager";
    readonly type: 'function';
    readonly stateMutability: "view";
    readonly inputs: readonly [];
    readonly outputs: readonly [{
        readonly type: "address";
    }];
}, {
    readonly name: "positionManager";
    readonly type: 'function';
    readonly stateMutability: "view";
    readonly inputs: readonly [];
    readonly outputs: readonly [{
        readonly type: "address";
    }];
}, {
    readonly name: "permit2";
    readonly type: 'function';
    readonly stateMutability: "view";
    readonly inputs: readonly [];
    readonly outputs: readonly [{
        readonly type: "address";
    }];
}, {
    readonly name: "launchToken";
    readonly type: 'function';
    readonly stateMutability: "payable";
    readonly inputs: readonly [{
        readonly type: 'tuple';
        readonly components: readonly [{
            readonly type: "string";
            readonly name: "name";
        }, {
            readonly type: "string";
            readonly name: "symbol";
        }, {
            readonly type: "string";
            readonly name: "logo";
        }, {
            readonly type: "string";
            readonly name: "description";
        }, {
            readonly name: "socials";
            readonly type: 'tuple';
            readonly components: readonly [{
                readonly type: "string";
                readonly name: "twitter";
            }, {
                readonly type: "string";
                readonly name: "telegram";
            }, {
                readonly type: "string";
                readonly name: "discord";
            }, {
                readonly type: "string";
                readonly name: "website";
            }, {
                readonly type: "string";
                readonly name: "farcaster";
            }];
        }, {
            readonly type: "address";
            readonly name: "creatorFeeRecipient";
        }, {
            readonly type: "uint16";
            readonly name: "creatorTaxBps";
        }, {
            readonly type: "bool";
            readonly name: "buybackEnabled";
        }, {
            readonly type: "bytes32";
            readonly name: "expectedEconomics";
        }, {
            readonly type: "bytes32";
            readonly name: "salt";
        }];
        readonly name: "params";
    }, {
        readonly type: "uint256";
        readonly name: "launchConfigId";
    }, {
        readonly type: "address";
        readonly name: "pairToken";
    }];
    readonly outputs: readonly [{
        readonly type: "address";
        readonly name: "token";
    }, {
        readonly type: "address";
        readonly name: "curve";
    }];
}, {
    readonly name: "launchToken";
    readonly type: 'function';
    readonly stateMutability: "payable";
    readonly inputs: readonly [{
        readonly type: 'tuple';
        readonly components: readonly [{
            readonly type: "string";
            readonly name: "name";
        }, {
            readonly type: "string";
            readonly name: "symbol";
        }, {
            readonly type: "string";
            readonly name: "logo";
        }, {
            readonly type: "string";
            readonly name: "description";
        }, {
            readonly name: "socials";
            readonly type: 'tuple';
            readonly components: readonly [{
                readonly type: "string";
                readonly name: "twitter";
            }, {
                readonly type: "string";
                readonly name: "telegram";
            }, {
                readonly type: "string";
                readonly name: "discord";
            }, {
                readonly type: "string";
                readonly name: "website";
            }, {
                readonly type: "string";
                readonly name: "farcaster";
            }];
        }, {
            readonly type: "address";
            readonly name: "creatorFeeRecipient";
        }, {
            readonly type: "uint16";
            readonly name: "creatorTaxBps";
        }, {
            readonly type: "bool";
            readonly name: "buybackEnabled";
        }, {
            readonly type: "bytes32";
            readonly name: "expectedEconomics";
        }, {
            readonly type: "bytes32";
            readonly name: "salt";
        }];
        readonly name: "params";
    }, {
        readonly type: "uint256";
        readonly name: "launchConfigId";
    }, {
        readonly type: "address";
        readonly name: "pairToken";
    }, {
        readonly type: "address[]";
        readonly name: "snipeTaxExemptions";
    }];
    readonly outputs: readonly [{
        readonly type: "address";
        readonly name: "token";
    }, {
        readonly type: "address";
        readonly name: "curve";
    }];
}, {
    readonly name: "graduate";
    readonly type: 'function';
    readonly stateMutability: "nonpayable";
    readonly inputs: readonly [{
        readonly type: "address";
        readonly name: "token";
    }];
    readonly outputs: readonly [];
}, {
    readonly name: "createGraduatedPool";
    readonly type: 'function';
    readonly stateMutability: "nonpayable";
    readonly inputs: readonly [{
        readonly type: "address";
        readonly name: "token";
    }];
    readonly outputs: readonly [{
        readonly type: "uint256";
        readonly name: "positionId";
    }];
}, {
    readonly name: "transferCreatorFeeRecipient";
    readonly type: 'function';
    readonly stateMutability: "nonpayable";
    readonly inputs: readonly [{
        readonly type: "address";
        readonly name: "token";
    }, {
        readonly type: "address";
        readonly name: "newRecipient";
    }];
    readonly outputs: readonly [];
}, {
    readonly name: "setBuybackEnabled";
    readonly type: 'function';
    readonly stateMutability: "nonpayable";
    readonly inputs: readonly [{
        readonly type: "address";
        readonly name: "token";
    }, {
        readonly type: "bool";
        readonly name: "enabled";
    }];
    readonly outputs: readonly [];
}, {
    readonly name: "TokenLaunched";
    readonly type: 'event';
    readonly inputs: readonly [{
        readonly type: "address";
        readonly name: "token";
        readonly indexed: true;
    }, {
        readonly type: "address";
        readonly name: "curve";
        readonly indexed: true;
    }, {
        readonly type: "address";
        readonly name: "deployer";
        readonly indexed: true;
    }, {
        readonly type: "address";
        readonly name: "pairToken";
    }, {
        readonly type: "uint256";
        readonly name: "launchConfigId";
    }, {
        readonly type: "uint256";
        readonly name: "graduationThreshold";
    }];
}, {
    readonly name: "LaunchSwept";
    readonly type: 'event';
    readonly inputs: readonly [{
        readonly type: "address";
        readonly name: "token";
        readonly indexed: true;
    }, {
        readonly type: "uint256";
        readonly name: "quoteOut";
    }, {
        readonly type: "uint256";
        readonly name: "tokenOut";
    }];
}, {
    readonly name: "CreatorFeeRecipientUpdated";
    readonly type: 'event';
    readonly inputs: readonly [{
        readonly type: "address";
        readonly name: "token";
        readonly indexed: true;
    }, {
        readonly type: "address";
        readonly name: "previousRecipient";
        readonly indexed: true;
    }, {
        readonly type: "address";
        readonly name: "newRecipient";
        readonly indexed: true;
    }];
}, {
    readonly name: "BuybackEnabledUpdated";
    readonly type: 'event';
    readonly inputs: readonly [{
        readonly type: "address";
        readonly name: "token";
        readonly indexed: true;
    }, {
        readonly type: "bool";
        readonly name: "enabled";
    }, {
        readonly type: "address";
        readonly name: "controller";
        readonly indexed: true;
    }];
}, {
    readonly name: "PoolGraduated";
    readonly type: 'event';
    readonly inputs: readonly [{
        readonly type: "address";
        readonly name: "token";
        readonly indexed: true;
    }, {
        readonly type: "uint256";
        readonly name: "positionId";
    }, {
        readonly type: "uint256";
        readonly name: "tokenAmount";
    }, {
        readonly type: "uint256";
        readonly name: "pairTokenAmount";
    }];
}, {
    readonly name: "LaunchGraduationRescued";
    readonly type: 'event';
    readonly inputs: readonly [{
        readonly type: "address";
        readonly name: "token";
        readonly indexed: true;
    }, {
        readonly type: "address";
        readonly name: "recipient";
        readonly indexed: true;
    }, {
        readonly type: "uint256";
        readonly name: "quoteAmount";
    }, {
        readonly type: "uint256";
        readonly name: "tokenAmount";
    }];
}];
export declare const ponsForwarderAbi: readonly [{
    readonly name: "factory";
    readonly type: 'function';
    readonly stateMutability: "view";
    readonly inputs: readonly [];
    readonly outputs: readonly [{
        readonly type: "address";
    }];
}, {
    readonly name: "launchAndBuy";
    readonly type: 'function';
    readonly stateMutability: "payable";
    readonly inputs: readonly [{
        readonly type: 'tuple';
        readonly components: readonly [{
            readonly type: "string";
            readonly name: "name";
        }, {
            readonly type: "string";
            readonly name: "symbol";
        }, {
            readonly type: "string";
            readonly name: "logo";
        }, {
            readonly type: "string";
            readonly name: "description";
        }, {
            readonly name: "socials";
            readonly type: 'tuple';
            readonly components: readonly [{
                readonly type: "string";
                readonly name: "twitter";
            }, {
                readonly type: "string";
                readonly name: "telegram";
            }, {
                readonly type: "string";
                readonly name: "discord";
            }, {
                readonly type: "string";
                readonly name: "website";
            }, {
                readonly type: "string";
                readonly name: "farcaster";
            }];
        }, {
            readonly type: "address";
            readonly name: "creatorFeeRecipient";
        }, {
            readonly type: "uint16";
            readonly name: "creatorTaxBps";
        }, {
            readonly type: "bool";
            readonly name: "buybackEnabled";
        }, {
            readonly type: "bytes32";
            readonly name: "expectedEconomics";
        }, {
            readonly type: "bytes32";
            readonly name: "salt";
        }];
        readonly name: "params";
    }, {
        readonly type: "uint256";
        readonly name: "launchConfigId";
    }, {
        readonly type: "address";
        readonly name: "pairToken";
    }, {
        readonly type: "uint256";
        readonly name: "quoteIn";
    }, {
        readonly type: "uint256";
        readonly name: "minTokensOut";
    }, {
        readonly type: "address";
        readonly name: "recipient";
    }, {
        readonly type: "address[]";
        readonly name: "snipeTaxExemptions";
    }];
    readonly outputs: readonly [{
        readonly type: "address";
        readonly name: "token";
    }, {
        readonly type: "address";
        readonly name: "curve";
    }, {
        readonly type: "uint256";
        readonly name: "tokensOut";
    }];
}, {
    readonly name: "Launched";
    readonly type: 'event';
    readonly inputs: readonly [{
        readonly type: "address";
        readonly name: "token";
        readonly indexed: true;
    }, {
        readonly type: "address";
        readonly name: "curve";
        readonly indexed: true;
    }, {
        readonly type: "address";
        readonly name: "recipient";
        readonly indexed: true;
    }, {
        readonly type: "address";
        readonly name: "launcher";
    }, {
        readonly type: "uint256";
        readonly name: "quoteSpent";
    }, {
        readonly type: "uint256";
        readonly name: "tokensReceived";
    }];
}];
export declare const ponsCurveAbi: readonly [{
    readonly name: "pairToken";
    readonly type: 'function';
    readonly stateMutability: "view";
    readonly inputs: readonly [];
    readonly outputs: readonly [{
        readonly type: "address";
    }];
}, {
    readonly name: "token";
    readonly type: 'function';
    readonly stateMutability: "view";
    readonly inputs: readonly [];
    readonly outputs: readonly [{
        readonly type: "address";
    }];
}, {
    readonly name: "deployer";
    readonly type: 'function';
    readonly stateMutability: "view";
    readonly inputs: readonly [];
    readonly outputs: readonly [{
        readonly type: "address";
    }];
}, {
    readonly name: "phantomQuote";
    readonly type: 'function';
    readonly stateMutability: "view";
    readonly inputs: readonly [];
    readonly outputs: readonly [{
        readonly type: "uint256";
    }];
}, {
    readonly name: "feeBps";
    readonly type: 'function';
    readonly stateMutability: "view";
    readonly inputs: readonly [];
    readonly outputs: readonly [{
        readonly type: "uint256";
    }];
}, {
    readonly name: "creatorTaxBps";
    readonly type: 'function';
    readonly stateMutability: "view";
    readonly inputs: readonly [];
    readonly outputs: readonly [{
        readonly type: "uint256";
    }];
}, {
    readonly name: "graduationThreshold";
    readonly type: 'function';
    readonly stateMutability: "view";
    readonly inputs: readonly [];
    readonly outputs: readonly [{
        readonly type: "uint256";
    }];
}, {
    readonly name: "buybackEnabled";
    readonly type: 'function';
    readonly stateMutability: "view";
    readonly inputs: readonly [];
    readonly outputs: readonly [{
        readonly type: "bool";
    }];
}, {
    readonly name: "graduated";
    readonly type: 'function';
    readonly stateMutability: "view";
    readonly inputs: readonly [];
    readonly outputs: readonly [{
        readonly type: "bool";
    }];
}, {
    readonly name: "sellableTokens";
    readonly type: 'function';
    readonly stateMutability: "view";
    readonly inputs: readonly [];
    readonly outputs: readonly [{
        readonly type: "uint256";
    }];
}, {
    readonly name: "getReserves";
    readonly type: 'function';
    readonly stateMutability: "view";
    readonly inputs: readonly [];
    readonly outputs: readonly [{
        readonly type: "uint256";
        readonly name: "quoteReserve";
    }, {
        readonly type: "uint256";
        readonly name: "tokenReserve";
    }];
}, {
    readonly name: "quoteReserve";
    readonly type: 'function';
    readonly stateMutability: "view";
    readonly inputs: readonly [];
    readonly outputs: readonly [{
        readonly type: "uint256";
    }];
}, {
    readonly name: "realQuoteReserve";
    readonly type: 'function';
    readonly stateMutability: "view";
    readonly inputs: readonly [];
    readonly outputs: readonly [{
        readonly type: "uint256";
    }];
}, {
    readonly name: "tokenReserve";
    readonly type: 'function';
    readonly stateMutability: "view";
    readonly inputs: readonly [];
    readonly outputs: readonly [{
        readonly type: "uint256";
    }];
}, {
    readonly name: "readyToGraduate";
    readonly type: 'function';
    readonly stateMutability: "view";
    readonly inputs: readonly [];
    readonly outputs: readonly [{
        readonly type: "bool";
    }];
}, {
    readonly name: "buy";
    readonly type: 'function';
    readonly stateMutability: "payable";
    readonly inputs: readonly [{
        readonly type: "uint256";
        readonly name: "quoteIn";
    }, {
        readonly type: "uint256";
        readonly name: "minTokensOut";
    }, {
        readonly type: "address";
        readonly name: "recipient";
    }];
    readonly outputs: readonly [{
        readonly type: "uint256";
        readonly name: "tokensOut";
    }];
}, {
    readonly name: "sell";
    readonly type: 'function';
    readonly stateMutability: "nonpayable";
    readonly inputs: readonly [{
        readonly type: "uint256";
        readonly name: "tokensIn";
    }, {
        readonly type: "uint256";
        readonly name: "minQuoteOut";
    }, {
        readonly type: "address";
        readonly name: "recipient";
    }];
    readonly outputs: readonly [{
        readonly type: "uint256";
        readonly name: "quoteOut";
    }];
}, {
    readonly name: "sweepFees";
    readonly type: 'function';
    readonly stateMutability: "nonpayable";
    readonly inputs: readonly [{
        readonly type: "uint256";
        readonly name: "minBuybackTokensOut";
    }];
    readonly outputs: readonly [];
}, {
    readonly name: "CurveBuy";
    readonly type: 'event';
    readonly inputs: readonly [{
        readonly type: "address";
        readonly name: "buyer";
        readonly indexed: true;
    }, {
        readonly type: "address";
        readonly name: "recipient";
        readonly indexed: true;
    }, {
        readonly type: "uint256";
        readonly name: "quoteIn";
    }, {
        readonly type: "uint256";
        readonly name: "tokensOut";
    }, {
        readonly type: "uint256";
        readonly name: "fee";
    }, {
        readonly type: "uint256";
        readonly name: "tax";
    }];
}, {
    readonly name: "CurveBuyRefunded";
    readonly type: 'event';
    readonly inputs: readonly [{
        readonly type: "address";
        readonly name: "buyer";
        readonly indexed: true;
    }, {
        readonly type: "uint256";
        readonly name: "refund";
    }];
}, {
    readonly name: "CurveSell";
    readonly type: 'event';
    readonly inputs: readonly [{
        readonly type: "address";
        readonly name: "seller";
        readonly indexed: true;
    }, {
        readonly type: "address";
        readonly name: "recipient";
        readonly indexed: true;
    }, {
        readonly type: "uint256";
        readonly name: "tokensIn";
    }, {
        readonly type: "uint256";
        readonly name: "quoteOut";
    }, {
        readonly type: "uint256";
        readonly name: "fee";
    }, {
        readonly type: "uint256";
        readonly name: "tax";
    }];
}, {
    readonly name: "FeesSwept";
    readonly type: 'event';
    readonly inputs: readonly [{
        readonly type: "uint256";
        readonly name: "protocolAmount";
    }, {
        readonly type: "uint256";
        readonly name: "buybackAmount";
    }, {
        readonly type: "uint256";
        readonly name: "creatorAmount";
    }];
}, {
    readonly name: "BuybackLocked";
    readonly type: 'event';
    readonly inputs: readonly [{
        readonly type: "uint256";
        readonly name: "quoteSpent";
    }, {
        readonly type: "uint256";
        readonly name: "tokensLocked";
    }];
}, {
    readonly name: "CurveCompleted";
    readonly type: 'event';
    readonly inputs: readonly [{
        readonly type: "address";
        readonly name: "recipient";
    }, {
        readonly type: "uint256";
        readonly name: "quoteOut";
    }, {
        readonly type: "uint256";
        readonly name: "tokenOut";
    }];
}];
export declare const ponsTokenAbi: readonly [{
    readonly name: "name";
    readonly type: 'function';
    readonly stateMutability: "view";
    readonly inputs: readonly [];
    readonly outputs: readonly [{
        readonly type: "string";
    }];
}, {
    readonly name: "symbol";
    readonly type: 'function';
    readonly stateMutability: "view";
    readonly inputs: readonly [];
    readonly outputs: readonly [{
        readonly type: "string";
    }];
}, {
    readonly name: "decimals";
    readonly type: 'function';
    readonly stateMutability: "view";
    readonly inputs: readonly [];
    readonly outputs: readonly [{
        readonly type: "uint8";
    }];
}, {
    readonly name: "totalSupply";
    readonly type: 'function';
    readonly stateMutability: "view";
    readonly inputs: readonly [];
    readonly outputs: readonly [{
        readonly type: "uint256";
    }];
}, {
    readonly name: "balanceOf";
    readonly type: 'function';
    readonly stateMutability: "view";
    readonly inputs: readonly [{
        readonly type: "address";
        readonly name: "account";
    }];
    readonly outputs: readonly [{
        readonly type: "uint256";
    }];
}, {
    readonly name: "allowance";
    readonly type: 'function';
    readonly stateMutability: "view";
    readonly inputs: readonly [{
        readonly type: "address";
        readonly name: "owner";
    }, {
        readonly type: "address";
        readonly name: "spender";
    }];
    readonly outputs: readonly [{
        readonly type: "uint256";
    }];
}, {
    readonly name: "approve";
    readonly type: 'function';
    readonly stateMutability: "nonpayable";
    readonly inputs: readonly [{
        readonly type: "address";
        readonly name: "spender";
    }, {
        readonly type: "uint256";
        readonly name: "amount";
    }];
    readonly outputs: readonly [{
        readonly type: "bool";
    }];
}, {
    readonly name: "logo";
    readonly type: 'function';
    readonly stateMutability: "view";
    readonly inputs: readonly [];
    readonly outputs: readonly [{
        readonly type: "string";
    }];
}, {
    readonly name: "description";
    readonly type: 'function';
    readonly stateMutability: "view";
    readonly inputs: readonly [];
    readonly outputs: readonly [{
        readonly type: "string";
    }];
}, {
    readonly name: "socials";
    readonly type: 'function';
    readonly stateMutability: "view";
    readonly inputs: readonly [];
    readonly outputs: readonly [{
        readonly type: "string";
        readonly name: "twitter";
    }, {
        readonly type: "string";
        readonly name: "telegram";
    }, {
        readonly type: "string";
        readonly name: "discord";
    }, {
        readonly type: "string";
        readonly name: "website";
    }, {
        readonly type: "string";
        readonly name: "farcaster";
    }];
}, {
    readonly name: "deployer";
    readonly type: 'function';
    readonly stateMutability: "view";
    readonly inputs: readonly [];
    readonly outputs: readonly [{
        readonly type: "address";
    }];
}, {
    readonly name: "launchFactory";
    readonly type: 'function';
    readonly stateMutability: "view";
    readonly inputs: readonly [];
    readonly outputs: readonly [{
        readonly type: "address";
    }];
}, {
    readonly name: "curve";
    readonly type: 'function';
    readonly stateMutability: "view";
    readonly inputs: readonly [];
    readonly outputs: readonly [{
        readonly type: "address";
    }];
}];
export declare const ponsFeeEscrowAbi: readonly [{
    readonly name: "claim";
    readonly type: 'function';
    readonly stateMutability: "nonpayable";
    readonly inputs: readonly [];
    readonly outputs: readonly [{
        readonly type: "uint256";
        readonly name: "amount";
    }];
}, {
    readonly name: "claim";
    readonly type: 'function';
    readonly stateMutability: "nonpayable";
    readonly inputs: readonly [{
        readonly type: "uint256";
        readonly name: "amount";
    }];
    readonly outputs: readonly [{
        readonly type: "uint256";
    }];
}, {
    readonly name: "claimToken";
    readonly type: 'function';
    readonly stateMutability: "nonpayable";
    readonly inputs: readonly [{
        readonly type: "address";
        readonly name: "token";
    }];
    readonly outputs: readonly [{
        readonly type: "uint256";
        readonly name: "amount";
    }];
}, {
    readonly name: "claimToken";
    readonly type: 'function';
    readonly stateMutability: "nonpayable";
    readonly inputs: readonly [{
        readonly type: "address";
        readonly name: "token";
    }, {
        readonly type: "uint256";
        readonly name: "amount";
    }];
    readonly outputs: readonly [{
        readonly type: "uint256";
    }];
}, {
    readonly name: "balanceOf";
    readonly type: 'function';
    readonly stateMutability: "view";
    readonly inputs: readonly [{
        readonly type: "address";
        readonly name: "recipient";
    }];
    readonly outputs: readonly [{
        readonly type: "uint256";
    }];
}, {
    readonly name: "balanceOfToken";
    readonly type: 'function';
    readonly stateMutability: "view";
    readonly inputs: readonly [{
        readonly type: "address";
        readonly name: "recipient";
    }, {
        readonly type: "address";
        readonly name: "token";
    }];
    readonly outputs: readonly [{
        readonly type: "uint256";
    }];
}, {
    readonly name: "Claimed";
    readonly type: 'event';
    readonly inputs: readonly [{
        readonly type: "address";
        readonly name: "recipient";
        readonly indexed: true;
    }, {
        readonly type: "uint256";
        readonly name: "amount";
    }];
}, {
    readonly name: "ClaimedToken";
    readonly type: 'event';
    readonly inputs: readonly [{
        readonly type: "address";
        readonly name: "recipient";
        readonly indexed: true;
    }, {
        readonly type: "address";
        readonly name: "token";
        readonly indexed: true;
    }, {
        readonly type: "uint256";
        readonly name: "amount";
    }];
}, {
    readonly name: "Credited";
    readonly type: 'event';
    readonly inputs: readonly [{
        readonly type: "address";
        readonly name: "recipient";
        readonly indexed: true;
    }, {
        readonly type: "address";
        readonly name: "depositor";
        readonly indexed: true;
    }, {
        readonly type: "uint256";
        readonly name: "amount";
    }];
}, {
    readonly name: "CreditedToken";
    readonly type: 'event';
    readonly inputs: readonly [{
        readonly type: "address";
        readonly name: "recipient";
        readonly indexed: true;
    }, {
        readonly type: "address";
        readonly name: "token";
        readonly indexed: true;
    }, {
        readonly type: "address";
        readonly name: "depositor";
        readonly indexed: true;
    }, {
        readonly type: "uint256";
        readonly name: "amount";
    }];
}];
export declare const ponsMemeHookAbi: readonly [{
    readonly name: "launches";
    readonly type: 'function';
    readonly stateMutability: "view";
    readonly inputs: readonly [{
        readonly type: "bytes32";
        readonly name: "poolId";
    }];
    readonly outputs: readonly [{
        readonly type: "bool";
        readonly name: "registered";
    }, {
        readonly type: "bool";
        readonly name: "memecoinIsCurrency0";
    }, {
        readonly type: "address";
        readonly name: "memecoin";
    }, {
        readonly type: "address";
        readonly name: "quoteToken";
    }, {
        readonly type: "address";
        readonly name: "creator";
    }, {
        readonly type: "address";
        readonly name: "buybackCreatorRecipient";
    }, {
        readonly type: "address";
        readonly name: "protocolFeeRecipient";
    }, {
        readonly type: "uint16";
        readonly name: "creatorTaxBps";
    }, {
        readonly type: "uint16";
        readonly name: "protocolFeeShareBps";
    }, {
        readonly type: "uint16";
        readonly name: "buybackBurnBps";
    }, {
        readonly type: "uint16";
        readonly name: "hookFeeBps";
    }, {
        readonly type: "uint16";
        readonly name: "maxInternalPriceImpactBps";
    }, {
        readonly type: "bool";
        readonly name: "buybackEnabled";
    }];
}, {
    readonly name: "pendingFees";
    readonly type: 'function';
    readonly stateMutability: "view";
    readonly inputs: readonly [{
        readonly type: "bytes32";
        readonly name: "poolId";
    }, {
        readonly type: "address";
        readonly name: "currency";
    }];
    readonly outputs: readonly [{
        readonly type: "uint256";
        readonly name: "amount";
    }];
}, {
    readonly name: "pendingBuyback";
    readonly type: 'function';
    readonly stateMutability: "view";
    readonly inputs: readonly [{
        readonly type: "bytes32";
        readonly name: "poolId";
    }, {
        readonly type: "address";
        readonly name: "currency";
    }];
    readonly outputs: readonly [{
        readonly type: "uint256";
        readonly name: "amount";
    }];
}, {
    readonly name: "pendingCreatorTax";
    readonly type: 'function';
    readonly stateMutability: "view";
    readonly inputs: readonly [{
        readonly type: "bytes32";
        readonly name: "poolId";
    }, {
        readonly type: "address";
        readonly name: "currency";
    }];
    readonly outputs: readonly [{
        readonly type: "uint256";
        readonly name: "amount";
    }];
}, {
    readonly name: "sweepPoolFees";
    readonly type: 'function';
    readonly stateMutability: "nonpayable";
    readonly inputs: readonly [{
        readonly type: "bytes32";
        readonly name: "poolId";
    }, {
        readonly type: "uint256";
        readonly name: "minConversionQuoteOut";
    }, {
        readonly type: "uint256";
        readonly name: "minBuybackTokensOut";
    }];
    readonly outputs: readonly [];
}, {
    readonly name: "PoolRegistered";
    readonly type: 'event';
    readonly inputs: readonly [{
        readonly type: "bytes32";
        readonly name: "poolId";
        readonly indexed: true;
    }, {
        readonly type: "address";
        readonly name: "memecoin";
    }, {
        readonly type: "address";
        readonly name: "quoteToken";
    }, {
        readonly type: "address";
        readonly name: "creator";
    }];
}, {
    readonly name: "ProtocolFeeRecipientUpdated";
    readonly type: 'event';
    readonly inputs: readonly [{
        readonly type: "address";
        readonly name: "recipient";
    }];
}, {
    readonly name: "HookFeeCollected";
    readonly type: 'event';
    readonly inputs: readonly [{
        readonly type: "bytes32";
        readonly name: "poolId";
        readonly indexed: true;
    }, {
        readonly type: "address";
        readonly name: "currency";
    }, {
        readonly type: "uint256";
        readonly name: "feeAmount";
    }, {
        readonly type: "uint256";
        readonly name: "taxAmount";
    }];
}, {
    readonly name: "PoolFeesSwept";
    readonly type: 'event';
    readonly inputs: readonly [{
        readonly type: "bytes32";
        readonly name: "poolId";
        readonly indexed: true;
    }, {
        readonly type: "uint256";
        readonly name: "protocolAmount";
    }, {
        readonly type: "uint256";
        readonly name: "buybackAmount";
    }, {
        readonly type: "uint256";
        readonly name: "creatorAmount";
    }, {
        readonly type: "uint256";
        readonly name: "tokensLocked";
    }];
}, {
    readonly name: "PoolFeesRescued";
    readonly type: 'event';
    readonly inputs: readonly [{
        readonly type: "bytes32";
        readonly name: "poolId";
        readonly indexed: true;
    }, {
        readonly type: "address";
        readonly name: "quoteToken";
        readonly indexed: true;
    }, {
        readonly type: "uint256";
        readonly name: "protocolAmount";
    }, {
        readonly type: "uint256";
        readonly name: "creatorAmount";
    }];
}];
export declare const ponsLockerAbi: readonly [{
    readonly name: "lockedPositions";
    readonly type: 'function';
    readonly stateMutability: "view";
    readonly inputs: readonly [{
        readonly type: "address";
        readonly name: "token";
    }];
    readonly outputs: readonly [{
        readonly type: "uint256";
    }];
}, {
    readonly name: "lockedTokenSupply";
    readonly type: 'function';
    readonly stateMutability: "view";
    readonly inputs: readonly [{
        readonly type: "address";
        readonly name: "token";
    }];
    readonly outputs: readonly [{
        readonly type: "uint256";
    }];
}, {
    readonly name: "isLocked";
    readonly type: 'function';
    readonly stateMutability: "view";
    readonly inputs: readonly [{
        readonly type: "address";
        readonly name: "token";
    }];
    readonly outputs: readonly [{
        readonly type: "bool";
    }];
}];
export declare const ponsBuybackVaultAbi: readonly [{
    readonly name: "release";
    readonly type: 'function';
    readonly stateMutability: "nonpayable";
    readonly inputs: readonly [{
        readonly type: "address";
        readonly name: "token";
    }];
    readonly outputs: readonly [{
        readonly type: "uint256";
        readonly name: "released";
    }];
}, {
    readonly name: "totalLocked";
    readonly type: 'function';
    readonly stateMutability: "view";
    readonly inputs: readonly [{
        readonly type: "address";
        readonly name: "token";
    }];
    readonly outputs: readonly [{
        readonly type: "uint256";
    }];
}, {
    readonly name: "totalReleased";
    readonly type: 'function';
    readonly stateMutability: "view";
    readonly inputs: readonly [{
        readonly type: "address";
        readonly name: "token";
    }];
    readonly outputs: readonly [{
        readonly type: "uint256";
    }];
}, {
    readonly name: "vestedAmount";
    readonly type: 'function';
    readonly stateMutability: "view";
    readonly inputs: readonly [{
        readonly type: "address";
        readonly name: "token";
    }];
    readonly outputs: readonly [{
        readonly type: "uint256";
    }];
}, {
    readonly name: "releasable";
    readonly type: 'function';
    readonly stateMutability: "view";
    readonly inputs: readonly [{
        readonly type: "address";
        readonly name: "token";
    }];
    readonly outputs: readonly [{
        readonly type: "uint256";
    }];
}, {
    readonly name: "vestingTerms";
    readonly type: 'function';
    readonly stateMutability: "view";
    readonly inputs: readonly [{
        readonly type: "address";
        readonly name: "token";
    }];
    readonly outputs: readonly [{
        readonly type: "address";
        readonly name: "creatorRecipient";
    }, {
        readonly type: "address";
        readonly name: "protocolRecipient";
    }, {
        readonly type: "uint16";
        readonly name: "protocolFeeShareBps";
    }];
}, {
    readonly name: "Locked";
    readonly type: 'event';
    readonly inputs: readonly [{
        readonly type: "address";
        readonly name: "token";
        readonly indexed: true;
    }, {
        readonly type: "address";
        readonly name: "depositor";
        readonly indexed: true;
    }, {
        readonly type: "uint256";
        readonly name: "amount";
    }, {
        readonly type: "uint256";
        readonly name: "newVestingStart";
    }];
}, {
    readonly name: "Released";
    readonly type: 'event';
    readonly inputs: readonly [{
        readonly type: "address";
        readonly name: "token";
        readonly indexed: true;
    }, {
        readonly type: "uint256";
        readonly name: "creatorAmount";
    }, {
        readonly type: "uint256";
        readonly name: "protocolAmount";
    }];
}, {
    readonly name: "CreatorRecipientUpdated";
    readonly type: 'event';
    readonly inputs: readonly [{
        readonly type: "address";
        readonly name: "token";
        readonly indexed: true;
    }, {
        readonly type: "address";
        readonly name: "previousRecipient";
        readonly indexed: true;
    }, {
        readonly type: "address";
        readonly name: "newRecipient";
        readonly indexed: true;
    }];
}];
