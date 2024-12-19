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
} from '../blockchain';

// Initialize router
const router = express.Router();

// Initialize blockchain
initializeChain();

router.get('/blocks', (req: Request, res: Response) => {
	res.status(200).json(getBlockchain());
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

	try {
		const newBlock: Block = generateBlockWithTransaction({ address, amount });

		if (!newBlock) res.status(500).json({ error: 'Failed to generate a new block' });

		res.status(201).json(newBlock);
	} catch (error: Error | any) {
		res.status(400).json({ message: error.message });
	}
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

export default router;
