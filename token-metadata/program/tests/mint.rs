#![cfg(feature = "test-bpf")]
pub mod utils;

use mpl_token_metadata::instruction;
use solana_program_test::*;
use solana_sdk::{
    instruction::InstructionError,
    signature::Signer,
    transaction::{Transaction, TransactionError},
};
use utils::*;

mod mint {

    use mpl_token_metadata::{error::MetadataError, instruction::MintArgs, state::TokenStandard};
    use num_traits::FromPrimitive;
    use solana_program::{program_pack::Pack, pubkey::Pubkey};
    use spl_token::state::Account;

    use super::*;

    #[tokio::test]
    async fn mint_programmable_nonfungible() {
        let mut context = program_test().start_with_context().await;

        // asset

        let mut asset = DigitalAsset::default();
        asset
            .create(&mut context, TokenStandard::ProgrammableNonFungible, None)
            .await
            .unwrap();

        // mints one token

        let payer_pubkey = context.payer.pubkey();
        let (token, _) = Pubkey::find_program_address(
            &[
                &payer_pubkey.to_bytes(),
                &spl_token::id().to_bytes(),
                &asset.mint.pubkey().to_bytes(),
            ],
            &spl_associated_token_account::id(),
        );
        asset.token = Some(token);

        let mint_ix = instruction::mint(
            /* token account       */ token,
            /* metadata account    */ asset.metadata,
            /* mint account        */ asset.mint.pubkey(),
            /* payer               */ payer_pubkey,
            /* authority           */ payer_pubkey,
            /* master edition      */ asset.master_edition,
            /* authorization rules */ None,
            /* amount              */ MintArgs::V1 { amount: 1 },
        );

        let tx = Transaction::new_signed_with_payer(
            &[mint_ix],
            Some(&context.payer.pubkey()),
            &[&context.payer],
            context.last_blockhash,
        );

        context.banks_client.process_transaction(tx).await.unwrap();

        let account = get_account(&mut context, &token).await;
        let token_account = Account::unpack(&account.data).unwrap();

        assert!(token_account.is_frozen());
        assert_eq!(token_account.amount, 1);
        assert_eq!(token_account.mint, asset.mint.pubkey());
        assert_eq!(token_account.owner, payer_pubkey);
    }

    #[tokio::test]
    async fn mint_nonfungible() {
        let mut context = program_test().start_with_context().await;

        // asset

        let mut asset = DigitalAsset::default();
        asset
            .create(&mut context, TokenStandard::NonFungible, None)
            .await
            .unwrap();

        // mints one token

        asset.mint(&mut context, None, 1).await.unwrap();

        assert!(asset.token.is_some());

        if let Some(token) = asset.token {
            let account = get_account(&mut context, &token).await;
            let token_account = Account::unpack(&account.data).unwrap();

            assert!(!token_account.is_frozen());
            assert_eq!(token_account.amount, 1);
            assert_eq!(token_account.mint, asset.mint.pubkey());
            assert_eq!(token_account.owner, context.payer.pubkey());
        }
    }

    #[tokio::test]
    async fn mint_fungible() {
        let mut context = program_test().start_with_context().await;

        // asset

        let mut asset = DigitalAsset::default();
        asset
            .create(&mut context, TokenStandard::Fungible, None)
            .await
            .unwrap();

        // mints one token

        asset.mint(&mut context, None, 100).await.unwrap();

        assert!(asset.token.is_some());

        if let Some(token) = asset.token {
            let account = get_account(&mut context, &token).await;
            let token_account = Account::unpack(&account.data).unwrap();

            assert!(!token_account.is_frozen());
            assert_eq!(token_account.amount, 100);
            assert_eq!(token_account.mint, asset.mint.pubkey());
            assert_eq!(token_account.owner, context.payer.pubkey());
        }
    }

    #[tokio::test]
    async fn mint_fungible_asset() {
        let mut context = program_test().start_with_context().await;

        // asset

        let mut asset = DigitalAsset::default();
        asset
            .create(&mut context, TokenStandard::FungibleAsset, None)
            .await
            .unwrap();

        // mints one token

        asset.mint(&mut context, None, 50).await.unwrap();

        assert!(asset.token.is_some());

        if let Some(token) = asset.token {
            let account = get_account(&mut context, &token).await;
            let token_account = Account::unpack(&account.data).unwrap();

            assert!(!token_account.is_frozen());
            assert_eq!(token_account.amount, 50);
            assert_eq!(token_account.mint, asset.mint.pubkey());
            assert_eq!(token_account.owner, context.payer.pubkey());
        }
    }

    #[tokio::test]
    async fn try_mint_multiple_programmable_nonfungible() {
        let mut context = program_test().start_with_context().await;

        let mut asset = DigitalAsset::default();
        let error = asset
            .create_and_mint(
                &mut context,
                TokenStandard::ProgrammableNonFungible,
                None,
                2,
            )
            .await
            .unwrap_err();

        assert_custom_error!(error, MetadataError::EditionsMustHaveExactlyOneToken);
    }

    #[tokio::test]
    async fn try_mint_multiple_nonfungible() {
        let mut context = program_test().start_with_context().await;

        let mut asset = DigitalAsset::default();
        let error = asset
            .create_and_mint(&mut context, TokenStandard::NonFungible, None, 2)
            .await
            .unwrap_err();

        assert_custom_error!(error, MetadataError::EditionsMustHaveExactlyOneToken);
    }
}