// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Test.sol";
import "../src/interface/IWETH.sol";
import "../src/interface/IERC20.sol";
import "../src/interface/IUniswapV2.sol";
import "../src/Sandwich.sol";

contract SandwichTest is Test {
    Sandwich public sandwich;

    IWETH constant weth = IWETH(0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2);
    IERC20 constant usdc = IERC20(0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48);

    IUniswapV2Router02 constant univ2Router =
        IUniswapV2Router02(0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D);
    IUniswapV2Factory constant univ2Factory =
        IUniswapV2Factory(0x5C69bEe701ef814a2B6a3EDD4B1652CB9cc5aA6f);

    IUniswapV2Pair public wethUsdcPair;

    function setUp() public {
        // Fork mainnet for testing
        vm.createSelectFork(vm.envString("ETH_RPC_URL"));

        // Get WETH by depositing ETH
        weth.deposit{value: 10e18}();

        // Get the WETH-USDC pair
        wethUsdcPair = IUniswapV2Pair(
            univ2Factory.getPair(address(weth), address(usdc))
        );
    }

    /// @notice Test sandwich front slice using UniswapV2 Router
    function test_sandwich_frontslice_router() public {
        weth.approve(address(univ2Router), type(uint256).max);

        address[] memory path = new address[](2);
        path[0] = address(weth);
        path[1] = address(usdc);

        uint256 _before = gasleft();
        univ2Router.swapExactTokensForTokens(
            1e18,
            0,
            path,
            address(this),
            block.timestamp + 100
        );
        uint256 _after = gasleft();

        emit log("router front slice gas used");
        emit log_uint(_before - _after);
    }

    /// @notice Test optimized Solidity sandwich front slice
    function test_solidity_sandwich_frontslice_optimized() public {
        sandwich = new Sandwich(address(this));
        weth.transfer(address(sandwich), 1e18);

        bytes memory payload = getSandwichPayload();

        uint256 _before = gasleft();
        (bool s, ) = address(sandwich).call(payload);
        uint256 _after = gasleft();
        assertTrue(s);

        emit log("optimized front slice gas used");
        emit log_uint(_before - _after);
    }

    /// @notice Test that unauthorized users cannot call the sandwich contract
    function test_solidity_sandwich_permissions() public {
        Sandwich psandwich = new Sandwich(address(0));
        bytes memory payload = getSandwichPayload();
        (bool s, ) = address(psandwich).call(payload);
        assertFalse(s);
    }

    /// @notice Test recoverERC20 function
    function test_recover_erc20() public {
        sandwich = new Sandwich(address(this));
        weth.transfer(address(sandwich), 1e18);

        uint256 balanceBefore = weth.balanceOf(address(this));
        sandwich.recoverERC20(address(weth));
        uint256 balanceAfter = weth.balanceOf(address(this));

        assertEq(balanceAfter - balanceBefore, 1e18);
    }

    /// @notice Test recoverERC20 permissions
    function test_recover_erc20_permissions() public {
        sandwich = new Sandwich(address(this));
        weth.transfer(address(sandwich), 1e18);

        // Try to recover from a different address
        vm.prank(address(0xdead));
        vm.expectRevert();
        sandwich.recoverERC20(address(weth));
    }

    /// @notice Test receive ETH
    function test_receive_eth() public {
        sandwich = new Sandwich(address(this));
        (bool s, ) = address(sandwich).call{value: 1 ether}("");
        assertTrue(s);
        assertEq(address(sandwich).balance, 1 ether);
    }

    // ******** Internal functions ********

    function getSandwichPayload() internal view returns (bytes memory payload) {
        address[] memory path = new address[](2);
        path[0] = address(weth);
        path[1] = address(usdc);

        // Get amounts out
        uint256 amountIn = 1e18;
        uint256 amountOut = univ2Router.getAmountsOut(amountIn, path)[1];
        uint8 tokenOutNo = address(usdc) < address(weth) ? 0 : 1;

        payload = abi.encodePacked(
            address(weth),           // token we're giving
            address(wethUsdcPair),   // univ2 pair
            uint128(amountIn),       // amountIn
            uint128(amountOut),      // amountOut
            tokenOutNo               // token out number
        );
    }
}
