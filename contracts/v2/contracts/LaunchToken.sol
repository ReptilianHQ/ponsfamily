// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

/// @title LaunchToken
/// @notice A fixed-supply ERC-20 minted entirely to its bonding curve at creation.
/// @dev One LaunchToken is deployed per launch by the LaunchFactory. There is no
///      mint function, no blacklist, no pausability and no owner-controlled lever
///      of any kind. Everything a v2 launch can still control (fee recipient,
///      buyback toggle, community takeovers) lives in the factory/hook, never here,
///      so a token that graduates keeps behaving exactly the same no matter what
///      happens to the rest of the protocol around it.
contract LaunchToken is ERC20 {
    struct Socials {
        string twitter;
        string telegram;
        string discord;
        string website;
        string farcaster;
    }

    /// @notice Address that requested this launch. Informational only — carries
    ///         no privileges over the token itself.
    address public immutable tokenDeployer;

    string public tokenLogo;
    string public tokenDescription;
    Socials private _tokenSocials;

    constructor(
        string memory name_,
        string memory symbol_,
        uint256 totalSupply_,
        address curve_,
        address deployer_,
        string memory logo_,
        string memory description_,
        Socials memory socials_
    ) ERC20(name_, symbol_) {
        tokenDeployer = deployer_;
        tokenLogo = logo_;
        tokenDescription = description_;
        _tokenSocials = socials_;

        // The entire supply is minted straight to the curve. No one, including
        // the deployer, ever holds a pre-mined bag.
        _mint(curve_, totalSupply_);
    }

    /// @notice Everything the creator supplied at launch beyond name/symbol/decimals.
    function getTokenInfo()
        external
        view
        returns (address deployer, string memory logo, string memory description, Socials memory socials)
    {
        return (tokenDeployer, tokenLogo, tokenDescription, _tokenSocials);
    }
}
