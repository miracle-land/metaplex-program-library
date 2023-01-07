/**
 * This code was GENERATED using the solita package.
 * Please DO NOT EDIT THIS FILE, instead rerun solita to update it or write a wrapper to add functionality.
 *
 * See: https://github.com/metaplex-foundation/solita
 */

import * as beet from '@metaplex-foundation/beet';
import { AuthorizationData, authorizationDataBeet } from './AuthorizationData';
/**
 * This type is used to derive the {@link DelegateArgs} type as well as the de/serializer.
 * However don't refer to it in your code but use the {@link DelegateArgs} type instead.
 *
 * @category userTypes
 * @category enums
 * @category generated
 * @private
 */
export type DelegateArgsRecord = {
  CollectionV1: { authorizationData: beet.COption<AuthorizationData> };
  SaleV1: { amount: beet.bignum; authorizationData: beet.COption<AuthorizationData> };
  TransferV1: { amount: beet.bignum; authorizationData: beet.COption<AuthorizationData> };
};

/**
 * Union type respresenting the DelegateArgs data enum defined in Rust.
 *
 * NOTE: that it includes a `__kind` property which allows to narrow types in
 * switch/if statements.
 * Additionally `isDelegateArgs*` type guards are exposed below to narrow to a specific variant.
 *
 * @category userTypes
 * @category enums
 * @category generated
 */
export type DelegateArgs = beet.DataEnumKeyAsKind<DelegateArgsRecord>;

export const isDelegateArgsCollectionV1 = (
  x: DelegateArgs,
): x is DelegateArgs & { __kind: 'CollectionV1' } => x.__kind === 'CollectionV1';
export const isDelegateArgsSaleV1 = (x: DelegateArgs): x is DelegateArgs & { __kind: 'SaleV1' } =>
  x.__kind === 'SaleV1';
export const isDelegateArgsTransferV1 = (
  x: DelegateArgs,
): x is DelegateArgs & { __kind: 'TransferV1' } => x.__kind === 'TransferV1';

/**
 * @category userTypes
 * @category generated
 */
export const delegateArgsBeet = beet.dataEnum<DelegateArgsRecord>([
  [
    'CollectionV1',
    new beet.FixableBeetArgsStruct<DelegateArgsRecord['CollectionV1']>(
      [['authorizationData', beet.coption(authorizationDataBeet)]],
      'DelegateArgsRecord["CollectionV1"]',
    ),
  ],

  [
    'SaleV1',
    new beet.FixableBeetArgsStruct<DelegateArgsRecord['SaleV1']>(
      [
        ['amount', beet.u64],
        ['authorizationData', beet.coption(authorizationDataBeet)],
      ],
      'DelegateArgsRecord["SaleV1"]',
    ),
  ],

  [
    'TransferV1',
    new beet.FixableBeetArgsStruct<DelegateArgsRecord['TransferV1']>(
      [
        ['amount', beet.u64],
        ['authorizationData', beet.coption(authorizationDataBeet)],
      ],
      'DelegateArgsRecord["TransferV1"]',
    ),
  ],
]) as beet.FixableBeet<DelegateArgs, DelegateArgs>;
