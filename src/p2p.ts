import WebSocket, { WebSocketServer } from 'ws';
import { Block } from './block';
import {
	getLastBlock,
	getBlockchain,
	addBlock,
	replaceChain,
	handleReceivedTransaction,
	validateBlockStructure,
} from './blockchain';
import { Transaction } from './transaction';
import { getTransactionPool } from './transactionPool';

const sockets: Set<WebSocket> = new Set();

enum MessageType {
	QUERY_LATEST = 0,
	QUERY_ALL = 1,
	RESPONSE_BLOCKCHAIN = 2,
	QUERY_TRANSACTION_POOL = 3,
	RESPONSE_TRANSACTION_POOL = 4,
}

interface Message {
	type: MessageType;
	data: any;
}

/**
 * Initializes the P2P server.
 *
 * @param p2pPort The port number to listen on.
 * @param blockchain The blockchain instance to use.
 */
const initP2PServer = (p2pPort: number) => {
	const server = new WebSocketServer({ port: p2pPort });

	server.on('connection', (socket) => {
		console.log(`\nNew peer connected`);
		initConnection(socket);
	});

	server.on('listening', () => {
		console.log(`\nWebSocket P2P server running on port ${p2pPort}`);
	});

	server.on('error', (error) => {
		console.error(`\nWebSocket server error: ${error.message}`);
	});
};

/**
 * Retrieves the current list of active WebSocket connections.
 *
 * @returns An array of WebSocket objects representing active connections.
 */
const getSockets = (): WebSocket[] => {
	return Array.from(sockets);
};

/**
 * Initializes a new connection.
 *
 * @param socket The WebSocket connection.
 * @param blockchain The blockchain instance.
 */
const initConnection = (socket: WebSocket): void => {
	sockets.add(socket);
	console.log(`\nConnected peers: ${sockets.size}`);

	socket.on('message', (data) => handleMessage(socket, data.toString()));
	socket.on('close', () => closeConnection(socket));
	socket.on('error', () => closeConnection(socket));

	sendMessage(socket, queryChainLengthMsg());

	setTimeout(() => broadcastMessage(queryTransactionPoolMsg()), 500);
};

/**
 * Closes a connection to a peer.
 *
 * @param socket The WebSocket connection to close.
 */
const closeConnection = (socket: WebSocket) => {
	console.log('\nPeer disconnected');
	sockets.delete(socket);
	console.log(`\nRemaining peers: ${sockets.size}`);
};

/**
 * Handles incoming messages from peers.
 *
 * @param socket The WebSocket connection.
 * @param rawData The raw message data.
 * @param blockchain The blockchain instance.
 */
const handleMessage = (socket: WebSocket, rawData: string) => {
	try {
		const message: Message = JSON.parse(rawData);
		console.log(`\nReceived message: ${JSON.stringify(message)}`);

		switch (message.type) {
			case MessageType.QUERY_LATEST:
				sendMessage(socket, responseLatestMsg());
				break;
			case MessageType.QUERY_ALL:
				sendMessage(socket, responseChainMsg());
				break;
			case MessageType.RESPONSE_BLOCKCHAIN:
				handleBlockchainResponse(message.data);
				break;
			case MessageType.QUERY_TRANSACTION_POOL:
				sendMessage(socket, responseTransactionPoolMsg());
				break;
			case MessageType.RESPONSE_TRANSACTION_POOL:
				const receivedTransactions: Transaction[] = JSON.parse(message.data);

				try {
					// Process all transactions
					for (const transaction of receivedTransactions) {
						handleReceivedTransaction({ transaction });
					}

					// Broadcast the transaction pool after processing all transactions
					broadcastTransactionPool();
				} catch (error: Error | any) {
					console.error(`\nError handling transaction: ${error.message}`);
				}
			default:
				console.error(`\nUnknown message type: ${message.type}`);
		}
	} catch (error) {
		console.error(`\nInvalid message received: ${rawData}`);
	}
};

/**
 * Sends a message to a peer.
 *
 * @param socket The WebSocket connection to send the message on.
 * @param message The message to send.
 */
const sendMessage = (socket: WebSocket, message: Message) => {
	try {
		socket.send(JSON.stringify(message));
	} catch (error: Error | any) {
		console.error(`\nError sending message: ${error.message}`);
	}
};

/**
 * Broadcasts a message to all connected peers.
 *
 * @param message The message to broadcast.
 */
const broadcastMessage = (message: Message) => {
	sockets.forEach((socket) => sendMessage(socket, message));
};

/**
 * Creates a message to query the latest block from a peer.
 *
 * @returns A Message object with the type set to QUERY_LATEST and data set to null.
 */
const queryChainLengthMsg = (): Message => ({
	type: MessageType.QUERY_LATEST,
	data: null,
});

const queryAllMsg = (): Message => ({
	type: MessageType.QUERY_ALL,
	data: null,
});

const responseChainMsg = (): Message => ({
	type: MessageType.RESPONSE_BLOCKCHAIN,
	data: JSON.stringify(getBlockchain()),
});

const responseLatestMsg = (): Message => ({
	type: MessageType.RESPONSE_BLOCKCHAIN,
	data: JSON.stringify([getLastBlock()]),
});

/**
 * Handles blockchain data received from a peer.
 *
 * @param data The received blockchain data.
 * @param blockchain The blockchain instance.
 */
const handleBlockchainResponse = (data: string) => {
	const receivedBlocks: Block[] | null = parseJSON<Block[]>(data);
	if (!receivedBlocks) {
		console.error(`\nInvalid blockchain data: ${data}`);
		return;
	}

	const latestBlockReceived = receivedBlocks[receivedBlocks.length - 1];

	if (!validateBlockStructure({ block: latestBlockReceived })) {
		console.error(`\nInvalid block structure: ${JSON.stringify(latestBlockReceived)}`);
		return;
	}

	const latestBlockHeld = getLastBlock();

	if (latestBlockReceived.index > latestBlockHeld.index) {
		console.log(
			`\nBlockchain potentially outdated. Local: ${latestBlockHeld.index}, Peer: ${latestBlockReceived.index}`
		);

		if (latestBlockHeld.hash === latestBlockReceived.previousHash) {
			if (addBlock({ newBlock: latestBlockReceived })) {
				broadcastMessage(responseLatestMsg());
			}
		} else if (receivedBlocks.length === 1) {
			console.log('\nQuerying full chain from peer');
			broadcastMessage(queryAllMsg());
		} else {
			console.log('\nReplacing current chain with received chain');
			replaceChain(receivedBlocks);
		}
	} else {
		console.log('\nReceived chain is not longer. No action taken.');
	}
};

/**
 * Establishes a connection to a peer using a WebSocket.
 *
 * @param peerUrl The URL of the peer to connect to.
 * @param blockchain The blockchain instance to use for initializing the connection.
 */
const connectToPeer = (peerUrl: string) => {
	try {
		const socket = new WebSocket(peerUrl);

		socket.on('open', () => {
			console.log(`\nConnected to peer: ${peerUrl}`);
			initConnection(socket);
		});

		socket.on('error', (error) => {
			console.error(`\nConnection error with peer ${peerUrl}: ${error.message}`);
		});
	} catch (error: Error | any) {
		console.error(`\nFailed to connect to peer ${peerUrl}: ${error.message}`);
	}
};

/**
 * Parses a JSON string into an object of type T.
 *
 * If the JSON is invalid, this function logs an error and returns null.
 *
 * @param data The JSON string to parse.
 *
 * @returns The parsed object, or null if an error occurred.
 *
 * @template T The type of the parsed object.
 */
const parseJSON = <T>(data: string): T | null => {
	try {
		return JSON.parse(data);
	} catch {
		console.error(`\nFailed to parse JSON: ${data}`);
		return null;
	}
};

/**
 * Creates a message to query the transaction pool from a peer.
 *
 * @returns A Message object with the type set to QUERY_TRANSACTION_POOL and data set to null.
 */
const queryTransactionPoolMsg = (): Message => ({
	type: MessageType.QUERY_TRANSACTION_POOL,
	data: null,
});

/**
 * Creates a message to respond to a transaction pool query from a peer.
 *
 * This message includes the current transaction pool.
 *
 * @returns A Message object with the type set to RESPONSE_TRANSACTION_POOL and data set to the JSON string representation of the transaction pool.
 */
const responseTransactionPoolMsg = (): Message => ({
	type: MessageType.RESPONSE_TRANSACTION_POOL,
	data: JSON.stringify(getTransactionPool()),
});

/**
 * Broadcasts the current transaction pool to all connected peers.
 */
const broadcastTransactionPool = () => {
	broadcastMessage(responseTransactionPoolMsg());
};

export {
	initP2PServer,
	getSockets,
	connectToPeer,
	broadcastMessage,
	responseLatestMsg,
	broadcastTransactionPool,
};
