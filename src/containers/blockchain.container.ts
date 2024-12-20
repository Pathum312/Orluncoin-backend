import { Block } from '../block';
import { connectToPeer, getSockets } from '../p2p';
import express, { Request, Response } from 'express';
import {
	getBlockchain,
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
/**
 * @swagger
 * tags:
 *   - name: Blockchain
 *     description: API endpoints for the blockcahin
 */
const router = express.Router();

/**
 * @swagger
 * /blockchain/blocks:
 *   get:
 *     summary: Get blockchain
 *     tags: [Blockchain]
 *     parameters: []
 *     responses:
 *       '200':
 *         description: Success response.
 */
router.get('/blocks', (req: Request, res: Response) => {
	res.status(200).json(getBlockchain());
});

/**
 * @swagger
 * /blockchain/blocks/{hash}:
 *   get:
 *     summary: Get block by hash
 *     tags: [Blockchain]
 *     parameters: [
 *      {
 *          name: 'hash',
 *          in: 'path',
 *          description: 'Hash of the block'
 *      },
 *     ]
 *     responses:
 *       '200':
 *         description: Success response.
 */
router.get('/blocks/:hash', (req: Request, res: Response) => {
	const { hash } = req.params;

	const block = getBlockchain().find((block) => block.hash === hash);

	res.status(200).json(block);
});

/**
 * @swagger
 * /blockchain/transactions/{id}:
 *   get:
 *     summary: Get transaction by ID
 *     tags: [Blockchain]
 *     parameters: [
 *      {
 *          name: 'id',
 *          in: 'path',
 *          description: 'Transaction ID'
 *      },
 *     ]
 *     responses:
 *       '200':
 *         description: Success response.
 */
router.get('/transaction/:id', (req: Request, res: Response) => {
	const { id } = req.params;

	const blockchain = getBlockchain();

	const transaction = blockchain
		.flatMap((block) => block.transactions)
		.find((transaction) => transaction.id === id);

	res.status(200).json(transaction);
});

/**
 * @swagger
 * /blockchain/address:
 *   get:
 *     summary: Get public address of the wallet
 *     tags: [Blockchain]
 *     parameters: []
 *     responses:
 *       '200':
 *         description: Success response.
 */
router.get('/address', (req: Request, res: Response) => {
	const address: string = getPublicFromWallet();
	res.status(200).json({ address: address });
});

/**
 * @swagger
 * /blockchain/address/{address}:
 *   get:
 *     summary: Get unspent transaction outputs by address
 *     tags: [Blockchain]
 *     parameters: [
 *      {
 *          name: 'address',
 *          in: 'path',
 *          description: 'Public address of the wallet'
 *      },
 *     ]
 *     responses:
 *       '200':
 *         description: Success response.
 */
router.get('/address/:address', (req: Request, res: Response) => {
	const { address } = req.params;

	const unspentTxOuts = getUnspentTxOuts().filter((uTxO) => uTxO.address === address);

	res.status(200).json({ unspentTxOuts });
});

/**
 * @swagger
 * /blockchain/unspent-transaction-outputs:
 *   get:
 *     summary: Get unspent transaction outputs
 *     tags: [Blockchain]
 *     parameters: []
 *     responses:
 *       '200':
 *         description: Success response.
 */
router.get('/unspent-transaction-outputs', (req: Request, res: Response) => {
	res.status(200).json(getUnspentTxOuts());
});

/**
 * @swagger
 * /blockchain/my-unspent-transaction-outputs:
 *   get:
 *     summary: Get owner's unspent transaction outputs
 *     tags: [Blockchain]
 *     parameters: []
 *     responses:
 *       '200':
 *         description: Success response.
 */
router.get('/my-unspent-transaction-outputs', (req: Request, res: Response) => {
	res.status(200).json(getMyUnspentTransactionOutputs());
});

/**
 * @swagger
 * /blockchain/balance:
 *   get:
 *     summary: Get owner's coin balance
 *     tags: [Blockchain]
 *     parameters: []
 *     responses:
 *       '200':
 *         description: Success response.
 */
router.get('/balance', (req: Request, res: Response) => {
	res.status(200).json({ balance: accountBalance() });
});

/**
 * @swagger
 * /blockchain/peers:
 *   get:
 *     summary: Get peers of the network
 *     tags: [Blockchain]
 *     parameters: []
 *     responses:
 *       '200':
 *         description: Success response.
 */
router.get('/peers', (req: Request, res: Response) => {
	const peers = getSockets().map((socket: any) => {
		const address = socket._socket.remoteAddress;
		const port = socket._socket.remotePort;
		return `${address}:${port}`;
	});

	res.status(200).json(peers);
});

/**
 * @swagger
 * /blockchain/transaction-pool:
 *   get:
 *     summary: Get transaction pool of the owner
 *     tags: [Blockchain]
 *     parameters: []
 *     responses:
 *       '200':
 *         description: Success response.
 */
router.get('/transaction-pool', (req: Request, res: Response) => {
	res.status(200).json(getTransactionPool());
});

/**
 * @swagger
 * /blockchain/mine:
 *   post:
 *     summary: Mine a new block
 *     tags: [Blockchain]
 *     responses:
 *       '201':
 *         description: Created.
 *       '500':
 *         description: Internal server error.
 */
router.post('/mine', (req: Request, res: Response) => {
	const newBlock: Block = generateBlock();

	if (!newBlock) res.status(500).json({ error: 'Failed to generate a new block' });

	res.status(201).json(newBlock);
});

/**
 * @swagger
 * /blockchain/mine-raw:
 *   post:
 *     summary: Create a raw block
 *     tags: [Blockchain]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               data:
 *                 type: Transaction
 *             required:
 *               - data
 *     responses:
 *       '200':
 *         description: Success response.
 *       '400':
 *         description: Bad Request..
 *       '500':
 *         description: Internal server error.
 */
router.post('/mine-raw', (req: Request, res: Response) => {
	const { data } = req.body;

	if (!data) res.status(400).json({ error: 'Data is required to mine a block' });

	const newBlock: Block = generateRawBlock({ transactions: data });

	if (!newBlock) res.status(500).json({ error: 'Failed to generate a new block' });

	res.status(201).json(newBlock);
});

/**
 * @swagger
 * /blockchain/mine-transaction:
 *   post:
 *     summary: Create a block with a transaction
 *     tags: [Blockchain]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               address:
 *                 type: string
 *               amount:
 *                 type: integer
 *             required:
 *               - address
 *               - amount
 *     responses:
 *       '201':
 *         description: Created.
 *       '400':
 *         description: Bad Request..
 *       '500':
 *         description: Internal server error.
 */
router.post('/mine-transaction', (req: Request, res: Response) => {
	const { address, amount } = req.body;

	if (!address || !amount) res.status(400).json({ error: 'Address or amount are missing!' });

	try {
		const response = generateBlockWithTransaction({ address, amount });

		if (!response) res.status(500).json({ error: 'Failed to generate a new block' });

		res.status(201).json(response);
	} catch (error: Error | any) {
		res.status(400).json({ message: error.message });
	}
});

/**
 * @swagger
 * /blockchain/send-transaction:
 *   post:
 *     summary: Send a transaction
 *     tags: [Blockchain]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               address:
 *                 type: string
 *               amount:
 *                 type: integer
 *             required:
 *               - address
 *               - amount
 *     responses:
 *       '201':
 *         description: Created.
 *       '400':
 *         description: Bad Request..
 *       '500':
 *         description: Internal server error.
 */
router.post('/send-transaction', (req: Request, res: Response) => {
	const { address, amount } = req.body;

	if (!address || !amount) res.status(400).json({ error: 'Address or amount are missing!' });

	try {
		const response = sendTransaction({ address, amount });

		if (!response) res.status(500).json({ error: 'Failed send transaction.' });

		res.status(201).json(response);
	} catch (error: Error | any) {
		res.status(400).json({ message: error.message });
	}
});

/**
 * @swagger
 * /blockchain/add-peer:
 *   post:
 *     summary: Add a peer to the network
 *     tags: [Blockchain]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               peer:
 *                 type: string
 *             required:
 *               - peer
 *     responses:
 *       '200':
 *         description: Success response.
 *       '400':
 *         description: Bad Request.
 *       '500':
 *         description: Internal server error.
 */
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

/**
 * @swagger
 * /blockchain/stop:
 *   post:
 *     summary: Stop the server
 *     tags: [Blockchain]
 *     responses:
 *       '200':
 *         description: Success response.
 */
router.post('/stop', (req: Request, res: Response) => {
	res.send({ message: 'Stopping server...' });
	process.exit();
});

export default router;
