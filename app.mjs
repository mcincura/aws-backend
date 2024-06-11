import { Connection, PublicKey, Keypair, Transaction, SystemProgram, LAMPORTS_PER_SOL } from '@solana/web3.js';
import * as splToken from '@solana/spl-token';
import fs from 'fs';

// Load seller wallet from JSON file
const keysPath = './keys.json';
const { sellerSecretKey } = JSON.parse(fs.readFileSync(keysPath, 'utf8'));
const sellerKeypair = Keypair.fromSecretKey(Uint8Array.from(sellerSecretKey));

// Solana connection
const connection = new Connection('https://api.devnet.solana.com');

// Your token details
const TOKEN_DECIMALS = 9; // Adjust if different
const TOTAL_SUPPLY = 355000000;
const TOTAL_PRICE_SOL = 40;
const PRICE_PER_TOKEN_SOL = TOTAL_PRICE_SOL / TOTAL_SUPPLY;

async function createAndSignTransaction(buyerPublicKey, amountInSol) {
  const buyerPubKey = new PublicKey(buyerPublicKey);
  const amountInTokens = amountInSol / PRICE_PER_TOKEN_SOL;
  const tokenMintAddress = new PublicKey('7jbCDk8XPd6Bxb2s2yzWwyq2hUXQBcMgW3yDmdp4FRsC'); // Replace with your SPL token mint address

  // Fetch or create the associated token account for the buyer
  const buyerTokenAccount = await splToken.getOrCreateAssociatedTokenAccount(
    connection,
    sellerKeypair,
    tokenMintAddress,
    buyerPubKey
  );

  // Fetch or create the associated token account for the seller
  const sellerTokenAccount = await splToken.getOrCreateAssociatedTokenAccount(
    connection,
    sellerKeypair,
    tokenMintAddress,
    sellerKeypair.publicKey
  );

  // Create the SOL transfer instruction (buyer to seller)
  const solTransferInstruction = SystemProgram.transfer({
    fromPubkey: buyerPubKey,
    toPubkey: sellerKeypair.publicKey,
    lamports: amountInSol * LAMPORTS_PER_SOL
  });

  // Create the token transfer instruction (seller to buyer)
  const tokenTransferInstruction = splToken.createTransferInstruction(
    sellerTokenAccount.address,
    buyerTokenAccount.address,
    sellerKeypair.publicKey,
    amountInTokens * Math.pow(10, TOKEN_DECIMALS)
  );

  // Create the transaction
  const transaction = new Transaction().add(solTransferInstruction, tokenTransferInstruction);
  
  // Fetch the latest blockhash
  const { blockhash } = await connection.getRecentBlockhash();
  transaction.recentBlockhash = blockhash;
  transaction.feePayer = buyerPubKey;

  // Sign the transaction with the seller's keypair
  transaction.sign(sellerKeypair);

  // Serialize the transaction and convert it to a base64 string
  const serializedTransaction = transaction.serialize({ requireAllSignatures: false }).toString('base64');

  return serializedTransaction;
}

export const handler = async (event) => {
  console.info('Received event:', event);

  const body = JSON.parse(event.body);
  const { buyerPublicKey, amountInSol } = body;

  try {
    const transactionBase64 = await createAndSignTransaction(buyerPublicKey, amountInSol);

    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Access-Control-Allow-Methods': 'OPTIONS,POST,GET'
      },
      body: JSON.stringify({ transaction: transactionBase64 }),
    };
  } catch (error) {
    console.error('Transaction error:', error);
    return {
      statusCode: 500,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Access-Control-Allow-Methods': 'OPTIONS,POST,GET'
      },
      body: JSON.stringify({ message: 'Transaction failed', error: error.message }),
    };
  }
};
