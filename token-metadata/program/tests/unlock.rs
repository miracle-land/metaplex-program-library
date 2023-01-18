#![cfg(feature = "test-bpf")]
pub mod utils;

use solana_program_test::*;
use utils::*;

mod utility {

    use mpl_token_metadata::{
        instruction::DelegateArgs,
        pda::find_token_record_account,
        state::{TokenDelegateRole, TokenRecord, TokenStandard, TokenState},
    };
    use solana_program::{
        borsh::try_from_slice_unchecked, native_token::LAMPORTS_PER_SOL, program_option::COption,
        program_pack::Pack,
    };
    use solana_sdk::signature::{Keypair, Signer};
    use spl_token::state::Account;

    use super::*;

    #[tokio::test]
    async fn delegate_unlock_programmable_nonfungible() {
        let mut context = program_test().start_with_context().await;

        // asset

        let mut asset = DigitalAsset::default();
        asset
            .create_and_mint(
                &mut context,
                TokenStandard::ProgrammableNonFungible,
                None,
                None,
                1,
            )
            .await
            .unwrap();

        // asserts

        let (pda_key, _) = find_token_record_account(&asset.mint.pubkey(), &context.payer.pubkey());

        let pda = get_account(&mut context, &pda_key).await;
        let token_record: TokenRecord = try_from_slice_unchecked(&pda.data).unwrap();

        assert_eq!(token_record.state, TokenState::Unlocked);

        // set a utility delegate

        let delegate = Keypair::new();
        let delegate_pubkey = delegate.pubkey();
        let payer = Keypair::from_bytes(&context.payer.to_bytes()).unwrap();

        asset
            .delegate(
                &mut context,
                payer,
                delegate_pubkey,
                DelegateArgs::UtilityV1 {
                    amount: 1,
                    authorization_data: None,
                },
            )
            .await
            .unwrap();

        // lock

        let payer = Keypair::from_bytes(&context.payer.to_bytes()).unwrap();
        let token_delegate = Keypair::from_bytes(&delegate.to_bytes()).unwrap();

        asset
            .lock(&mut context, token_delegate, Some(pda_key), payer)
            .await
            .unwrap();

        // asserts

        let pda = get_account(&mut context, &pda_key).await;
        let token_record: TokenRecord = try_from_slice_unchecked(&pda.data).unwrap();

        assert_eq!(token_record.state, TokenState::Locked);

        // unlock

        let payer = Keypair::from_bytes(&context.payer.to_bytes()).unwrap();
        let token_delegate = Keypair::from_bytes(&delegate.to_bytes()).unwrap();

        asset
            .unlock(&mut context, token_delegate, Some(pda_key), payer)
            .await
            .unwrap();

        // asserts

        let pda = get_account(&mut context, &pda_key).await;
        let token_record: TokenRecord = try_from_slice_unchecked(&pda.data).unwrap();

        assert_eq!(token_record.state, TokenState::Unlocked);
    }

    #[tokio::test]
    async fn delegate_unlock_nonfungible() {
        let mut context = program_test().start_with_context().await;

        // asset

        let mut asset = DigitalAsset::default();
        asset
            .create_and_mint(&mut context, TokenStandard::NonFungible, None, None, 1)
            .await
            .unwrap();

        // asserts

        let token_account = get_account(&mut context, &asset.token.unwrap()).await;
        let token = Account::unpack(&token_account.data).unwrap();
        // should NOT be frozen
        assert!(!token.is_frozen());

        // set a utility delegate

        let delegate = Keypair::new();
        let delegate_pubkey = delegate.pubkey();
        let payer = Keypair::from_bytes(&context.payer.to_bytes()).unwrap();

        asset
            .delegate(
                &mut context,
                payer,
                delegate_pubkey,
                DelegateArgs::UtilityV1 {
                    amount: 1,
                    authorization_data: None,
                },
            )
            .await
            .unwrap();

        // lock

        let payer = Keypair::from_bytes(&context.payer.to_bytes()).unwrap();
        let token_delegate = Keypair::from_bytes(&delegate.to_bytes()).unwrap();

        asset
            .lock(&mut context, token_delegate, None, payer)
            .await
            .unwrap();

        let token_account = get_account(&mut context, &asset.token.unwrap()).await;
        let token = Account::unpack(&token_account.data).unwrap();
        // should be frozen
        assert!(token.is_frozen());

        // unlock

        let payer = Keypair::from_bytes(&context.payer.to_bytes()).unwrap();
        let token_delegate = Keypair::from_bytes(&delegate.to_bytes()).unwrap();

        asset
            .unlock(&mut context, token_delegate, None, payer)
            .await
            .unwrap();

        let token_account = get_account(&mut context, &asset.token.unwrap()).await;
        let token = Account::unpack(&token_account.data).unwrap();
        // should NOT be frozen
        assert!(!token.is_frozen());
    }

    #[tokio::test]
    async fn non_fungible_program_delegate_unlock() {
        // Tests a delegate transferring from a system wallet to a PDA and vice versa.
        let mut program_test = ProgramTest::new("mpl_token_metadata", mpl_token_metadata::ID, None);
        program_test.add_program("mpl_token_auth_rules", mpl_token_auth_rules::ID, None);
        program_test.add_program("rooster", rooster::ID, None);
        let mut context = program_test.start_with_context().await;

        // creates an NFT

        let mut nft = DigitalAsset::new();
        nft.create_and_mint(&mut context, TokenStandard::NonFungible, None, None, 1)
            .await
            .unwrap();

        // locks the NFT in a "staking" (rooster) program

        let payer = context.payer.dirty_clone();
        airdrop(&mut context, &payer.pubkey(), LAMPORTS_PER_SOL)
            .await
            .unwrap();

        let rooster_manager = RoosterManager::init(&mut context, payer).await.unwrap();

        let token_owner = context.payer.dirty_clone();
        let token = nft.token.unwrap();

        // locks the token

        rooster_manager
            .lock(
                &mut context,
                &token_owner,
                token,
                nft.mint.pubkey(),
                nft.metadata,
                nft.master_edition.unwrap(),
            )
            .await
            .unwrap();

        // asserts

        let account = get_account(&mut context, &token).await;
        let token_account = Account::unpack(&account.data).unwrap();

        assert!(token_account.is_frozen());
        assert_eq!(token_account.delegate, COption::Some(rooster_manager.pda()),);
        assert_eq!(token_account.delegated_amount, 1);

        // unlocks the token

        rooster_manager
            .unlock(
                &mut context,
                &token_owner,
                token,
                nft.mint.pubkey(),
                nft.metadata,
                nft.master_edition.unwrap(),
            )
            .await
            .unwrap();

        // asserts

        let account = get_account(&mut context, &token).await;
        let token_account = Account::unpack(&account.data).unwrap();

        assert!(!token_account.is_frozen());
    }

    #[tokio::test]
    async fn programmable_non_fungible_program_delegate_unlock() {
        // Tests a delegate transferring from a system wallet to a PDA and vice versa.
        let mut program_test = ProgramTest::new("mpl_token_metadata", mpl_token_metadata::ID, None);
        program_test.add_program("mpl_token_auth_rules", mpl_token_auth_rules::ID, None);
        program_test.add_program("rooster", rooster::ID, None);
        let mut context = program_test.start_with_context().await;

        // creates an NFT

        let mut nft = DigitalAsset::new();
        nft.create_and_mint(
            &mut context,
            TokenStandard::ProgrammableNonFungible,
            None,
            None,
            1,
        )
        .await
        .unwrap();

        // locks the NFT in a "staking" (rooster) program

        let payer = context.payer.dirty_clone();
        airdrop(&mut context, &payer.pubkey(), LAMPORTS_PER_SOL)
            .await
            .unwrap();

        let rooster_manager = RoosterManager::init(&mut context, payer).await.unwrap();

        let token_owner = context.payer.dirty_clone();
        let token = nft.token.unwrap();

        rooster_manager
            .programmable_lock(
                &mut context,
                &token_owner,
                token,
                nft.mint.pubkey(),
                nft.metadata,
                nft.master_edition.unwrap(),
            )
            .await
            .unwrap();

        // asserts

        let account = get_account(&mut context, &token).await;
        let token_account = Account::unpack(&account.data).unwrap();

        assert!(token_account.is_frozen());
        assert_eq!(token_account.delegate, COption::Some(rooster_manager.pda()));
        assert_eq!(token_account.delegated_amount, 1);

        let (token_record, _) =
            find_token_record_account(&nft.mint.pubkey(), &token_owner.pubkey());
        let token_record_pda = get_account(&mut context, &token_record).await;

        let token_record_data = TokenRecord::from_bytes(&token_record_pda.data).unwrap();
        assert_eq!(token_record_data.delegate.unwrap(), rooster_manager.pda());
        assert_eq!(
            token_record_data.delegate_role.unwrap(),
            TokenDelegateRole::Utility
        );
        assert_eq!(token_record_data.state, TokenState::Locked);

        // unlocks the token

        rooster_manager
            .programmable_unlock(
                &mut context,
                &token_owner,
                token,
                nft.mint.pubkey(),
                nft.metadata,
                nft.master_edition.unwrap(),
            )
            .await
            .unwrap();

        // asserts

        let account = get_account(&mut context, &token).await;
        let token_account = Account::unpack(&account.data).unwrap();

        assert!(token_account.is_frozen()); /* pNFT are always frozen */

        let (token_record, _) =
            find_token_record_account(&nft.mint.pubkey(), &token_owner.pubkey());
        let token_record_pda = get_account(&mut context, &token_record).await;

        let token_record_data = TokenRecord::from_bytes(&token_record_pda.data).unwrap();
        assert_eq!(token_record_data.state, TokenState::Unlocked);
    }
}
