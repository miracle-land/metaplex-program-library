import {
  ConfirmedTransactionAssertablePromise,
  GenLabeledKeypair,
  LoadOrGenKeypair,
  LOCALHOST,
  PayerTransactionHandler,
} from '@metaplex-foundation/amman-client';
import * as splToken from '@solana/spl-token';
import {
  Connection,
  Keypair,
  PublicKey,
  SystemProgram,
  SYSVAR_INSTRUCTIONS_PUBKEY,
  Transaction,
} from '@solana/web3.js';
import {
  AssetData,
  createCreateInstruction,
  CreateInstructionAccounts,
  CreateInstructionArgs,
  createMintInstruction,
  MintInstructionAccounts,
  MintInstructionArgs,
  createUpdateInstruction,
  createTransferInstruction,
  UpdateInstructionAccounts,
  UpdateInstructionArgs,
  PROGRAM_ID,
  TokenStandard,
  TransferInstructionAccounts,
  TransferInstructionArgs,
  AuthorizationData,
  Payload,
  SignMetadataInstructionAccounts,
  VerifyCollectionInstructionAccounts,
  createVerifyCollectionInstruction,
  createSignMetadataInstruction,
  Metadata,
  DelegateInstructionAccounts,
  DelegateInstructionArgs,
  DelegateArgs,
  createDelegateInstruction,
  AuthorityType,
  RevokeInstructionAccounts,
  RevokeInstructionArgs,
  createRevokeInstruction,
  RevokeArgs,
} from '../../src/generated';
import { Test } from 'tape';
import { amman } from '.';
import { UpdateTestData } from '../utils/UpdateTestData';
import {
  CreateOrUpdateInstructionAccounts,
  CreateOrUpdateInstructionArgs,
  createCreateOrUpdateInstruction,
  PROGRAM_ID as TOKEN_AUTH_RULES_ID,
} from '@metaplex-foundation/mpl-token-auth-rules';
export class InitTransactions {
  readonly getKeypair: LoadOrGenKeypair | GenLabeledKeypair;

  constructor(readonly resuseKeypairs = false) {
    this.getKeypair = resuseKeypairs ? amman.loadOrGenKeypair : amman.genLabeledKeypair;
  }

  async payer() {
    const [payer, payerPair] = await this.getKeypair('Payer');

    const connection = new Connection(LOCALHOST, 'confirmed');
    await amman.airdrop(connection, payer, 2);

    const transactionHandler = amman.payerTransactionHandler(connection, payerPair);

    return {
      fstTxHandler: transactionHandler,
      connection,
      payer,
      payerPair,
    };
  }

  async create(
    t: Test,
    payer: Keypair,
    assetData: AssetData,
    decimals: number,
    maxSupply: number,
    handler: PayerTransactionHandler,
  ): Promise<{
    tx: ConfirmedTransactionAssertablePromise;
    mint: PublicKey;
    metadata: PublicKey;
    masterEdition?: PublicKey;
  }> {
    // mint account
    const [, mint] = await this.getKeypair('Mint Account');
    // metadata account
    const [metadata] = PublicKey.findProgramAddressSync(
      [Buffer.from('metadata'), PROGRAM_ID.toBuffer(), mint.publicKey.toBuffer()],
      PROGRAM_ID,
    );
    amman.addr.addLabel('Metadata Account', metadata);
    // master edition account
    let masterEdition = null;

    if (
      assetData.tokenStandard == TokenStandard.NonFungible ||
      assetData.tokenStandard == TokenStandard.ProgrammableNonFungible
    ) {
      // master edition (optional)
      [masterEdition] = PublicKey.findProgramAddressSync(
        [
          Buffer.from('metadata'),
          PROGRAM_ID.toBuffer(),
          mint.publicKey.toBuffer(),
          Buffer.from('edition'),
        ],
        PROGRAM_ID,
      );
      amman.addr.addLabel('Master Edition Account', masterEdition);
    }

    const accounts: CreateInstructionAccounts = {
      metadata,
      masterEdition,
      mint: mint.publicKey,
      mintAuthority: payer.publicKey,
      payer: payer.publicKey,
      splTokenProgram: splToken.TOKEN_PROGRAM_ID,
      sysvarInstructions: SYSVAR_INSTRUCTIONS_PUBKEY,
      updateAuthority: payer.publicKey,
    };

    const args: CreateInstructionArgs = {
      createArgs: {
        __kind: 'V1',
        assetData,
        decimals,
        maxSupply,
      },
    };

    const createIx = createCreateInstruction(accounts, args);

    // this test always initializes the mint, we we need to set the
    // account to be writable and a signer
    for (let i = 0; i < createIx.keys.length; i++) {
      if (createIx.keys[i].pubkey.toBase58() === mint.publicKey.toBase58()) {
        createIx.keys[i].isSigner = true;
        createIx.keys[i].isWritable = true;
      }
    }

    const tx = new Transaction().add(createIx);

    return {
      tx: handler.sendAndConfirmTransaction(tx, [payer, mint], 'tx: Create'),
      mint: mint.publicKey,
      metadata,
      masterEdition,
    };
  }

  async mint(
    t: Test,
    connection: Connection,
    payer: Keypair,
    mint: PublicKey,
    metadata: PublicKey,
    masterEdition: PublicKey,
    authorizationData: AuthorizationData,
    amount: number,
    handler: PayerTransactionHandler,
  ): Promise<{ tx: ConfirmedTransactionAssertablePromise; token: PublicKey }> {
    // token account
    const [token] = PublicKey.findProgramAddressSync(
      [payer.publicKey.toBuffer(), splToken.TOKEN_PROGRAM_ID.toBuffer(), mint.toBuffer()],
      splToken.ASSOCIATED_TOKEN_PROGRAM_ID,
    );
    amman.addr.addLabel('Token Account', token);

    const metadataAccount = await Metadata.fromAccountAddress(connection, metadata);
    const authConfig = metadataAccount.programmableConfig;

    const mintAcccounts: MintInstructionAccounts = {
      token,
      metadata,
      masterEdition,
      mint,
      payer: payer.publicKey,
      authority: payer.publicKey,
      sysvarInstructions: SYSVAR_INSTRUCTIONS_PUBKEY,
      splAtaProgram: splToken.ASSOCIATED_TOKEN_PROGRAM_ID,
      splTokenProgram: splToken.TOKEN_PROGRAM_ID,
      authorizationRules: authConfig ? authConfig.ruleSet : null,
      authorizationRulesProgram: TOKEN_AUTH_RULES_ID,
    };

    const payload: Payload = {
      map: new Map(),
    };

    if (!authorizationData) {
      authorizationData = {
        payload,
      };
    }

    const mintArgs: MintInstructionArgs = {
      mintArgs: {
        __kind: 'V1',
        amount,
        authorizationData,
      },
    };

    const mintIx = createMintInstruction(mintAcccounts, mintArgs);

    // creates the transaction

    const tx = new Transaction().add(mintIx);

    return {
      tx: handler.sendAndConfirmTransaction(tx, [payer], 'tx: Mint'),
      token,
    };
  }

  async transfer(
    authority: Keypair,
    tokenOwner: PublicKey,
    token: PublicKey,
    mint: PublicKey,
    metadata: PublicKey,
    edition: PublicKey,
    destinationOwner: PublicKey,
    destination: PublicKey,
    authorizationRules: PublicKey,
    amount: number,
    handler: PayerTransactionHandler,
  ): Promise<{ tx: ConfirmedTransactionAssertablePromise }> {
    amman.addr.addLabel('Mint Account', mint);
    amman.addr.addLabel('Metadata Account', metadata);
    if (edition != null) {
      amman.addr.addLabel('Master Edition Account', edition);
    }
    amman.addr.addLabel('Authority', authority.publicKey);
    amman.addr.addLabel('Token Owner', tokenOwner);
    amman.addr.addLabel('Token Account', token);
    amman.addr.addLabel('Destination', destinationOwner);
    amman.addr.addLabel('Destination Token Account', destination);

    const transferAcccounts: TransferInstructionAccounts = {
      authority: authority.publicKey,
      tokenOwner,
      token,
      metadata,
      mint,
      edition,
      destinationOwner,
      destination,
      splTokenProgram: splToken.TOKEN_PROGRAM_ID,
      splAtaProgram: splToken.ASSOCIATED_TOKEN_PROGRAM_ID,
      systemProgram: SystemProgram.programId,
      sysvarInstructions: SYSVAR_INSTRUCTIONS_PUBKEY,
      authorizationRules,
      authorizationRulesProgram: TOKEN_AUTH_RULES_ID,
    };

    const transferArgs: TransferInstructionArgs = {
      transferArgs: {
        __kind: 'V1',
        amount,
        authorizationData: null,
      },
    };

    const transferIx = createTransferInstruction(transferAcccounts, transferArgs);

    const tx = new Transaction().add(transferIx);

    return {
      tx: handler.sendAndConfirmTransaction(tx, [authority], 'tx: Transfer'),
    };
  }

  async update(
    t: Test,
    handler: PayerTransactionHandler,
    mint: PublicKey,
    metadata: PublicKey,
    edition: PublicKey,
    authority: Keypair,
    authorityType: AuthorityType = AuthorityType.Metadata,
    updateTestData: UpdateTestData,
    delegateRecord?: PublicKey | null,
    token?: PublicKey | null,
    ruleSetPda?: PublicKey | null,
    authorizationData?: AuthorizationData | null,
  ): Promise<{ tx: ConfirmedTransactionAssertablePromise }> {
    amman.addr.addLabel('Mint Account', mint);
    amman.addr.addLabel('Metadata Account', metadata);
    if (edition != null) {
      amman.addr.addLabel('Edition Account', edition);
    }

    const updateAcccounts: UpdateInstructionAccounts = {
      metadata,
      edition,
      mint,
      systemProgram: SystemProgram.programId,
      sysvarInstructions: SYSVAR_INSTRUCTIONS_PUBKEY,
      authority: authority.publicKey,
      token,
      delegateRecord,
      authorizationRulesProgram: ruleSetPda ? TOKEN_AUTH_RULES_ID : PROGRAM_ID,
      authorizationRules: ruleSetPda,
    };

    const updateArgs: UpdateInstructionArgs = {
      updateArgs: {
        __kind: 'V1',
        newUpdateAuthority: updateTestData.newUpdateAuthority,
        data: updateTestData.data,
        primarySaleHappened: updateTestData.primarySaleHappened,
        isMutable: updateTestData.isMutable,
        tokenStandard: updateTestData.tokenStandard,
        collection: updateTestData.collection,
        uses: updateTestData.uses,
        collectionDetails: updateTestData.collectionDetails,
        programmableConfig: updateTestData.programmableConfig,
        delegateState: updateTestData.delegateState,
        authorizationData,
        authorityType,
      },
    };

    const updateIx = createUpdateInstruction(updateAcccounts, updateArgs);

    const tx = new Transaction().add(updateIx);

    return {
      tx: handler.sendAndConfirmTransaction(tx, [authority], 'tx: Update'),
    };
  }

  async verifyCollection(
    t: Test,
    payer: Keypair,
    metadata: PublicKey,
    collectionMint: PublicKey,
    collectionMetadata: PublicKey,
    collectionMasterEdition: PublicKey,
    collectionAuthority: Keypair,
    handler: PayerTransactionHandler,
  ): Promise<{ tx: ConfirmedTransactionAssertablePromise }> {
    amman.addr.addLabel('Metadata Account', metadata);
    amman.addr.addLabel('Collection Mint Account', collectionMint);
    amman.addr.addLabel('Collection Metadata Account', collectionMetadata);
    amman.addr.addLabel('Collection Master Edition Account', collectionMasterEdition);

    const verifyCollectionAcccounts: VerifyCollectionInstructionAccounts = {
      metadata,
      collectionAuthority: collectionAuthority.publicKey,
      collectionMint,
      collection: collectionMetadata,
      collectionMasterEditionAccount: collectionMasterEdition,
      payer: payer.publicKey,
    };

    const verifyInstruction = createVerifyCollectionInstruction(verifyCollectionAcccounts);
    const tx = new Transaction().add(verifyInstruction);

    return {
      tx: handler.sendAndConfirmTransaction(
        tx,
        [payer, collectionAuthority],
        'tx: Verify Collection',
      ),
    };
  }
  async signMetadata(
    t: Test,
    creator: Keypair,
    metadata: PublicKey,
    handler: PayerTransactionHandler,
  ): Promise<{ tx: ConfirmedTransactionAssertablePromise }> {
    amman.addr.addLabel('Metadata Account', metadata);

    const signMetadataAcccounts: SignMetadataInstructionAccounts = {
      metadata,
      creator: creator.publicKey,
    };

    const signMetadataInstruction = createSignMetadataInstruction(signMetadataAcccounts);
    const tx = new Transaction().add(signMetadataInstruction);

    return {
      tx: handler.sendAndConfirmTransaction(tx, [creator], 'tx: Sign Metadata'),
    };
  }

  async createRuleSet(
    t: Test,
    payer: Keypair,
    ruleSetPda: PublicKey,
    serializedRuleSet: Uint8Array,
    handler: PayerTransactionHandler,
  ): Promise<{ tx: ConfirmedTransactionAssertablePromise }> {
    amman.addr.addLabel('Payer', payer.publicKey);

    const createRuleSetAccounts: CreateOrUpdateInstructionAccounts = {
      ruleSetPda,
      payer: payer.publicKey,
    };

    const createRuleSetArgs: CreateOrUpdateInstructionArgs = {
      createOrUpdateArgs: {
        __kind: 'V1',
        serializedRuleSet,
      },
    };

    const createRuleSetInstruction = createCreateOrUpdateInstruction(
      createRuleSetAccounts,
      createRuleSetArgs,
    );
    const tx = new Transaction().add(createRuleSetInstruction);

    return {
      tx: handler.sendAndConfirmTransaction(tx, [payer], 'tx: Create Rule Set'),
    };
  }

  async delegate(
    delegateRecord: PublicKey,
    delegate: PublicKey,
    mint: PublicKey,
    metadata: PublicKey,
    masterEdition: PublicKey,
    authority: PublicKey,
    payer: Keypair,
    args: DelegateArgs,
    handler: PayerTransactionHandler,
    token: PublicKey | null = null,
    ruleSetPda: PublicKey | null = null,
  ): Promise<{ tx: ConfirmedTransactionAssertablePromise }> {
    const delegateAcccounts: DelegateInstructionAccounts = {
      delegateRecord,
      delegate,
      metadata,
      masterEdition,
      mint,
      token,
      authority,
      payer: payer.publicKey,
      sysvarInstructions: SYSVAR_INSTRUCTIONS_PUBKEY,
      splTokenProgram: splToken.TOKEN_PROGRAM_ID,
      authorizationRulesProgram: TOKEN_AUTH_RULES_ID,
      authorizationRules: ruleSetPda,
    };

    const mintArgs: DelegateInstructionArgs = {
      delegateArgs: args,
    };

    const mintIx = createDelegateInstruction(delegateAcccounts, mintArgs);

    // creates the transaction

    const tx = new Transaction().add(mintIx);

    return {
      tx: handler.sendAndConfirmTransaction(tx, [payer], 'tx: Delegate'),
    };
  }

  async revoke(
    delegateRecord: PublicKey,
    delegate: PublicKey,
    mint: PublicKey,
    metadata: PublicKey,
    masterEdition: PublicKey,
    authority: PublicKey,
    payer: Keypair,
    args: RevokeArgs,
    handler: PayerTransactionHandler,
    token: PublicKey | null = null,
    ruleSetPda: PublicKey | null = null,
  ): Promise<{ tx: ConfirmedTransactionAssertablePromise; delegate: PublicKey }> {
    const revokeAcccounts: RevokeInstructionAccounts = {
      delegateRecord,
      delegate,
      metadata,
      masterEdition,
      mint,
      token,
      authority,
      payer: payer.publicKey,
      sysvarInstructions: SYSVAR_INSTRUCTIONS_PUBKEY,
      splTokenProgram: splToken.TOKEN_PROGRAM_ID,
      authorizationRulesProgram: TOKEN_AUTH_RULES_ID,
      authorizationRules: ruleSetPda,
    };

    const revokeArgs: RevokeInstructionArgs = {
      revokeArgs: args,
    };

    const mintIx = createRevokeInstruction(revokeAcccounts, revokeArgs);

    // creates the transaction

    const tx = new Transaction().add(mintIx);

    return {
      tx: handler.sendAndConfirmTransaction(tx, [payer], 'tx: Revoke'),
      delegate,
    };
  }
}