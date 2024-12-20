import { ec } from 'elliptic';
import { existsSync, readFileSync, unlinkSync, writeFileSync } from 'fs';
import {
	getPublicKey,
	getTransactionId,
	signTxIn,
	Transaction,
	TxIn,
	TxOut,
	UnspentTxOut,
} from './transaction';
import { table } from 'console';

const EC = new ec('secp256k1');
const privateKeyLocation = process.env.PRIVATE_KEY || 'node/wallet/private_key';

const getPrivateFromWallet = (): string => {
	const buffer = readFileSync(privateKeyLocation, 'utf8');
	return buffer.toString();
};

const getPublicFromWallet = (): string => {
	const privateKey = getPrivateFromWallet();
	const key = EC.keyFromPrivate(privateKey, 'hex');
	return key.getPublic().encode('hex', false);
};

const generatePrivateKey = (): string => {
	const keyPair = EC.genKeyPair();
	const privateKey = keyPair.getPrivate();
	return privateKey.toString(16);
};

const initWallet = () => {
	if (!existsSync(privateKeyLocation)) console.log('No wallet found');
	const newPrivateKey = generatePrivateKey();
	writeFileSync(privateKeyLocation, newPrivateKey);
	console.log('New wallet with private key created');
};

const deleteWallet = () => {
	if (existsSync(privateKeyLocation)) unlinkSync(privateKeyLocation);
};

const getBalance = ({
	address,
	unspentTxOuts,
}: {
	address: string;
	unspentTxOuts: UnspentTxOut[];
}): number => {
	return findUnspentTxOuts({ address, unspentTxOuts })
		.filter((uTxO) => uTxO.address === address)
		.reduce((sum, uTxO) => sum + uTxO.amount, 0);
};

const findUnspentTxOuts = ({
	address,
	unspentTxOuts,
}: {
	address: string;
	unspentTxOuts: UnspentTxOut[];
}): UnspentTxOut[] => {
	return unspentTxOuts.filter((uTxO) => uTxO.address === address);
};

const findTxOutsForAmount = ({
	amount,
	myUnspentTxOuts,
}: {
	amount: number;
	myUnspentTxOuts: UnspentTxOut[];
}) => {
	let currentAmount = 0;
	const includedUnspentTxOuts = [];

	for (const myUnspentTxOut of myUnspentTxOuts) {
		includedUnspentTxOuts.push(myUnspentTxOut);
		currentAmount += myUnspentTxOut.amount;

		if (currentAmount >= amount) {
			const leftOverAmount = currentAmount - amount;
			return { includedUnspentTxOuts, leftOverAmount };
		}
	}

	throw new Error('Not enough coins to send transaction');
};

const createTxOuts = ({
	receiverAddress,
	myAddress,
	amount,
	leftOverAmount,
}: {
	receiverAddress: string;
	myAddress: string;
	amount: number;
	leftOverAmount: number;
}) => {
	const txOut1 = new TxOut({ address: receiverAddress, amount });
	return leftOverAmount === 0
		? [txOut1]
		: [txOut1, new TxOut({ address: myAddress, amount: leftOverAmount })];
};

const createTransaction = ({
	receiverAddress,
	amount,
	privateKey,
	transactionPool,
	unspentTxOuts,
}: {
	receiverAddress: string;
	amount: number;
	privateKey: string;
	transactionPool: Transaction[];
	unspentTxOuts: UnspentTxOut[];
}): Transaction => {
	const myAddress = getPublicKey({ privateKey });
	const myUnspentTxOuts = unspentTxOuts.filter((uTxO) => uTxO.address === myAddress);

	const myUnspentTxOutsInPool = filterTxPoolTxs({
		unspentTxOuts: myUnspentTxOuts,
		transactionPool,
	});

	const { includedUnspentTxOuts, leftOverAmount } = findTxOutsForAmount({
		amount,
		myUnspentTxOuts: myUnspentTxOutsInPool,
	});

	const toUnsignedTxIn = (unspentTxOut: UnspentTxOut) => {
		const txIn = new TxIn();
		txIn.txOutId = unspentTxOut.txOutId;
		txIn.txOutIndex = unspentTxOut.txOutIndex;
		return txIn;
	};

	const unsignedTxIns = includedUnspentTxOuts.map(toUnsignedTxIn);

	const transaction = new Transaction();
	transaction.txIns = unsignedTxIns;
	transaction.txOuts = createTxOuts({ receiverAddress, myAddress, amount, leftOverAmount });
	transaction.id = getTransactionId({ transaction });

	transaction.txIns = transaction.txIns.map((txIn, index) => {
		txIn.signature = signTxIn({
			transaction,
			txInIndex: index,
			privateKey,
			unspentTxOuts,
		});
		return txIn;
	});

	return transaction;
};

const filterTxPoolTxs = ({
	unspentTxOuts,
	transactionPool,
}: {
	unspentTxOuts: UnspentTxOut[];
	transactionPool: Transaction[];
}): UnspentTxOut[] => {
	// Flatten all txIns from the transaction pool
	const txIns: TxIn[] = transactionPool.flatMap((transaction) => transaction.txIns);

	// Find all removable unspentTxOuts
	const removable: UnspentTxOut[] = unspentTxOuts.filter((unspentTxOut) =>
		txIns.some(
			(txIn) =>
				txIn.txOutIndex === unspentTxOut.txOutIndex && txIn.txOutId === unspentTxOut.txOutId
		)
	);

	// Return unspentTxOuts excluding those in removable
	return unspentTxOuts.filter((uTxO) => !removable.includes(uTxO));
};

export {
	createTransaction,
	getPublicFromWallet,
	getPrivateFromWallet,
	getBalance,
	generatePrivateKey,
	initWallet,
	deleteWallet,
	findUnspentTxOuts,
};
