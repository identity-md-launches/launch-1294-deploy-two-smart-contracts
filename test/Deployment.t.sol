// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {Test} from "forge-std/Test.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {TestIMD} from "./mocks/TestIMD.sol";
import {TestSIMD} from "./mocks/TestSIMD.sol";
import {Stacker, IStakedIMD} from "../src/Stacker.sol";

/// @dev Rehearses a launch: the manifest deploys exactly one Stacker, wired to a known IMD and vault
/// pair (Ethereum mainnet on `main`, the live Sepolia test pair on the `sepolia` branch); the
/// constructor passes on an empty chain (the launch's rehearsal, where neither address has code);
/// and the runtime meets the launch's limits (EIP-170 size, no DELEGATECALL / CALLCODE /
/// SELFDESTRUCT).
contract DeploymentTest is Test {
    address internal constant MAINNET_IMD = 0xD34a99Bc0f67aE1bbd63C660e6d0b0dd03E263B7;
    address internal constant MAINNET_SIMD = 0x9Efa934D9fAd4AE28c998a40195646b965a97247;
    /// @dev Sepolia test run #1129: TestIMD (with a faucet) and TestSIMD (a StakedIMD copy whose
    /// owner can pause it).
    address internal constant SEPOLIA_TEST_IMD = 0x2B69099E59b05901faA1DD164fabf098bf831E82;
    address internal constant SEPOLIA_TEST_SIMD = 0xF9e2EEc3B610ec6781f7438aC5Fb4bc049d81Cc1;

    function test_launchManifest_onlyStackerWithAKnownPair() public view {
        string memory json = vm.readFile("./launch.json");
        assertEq(vm.parseJsonString(json, ".kind"), "evm_contracts");
        assertEq(vm.parseJsonString(json, ".contracts[0].contract"), "Stacker");
        assertFalse(vm.keyExistsJson(json, ".contracts[1]"), "only one contract is deployed");
        string[] memory args = vm.parseJsonStringArray(json, ".contracts[0].constructorArgs");
        assertEq(args.length, 2);
        address imd = vm.parseAddress(args[0]);
        address vault = vm.parseAddress(args[1]);
        bool mainnet = imd == MAINNET_IMD && vault == MAINNET_SIMD;
        bool sepoliaTest = imd == SEPOLIA_TEST_IMD && vault == SEPOLIA_TEST_SIMD;
        assertTrue(mainnet || sepoliaTest, "IMD and vault are a known pair, in that order");
    }

    function test_emptyChainRehearsal_constructorPasses() public {
        // No fork: neither mainnet address has code here, as in the launch's rehearsal.
        assertEq(MAINNET_SIMD.code.length, 0);
        vm.prank(makeAddr("factory"));
        Stacker stacker = new Stacker(IERC20(MAINNET_IMD), IStakedIMD(MAINNET_SIMD));
        assertEq(address(stacker.IMD()), MAINNET_IMD);
        assertEq(address(stacker.SIMD()), MAINNET_SIMD);
        assertEq(stacker.totalStacked(), 0);
    }

    function test_runtimeSizeAndNoEscapeOpcodes() public {
        TestIMD imd = new TestIMD();
        TestSIMD sImd = new TestSIMD(address(imd), address(this));
        _checkRuntime(address(new Stacker(IERC20(address(imd)), IStakedIMD(address(sImd)))));
        _checkRuntime(address(new Stacker(IERC20(MAINNET_IMD), IStakedIMD(MAINNET_SIMD))));
    }

    function _checkRuntime(address target) internal view {
        bytes memory code = target.code;
        assertGt(code.length, 0, "missing runtime");
        assertLe(code.length, 24_576, "exceeds EIP-170");
        for (uint256 j; j < code.length; ++j) {
            uint8 op = uint8(code[j]);
            if (op >= 0x60 && op <= 0x7f) {
                j += op - 0x5f;
                continue;
            }
            assertTrue(op != 0xf4 && op != 0xf2 && op != 0xff, "forbidden opcode");
        }
    }
}
