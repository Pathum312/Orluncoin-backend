import * as ecdsa from 'elliptic';
import sha256 from 'crypto-js/sha256';

const ec = new ecdsa.ec('secp256k1');

const COINBASE_AMOUNT = 50; // Tokens amount

class UnspentTxOut {
	public readonly txOutId: string;
	public readonly txOutIndex: number;
	public readonly address: string;
	public readonly amount: number;
	/**
	 * Constructor for an UnspentTxOut.
	 *
	 * @param txOutId The transaction ID of the transaction that contains the unspent output.
	 * @param txOutIndex The index of the output in the transaction. The first output is at index 0.
	 * @param address The address that this output is sent to.
	 * @param amount The amount of the output in Satoshis.
	 */
	constructor({
		txOutId,
		txOutIndex,
		address,
		amount,
	}: {
		txOutId: string;
		txOutIndex: number;
		address: string;
		amount: number;
	}) {
		this.txOutId = txOutId;
		this.txOutIndex = txOutIndex;
		this.address = address;
		this.amount = amount;
	}
}

class TxIn {
	public txOutId!: string;
	public txOutIndex!: number;
	public signature!: string;
}

class TxOut {
	public address: string;
	public amount: number;
	/**
	 * Constructs a transaction output.
	 *
	 * @param address The address to which the output is sent.
	 * @param amount The amount of the output in Satoshis.
	 */
	constructor({ address, amount }: { address: string; amount: number }) {
		this.address = address;
		this.amount = amount;
	}
}

class Transaction {
	public id!: string;
	public txIns!: TxIn[];
	public txOuts!: TxOut[];
}

/**
 * Generates a unique transaction ID for a given transaction.
 *
 * The transaction ID is a SHA-256 hash created by concatenating the transaction input
 * identifiers and the transaction output details.
 *
 * @param transaction The transaction for which to generate the ID.
 * @returns The generated transaction ID as a hexadecimal string.
 */
const getTransactionId = ({ transaction }: { transaction: Transaction }): string => {
	// Hash of transaction inputs
	const txInContent = transaction.txIns
		.map((txIn) => `${txIn.txOutId}${txIn.txOutIndex}`)
		.join('');

	// Hash of transaction outputs
	const txOutContent = transaction.txOuts
		.map((txOut) => `${txOut.address}${txOut.amount}`)
		.join('');

	return sha256(txInContent + txOutContent).toString();
};

/**
 * Signs a transaction input using the provided private key.
 *
 * This function locates the referenced unspent transaction output (UTxO)
 * corresponding to the transaction input specified by `txInIndex`.
 * It verifies that the provided private key corresponds to the address
 * in the referenced UTxO, and then signs the transaction ID using this
 * private key.
 *
 * @param transaction The transaction containing the input to be signed.
 * @param txInIndex The index of the transaction input to sign.
 * @param privateKey The private key used to sign the transaction input.
 * @param unspentTxOuts The list of unspent transaction outputs to reference.
 *
 * @returns The signature of the transaction input as a hexadecimal string.
 *
 * @throws {Error} If the referenced unspent transaction output is not found
 *                 or if the private key does not correspond to the address
 *                 in the referenced UTxO.
 */
const signTxIn = ({
	transaction,
	txInIndex,
	privateKey,
	unspentTxOuts,
}: {
	transaction: Transaction;
	txInIndex: number;
	privateKey: string;
	unspentTxOuts: UnspentTxOut[];
}): string => {
	// Get the transaction input
	const txIn = transaction.txIns[txInIndex];

	// Find the unspent transaction output for that transaction input
	const referencedUTxOut = unspentTxOuts.find(
		(uTxO) => uTxO.txOutId === txIn.txOutId && uTxO.txOutIndex === txIn.txOutIndex
	);

	if (!referencedUTxOut) throw new Error('Referenced unspent transaction output not found.');

	if (getPublicKey({ privateKey }) !== referencedUTxOut.address)
		throw new Error('Trying to sign an input with an invalid private key.');

	// Verify that the private key corresponds to the address in the referenced UTxO
	const key = ec.keyFromPrivate(privateKey, 'hex');

	if (key.getPublic('hex') !== referencedUTxOut.address)
		throw new Error('\nTrying to sign an input with an invalid private key.');

	// Sign the transaction ID
	const signature = key.sign(transaction.id).toDER('hex');

	return signature;
};

/**
 * Processes a set of transactions and returns the updated list of unspent transaction outputs.
 *
 * This function first validates the transactions by calling `validateBlockTransactions`.
 * If the transactions are valid, it then updates the list of unspent transaction outputs
 * by calling `updateUnspentTxOuts`.
 *
 * @param transactions The transactions to process.
 * @param unspentTxOuts The list of unspent transaction outputs to update.
 * @param blockIndex The index of the block containing the transactions.
 *
 * @returns The updated list of unspent transaction outputs.
 *
 * @throws {Error} If the transactions are invalid.
 */
const processTransactions = ({
	transactions,
	unspentTxOuts,
	blockIndex,
}: {
	transactions: Transaction[];
	unspentTxOuts: UnspentTxOut[];
	blockIndex: number;
}): UnspentTxOut[] => {
	// Validate the transactions
	if (!validateBlockTransactions({ transactions, unspentTxOuts, blockIndex }))
		throw new Error('Invalid block transactions.');

	// Update the list of unspent transaction outputs
	return updateUnspentTxOuts({ transactions, unspentTxOuts });
};

/**
 * Validates a transaction by checking that its ID matches the hash of the transaction,
 * all its inputs are valid, and the total value of its inputs matches the total value of
 * its outputs.
 *
 * @param transaction The transaction to validate.
 * @param unspentTxOuts The list of unspent transaction outputs to reference.
 *
 * @returns Whether the transaction is valid.
 *
 * @throws {Error} If the transaction is invalid.
 */
const validateTransaction = ({
	transaction,
	unspentTxOuts,
}: {
	transaction: Transaction;
	unspentTxOuts: UnspentTxOut[];
}): boolean => {
	// Check the transaction structure
	if (!validateTransactionStructure({ transaction })) return false;

	// Check if the transaction has the correct ID
	if (getTransactionId({ transaction }) !== transaction.id) {
		console.log(`Invalid transaction ID: ${transaction.id}`);
		return false;
	}

	// Check if all transaction inputs are valid
	if (!transaction.txIns.every((txIn) => validateTxIn({ txIn, transaction, unspentTxOuts }))) {
		console.log(`Invalid transaction inputs in transaction: ${transaction.id}`);
		return false;
	}

	// Total value of the transaction inputs
	const totalTxInValues = transaction.txIns.reduce(
		(sum, txIn) => sum + getTxInAmount({ txIn, unspentTxOuts }),
		0
	);

	// Total value of the transaction outputs
	const totalTxOutValues = transaction.txOuts.reduce((sum, txOut) => sum + txOut.amount, 0);

	// Check if the total value of the transaction inputs matches the total value of the transaction outputs
	if (totalTxInValues !== totalTxOutValues) {
		console.log(`Transaction inputs and outputs mismatch in transaction: ${transaction.id}`);
		return false;
	}

	return true;
};

/**
 * Validates a transaction input by checking that the referenced unspent transaction
 * output (UTxO) exists and that the signature of the transaction input is valid.
 *
 * @param txIn The transaction input to validate.
 * @param transaction The transaction containing the input.
 * @param unspentTxOuts The list of unspent transaction outputs to reference.
 *
 * @returns Whether the transaction input is valid.
 *
 * @throws {Error} If the referenced unspent transaction output is not found or if
 * the signature of the transaction input is invalid.
 */
const validateTxIn = ({
	txIn,
	transaction,
	unspentTxOuts,
}: {
	txIn: TxIn;
	transaction: Transaction;
	unspentTxOuts: UnspentTxOut[];
}): boolean => {
	// Find the referenced unspent transaction output
	const referencedUTxOut = unspentTxOuts.find(
		(uTxO) => uTxO.txOutId === txIn.txOutId && uTxO.txOutIndex === txIn.txOutIndex
	);

	// If the referenced unspent transaction output is not found, return false
	if (!referencedUTxOut) {
		console.log(`Referenced transaction output not found: ${JSON.stringify(txIn)}`);
		return false;
	}

	// Private key of the referenced unspent transaction output
	const key = ec.keyFromPublic(referencedUTxOut.address, 'hex');

	// Verify the signature
	return key.verify(transaction.id, txIn.signature);
};

/**
 * Retrieves the amount of a transaction input from the list of unspent transaction outputs.
 *
 * @param txIn The transaction input for which to retrieve the amount.
 * @param unspentTxOuts The list of unspent transaction outputs to reference.
 *
 * @returns  The amount of the transaction input.
 */
const getTxInAmount = ({
	txIn,
	unspentTxOuts,
}: {
	txIn: TxIn;
	unspentTxOuts: UnspentTxOut[];
}): number => {
	// Find the referenced unspent transaction output
	const txOut = findUnspentTxOut({
		txOutId: txIn.txOutId,
		txOutIndex: txIn.txOutIndex,
		unspentTxOuts,
	});

	// Return the amount of the referenced unspent transaction output
	return txOut ? txOut.amount : 0;
};

/**
 * Finds an unspent transaction output from a list of unspent transaction outputs.
 *
 * @param txOutId The transaction ID of the transaction output to find.
 * @param txOutIndex The index of the transaction output to find.
 * @param unspentTxOuts The list of unspent transaction outputs to search.
 *
 * @returns The unspent transaction output if found, or undefined otherwise.
 */
const findUnspentTxOut = ({
	txOutId,
	txOutIndex,
	unspentTxOuts,
}: {
	txOutId: string;
	txOutIndex: number;
	unspentTxOuts: UnspentTxOut[];
}): UnspentTxOut | undefined => {
	return unspentTxOuts.find((uTxO) => uTxO.txOutId === txOutId && uTxO.txOutIndex === txOutIndex);
};

/**
 * Validates a block of transactions.
 *
 * This function first validates the coinbase transaction by calling `validateCoinbaseTx`.
 * It then checks that there are no duplicate transaction inputs by calling `hasDuplicates`.
 * Finally, it validates each transaction other than the coinbase transaction by calling
 * `validateTransaction`.
 *
 * @param transactions The block of transactions to validate.
 * @param unspentTxOuts The list of unspent transaction outputs to reference.
 * @param blockIndex The index of the block containing the transactions.
 *
 * @returns {boolean} Whether the block of transactions is valid.
 */
const validateBlockTransactions = ({
	transactions,
	unspentTxOuts,
	blockIndex,
}: {
	transactions: Transaction[];
	unspentTxOuts: UnspentTxOut[];
	blockIndex: number;
}): boolean => {
	// Get the coinbase transaction
	const transaction = transactions[0];

	// Validate the coinbase transaction
	if (!validateCoinbaseTx({ transaction, blockIndex })) {
		console.log(`Invalid coinbase transaction: ${JSON.stringify(transaction)}`);
		return false;
	}

	// Transaction inputs for coinbase transaction
	const txIns = transactions.flatMap((transaction) => transaction.txIns);

	// Check for duplicate transaction inputs
	if (hasDuplicates({ txIns })) {
		console.log('Duplicate transaction inputs detected.');
		return false;
	}

	// Validate the rest of the transactions
	return transactions
		.slice(1)
		.every((transaction) => validateTransaction({ transaction, unspentTxOuts }));
};

/**
 * Validates a coinbase transaction.
 *
 * A coinbase transaction is considered to be valid if it has the following properties:
 * - It is the first transaction in the block.
 * - It has only one transaction input.
 * - The transaction input has the same index as the block index.
 * - It has only one transaction output.
 * - The transaction output has the correct amount of tokens.
 *
 * @param transaction The coinbase transaction to validate.
 * @param blockIndex The index of the block containing the transaction.
 *
 * @returns {boolean} Whether the coinbase transaction is valid.
 */
const validateCoinbaseTx = ({
	transaction,
	blockIndex,
}: {
	transaction: Transaction;
	blockIndex: number;
}): boolean => {
	// Check if the transaction is the first transaction in the block
	if (!transaction) {
		console.log('Missing coinbase transaction.');
		return false;
	}

	// Check if the transaction has the correct ID
	if (getTransactionId({ transaction }) !== transaction.id) {
		console.log(`Invalid coinbase transaction ID: ${transaction.id}`);
		return false;
	}

	// Check if the transaction has only one input and the index is correct
	if (transaction.txIns.length !== 1 || transaction.txIns[0].txOutIndex !== blockIndex) {
		console.log('Invalid coinbase transaction inputs.');
		return false;
	}

	// Check if the transaction has only one output and the amount is correct
	if (transaction.txOuts.length !== 1 || transaction.txOuts[0].amount !== COINBASE_AMOUNT) {
		console.log('Invalid coinbase transaction outputs.');
		return false;
	}

	return true;
};

/**
 * Checks if there are any duplicate transaction inputs in the given array.
 *
 * @param txIns The array of transaction inputs to check.
 *
 * @returns {boolean} Whether there are any duplicate transaction inputs.
 */
const hasDuplicates = ({ txIns }: { txIns: TxIn[] }): boolean => {
	// Create a set to store unique transaction IDs
	const seen = new Set<string>();

	return txIns.some((txIn) => {
		// Transaction ID
		const id = `${txIn.txOutId}${txIn.txOutIndex}`;

		// Check if the transaction ID is already in the set
		if (seen.has(id)) return true;

		// If false, add the transaction ID to the set
		seen.add(id);

		return false;
	});
};

/**
 * Updates the list of unspent transaction outputs (UTxOs) by adding new transaction outputs
 * from the given array of transactions and removing any transaction outputs that are
 * consumed by the transactions.
 *
 * @param transactions The array of transactions to process.
 * @param unspentTxOuts The list of unspent transaction outputs to update.
 *
 * @returns The updated list of unspent transaction outputs.
 */
const updateUnspentTxOuts = ({
	transactions,
	unspentTxOuts,
}: {
	transactions: Transaction[];
	unspentTxOuts: UnspentTxOut[];
}): UnspentTxOut[] => {
	// Get the list of UTxOs
	const newUnspentTxOuts = transactions.flatMap((transaction, index) =>
		transaction.txOuts.map(
			(txOut, idx) =>
				new UnspentTxOut({
					txOutId: transaction.id,
					txOutIndex: idx,
					address: txOut.address,
					amount: txOut.amount,
				})
		)
	);

	// Get the list of consumed TxOuts
	const consumedTxOuts = transactions.flatMap((transaction) =>
		transaction.txIns.map((txIn) => ({ txOutId: txIn.txOutId, txOutIndex: txIn.txOutIndex }))
	);

	// Updated the list of UTxOs
	return [
		...unspentTxOuts.filter(
			(uTxO) =>
				!consumedTxOuts.some(
					(txOut) =>
						txOut.txOutId === uTxO.txOutId && txOut.txOutIndex === uTxO.txOutIndex
				)
		),
		...newUnspentTxOuts,
	];
};

/**
 * Retrieves the public key associated with a given private key.
 *
 * @param privateKey The private key to derive the public key from.
 *
 * @returns The public key as a hexadecimal string.
 */
const getPublicKey = ({ privateKey }: { privateKey: string }): string => {
	return ec.keyFromPrivate(privateKey, 'hex').getPublic().encode('hex', false);
};

/**
 * Generates a coinbase transaction, which is a special transaction that is the first transaction
 * in a block and is used to reward the miner for mining the block.
 *
 * @param address The address of the miner who mined the block.
 * @param blockIndex The index of the block containing the transaction.
 *
 * @returns The generated coinbase transaction.
 */
const getCoinbaseTransaction = ({
	address,
	blockIndex,
}: {
	address: string;
	blockIndex: number;
}): Transaction => {
	// Create the coinbase transaction
	const transaction = new Transaction();

	// Add the coinbase transaction input
	const txIn: TxIn = new TxIn();
	txIn.signature = '';
	txIn.txOutId = '';
	txIn.txOutIndex = blockIndex;

	// Add the coinbase transaction input to the transaction
	transaction.txIns = [txIn];

	// Add the coinbase transaction output to the transaction
	transaction.txOuts = [new TxOut({ address, amount: COINBASE_AMOUNT })];

	// Set the transaction ID
	transaction.id = getTransactionId({ transaction });

	return transaction;
};

/**
 * Validates a given address.
 *
 * This function checks if the length of the public key is correct, if it contains only hex characters,
 * and if it starts with 04.
 *
 * @param address The address to validate
 *
 * @returns {boolean} Whether the address is valid
 */

const validateAddress = ({ address }: { address: string }): boolean => {
	// Check if the length of the public key is correct
	if (address.length !== 130) {
		console.log('invalid public key length');
		return false;
	}

	// Check if the public key contains only hex characters
	if (address.match('^[a-fA-F0-9]+$') === null) {
		console.log('public key must contain only hex characters');
		return false;
	}

	// Check if the public key starts with 04
	if (!address.startsWith('04')) {
		console.log('Public key must start with 04');
		return false;
	}

	return true;
};

/**
 * Validates the structure of a transaction.
 *
 * This function checks that the transaction has the required fields, and that the fields
 * have the correct types. Specifically, it checks that the transaction has a valid ID,
 * an array of transaction inputs, and an array of transaction outputs. It also checks
 * that each transaction input and each transaction output has a valid structure.
 *
 * @param {Object} transaction The transaction to validate.
 *
 * @returns {boolean} Whether the transaction has a valid structure.
 */
const validateTransactionStructure = ({ transaction }: { transaction: Transaction }): boolean => {
	// Check if the transaction id is a string
	if (typeof transaction.id !== 'string') {
		console.log('Transaction ID missing or invalid');
		return false;
	}

	// Check if the transaction inputs is an array
	if (!Array.isArray(transaction.txIns)) {
		console.log('Invalid txIns type in transaction');
		return false;
	}

	// Check if each transaction input has a valid structure
	if (!transaction.txIns.every((txIn) => validateTxInStructure({ txIn }))) {
		console.log('Invalid structure in one or more txIns');
		return false;
	}

	// Check if the transaction outputs is an array
	if (!Array.isArray(transaction.txOuts)) {
		console.log('Invalid txOuts type in transaction');
		return false;
	}

	// Check if each transaction output has a valid structure
	if (!transaction.txOuts.every((txOut) => validateTxOutStructure({ txOut }))) {
		console.log('Invalid structure in one or more txOuts');
		return false;
	}

	return true;
};

/**
 * Validates the structure of a transaction input.
 *
 * This function checks if the given transaction input (txIn) has a valid structure
 * by ensuring that it is not null or undefined and that its fields have the correct types.
 * Specifically, it validates that:
 * - The signature is of type string.
 * - The txOutId is of type string.
 * - The txOutIndex is of type number.
 *
 * @param txIn The transaction input to validate.
 *
 * @returns {boolean} Whether the structure of the transaction input is valid.
 */
const validateTxInStructure = ({ txIn }: { txIn: TxIn }): boolean => {
	// Check if txIn is null or undefined
	if (!txIn) {
		console.log('txIn is null or undefined');
		return false;
	}

	// Check if the signature is of type string
	if (typeof txIn.signature !== 'string') {
		console.log('Invalid signature type in txIn');
		return false;
	}

	// Check if the txOutId is of type string
	if (typeof txIn.txOutId !== 'string') {
		console.log('Invalid txOutId type in txIn');
		return false;
	}

	// Check if the txOutIndex is of type number
	if (typeof txIn.txOutIndex !== 'number') {
		console.log('Invalid txOutIndex type in txIn');
		return false;
	}

	return true;
};

/**
 * Validates the structure of a transaction output.
 *
 * This function ensures that the given transaction output (txOut) is not null or undefined
 * and that its fields have the correct types. Specifically, it validates that:
 * - The address is of type string and is a valid address.
 * - The amount is of type number.
 *
 * @param txOut The transaction output to validate.
 *
 * @returns {boolean} Whether the structure of the transaction output is valid.
 */
const validateTxOutStructure = ({ txOut }: { txOut: TxOut }): boolean => {
	// Check if txOut is not null or undefined
	if (!txOut) {
		console.log('txOut is null or undefined');
		return false;
	}

	// Check if address is of type string
	if (typeof txOut.address !== 'string') {
		console.log('Invalid address type in txOut');
		return false;
	}

	// Check if address is a valid address
	if (!validateAddress({ address: txOut.address })) {
		console.log('Invalid TxOut address');
		return false;
	}

	// Check if amount is of type number
	if (typeof txOut.amount !== 'number') {
		console.log('Invalid amount type in txOut');
		return false;
	}

	return true;
};

export {
	processTransactions,
	signTxIn,
	getTransactionId,
	UnspentTxOut,
	TxIn,
	TxOut,
	Transaction,
	getPublicKey,
	getCoinbaseTransaction,
	validateAddress,
	validateTransaction,
};
