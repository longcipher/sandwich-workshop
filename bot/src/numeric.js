import { ethers, parseUnits } from 'ethers';
import { getUniv2DataGivenIn } from './univ2.js';

const BN_18 = parseUnits('1');

/*
  Binary search to find optimal sandwichable amount

  Using binary search here as the profit function isn't normally distributed
*/
export const binarySearch = (
  left, // Lower bound
  right, // Upper bound
  calculateF, // Generic calculate function
  passConditionF, // Condition checker
  tolerance = parseUnits('0.01'), // Tolerable delta (in %, in 18 dec, i.e. parseUnits('0.01') means left and right delta can be 1%)
) => {
  if (right - left > (tolerance * (right + left)) / 2n / BN_18) {
    const mid = (right + left) / 2n;
    const out = calculateF(mid);

    // If we pass the condition
    // Number go up
    if (passConditionF(out)) {
      return binarySearch(mid, right, calculateF, passConditionF, tolerance);
    }

    // Number go down
    return binarySearch(left, mid, calculateF, passConditionF, tolerance);
  }

  // No negatives
  const ret = (right + left) / 2n;
  if (ret < 0n) {
    return 0n;
  }

  return ret;
};

/*
  Calculate the max sandwich amount
*/

export const calcSandwichOptimalIn = (
  userAmountIn,
  userMinRecvToken,
  reserveWeth,
  reserveToken,
) => {
  // Note that user is going from WETH -> TOKEN
  // So, we'll be pushing the price of TOKEN
  // by swapping WETH -> TOKEN before the user
  // i.e. Ideal tx placement:
  // 1. (Ours) WETH -> TOKEN (pushes up price)
  // 2. (Victim) WETH -> TOKEN (pushes up price more)
  // 3. (Ours) TOKEN -> WETH (sells TOKEN for slight WETH profit)
  const calcF = (amountIn) => {
    const frontrunState = getUniv2DataGivenIn(amountIn, reserveWeth, reserveToken);
    const victimState = getUniv2DataGivenIn(
      userAmountIn,
      frontrunState.newReserveA,
      frontrunState.newReserveB,
    );
    return victimState.amountOut;
  };

  // Our binary search must pass this function
  // i.e. User must receive at least min this
  const passF = (amountOut) => amountOut >= userMinRecvToken;

  // Lower bound will be 0
  // Upper bound will be 100 ETH (hardcoded, or however much ETH you have on hand)
  // Feel free to optimize and change it
  // It shouldn't be hardcoded hehe....
  const lowerBound = parseUnits('0');
  const upperBound = parseUnits('100');

  // Optimal WETH in to push reserve to the point where the user
  // _JUST_ receives their min recv
  const optimalWethIn = binarySearch(lowerBound, upperBound, calcF, passF);

  return optimalWethIn;
};

export const calcSandwichState = (
  optimalSandwichWethIn,
  userWethIn,
  userMinRecv,
  reserveWeth,
  reserveToken,
) => {
  const frontrunState = getUniv2DataGivenIn(optimalSandwichWethIn, reserveWeth, reserveToken);
  const victimState = getUniv2DataGivenIn(
    userWethIn,
    frontrunState.newReserveA,
    frontrunState.newReserveB,
  );
  const backrunState = getUniv2DataGivenIn(
    frontrunState.amountOut,
    victimState.newReserveB,
    victimState.newReserveA,
  );

  // Sanity check
  if (victimState.amountOut < userMinRecv) {
    return null;
  }

  // Return
  return {
    // NOT PROFIT
    // Profit = post gas
    revenue: backrunState.amountOut - optimalSandwichWethIn,
    optimalSandwichWethIn,
    userAmountIn: userWethIn,
    userMinRecv,
    reserveState: {
      reserveWeth,
      reserveToken,
    },
    frontrun: frontrunState,
    victim: victimState,
    backrun: backrunState,
  };
};
