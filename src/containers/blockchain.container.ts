import { Block } from '../block';
import { connectToPeer, getSockets } from '../p2p';
import express, { Request, Response } from 'express';
import {
	getBlockchain,
	initializeChain,
	generateBlock,
	generateRawBlock,
	generateBlockWithTransaction,
	accountBalance,
	getMyUnspentTransactionOutputs,
	getUnspentTxOuts,
	sendTransaction,
} from '../blockchain';
import { getTransactionPool } from '../transactionPool';
import { getPublicFromWallet } from '../wallet';

// Initialize router
const router = express.Router();

// Initialize blockchain
initializeChain();

router.get('/blocks', (req: Request, res: Response) => {
	res.status(200).json(getBlockchain());
});

router.get('/address', (req: Request, res: Response) => {
	const address: string = getPublicFromWallet();
	res.status(200).json({ address: address });
});

router.get('/unspent-transaction-outputs', (req: Request, res: Response) => {
	res.status(200).json(getUnspentTxOuts());
});

router.get('/my-unspent-transaction-outputs', (req: Request, res: Response) => {
	res.status(200).json(getMyUnspentTransactionOutputs());
});

router.post('/mine-raw', (req: Request, res: Response) => {
	const { data } = req.body;

	if (!data) res.status(400).json({ error: 'Data is required to mine a block' });

	const newBlock: Block = generateRawBlock({ transactions: data });

	if (!newBlock) res.status(500).json({ error: 'Failed to generate a new block' });

	res.status(201).json(newBlock);
});

router.post('/mine-transaction', (req: Request, res: Response) => {
	const { address, amount } = req.body;

	if (!address || !amount) res.status(400).json({ error: 'Address or amount are missing!' });

	try {
		const response = sendTransaction({ address, amount });

		if (!response) res.status(500).json({ error: 'Failed to generate a new block' });

		res.status(201).json(response);
	} catch (error: Error | any) {
		res.status(400).json({ message: error.message });
	}
});

router.get('/transaction-pool', (req: Request, res: Response) => {
	res.status(200).json(getTransactionPool());
});

router.post('/mine', (req: Request, res: Response) => {
	const newBlock: Block = generateBlock();

	if (!newBlock) res.status(500).json({ error: 'Failed to generate a new block' });

	res.status(201).json(newBlock);
});

router.get('/balance', (req: Request, res: Response) => {
	res.status(200).json({ balance: accountBalance() });
});

router.get('/peers', (req: Request, res: Response) => {
	const peers = getSockets().map((socket: any) => {
		const address = socket._socket.remoteAddress;
		const port = socket._socket.remotePort;
		return `${address}:${port}`;
	});

	res.status(200).json(peers);
});

router.post('/add-peer', (req: Request, res: Response) => {
	const { peer } = req.body;

	if (!peer) res.status(400).json({ error: 'Peer address is required' });

	try {
		connectToPeer(peer);
		res.status(200).json({ message: `Peer ${peer} added successfully` });
	} catch (error) {
		res.status(500).json({
			error: `Could not connect to peer ${peer}. Ensure it is running and accessible.`,
		});
	}
});

router.post('/stop', (req: Request, res: Response) => {
	res.send({ message: 'Stopping server...' });
	process.exit();
});

export default router;
