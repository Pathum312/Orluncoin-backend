import { Transaction, TxIn, UnspentTxOut, validateTransaction } from './transaction';

let transactionPool: Transaction[] = [];

const getTransactionPool = () => {
	// Deep clone the transactionPool using JSON serialization
	return JSON.parse(JSON.stringify(transactionPool));
};

const addToTransactionPool = (transaction: Transaction, unspentTxOuts: UnspentTxOut[]) => {
	if (!validateTransaction({ transaction, unspentTxOuts })) {
		throw new Error('Trying to add invalid tx to pool');
	}

	if (!isValidTxForPool(transaction, transactionPool)) {
		throw new Error('Trying to add invalid tx to pool');
	}

	console.log('Adding to txPool:', JSON.stringify(transaction));
	transactionPool.push(transaction);
};

const hasTxIn = (txIn: TxIn, unspentTxOuts: UnspentTxOut[]): boolean => {
	return unspentTxOuts.some(
		(uTxO) => uTxO.txOutId === txIn.txOutId && uTxO.txOutIndex === txIn.txOutIndex
	);
};

const updateTransactionPool = (unspentTxOuts: UnspentTxOut[]) => {
	const invalidTxs = transactionPool.filter((tx) =>
		tx.txIns.some((txIn) => !hasTxIn(txIn, unspentTxOuts))
	);

	if (invalidTxs.length > 0) {
		console.log('Removing the following transactions from txPool:', JSON.stringify(invalidTxs));
		transactionPool = transactionPool.filter((tx) => !invalidTxs.includes(tx));
	}
};

const getTxPoolIns = (aTransactionPool: Transaction[]): TxIn[] => {
	return aTransactionPool.flatMap((tx) => tx.txIns);
};

const isValidTxForPool = (tx: Transaction, aTransactionPool: Transaction[]): boolean => {
	const txPoolIns: TxIn[] = getTxPoolIns(aTransactionPool);

	return tx.txIns.every(
		(txIn) =>
			!txPoolIns.some(
				(txPoolIn) =>
					txIn.txOutIndex === txPoolIn.txOutIndex && txIn.txOutId === txPoolIn.txOutId
			)
	);
};

export { addToTransactionPool, getTransactionPool, updateTransactionPool };
