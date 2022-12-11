/**
 * This code was GENERATED using the solita package.
 * Please DO NOT EDIT THIS FILE, instead rerun solita to update it or write a wrapper to add functionality.
 *
 * See: https://github.com/metaplex-foundation/solita
 */

import * as web3 from '@solana/web3.js';
import * as beetSolana from '@metaplex-foundation/beet-solana';
import * as beet from '@metaplex-foundation/beet';
export type ProgrammableConfig = {
  ruleSet: web3.PublicKey;
};

/**
 * @category userTypes
 * @category generated
 */
export const programmableConfigBeet = new beet.BeetArgsStruct<ProgrammableConfig>(
  [['ruleSet', beetSolana.publicKey]],
  'ProgrammableConfig',
);
